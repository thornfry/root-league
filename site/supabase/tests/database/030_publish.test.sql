-- D3 / story 7, story 8, permission table, league/pairing-rules.md.
-- Sample 12-player / 3-game schedule is transcribed from P2's checked fixture.
-- Rule 7 is interpreted as ADR 10 / P3: at least one of each type, never
-- Vagabond with Knaves. 3 militants + 1 insurgent is intentionally allowed.
begin;
select plan(70);
create function pg_temp.act_as(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub',who,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',who::text,true);
  perform set_config('role','authenticated',true);
end $$;
create function pg_temp.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('role','anon',true);
end $$;
insert into public.app_config(key,value) values ('dev_signin','on') on conflict(key) do update set value='on';

insert into auth.users(id,email) values ('d3000000-0000-0000-0000-000000000001','930000000000000001@dev.invalid');
insert into public.whitelist(discord_id,label,is_admin) values ('930000000000000001','D3 persona 1',true);
insert into auth.users(id,email) values ('d3000000-0000-0000-0000-000000000002','930000000000000002@dev.invalid');
insert into public.whitelist(discord_id,label,is_admin) values ('930000000000000002','D3 persona 2',false);
insert into auth.users(id,email) values ('d3000000-0000-0000-0000-000000000003','930000000000000003@dev.invalid');
update public.seasons set is_current=false where is_current;
insert into public.seasons(id,slug,name,is_current,capacity,games_each,maps,faction_pool,min_list_length,lists_lock_at) values ('d3000000-0000-0000-0000-000000000100','d3-test','D3',true,12,3,ARRAY['Winter','Autumn','Lake','Mountain'],ARRAY['cats','rats','badgers','moles','birds','frogs','otters','vagabond','knaves','bats','crows','WA','lizards'],3,now()-interval '1 day');
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000010','Alex');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000010','league',1,ARRAY['moles','rats','WA','vagabond','frogs'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000011','Will');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000011','league',2,ARRAY['birds','moles','lizards','bats','WA'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000012','Matt');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000012','league',3,ARRAY['WA','rats','birds','moles','vagabond'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000013','David');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000013','league',4,ARRAY['WA','knaves','vagabond','crows','moles','frogs'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000014','Delaney');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000014','league',5,ARRAY['rats','lizards','moles','frogs','cats'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000015','Kyra');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000015','league',6,ARRAY['knaves','vagabond','cats','moles','otters'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000016','Nick');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000016','league',7,ARRAY['crows','lizards','WA','birds','cats'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000017','Adam');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000017','league',8,ARRAY['cats','vagabond','birds','WA'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000018','Zach');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000018','league',9,ARRAY['rats','bats','cats','WA','crows'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000019','Anthony');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000019','league',10,ARRAY['rats','birds','cats','WA','vagabond'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000020','Chuck');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000020','league',11,ARRAY['cats','birds','WA','vagabond'],true);
insert into public.people(id,display_name) values ('d3000000-0000-0000-0000-000000000021','Corey');
insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ('d3000000-0000-0000-0000-000000000100','d3000000-0000-0000-0000-000000000021','league',12,ARRAY['vagabond','rats','otters','birds','cats'],true);
-- Original checked sample, with fixture UUIDs substituted for names.
create temp table draft as select 'd3000000-0000-0000-0000-000000000100'::uuid sid, ARRAY['d3000000-0000-0000-0000-000000000010'::uuid,'d3000000-0000-0000-0000-000000000011'::uuid,'d3000000-0000-0000-0000-000000000012'::uuid,'d3000000-0000-0000-0000-000000000013'::uuid,'d3000000-0000-0000-0000-000000000014'::uuid,'d3000000-0000-0000-0000-000000000015'::uuid,'d3000000-0000-0000-0000-000000000016'::uuid,'d3000000-0000-0000-0000-000000000017'::uuid,'d3000000-0000-0000-0000-000000000018'::uuid,'d3000000-0000-0000-0000-000000000019'::uuid,'d3000000-0000-0000-0000-000000000020'::uuid,'d3000000-0000-0000-0000-000000000021'::uuid] ord, $sample$
[
  {
    "gameNo": 1,
    "map": 0,
    "seats": [
      {
        "player": "d3000000-0000-0000-0000-000000000012",
        "faction": "rats"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000014",
        "faction": "moles"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000010",
        "faction": "WA"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000013",
        "faction": "knaves"
      }
    ]
  },
  {
    "gameNo": 2,
    "map": 0,
    "seats": [
      {
        "player": "d3000000-0000-0000-0000-000000000013",
        "faction": "vagabond"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000019",
        "faction": "cats"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000021",
        "faction": "otters"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000018",
        "faction": "rats"
      }
    ]
  },
  {
    "gameNo": 3,
    "map": 0,
    "seats": [
      {
        "player": "d3000000-0000-0000-0000-000000000011",
        "faction": "lizards"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000020",
        "faction": "birds"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000013",
        "faction": "WA"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000017",
        "faction": "cats"
      }
    ]
  },
  {
    "gameNo": 4,
    "map": 1,
    "seats": [
      {
        "player": "d3000000-0000-0000-0000-000000000015",
        "faction": "knaves"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000018",
        "faction": "cats"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000012",
        "faction": "WA"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000011",
        "faction": "birds"
      }
    ]
  },
  {
    "gameNo": 5,
    "map": 1,
    "seats": [
      {
        "player": "d3000000-0000-0000-0000-000000000010",
        "faction": "rats"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000017",
        "faction": "birds"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000015",
        "faction": "cats"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000021",
        "faction": "vagabond"
      }
    ]
  },
  {
    "gameNo": 6,
    "map": 2,
    "seats": [
      {
        "player": "d3000000-0000-0000-0000-000000000019",
        "faction": "birds"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000015",
        "faction": "vagabond"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000020",
        "faction": "WA"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000014",
        "faction": "rats"
      }
    ]
  },
  {
    "gameNo": 7,
    "map": 2,
    "seats": [
      {
        "player": "d3000000-0000-0000-0000-000000000016",
        "faction": "crows"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000012",
        "faction": "birds"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000017",
        "faction": "vagabond"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000019",
        "faction": "rats"
      }
    ]
  },
  {
    "gameNo": 8,
    "map": 3,
    "seats": [
      {
        "player": "d3000000-0000-0000-0000-000000000021",
        "faction": "rats"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000011",
        "faction": "moles"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000014",
        "faction": "lizards"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000016",
        "faction": "WA"
      }
    ]
  },
  {
    "gameNo": 9,
    "map": 3,
    "seats": [
      {
        "player": "d3000000-0000-0000-0000-000000000020",
        "faction": "cats"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000016",
        "faction": "lizards"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000018",
        "faction": "bats"
      },
      {
        "player": "d3000000-0000-0000-0000-000000000010",
        "faction": "moles"
      }
    ]
  }
]
$sample$::jsonb games;
create temp table original_lists as select person_id, ranked_factions from public.roster where season_id=(select sid from draft);
grant all on all tables in schema pg_temp to anon,authenticated,service_role;
create function pg_temp.publish(g jsonb default null, p_order uuid[] default null) returns void language sql as $$ select public.publish_pairings(d.sid,'d3-seed',coalesce(p_order,d.ord),coalesce(g,d.games)) from draft d $$;
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000002');
select throws_ok($$select pg_temp.publish()$$,'42501',null,'viewer cannot publish');
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000003');
select throws_ok($$select pg_temp.publish()$$,'42501',null,'stranger cannot publish');
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
reset role;
update public.seasons set lists_lock_at=now()+interval '1 day' where id='d3000000-0000-0000-0000-000000000100';
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
select throws_like($$select pg_temp.publish()$$,'%locked%','publish before lock refused');
reset role;
update public.seasons set lists_lock_at=now()-interval '1 day' where id='d3000000-0000-0000-0000-000000000100';
reset role;
update public.seasons set capacity=null where id='d3000000-0000-0000-0000-000000000100';
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
select throws_like($$select pg_temp.publish()$$,'%capacity%','unset capacity named');
reset role;
update public.seasons set capacity=12 where id='d3000000-0000-0000-0000-000000000100';
update public.roster set list='waitlist' where person_id='d3000000-0000-0000-0000-000000000010';
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
select throws_like($$select pg_temp.publish()$$,'%exactly full%','short league list refused');
reset role;
update public.roster set list='league' where person_id='d3000000-0000-0000-0000-000000000010';
update public.roster set list_submitted=false where person_id='d3000000-0000-0000-0000-000000000010';
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
select throws_like($$select pg_temp.publish()$$,'%Invalid ranked list for Alex%','invalid list names its player');
reset role;
update public.roster set list_submitted=true where person_id='d3000000-0000-0000-0000-000000000010';
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
select throws_like($$select pg_temp.publish(jsonb_set((select games from draft),'{0,seats,0,faction}','"lizards"'::jsonb))$$,'%own list%','off-list faction refused');
reset role;
update public.roster set ranked_factions=ARRAY['cats','rats','badgers','moles','birds','frogs','otters','vagabond','knaves','bats','crows','WA','lizards'] where season_id='d3000000-0000-0000-0000-000000000100';
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
select throws_like($$select pg_temp.publish(jsonb_set(jsonb_set(jsonb_set((select games from draft),'{0,seats,0,faction}','"cats"'::jsonb),'{0,seats,1,faction}','"otters"'::jsonb),'{0,seats,3,faction}','"lizards"'::jsonb))$$,'%reach 20 is below 21%','reach 20 refused');
select throws_like($$select pg_temp.publish(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select games from draft),'{0,seats,0,faction}','"cats"'::jsonb),'{0,seats,1,faction}','"rats"'::jsonb),'{0,seats,2,faction}','"birds"'::jsonb),'{0,seats,3,faction}','"frogs"'::jsonb))$$,'%one militant and one insurgent%','table needs both faction types');
select throws_like($$select pg_temp.publish(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select games from draft),'{0,seats,0,faction}','"otters"'::jsonb),'{0,seats,1,faction}','"bats"'::jsonb),'{0,seats,2,faction}','"crows"'::jsonb),'{0,seats,3,faction}','"WA"'::jsonb))$$,'%one militant and one insurgent%','table needs both faction types');
select throws_like($$select pg_temp.publish(jsonb_set(jsonb_set(jsonb_set((select games from draft),'{0,seats,0,faction}','"cats"'::jsonb),'{0,seats,1,faction}','"rats"'::jsonb),'{0,seats,2,faction}','"vagabond"'::jsonb))$$,'%never Vagabond with Knaves%','Vagabond and Knaves forbidden');
select throws_like($$select pg_temp.publish(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select games from draft),'{0,seats,0,faction}','"cats"'::jsonb),'{0,seats,1,faction}','"cats"'::jsonb),'{0,seats,2,faction}','"birds"'::jsonb),'{0,seats,3,faction}','"otters"'::jsonb))$$,'%one of each faction%','duplicate table faction refused');
select throws_like($$select pg_temp.publish(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select games from draft),'{0,seats,0,faction}','"cats"'::jsonb),'{0,seats,1,faction}','"rats"'::jsonb),'{0,seats,2,faction}','"birds"'::jsonb),'{0,seats,3,faction}','"unknown"'::jsonb))$$,'%known faction%','unknown faction refused');
select throws_like($$select pg_temp.publish(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select games from draft),'{3,seats,0,player}','"d3000000-0000-0000-0000-000000000012"'::jsonb),'{3,seats,0,faction}','"WA"'::jsonb),'{3,seats,2,player}','"d3000000-0000-0000-0000-000000000015"'::jsonb),'{3,seats,2,faction}','"knaves"'::jsonb))$$,'%different seat every game%','repeated seat refused');
select throws_like($$select pg_temp.publish(jsonb_set((select games from draft),'{3,seats,2,faction}','"rats"'::jsonb))$$,'%never repeat a faction%','repeated player faction refused');
select throws_like($$select pg_temp.publish((select games - 8 from draft))$$,'%Wrong number of games%','wrong game count refused');
select throws_like($$select pg_temp.publish(jsonb_set((select games from draft),'{0,seats}','[{"player": "d3000000-0000-0000-0000-000000000012", "faction": "rats"}, {"player": "d3000000-0000-0000-0000-000000000014", "faction": "moles"}, {"player": "d3000000-0000-0000-0000-000000000010", "faction": "WA"}]'::jsonb))$$,'%four seats%','wrong table size refused');
select throws_like($$select pg_temp.publish(jsonb_set((select games from draft),'{0,seats,0,player}','"d3000000-0000-0000-0000-000000000014"'::jsonb))$$,'%four distinct league players%','duplicate player at table refused');
select throws_like($$select pg_temp.publish(jsonb_set((select games from draft),'{0,map}','99'::jsonb))$$,'%map index is outside%','map outside season refused');
select throws_like($$select pg_temp.publish(jsonb_set((select games from draft),'{1,gameNo}','1'::jsonb))$$,'%Game numbers%','duplicate game number refused');
select throws_like($$select pg_temp.publish('null'::jsonb)$$,'%Games must be an array%','malformed games refused');
select throws_like($$select pg_temp.publish((select games from draft), ARRAY[]::uuid[])$$,'%Player order%','incomplete player-number order refused');
select throws_like($$select pg_temp.publish(jsonb_set((select games from draft),'{0,seats,0,player}','"d3000000-0000-0000-0000-000000000011"'))$$,'%must play 3 games%','each player must play games_each');
select throws_like($$select public.publish_pairings((select sid from draft),'',(select ord from draft),(select games from draft))$$,'%seed%','empty seed refused');
select ok((select started_at is null and seed is null from public.seasons where id=(select sid from draft)),'failed drafts do not start the season');
select is((select count(*) from public.roster where season_id=(select sid from draft) and player_number is not null),0::bigint,'failed drafts assign no player numbers');
select is((select count(*) from public.games where season_id=(select sid from draft)),0::bigint,'rejected drafts write no games');
reset role; savepoint boundary;
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
select throws_like($$select pg_temp.publish(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select games from draft),'{0,seats,0,faction}','"cats"'::jsonb),'{0,seats,1,faction}','"otters"'::jsonb),'{0,seats,2,faction}','"bats"'::jsonb),'{0,seats,3,faction}','"lizards"'::jsonb),'{1,map}','99'::jsonb))$$,'%Game 2: map index is outside%','reach exactly 21 passes table validation');
reset role; rollback to boundary;
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
reset role;
update public.roster r set ranked_factions=o.ranked_factions from original_lists o where r.person_id=o.person_id and r.season_id=(select sid from draft);
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
select lives_ok($$select pg_temp.publish()$$,'valid sample publishes, including a 3-militant / 1-insurgent table');
select is((select count(*) from public.games where season_id=(select sid from draft)),9::bigint,'nine games published');
select is((select count(*) from public.game_seats where game_id in (select id from public.games where season_id=(select sid from draft))),36::bigint,'36 seats published');
select is((select seed from public.seasons where id=(select sid from draft)),'d3-seed','seed stored');
select ok((select started_at is not null from public.seasons where id=(select sid from draft)),'started_at set');
select is((select stage from public.season_stage where season_id=(select sid from draft)),'live','published season is live');
select is((select array_agg(person_id order by player_number) from public.roster where season_id=(select sid from draft)),(select ord from draft),'order assigns player numbers');
select throws_like($$select pg_temp.publish()$$,'%season has started%','%season has started%');
select throws_like($$select public.roster_move((select sid from draft),(select ord[1] from draft),'waitlist',1)$$,'%season has started%','roster moves closed');
select throws_like($$select public.season_save((select sid from draft),'D3',12,4,ARRAY['A','B','C','D'],ARRAY['cats'],1,now())$$,'%Capacity%','structural settings change refused after start');
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000002');
select throws_like($$select public.join_league((select sid from draft))$$,'%closed%','joining closed');
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000001');
select is((select count(*) from public.games),9::bigint,'persona 1 reads games through gate');
select throws_ok($$delete from public.games$$,'42501',null,'persona 1 cannot write games');
select is((select count(*) from public.game_seats),36::bigint,'persona 1 reads game_seats through gate');
select throws_ok($$delete from public.game_seats$$,'42501',null,'persona 1 cannot write game_seats');
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000002');
select is((select count(*) from public.games),9::bigint,'persona 2 reads games through gate');
select throws_ok($$delete from public.games$$,'42501',null,'persona 2 cannot write games');
select is((select count(*) from public.game_seats),36::bigint,'persona 2 reads game_seats through gate');
select throws_ok($$delete from public.game_seats$$,'42501',null,'persona 2 cannot write game_seats');
reset role;
select pg_temp.act_as('d3000000-0000-0000-0000-000000000003');
select is((select count(*) from public.games),0::bigint,'persona 3 reads games through gate');
select throws_ok($$delete from public.games$$,'42501',null,'persona 3 cannot write games');
select is((select count(*) from public.game_seats),0::bigint,'persona 3 reads game_seats through gate');
select throws_ok($$delete from public.game_seats$$,'42501',null,'persona 3 cannot write game_seats');
reset role; select pg_temp.act_anon();
select throws_ok($$select pg_temp.publish()$$,'42501',null,'signed out cannot publish');
select throws_ok($$select * from public.games$$,'42501',null,'signed out cannot read games');
select throws_ok($$select * from public.game_seats$$,'42501',null,'signed out cannot read game_seats');
reset role;
select is((select count(*) from app.pairing_factions()),13::bigint,'all 13 factions');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='cats'),'10:true','faction metadata cats matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='rats'),'9:true','faction metadata rats matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='badgers'),'8:true','faction metadata badgers matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='moles'),'8:true','faction metadata moles matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='birds'),'7:true','faction metadata birds matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='frogs'),'7:true','faction metadata frogs matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='otters'),'5:false','faction metadata otters matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='vagabond'),'5:false','faction metadata vagabond matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='knaves'),'4:false','faction metadata knaves matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='bats'),'4:false','faction metadata bats matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='crows'),'3:false','faction metadata crows matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='WA'),'3:false','faction metadata WA matches league/factions.md');
select is((select reach::text || ':' || militant::text from app.pairing_factions() where code='lizards'),'2:false','faction metadata lizards matches league/factions.md');
select ok(exists(select 1 from public.edit_log where table_name='games' and action='insert' and new->>'season_id'=(select sid::text from draft)),'games audited');
select ok(exists(select 1 from public.edit_log where table_name='game_seats' and action='insert'),'seats audited');
select * from finish(); rollback;
