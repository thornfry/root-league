-- D1: access core. The whitelist gate, identity, people, the audit log and the
-- pattern every later table copies (build.md D1; decisions 25, 41, 42, 43, 45, 48).
--
-- How access works
--   * Clients (the anon and authenticated API roles) never write a table. Every
--     write is a security definer function in `public` that checks the caller
--     itself (decision 42). Tables are read under row-level policies.
--   * Who the caller is comes from `app.discord_id()`, who may read comes from
--     `app.is_whitelisted()`, and who may administer comes from `app.is_admin()`.
--     All three look at the whitelist on every call, so removing an entry cuts
--     off an open session on its next request (decision 25).
--   * Helpers live in the `app` schema, which the API does not expose.
--
-- The pattern for a new table (copy it, do not invent a variant)
--     create table public.thing (...);
--     select app.lock_down('public.thing');            -- or pass a read check
--     create trigger thing_audit after insert or update or delete on public.thing
--       for each row execute function app.audit_row('key_column', ...);
--   `app.lock_down` turns row-level security on, removes every client privilege,
--   grants SELECT to `authenticated` and adds one read policy, which by default
--   is `app.is_whitelisted()`. A table with a narrower read rule passes it as the
--   second argument. No insert, update or delete policy is ever created.
--
-- The pattern for a new function
--     create function public.thing(...) returns ... language plpgsql
--       security definer set search_path = '' as $$ ... $$;
--     revoke all on function public.thing(...) from public, anon;
--     grant execute on function public.thing(...) to authenticated;
--   The body starts with `perform app.require_admin();` or its own caller check.
--   Always schema-qualify names inside the body, because the search path is empty.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- Tables and sequences created from here on carry no client privilege until
-- `app.lock_down` or an explicit grant gives one. Functions are covered by the
-- explicit revoke in the pattern above and by a catalog test.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Tables ----------------------------------------------------------------------

-- League-wide people. Created or linked at first sign-in by ensure_person().
create table public.people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (btrim(display_name) <> ''),
  discord_id text unique check (discord_id ~ '^[0-9]{15,20}$'),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  seed_key text unique
);

-- The gate. is_admin is the Admin role, so an admin can be named before they
-- have ever signed in (decision 43). added_by is null for rows the seed writes.
create table public.whitelist (
  discord_id text primary key check (discord_id ~ '^[0-9]{15,20}$'),
  label text check (label is null or btrim(label) <> ''),
  is_admin boolean not null default false,
  added_by uuid references public.people (id) on delete set null,
  added_at timestamptz not null default now()
);

-- Key and value settings. Holds dev_signin = on in the local seed only.
create table public.app_config (
  key text primary key,
  value text not null
);

-- Append only. actor_person_id has no foreign key, so deleting a person never
-- touches a log row.
create table public.edit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_person_id uuid,
  table_name text not null,
  row_key text,
  action text not null check (action in ('insert', 'update', 'delete')),
  old jsonb,
  new jsonb
);

-- Identity helpers (app schema) ----------------------------------------------

-- The caller's Discord user ID. The real source is the Discord identity that
-- Supabase Auth stores in auth.identities (provider_id). The stand-in source is
-- the email `<id>@dev.invalid`, honoured only while app_config holds
-- dev_signin = on, a row only the local seed inserts (decision 41).
create function app.discord_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select i.provider_id
       from auth.identities i
      where i.user_id = auth.uid()
        and i.provider = 'discord'
        and i.provider_id ~ '^[0-9]+$'
      limit 1),
    (select substring(u.email from '^([0-9]+)@dev\.invalid$')
       from auth.users u
      where u.id = auth.uid()
        and exists (select 1 from public.app_config c
                     where c.key = 'dev_signin' and c.value = 'on'))
  )
$$;

create function app.is_whitelisted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.whitelist w where w.discord_id = app.discord_id())
$$;

create function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.whitelist w
                  where w.discord_id = app.discord_id() and w.is_admin)
$$;

-- The caller's person row. Null unless the caller is whitelisted, so a person
-- row left behind after removal from the whitelist grants nothing.
create function app.person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.people p
   where p.auth_user_id = auth.uid()
     and app.is_whitelisted()
$$;

create function app.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Only an admin can do this.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.discord_id(), app.is_whitelisted(), app.is_admin(),
  app.person_id(), app.require_admin() from public;
-- Policies and triggers call these as the caller, so authenticated needs them.
-- Each one reports only the caller's own state.
grant execute on function app.discord_id(), app.is_whitelisted(), app.is_admin(),
  app.person_id() to authenticated;

-- The audit trigger (decision 45) ---------------------------------------------

-- Writes the old and new row and the acting person to edit_log. The trigger
-- arguments name the columns that make up the row key, for example
-- app.audit_row('season_id', 'person_id'). Attach it AFTER INSERT OR UPDATE OR
-- DELETE FOR EACH ROW to every league table.
create function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  key_text text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_row := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_row := to_jsonb(new);
  end if;

  select string_agg(coalesce(new_row, old_row) ->> k.col, ',' order by k.ord)
    into key_text
    from unnest(tg_argv) with ordinality as k(col, ord);

  insert into public.edit_log (actor_person_id, table_name, row_key, action, old, new)
  values (app.person_id(), tg_table_name, key_text, lower(tg_op), old_row, new_row);

  return null;
end;
$$;
revoke all on function app.audit_row() from public;

-- Nobody changes or removes a log row. Revoked privileges stop the API roles,
-- and these triggers stop everyone else, the table owner included.
create function app.edit_log_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception 'edit_log is append only.' using errcode = '42501';
end;
$$;
revoke all on function app.edit_log_guard() from public;

create trigger edit_log_no_change
  before update or delete on public.edit_log
  for each row execute function app.edit_log_guard();
create trigger edit_log_no_truncate
  before truncate on public.edit_log
  for each statement execute function app.edit_log_guard();

create trigger people_audit
  after insert or update or delete on public.people
  for each row execute function app.audit_row('id');
create trigger whitelist_audit
  after insert or update or delete on public.whitelist
  for each row execute function app.audit_row('discord_id');

-- The table pattern -----------------------------------------------------------

-- Row-level security on, every client privilege removed, then SELECT for
-- authenticated behind one read policy. read_check is the policy's SQL
-- expression; null means no client can read the table at all.
create function app.lock_down(tbl regclass, read_check text default 'app.is_whitelisted()')
returns void
language plpgsql
set search_path = ''
as $$
declare
  policy_name text := (select c.relname from pg_catalog.pg_class c where c.oid = tbl) || '_read';
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('revoke all on %s from public, anon, authenticated', tbl);
  execute format('drop policy if exists %I on %s', policy_name, tbl);
  if read_check is not null then
    execute format('grant select on %s to authenticated', tbl);
    execute format('create policy %I on %s for select to authenticated using (%s)',
                   policy_name, tbl, read_check);
  end if;
end;
$$;
revoke all on function app.lock_down(regclass, text) from public;

select app.lock_down('public.people');                          -- any whitelisted viewer
select app.lock_down('public.whitelist', 'app.is_admin()');     -- admin only
select app.lock_down('public.edit_log', 'app.is_admin()');      -- admin only
select app.lock_down('public.app_config', null);                -- no client at all

-- The log is append only for every role, including the service role.
revoke update, delete, truncate on public.edit_log from service_role;

-- Functions (public schema, callable through the API) -------------------------

-- Who the caller is and what they hold. Safe for anyone to call: a signed-out
-- caller gets signed_in false and nothing else. Later commits add the prospect
-- and league_player roles to `roles` (decision 43).
create function public.whoami()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  did text;
  meta jsonb;
  wl public.whitelist;
  p public.people;
  roles jsonb := '[]'::jsonb;
begin
  if uid is null then
    return jsonb_build_object('signed_in', false, 'whitelisted', false,
                              'is_admin', false, 'roles', roles);
  end if;

  did := app.discord_id();
  select u.raw_user_meta_data into meta from auth.users u where u.id = uid;
  select * into wl from public.whitelist w where w.discord_id = did;

  if found then
    roles := '["viewer"]'::jsonb;
    if wl.is_admin then
      roles := roles || '["admin"]'::jsonb;
    end if;
    select * into p from public.people x where x.auth_user_id = uid;
  end if;

  return jsonb_build_object(
    'signed_in', true,
    'discord_id', did,
    'discord_name', coalesce(meta #>> '{custom_claims,global_name}',
                             meta ->> 'full_name', meta ->> 'name', did),
    'whitelisted', wl.discord_id is not null,
    'is_admin', coalesce(wl.is_admin, false),
    'person_id', p.id,
    'display_name', p.display_name,
    'roles', roles
  );
end;
$$;
revoke all on function public.whoami() from public;
grant execute on function public.whoami() to anon, authenticated;

-- Links or creates the caller's person row, for whitelisted callers only.
-- Order (decision 48): the person who already has this sign-in, then the person
-- who holds this Discord ID, then the one unlinked, ID-less person whose name
-- equals the whitelist label (a seeded name or one the admin added by name),
-- else a new person. Two name matches link nothing; the admin uses Fix it.
-- Calling it again changes nothing.
create function public.ensure_person()
returns public.people
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  did text;
  meta jsonb;
  wl public.whitelist;
  p public.people;
  matches uuid[];
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  did := app.discord_id();
  if did is null or not app.is_whitelisted() then
    raise exception 'This Discord account is not on the whitelist.' using errcode = '42501';
  end if;

  -- Two tabs calling this at once must not both create a person.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select * into p from public.people x where x.auth_user_id = uid;
  if found then
    if p.discord_id is null
       and not exists (select 1 from public.people y where y.discord_id = did) then
      update public.people set discord_id = did where id = p.id returning * into p;
    end if;
    return p;
  end if;

  select * into p from public.people x where x.discord_id = did;
  if found then
    if p.auth_user_id is not null then
      raise exception 'This Discord ID is already linked to another sign-in. Ask the admin to link it on Fix it.';
    end if;
    update public.people set auth_user_id = uid where id = p.id returning * into p;
    return p;
  end if;

  select * into wl from public.whitelist w where w.discord_id = did;
  if wl.label is not null then
    select array_agg(x.id) into matches
      from public.people x
     where x.auth_user_id is null
       and x.discord_id is null
       and lower(btrim(x.display_name)) = lower(btrim(wl.label));
    if cardinality(matches) = 1 then
      update public.people set discord_id = did, auth_user_id = uid
       where id = matches[1] returning * into p;
      return p;
    end if;
  end if;

  select u.raw_user_meta_data into meta from auth.users u where u.id = uid;
  insert into public.people (display_name, discord_id, auth_user_id)
  values (coalesce(wl.label,
                   meta #>> '{custom_claims,global_name}',
                   meta ->> 'full_name', meta ->> 'name', did),
          did, uid)
  returning * into p;
  return p;
end;
$$;
revoke all on function public.ensure_person() from public, anon;
grant execute on function public.ensure_person() to authenticated;

-- Whitelist administration (admin only) ---------------------------------------

-- Returns the reason an ID is not acceptable, or null when it is fine.
create function app.discord_id_problem(id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when id is null or btrim(id) = '' then 'The Discord user ID is empty.'
    when btrim(id) !~ '^[0-9]{15,20}$' then 'Not a Discord user ID. Use digits only, 15 to 20 of them.'
  end
$$;
revoke all on function app.discord_id_problem(text) from public;

create function public.whitelist_add(p_discord_id text, p_label text default null)
returns public.whitelist
language plpgsql
security definer
set search_path = ''
as $$
declare
  id text := btrim(p_discord_id);
  problem text := app.discord_id_problem(p_discord_id);
  w public.whitelist;
begin
  perform app.require_admin();
  if problem is not null then
    raise exception '"%": %', coalesce(p_discord_id, ''), problem using errcode = '22023';
  end if;
  if exists (select 1 from public.whitelist x where x.discord_id = id) then
    raise exception '% is already on the whitelist.', id using errcode = '23505';
  end if;
  insert into public.whitelist (discord_id, label, added_by)
  values (id, nullif(btrim(coalesce(p_label, '')), ''), app.person_id())
  returning * into w;
  return w;
end;
$$;

-- Adds many entries or none. p_entries is a JSON array of objects with a
-- discord_id and an optional label, in the order the admin pasted them. Every
-- bad row is named (row number counts from 1); the error's detail is a JSON
-- array of {row, discord_id, problem} for the page to show per row.
create function public.whitelist_add_many(p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  errors jsonb := '[]'::jsonb;
  item jsonb;
  n integer := 0;
  id text;
  problem text;
  seen text[] := '{}';
  first_row integer;
begin
  perform app.require_admin();
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Expected a list of entries.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_entries) loop
    n := n + 1;
    id := btrim(coalesce(item ->> 'discord_id', ''));
    problem := app.discord_id_problem(id);
    if problem is null and id = any (seen) then
      first_row := array_position(seen, id);
      problem := format('Repeats row %s in this list.', first_row);
    elsif problem is null and exists (select 1 from public.whitelist x where x.discord_id = id) then
      problem := 'Already on the whitelist.';
    end if;
    seen := seen || id;
    if problem is not null then
      errors := errors || jsonb_build_array(
        jsonb_build_object('row', n, 'discord_id', id, 'problem', problem));
    end if;
  end loop;

  if jsonb_array_length(errors) > 0 then
    raise exception 'Nothing was added. %', (
      select string_agg(format('Row %s (%s): %s', e ->> 'row', e ->> 'discord_id', e ->> 'problem'), ' ')
        from jsonb_array_elements(errors) as e)
      using errcode = '22023', detail = errors::text;
  end if;

  insert into public.whitelist (discord_id, label, added_by)
  select btrim(e ->> 'discord_id'),
         nullif(btrim(coalesce(e ->> 'label', '')), ''),
         app.person_id()
    from jsonb_array_elements(p_entries) as e;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.whitelist_label(p_discord_id text, p_label text)
returns public.whitelist
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.whitelist;
begin
  perform app.require_admin();
  update public.whitelist
     set label = nullif(btrim(coalesce(p_label, '')), '')
   where discord_id = btrim(p_discord_id)
  returning * into w;
  if not found then
    raise exception '% is not on the whitelist.', coalesce(p_discord_id, '') using errcode = 'P0002';
  end if;
  return w;
end;
$$;

-- Removing access is immediate: every read and function checks the whitelist on
-- the call. The person's roster entry, list and picks stay (story 1).
create function public.whitelist_remove(p_discord_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  id text := btrim(p_discord_id);
  w public.whitelist;
begin
  perform app.require_admin();
  -- Serialise admin changes so two removals cannot both leave no admin.
  perform 1 from public.whitelist x where x.is_admin for update;
  select * into w from public.whitelist x where x.discord_id = id;
  if not found then
    raise exception '% is not on the whitelist.', coalesce(p_discord_id, '') using errcode = 'P0002';
  end if;
  if w.is_admin and (select count(*) from public.whitelist x where x.is_admin) = 1 then
    raise exception 'Cannot remove the last admin. Make someone else an admin first.';
  end if;
  delete from public.whitelist where discord_id = id;
end;
$$;

create function public.whitelist_set_admin(p_discord_id text, p_is_admin boolean)
returns public.whitelist
language plpgsql
security definer
set search_path = ''
as $$
declare
  id text := btrim(p_discord_id);
  w public.whitelist;
begin
  perform app.require_admin();
  if p_is_admin is null then
    raise exception 'Say whether the person is an admin.' using errcode = '22023';
  end if;
  perform 1 from public.whitelist x where x.is_admin for update;
  select * into w from public.whitelist x where x.discord_id = id;
  if not found then
    raise exception '% is not on the whitelist.', coalesce(p_discord_id, '') using errcode = 'P0002';
  end if;
  if w.is_admin and not p_is_admin
     and (select count(*) from public.whitelist x where x.is_admin) = 1 then
    raise exception 'Cannot remove the last admin. Make someone else an admin first.';
  end if;
  update public.whitelist set is_admin = p_is_admin where discord_id = id returning * into w;
  return w;
end;
$$;

revoke all on function
  public.whitelist_add(text, text),
  public.whitelist_add_many(jsonb),
  public.whitelist_label(text, text),
  public.whitelist_remove(text),
  public.whitelist_set_admin(text, boolean)
  from public, anon;
grant execute on function
  public.whitelist_add(text, text),
  public.whitelist_add_many(jsonb),
  public.whitelist_label(text, text),
  public.whitelist_remove(text),
  public.whitelist_set_admin(text, boolean)
  to authenticated;
