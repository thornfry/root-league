-- Lock lists now (decision 56): public.season_lock_lists sets lists_lock_at to
-- now. Admin only, refused once the season has started, and a no-op when lists
-- are already locked. There is no unlock function: season_save reopens lists by
-- moving the date. Every fixture ID is fake and in the 9000... range. The file
-- runs in one transaction that is rolled back.
begin;

select plan(14);

grant all on all tables in schema pg_temp to anon, authenticated, service_role;
grant all on all sequences in schema pg_temp to anon, authenticated, service_role;

create function pg_temp.u(n integer) returns uuid language sql as $$
  select ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;

create function pg_temp.as_user(n integer) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.u(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;

create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

create temp table ctx (open_id uuid, locked_id uuid, live_id uuid);
grant select on ctx to anon, authenticated;

-- Fixtures (as postgres): 1 admin, 2 a plain player.
delete from public.whitelist;
delete from public.people;
delete from public.seasons;

insert into auth.users (id, email)
select pg_temp.u(n), '9000000000000' || lpad(n::text, 5, '0') || '@dev.invalid'
  from unnest(array[1, 2]) n;

insert into public.whitelist (discord_id, label, is_admin)
select '9000000000000' || lpad(n::text, 5, '0'), case when n = 1 then 'Test Admin' else 'Player' end, n = 1
  from unnest(array[1, 2]) n;

-- One season open (lock date in the future), one already locked (in the past),
-- one live. Only one can be current.
insert into public.seasons (slug, name, is_current, lists_lock_at, started_at)
values ('open', 'Open', false, now() + interval '30 days', null),
       ('locked', 'Locked', false, '2020-01-01T00:00:00Z', null),
       ('live', 'Live', false, '2020-01-01T00:00:00Z', now());
insert into ctx (open_id, locked_id, live_id)
select (select id from public.seasons where slug = 'open'),
       (select id from public.seasons where slug = 'locked'),
       (select id from public.seasons where slug = 'live');

-- Refused callers ---------------------------------------------------------------
select pg_temp.as_anon();
select throws_ok($$select public.season_lock_lists((select open_id from ctx))$$, '42501', null, 'signed out: season_lock_lists is refused');

select pg_temp.as_user(2);
select throws_ok($$select public.season_lock_lists((select open_id from ctx))$$, '42501', 'Only an admin can do this.', 'player: season_lock_lists is refused');
select is((select stage from public.season_stage where season_id = (select open_id from ctx)), 'open', 'player: the refused call left lists open');

-- Admin ---------------------------------------------------------------------------
select pg_temp.as_user(1);
select throws_ok($$select public.season_lock_lists('00000000-0000-0000-0000-000000000000')$$, 'P0002', 'That season does not exist.', 'admin: an unknown season is refused');
select throws_ok($$select public.season_lock_lists((select live_id from ctx))$$, '55000', 'The season has started, so lists are already locked.', 'admin: a started season is refused');

select is((select stage from public.season_stage where season_id = (select open_id from ctx)), 'open', 'admin: lists start open');
select lives_ok($$select public.season_lock_lists((select open_id from ctx))$$, 'admin: locks lists now');
select is((select stage from public.season_stage where season_id = (select open_id from ctx)), 'locked', 'admin: lists are locked straight away');
select ok((select lists_lock_at <= now() from public.seasons where id = (select open_id from ctx)), 'admin: the lock date is now');

-- Locking again keeps the date it locked at.
select pg_temp.as_owner();
update public.seasons set lists_lock_at = '2021-06-01T00:00:00Z' where id = (select locked_id from ctx);
select pg_temp.as_user(1);
select lives_ok($$select public.season_lock_lists((select locked_id from ctx))$$, 'admin: locking locked lists is not an error');
select is((select lists_lock_at from public.seasons where id = (select locked_id from ctx)), '2021-06-01T00:00:00Z'::timestamptz, 'admin: locked lists keep their lock date');

-- Reopening is a date change through season_save, not a new function.
select lives_ok($$select public.season_save((select open_id from ctx), 'Open', null, null, null, null, null, now() + interval '7 days')$$, 'admin: season_save moves the lock date');
select is((select stage from public.season_stage where season_id = (select open_id from ctx)), 'open', 'admin: a later lock date reopens lists');

-- Each change of the lock date is logged.
select pg_temp.as_owner();
select is((select count(*) from public.edit_log where table_name = 'seasons' and action = 'update'
            and row_key = (select open_id from ctx)::text
            and old ->> 'lists_lock_at' is distinct from new ->> 'lists_lock_at'), 2::bigint,
  'log: locking and reopening are each logged');

select * from finish();

rollback;
