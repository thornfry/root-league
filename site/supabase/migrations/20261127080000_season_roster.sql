-- D2: seasons, roster and ranked lists (build.md D2; decisions 16, 20, 27, 43).
-- Follows the pattern in the header of the D1 access migration: every table calls
-- app.lock_down and carries the audit trigger, every function revokes from public
-- and anon, grants to authenticated, pins an empty search_path and qualifies names.
--
-- Stages. A season is `open` until its lists lock date passes, `locked` from then
-- until the admin starts it, and `live` once started_at is set. The stage is
-- derived on every read (app.stage_of), so moving the date earlier or later
-- changes it with no job (story 6).
--
-- Ranked lists are private until lock (decision 27). The roster table itself is
-- admin-read only. Everyone else reads public.roster_public, a view that returns
-- ranked_factions only to the owner, the admin, or once the stage is not open,
-- and never shows which list (league or waitlist) a person is on, except to the
-- admin. The rule lives in the database, so another person's list cannot be
-- fetched by any request before lock.
--
-- Errors. 42501 not allowed, 22023 a bad value, 55000 not possible in the
-- season's current state, P0002 not found, 23505 already exists.

-- Tables ----------------------------------------------------------------------

-- Settings stay null until the admin sets them; the site holds no defaults.
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  is_current boolean not null default false,
  capacity integer check (capacity in (8, 10, 12)),
  games_each integer check (games_each between 2 and 4),
  maps text[] check (cardinality(maps) between 1 and 6),
  faction_pool text[] check (cardinality(faction_pool) >= 1),
  min_list_length integer check (min_list_length >= 1),
  lists_lock_at timestamptz,
  started_at timestamptz,
  seed text,
  created_at timestamptz not null default now(),
  -- 8 with 2, 3 or 4 games; 10 with 2 or 4; 12 with 2, 3 or 4. 10 with 3 is
  -- 30 seats and does not fill 4-seat tables (decision 21).
  constraint seasons_valid_pair check (
    capacity is null or games_each is null
    or (capacity = 8 and games_each in (2, 3, 4))
    or (capacity = 10 and games_each in (2, 4))
    or (capacity = 12 and games_each in (2, 3, 4))),
  constraint seasons_maps_cover_games check (
    maps is null or games_each is null or cardinality(maps) >= games_each),
  constraint seasons_min_fits_pool check (
    faction_pool is null or min_list_length is null
    or min_list_length <= cardinality(faction_pool))
);

-- One current season at a time.
create unique index seasons_one_current on public.seasons (is_current) where is_current;

-- The league list and the waitlist, each ordered by position (1 upward).
-- ranked_factions holds faction codes, best first. list_flagged is set when a pool
-- change removes a ranked faction: the list is kept and needs attention. The
-- position constraint is deferrable so functions can shift rows in one go.
create table public.roster (
  season_id uuid not null references public.seasons (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  list text not null check (list in ('league', 'waitlist')),
  position integer not null check (position >= 1),
  ranked_factions text[] not null default '{}',
  list_submitted boolean not null default false,
  list_flagged boolean not null default false,
  player_number integer check (player_number >= 1),
  joined_at timestamptz not null default now(),
  primary key (season_id, person_id),
  constraint roster_list_position_key unique (season_id, list, position) deferrable initially immediate,
  constraint roster_player_number_key unique (season_id, player_number)
);

-- Readable by every whitelisted viewer. Roster is admin-read only; the Players
-- page reads roster_public (below).
select app.lock_down('public.seasons');
select app.lock_down('public.roster', 'app.is_admin()');

create trigger seasons_audit
  after insert or update or delete on public.seasons
  for each row execute function app.audit_row('id');
create trigger roster_audit
  after insert or update or delete on public.roster
  for each row execute function app.audit_row('season_id', 'person_id');

-- Helpers (app schema) --------------------------------------------------------

-- The stage a season is in right now: 'open', 'locked' or 'live'.
create function app.stage_of(p_started_at timestamptz, p_lists_lock_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_started_at is not null then 'live'
    when p_lists_lock_at is not null and p_lists_lock_at <= now() then 'locked'
    else 'open'
  end
$$;
revoke all on function app.stage_of(timestamptz, timestamptz) from public;
grant execute on function app.stage_of(timestamptz, timestamptz) to authenticated;

-- The caller's person id, creating or linking it first when a whitelisted caller
-- has not signed in through ensure_person yet. Anyone else is refused.
create function app.require_person()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := app.person_id();
begin
  if pid is null then
    if auth.uid() is null or not app.is_whitelisted() then
      raise exception 'This Discord account is not on the whitelist.' using errcode = '42501';
    end if;
    pid := (public.ensure_person()).id;
  end if;
  return pid;
end;
$$;
revoke all on function app.require_person() from public;

-- Serialises changes to one season's roster, so two joins cannot take one place.
create function app.lock_season(p_season_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('season:' || p_season_id::text, 0));
end;
$$;
revoke all on function app.lock_season(uuid) from public;

-- Whether the caller may read this person's ranked list in this season
-- (decision 27): the owner, the admin, or anyone once lists have locked.
create function app.can_see_list(p_season_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_whitelisted() and (
    app.is_admin()
    or p_person_id = app.person_id()
    or exists (select 1 from public.seasons s
                where s.id = p_season_id
                  and app.stage_of(s.started_at, s.lists_lock_at) <> 'open')
  )
$$;
revoke all on function app.can_see_list(uuid, uuid) from public;
-- roster_public calls it as the caller (a view's functions run with the caller's
-- rights, only its tables use the owner's). It reports only what the caller may read.
grant execute on function app.can_see_list(uuid, uuid) to authenticated;

-- Why a list is not acceptable for this season, or null when it is fine.
create function app.list_problem(p_pool text[], p_factions text[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  f text;
  seen text[] := '{}';
begin
  if p_pool is null then
    return 'The faction pool has not been set yet.';
  end if;
  foreach f in array coalesce(p_factions, '{}') loop
    if f is null or btrim(f) = '' then
      return 'The list has an empty entry.';
    end if;
    if f = any (seen) then
      return format('Each faction can be on the list once only: "%s" is repeated.', f);
    end if;
    if not f = any (p_pool) then
      return format('"%s" is not in this season''s faction pool.', f);
    end if;
    seen := seen || f;
  end loop;
  return null;
end;
$$;
revoke all on function app.list_problem(text[], text[]) from public;

-- Closes gaps so a list's positions run 1 to n in their current order.
create function app.roster_renumber(p_season_id uuid, p_list text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  set constraints public.roster_list_position_key deferred;
  update public.roster r
     set position = n.rn
    from (select x.person_id, row_number() over (order by x.position) as rn
            from public.roster x
           where x.season_id = p_season_id and x.list = p_list) n
   where r.season_id = p_season_id and r.person_id = n.person_id and r.position <> n.rn;
  set constraints public.roster_list_position_key immediate;
end;
$$;
revoke all on function app.roster_renumber(uuid, text) from public;

-- A season row the caller may change the roster of. Locks the season, refuses an
-- unknown one and, when p_open_only, one that has started.
create function app.roster_season(p_season_id uuid, p_refuse_if_live boolean)
returns public.seasons
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
begin
  perform app.lock_season(p_season_id);
  select * into s from public.seasons x where x.id = p_season_id;
  if not found then
    raise exception 'That season does not exist.' using errcode = 'P0002';
  end if;
  if p_refuse_if_live and s.started_at is not null then
    raise exception 'The roster is closed: the season has started. Replace a player on Fix it.' using errcode = '55000';
  end if;
  return s;
end;
$$;
revoke all on function app.roster_season(uuid, boolean) from public;

-- Refuses when the league list has no room, naming the counts.
create function app.require_league_room(p_season public.seasons)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_season.capacity is null then
    raise exception 'Set the capacity on the Season page before filling the league list.' using errcode = '55000';
  end if;
  select count(*) into n from public.roster r where r.season_id = p_season.id and r.list = 'league';
  if n >= p_season.capacity then
    raise exception 'The league list is full (% of %). Move someone off first, or swap two people.', n, p_season.capacity
      using errcode = '55000';
  end if;
end;
$$;
revoke all on function app.require_league_room(public.seasons) from public;

-- Views -----------------------------------------------------------------------

-- Open, locked or live, derived from started_at and lists_lock_at. Read under the
-- caller's own rights, so it shows exactly the seasons the caller can read.
create view public.season_stage with (security_invoker = true) as
select s.id as season_id, app.stage_of(s.started_at, s.lists_lock_at) as stage
  from public.seasons s;
revoke all on public.season_stage from public, anon, authenticated;
grant select on public.season_stage to authenticated;

-- The Players page. Always shows who is in and whether a list is in. Shows
-- ranked_factions only to the owner, the admin, or once the stage is not open,
-- list_flagged only to the owner and admin, and list, position and joined_at only
-- to the admin. It runs with its owner's rights on purpose (the roster table is
-- admin-read only); the where clause and the case expressions are the rule.
create view public.roster_public as
select r.season_id,
       r.person_id,
       p.display_name,
       (r.person_id = app.person_id()) as is_me,
       r.list_submitted as list_in,
       case when app.can_see_list(r.season_id, r.person_id) then r.ranked_factions end as ranked_factions,
       case when r.person_id = app.person_id() or app.is_admin() then r.list_flagged end as list_flagged,
       case when app.is_admin() then r.list end as list,
       case when app.is_admin() then r.position end as "position",
       case when app.is_admin() then r.joined_at end as joined_at
  from public.roster r
  join public.people p on p.id = r.person_id
 where app.is_whitelisted();
revoke all on public.roster_public from public, anon, authenticated;
grant select on public.roster_public to authenticated;

-- Season functions (admin) ----------------------------------------------------

-- Creates a season with no settings and makes it current. The old one is kept.
create function public.season_create(p_name text)
returns public.seasons
language plpgsql
security definer
set search_path = ''
as $$
declare
  nm text := btrim(coalesce(p_name, ''));
  base text;
  candidate text;
  n integer := 1;
  s public.seasons;
begin
  perform app.require_admin();
  if nm = '' then
    raise exception 'Give the season a name.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('seasons', 0));

  base := btrim(regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g'), '-');
  if base = '' then
    base := 'season';
  end if;
  candidate := base;
  while exists (select 1 from public.seasons x where x.slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;

  update public.seasons set is_current = false where is_current;
  insert into public.seasons (slug, name, is_current)
  values (candidate, nm, true)
  returning * into s;
  return s;
end;
$$;

-- Saves the whole Season setup form: a null leaves that setting unset. Valid
-- capacity and games pairs only, capacity not below the league list, between
-- games-each and 6 maps, a pool and minimum that fit. Capacity, games each and
-- the number of maps are locked once the season has started. A pool or minimum
-- change flags every list it breaks and un-submits it; nothing is deleted.
create function public.season_save(
  p_season_id uuid,
  p_name text,
  p_capacity integer default null,
  p_games_each integer default null,
  p_maps text[] default null,
  p_faction_pool text[] default null,
  p_min_list_length integer default null,
  p_lists_lock_at timestamptz default null)
returns public.seasons
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  nm text := btrim(coalesce(p_name, ''));
  maps_in text[];
  pool_in text[];
  m text;
  seen text[] := '{}';
  league_count integer;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, false);
  select * into s from public.seasons x where x.id = p_season_id for update;

  if nm = '' then
    raise exception 'Give the season a name.' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity not in (8, 10, 12) then
    raise exception 'Capacity must be 8, 10 or 12.' using errcode = '22023';
  end if;
  if p_games_each is not null and p_games_each not in (2, 3, 4) then
    raise exception 'Games each must be 2, 3 or 4.' using errcode = '22023';
  end if;
  if p_capacity is not null and p_games_each is not null and not (
       (p_capacity = 8 and p_games_each in (2, 3, 4))
    or (p_capacity = 10 and p_games_each in (2, 4))
    or (p_capacity = 12 and p_games_each in (2, 3, 4))) then
    if p_capacity = 10 and p_games_each = 3 then
      raise exception '10 players with 3 games each is not offered: it is 30 seats, which does not fill 4-seat tables.'
        using errcode = '22023';
    end if;
    raise exception '% players cannot play % games each.', p_capacity, p_games_each using errcode = '22023';
  end if;

  if p_capacity is not null then
    select count(*) into league_count
      from public.roster r where r.season_id = s.id and r.list = 'league';
    if league_count > p_capacity then
      raise exception 'Capacity % is below the % people on the league list. Move people to the waitlist first.',
        p_capacity, league_count using errcode = '55000';
    end if;
  end if;

  -- Maps: trimmed, filled in, all different, games each up to 6.
  if p_maps is not null and cardinality(p_maps) > 0 then
    maps_in := '{}';
    foreach m in array p_maps loop
      m := btrim(coalesce(m, ''));
      if m = '' then
        raise exception 'Every map needs a name.' using errcode = '22023';
      end if;
      if lower(m) = any (seen) then
        raise exception 'Map "%" is listed twice.', m using errcode = '22023';
      end if;
      seen := seen || lower(m);
      maps_in := maps_in || m;
    end loop;
    if cardinality(maps_in) > 6 then
      raise exception 'Use at most 6 maps.' using errcode = '22023';
    end if;
    if p_games_each is not null and cardinality(maps_in) < p_games_each then
      raise exception 'Give at least % maps, one for each game each.', p_games_each using errcode = '22023';
    end if;
  end if;

  -- Pool: trimmed, filled in, all different.
  seen := '{}';
  if p_faction_pool is not null and cardinality(p_faction_pool) > 0 then
    pool_in := '{}';
    foreach m in array p_faction_pool loop
      m := btrim(coalesce(m, ''));
      if m = '' then
        raise exception 'Every faction in the pool needs a code.' using errcode = '22023';
      end if;
      if m = any (seen) then
        raise exception 'Faction "%" is in the pool twice.', m using errcode = '22023';
      end if;
      seen := seen || m;
      pool_in := pool_in || m;
    end loop;
  end if;

  if p_min_list_length is not null and p_min_list_length < 1 then
    raise exception 'The minimum list length must be at least 1.' using errcode = '22023';
  end if;
  if pool_in is not null and p_min_list_length is not null
     and p_min_list_length > cardinality(pool_in) then
    raise exception 'The minimum list length (%) is longer than the faction pool (%).',
      p_min_list_length, cardinality(pool_in) using errcode = '22023';
  end if;

  if s.started_at is not null then
    if p_capacity is distinct from s.capacity or p_games_each is distinct from s.games_each then
      raise exception 'Capacity and games each are locked once the season has started. Use Fix it.'
        using errcode = '55000';
    end if;
    if coalesce(cardinality(maps_in), 0) <> coalesce(cardinality(s.maps), 0) then
      raise exception 'The number of maps is locked once the season has started. Use Fix it.'
        using errcode = '55000';
    end if;
  end if;

  update public.seasons set
    name = nm,
    capacity = p_capacity,
    games_each = p_games_each,
    maps = maps_in,
    faction_pool = pool_in,
    min_list_length = p_min_list_length,
    lists_lock_at = p_lists_lock_at
  where id = s.id
  returning * into s;

  -- A pool or minimum change flags the lists it breaks and un-submits them. A list
  -- is never deleted, and a list that becomes valid again is not submitted for
  -- the player.
  with calc as (
    select r.person_id,
           (s.faction_pool is not null
            and exists (select 1 from unnest(r.ranked_factions) f where f <> all (s.faction_pool))) as flagged,
           (s.min_list_length is not null
            and cardinality(r.ranked_factions) < s.min_list_length) as too_short
      from public.roster r
     where r.season_id = s.id)
  update public.roster r
     set list_flagged = c.flagged,
         list_submitted = r.list_submitted and not c.flagged and not c.too_short
    from calc c
   where r.season_id = s.id
     and r.person_id = c.person_id
     and (r.list_flagged is distinct from c.flagged
          or (r.list_submitted and (c.flagged or c.too_short)));

  return s;
end;
$$;

-- Player functions ------------------------------------------------------------

-- A whitelisted viewer joins the end of the waitlist (decision 15). Joining twice
-- changes nothing. Refused once lists lock or the season starts, and for a season
-- that is not the current one.
create function public.join_league(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := app.require_person();
  s public.seasons;
  stage text;
begin
  s := app.roster_season(p_season_id, false);
  if exists (select 1 from public.roster r where r.season_id = s.id and r.person_id = pid) then
    return;
  end if;
  if not s.is_current then
    raise exception 'Joining is only open for the current season.' using errcode = '55000';
  end if;
  stage := app.stage_of(s.started_at, s.lists_lock_at);
  if stage = 'live' then
    raise exception 'Joining is closed: the season has started.' using errcode = '55000';
  elsif stage = 'locked' then
    raise exception 'Joining is closed: lists have locked.' using errcode = '55000';
  end if;
  insert into public.roster (season_id, person_id, list, position)
  select s.id, pid, 'waitlist', coalesce(max(r.position), 0) + 1
    from public.roster r where r.season_id = s.id and r.list = 'waitlist';
end;
$$;

-- Leaving removes the caller from either list and clears their ranked list.
-- Before the season starts only; leaving when not on the roster does nothing.
create function public.leave_league(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := app.require_person();
  s public.seasons;
  gone_list text;
begin
  s := app.roster_season(p_season_id, false);
  if s.started_at is not null then
    raise exception 'The season has started, so you cannot leave. Ask the admin to replace you.' using errcode = '55000';
  end if;
  delete from public.roster r
   where r.season_id = s.id and r.person_id = pid
  returning r.list into gone_list;
  if found then
    perform app.roster_renumber(s.id, gone_list);
  end if;
end;
$$;

-- Saves the caller's ranked list. The list must be distinct and in the pool; it
-- counts as submitted only when it reaches the minimum length. Refused after the
-- lock for everyone but the admin (story 3, 6).
create function public.save_ranked_list(p_season_id uuid, p_factions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := app.require_person();
  s public.seasons;
  list_in text[] := coalesce(p_factions, '{}');
  problem text;
begin
  s := app.roster_season(p_season_id, false);
  if not exists (select 1 from public.roster r where r.season_id = s.id and r.person_id = pid) then
    raise exception 'Join the league before ranking factions.' using errcode = '55000';
  end if;
  if app.stage_of(s.started_at, s.lists_lock_at) <> 'open' and not app.is_admin() then
    raise exception 'Lists are locked. Ask the admin to change yours.' using errcode = '55000';
  end if;
  problem := app.list_problem(s.faction_pool, list_in);
  if problem is not null then
    raise exception '%', problem using errcode = '22023';
  end if;
  update public.roster r
     set ranked_factions = list_in,
         list_flagged = false,
         list_submitted = (s.min_list_length is not null and cardinality(list_in) >= s.min_list_length)
   where r.season_id = s.id and r.person_id = pid;
end;
$$;

-- Roster functions (admin) ----------------------------------------------------

-- Moves a person to a list at a position (the end when null). Within a list it
-- reorders. Onto the league list it needs a free place: a full list refuses, and
-- roster_swap exchanges two people in one move.
create function public.roster_move(
  p_season_id uuid, p_person_id uuid, p_to_list text, p_to_position integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  r public.roster;
  others integer;
  pos integer;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, true);
  if p_to_list is null or p_to_list not in ('league', 'waitlist') then
    raise exception 'Move to the league list or the waitlist.' using errcode = '22023';
  end if;
  select * into r from public.roster x where x.season_id = s.id and x.person_id = p_person_id;
  if not found then
    raise exception 'That person is not on the roster.' using errcode = 'P0002';
  end if;
  if p_to_list = 'league' and r.list <> 'league' then
    perform app.require_league_room(s);
  end if;

  select count(*) into others from public.roster x
   where x.season_id = s.id and x.list = p_to_list and x.person_id <> r.person_id;
  pos := least(greatest(coalesce(p_to_position, others + 1), 1), others + 1);
  if r.list = p_to_list and r.position = pos then
    return;
  end if;

  set constraints public.roster_list_position_key deferred;
  update public.roster x set position = x.position - 1
   where x.season_id = s.id and x.list = r.list and x.position > r.position and x.person_id <> r.person_id;
  update public.roster x set position = x.position + 1
   where x.season_id = s.id and x.list = p_to_list and x.position >= pos and x.person_id <> r.person_id;
  update public.roster x set list = p_to_list, position = pos
   where x.season_id = s.id and x.person_id = r.person_id;
  set constraints public.roster_list_position_key immediate;
end;
$$;

-- Exchanges the lists and places of two people in one move, so a full league
-- list can take someone from the waitlist.
create function public.roster_swap(p_season_id uuid, p_person_a uuid, p_person_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  a public.roster;
  b public.roster;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, true);
  if p_person_a is null or p_person_b is null or p_person_a = p_person_b then
    raise exception 'Pick two different people to swap.' using errcode = '22023';
  end if;
  select * into a from public.roster x where x.season_id = s.id and x.person_id = p_person_a;
  if not found then
    raise exception 'The first person is not on the roster.' using errcode = 'P0002';
  end if;
  select * into b from public.roster x where x.season_id = s.id and x.person_id = p_person_b;
  if not found then
    raise exception 'The second person is not on the roster.' using errcode = 'P0002';
  end if;

  set constraints public.roster_list_position_key deferred;
  update public.roster x
     set list = case x.person_id when a.person_id then b.list else a.list end,
         position = case x.person_id when a.person_id then b.position else a.position end
   where x.season_id = s.id and x.person_id in (a.person_id, b.person_id);
  set constraints public.roster_list_position_key immediate;
end;
$$;

-- Adds a person by name to the end of a list (the waitlist unless told). An
-- existing person of that name who is not on this roster is reused, which is how a
-- returning player keeps their identity; otherwise a person is created. They need
-- a whitelist entry whose label is their name to sign in as that person.
create function public.roster_add(p_season_id uuid, p_display_name text, p_list text default 'waitlist')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  nm text := btrim(coalesce(p_display_name, ''));
  candidates uuid[];
  pid uuid;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, true);
  if nm = '' then
    raise exception 'Give the person a name.' using errcode = '22023';
  end if;
  if p_list is null or p_list not in ('league', 'waitlist') then
    raise exception 'Add to the league list or the waitlist.' using errcode = '22023';
  end if;
  if exists (select 1 from public.roster r join public.people p on p.id = r.person_id
              where r.season_id = s.id and lower(btrim(p.display_name)) = lower(nm)) then
    raise exception '% is already on the roster.', nm using errcode = '23505';
  end if;
  if p_list = 'league' then
    perform app.require_league_room(s);
  end if;

  select array_agg(p.id) into candidates
    from public.people p where lower(btrim(p.display_name)) = lower(nm);
  if cardinality(candidates) > 1 then
    raise exception 'More than one person is called %. Add them on Fix it.', nm using errcode = '22023';
  elsif cardinality(candidates) = 1 then
    pid := candidates[1];
  else
    insert into public.people (display_name) values (nm) returning id into pid;
  end if;

  insert into public.roster (season_id, person_id, list, position)
  select s.id, pid, p_list, coalesce(max(r.position), 0) + 1
    from public.roster r where r.season_id = s.id and r.list = p_list;
  return pid;
end;
$$;

-- Removes a person from the roster, with their list. The person row stays.
create function public.roster_remove(p_season_id uuid, p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  gone_list text;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, true);
  delete from public.roster r
   where r.season_id = s.id and r.person_id = p_person_id
  returning r.list into gone_list;
  if not found then
    raise exception 'That person is not on the roster.' using errcode = 'P0002';
  end if;
  perform app.roster_renumber(s.id, gone_list);
end;
$$;

-- The admin's list edit: any person's list, at any time, locked or not. The same
-- pool and distinct rules apply; a valid save clears the flag.
create function public.roster_set_list(p_season_id uuid, p_person_id uuid, p_factions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  list_in text[] := coalesce(p_factions, '{}');
  problem text;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, false);
  if not exists (select 1 from public.roster r where r.season_id = s.id and r.person_id = p_person_id) then
    raise exception 'That person is not on the roster.' using errcode = 'P0002';
  end if;
  problem := app.list_problem(s.faction_pool, list_in);
  if problem is not null then
    raise exception '%', problem using errcode = '22023';
  end if;
  update public.roster r
     set ranked_factions = list_in,
         list_flagged = false,
         list_submitted = (s.min_list_length is not null and cardinality(list_in) >= s.min_list_length)
   where r.season_id = s.id and r.person_id = p_person_id;
end;
$$;

revoke all on function
  public.season_create(text),
  public.season_save(uuid, text, integer, integer, text[], text[], integer, timestamptz),
  public.join_league(uuid),
  public.leave_league(uuid),
  public.save_ranked_list(uuid, text[]),
  public.roster_move(uuid, uuid, text, integer),
  public.roster_swap(uuid, uuid, uuid),
  public.roster_add(uuid, text, text),
  public.roster_remove(uuid, uuid),
  public.roster_set_list(uuid, uuid, text[])
  from public, anon;
grant execute on function
  public.season_create(text),
  public.season_save(uuid, text, integer, integer, text[], text[], integer, timestamptz),
  public.join_league(uuid),
  public.leave_league(uuid),
  public.save_ranked_list(uuid, text[]),
  public.roster_move(uuid, uuid, text, integer),
  public.roster_swap(uuid, uuid, uuid),
  public.roster_add(uuid, text, text),
  public.roster_remove(uuid, uuid),
  public.roster_set_list(uuid, uuid, text[])
  to authenticated;

-- whoami: add the prospect and league_player roles (decision 43) ---------------

-- A person on the current season's roster is a prospect until the season starts.
-- Once it has started, someone on the league list is a league player and someone
-- on the waitlist stays a prospect (story 11). The roles come in the order viewer,
-- then prospect or league_player, then admin.
create or replace function public.whoami()
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
  on_list text;
  started timestamptz;
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
    select * into p from public.people x where x.auth_user_id = uid;
    if p.id is not null then
      select r.list, s.started_at into on_list, started
        from public.roster r
        join public.seasons s on s.id = r.season_id and s.is_current
       where r.person_id = p.id;
      if found then
        roles := roles || jsonb_build_array(
          case when started is not null and on_list = 'league' then 'league_player' else 'prospect' end);
      end if;
    end if;
    if wl.is_admin then
      roles := roles || '["admin"]'::jsonb;
    end if;
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
