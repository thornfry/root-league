-- D6: Fix it and the CSV league state (stories 10, 11, 13; decisions 42, 45).
-- Every function is admin only and every change leaves an edit_log row. The
-- import is all or nothing. No fixture depends on seed.sql. The whole file runs in
-- one transaction that is rolled back.
--
-- People: 1 admin; 2 to 5 seated at games 100 and 101; 6 league player not seated;
-- 7 waitlisted; 8 viewer; 9 signed in but not invited; 10 a seeded name with no
-- sign-in; 11 the empty duplicate a sign-in created; 12 and 13 waitlisted;
-- 14 a person with no sign-in and no roster place.
begin;
select plan(319);

-- The results of calls that may fail: name, result, sqlstate, message, detail.
create temp table res (name text primary key, r jsonb, st text, msg text, det text);
create temp table exp (j jsonb);
grant all on all tables in schema pg_temp to anon, authenticated, service_role;
grant all on all sequences in schema pg_temp to anon, authenticated, service_role;

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('d6000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.disc(n integer) returns text language sql immutable as $$
  select (960000000000000000::bigint + n)::text
$$;
create function pg_temp.act_as(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.id(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;

-- Runs a query that returns one jsonb value (or none), keeping the value or the
-- error under a name.
create function pg_temp.run(n text, q text) returns void language plpgsql as $$
declare v jsonb; m text; d text;
begin
  execute q into v;
  insert into res values (n, v, null, null, null);
exception when others then
  get stacked diagnostics m = message_text, d = pg_exception_detail;
  insert into res values (n, null, sqlstate, m, d);
end $$;
create function pg_temp.r(n text) returns jsonb language sql as $$ select r from res where name = n $$;
create function pg_temp.st(n text) returns text language sql as $$ select st from res where name = n $$;
create function pg_temp.msg(n text) returns text language sql as $$ select msg from res where name = n $$;
create function pg_temp.det(n text) returns jsonb language sql as $$ select det::jsonb from res where name = n $$;
-- The SQLSTATE a statement raises, or 'ok'.
create function pg_temp.state(q text) returns text language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlstate;
end $$;

-- A checksum of everything an import can write, so "changes nothing" is exact.
create function pg_temp.snap() returns text language sql as $$
  select md5(concat_ws('~',
    (select string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text) from public.people t),
    (select string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text) from public.seasons t),
    (select string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text) from public.roster t),
    (select string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text) from public.games t),
    (select string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text) from public.game_seats t),
    (select string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text) from public.submissions t),
    (select string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text) from public.settlements t),
    (select string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text) from public.picks t)))
$$;

-- Edits to an export (file -> { columns, rows }): change the rows that contain m,
-- drop them, add one, or drop a column from every row.
create function pg_temp.map_rows(j jsonb, f text, m jsonb, patch jsonb) returns jsonb language sql as $$
  select jsonb_set(j, array[f, 'rows'], coalesce((
    select jsonb_agg(case when r @> m then r || patch else r end order by o)
      from jsonb_array_elements(j -> f -> 'rows') with ordinality x (r, o)), '[]'::jsonb))
$$;
create function pg_temp.drop_rows(j jsonb, f text, m jsonb) returns jsonb language sql as $$
  select jsonb_set(j, array[f, 'rows'], coalesce((
    select jsonb_agg(r order by o)
      from jsonb_array_elements(j -> f -> 'rows') with ordinality x (r, o)
     where not r @> m), '[]'::jsonb))
$$;
create function pg_temp.add_row(j jsonb, f text, newrow jsonb) returns jsonb language sql as $$
  select jsonb_set(j, array[f, 'rows'], (j -> f -> 'rows') || jsonb_build_array(newrow))
$$;
create function pg_temp.drop_col(j jsonb, f text, col text) returns jsonb language sql as $$
  select jsonb_set(j, array[f, 'rows'], coalesce((
    select jsonb_agg(r - col order by o)
      from jsonb_array_elements(j -> f -> 'rows') with ordinality x (r, o)), '[]'::jsonb))
$$;
create function pg_temp.row_no(j jsonb, f text, m jsonb) returns bigint language sql as $$
  select o from jsonb_array_elements(j -> f -> 'rows') with ordinality x (r, o) where r @> m
$$;

-- Fixtures (as postgres) --------------------------------------------------------
insert into public.app_config (key, value) values ('dev_signin', 'on')
on conflict (key) do update set value = 'on';
insert into auth.users (id, email)
  select pg_temp.id(n), pg_temp.disc(n) || '@dev.invalid' from generate_series(1, 11) n;
insert into public.people (id, auth_user_id, display_name, discord_id)
  select pg_temp.id(n), pg_temp.id(n), 'D6 ' || n, pg_temp.disc(n) from generate_series(1, 8) n;
insert into public.people (id, display_name, seed_key) values (pg_temp.id(10), 'Sam', 'sam');
insert into public.people (id, auth_user_id, display_name, discord_id)
  values (pg_temp.id(11), pg_temp.id(11), 'Sam (sign-in)', pg_temp.disc(11));
insert into public.people (id, display_name) values
  (pg_temp.id(12), 'D6 12'), (pg_temp.id(13), 'D6 13'), (pg_temp.id(14), 'D6 14');
insert into public.whitelist (discord_id, label, is_admin, added_by)
  select pg_temp.disc(n), 'D6 ' || n, n = 1, case when n = 7 then pg_temp.id(11) end
    from generate_series(1, 8) n;
insert into public.whitelist (discord_id, label) values (pg_temp.disc(11), 'Sam');

insert into public.seasons (id, slug, name, is_current, capacity, games_each, maps, faction_pool,
                            min_list_length, lists_lock_at, started_at, seed)
values (pg_temp.id(90), 'd6-main', 'D6 Main', true, 8, 2, '{a,b}',
        array['cats','rats','badgers','moles','birds','frogs','otters','vagabond','knaves','bats','crows','WA','lizards'],
        3, now() - interval '2 days', now() - interval '1 day', 'seed');
insert into public.seasons (id, slug, name) values (pg_temp.id(91), 'd6-other', 'D6 Other');

insert into public.roster (season_id, person_id, list, position, ranked_factions, list_submitted, player_number) values
  (pg_temp.id(90), pg_temp.id(2), 'league', 1, '{cats,rats,birds}', true, 1),
  (pg_temp.id(90), pg_temp.id(3), 'league', 2, '{otters,birds,cats}', true, 2),
  (pg_temp.id(90), pg_temp.id(4), 'league', 3, '{vagabond,bats,rats}', true, 3),
  (pg_temp.id(90), pg_temp.id(5), 'league', 4, '{lizards,knaves,otters}', true, 4),
  (pg_temp.id(90), pg_temp.id(6), 'league', 5, '{cats,rats,birds}', true, 5);
insert into public.roster (season_id, person_id, list, position, ranked_factions, list_submitted) values
  (pg_temp.id(90), pg_temp.id(7), 'waitlist', 1, '{}', false),
  (pg_temp.id(90), pg_temp.id(12), 'waitlist', 2, '{otters,knaves,bats}', true),
  (pg_temp.id(90), pg_temp.id(13), 'waitlist', 3, '{}', false);

insert into public.games (id, season_id, game_no, map_index) values
  (pg_temp.id(100), pg_temp.id(90), 1, 0), (pg_temp.id(101), pg_temp.id(90), 2, 1),
  (pg_temp.id(102), pg_temp.id(91), 1, 0);
insert into public.game_seats (game_id, seat, person_id, faction) values
  (pg_temp.id(100), 1, pg_temp.id(2), 'cats'), (pg_temp.id(100), 2, pg_temp.id(3), 'otters'),
  (pg_temp.id(100), 3, pg_temp.id(4), 'vagabond'), (pg_temp.id(100), 4, pg_temp.id(5), 'lizards'),
  (pg_temp.id(101), 1, pg_temp.id(3), 'birds'), (pg_temp.id(101), 2, pg_temp.id(2), 'rats'),
  (pg_temp.id(101), 3, pg_temp.id(5), 'knaves'), (pg_temp.id(101), 4, pg_temp.id(4), 'bats'),
  (pg_temp.id(102), 1, pg_temp.id(2), 'cats'), (pg_temp.id(102), 2, pg_temp.id(3), 'rats'),
  (pg_temp.id(102), 3, pg_temp.id(4), 'birds'), (pg_temp.id(102), 4, pg_temp.id(5), 'otters');
insert into public.submissions (game_id, person_id, winners) values
  (pg_temp.id(100), pg_temp.id(2), array[pg_temp.id(3)]),
  (pg_temp.id(100), pg_temp.id(3), array[pg_temp.id(3)]),
  (pg_temp.id(100), pg_temp.id(13), array[pg_temp.id(2)]),
  (pg_temp.id(101), pg_temp.id(5), array[pg_temp.id(5)]);
insert into public.settlements (game_id, winners, settled_by)
  values (pg_temp.id(101), array[pg_temp.id(3)], pg_temp.id(1));
insert into public.picks (game_id, person_id, first_pick, second_pick) values
  (pg_temp.id(100), pg_temp.id(6), pg_temp.id(3), pg_temp.id(4)),
  (pg_temp.id(100), pg_temp.id(8), pg_temp.id(13), pg_temp.id(2)),
  (pg_temp.id(100), pg_temp.id(12), pg_temp.id(2), null),
  (pg_temp.id(100), pg_temp.id(13), pg_temp.id(2), null),
  (pg_temp.id(101), pg_temp.id(6), pg_temp.id(3), pg_temp.id(5)),
  (pg_temp.id(101), pg_temp.id(8), pg_temp.id(3), pg_temp.id(12)),
  (pg_temp.id(101), pg_temp.id(13), pg_temp.id(4), pg_temp.id(5)),
  (pg_temp.id(101), pg_temp.id(7), pg_temp.id(2), null);

create temp table baseline as select coalesce(max(id), 0) as last_id from public.edit_log;
grant select on baseline to anon, authenticated;

-- 1. The catalog: every function is admin only and callable by no one else --------
select is((select count(*) from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('fixit_update', 'fixit_insert', 'fixit_delete', 'fixit_delete_preview',
                                'fixit_warnings', 'link_person', 'replace_player',
                                'export_league_state', 'import_league_state')),
  9::bigint, 'catalog: the nine Fix it and CSV functions exist');
select is((select count(*) from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('fixit_update', 'fixit_insert', 'fixit_delete', 'fixit_delete_preview',
                                'fixit_warnings', 'link_person', 'replace_player',
                                'export_league_state', 'import_league_state')
              and (p.prosrc not like '%perform app.require_admin();%'
                   or not p.prosecdef
                   or has_function_privilege('anon', p.oid, 'EXECUTE')
                   or not has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  0::bigint, 'catalog: each starts with the admin check, is security definer, is refused to anon and granted to authenticated');
select is((select count(*) from pg_proc p
            where p.pronamespace = 'app'::regnamespace
              and p.proname in ('fixit_spec', 'import_spec', 'typed_cell', 'fixit_typed', 'db_problem',
                                'raise_db_problem', 'game_warnings', 'row_warnings', 'fixit_dependents',
                                'replace_in_game', 'csv_text', 'csv_raw', 'problem_column', 'err_add',
                                'import_fail', 'import_exec', 'import_apply')
              and (has_function_privilege('anon', p.oid, 'EXECUTE')
                   or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  0::bigint, 'catalog: the helpers behind them are callable by no client role');
select is((select count(*) from app.fixit_spec() s
            where not exists (select 1 from pg_trigger t
                               where t.tgrelid = ('public.' || s.tbl)::regclass
                                 and t.tgfoid = 'app.audit_row'::regproc)),
  0::bigint, 'catalog: every table Fix it can change has the audit trigger');
select is((select array_agg(tbl order by tbl collate "C") from app.fixit_spec()),
  array['game_seats', 'games', 'people', 'picks', 'roster', 'seasons', 'settlements', 'submissions'],
  'catalog: the allowlist holds the eight league tables and not the whitelist, log or config');
select is((select count(*) from app.import_spec() s
            where s.tbl not in (select tbl from app.fixit_spec())),
  0::bigint, 'catalog: no file imports into a table outside the allowlist');

-- 2. Non-admins are refused on every function --------------------------------------
create temp table calls (q text);
insert into calls values
  ($q$select public.fixit_update('people', jsonb_build_object('id', pg_temp.id(6)), '{"display_name":"x"}')$q$),
  ($q$select public.fixit_insert('picks', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(14), 'first_pick', pg_temp.id(2)))$q$),
  ($q$select public.fixit_delete('picks', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(6)))$q$),
  ($q$select public.fixit_delete_preview('people', jsonb_build_object('id', pg_temp.id(6)))$q$),
  ($q$select public.fixit_warnings('games', jsonb_build_object('id', pg_temp.id(100)))$q$),
  ($q$select public.link_person(pg_temp.id(11), pg_temp.id(10))$q$),
  ($q$select public.replace_player(pg_temp.id(90), pg_temp.id(3), pg_temp.id(12))$q$),
  ($q$select public.export_league_state(pg_temp.id(90))$q$),
  ($q$select public.import_league_state(pg_temp.id(90), '{}'::jsonb)$q$),
  ($q$select public.import_league_state(pg_temp.id(90), '{}'::jsonb, true)$q$);
grant select on calls to anon, authenticated;

reset role; select pg_temp.act_as(8);
select is(pg_temp.state(q), '42501', 'viewer: refused ' || left(q, 48)) from calls;
reset role; select pg_temp.act_as(6);
select is(pg_temp.state(q), '42501', 'league player: refused ' || left(q, 48)) from calls;
reset role; select pg_temp.act_as(7);
select is(pg_temp.state(q), '42501', 'prospect: refused ' || left(q, 48)) from calls;
reset role; select pg_temp.act_as(9);
select is(pg_temp.state(q), '42501', 'not invited: refused ' || left(q, 48)) from calls;
reset role; select pg_temp.act_anon();
select is(pg_temp.state(q), '42501', 'signed out: refused ' || left(q, 48)) from calls;
reset role;
select is((select count(*) from public.edit_log where id > (select last_id from baseline)), 0::bigint,
  'refused calls wrote nothing to the log');

-- 3. Rule warnings and editing ---------------------------------------------------------
reset role; select pg_temp.act_as(1);
select is(public.fixit_warnings('games', jsonb_build_object('id', pg_temp.id(100))), '[]'::jsonb,
  'warnings: a table that follows every rule has none');
select is(public.fixit_warnings('games', jsonb_build_object('id', pg_temp.id(101))), '[]'::jsonb,
  'warnings: nor does the second game');

select pg_temp.run('rename', $q$select public.fixit_update('people', jsonb_build_object('id', pg_temp.id(6)), '{"display_name":"Renamed"}')$q$);
select is(pg_temp.st('rename'), null, 'update: a person is renamed');
select is((pg_temp.r('rename') ->> 'changed')::boolean, true, 'update: it reports a change');
select is(pg_temp.r('rename') #>> '{old,display_name}', 'D6 6', 'update: with the old value');
select is(pg_temp.r('rename') #>> '{row,display_name}', 'Renamed', 'update: and the new row');
reset role;
select is((select display_name from public.people where id = pg_temp.id(6)), 'Renamed', 'update: the data changed');
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'people' and action = 'update'
            and old ->> 'display_name' = 'D6 6' and new ->> 'display_name' = 'Renamed'
            and actor_person_id = pg_temp.id(1) and row_key = pg_temp.id(6)::text),
  1::bigint, 'update: one log row with the old and new row, the actor and the key');

select pg_temp.act_as(1);
select pg_temp.run('same', $q$select public.fixit_update('people', jsonb_build_object('id', pg_temp.id(6)), '{"display_name":"Renamed"}')$q$);
select is((pg_temp.r('same') ->> 'changed')::boolean, false, 'update: setting the same value changes nothing');
reset role;
select is((select count(*) from public.edit_log where table_name = 'people' and action = 'update' and new ->> 'display_name' = 'Renamed'),
  1::bigint, 'update: and writes no second log row');

select pg_temp.act_as(1);
select pg_temp.run('t_whitelist', $q$select public.fixit_update('whitelist', jsonb_build_object('discord_id', pg_temp.disc(2)), '{"is_admin":true}')$q$);
select pg_temp.run('t_log', $q$select public.fixit_update('edit_log', '{"id":1}', '{"action":"insert"}')$q$);
select pg_temp.run('t_config', $q$select public.fixit_insert('app_config', '{"key":"dev_signin","value":"on"}')$q$);
select pg_temp.run('t_auth', $q$select public.fixit_delete('auth.users', jsonb_build_object('id', pg_temp.id(2)))$q$);
select pg_temp.run('t_null', $q$select public.fixit_delete(null, '{}')$q$);
select is(pg_temp.st('t_whitelist'), '22023', 'allowlist: the whitelist is refused (it has its own functions)');
select is(pg_temp.st('t_log'), '22023', 'allowlist: the log is refused');
select is(pg_temp.st('t_config'), '22023', 'allowlist: app_config is refused');
select is(pg_temp.st('t_auth'), '22023', 'allowlist: a table in another schema is refused');
select is(pg_temp.st('t_null'), '22023', 'allowlist: no table name is refused');
select is(pg_temp.msg('t_whitelist'), 'Fix it cannot change "whitelist".', 'allowlist: and the message names the table');
reset role;
select is((select is_admin from public.whitelist where discord_id = pg_temp.disc(2)), false, 'allowlist: nothing changed on the whitelist');

select pg_temp.act_as(1);
select pg_temp.run('c_auth', $q$select public.fixit_update('people', jsonb_build_object('id', pg_temp.id(6)), jsonb_build_object('auth_user_id', pg_temp.id(9)))$q$);
select pg_temp.run('c_key', $q$select public.fixit_update('people', jsonb_build_object('id', pg_temp.id(6)), jsonb_build_object('id', pg_temp.id(9)))$q$);
select pg_temp.run('c_half', $q$select public.fixit_update('roster', jsonb_build_object('season_id', pg_temp.id(90)), '{"position":2}')$q$);
select pg_temp.run('c_none', $q$select public.fixit_update('people', jsonb_build_object('id', pg_temp.id(6)), '{}')$q$);
select pg_temp.run('c_gone', $q$select public.fixit_update('people', jsonb_build_object('id', pg_temp.id(99)), '{"display_name":"x"}')$q$);
select pg_temp.run('c_type', $q$select public.fixit_update('games', jsonb_build_object('id', pg_temp.id(100)), '{"map_index":"abc"}')$q$);
select pg_temp.run('c_null', $q$select public.fixit_update('people', jsonb_build_object('id', pg_temp.id(6)), '{"display_name":null}')$q$);
select pg_temp.run('c_uuid', $q$select public.fixit_update('picks', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(6)), '{"first_pick":"nope"}')$q$);
select pg_temp.run('c_check', $q$select public.fixit_update('seasons', jsonb_build_object('id', pg_temp.id(90)), '{"capacity":11}')$q$);
select pg_temp.run('c_pair', $q$select public.fixit_update('seasons', jsonb_build_object('id', pg_temp.id(90)), '{"capacity":10,"games_each":3,"maps":["a","b","c"]}')$q$);
select pg_temp.run('c_unique', $q$select public.fixit_update('people', jsonb_build_object('id', pg_temp.id(6)), jsonb_build_object('discord_id', pg_temp.disc(7)))$q$);
select pg_temp.run('c_fk', $q$select public.fixit_update('picks', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(6)), jsonb_build_object('first_pick', pg_temp.id(99)))$q$);
select is(pg_temp.st('c_auth'), '22023', 'update: a column off the allowlist is refused');
select is(pg_temp.st('c_key'), '22023', 'update: a key column cannot be changed');
select is(pg_temp.st('c_half'), '22023', 'update: a row must be named by all its key columns');
select is(pg_temp.st('c_none'), '22023', 'update: an empty change is refused');
select is(pg_temp.st('c_gone'), 'P0002', 'update: a row that does not exist is not found');
select is(pg_temp.st('c_type'), '22023', 'update: a value of the wrong type is refused');
select ok(pg_temp.msg('c_type') like '%"map_index"%', 'update: and the message names the column');
select is(pg_temp.st('c_null'), '22023', 'update: a required column cannot be emptied');
select is(pg_temp.st('c_uuid'), '22023', 'update: a bad ID is refused');
select is(pg_temp.st('c_check'), '22023', 'update: a value the table forbids is refused');
select is(pg_temp.st('c_pair'), '22023', 'update: capacity 10 with 3 games each is refused');
select ok(pg_temp.msg('c_pair') like '%not a valid pair%', 'update: in plain words');
select is(pg_temp.st('c_unique'), '23505', 'update: a Discord ID someone else holds is a duplicate');
select is(pg_temp.st('c_fk'), '22023', 'update: a pick naming a person who does not exist is refused');

-- After the season has started, any value can still be edited.
select pg_temp.run('late', $q$select public.fixit_update('seasons', jsonb_build_object('id', pg_temp.id(90)), '{"capacity":12}')$q$);
select is((pg_temp.r('late') ->> 'changed')::boolean, true, 'update: capacity changes after the start');
select pg_temp.run('late2', $q$select public.fixit_update('seasons', jsonb_build_object('id', pg_temp.id(90)), '{"capacity":8}')$q$);
select is((select capacity from public.seasons where id = pg_temp.id(90)), 8, 'update: and change back');

-- An edit that breaks pairing rules still saves and names each rule.
select pg_temp.run('reach', $q$select public.fixit_update('game_seats', jsonb_build_object('game_id', pg_temp.id(100), 'seat', 2), '{"faction":"WA"}')$q$);
select is(pg_temp.st('reach'), null, 'warning: an edit that gives a table reach 20 is saved');
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('reach') -> 'warnings') w
                   where w like 'Table reach at least 21 (rule 6): game 1 has a table reach of 20.'),
  'warning: and names the reach rule with the reach');
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('reach') -> 'warnings') w
                   where w like 'Factions only from the player''s own list (rule 1):%WA%'),
  'warning: and the own-list rule');
reset role;
select is((select faction from public.game_seats where game_id = pg_temp.id(100) and seat = 2), 'WA', 'warning: the seat holds the new faction');
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'game_seats'
            and old ->> 'faction' = 'otters' and new ->> 'faction' = 'WA' and row_key = pg_temp.id(100) || ',2'),
  1::bigint, 'warning: and the log row shows old and new');

select pg_temp.act_as(1);
select pg_temp.run('mix', $q$select public.fixit_update('game_seats', jsonb_build_object('game_id', pg_temp.id(100), 'seat', 4), '{"faction":"knaves"}')$q$);
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('mix') -> 'warnings') w
                   where w like 'Militant and insurgent mix (rule 7): game 1 has Vagabond and Knaves together.'),
  'warning: Vagabond with Knaves names the mix rule');
select pg_temp.run('dupfac', $q$select public.fixit_update('game_seats', jsonb_build_object('game_id', pg_temp.id(100), 'seat', 1), '{"faction":"knaves"}')$q$);
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('dupfac') -> 'warnings') w
                   where w like 'One of each faction and one board per table (rule 8): game 1 has knaves more than once.'),
  'warning: a faction twice at a table names rule 8');
select pg_temp.run('norep', $q$select public.fixit_update('game_seats', jsonb_build_object('game_id', pg_temp.id(101), 'seat', 2), '{"faction":"knaves"}')$q$);
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('norep') -> 'warnings') w
                   where w like 'No repeats, high picks (rule 2): D6 2 plays knaves more than once.'),
  'warning: a faction repeated across a player''s games names rule 2');
select pg_temp.run('seatrep', $q$select public.fixit_update('game_seats', jsonb_build_object('game_id', pg_temp.id(101), 'seat', 3), jsonb_build_object('person_id', pg_temp.id(4)))$q$);
select is(pg_temp.st('seatrep'), '23505', 'warning: two seats for one person in a game is refused by the table');
select pg_temp.run('four', $q$select public.fixit_delete('game_seats', jsonb_build_object('game_id', pg_temp.id(102), 'seat', 4))$q$);
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('four') -> 'warnings') w
                   where w like 'Four different players at every table: game 1 has 3 seats.'),
  'warning: deleting a seat names the table size rule');
-- Put game 100 and game 101 back.
select pg_temp.run('back1', $q$select public.fixit_update('game_seats', jsonb_build_object('game_id', pg_temp.id(100), 'seat', 1), '{"faction":"cats"}')$q$);
select pg_temp.run('back2', $q$select public.fixit_update('game_seats', jsonb_build_object('game_id', pg_temp.id(100), 'seat', 2), '{"faction":"otters"}')$q$);
select pg_temp.run('back3', $q$select public.fixit_update('game_seats', jsonb_build_object('game_id', pg_temp.id(100), 'seat', 4), '{"faction":"lizards"}')$q$);
select pg_temp.run('back4', $q$select public.fixit_update('game_seats', jsonb_build_object('game_id', pg_temp.id(101), 'seat', 2), '{"faction":"rats"}')$q$);
select is(public.fixit_warnings('games', jsonb_build_object('id', pg_temp.id(100))), '[]'::jsonb, 'warning: game 1 follows the rules again');
select is(public.fixit_warnings('games', jsonb_build_object('id', pg_temp.id(101))), '[]'::jsonb, 'warning: so does game 2');

select pg_temp.run('list', $q$select public.fixit_update('roster', jsonb_build_object('season_id', pg_temp.id(90), 'person_id', pg_temp.id(6)), '{"ranked_factions":["cats","hedgehogs"]}')$q$);
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('list') -> 'warnings') w where w like 'Ranked list:%hedgehogs%'),
  'warning: a ranked faction outside the pool is saved with a warning');
select pg_temp.run('list2', $q$select public.fixit_update('roster', jsonb_build_object('season_id', pg_temp.id(90), 'person_id', pg_temp.id(6)), '{"ranked_factions":["cats","rats","birds"]}')$q$);
select is(pg_temp.r('list2') -> 'warnings', '[]'::jsonb, 'warning: and none once put right');
select pg_temp.run('winner', $q$select public.fixit_update('settlements', jsonb_build_object('game_id', pg_temp.id(101)), jsonb_build_object('winners', jsonb_build_array(pg_temp.id(6))))$q$);
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('winner') -> 'warnings') w where w like 'Winners must be seated at the game: Renamed is not.'),
  'warning: a winner who is not seated is saved with a warning');
select pg_temp.run('winner2', $q$select public.fixit_update('settlements', jsonb_build_object('game_id', pg_temp.id(101)), jsonb_build_object('winners', jsonb_build_array(pg_temp.id(3))))$q$);

-- Editing a recorded result recalculates standings and pick'em scores.
select is((select wins from public.standings where person_id = pg_temp.id(3)), 1::bigint, 'recalculate: player 3 has one win from the settled game');
select is((select points from public.pickem_scores where game_id = pg_temp.id(101) and person_id = pg_temp.id(8)), 3, 'recalculate: a first pick for that winner scores 3');
select pg_temp.run('result', $q$select public.fixit_update('settlements', jsonb_build_object('game_id', pg_temp.id(101)), jsonb_build_object('winners', jsonb_build_array(pg_temp.id(2))))$q$);
select is((select wins from public.standings where person_id = pg_temp.id(3)), 0::bigint, 'recalculate: after the edit player 3 has no win');
select is((select wins from public.standings where person_id = pg_temp.id(2)), 1::bigint, 'recalculate: and player 2 has it');
select is((select points from public.pickem_scores where game_id = pg_temp.id(101) and person_id = pg_temp.id(8)), 0, 'recalculate: the pick scores 0');
select pg_temp.run('result2', $q$select public.fixit_update('settlements', jsonb_build_object('game_id', pg_temp.id(101)), jsonb_build_object('winners', jsonb_build_array(pg_temp.id(3))))$q$);
select is((select points from public.pickem_scores where game_id = pg_temp.id(101) and person_id = pg_temp.id(8)), 3, 'recalculate: and back to 3 when put back');

-- Void and unvoid a game.
select pg_temp.run('void', $q$select public.fixit_update('games', jsonb_build_object('id', pg_temp.id(100)), '{"void":true}')$q$);
select is((select state from public.game_outcome where game_id = pg_temp.id(100)), 'void', 'void: the game is void');
select is((select points from public.pickem_scores where game_id = pg_temp.id(100) and person_id = pg_temp.id(6)), 0, 'void: and scores nothing');
select pg_temp.run('unvoid', $q$select public.fixit_update('games', jsonb_build_object('id', pg_temp.id(100)), '{"void":false}')$q$);
select is((select state from public.game_outcome where game_id = pg_temp.id(100)), 'disputed', 'unvoid: it is back to what its submissions say');
reset role;
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'games'
            and old ->> 'void' = 'false' and new ->> 'void' = 'true' and actor_person_id = pg_temp.id(1)),
  1::bigint, 'void: the log shows who voided it');

-- 4. Insert ------------------------------------------------------------------------------
select pg_temp.act_as(1);
select pg_temp.run('ins', $q$select public.fixit_insert('picks', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(14), 'first_pick', pg_temp.id(2)))$q$);
select is(pg_temp.st('ins'), null, 'insert: a pick is added');
select is(pg_temp.r('ins') -> 'warnings', '[]'::jsonb, 'insert: a valid one has no warnings');
select pg_temp.run('ins_dup', $q$select public.fixit_insert('picks', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(14), 'first_pick', pg_temp.id(3)))$q$);
select is(pg_temp.st('ins_dup'), '23505', 'insert: the same pick again is a duplicate');
select pg_temp.run('ins_req', $q$select public.fixit_insert('picks', jsonb_build_object('game_id', pg_temp.id(101), 'person_id', pg_temp.id(14)))$q$);
select is(pg_temp.st('ins_req'), '22023', 'insert: a missing required value is refused');
select ok(pg_temp.msg('ins_req') like '%"first_pick" cannot be empty%', 'insert: naming the column');
select pg_temp.run('ins_warn', $q$select public.fixit_insert('picks', jsonb_build_object('game_id', pg_temp.id(101), 'person_id', pg_temp.id(14), 'first_pick', pg_temp.id(6)))$q$);
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('ins_warn') -> 'warnings') w where w like 'Pick''em: the first pick, Renamed, is not seated at the game.'),
  'insert: a pick for someone not seated is saved with a warning');
select pg_temp.run('ins_own', $q$select public.fixit_insert('picks', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(2), 'first_pick', pg_temp.id(3)))$q$);
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('ins_own') -> 'warnings') w where w like 'Pick''em: a seated player cannot pick their own game.'),
  'insert: a seated player''s pick on their own game is saved with a warning');
select pg_temp.run('ins_person', $q$select public.fixit_insert('people', '{"display_name":"Fresh Face"}')$q$);
select ok((pg_temp.r('ins_person') #>> '{row,id}') is not null, 'insert: a person gets an ID');
select pg_temp.run('ins_seat', $q$select public.fixit_insert('game_seats', jsonb_build_object('game_id', pg_temp.id(100), 'seat', 5, 'person_id', pg_temp.id(6), 'faction', 'cats'))$q$);
select is(pg_temp.st('ins_seat'), '22023', 'insert: a fifth seat is refused');
select pg_temp.run('ins_list', $q$select public.fixit_insert('roster', jsonb_build_object('season_id', pg_temp.id(90), 'person_id', pg_temp.id(14), 'list', 'bench', 'position', 4))$q$);
select is(pg_temp.st('ins_list'), '22023', 'insert: a list that does not exist is refused');
select pg_temp.run('ins_roster', $q$select public.fixit_insert('roster', jsonb_build_object('season_id', pg_temp.id(90), 'person_id', pg_temp.id(14), 'list', 'waitlist', 'position', 4))$q$);
select is(pg_temp.st('ins_roster'), null, 'insert: a roster place is added');
select pg_temp.run('ins_place', $q$select public.fixit_insert('roster', jsonb_build_object('season_id', pg_temp.id(90), 'person_id', pg_temp.id(8), 'list', 'waitlist', 'position', 4))$q$);
select is(pg_temp.st('ins_place'), '23505', 'insert: a place someone holds is a duplicate');
select pg_temp.run('ins_season', $q$select public.fixit_insert('seasons', '{"slug":"d6-extra","name":"Extra"}')$q$);
select is(pg_temp.st('ins_season'), null, 'insert: a season is added');
select pg_temp.run('ins_slug', $q$select public.fixit_insert('seasons', '{"slug":"d6-extra","name":"Again"}')$q$);
select is(pg_temp.st('ins_slug'), '23505', 'insert: the same slug is a duplicate');
select pg_temp.run('ins_col', $q$select public.fixit_insert('people', jsonb_build_object('display_name', 'Sneaky', 'auth_user_id', pg_temp.id(9)))$q$);
select is(pg_temp.st('ins_col'), '22023', 'insert: a column off the allowlist is refused');
select pg_temp.run('ins_tbl', $q$select public.fixit_insert('whitelist', '{"discord_id":"960000000000000099"}')$q$);
select is(pg_temp.st('ins_tbl'), '22023', 'insert: a table off the allowlist is refused');
reset role;
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'picks' and action = 'insert'
            and actor_person_id = pg_temp.id(1) and new ->> 'person_id' = pg_temp.id(14)::text and old is null),
  2::bigint, 'insert: each new pick has a log row with the actor and no old value');

-- 5. Delete --------------------------------------------------------------------------------
select pg_temp.act_as(1);
select pg_temp.run('del_pick', $q$select public.fixit_delete('picks', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(14)))$q$);
select is(pg_temp.r('del_pick') #>> '{deleted,first_pick}', pg_temp.id(2)::text, 'delete: a pick is deleted and returned');
reset role;
select is((select count(*) from public.picks where game_id = pg_temp.id(100) and person_id = pg_temp.id(14)), 0::bigint, 'delete: it is gone');
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'picks' and action = 'delete'
            and old ->> 'first_pick' = pg_temp.id(2)::text and new is null and actor_person_id = pg_temp.id(1)),
  1::bigint, 'delete: the log keeps the old row');

select pg_temp.act_as(1);
select pg_temp.run('prev13', $q$select public.fixit_delete_preview('people', jsonb_build_object('id', pg_temp.id(13)))$q$);
select is(pg_temp.r('prev13') -> 'removes', '{"roster": 1, "picks": 2, "submissions": 1, "pick_mentions": 1}'::jsonb,
  'preview: a person''s delete names the roster entry, picks, submissions and picks that name them');
select is(pg_temp.r('prev13') -> 'blocked_by', 'null'::jsonb, 'preview: and is not blocked');
select pg_temp.run('prev2', $q$select public.fixit_delete_preview('people', jsonb_build_object('id', pg_temp.id(2)))$q$);
select is(pg_temp.r('prev2') ->> 'blocked_by', 'This person is seated in 3 games. Replace them in those games first.',
  'preview: a seated person is blocked and the message says why');
select pg_temp.run('prevs', $q$select public.fixit_delete_preview('seasons', jsonb_build_object('id', pg_temp.id(90)))$q$);
select is((pg_temp.r('prevs') -> 'removes' ->> 'games')::integer, 2, 'preview: a season''s delete counts its games');
select is((pg_temp.r('prevs') -> 'removes' ->> 'seats')::integer, 8, 'preview: and seats');
select pg_temp.run('prevg', $q$select public.fixit_delete_preview('games', jsonb_build_object('id', pg_temp.id(101)))$q$);
select is(pg_temp.r('prevg') -> 'removes', '{"seats": 4, "picks": 5, "settlements": 1, "submissions": 1}'::jsonb, 'preview: a game''s delete counts what goes with it');
select pg_temp.run('prevx', $q$select public.fixit_delete_preview('people', jsonb_build_object('id', pg_temp.id(99)))$q$);
select is(pg_temp.st('prevx'), 'P0002', 'preview: a row that does not exist is not found');

select pg_temp.run('del2', $q$select public.fixit_delete('people', jsonb_build_object('id', pg_temp.id(2)))$q$);
select is(pg_temp.st('del2'), '55000', 'delete: a seated person is refused');
select ok(pg_temp.msg('del2') like '%seated in 3 games%', 'delete: and told why');
select pg_temp.run('del13', $q$select public.fixit_delete('people', jsonb_build_object('id', pg_temp.id(13)))$q$);
select is(pg_temp.r('del13') -> 'removed', '{"roster": 1, "picks": 2, "submissions": 1, "pick_mentions": 1}'::jsonb,
  'delete: deleting a person reports what went with them');
reset role;
select is((select count(*) from public.people where id = pg_temp.id(13)), 0::bigint, 'delete: the person is gone');
select is((select count(*) from public.picks where person_id = pg_temp.id(13) or first_pick = pg_temp.id(13) or second_pick = pg_temp.id(13)), 0::bigint,
  'delete: their picks and the picks that named them are gone');
select is((select count(*) from public.submissions where person_id = pg_temp.id(13)), 0::bigint, 'delete: so are their submissions');
select is((select count(*) from public.roster where person_id = pg_temp.id(13)), 0::bigint, 'delete: and their roster entry');
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'people' and action = 'delete'
            and old ->> 'id' = pg_temp.id(13)::text and actor_person_id = pg_temp.id(1)),
  1::bigint, 'delete: the person''s delete is logged with the actor');
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'submissions' and action = 'delete'
            and old ->> 'person_id' = pg_temp.id(13)::text),
  1::bigint, 'delete: and so is each row that went with them');
select pg_temp.act_as(1);
select pg_temp.run('del_roster', $q$select public.fixit_delete('roster', jsonb_build_object('season_id', pg_temp.id(90), 'person_id', pg_temp.id(14)))$q$);
select is(pg_temp.st('del_roster'), null, 'delete: a roster place is deleted');
select pg_temp.run('del_gone', $q$select public.fixit_delete('picks', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(14)))$q$);
select is(pg_temp.st('del_gone'), 'P0002', 'delete: a row already gone is not found');
select pg_temp.run('del_tbl', $q$select public.fixit_delete('edit_log', '{"id":1}')$q$);
select is(pg_temp.st('del_tbl'), '22023', 'delete: the log is refused');

-- 6. Link a sign-in to a seeded name ------------------------------------------------------------
select pg_temp.run('lk_same', $q$select to_jsonb(public.link_person(pg_temp.id(10), pg_temp.id(10)))$q$);
select is(pg_temp.st('lk_same'), '22023', 'link: the same person twice is refused');
select pg_temp.run('lk_none', $q$select to_jsonb(public.link_person(pg_temp.id(10), pg_temp.id(11)))$q$);
select is(pg_temp.st('lk_none'), '55000', 'link: a sign-in that never signed in is refused');
select pg_temp.run('lk_busy', $q$select to_jsonb(public.link_person(pg_temp.id(11), pg_temp.id(2)))$q$);
select is(pg_temp.st('lk_busy'), '55000', 'link: a name that already has a sign-in is refused');
select pg_temp.run('lk_full', $q$select to_jsonb(public.link_person(pg_temp.id(2), pg_temp.id(10)))$q$);
select is(pg_temp.st('lk_full'), '55000', 'link: a duplicate that holds a roster place and seats is refused');
select ok(pg_temp.msg('lk_full') like '%1 roster entry, 3 seats, 1 submission%', 'link: and the message counts what it holds');
select pg_temp.run('lk_gone', $q$select to_jsonb(public.link_person(pg_temp.id(99), pg_temp.id(10)))$q$);
select is(pg_temp.st('lk_gone'), 'P0002', 'link: an unknown person is not found');
reset role;
select is((select count(*) from public.people where id in (pg_temp.id(10), pg_temp.id(11))), 2::bigint, 'link: the refusals changed nothing');

select pg_temp.act_as(1);
select pg_temp.run('link', $q$select to_jsonb(public.link_person(pg_temp.id(11), pg_temp.id(10)))$q$);
select is(pg_temp.st('link'), null, 'link: a sign-in moves onto the seeded name');
select is(pg_temp.r('link') ->> 'id', pg_temp.id(10)::text, 'link: the seeded person is returned');
reset role;
select is((select count(*) from public.people where id in (pg_temp.id(10), pg_temp.id(11))), 1::bigint, 'link: one person row is left');
select is((select auth_user_id from public.people where id = pg_temp.id(10)), pg_temp.id(11), 'link: it holds the login');
select is((select discord_id from public.people where id = pg_temp.id(10)), pg_temp.disc(11), 'link: and the Discord ID');
select is((select display_name from public.people where id = pg_temp.id(10)), 'Sam', 'link: and keeps the seeded name');
select is((select seed_key from public.people where id = pg_temp.id(10)), 'sam', 'link: and its seed key');
select is((select added_by from public.whitelist where discord_id = pg_temp.disc(7)), pg_temp.id(10), 'link: whitelist rows the duplicate added are credited to the seeded person');
select pg_temp.act_as(11);
select is(public.whoami() ->> 'person_id', pg_temp.id(10)::text, 'link: the sign-in now resolves to the seeded person');
reset role;
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'people' and action = 'delete' and old ->> 'id' = pg_temp.id(11)::text),
  1::bigint, 'link: the removal of the duplicate is logged');
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'people' and action = 'update'
            and old ->> 'id' = pg_temp.id(10)::text and new ->> 'auth_user_id' = pg_temp.id(11)::text and old ->> 'auth_user_id' is null),
  1::bigint, 'link: and so is the move, with old and new');

-- 7. Replace a player ---------------------------------------------------------------------------------
select pg_temp.act_as(1);
select pg_temp.run('rp_same', $q$select public.replace_player(pg_temp.id(90), pg_temp.id(3), pg_temp.id(3))$q$);
select is(pg_temp.st('rp_same'), '22023', 'replace: the same person is refused');
select pg_temp.run('rp_league', $q$select public.replace_player(pg_temp.id(90), pg_temp.id(3), pg_temp.id(6))$q$);
select is(pg_temp.st('rp_league'), '55000', 'replace: someone already on the league list is refused');
select pg_temp.run('rp_off', $q$select public.replace_player(pg_temp.id(90), pg_temp.id(8), pg_temp.id(12))$q$);
select is(pg_temp.st('rp_off'), 'P0002', 'replace: a person not on the roster is not found');
select pg_temp.run('rp_ghost', $q$select public.replace_player(pg_temp.id(90), pg_temp.id(3), pg_temp.id(99))$q$);
select is(pg_temp.st('rp_ghost'), 'P0002', 'replace: a new person who does not exist is not found');
select pg_temp.run('rp_season', $q$select public.replace_player(pg_temp.id(99), pg_temp.id(3), pg_temp.id(12))$q$);
select is(pg_temp.st('rp_season'), 'P0002', 'replace: a season that does not exist is not found');
select pg_temp.run('rp_game', $q$select public.replace_player(pg_temp.id(90), pg_temp.id(3), pg_temp.id(12), pg_temp.id(102))$q$);
select is(pg_temp.st('rp_game'), 'P0002', 'replace: a game of another season is not found');
reset role;
create temp table before_seats as
  select game_id, seat, faction, (person_id = pg_temp.id(3)) as was_three from public.game_seats where game_id in (pg_temp.id(100), pg_temp.id(101));
grant select on before_seats to authenticated;

select pg_temp.act_as(1);
select pg_temp.run('rp', $q$select public.replace_player(pg_temp.id(90), pg_temp.id(3), pg_temp.id(12))$q$);
select is(pg_temp.st('rp'), null, 'replace: a player is replaced for the season');
select is(jsonb_array_length(pg_temp.r('rp') -> 'games'), 2, 'replace: in both of their games');
select is((pg_temp.r('rp') ->> 'roster_moved')::boolean, true, 'replace: and on the roster');
reset role;
select is((select count(*) from public.game_seats where person_id = pg_temp.id(3) and game_id in (pg_temp.id(100), pg_temp.id(101))), 0::bigint, 'replace: the old player is in neither game of the season');
select is((select count(*) from public.game_seats where person_id = pg_temp.id(3)), 1::bigint, 'replace: and keeps their seat in another season''s game');
select is((select count(*) from public.game_seats where person_id = pg_temp.id(12)), 2::bigint, 'replace: the new player is in both');
select is((select count(*) from public.game_seats s join before_seats b on b.game_id = s.game_id and b.seat = s.seat and b.faction = s.faction
            where (s.person_id = pg_temp.id(12)) = b.was_three),
  8::bigint, 'replace: every seat and faction is as it was, and the games are the same rows');
select is((select count(*) from public.games where id in (pg_temp.id(100), pg_temp.id(101))), 2::bigint, 'replace: the games stay');
select is((select count(*) from public.submissions where person_id = pg_temp.id(3)), 0::bigint, 'replace: the old player''s own answer is removed');
select is((select winners from public.submissions where game_id = pg_temp.id(100) and person_id = pg_temp.id(2)), array[pg_temp.id(12)],
  'replace: an answer that named the old player names the new one');
select is((select winners from public.settlements where game_id = pg_temp.id(101)), array[pg_temp.id(12)], 'replace: so does the settlement');
select is((select array[first_pick, second_pick] from public.picks where game_id = pg_temp.id(100) and person_id = pg_temp.id(6)),
  array[pg_temp.id(12), pg_temp.id(4)], 'replace: a pick on the old player picks the new one');
select is((select array[first_pick, second_pick] from public.picks where game_id = pg_temp.id(101) and person_id = pg_temp.id(8)),
  array[pg_temp.id(12), null]::uuid[], 'replace: two picks that would become one keep the first');
select is((select count(*) from public.picks where person_id = pg_temp.id(12)), 0::bigint, 'replace: the new player''s own picks on their games are removed');
select is((select list || ':' || position || ':' || player_number from public.roster where season_id = pg_temp.id(90) and person_id = pg_temp.id(12)),
  'league:2:2', 'replace: the roster place and player number pass to the new player');
select is((select ranked_factions from public.roster where season_id = pg_temp.id(90) and person_id = pg_temp.id(12)),
  array['otters', 'birds', 'cats'], 'replace: with the ranked list');
select is((select count(*) from public.roster where season_id = pg_temp.id(90) and person_id = pg_temp.id(3)), 0::bigint, 'replace: the old player has no roster place');
select is((select count(*) from public.roster where season_id = pg_temp.id(90) and list = 'league'), 5::bigint, 'replace: the league list is the same size');
select is((select array_agg(position order by position) from public.roster where season_id = pg_temp.id(90) and list = 'waitlist'),
  array[1]::integer[], 'replace: the waitlist has no gap');
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'game_seats' and action = 'update'
            and new ->> 'person_id' = pg_temp.id(12)::text and old ->> 'person_id' = pg_temp.id(3)::text and actor_person_id = pg_temp.id(1)),
  2::bigint, 'replace: each seat change is logged with old and new');
select is(pg_temp.r('rp') -> 'warnings', '[]'::jsonb, 'replace: the new player follows every rule in both games, so there are no warnings');

-- One game only: the person did not turn up for it.
select pg_temp.act_as(1);
select pg_temp.run('rpg', $q$select public.replace_player(pg_temp.id(90), pg_temp.id(5), pg_temp.id(7), pg_temp.id(101))$q$);
select is(pg_temp.st('rpg'), null, 'replace one game: a player is replaced in one game');
select is((pg_temp.r('rpg') -> 'games' -> 0 ->> 'submissions_removed')::integer, 1, 'replace one game: their answer there is removed');
select is((pg_temp.r('rpg') -> 'games' -> 0 ->> 'own_picks_removed')::integer, 1, 'replace one game: the new player''s pick on it is removed');
select is((pg_temp.r('rpg') ->> 'roster_moved')::boolean, false, 'replace one game: the roster is untouched');
reset role;
select is((select person_id from public.game_seats where game_id = pg_temp.id(101) and seat = 3), pg_temp.id(7), 'replace one game: the seat holds the new player');
select is((select faction from public.game_seats where game_id = pg_temp.id(101) and seat = 3), 'knaves', 'replace one game: with the same faction');
select is((select person_id from public.game_seats where game_id = pg_temp.id(100) and seat = 4), pg_temp.id(5), 'replace one game: and the other game is as it was');
select is((select list from public.roster where season_id = pg_temp.id(90) and person_id = pg_temp.id(5)), 'league', 'replace one game: the old player keeps the league place');
select is((select list from public.roster where season_id = pg_temp.id(90) and person_id = pg_temp.id(7)), 'waitlist', 'replace one game: and the new one the waitlist place');
select is((select second_pick from public.picks where game_id = pg_temp.id(101) and person_id = pg_temp.id(6)), pg_temp.id(7), 'replace one game: a pick on the old player picks the new one');
select pg_temp.act_as(1);
select pg_temp.run('rpg2', $q$select public.replace_player(pg_temp.id(90), pg_temp.id(5), pg_temp.id(2), pg_temp.id(101))$q$);
select is(pg_temp.st('rpg2'), 'P0002', 'replace one game: someone not seated there cannot be replaced');
select pg_temp.run('rpg3', $q$select public.replace_player(pg_temp.id(90), pg_temp.id(4), pg_temp.id(2), pg_temp.id(101))$q$);
select is(pg_temp.st('rpg3'), '55000', 'replace one game: nor can the seat go to someone already at the table');
-- Put game 2 back for the import tests.
reset role;
update public.game_seats set person_id = pg_temp.id(5) where game_id = pg_temp.id(101) and seat = 3;

-- 8. Export and import ---------------------------------------------------------------------------
select pg_temp.act_as(1);
insert into exp select public.export_league_state(pg_temp.id(90));
select is((select count(*) from exp, jsonb_object_keys(j)), 10::bigint, 'export: one file per area and the log');
select is((select array_agg(k order by k) from exp, jsonb_object_keys(j) k),
  array['games.csv', 'lists.csv', 'log.csv', 'people.csv', 'picks.csv', 'results.csv', 'roster.csv', 'season.csv', 'seats.csv', 'submissions.csv'],
  'export: the file names');
select is((select j -> 'picks.csv' -> 'columns' from exp), '["game_id","person_id","first_pick","second_pick","updated_at"]'::jsonb, 'export: a file lists its columns in order');
select is((select jsonb_array_length(j -> 'seats.csv' -> 'rows') from exp), 8, 'export: the seats of the season''s two games');
select is((select jsonb_array_length(j -> 'season.csv' -> 'rows') from exp), 1, 'export: one season row');
select is((select j -> 'roster.csv' -> 'rows' -> 0 ->> 'list' from exp), 'league', 'export: values are text');
select is((select j -> 'lists.csv' -> 'rows' -> 0 ->> 'ranked_factions' from exp), 'cats|rats|birds', 'export: a list is its entries joined with a bar');
select is((select j -> 'season.csv' -> 'rows' -> 0 ->> 'maps' from exp), 'a|b', 'export: so is the map list');
select is((select jsonb_array_length(j -> 'log.csv' -> 'rows') from exp) > 0, true, 'export: the log is there');
reset role;
select is((select count(*) from exp, jsonb_array_elements(j -> 'people.csv' -> 'rows') r where r ->> 'auth_user_id' is not null), 0::bigint, 'export: no sign-in links leave the database');

-- An export imported unchanged changes nothing.
select pg_temp.act_as(1);
select pg_temp.run('rt_prev', $q$select public.import_league_state(pg_temp.id(90), (select j from exp), true)$q$);
reset role;
create temp table before_rt as select pg_temp.snap() as s, (select count(*) from public.edit_log) as n;
grant select on before_rt to authenticated;
select pg_temp.act_as(1);
select pg_temp.run('rt', $q$select public.import_league_state(pg_temp.id(90), (select j from exp))$q$);
select is(pg_temp.st('rt_prev'), null, 'round trip: the preview of an unchanged export runs');
select is((pg_temp.r('rt_prev') ->> 'total_changes')::integer, 0, 'round trip: it shows no change');
select is((pg_temp.r('rt_prev') ->> 'preview')::boolean, true, 'round trip: and says it is a preview');
select is((pg_temp.r('rt') ->> 'total_changes')::integer, 0, 'round trip: importing it shows no change');
select is((pg_temp.r('rt') ->> 'preview')::boolean, false, 'round trip: for real');
select is(pg_temp.r('rt') -> 'ignored', '["log.csv"]'::jsonb, 'round trip: the log file is read and ignored');
select is((pg_temp.r('rt') #>> '{files,picks.csv,unchanged}')::integer, (select count(*)::integer from public.picks), 'round trip: every pick counts as unchanged');
reset role;
select is(pg_temp.snap(), (select s from before_rt), 'round trip: nothing in the league tables changed');
select is((select count(*) from public.edit_log), (select n from before_rt), 'round trip: and nothing was logged');

-- A changed import: a preview shows it and writes nothing, the import applies it.
select pg_temp.act_as(1);
create temp table edited (j jsonb);
grant all on edited to authenticated;
insert into edited select pg_temp.drop_rows(
  pg_temp.map_rows(
    pg_temp.map_rows(
      pg_temp.map_rows((select j from exp), 'people.csv', jsonb_build_object('id', pg_temp.id(6)), '{"display_name":"Six Renamed"}'),
      'picks.csv', jsonb_build_object('game_id', pg_temp.id(101), 'person_id', pg_temp.id(8)), jsonb_build_object('first_pick', pg_temp.id(2))),
    'games.csv', jsonb_build_object('id', pg_temp.id(101)), '{"void":"true"}'),
  'picks.csv', jsonb_build_object('game_id', pg_temp.id(100), 'person_id', pg_temp.id(6)));
reset role;
create temp table before_ch as select pg_temp.snap() as s, (select count(*) from public.edit_log) as n;
grant select on before_ch to authenticated;
select pg_temp.act_as(1);
select pg_temp.run('ch_prev', $q$select public.import_league_state(pg_temp.id(90), (select j from edited), true)$q$);
select is(pg_temp.st('ch_prev'), null, 'preview: a changed import previews');
select is((pg_temp.r('ch_prev') ->> 'total_changes')::integer, 4, 'preview: with the count of changes');
select is(pg_temp.r('ch_prev') #> '{files,people.csv}', '{"added": 0, "changed": 1, "removed": 0, "unchanged": 11}'::jsonb, 'preview: per file, a changed person');
select is(pg_temp.r('ch_prev') #> '{files,picks.csv}', '{"added": 0, "changed": 1, "removed": 1, "unchanged": 3}'::jsonb, 'preview: a changed and a removed pick');
select is(pg_temp.r('ch_prev') #> '{files,games.csv}', '{"added": 0, "changed": 1, "removed": 0, "unchanged": 1}'::jsonb, 'preview: a changed game');
select is(jsonb_array_length(pg_temp.r('ch_prev') -> 'changes'), 4, 'preview: and each change is listed');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.r('ch_prev') -> 'changes') c
                   where c ->> 'file' = 'people.csv' and c -> 'columns' = '["display_name"]'::jsonb and c ->> 'action' = 'changed'),
  'preview: with the columns that change');
select ok(exists (select 1 from jsonb_array_elements_text(pg_temp.r('ch_prev') -> 'warnings') w
                   where w like 'The season has started. This import changes 3 game, submission, result or pick rows%'),
  'preview: after the start it warns about the games and results it would change');
reset role;
select is(pg_temp.snap(), (select s from before_ch), 'preview: and wrote nothing');
select is((select count(*) from public.edit_log), (select n from before_ch), 'preview: nor logged anything');

select pg_temp.act_as(1);
select pg_temp.run('ch', $q$select public.import_league_state(pg_temp.id(90), (select j from edited))$q$);
select is(pg_temp.st('ch'), null, 'import: the changed import applies');
select is((pg_temp.r('ch') ->> 'total_changes')::integer, 4, 'import: with the same count the preview gave');
select is(pg_temp.r('ch') -> 'files', pg_temp.r('ch_prev') -> 'files', 'import: and the same files');
reset role;
select is((select display_name from public.people where id = pg_temp.id(6)), 'Six Renamed', 'import: a person is renamed');
select is((select first_pick from public.picks where game_id = pg_temp.id(101) and person_id = pg_temp.id(8)), pg_temp.id(2), 'import: a pick changed');
select is((select count(*) from public.picks where game_id = pg_temp.id(100) and person_id = pg_temp.id(6)), 0::bigint, 'import: a row left out of a file is removed');
select is((select void from public.games where id = pg_temp.id(101)), true, 'import: a game is voided');
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and table_name = 'import'), 1::bigint, 'import: one log entry for the import');
select is((select new -> 'files' from public.edit_log where table_name = 'import'),
  '["games.csv","lists.csv","log.csv","people.csv","picks.csv","results.csv","roster.csv","season.csv","seats.csv","submissions.csv"]'::jsonb,
  'import: with the file names');
select is((select actor_person_id from public.edit_log where table_name = 'import'), pg_temp.id(1), 'import: and the actor');
select is((select new #>> '{counts,picks.csv,removed}' from public.edit_log where table_name = 'import'), '1', 'import: and the counts');
select is((select count(*) from public.edit_log l, public.edit_log i
            where i.table_name = 'import' and l.id between (i.new ->> 'first_log_id')::bigint and (i.new ->> 'last_log_id')::bigint),
  4::bigint, 'import: its log entry points at the four row changes');
select is((select count(*) from public.edit_log where table_name = 'picks' and action = 'delete' and old ->> 'person_id' = pg_temp.id(6)::text
            and old ->> 'game_id' = pg_temp.id(100)::text and actor_person_id = pg_temp.id(1)),
  1::bigint, 'import: each changed row is logged with old and new by the trigger');

select pg_temp.act_as(1);
select pg_temp.run('ch_again', $q$select public.import_league_state(pg_temp.id(90), (select j from edited))$q$);
select is((pg_temp.r('ch_again') ->> 'total_changes')::integer, 0, 'import: running the same import again changes nothing');
reset role;
select is((select count(*) from public.edit_log where table_name = 'import'), 1::bigint, 'import: and adds no second entry');

-- Lists and the roster: swapping places and numbers in one import.
select pg_temp.act_as(1);
create temp table swapped (j jsonb);
grant all on swapped to authenticated;
insert into swapped select pg_temp.map_rows(
  pg_temp.map_rows(
    pg_temp.map_rows(
      pg_temp.map_rows((select j from exp), 'roster.csv', jsonb_build_object('person_id', pg_temp.id(2)), '{"position":"2","player_number":"2"}'),
      'roster.csv', jsonb_build_object('person_id', pg_temp.id(12)), '{"position":"1","player_number":"1"}'),
    'lists.csv', jsonb_build_object('person_id', pg_temp.id(6)), '{"ranked_factions":"rats|cats","list_submitted":"false"}'),
  'season.csv', jsonb_build_object('id', pg_temp.id(90)), '{"name":"D6 Main Renamed"}');
select pg_temp.run('sw', $q$select public.import_league_state(pg_temp.id(90), (select j from swapped))$q$);
select is(pg_temp.st('sw'), null, 'swap: two players swap place and number in one import');
reset role;
select is((select position || ':' || player_number from public.roster where season_id = pg_temp.id(90) and person_id = pg_temp.id(2)), '2:2', 'swap: the first holds the other''s place');
select is((select position || ':' || player_number from public.roster where season_id = pg_temp.id(90) and person_id = pg_temp.id(12)), '1:1', 'swap: and the other the first''s');
select is((select ranked_factions || array[list_submitted::text] from public.roster where season_id = pg_temp.id(90) and person_id = pg_temp.id(6)),
  array['rats', 'cats', 'false'], 'swap: lists.csv changes a ranked list and its submitted flag');
select is((select name from public.seasons where id = pg_temp.id(90)), 'D6 Main Renamed', 'swap: season.csv changes the season');
select is((select count(*) from public.roster where season_id = pg_temp.id(90)), 6::bigint, 'swap: and no roster row was added or lost');

-- A failed import names file, row and column and writes nothing.
select pg_temp.act_as(1);
create temp table bad (name text primary key, j jsonb);
grant all on bad to authenticated;
insert into bad select 'cell', pg_temp.map_rows(
  pg_temp.map_rows((select j from exp), 'people.csv', jsonb_build_object('id', pg_temp.id(7)), '{"display_name":"Valid Rename"}'),
  'picks.csv', jsonb_build_object('game_id', pg_temp.id(101), 'person_id', pg_temp.id(6)), '{"first_pick":"not-a-uuid"}');
insert into bad select 'int', pg_temp.map_rows((select j from exp), 'season.csv', jsonb_build_object('id', pg_temp.id(90)), '{"capacity":"eight"}');
insert into bad select 'extra', pg_temp.map_rows((select j from exp), 'roster.csv', jsonb_build_object('person_id', pg_temp.id(2)), '{"bogus":"1"}');
insert into bad select 'missing', pg_temp.drop_col((select j from exp), 'picks.csv', 'second_pick');
insert into bad select 'dup', pg_temp.add_row((select j from exp), 'picks.csv',
  (select r from exp, jsonb_array_elements(j -> 'picks.csv' -> 'rows') r limit 1));
insert into bad select 'file', (select j from exp) || '{"bogus.csv": []}'::jsonb;
insert into bad select 'blank', pg_temp.map_rows((select j from exp), 'submissions.csv', jsonb_build_object('person_id', pg_temp.id(2)), '{"winners":"a|"}');
insert into bad select 'empty', pg_temp.map_rows((select j from exp), 'people.csv', jsonb_build_object('id', pg_temp.id(7)), '{"display_name":""}');
insert into bad select 'scope', pg_temp.map_rows((select j from exp), 'picks.csv', jsonb_build_object('person_id', pg_temp.id(8)), jsonb_build_object('game_id', pg_temp.id(102)));
insert into bad select 'season', pg_temp.map_rows((select j from exp), 'roster.csv', jsonb_build_object('person_id', pg_temp.id(2)), jsonb_build_object('season_id', pg_temp.id(91)));
insert into bad select 'seat', pg_temp.map_rows((select j from exp), 'seats.csv', jsonb_build_object('game_id', pg_temp.id(100), 'seat', '1'), '{"faction":"rats"}');
insert into bad select 'game', pg_temp.map_rows((select j from exp), 'games.csv', jsonb_build_object('id', pg_temp.id(100)), '{"game_no":"7"}');
insert into bad select 'newseat', pg_temp.add_row((select j from exp), 'seats.csv',
  jsonb_build_object('game_id', pg_temp.id(100)::text, 'seat', '9', 'person_id', pg_temp.id(7)::text, 'faction', 'cats'));
insert into bad select 'fk', pg_temp.map_rows(
  pg_temp.map_rows((select j from exp), 'people.csv', jsonb_build_object('id', pg_temp.id(7)), '{"display_name":"Valid Rename"}'),
  'picks.csv', jsonb_build_object('game_id', pg_temp.id(101), 'person_id', pg_temp.id(6)), jsonb_build_object('first_pick', pg_temp.id(98)));
insert into bad select 'check', pg_temp.map_rows(
  pg_temp.map_rows((select j from exp), 'people.csv', jsonb_build_object('id', pg_temp.id(7)), '{"display_name":"Valid Rename"}'),
  'season.csv', jsonb_build_object('id', pg_temp.id(90)), '{"capacity":"11"}');
insert into bad select 'unique', pg_temp.map_rows(
  pg_temp.map_rows((select j from exp), 'people.csv', jsonb_build_object('id', pg_temp.id(7)), '{"display_name":"Valid Rename"}'),
  'people.csv', jsonb_build_object('id', pg_temp.id(6)), jsonb_build_object('discord_id', pg_temp.disc(2)));
insert into bad select 'place', pg_temp.map_rows((select j from exp), 'roster.csv', jsonb_build_object('person_id', pg_temp.id(2)), '{"position":"2"}');
insert into bad select 'update', pg_temp.map_rows((select j from exp), 'lists.csv', jsonb_build_object('person_id', pg_temp.id(2)), jsonb_build_object('person_id', pg_temp.id(14)));
insert into bad select 'shape', '{"picks.csv": 7}'::jsonb;
reset role;
create temp table before_bad as select pg_temp.snap() as s, (select count(*) from public.edit_log) as n;
grant select on before_bad to authenticated;
select pg_temp.act_as(1);
select pg_temp.run(name, format('select public.import_league_state(pg_temp.id(90), (select j from bad where name = %L))', name)) from bad;
select pg_temp.run('cell_prev', $q$select public.import_league_state(pg_temp.id(90), (select j from bad where name = 'cell'), true)$q$);
select is(pg_temp.st(name), '22023', 'failed import (' || name || '): refused with bad input') from bad order by name;
select is(pg_temp.st('cell_prev'), '22023', 'failed import: a preview refuses the same way');
select ok(pg_temp.msg('cell') like 'Nothing was imported. picks.csv row % column first_pick: %', 'failed import: the message names file, row and column');
select is(pg_temp.det('cell') -> 0 ->> 'file', 'picks.csv', 'failed import: the detail names the file');
select is((pg_temp.det('cell') -> 0 ->> 'row')::bigint, (select pg_temp.row_no(j, 'picks.csv', jsonb_build_object('game_id', pg_temp.id(101), 'person_id', pg_temp.id(6))) from exp),
  'failed import: and the row, counted from 1');
select is(pg_temp.det('cell') -> 0 ->> 'column', 'first_pick', 'failed import: and the column');
select ok(pg_temp.msg('cell') like '%invalid input syntax for type uuid%', 'failed import: and says what is wrong');
select is(pg_temp.det('int') -> 0 ->> 'file' || ' ' || (pg_temp.det('int') -> 0 ->> 'row') || ' ' || (pg_temp.det('int') -> 0 ->> 'column'), 'season.csv 1 capacity', 'failed import: a number that is not one');
select is(pg_temp.det('extra') -> 0 ->> 'column', 'bogus', 'failed import: an unknown column is named');
select is(pg_temp.det('missing') -> 0 ->> 'column', 'second_pick', 'failed import: a missing column is named');
select is(pg_temp.det('missing') -> 0 ->> 'problem', 'Column is missing.', 'failed import: with the problem');
select ok(pg_temp.msg('dup') like '%picks.csv row % column game_id: Repeats row 1%', 'failed import: a repeated key names both rows');
select is(pg_temp.det('file') -> 0 ->> 'file', 'bogus.csv', 'failed import: an unknown file is named');
select ok(pg_temp.msg('blank') like '%submissions.csv row % column winners:%empty entry%', 'failed import: an empty entry in a list is named');
select ok(pg_temp.msg('empty') like '%people.csv row % column display_name: A value is required.%', 'failed import: a required cell left empty is named');
select ok(pg_temp.msg('scope') like '%picks.csv row % column game_id: This is not a game of the season being imported.%', 'failed import: a game of another season is named');
select ok(pg_temp.msg('season') like '%roster.csv row % column season_id: This row belongs to another season.%', 'failed import: so is a roster row of another season');
select ok(pg_temp.msg('seat') like '%seats.csv row % column faction: Pairings are not imported%', 'failed import: a changed seat is refused as pairings');
select ok(pg_temp.msg('game') like '%games.csv row % column game_no: Pairings are not imported%', 'failed import: so is a changed game number');
select ok(pg_temp.msg('newseat') like '%seats.csv row % Pairings are not imported%', 'failed import: and a new seat');
select ok(pg_temp.msg('fk') like '%picks.csv row % column first_pick: %', 'failed import: a pick naming nobody is named at the write');
select ok(pg_temp.msg('check') like '%season.csv row 1, column capacity: %', 'failed import: a value the table forbids is named at the write');
select ok(pg_temp.msg('unique') like '%people.csv row % column discord_id: %', 'failed import: a Discord ID someone else holds is named at the write');
select ok(pg_temp.msg('place') like '%roster.csv, column%', 'failed import: two people on one place is refused when the file is done');
select ok(pg_temp.msg('update') like '%lists.csv row % There is no such row to update.%', 'failed import: lists.csv cannot add a roster place');
select ok(pg_temp.msg('shape') like '%picks.csv: Expected a list of rows.%', 'failed import: a file that is not a list of rows');
reset role;
select is(pg_temp.snap(), (select s from before_bad), 'failed import: all of them together changed nothing, even where earlier files had applied');
select is((select count(*) from public.edit_log), (select n from before_bad), 'failed import: and logged nothing');
select is((select display_name from public.people where id = pg_temp.id(7)), 'D6 7', 'failed import: a valid change in the same payload did not land');

-- Every problem is listed, not only the first.
select pg_temp.act_as(1);
select pg_temp.run('many', format('select public.import_league_state(pg_temp.id(90), %L::jsonb)',
  (select pg_temp.map_rows(pg_temp.map_rows(j, 'picks.csv', '{}'::jsonb, '{"first_pick":"x"}'),
                           'season.csv', jsonb_build_object('id', pg_temp.id(90)), '{"capacity":"y"}') from exp)));
select is(jsonb_array_length(pg_temp.det('many')), (select count(*)::integer + 1 from public.picks p join public.games g on g.id = p.game_id where g.season_id = pg_temp.id(90)),
  'failed import: every bad cell is in the detail');
select ok(pg_temp.msg('many') like '%picks.csv row 1, column first_pick%season.csv row 1, column capacity%' or pg_temp.msg('many') like '%season.csv row 1, column capacity%picks.csv row%', 'failed import: and in the message, which shows the first five');

-- A file is the state of its area: an empty picks file would remove every pick.
select pg_temp.run('wipe', $q$select public.import_league_state(pg_temp.id(90), '{"picks.csv": {"columns": ["game_id","person_id","first_pick","second_pick","updated_at"], "rows": []}}'::jsonb, true)$q$);
select is((pg_temp.r('wipe') #>> '{files,picks.csv,removed}')::integer, (select count(*)::integer from public.picks p join public.games g on g.id = p.game_id where g.season_id = pg_temp.id(90)),
  'preview: a picks file with no rows would remove the season''s picks, and says so');
select is(pg_temp.r('wipe') #> '{files}' ? 'people.csv', false, 'preview: files the call does not name are left alone');
select pg_temp.run('only', $q$select public.import_league_state(pg_temp.id(90), '{"season.csv": [{"id": "d6000000-0000-0000-0000-000000000090", "slug": "d6-main", "name": "D6 Main Renamed", "is_current": "true", "capacity": "8", "games_each": "2", "maps": "a|b", "faction_pool": "cats|rats|badgers|moles|birds|frogs|otters|vagabond|knaves|bats|crows|WA|lizards", "min_list_length": "3", "lists_lock_at": "", "started_at": "", "seed": ""}]}'::jsonb, true)$q$);
select is((pg_temp.r('only') ->> 'total_changes')::integer, 1, 'preview: plain row lists work as well as { columns, rows }');
select ok(pg_temp.r('only') #>> '{changes,0,columns}' like '%lists_lock_at%started_at%' or pg_temp.r('only') #>> '{changes,0,columns}' like '%started_at%', 'preview: and an empty cell is a null');
reset role;
select is((select started_at is not null from public.seasons where id = pg_temp.id(90)), true, 'preview: and left the season started');

-- 9. The log has exactly what was done ------------------------------------------------------------
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and actor_person_id is distinct from pg_temp.id(1)), 0::bigint,
  'log: every entry from this file has the admin as its actor');
select is((select count(*) from public.edit_log where id > (select last_id from baseline) and actor_person_id is null), 0::bigint, 'log: none lack an actor');
select pg_temp.act_as(1);
select ok((select count(*) from public.edit_log where id > (select last_id from baseline)) > 40, 'log: the admin reads it');
reset role; select pg_temp.act_as(6);
select is((select count(*) from public.edit_log), 0::bigint, 'log: a league player reads none of it');
reset role;

select * from finish();
rollback;
