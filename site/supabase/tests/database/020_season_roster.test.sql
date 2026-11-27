-- D2: seasons, roster and ranked lists. Covers the roster, lists and settings rows
-- of the permission table as signed-out, non-whitelisted, viewer, prospect, league
-- player and admin callers, the stage rules, the roster rules and, above all,
-- decision 27: another viewer cannot read a prospect's ranked factions before the
-- lock, and roster_public never shows league or waitlist to a non-admin.
--
-- Every fixture ID is fake and in the 9000... range. The file runs in one
-- transaction that is rolled back. It stands in for D3's publish by setting
-- started_at directly as the table owner.
begin;

select plan(232);

grant all on all tables in schema pg_temp to anon, authenticated, service_role;
grant all on all sequences in schema pg_temp to anon, authenticated, service_role;

-- Helpers (copied from 010_access.test.sql, plus a few). Call them as the
-- postgres role or from a statement that may switch role; each user switch ends
-- with the role the persona uses.
create function pg_temp.act_as(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', who, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', who::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;

-- Fixture person n: auth user a0000000-0000-0000-0000-<n>, Discord ID 9000...<n>.
create function pg_temp.u(n integer) returns uuid language sql as $$
  select ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- Switch persona from any current role.
create function pg_temp.as_user(n integer) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform pg_temp.act_as(pg_temp.u(n));
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform pg_temp.act_anon();
end $$;

create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

-- The person id of a fixture by display name, read as the owner.
create function pg_temp.pid(nm text) returns uuid language sql as $$
  select id from public.people where display_name = nm
$$;

-- The season the fixtures use.
create function pg_temp.sid() returns uuid language plpgsql as $$
begin
  return (select sid from ctx);
end $$;

-- Fixtures (as postgres) -------------------------------------------------------
delete from public.whitelist;
delete from public.people;
delete from public.seasons;

-- 1 admin, 2 viewer (never joins), 3 stranger (not whitelisted), 4 latecomer,
-- 11 to 22 twelve prospects who join, 30 a returning name.
insert into auth.users (id, email)
select pg_temp.u(n), '9000000000000' || lpad(n::text, 5, '0') || '@dev.invalid'
  from unnest(array[1, 2, 3, 4, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]) n;

insert into public.whitelist (discord_id, label, is_admin)
select '9000000000000' || lpad(n::text, 5, '0'),
       case when n = 1 then 'Test Admin' when n = 2 then 'Viewer' when n = 4 then 'Late' else 'P' || n end,
       n = 1
  from unnest(array[1, 2, 4, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]) n;

insert into public.people (display_name, seed_key) values ('Returning', 'returning');

create temp table ctx (sid uuid, sid2 uuid);
grant select on ctx to anon, authenticated;

-- 1. Admin creates the season and the setup refusals ---------------------------
select pg_temp.as_user(1);

select is((select (public.season_create('  Season 1 ')).slug), 'season-1', 'admin: season_create makes a slug from the name');
reset role;
insert into ctx (sid) select id from public.seasons;
select pg_temp.as_user(1);

select is((select name from public.seasons where id = pg_temp.sid()), 'Season 1', 'admin: the season name is trimmed');
select is((select is_current from public.seasons where id = pg_temp.sid()), true, 'admin: a new season is current');
select is((select capacity from public.seasons where id = pg_temp.sid()), null, 'admin: settings start null, with no defaults');
select is((select stage from public.season_stage where season_id = pg_temp.sid()), 'open', 'admin: a season with no lock date is open');
select throws_ok($$select public.season_create('   ')$$, '22023', 'Give the season a name.', 'admin: a blank season name is refused');

select throws_ok($$select public.season_save(pg_temp.sid(), '  ')$$, '22023', 'Give the season a name.', 'admin: season_save refuses a blank name');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 11)$$, '22023', 'Capacity must be 8, 10 or 12.', 'admin: capacity 11 is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 12, 5)$$, '22023', 'Games each must be 2, 3 or 4.', 'admin: 5 games each is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 10, 3)$$, '22023',
  '10 players with 3 games each is not offered: it is 30 seats, which does not fill 4-seat tables.',
  'admin: 10 with 3 games is refused and explained');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 8, 3, '{A,B}')$$, '22023',
  'Give at least 3 maps, one for each game each.', 'admin: fewer maps than games each is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 8, 2, '{A,B,C,D,E,F,G}')$$, '22023', 'Use at most 6 maps.', 'admin: more than 6 maps is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 8, 2, '{A,a}')$$, '22023', 'Map "a" is listed twice.', 'admin: a repeated map name is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 8, 2, '{A," "}')$$, '22023', 'Every map needs a name.', 'admin: a blank map name is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 8, 2, '{A,B}', '{cats,cats}')$$, '22023', 'Faction "cats" is in the pool twice.', 'admin: a repeated pool faction is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 8, 2, '{A,B}', '{cats,rats}', 0)$$, '22023', 'The minimum list length must be at least 1.', 'admin: a minimum of 0 is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'S', 8, 2, '{A,B}', '{cats,rats}', 3)$$, '22023',
  'The minimum list length (3) is longer than the faction pool (2).', 'admin: a minimum longer than the pool is refused');
select is((select capacity from public.seasons where id = pg_temp.sid()), null, 'admin: every refused save changed nothing');

reset role;
select throws_ok($$update public.seasons set capacity = 10, games_each = 3$$, '23514', null, 'table: the check constraint refuses 10 with 3 even for the owner');
select throws_ok($$update public.seasons set capacity = 9$$, '23514', null, 'table: the check constraint refuses a capacity of 9');
select throws_ok($$update public.seasons set maps = '{a,b,c,d,e,f,g}'$$, '23514', null, 'table: the check constraint refuses more than 6 maps');

-- 2. Signed out -------------------------------------------------------------------
select pg_temp.as_anon();

select throws_ok($$select * from public.seasons$$, '42501', null, 'signed out: seasons is not readable');
select throws_ok($$select * from public.roster$$, '42501', null, 'signed out: roster is not readable');
select throws_ok($$select * from public.roster_public$$, '42501', null, 'signed out: roster_public is not readable');
select throws_ok($$select * from public.season_stage$$, '42501', null, 'signed out: season_stage is not readable');
select throws_ok($$select public.season_create('X')$$, '42501', null, 'signed out: season_create is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'X')$$, '42501', null, 'signed out: season_save is refused');
select throws_ok($$select public.join_league(pg_temp.sid())$$, '42501', null, 'signed out: join_league is refused');
select throws_ok($$select public.leave_league(pg_temp.sid())$$, '42501', null, 'signed out: leave_league is refused');
select throws_ok($$select public.save_ranked_list(pg_temp.sid(), '{cats}')$$, '42501', null, 'signed out: save_ranked_list is refused');
select throws_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P11'), 'league')$$, '42501', null, 'signed out: roster_move is refused');
select throws_ok($$select public.roster_swap(pg_temp.sid(), pg_temp.pid('P11'), pg_temp.pid('P12'))$$, '42501', null, 'signed out: roster_swap is refused');
select throws_ok($$select public.roster_add(pg_temp.sid(), 'X')$$, '42501', null, 'signed out: roster_add is refused');
select throws_ok($$select public.roster_remove(pg_temp.sid(), pg_temp.pid('P11'))$$, '42501', null, 'signed out: roster_remove is refused');
select throws_ok($$select public.roster_set_list(pg_temp.sid(), pg_temp.pid('P11'), '{cats}')$$, '42501', null, 'signed out: roster_set_list is refused');

-- 3. Signed in but not whitelisted -----------------------------------------------
select pg_temp.as_user(3);

select is((select count(*) from public.seasons), 0::bigint, 'not whitelisted: seasons shows no rows');
select is((select count(*) from public.season_stage), 0::bigint, 'not whitelisted: season_stage shows no rows');
select is((select count(*) from public.roster_public), 0::bigint, 'not whitelisted: roster_public shows no rows');
select is((select count(*) from public.roster), 0::bigint, 'not whitelisted: roster shows no rows');
select throws_ok($$select public.join_league(pg_temp.sid())$$, '42501', 'This Discord account is not on the whitelist.', 'not whitelisted: join_league is refused');
select throws_ok($$select public.leave_league(pg_temp.sid())$$, '42501', 'This Discord account is not on the whitelist.', 'not whitelisted: leave_league is refused');
select throws_ok($$select public.save_ranked_list(pg_temp.sid(), '{cats}')$$, '42501', 'This Discord account is not on the whitelist.', 'not whitelisted: save_ranked_list is refused');
select throws_ok($$select public.season_create('X')$$, '42501', 'Only an admin can do this.', 'not whitelisted: season_create is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'X')$$, '42501', 'Only an admin can do this.', 'not whitelisted: season_save is refused');
select throws_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P11'), 'league')$$, '42501', 'Only an admin can do this.', 'not whitelisted: roster_move is refused');
select throws_ok($$select public.roster_set_list(pg_temp.sid(), pg_temp.pid('P11'), '{cats}')$$, '42501', 'Only an admin can do this.', 'not whitelisted: roster_set_list is refused');
select is((select public.whoami() -> 'roles'), '[]'::jsonb, 'not whitelisted: whoami holds no role');

-- 4. Viewer (whitelisted, never on the roster) ---------------------------------
select pg_temp.as_user(2);

select is((select count(*) from public.seasons), 1::bigint, 'viewer: seasons is readable');
select is((select stage from public.season_stage), 'open', 'viewer: season_stage is readable');
select is((select count(*) from public.roster_public), 0::bigint, 'viewer: roster_public is readable and empty so far');
select throws_ok($$select public.season_create('X')$$, '42501', 'Only an admin can do this.', 'viewer: season_create is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'X')$$, '42501', 'Only an admin can do this.', 'viewer: season_save is refused');
select throws_ok($$select public.roster_move(pg_temp.sid(), pg_temp.u(2), 'league')$$, '42501', 'Only an admin can do this.', 'viewer: roster_move is refused');
select throws_ok($$select public.roster_swap(pg_temp.sid(), pg_temp.u(2), pg_temp.u(3))$$, '42501', 'Only an admin can do this.', 'viewer: roster_swap is refused');
select throws_ok($$select public.roster_add(pg_temp.sid(), 'X')$$, '42501', 'Only an admin can do this.', 'viewer: roster_add is refused');
select throws_ok($$select public.roster_remove(pg_temp.sid(), pg_temp.u(2))$$, '42501', 'Only an admin can do this.', 'viewer: roster_remove is refused');
select throws_ok($$select public.roster_set_list(pg_temp.sid(), pg_temp.u(2), '{cats}')$$, '42501', 'Only an admin can do this.', 'viewer: roster_set_list is refused');
select throws_ok($$select public.save_ranked_list(pg_temp.sid(), '{cats}')$$, '55000', 'Join the league before ranking factions.', 'viewer: no list can be saved before joining');
select lives_ok($$select public.leave_league(pg_temp.sid())$$, 'viewer: leaving when not on the roster does nothing');
select throws_ok($$insert into public.seasons (slug, name) values ('x', 'x')$$, '42501', null, 'viewer: no direct insert into seasons');
select throws_ok($$update public.seasons set name = 'x'$$, '42501', null, 'viewer: no direct update of seasons');
select throws_ok($$delete from public.seasons$$, '42501', null, 'viewer: no direct delete from seasons');
select throws_ok($$insert into public.roster (season_id, person_id, list, position) values (pg_temp.sid(), pg_temp.u(2), 'league', 1)$$, '42501', null, 'viewer: no direct insert into roster');
select throws_ok($$update public.roster set list = 'league'$$, '42501', null, 'viewer: no direct update of roster');
select throws_ok($$delete from public.roster$$, '42501', null, 'viewer: no direct delete from roster');
select is((select public.whoami() -> 'roles'), '["viewer"]'::jsonb, 'viewer: whoami roles is viewer only');

-- 5. Prospects join: the waitlist, in order ---------------------------------------
select pg_temp.as_owner();
create function pg_temp.join_as(n integer) returns void language plpgsql as $$
begin
  perform pg_temp.as_user(n);
  perform public.join_league(pg_temp.sid());
end $$;

select pg_temp.join_as(11);
select pg_temp.join_as(12);
select pg_temp.join_as(13);
select pg_temp.join_as(14);
select pg_temp.join_as(15);
select pg_temp.join_as(16);
select pg_temp.join_as(17);
select pg_temp.join_as(18);
select pg_temp.join_as(19);
select pg_temp.join_as(20);
select pg_temp.join_as(21);
select pg_temp.join_as(22);
select pg_temp.join_as(1);

select pg_temp.as_owner();
select is((select count(*) from public.roster), 13::bigint, 'join: thirteen people are on the roster');
select is((select count(*) from public.roster where list = 'waitlist'), 13::bigint, 'join: every joiner lands on the waitlist');
select is((select array_agg(p.display_name order by r.position) from public.roster r join public.people p on p.id = r.person_id),
  array['P11','P12','P13','P14','P15','P16','P17','P18','P19','P20','P21','P22','Test Admin'], 'join: the waitlist is in join order');

select pg_temp.as_user(12);
select lives_ok($$select public.join_league(pg_temp.sid())$$, 'join: joining twice does not fail');
select pg_temp.as_owner();
select is((select count(*) from public.roster r join public.people p on p.id = r.person_id where p.display_name = 'P12'), 1::bigint, 'join: joining twice leaves one entry');
select is((select position from public.roster r join public.people p on p.id = r.person_id where p.display_name = 'P12'), 2, 'join: joining twice keeps the place');
select pg_temp.as_user(12);
select is((select public.whoami() -> 'roles'), '["viewer", "prospect"]'::jsonb, 'join: whoami roles are viewer and prospect');
select pg_temp.as_user(1);
select is((select public.whoami() -> 'roles'), '["viewer", "prospect", "admin"]'::jsonb, 'join: an admin who joined holds viewer, prospect and admin');

-- 6. Admin: settings before the roster can be filled -----------------------------
select pg_temp.as_user(1);
select throws_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P11'), 'league')$$, '55000',
  'Set the capacity on the Season page before filling the league list.', 'admin: the league list cannot be filled before capacity is set');
select pg_temp.as_user(11);
select throws_ok($$select public.save_ranked_list(pg_temp.sid(), '{cats}')$$, '22023', 'The faction pool has not been set yet.', 'prospect: no list can be saved before the pool is set');

select pg_temp.as_user(1);
select is((select (public.season_save(pg_temp.sid(), 'Season 1', 12, 3, '{" Lake ",Mountain,Gnome,Fall}',
  '{cats,rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() + interval '10 days')).capacity), 12, 'admin: season_save stores a valid pair');
select is((select maps from public.seasons where id = pg_temp.sid()), array['Lake','Mountain','Gnome','Fall'], 'admin: map names are trimmed and kept in order');
select is((select cardinality(faction_pool) from public.seasons where id = pg_temp.sid()), 8, 'admin: the pool is stored');
select is((select lists_lock_at from public.seasons where id = pg_temp.sid()), (select now() + interval '10 days'), 'admin: the lock date is stored as a timestamp');
select is((select stage from public.season_stage where season_id = pg_temp.sid()), 'open', 'admin: a future lock date leaves the season open');

-- 7. Prospect lists and decision 27 ------------------------------------------------
select pg_temp.as_user(12);
select lives_ok($$select public.save_ranked_list(pg_temp.sid(), '{cats,rats}')$$, 'prospect: a list below the minimum saves');
select is((select list_in from public.roster_public where is_me), false, 'prospect: a list below the minimum is not submitted');
select throws_ok($$select public.save_ranked_list(pg_temp.sid(), '{cats,cats}')$$, '22023', 'Each faction can be on the list once only: "cats" is repeated.', 'prospect: a repeated faction is refused');
select throws_ok($$select public.save_ranked_list(pg_temp.sid(), '{cats,lizards}')$$, '22023', '"lizards" is not in this season''s faction pool.', 'prospect: a faction outside the pool is refused');
select throws_ok($$select public.save_ranked_list(pg_temp.sid(), '{cats,""}')$$, '22023', 'The list has an empty entry.', 'prospect: an empty entry is refused');
select lives_ok($$select public.save_ranked_list(pg_temp.sid(), '{rats,cats,badgers}')$$, 'prospect: a list that reaches the minimum saves');
select is((select list_in from public.roster_public where is_me), true, 'prospect: reaching the minimum submits the list');
select is((select ranked_factions from public.roster_public where is_me), array['rats','cats','badgers'], 'prospect: the owner reads their own ranked list, in order');

select pg_temp.as_user(13);
select lives_ok($$select public.save_ranked_list(pg_temp.sid(), '{moles,birds,frogs}')$$, 'prospect: a second prospect saves a list');

-- Another viewer, before the lock
select pg_temp.as_user(2);
select is((select count(*) from public.roster_public), 13::bigint, 'visibility: a viewer sees every name');
select is((select list_in from public.roster_public where display_name = 'P12'), true, 'visibility: a viewer sees that a list is in');
select is((select ranked_factions from public.roster_public where display_name = 'P12'), null, 'visibility: a viewer cannot read a prospect''s ranked factions before the lock');
select is((select count(*) from public.roster_public where ranked_factions is not null), 0::bigint, 'visibility: a viewer reads no ranked list at all before the lock');
select is((select count(*) from public.roster), 0::bigint, 'visibility: the roster table gives a viewer no row, so no list by that route either');
select is((select count(*) from public.roster_public where list is not null or "position" is not null or joined_at is not null), 0::bigint,
  'visibility: roster_public never shows list, position or join time to a viewer');
select is((select list_flagged from public.roster_public where display_name = 'P12'), null, 'visibility: a viewer cannot see another person''s flag');

-- Another prospect, before the lock
select pg_temp.as_user(13);
select is((select ranked_factions from public.roster_public where display_name = 'P12'), null, 'visibility: another prospect cannot read a list before the lock');
select is((select ranked_factions from public.roster_public where is_me), array['moles','birds','frogs'], 'visibility: a prospect reads their own list');
select is((select count(*) from public.roster_public where list is not null), 0::bigint, 'visibility: a prospect never sees which list anyone is on, themselves included');
select is((select count(*) from public.roster), 0::bigint, 'visibility: the roster table gives a prospect no row');
select throws_ok($$select public.season_save(pg_temp.sid(), 'X')$$, '42501', 'Only an admin can do this.', 'prospect: season_save is refused');
select throws_ok($$select public.roster_move(pg_temp.sid(), pg_temp.u(13), 'league')$$, '42501', 'Only an admin can do this.', 'prospect: roster_move is refused');
select throws_ok($$select public.roster_swap(pg_temp.sid(), pg_temp.u(13), pg_temp.u(12))$$, '42501', 'Only an admin can do this.', 'prospect: roster_swap is refused');
select throws_ok($$select public.roster_add(pg_temp.sid(), 'X')$$, '42501', 'Only an admin can do this.', 'prospect: roster_add is refused');
select throws_ok($$select public.roster_remove(pg_temp.sid(), pg_temp.u(12))$$, '42501', 'Only an admin can do this.', 'prospect: roster_remove is refused');
select throws_ok($$select public.roster_set_list(pg_temp.sid(), pg_temp.u(12), '{cats}')$$, '42501', 'Only an admin can do this.', 'prospect: roster_set_list is refused, so no one edits another list');
select throws_ok($$update public.roster set ranked_factions = '{cats}'$$, '42501', null, 'prospect: no direct edit of a list');

-- The admin sees everything
select pg_temp.as_user(1);
select is((select ranked_factions from public.roster_public where display_name = 'P12'), array['rats','cats','badgers'], 'visibility: the admin reads any list before the lock');
select is((select count(*) from public.roster_public where list = 'waitlist' and "position" is not null), 13::bigint, 'visibility: the admin sees the list and place of everyone');
select is((select count(*) from public.roster), 13::bigint, 'visibility: the admin reads the roster table');

-- 8. Roster moves -------------------------------------------------------------------
select pg_temp.as_user(1);
select lives_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P11'), 'league')$$, 'roster: the admin moves a person to the league list');
select lives_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid(n), 'league') from (values ('P12'),('P13'),('P14'),('P15'),('P16'),('P17'),('P18'),('P19'),('P20')) v(n)$$, 'roster: nine more people move to the league list');
select is((select count(*) from public.roster where list = 'league'), 10::bigint, 'roster: ten people are on the league list');
select is((select array_agg(position order by position) from public.roster where list = 'league'), array[1,2,3,4,5,6,7,8,9,10], 'roster: league positions run 1 to 10');
select is((select array_agg(position order by position) from public.roster where list = 'waitlist'), array[1,2,3], 'roster: the waitlist closes the gaps behind people who left it');
select is((select array_agg(p.display_name order by r.position) from public.roster r join public.people p on p.id = r.person_id where r.list = 'waitlist'),
  array['P21','P22','Test Admin'], 'roster: the waitlist keeps its join order');
select throws_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 8, 3, '{Lake,Mountain,Gnome,Fall}', '{cats,rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() + interval '10 days')$$,
  '55000', 'Capacity 8 is below the 10 people on the league list. Move people to the waitlist first.', 'roster: capacity below the league list is refused with the move-people message');
select is((select capacity from public.seasons where id = pg_temp.sid()), 12, 'roster: the refused capacity change changed nothing');
select lives_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 10, 4, '{Lake,Mountain,Gnome,Fall}', '{cats,rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() + interval '10 days')$$,
  'roster: capacity equal to the league list count is allowed');
select throws_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P21'), 'league')$$, '55000',
  'The league list is full (10 of 10). Move someone off first, or swap two people.', 'roster: a drop onto a full league list is refused');
select is((select list from public.roster where person_id = pg_temp.pid('P21')), 'waitlist', 'roster: the refused drop left the person where they were');
select lives_ok($$select public.roster_swap(pg_temp.sid(), pg_temp.pid('P21'), pg_temp.pid('P11'))$$, 'roster: a swap onto a full league list is allowed');
select is((select list || position::text from public.roster where person_id = pg_temp.pid('P21')), 'league1', 'roster: the swap puts the waitlisted person in the other''s league place');
select is((select list || position::text from public.roster where person_id = pg_temp.pid('P11')), 'waitlist1', 'roster: the swap puts the league person in the other''s waitlist place');
select is((select count(*) from public.roster where list = 'league'), 10::bigint, 'roster: a swap keeps the league list count');
select throws_ok($$select public.roster_swap(pg_temp.sid(), pg_temp.pid('P21'), pg_temp.pid('P21'))$$, '22023', 'Pick two different people to swap.', 'roster: swapping a person with themselves is refused');
select lives_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P20'), 'league', 1)$$, 'roster: a person moves within the league list');
select is((select array_agg(p.display_name order by r.position) from public.roster r join public.people p on p.id = r.person_id where r.list = 'league'),
  array['P20','P21','P12','P13','P14','P15','P16','P17','P18','P19'], 'roster: a reorder shifts everyone behind it');
select lives_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P12'), 'league', 99)$$, 'roster: a position past the end puts the person last');
select is((select position from public.roster where person_id = pg_temp.pid('P12')), 10, 'roster: the position is clamped to the end');
select lives_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('Test Admin'), 'waitlist', 1)$$, 'roster: the waitlist can be reordered');
select is((select array_agg(p.display_name order by r.position) from public.roster r join public.people p on p.id = r.person_id where r.list = 'waitlist'),
  array['Test Admin','P11','P22'], 'roster: a waitlist reorder keeps the rest in order');
select throws_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P11'), 'bench')$$, '22023', 'Move to the league list or the waitlist.', 'roster: an unknown list is refused');
select throws_ok($$select public.roster_move(pg_temp.sid(), pg_temp.u(2), 'waitlist')$$, 'P0002', 'That person is not on the roster.', 'roster: moving someone who is not on the roster is refused');

-- Admin-added people
select is((select public.roster_add(pg_temp.sid(), '  New Name ') is not null), true, 'add: the admin adds a person by name');
select is((select list || position::text from public.roster r join public.people p on p.id = r.person_id where p.display_name = 'New Name'), 'waitlist4', 'add: the new person goes to the end of the waitlist');
select throws_ok($$select public.roster_add(pg_temp.sid(), 'new name')$$, '23505', 'new name is already on the roster.', 'add: a name already on the roster is refused, ignoring case');
select throws_ok($$select public.roster_add(pg_temp.sid(), '   ')$$, '22023', 'Give the person a name.', 'add: a blank name is refused');
select throws_ok($$select public.roster_add(pg_temp.sid(), 'Someone', 'league')$$, '55000',
  'The league list is full (10 of 10). Move someone off first, or swap two people.', 'add: adding to a full league list is refused');
select throws_ok($$select public.roster_add(pg_temp.sid(), 'Someone', 'bench')$$, '22023', 'Add to the league list or the waitlist.', 'add: an unknown list is refused');
select is((select public.roster_add(pg_temp.sid(), 'returning')), (select id from public.people where seed_key = 'returning'), 'add: an existing person of that name is reused');
select is((select count(*) from public.people where lower(display_name) = 'returning'), 1::bigint, 'add: reusing a person adds no duplicate');
select lives_ok($$select public.roster_remove(pg_temp.sid(), pg_temp.pid('New Name'))$$, 'remove: the admin removes a person from the roster');
select is((select count(*) from public.people where display_name = 'New Name'), 1::bigint, 'remove: the person row stays');
select is((select array_agg(position order by position) from public.roster where list = 'waitlist'), array[1,2,3,4], 'remove: the waitlist closes the gap');
select throws_ok($$select public.roster_remove(pg_temp.sid(), pg_temp.pid('New Name'))$$, 'P0002', 'That person is not on the roster.', 'remove: removing someone who is not on the roster is refused');
select lives_ok($$select public.roster_remove(pg_temp.sid(), pg_temp.pid('Returning'))$$, 'remove: the returning person leaves again');

-- 9. The lock date -------------------------------------------------------------------
select pg_temp.as_user(12);
select lives_ok($$select public.save_ranked_list(pg_temp.sid(), '{rats,cats,badgers,moles}')$$, 'lock: a player edits their list before the lock');

select pg_temp.as_user(1);
select lives_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 10, 4, '{Lake,Mountain,Gnome,Fall}', '{cats,rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() - interval '1 hour')$$,
  'lock: the admin moves the lock date into the past');
select is((select stage from public.season_stage where season_id = pg_temp.sid()), 'locked', 'lock: an earlier date locks at once');

select pg_temp.as_user(12);
select throws_ok($$select public.save_ranked_list(pg_temp.sid(), '{rats,cats}')$$, '55000', 'Lists are locked. Ask the admin to change yours.', 'lock: a player cannot edit their list after the lock');
select is((select ranked_factions from public.roster_public where is_me), array['rats','cats','badgers','moles'], 'lock: the refused edit changed nothing');
select throws_ok($$select public.leave_league(null)$$, 'P0002', 'That season does not exist.', 'lock: an unknown season is refused');

select pg_temp.as_user(4);
select throws_ok($$select public.join_league(pg_temp.sid())$$, '55000', 'Joining is closed: lists have locked.', 'lock: joining after the lock is refused');
select pg_temp.as_owner();
select is((select count(*) from public.roster r join public.people p on p.id = r.person_id where p.auth_user_id = pg_temp.u(4)), 0::bigint, 'lock: a refused join leaves no roster entry');
select is((select count(*) from public.people where auth_user_id = pg_temp.u(4)), 0::bigint, 'lock: a refused join leaves no person row either');

-- Lists are public to viewers from the lock on (decision 27)
select pg_temp.as_user(2);
select is((select ranked_factions from public.roster_public where display_name = 'P12'), array['rats','cats','badgers','moles'], 'lock: after the lock another viewer reads the list');
select is((select count(*) from public.roster_public where ranked_factions is not null), 13::bigint, 'lock: after the lock every list reads, empty ones included');
select is((select count(*) from public.roster_public where list is not null), 0::bigint, 'lock: after the lock roster_public still hides league and waitlist from a viewer');
select pg_temp.as_user(13);
select is((select ranked_factions from public.roster_public where display_name = 'P12'), array['rats','cats','badgers','moles'], 'lock: after the lock another prospect reads the list');
select is((select count(*) from public.roster_public where list is not null or "position" is not null), 0::bigint, 'lock: after the lock a prospect still cannot see which list anyone is on');

select pg_temp.as_user(1);
select lives_ok($$select public.roster_set_list(pg_temp.sid(), pg_temp.pid('P12'), '{badgers,rats,cats}')$$, 'lock: the admin edits a player''s list after the lock');
select is((select ranked_factions from public.roster_public where display_name = 'P12'), array['badgers','rats','cats'], 'lock: the admin''s edit is saved');
select lives_ok($$select public.save_ranked_list(pg_temp.sid(), '{vagabond,otters,frogs}')$$, 'lock: the admin edits their own list after the lock');
select lives_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P22'), 'waitlist', 1)$$, 'lock: the admin can still move people while locked');
select throws_ok($$select public.roster_set_list(pg_temp.sid(), pg_temp.pid('P12'), '{badgers,wolves}')$$, '22023', '"wolves" is not in this season''s faction pool.', 'lock: the admin''s list edit still checks the pool');
select throws_ok($$select public.roster_set_list(pg_temp.sid(), pg_temp.u(2), '{cats}')$$, 'P0002', 'That person is not on the roster.', 'lock: the admin''s list edit needs a person on the roster');

select pg_temp.as_anon();
select throws_ok($$select * from public.roster_public$$, '42501', null, 'lock: signed out still reads nothing after the lock');

-- Moving the date later unlocks and hides the lists again, while not started
select pg_temp.as_user(1);
select lives_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 10, 4, '{Lake,Mountain,Gnome,Fall}', '{cats,rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() + interval '5 days')$$,
  'lock: the admin moves the lock date into the future');
select is((select stage from public.season_stage where season_id = pg_temp.sid()), 'open', 'lock: a later date unlocks while the season has not started');
select pg_temp.as_user(12);
select lives_ok($$select public.save_ranked_list(pg_temp.sid(), '{rats,cats,badgers,moles}')$$, 'lock: a player can edit again once the date moves later');
select pg_temp.as_user(2);
select is((select count(*) from public.roster_public where ranked_factions is not null), 0::bigint, 'lock: unlocking hides every list from a viewer again');
select pg_temp.as_user(13);
select is((select ranked_factions from public.roster_public where display_name = 'P12'), null, 'lock: unlocking hides another prospect''s list again');
select is((select ranked_factions from public.roster_public where is_me), array['moles','birds','frogs'], 'lock: unlocking leaves the owner their own list');

-- 10. A pool or minimum change flags lists instead of deleting them ------------
select pg_temp.as_user(1);
select throws_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 10, 4, '{Lake,Mountain,Gnome,Fall}', '{cats,rats}', 3, now() + interval '5 days')$$, '22023',
  'The minimum list length (3) is longer than the faction pool (2).', 'flag: a pool shorter than the minimum is refused');
select lives_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 10, 4, '{Lake,Mountain,Gnome,Fall}', '{rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() + interval '5 days')$$,
  'flag: the admin removes cats from the pool');
select is((select list_flagged from public.roster where person_id = pg_temp.pid('P12')), true, 'flag: a list holding a removed faction is flagged');
select is((select ranked_factions from public.roster where person_id = pg_temp.pid('P12')), array['rats','cats','badgers','moles'], 'flag: the flagged list is kept, not deleted');
select is((select list_submitted from public.roster where person_id = pg_temp.pid('P12')), false, 'flag: a flagged list is no longer submitted');
select is((select list_flagged from public.roster where person_id = pg_temp.pid('P13')), false, 'flag: a list that still fits is not flagged');
select is((select list_submitted from public.roster where person_id = pg_temp.pid('P13')), true, 'flag: a list that still fits stays submitted');
select is((select list_flagged from public.roster_public where display_name = 'P12'), true, 'flag: the admin sees the flag');
select pg_temp.as_user(12);
select is((select list_flagged from public.roster_public where is_me), true, 'flag: the owner sees the flag');
select pg_temp.as_user(13);
select is((select list_flagged from public.roster_public where display_name = 'P12'), null, 'flag: another player does not see it');
select pg_temp.as_user(12);
select lives_ok($$select public.save_ranked_list(pg_temp.sid(), '{rats,badgers,moles}')$$, 'flag: the owner fixes the list');
select is((select list_flagged || ',' || list_in from public.roster_public where is_me), 'false,true', 'flag: a valid save clears the flag and submits again');

select pg_temp.as_user(1);
select lives_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 10, 4, '{Lake,Mountain,Gnome,Fall}', '{rats,badgers,moles,birds,frogs,otters,vagabond}', 4, now() + interval '5 days')$$,
  'flag: the admin raises the minimum length to 4');
select is((select list_submitted from public.roster where person_id = pg_temp.pid('P12')), false, 'flag: a list below the new minimum is no longer submitted');
select is((select list_flagged from public.roster where person_id = pg_temp.pid('P12')), false, 'flag: a short list is not flagged, only un-submitted');
select lives_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 10, 4, '{Lake,Mountain,Gnome,Fall}', '{rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() + interval '5 days')$$,
  'flag: the admin lowers the minimum again');
select is((select list_submitted from public.roster where person_id = pg_temp.pid('P12')), false, 'flag: lowering the minimum does not submit a list for the player');

-- 11. Leaving ---------------------------------------------------------------------------
select pg_temp.as_user(13);
select lives_ok($$select public.leave_league(pg_temp.sid())$$, 'leave: a prospect leaves before the season starts');
select is((select count(*) from public.roster_public where is_me), 0::bigint, 'leave: they are off the roster');
select pg_temp.as_owner();
select is((select count(*) from public.roster where person_id = pg_temp.pid('P13')), 0::bigint, 'leave: the roster row and its list are gone');
select is((select array_agg(position order by position) from public.roster where list = 'league'), array[1,2,3,4,5,6,7,8,9], 'leave: the league list closes the gap');
select pg_temp.as_user(13);
select is((select public.whoami() -> 'roles'), '["viewer"]'::jsonb, 'leave: whoami drops the prospect role');
select lives_ok($$select public.join_league(pg_temp.sid())$$, 'leave: the person can rejoin while open');
select is((select ranked_factions from public.roster_public where is_me), '{}'::text[], 'leave: a rejoined person starts with an empty list');
select is((select list_in from public.roster_public where is_me), false, 'leave: a rejoined person has no submitted list');
select pg_temp.as_owner();
select is((select list || position::text from public.roster where person_id = pg_temp.pid('P13')), 'waitlist4', 'leave: a rejoined person goes to the end of the waitlist');

-- 12. Starting the season (set directly; D3's publish_pairings does this) --------
select pg_temp.as_owner();
update public.seasons set started_at = now() where id = pg_temp.sid();

select pg_temp.as_user(2);
select is((select stage from public.season_stage), 'live', 'start: season_stage reads live');
select pg_temp.as_user(4);
select throws_ok($$select public.join_league(pg_temp.sid())$$, '55000', 'Joining is closed: the season has started.', 'start: joining is refused');
select pg_temp.as_user(12);
select throws_ok($$select public.leave_league(pg_temp.sid())$$, '55000', 'The season has started, so you cannot leave. Ask the admin to replace you.', 'start: leaving is refused');
select throws_ok($$select public.save_ranked_list(pg_temp.sid(), '{rats,badgers,moles}')$$, '55000', 'Lists are locked. Ask the admin to change yours.', 'start: a player cannot edit their list');
select is((select public.whoami() -> 'roles'), '["viewer", "league_player"]'::jsonb, 'start: whoami says league player for someone on the league list');
select pg_temp.as_user(22);
select is((select public.whoami() -> 'roles'), '["viewer", "prospect"]'::jsonb, 'start: someone left on the waitlist stays a prospect');
select pg_temp.as_user(1);
select is((select public.whoami() -> 'roles'), '["viewer", "prospect", "admin"]'::jsonb, 'start: an admin on the waitlist keeps prospect and admin');
select throws_ok($$select public.roster_move(pg_temp.sid(), pg_temp.pid('P22'), 'league')$$, '55000', 'The roster is closed: the season has started. Replace a player on Fix it.', 'start: roster_move is refused');
select throws_ok($$select public.roster_swap(pg_temp.sid(), pg_temp.pid('P22'), pg_temp.pid('P12'))$$, '55000', 'The roster is closed: the season has started. Replace a player on Fix it.', 'start: roster_swap is refused');
select throws_ok($$select public.roster_add(pg_temp.sid(), 'Another')$$, '55000', 'The roster is closed: the season has started. Replace a player on Fix it.', 'start: roster_add is refused');
select throws_ok($$select public.roster_remove(pg_temp.sid(), pg_temp.pid('P22'))$$, '55000', 'The roster is closed: the season has started. Replace a player on Fix it.', 'start: roster_remove is refused');
select throws_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 12, 3, '{Lake,Mountain,Gnome,Fall}', '{rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() + interval '5 days')$$,
  '55000', 'Capacity and games each are locked once the season has started. Use Fix it.', 'start: capacity and games each are locked');
select throws_ok($$select public.season_save(pg_temp.sid(), 'Season 1', 10, 4, '{Lake,Mountain,Gnome,Fall,Vale}', '{rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() + interval '5 days')$$,
  '55000', 'The number of maps is locked once the season has started. Use Fix it.', 'start: the number of maps is locked');
select lives_ok($$select public.season_save(pg_temp.sid(), 'Season One', 10, 4, '{Lake,Mountain,Gnome,Vale}', '{rats,badgers,moles,birds,frogs,otters,vagabond}', 3, now() + interval '5 days')$$,
  'start: the name and map names can still change');
select is((select stage from public.season_stage where season_id = pg_temp.sid()), 'live', 'start: a later lock date no longer unlocks anything');
select lives_ok($$select public.roster_set_list(pg_temp.sid(), pg_temp.pid('P12'), '{rats,badgers,moles,birds}')$$, 'start: the admin can still edit any list');
select pg_temp.as_user(12);
select is((select ranked_factions from public.roster_public where display_name = 'P14'), '{}'::text[], 'start: lists stay readable once the season is live');
select is((select count(*) from public.roster_public where list is not null), 0::bigint, 'start: roster_public still hides the list from a league player');

-- 13. A second season takes over as current -------------------------------------------
select pg_temp.as_user(1);
select is((select (public.season_create('Season 1')).slug), 'season-1-2', 'second season: a repeated name gets a numbered slug');
reset role;
update ctx set sid2 = (select id from public.seasons where slug = 'season-1-2');
select pg_temp.as_user(1);
select is((select count(*) from public.seasons where is_current), 1::bigint, 'second season: only one season is current');
select is((select is_current from public.seasons where id = pg_temp.sid()), false, 'second season: the old season is kept and no longer current');
select pg_temp.as_user(4);
select throws_ok($$select public.join_league(pg_temp.sid())$$, '55000', 'Joining is only open for the current season.', 'second season: joining the old season is refused');
select lives_ok($$select public.join_league((select sid2 from ctx))$$, 'second season: joining the new season works');
select is((select public.whoami() -> 'roles'), '["viewer", "prospect"]'::jsonb, 'second season: the roles follow the current season');
select pg_temp.as_user(12);
select is((select public.whoami() -> 'roles'), '["viewer"]'::jsonb, 'second season: a league player of the old season holds no role in the new one');

-- 14. The log -----------------------------------------------------------------------------
select pg_temp.as_owner();
select is((select count(*) from public.edit_log where table_name = 'roster' and action = 'insert'
            and new ->> 'person_id' = pg_temp.pid('P12')::text and actor_person_id = pg_temp.pid('P12')), 1::bigint,
  'log: a join is logged with the joiner as the actor');
select is((select count(*) from public.edit_log where table_name = 'roster' and action = 'update'
            and row_key = pg_temp.sid()::text || ',' || pg_temp.pid('P11')::text
            and old ->> 'list' = 'league' and new ->> 'list' = 'waitlist'
            and actor_person_id = pg_temp.pid('Test Admin')), 1::bigint,
  'log: a swap is logged with old and new list and the admin as the actor');
select is((select count(*) from public.edit_log where table_name = 'seasons' and action = 'update'
            and row_key = pg_temp.sid()::text and old ->> 'capacity' = '12' and new ->> 'capacity' = '10'
            and actor_person_id = pg_temp.pid('Test Admin')), 1::bigint,
  'log: a settings change is logged with old and new values');
select is((select count(*) from public.edit_log where table_name = 'seasons' and action = 'insert' and new ->> 'slug' = 'season-1'), 1::bigint, 'log: creating a season is logged');
select is((select count(*) from public.edit_log where table_name = 'roster' and action = 'delete' and old ->> 'person_id' = pg_temp.pid('P13')::text), 1::bigint,
  'log: leaving is logged with the old row');
select is((select count(*) from public.edit_log where table_name = 'roster' and action = 'update'
            and old ->> 'list_flagged' = 'false' and new ->> 'list_flagged' = 'true'), 1::bigint, 'log: a flag set by a pool change is logged');

select * from finish();

rollback;
