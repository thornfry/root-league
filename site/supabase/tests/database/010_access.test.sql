-- D1: access core. Covers the permission table for the whitelist, identity and
-- audit log as signed-out, non-whitelisted, viewer and admin callers, plus the
-- dev sign-in fallback, ensure_person and the table pattern itself.
--
-- Every fixture ID here is fake and in the 9000... range, so nothing depends on
-- the seed. The whole file runs in one transaction that is rolled back.
begin;

select plan(145);

-- pgTAP keeps its counters in temp tables the test role must be able to write.
grant all on all tables in schema pg_temp to anon, authenticated, service_role;
grant all on all sequences in schema pg_temp to anon, authenticated, service_role;

-- Helpers. Call them as the postgres role (`reset role` first), because each
-- one ends by switching to the role it names.
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

-- The detail text of the error a statement raises, or 'no error'.
create function pg_temp.err_detail(q text) returns text language plpgsql as $$
declare d text;
begin
  execute q;
  return 'no error';
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;

-- Fixtures (as postgres) --------------------------------------------------------
-- Start from empty tables so the local seed cannot colour any count.
delete from public.whitelist;
delete from public.people;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', '900000000000000001@dev.invalid', '{"name":"Admin Name"}'),
  ('a0000000-0000-0000-0000-000000000002', '900000000000000002@dev.invalid', '{"name":"Viewer Name"}'),
  ('a0000000-0000-0000-0000-000000000003', '900000000000000003@dev.invalid', '{"name":"Stranger Name"}'),
  ('a0000000-0000-0000-0000-000000000004', 'real@example.com', '{"custom_claims":{"global_name":"Real Discord"}}'),
  ('a0000000-0000-0000-0000-000000000006', '900000000000000006@dev.invalid', '{"name":"Leaver"}'),
  ('a0000000-0000-0000-0000-000000000010', '900000000000000010@dev.invalid', null),
  ('a0000000-0000-0000-0000-000000000011', '900000000000000011@dev.invalid', null),
  ('a0000000-0000-0000-0000-000000000012', '900000000000000012@dev.invalid', '{"name":"Newbie"}'),
  ('a0000000-0000-0000-0000-000000000013', '900000000000000013@dev.invalid', null),
  ('a0000000-0000-0000-0000-000000000014', '900000000000000014@dev.invalid', null),
  ('a0000000-0000-0000-0000-000000000015', '900000000000000015@dev.invalid', null),
  ('a0000000-0000-0000-0000-000000000016', '900000000000000016@dev.invalid', null),
  ('a0000000-0000-0000-0000-000000000090', 'abc@dev.invalid', null),
  ('a0000000-0000-0000-0000-000000000091', '900000000000000091@example.com', null);

insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('900000000000000004', 'a0000000-0000-0000-0000-000000000004', '{}', 'discord'),
  ('900000000000000099', 'a0000000-0000-0000-0000-000000000003', '{}', 'discord');

insert into public.app_config (key, value) values ('dev_signin', 'on')
on conflict (key) do update set value = excluded.value;

insert into public.whitelist (discord_id, label, is_admin) values
  ('900000000000000001', 'Test Admin', true),
  ('900000000000000002', 'Viewer', false),
  ('900000000000000004', 'Discord Real', false),
  ('900000000000000006', 'Leaver', false),
  ('900000000000000010', 'Whatever', false),
  ('900000000000000011', ' zed ', false),
  ('900000000000000012', null, false),
  ('900000000000000013', 'Twin', false),
  ('900000000000000014', 'Yan', false),
  ('900000000000000015', 'Yan', false),
  ('900000000000000016', 'Whatever', false);

insert into public.people (display_name, discord_id, seed_key) values
  ('Linked by ID', '900000000000000010', 'linked-by-id');
insert into public.people (display_name, seed_key) values
  ('Zed', 'zed'), ('Yan', 'yan'), ('Twin', 'twin-1'), ('Twin', 'twin-2');
-- A person who already holds the Discord ID of 016 under a different sign-in.
insert into public.people (display_name, discord_id, auth_user_id) values
  ('Taken', '900000000000000016', 'a0000000-0000-0000-0000-000000000090');

create temp table baseline as select coalesce(max(id), 0) as last_id from public.edit_log;
grant select on baseline to anon, authenticated;

-- 1. Signed out (anon role) -------------------------------------------------------
select pg_temp.act_anon();

select throws_ok($$select * from public.whitelist$$, '42501', null, 'signed out: whitelist is not readable');
select throws_ok($$select * from public.people$$, '42501', null, 'signed out: people is not readable');
select throws_ok($$select * from public.edit_log$$, '42501', null, 'signed out: edit_log is not readable');
select throws_ok($$select * from public.app_config$$, '42501', null, 'signed out: app_config is not readable');
select throws_ok($$select public.whitelist_add('900000000000000050')$$, '42501', null, 'signed out: whitelist_add is refused');
select throws_ok($$select public.whitelist_add_many('[]'::jsonb)$$, '42501', null, 'signed out: whitelist_add_many is refused');
select throws_ok($$select public.whitelist_label('900000000000000002', 'x')$$, '42501', null, 'signed out: whitelist_label is refused');
select throws_ok($$select public.whitelist_remove('900000000000000002')$$, '42501', null, 'signed out: whitelist_remove is refused');
select throws_ok($$select public.whitelist_set_admin('900000000000000002', true)$$, '42501', null, 'signed out: whitelist_set_admin is refused');
select throws_ok($$select public.ensure_person()$$, '42501', null, 'signed out: ensure_person is refused');
select is((select public.whoami()), '{"signed_in": false, "whitelisted": false, "is_admin": false, "roles": []}'::jsonb,
  'signed out: whoami says signed out and nothing else');

-- 2. Signed in but not whitelisted ------------------------------------------------
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');

select is((select count(*) from public.whitelist), 0::bigint, 'not whitelisted: whitelist shows no rows');
select is((select count(*) from public.people), 0::bigint, 'not whitelisted: people shows no rows');
select is((select count(*) from public.edit_log), 0::bigint, 'not whitelisted: edit_log shows no rows');
select throws_ok($$select * from public.app_config$$, '42501', null, 'not whitelisted: app_config is not readable');
select is(app.is_whitelisted(), false, 'not whitelisted: is_whitelisted is false');
select is(app.is_admin(), false, 'not whitelisted: is_admin is false');
select is(app.discord_id(), '900000000000000099', 'not whitelisted: the Discord identity still resolves');
select throws_ok($$select public.whitelist_add('900000000000000050')$$, '42501', null, 'not whitelisted: whitelist_add is refused');
select throws_ok($$select public.whitelist_add_many('[]'::jsonb)$$, '42501', null, 'not whitelisted: whitelist_add_many is refused');
select throws_ok($$select public.whitelist_label('900000000000000002', 'x')$$, '42501', null, 'not whitelisted: whitelist_label is refused');
select throws_ok($$select public.whitelist_remove('900000000000000002')$$, '42501', null, 'not whitelisted: whitelist_remove is refused');
select throws_ok($$select public.whitelist_set_admin('900000000000000002', true)$$, '42501', null, 'not whitelisted: whitelist_set_admin is refused');
select throws_ok($$select public.ensure_person()$$, '42501', 'This Discord account is not on the whitelist.', 'not whitelisted: ensure_person is refused');
select is((select public.whoami()),
  '{"signed_in": true, "discord_id": "900000000000000099", "discord_name": "Stranger Name", "whitelisted": false, "is_admin": false, "person_id": null, "display_name": null, "roles": []}'::jsonb,
  'not whitelisted: whoami gives the Discord name, no role and no league data');

-- 3. Viewer (whitelisted, not admin) ---------------------------------------------
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');

select is(app.is_whitelisted(), true, 'viewer: is_whitelisted is true');
select is(app.is_admin(), false, 'viewer: is_admin is false');
select is(app.person_id(), null, 'viewer: no person row yet, so no person id');
select is((select public.ensure_person()).display_name, 'Viewer', 'viewer: ensure_person creates a person named by the label');
select is((select count(*) from public.people), 7::bigint, 'viewer: people is readable');
select is((select count(*) from public.whitelist), 0::bigint, 'viewer: whitelist shows no rows');
select is((select count(*) from public.edit_log), 0::bigint, 'viewer: edit_log shows no rows');
select throws_ok($$select * from public.app_config$$, '42501', null, 'viewer: app_config is not readable');
select throws_ok($$select public.whitelist_add('900000000000000050')$$, '42501', 'Only an admin can do this.', 'viewer: whitelist_add is refused');
select throws_ok($$select public.whitelist_add_many('[{"discord_id":"900000000000000050"}]'::jsonb)$$, '42501', 'Only an admin can do this.', 'viewer: whitelist_add_many is refused');
select throws_ok($$select public.whitelist_label('900000000000000002', 'x')$$, '42501', 'Only an admin can do this.', 'viewer: whitelist_label is refused');
select throws_ok($$select public.whitelist_remove('900000000000000004')$$, '42501', 'Only an admin can do this.', 'viewer: whitelist_remove is refused');
select throws_ok($$select public.whitelist_set_admin('900000000000000002', true)$$, '42501', 'Only an admin can do this.', 'viewer: whitelist_set_admin is refused');
select throws_ok($$insert into public.whitelist (discord_id) values ('900000000000000050')$$, '42501', null, 'viewer: no direct insert into whitelist');
select throws_ok($$update public.whitelist set is_admin = true$$, '42501', null, 'viewer: no direct update of whitelist');
select throws_ok($$delete from public.whitelist$$, '42501', null, 'viewer: no direct delete from whitelist');
select throws_ok($$insert into public.people (display_name) values ('Sneaky')$$, '42501', null, 'viewer: no direct insert into people');
select throws_ok($$update public.people set display_name = 'Sneaky'$$, '42501', null, 'viewer: no direct update of people');
select throws_ok($$delete from public.people$$, '42501', null, 'viewer: no direct delete from people');
select throws_ok($$insert into public.edit_log (table_name, action) values ('x', 'insert')$$, '42501', null, 'viewer: no direct insert into edit_log');
select throws_ok($$insert into public.app_config (key, value) values ('dev_signin', 'on')$$, '42501', null, 'viewer: no direct insert into app_config');
select is((select public.whoami() -> 'roles'), '["viewer"]'::jsonb, 'viewer: whoami roles is viewer only');

-- 4. Admin ----------------------------------------------------------------------
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');

select is(app.is_admin(), true, 'admin: is_admin is true');
select is((select public.ensure_person()).display_name, 'Test Admin', 'admin: ensure_person creates a person named by the label');
select is((select count(*) from public.whitelist), 11::bigint, 'admin: whitelist is readable');
select ok((select count(*) from public.edit_log) > 0, 'admin: edit_log is readable');
select throws_ok($$select * from public.app_config$$, '42501', null, 'admin: app_config is still not readable by the API');
select is((select public.whoami() -> 'roles'), '["viewer", "admin"]'::jsonb, 'admin: whoami roles are viewer and admin');
select throws_ok($$insert into public.whitelist (discord_id) values ('900000000000000050')$$, '42501', null, 'admin: no direct insert into whitelist either');
select throws_ok($$update public.people set display_name = 'Sneaky'$$, '42501', null, 'admin: no direct update of people either');

-- Add one
select is((select (public.whitelist_add('900000000000000020', '  Twenty ')).label), 'Twenty', 'admin: whitelist_add adds an entry and trims the label');
select is((select added_by from public.whitelist where discord_id = '900000000000000020'),
  (select id from public.people where auth_user_id = 'a0000000-0000-0000-0000-000000000001'),
  'admin: the entry records who added it');
select is((select label from public.whitelist where discord_id = (select (public.whitelist_add('900000000000000021')).discord_id)), null,
  'admin: a missing label is stored as null');
select throws_ok($$select public.whitelist_add('900000000000000020')$$, '23505', '900000000000000020 is already on the whitelist.', 'admin: a duplicate is refused and named');
select throws_ok($$select public.whitelist_add('12ab')$$, '22023', '"12ab": Not a Discord user ID. Use digits only, 15 to 20 of them.', 'admin: a bad ID is refused and named');
select throws_ok($$select public.whitelist_add('   ')$$, '22023', null, 'admin: an empty ID is refused');
select throws_ok($$select public.whitelist_add('123')$$, '22023', null, 'admin: a too short ID is refused');

-- Paste many: five lines, one bad, nothing added
select throws_like($q$select public.whitelist_add_many('[
  {"discord_id":"900000000000000030","label":"A"},
  {"discord_id":"900000000000000031"},
  {"discord_id":"12ab","label":"Bad"},
  {"discord_id":"900000000000000033"},
  {"discord_id":"900000000000000034"}]'::jsonb)$q$,
  'Nothing was added. Row 3 (12ab): %', 'admin: a paste with one bad line names that row');
select is((select count(*) from public.whitelist where discord_id like '90000000000000003_'), 0::bigint, 'admin: the failed paste added none of the good lines');
select is(pg_temp.err_detail($q$select public.whitelist_add_many('[
  {"discord_id":"900000000000000030"},{"discord_id":"12ab"},{"discord_id":"900000000000000030"},{"discord_id":"900000000000000002"}]'::jsonb)$q$)::jsonb,
  '[{"row": 2, "discord_id": "12ab", "problem": "Not a Discord user ID. Use digits only, 15 to 20 of them."},
    {"row": 3, "discord_id": "900000000000000030", "problem": "Repeats row 1 in this list."},
    {"row": 4, "discord_id": "900000000000000002", "problem": "Already on the whitelist."}]'::jsonb,
  'admin: the error detail lists every bad row, repeats and existing entries included');
select is((select public.whitelist_add_many('[
  {"discord_id":"900000000000000030","label":"A"},
  {"discord_id":"900000000000000031"},
  {"discord_id":" 900000000000000033 ","label":"  "},
  {"discord_id":"900000000000000034","label":"D"}]'::jsonb)), 4, 'admin: after correction the four lines are added');
select is((select label from public.whitelist where discord_id = '900000000000000033'), null, 'admin: a blank label in a paste is stored as null');
select throws_ok($$select public.whitelist_add_many('{"discord_id":"1"}'::jsonb)$$, '22023', 'Expected a list of entries.', 'admin: a paste that is not a list is refused');
select is((select public.whitelist_add_many('[]'::jsonb)), 0, 'admin: an empty paste adds nothing');

-- Label, admin flag, remove
select is((select (public.whitelist_label('900000000000000030', 'Renamed')).label), 'Renamed', 'admin: whitelist_label edits a label');
select is((select (public.whitelist_label('900000000000000030', '  ')).label), null, 'admin: a blank label clears it');
select throws_ok($$select public.whitelist_label('900000000000000777', 'x')$$, 'P0002', '900000000000000777 is not on the whitelist.', 'admin: labelling an unknown ID names it');
select is((select (public.whitelist_set_admin('900000000000000002', true)).is_admin), true, 'admin: whitelist_set_admin makes an admin');
select is((select (public.whitelist_set_admin('900000000000000002', false)).is_admin), false, 'admin: whitelist_set_admin removes an admin');
select throws_ok($$select public.whitelist_set_admin('900000000000000777', true)$$, 'P0002', null, 'admin: set_admin on an unknown ID names it');
select throws_like($$select public.whitelist_set_admin('900000000000000001', false)$$, 'Cannot remove the last admin%', 'admin: the last admin cannot be demoted');
select throws_like($$select public.whitelist_remove('900000000000000001')$$, 'Cannot remove the last admin%', 'admin: the last admin cannot be removed');
select lives_ok($$select public.whitelist_remove('900000000000000034')$$, 'admin: whitelist_remove removes an entry');
select is((select count(*) from public.whitelist where discord_id = '900000000000000034'), 0::bigint, 'admin: the removed entry is gone');
select throws_ok($$select public.whitelist_remove('900000000000000777')$$, 'P0002', null, 'admin: removing an unknown ID names it');

-- Removing an entry cuts a live session at its next read
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000006');
select is((select public.ensure_person()).display_name, 'Leaver', 'session: the viewer signs in and gets a person');
select ok((select count(*) from public.people) > 0, 'session: the viewer reads people before removal');
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select lives_ok($$select public.whitelist_remove('900000000000000006')$$, 'session: the admin removes the viewer from the whitelist');
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000006');
select is((select count(*) from public.people), 0::bigint, 'session: the same session reads nothing on its next request');
select is(app.is_whitelisted(), false, 'session: the same session is no longer whitelisted');
select is(app.person_id(), null, 'session: the person row left behind grants no person id');
select is((select public.whoami() -> 'whitelisted'), 'false'::jsonb, 'session: whoami reports not whitelisted');
select throws_ok($$select public.ensure_person()$$, '42501', null, 'session: ensure_person is refused');
reset role;
select is((select count(*) from public.people where display_name = 'Leaver'), 1::bigint, 'session: the removed person keeps their person row');

-- 5. ensure_person --------------------------------------------------------------
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000010');
select is((select public.ensure_person()).display_name, 'Linked by ID', 'ensure_person: links a seeded person by Discord ID');
select is((select auth_user_id from public.people where display_name = 'Linked by ID'), 'a0000000-0000-0000-0000-000000000010'::uuid, 'ensure_person: the link stores the sign-in');

reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000011');
select is((select public.ensure_person()).display_name, 'Zed', 'ensure_person: links by whitelist label, ignoring case and spaces');
select is((select discord_id from public.people where display_name = 'Zed'), '900000000000000011', 'ensure_person: a label link also stores the Discord ID');

reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000012');
select is((select public.ensure_person()).display_name, 'Newbie', 'ensure_person: creates a person from the Discord name when there is no label');

reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000013');
select is((select count(*) from public.people where display_name = 'Twin'), 2::bigint, 'ensure_person: two seeded Twins exist before sign-in');
select is((select public.ensure_person()).display_name, 'Twin', 'ensure_person: an ambiguous label still gives the caller a person');
select is((select count(*) from public.people where display_name = 'Twin'), 3::bigint, 'ensure_person: an ambiguous label creates a new person');
select is((select count(*) from public.people where display_name = 'Twin' and auth_user_id is null), 2::bigint, 'ensure_person: an ambiguous label links neither seeded person');

reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000014');
select is((select public.ensure_person()).display_name, 'Yan', 'ensure_person: the first Yan signs in');
select is((select auth_user_id from public.people where seed_key = 'yan'), 'a0000000-0000-0000-0000-000000000014'::uuid, 'ensure_person: the first Yan takes the seeded Yan');
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000015');
select is((select public.ensure_person()).seed_key, null, 'ensure_person: a second Yan label gets a new person, not the taken seed');

reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000016');
select throws_like($$select public.ensure_person()$$, 'This Discord ID is already linked to another sign-in.%', 'ensure_person: an ID already linked to another sign-in is refused');

-- Twice changes nothing
reset role;
create temp table before_again as
  select (select count(*) from public.people) as people_count,
         (select max(id) from public.edit_log) as last_log,
         (select to_jsonb(p) from public.people p where seed_key = 'zed') as zed;
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000011');
select is((select (public.ensure_person()).id), (select id from public.people where seed_key = 'zed'), 'ensure_person: a second call returns the same person');
reset role;
select is((select count(*) from public.people), (select people_count from before_again), 'ensure_person: a second call adds no person');
select is((select max(id) from public.edit_log), (select last_log from before_again), 'ensure_person: a second call writes no log row');
select is((select to_jsonb(p) from public.people p where seed_key = 'zed'), (select zed from before_again), 'ensure_person: a second call changes no value');

-- 6. The audit log --------------------------------------------------------------
reset role;
select is((select count(*) from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'whitelist' and l.action = 'insert' and l.row_key = '900000000000000020'),
  1::bigint, 'log: the single add is logged once with the row key');
select is((select actor_person_id from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'whitelist' and l.action = 'insert' and l.row_key = '900000000000000020'),
  (select id from public.people where auth_user_id = 'a0000000-0000-0000-0000-000000000001'), 'log: the add records the admin as the actor');
select is((select count(*) from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'whitelist' and l.action = 'insert' and l.row_key in ('900000000000000030', '900000000000000031', '900000000000000033', '900000000000000034')),
  4::bigint, 'log: each line of a paste is logged');
select is((select (new ->> 'label') from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'whitelist' and l.action = 'update' and l.row_key = '900000000000000030' order by l.id limit 1),
  'Renamed', 'log: a label edit is logged with the new value');
select is((select (old ->> 'label') from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'whitelist' and l.action = 'update' and l.row_key = '900000000000000030' order by l.id limit 1),
  'A', 'log: a label edit is logged with the old value');
select is((select count(*) from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'whitelist' and l.action = 'update' and l.row_key = '900000000000000002' and (new ->> 'is_admin') = 'true'),
  1::bigint, 'log: granting admin is logged');
select is((select count(*) from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'whitelist' and l.action = 'update' and l.row_key = '900000000000000002' and (new ->> 'is_admin') = 'false'),
  1::bigint, 'log: removing admin is logged');
select is((select count(*) from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'whitelist' and l.action = 'delete' and l.row_key = '900000000000000034' and new is null and (old ->> 'label') = 'D'),
  1::bigint, 'log: a removal is logged with the old row and no new row');
select is((select actor_person_id from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'whitelist' and l.action = 'delete' and l.row_key = '900000000000000034'),
  (select id from public.people where auth_user_id = 'a0000000-0000-0000-0000-000000000001'), 'log: the removal records the admin as the actor');
select is((select count(*) from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'people' and l.action = 'insert' and (new ->> 'display_name') = 'Newbie' and l.actor_person_id = l.row_key::uuid),
  1::bigint, 'log: a person created at sign-in is logged with themselves as the actor');
select is((select count(*) from public.edit_log l, baseline b where l.id > b.last_id and l.table_name = 'people' and l.action = 'update' and (new ->> 'display_name') = 'Zed' and (old ->> 'auth_user_id') is null and (new ->> 'auth_user_id') is not null),
  1::bigint, 'log: linking a seeded person is logged with the old and new values');

-- The log cannot be changed or removed by anyone
reset role;
select throws_like($$update public.edit_log set table_name = 'x'$$, 'edit_log is append only.', 'append only: the owner cannot update a log row');
select throws_like($$delete from public.edit_log$$, 'edit_log is append only.', 'append only: the owner cannot delete a log row');
select throws_like($$truncate public.edit_log$$, 'edit_log is append only.', 'append only: the owner cannot truncate the log');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select throws_ok($$update public.edit_log set table_name = 'x'$$, '42501', null, 'append only: the admin cannot update a log row');
select throws_ok($$delete from public.edit_log$$, '42501', null, 'append only: the admin cannot delete a log row');
select throws_ok($$truncate public.edit_log$$, '42501', null, 'append only: the admin cannot truncate the log');
reset role;
set local role service_role;
select throws_ok($$update public.edit_log set table_name = 'x'$$, '42501', null, 'append only: the service role cannot update a log row');
select throws_ok($$delete from public.edit_log$$, '42501', null, 'append only: the service role cannot delete a log row');
reset role;
select pg_temp.act_anon();
select throws_ok($$delete from public.edit_log$$, '42501', null, 'append only: a signed-out caller cannot delete a log row');
reset role;

-- 7. The dev sign-in fallback ---------------------------------------------------
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
select is(app.discord_id(), '900000000000000099', 'identity: a Discord identity is the source of the ID');
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select is(app.discord_id(), '900000000000000001', 'dev fallback: reads the ID from <id>@dev.invalid while dev_signin is on');
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
select is(app.discord_id(), '900000000000000004', 'identity: a real Discord identity gives the ID');
select is(app.is_whitelisted(), true, 'identity: a real Discord identity is checked against the whitelist');
reset role;

update public.app_config set value = 'off' where key = 'dev_signin';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select is(app.discord_id(), null, 'dev fallback: null when dev_signin is not on');
select is(app.is_whitelisted(), false, 'dev fallback: so a stand-in sign-in is not whitelisted');
reset role;

delete from public.app_config where key = 'dev_signin';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select is(app.discord_id(), null, 'dev fallback: null when app_config has no row');
select is(app.is_admin(), false, 'dev fallback: so even a whitelisted admin ID is not an admin');
select is((select count(*) from public.people), 0::bigint, 'dev fallback: and reads nothing');
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
select is(app.discord_id(), '900000000000000004', 'identity: a real Discord identity still works with no app_config row');
reset role;

insert into public.app_config (key, value) values ('dev_signin', 'on');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000090');
select is(app.discord_id(), null, 'dev fallback: an email that is not all digits gives no ID');
reset role;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000091');
select is(app.discord_id(), null, 'dev fallback: only the dev.invalid domain is honoured');
reset role;

-- 8. The table pattern, checked over the whole public schema ---------------------
-- These guard every later commit: a new table or function that skips the pattern
-- fails here. Extension-owned objects (pgTAP itself) are ignored.
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')),
  0::bigint, 'pattern: every public table has row-level security on');

select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace,
                 unnest(array['anon', 'authenticated']) r, unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
            where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')
              and has_table_privilege(r, c.oid, p)
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')),
  0::bigint, 'pattern: no public table gives a client role a write privilege');

select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, 'SELECT')
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')),
  0::bigint, 'pattern: the signed-out role can select from no public table');

select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname <> 'whoami' and has_function_privilege('anon', p.oid, 'EXECUTE')
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  0::bigint, 'pattern: the signed-out role can execute no public function except whoami');

select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'app') and p.prosecdef
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  0::bigint, 'pattern: every security definer function pins its search path');

select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0::bigint, 'pattern: the signed-out role can execute nothing in the app schema');

select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not in ('edit_log', 'app_config')
              and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgfoid = 'app.audit_row'::regproc)),
  0::bigint, 'pattern: every league table has the audit trigger');

select * from finish();

rollback;
