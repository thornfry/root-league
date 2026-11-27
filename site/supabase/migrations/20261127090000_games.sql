-- D3: published games. Unlike build.md / ADR 46's structure-only proposal,
-- publish revalidates the hard rules (explicit build instruction). Rules 3 and 5
-- (meeting and map repeats) are layout quality metrics, as in checkPairing;
-- map indexes must still address a season map. No browser draft is persisted.
create table public.games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  game_no integer not null check (game_no >= 1),
  map_index integer not null check (map_index >= 0),
  void boolean not null default false,
  unique (season_id, game_no)
);
create table public.game_seats (
  game_id uuid not null references public.games(id) on delete cascade,
  seat integer not null check (seat between 1 and 4),
  person_id uuid not null references public.people(id),
  faction text not null check (btrim(faction) <> ''),
  primary key (game_id, seat),
  unique (game_id, person_id)
);
select app.lock_down('public.games');
select app.lock_down('public.game_seats');
create trigger games_audit after insert or update or delete on public.games
  for each row execute function app.audit_row('id');
create trigger game_seats_audit after insert or update or delete on public.game_seats
  for each row execute function app.audit_row('game_id', 'seat');

-- SQL's copy of league/factions.md / src/data/factions.ts. The 030 test pins
-- all 13 codes, reach and type, plus boundary tables for the mix constraint.
-- This is private validation data, not a second client faction catalogue.
create function app.pairing_factions()
returns table (code text, reach integer, militant boolean)
language sql immutable set search_path = '' as $$
  values ('cats',10,true), ('rats',9,true), ('badgers',8,true),
    ('moles',8,true), ('birds',7,true), ('frogs',7,true),
    ('otters',5,false), ('vagabond',5,false), ('knaves',4,false),
    ('bats',4,false), ('crows',3,false), ('WA',3,false), ('lizards',2,false)
$$;
revoke all on function app.pairing_factions() from public, anon;

-- p_order is the UUID array in player-number order (index 1 = player 1).
-- p_games uses PairingGame: {gameNo, map, seats:[{player:UUID, faction:code}]}.
-- Array seat index 0 means turn-order seat 1; maps are zero-based.
create function public.publish_pairings(
  p_season_id uuid, p_seed text, p_order uuid[], p_games jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.seasons;
  r record;
  g jsonb;
  st jsonb;
  flat jsonb := '[]';
  nums integer[] := '{}';
  codes text[];
  seen uuid[];
  game_no integer;
  map_no integer;
  seat_no integer;
  pid uuid;
  faction text;
  gid uuid;
  total_reach integer;
  has_militant boolean;
  has_insurgent boolean;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, true);
  if app.stage_of(s.started_at, s.lists_lock_at) <> 'locked' then
    raise exception 'Lists must be locked before publishing.' using errcode = '55000';
  end if;
  if s.capacity is null or s.games_each is null or s.maps is null
     or s.faction_pool is null or s.min_list_length is null then
    raise exception 'Set capacity, games each, maps, faction pool and minimum list length on Season first.' using errcode = '55000';
  end if;
  if (select count(*) from public.roster x where x.season_id = s.id and x.list = 'league') <> s.capacity then
    raise exception 'The league list must be exactly full (% players).', s.capacity using errcode = '55000';
  end if;
  for r in select x.*, p.display_name from public.roster x join public.people p on p.id = x.person_id
    where x.season_id = s.id and x.list = 'league' loop
    if not r.list_submitted or r.list_flagged
       or cardinality(r.ranked_factions) < greatest(s.min_list_length, s.games_each)
       or app.list_problem(s.faction_pool, r.ranked_factions) is not null
       or exists (select 1 from unnest(r.ranked_factions) f
                   where not exists (select 1 from app.pairing_factions() k where k.code = f)) then
      raise exception 'Invalid ranked list for %: submit enough distinct factions from the season pool.', r.display_name using errcode = '55000';
    end if;
  end loop;
  if p_seed is null or btrim(p_seed) = '' then
    raise exception 'Give the draft a seed.' using errcode = '22023';
  end if;
  if p_order is null or array_ndims(p_order) <> 1 or array_lower(p_order,1) <> 1
     or cardinality(p_order) <> s.capacity
     or (select count(distinct x) from unnest(p_order) x) <> s.capacity
     or exists (select 1 from unnest(p_order) x where not exists (
       select 1 from public.roster y where y.season_id = s.id and y.list = 'league' and y.person_id = x)) then
    raise exception 'Player order must contain every league player exactly once.' using errcode = '22023';
  end if;
  if p_games is null or jsonb_typeof(p_games) <> 'array' then
    raise exception 'Games must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_games) <> s.capacity * s.games_each / 4 then
    raise exception 'Wrong number of games for capacity and games each.' using errcode = '22023';
  end if;
  for g in select value from jsonb_array_elements(p_games) loop
    if jsonb_typeof(g) <> 'object' or coalesce(g->>'gameNo','') !~ '^[1-9][0-9]{0,3}$'
       or coalesce(g->>'map','') !~ '^[0-9]{1,3}$' then
      raise exception 'Each game needs an integer gameNo and map index.' using errcode = '22023';
    end if;
    game_no := (g->>'gameNo')::integer;
    map_no := (g->>'map')::integer;
    if game_no > jsonb_array_length(p_games) or game_no = any(nums) then
      raise exception 'Game numbers must run from 1 to the game count, once each.' using errcode = '22023';
    end if;
    nums := nums || game_no;
    if map_no >= cardinality(s.maps) then
      raise exception 'Game %: map index is outside the season maps.', game_no using errcode = '22023';
    end if;
    if jsonb_typeof(g->'seats') is distinct from 'array' then
      raise exception 'Game % needs four seats.', game_no using errcode = '22023';
    end if;
    if jsonb_array_length(g->'seats') <> 4 then
      raise exception 'Game % needs four seats.', game_no using errcode = '22023';
    end if;
    seen := '{}'; codes := '{}'; seat_no := 0;
    for st in select value from jsonb_array_elements(g->'seats') loop
      seat_no := seat_no + 1;
      -- Compare text first: malformed UUIDs never escape as a cast error.
      select x into pid from unnest(p_order) x where x::text = st->>'player';
      if pid is null or pid = any(seen) then
        raise exception 'Game % needs four distinct league players.', game_no using errcode = '22023';
      end if;
      seen := seen || pid;
      faction := st->>'faction';
      if faction is null or not exists (select 1 from app.pairing_factions() k where k.code = faction) then
        raise exception 'Game %, seat % needs a known faction.', game_no, seat_no using errcode = '22023';
      end if;
      if not exists (select 1 from public.roster x where x.season_id = s.id and x.person_id = pid and faction = any(x.ranked_factions)) then
        raise exception 'Game %: faction must come from the player''s own list.', game_no using errcode = '22023';
      end if;
      codes := codes || faction;
      flat := flat || jsonb_build_array(jsonb_build_object('game_no',game_no,'map',map_no,'seat',seat_no,'person',pid,'faction',faction));
    end loop;
    if (select count(distinct x) from unnest(codes) x) <> 4 then
      raise exception 'Game %: one of each faction per table.', game_no using errcode = '22023';
    end if;
    select sum(k.reach), bool_or(k.militant), bool_or(not k.militant)
      into total_reach, has_militant, has_insurgent
      from app.pairing_factions() k where k.code = any(codes);
    if not has_militant or not has_insurgent then
      raise exception 'Game %: at least one militant and one insurgent required.', game_no using errcode = '22023';
    end if;
    if 'vagabond' = any(codes) and 'knaves' = any(codes) then
      raise exception 'Game %: never Vagabond with Knaves.', game_no using errcode = '22023';
    end if;
    if total_reach < 21 then
      raise exception 'Game %: reach % is below 21.', game_no, total_reach using errcode = '22023';
    end if;
  end loop;
  for pid in select unnest(p_order) loop
    select array_agg((e->>'seat')::integer), array_agg(e->>'faction')
      into nums, codes from jsonb_array_elements(flat) e where e->>'person' = pid::text;
    if coalesce(cardinality(nums),0) <> s.games_each then
      raise exception 'Player % must play % games.', pid, s.games_each using errcode = '22023';
    end if;
    if (select count(distinct x) from unnest(nums) x) <> s.games_each then
      raise exception 'Player % must have a different seat every game.', pid using errcode = '22023';
    end if;
    if (select count(distinct x) from unnest(codes) x) <> s.games_each then
      raise exception 'Player % must never repeat a faction.', pid using errcode = '22023';
    end if;
  end loop;
  -- All checks precede all writes. The season lock serialises publish, roster,
  -- list and setup writes, including two simultaneous publishes.
  update public.roster set player_number = null where season_id = s.id;
  update public.roster x set player_number = n.ord
    from unnest(p_order) with ordinality n(pid,ord)
    where x.season_id = s.id and x.person_id = n.pid;
  for g in select value from jsonb_array_elements(p_games) loop
    insert into public.games(season_id,game_no,map_index)
      values(s.id,(g->>'gameNo')::integer,(g->>'map')::integer) returning id into gid;
    insert into public.game_seats(game_id,seat,person_id,faction)
      select gid, n.ord, (n.st->>'player')::uuid, n.st->>'faction'
        from jsonb_array_elements(g->'seats') with ordinality n(st,ord);
  end loop;
  update public.seasons set started_at = now(), seed = p_seed where id = s.id;
end;
$$;
revoke all on function public.publish_pairings(uuid,text,uuid[],jsonb) from public, anon;
grant execute on function public.publish_pairings(uuid,text,uuid[],jsonb) to authenticated;
