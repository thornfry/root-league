-- D5: story 12 pick'ems, story 11 permissions, ADR 19 and 44.
-- First pick scores 3, second 1, each pick on its own. Only recorded and settled
-- games score. A game takes picks until it has a submission, a settlement or is
-- void; other people's picks are hidden until then. No fixture depends on seed.sql.
begin;
select plan(114);
grant all on all tables in schema pg_temp to anon, authenticated, service_role;
grant all on all sequences in schema pg_temp to anon, authenticated, service_role;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('d5000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.act_as(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',pg_temp.id(n),'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',pg_temp.id(n)::text,true);
  perform set_config('role','authenticated',true);
end $$;
-- Points of one person's pick on one game as first, second, total.
create function pg_temp.pts(g integer, n integer) returns integer[] language sql as $$
  select array[first_points, second_points, points] from public.pickem_scores
  where game_id = pg_temp.id(g) and person_id = pg_temp.id(n)
$$;
create function pg_temp.board(n integer) returns bigint[] language sql as $$
  select array[points, rank] from public.leaderboard where person_id = pg_temp.id(n)
$$;
insert into public.app_config(key,value) values ('dev_signin','on') on conflict(key) do update set value='on';
-- 1 admin (unseated at 100, 101, 103, 104, seated at 102); 2..5 seated at 100, 101, 103
-- and 104; 2..4 also at 102; 6 other league player; 7 waitlisted prospect; 8 viewer;
-- 9 signed in but not invited.
insert into auth.users(id,email) select pg_temp.id(n), ('950000000000000000'::bigint+n)::text || '@dev.invalid' from generate_series(1,9) n;
insert into public.whitelist(discord_id,label,is_admin)
  select ('950000000000000000'::bigint+n)::text,'D5 '||n,n=1 from generate_series(1,8) n;
insert into public.people(id,auth_user_id,display_name,discord_id)
  select pg_temp.id(n),pg_temp.id(n),'D5 '||n,('950000000000000000'::bigint+n)::text from generate_series(1,9) n;
insert into public.seasons(id,slug,name,started_at) values(pg_temp.id(90),'d5-test','D5',now());
insert into public.roster(season_id,person_id,list,position)
  select pg_temp.id(90),pg_temp.id(n),case when n=7 then 'waitlist' else 'league' end,n from generate_series(1,7) n;
insert into public.games(id,season_id,game_no,map_index)
  select pg_temp.id(n),pg_temp.id(90),n-99,0 from generate_series(100,104) n;
insert into public.game_seats(game_id,seat,person_id,faction)
  select pg_temp.id(g),n-1,pg_temp.id(n),'cats' from unnest(array[100,101,103,104]) g cross join generate_series(2,5) n;
insert into public.game_seats(game_id,seat,person_id,faction)
  select pg_temp.id(102),n,pg_temp.id(n),'cats' from generate_series(1,4) n;
create temp table baseline as select coalesce(max(id),0) as last_id from public.edit_log;
grant select on baseline to authenticated;

-- 1. Making and changing picks while a game is open --------------------------------
reset role; select pg_temp.act_as(8);
select lives_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(2),pg_temp.id(3))$q$, 'a viewer picks a first and a second');
select is((select array[first_pick,second_pick] from public.picks where game_id=pg_temp.id(100) and person_id=pg_temp.id(8)), array[pg_temp.id(2),pg_temp.id(3)], 'the picks are stored');
select lives_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(3),null)$q$, 'picks change while the game is open and the second can be dropped');
select is((select array[first_pick,second_pick] from public.picks where game_id=pg_temp.id(100) and person_id=pg_temp.id(8)), array[pg_temp.id(3),null]::uuid[], 'the change replaced the row');
select is((select count(*) from public.picks where game_id=pg_temp.id(100) and person_id=pg_temp.id(8)), 1::bigint, 'one row per person per game');
select lives_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(2),pg_temp.id(3))$q$, 'the picks can be set again');
select throws_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(2),pg_temp.id(2))$q$, '22023', null, 'first and second must differ');
select throws_ok($q$select public.save_pick(pg_temp.id(100),null,pg_temp.id(2))$q$, '22023', null, 'a first pick is required');
select throws_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(6),pg_temp.id(2))$q$, '22023', null, 'the first pick must be seated at the game');
select throws_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(2),pg_temp.id(6))$q$, '22023', null, 'the second pick must be seated at the game');
select throws_ok($q$select public.save_pick(pg_temp.id(999),pg_temp.id(2),null)$q$, 'P0002', null, 'an unknown game is refused');
select throws_ok($q$insert into public.picks(game_id,person_id,first_pick) values(pg_temp.id(101),pg_temp.id(8),pg_temp.id(2))$q$, '42501', null, 'a client cannot write the table directly');
select lives_ok($q$select public.save_pick(pg_temp.id(102),pg_temp.id(2),null)$q$, 'a viewer may pick on a game with no second pick');
reset role; select pg_temp.act_as(6);
select lives_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(3),pg_temp.id(2))$q$, 'a league player picks a game they are not in');
select lives_ok($q$select public.save_pick(pg_temp.id(102),pg_temp.id(2),null)$q$, 'a league player picks another open game');
reset role; select pg_temp.act_as(7);
select lives_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(4),pg_temp.id(5))$q$, 'a waitlisted prospect picks');
reset role; select pg_temp.act_as(1);
select lives_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(5),null)$q$, 'an admin not seated at the game picks');
select throws_ok($q$select public.save_pick(pg_temp.id(102),pg_temp.id(2),null)$q$, '42501', null, 'an admin seated at the game cannot pick it');
select is((select count(*) from public.picks where game_id=pg_temp.id(102) and person_id=pg_temp.id(1)), 0::bigint, 'the seated admin has no pick on their own game');

-- 2. Own games are refused and the gate holds ---------------------------------------
reset role; select pg_temp.act_as(2);
select throws_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(3),null)$q$, '42501', null, 'a seated player cannot pick their own game');
select throws_ok($q$select public.save_pick(pg_temp.id(102),pg_temp.id(3),null)$q$, '42501', null, 'a seated player cannot pick another game they sit at');
select is((select count(*) from public.picks where person_id=pg_temp.id(2)), 0::bigint, 'the seated player has no pick');
reset role; select pg_temp.act_as(9);
select throws_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(2),null)$q$, '42501', null, 'a signed-in account that is not invited cannot pick');
select is((select count(*) from public.picks), 0::bigint, 'and reads no picks');
select is((select count(*) from public.pickem_scores), 0::bigint, 'and reads no scores');
select is((select count(*) from public.leaderboard), 0::bigint, 'and reads no leaderboard');
reset role; set local role anon;
select throws_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(2),null)$q$, '42501', null, 'signed-out access refused');
select throws_ok($q$select * from public.picks$q$, '42501', null, 'signed-out access refused');
select throws_ok($q$select * from public.pickem_scores$q$, '42501', null, 'signed-out access refused');
select throws_ok($q$select * from public.leaderboard$q$, '42501', null, 'signed-out access refused');

-- 3. Other people's picks are hidden while the game is open ------------------------
reset role; select pg_temp.act_as(8);
select is((select count(*) from public.picks), 2::bigint, 'a viewer reads only their own open picks');
select is((select count(*) from public.picks where person_id<>pg_temp.id(8)), 0::bigint, 'no one else''s open pick is visible');
select is((select count(*) from public.pickem_scores where person_id<>pg_temp.id(8)), 0::bigint, 'nor their scores');
reset role; select pg_temp.act_as(2);
select is((select count(*) from public.picks where game_id=pg_temp.id(100)), 0::bigint, 'a seated player cannot see who picked their game');
reset role; select pg_temp.act_as(6);
select is((select count(*) from public.picks where game_id=pg_temp.id(100)), 1::bigint, 'a league player sees only their own pick');
reset role; select pg_temp.act_as(1);
select is((select count(*) from public.picks where game_id=pg_temp.id(100)), 4::bigint, 'the admin reads every pick while the game is open');
select is((select count(*) from public.pickem_scores where game_id=pg_temp.id(100)), 4::bigint, 'and every score row');
select is((select count(*) from public.edit_log where id>(select last_id from baseline) and table_name='picks' and actor_person_id=pg_temp.id(8)), 4::bigint, 'each viewer pick write has a log row with the actor');
select is((select old->>'second_pick' from public.edit_log where id>(select last_id from baseline) and table_name='picks' and action='update' and actor_person_id=pg_temp.id(8) order by id limit 1), pg_temp.id(3)::text, 'an update logs the old row');
select is((select row_key from public.edit_log where id>(select last_id from baseline) and table_name='picks' and action='insert' order by id limit 1), pg_temp.id(100)||','||pg_temp.id(8), 'the log row key is game and person');
reset role; select pg_temp.act_as(8);
select is(pg_temp.board(8), array[0,1]::bigint[], 'a person with only open picks is on the board with 0 points');

-- 4. A first submission closes the game, shows the picks and scores them -----------
reset role; select pg_temp.act_as(2);
select lives_ok($q$select public.submit_result(pg_temp.id(100),array[pg_temp.id(2)]::uuid[])$q$, 'a player records the result');
reset role; select pg_temp.act_as(8);
select throws_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(4),null)$q$, '55000', null, 'a recorded game takes no picks');
select is((select first_pick from public.picks where game_id=pg_temp.id(100) and person_id=pg_temp.id(8)), pg_temp.id(2), 'the refused change left the pick alone');
select is((select count(*) from public.picks where game_id=pg_temp.id(100)), 4::bigint, 'every pick on the game is now visible to a viewer');
select is(pg_temp.pts(100,8), array[3,0,3], 'first pick that wins scores 3');
select is(pg_temp.pts(100,6), array[0,1,1], 'second pick that wins scores 1');
select is(pg_temp.pts(100,7), array[0,0,0], 'a pick that loses scores 0');
select is(pg_temp.pts(100,1), array[0,0,0], 'an admin pick scores like any other');
select is((select count(*) from public.pickem_scores where game_id=pg_temp.id(100)), 4::bigint, 'every score row is visible once closed');
reset role; select pg_temp.act_as(2);
select is((select count(*) from public.picks where game_id=pg_temp.id(100)), 4::bigint, 'a seated player sees the picks once closed');
reset role; select pg_temp.act_as(9);
select is((select count(*) from public.picks), 0::bigint, 'an account that is not invited still sees none');

-- 5. Two winners score each pick on its own ------------------------------------------
reset role; select pg_temp.act_as(2);
select lives_ok($q$select public.submit_result(pg_temp.id(100),array[pg_temp.id(2),pg_temp.id(3)]::uuid[])$q$, 'the result changes to two winners');
select is(pg_temp.pts(100,8), array[3,1,4], 'first and second both win: 4 points');
select is(pg_temp.pts(100,6), array[3,1,4], 'second and first both win for another person: 4 points');
select is(pg_temp.pts(100,7), array[0,0,0], 'a pick on a loser still scores 0');

-- 6. A disputed game scores nothing until it is settled ------------------------------
reset role; select pg_temp.act_as(3);
select lives_ok($q$select public.submit_result(pg_temp.id(100),array[pg_temp.id(4)]::uuid[])$q$, 'a different answer disputes the game');
reset role; select pg_temp.act_as(8);
select is((select state from public.pickem_scores where game_id=pg_temp.id(100) and person_id=pg_temp.id(8)), 'disputed', 'the score row reports the disputed state');
select is(pg_temp.pts(100,8), array[0,0,0], 'a disputed game scores nothing');
select is(pg_temp.pts(100,6), array[0,0,0], 'for every pick');
select is(pg_temp.board(8), array[0,1]::bigint[], 'the leaderboard has no points from it');
select throws_ok($q$select public.save_pick(pg_temp.id(100),pg_temp.id(4),null)$q$, '55000', null, 'a disputed game takes no picks');
select is((select count(*) from public.picks where game_id=pg_temp.id(100)), 4::bigint, 'the picks stay visible');
reset role; select pg_temp.act_as(1);
select lives_ok($q$select public.settle_game(pg_temp.id(100),array[pg_temp.id(4)])$q$, 'the admin settles on the disputer''s answer');
select is(pg_temp.pts(100,7), array[3,0,3], 'settling scores the first pick on the settled winner');
select is(pg_temp.pts(100,8), array[0,0,0], 'and rescores the others');
select is(pg_temp.pts(100,6), array[0,0,0], 'with nothing left over from the earlier answer');
select lives_ok($q$select public.reopen_game(pg_temp.id(100))$q$, 'the admin reopens it to the dispute');
select is(pg_temp.pts(100,7), array[0,0,0], 'reopening pauses scoring again');
select lives_ok($q$select public.settle_game(pg_temp.id(100),array[pg_temp.id(4)])$q$, 'and settling again scores again');
select is(pg_temp.pts(100,7), array[3,0,3], 'the same points return');

-- 7. A settlement with no player submission closes a game too --------------------------
reset role; select pg_temp.act_as(8);
select lives_ok($q$select public.save_pick(pg_temp.id(101),pg_temp.id(4),pg_temp.id(2))$q$, 'a viewer picks a second game');
reset role; select pg_temp.act_as(6);
select lives_ok($q$select public.save_pick(pg_temp.id(101),pg_temp.id(5),null)$q$, 'a league player picks it too');
select is((select count(*) from public.picks where game_id=pg_temp.id(101)), 1::bigint, 'only their own pick shows while it is open');
reset role; select pg_temp.act_as(1);
select lives_ok($q$select public.submit_result(pg_temp.id(101),array[pg_temp.id(4)]::uuid[])$q$, 'the unseated admin enters a result, which settles it');
select is((select state from public.game_outcome where game_id=pg_temp.id(101)), 'settled', 'the game is settled');
select is(pg_temp.pts(101,8), array[3,0,3], 'settled games score');
reset role; select pg_temp.act_as(6);
select throws_ok($q$select public.save_pick(pg_temp.id(101),pg_temp.id(4),null)$q$, '55000', null, 'a settled game takes no picks');
select is((select count(*) from public.picks where game_id=pg_temp.id(101)), 2::bigint, 'and shows the picks');
reset role; select pg_temp.act_as(1);
select lives_ok($q$select public.reopen_game(pg_temp.id(101))$q$, 'reopening a settlement that has no submissions');
reset role; select pg_temp.act_as(6);
select lives_ok($q$select public.save_pick(pg_temp.id(101),pg_temp.id(5),pg_temp.id(2))$q$, 'leaves the game with no recorded result, so picks open again');
reset role; select pg_temp.act_as(1);
select lives_ok($q$select public.settle_game(pg_temp.id(101),array[pg_temp.id(4)])$q$, 'the admin settles it again');

-- 8. The leaderboard -------------------------------------------------------------------
reset role; select pg_temp.act_as(8);
select is(pg_temp.board(7), array[3,1]::bigint[], 'the prospect has 3 points');
select is(pg_temp.board(8), array[3,1]::bigint[], 'the viewer has 3 points and shares first place');
select is(pg_temp.board(6), array[0,3]::bigint[], 'rank skips after a tie');
select is(pg_temp.board(1), array[0,3]::bigint[], 'the admin shares the next rank');
select is((select count(*) from public.leaderboard where person_id in (select pg_temp.id(n) from generate_series(2,5) n) or person_id=pg_temp.id(9)), 0::bigint, 'people with no picks are not on it');
select is((select count(*) from public.leaderboard), 4::bigint, 'four people made picks');
select is((select array_agg(display_name order by display_name) from public.leaderboard), array['D5 1','D5 6','D5 7','D5 8'], 'rows carry display names');
reset role; select pg_temp.act_as(9);
select is((select count(*) from public.leaderboard), 0::bigint, 'an account that is not invited reads no leaderboard');

-- 9. A void game scores nothing and takes no picks ---------------------------------------
reset role; select pg_temp.act_as(8);
select lives_ok($q$select public.save_pick(pg_temp.id(103),pg_temp.id(2),pg_temp.id(3))$q$, 'a pick on a fourth game');
reset role; select pg_temp.act_as(2);
select lives_ok($q$select public.submit_result(pg_temp.id(103),array[pg_temp.id(2)]::uuid[])$q$, 'its result is recorded');
reset role; select pg_temp.act_as(8);
select is(pg_temp.board(8), array[6,1]::bigint[], 'the recorded game adds 3 points');
reset role; select pg_temp.act_as(1);
select lives_ok($q$select public.void_game(pg_temp.id(103),true)$q$, 'the admin voids it');
reset role; select pg_temp.act_as(8);
select is(pg_temp.pts(103,8), array[0,0,0], 'a void game scores nothing');
select is(pg_temp.board(8), array[3,1]::bigint[], 'and its points leave the leaderboard');
select throws_ok($q$select public.save_pick(pg_temp.id(103),pg_temp.id(2),null)$q$, '55000', null, 'a void game rejects a new pick');
reset role; select pg_temp.act_as(1);
select lives_ok($q$select public.void_game(pg_temp.id(103),false)$q$, 'the admin unvoids it');
reset role; select pg_temp.act_as(8);
select is(pg_temp.pts(103,8), array[3,0,3], 'unvoiding scores it again');
select is(pg_temp.board(8), array[6,1]::bigint[], 'and the leaderboard returns');
reset role; select pg_temp.act_as(1);
select lives_ok($q$select public.void_game(pg_temp.id(104),true)$q$, 'a game with no submission is voided');
reset role; select pg_temp.act_as(8);
select throws_ok($q$select public.save_pick(pg_temp.id(104),pg_temp.id(2),null)$q$, '55000', null, 'it rejects a new pick');
reset role; select pg_temp.act_as(1);
select lives_ok($q$select public.void_game(pg_temp.id(104),false)$q$, 'the admin unvoids it');
reset role; select pg_temp.act_as(8);
select lives_ok($q$select public.save_pick(pg_temp.id(104),pg_temp.id(2),null)$q$, 'it takes picks again');
select is(pg_temp.board(8), array[6,1]::bigint[], 'an open pick adds no points');
select is(pg_temp.board(7), array[3,2]::bigint[], 'ranks follow the new totals');

select lives_ok($q$select public.clear_pick(pg_temp.id(104))$q$, 'a viewer can clear their lone first pick');
select is((select count(*) from public.picks where game_id=pg_temp.id(104) and person_id=pg_temp.id(8)), 0::bigint, 'clearing removes the pick row');
select lives_ok($q$select public.clear_pick(pg_temp.id(104))$q$, 'clearing an already empty pick is safe to retry');
select lives_ok($q$select public.save_pick(pg_temp.id(104),pg_temp.id(3),null)$q$, 'a different first pick can be saved');
select throws_ok($q$select public.clear_pick(pg_temp.id(100))$q$, '55000', null, 'a closed game keeps its picks');
reset role; select pg_temp.act_as(2);
select throws_ok($q$select public.clear_pick(pg_temp.id(104))$q$, '42501', null, 'a seated player cannot clear a pick on their own game');
reset role; select pg_temp.act_as(9);
select throws_ok($q$select public.clear_pick(pg_temp.id(104))$q$, '42501', null, 'an uninvited account cannot clear picks');
reset role; set local role anon;
select throws_ok($q$select public.clear_pick(pg_temp.id(104))$q$, '42501', null, 'an anonymous account cannot clear picks');

select * from finish();
rollback;
