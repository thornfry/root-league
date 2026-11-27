-- D4 / stories 9, 10, scenario S17 and ADR 44. Submissions are private; the aggregate
-- outcome deliberately reads all of them as the view owner, behind the gate.
create table public.submissions (
  game_id uuid not null references public.games(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  winners uuid[] not null check (cardinality(winners) between 1 and 4 and array_position(winners, null) is null),
  updated_at timestamptz not null default now(),
  primary key (game_id, person_id)
);
create table public.settlements (
  game_id uuid primary key references public.games(id) on delete cascade,
  winners uuid[] not null check (cardinality(winners) between 1 and 4 and array_position(winners, null) is null),
  settled_by uuid references public.people(id) on delete set null,
  at timestamptz not null default now()
);
select app.lock_down('public.submissions', 'app.is_whitelisted() and (person_id = app.person_id() or app.is_admin())');
select app.lock_down('public.settlements');
create trigger submissions_audit after insert or update or delete on public.submissions
  for each row execute function app.audit_row('game_id', 'person_id');
create trigger settlements_audit after insert or update or delete on public.settlements
  for each row execute function app.audit_row('game_id');

-- Compare sets even if Fix it wrote a different order. No claims or claimant
-- counts escape through the public outcome.
create function app.winner_set(winners uuid[]) returns uuid[]
language sql immutable set search_path = '' as $$
  select array(select distinct w from unnest(winners) w order by w)
$$;
revoke all on function app.winner_set(uuid[]) from public, anon;
grant execute on function app.winner_set(uuid[]) to authenticated;

create view public.game_outcome with (security_barrier = true) as
select g.id as game_id, g.season_id,
  case when g.void then 'void'
       when st.game_id is not null then 'settled'
       when sub.answers = 0 then 'upcoming'
       when sub.answers = 1 then 'recorded'
       else 'disputed' end as state,
  case when g.void then null::uuid[]
       when st.game_id is not null then app.winner_set(st.winners)
       when sub.answers = 1 then (select app.winner_set(s.winners)
         from public.submissions s where s.game_id = g.id limit 1)
       else null::uuid[] end as winners
from public.games g
left join public.settlements st on st.game_id = g.id
cross join lateral (select count(distinct app.winner_set(s.winners)) as answers
  from public.submissions s where s.game_id = g.id) sub
where app.is_whitelisted();
revoke all on public.game_outcome from public, anon, authenticated;
grant select on public.game_outcome to authenticated;

-- Void games contribute to none of wins, played or left. Disputed games have
-- not counted as played and remain left until agreement or settlement.
create view public.standings with (security_barrier = true) as
select r.season_id, r.person_id, p.display_name,
  count(o.game_id) filter (where o.state in ('recorded','settled') and r.person_id = any(o.winners)) as wins,
  count(o.game_id) filter (where o.state in ('recorded','settled')) as games_played,
  count(o.game_id) filter (where o.state in ('upcoming','disputed')) as games_left,
  rank() over (partition by r.season_id order by
    count(o.game_id) filter (where o.state in ('recorded','settled') and r.person_id = any(o.winners)) desc) as rank
from public.roster r join public.people p on p.id = r.person_id
join public.seasons season on season.id = r.season_id and season.started_at is not null
left join public.game_seats gs on gs.person_id = r.person_id
  and exists (select 1 from public.games g where g.id = gs.game_id and g.season_id = r.season_id)
left join public.game_outcome o on o.game_id = gs.game_id
where r.list = 'league' and app.is_whitelisted()
group by r.season_id, r.person_id, p.display_name;
revoke all on public.standings from public, anon, authenticated;
grant select on public.standings to authenticated;

-- Validate once, shared by player submission and admin settlement. The public
-- writers lock the game first, serialising submissions, settle, reopen and void.
create function app.validate_winners(p_game_id uuid, p_winners uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
begin
  if p_winners is null or cardinality(p_winners) = 0
     or array_ndims(p_winners) <> 1 or array_position(p_winners, null) is not null
     or exists (select 1 from unnest(p_winners) w where not exists (
       select 1 from public.game_seats s where s.game_id = p_game_id and s.person_id = w)) then
    raise exception 'Choose one or more winners seated at this game.' using errcode = '22023';
  end if;
  return app.winner_set(p_winners);
end $$;
revoke all on function app.validate_winners(uuid,uuid[]) from public, anon;

create function public.settle_game(p_game_id uuid, p_winners uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare w uuid[];
begin
  perform app.require_admin();
  perform 1 from public.games where id = p_game_id for update;
  if not found then raise exception 'Game not found.' using errcode = 'P0002'; end if;
  w := app.validate_winners(p_game_id, p_winners);
  insert into public.settlements(game_id,winners,settled_by) values(p_game_id,w,app.person_id())
  on conflict(game_id) do update set winners = excluded.winners, settled_by = excluded.settled_by, at = now();
end $$;

create function public.submit_result(p_game_id uuid, p_winners uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare pid uuid := app.person_id(); g public.games; w uuid[];
begin
  if not app.is_whitelisted() or pid is null then
    raise exception 'Only a seated league player or admin can submit a result.' using errcode = '42501';
  end if;
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'Game not found.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.game_seats s where s.game_id = g.id and s.person_id = pid) then
    if app.is_admin() then
      perform public.settle_game(g.id, p_winners);
      return;
    end if;
    raise exception 'Only a seated league player or admin can submit a result.' using errcode = '42501';
  end if;
  if not app.is_admin() and not exists (
    select 1 from public.roster r join public.seasons season on season.id = r.season_id
    where r.person_id = pid and r.season_id = g.season_id and r.list = 'league' and season.started_at is not null) then
    raise exception 'Only a seated league player or admin can submit a result.' using errcode = '42501';
  end if;
  if exists (select 1 from public.settlements s where s.game_id = g.id) then
    raise exception 'This game is settled. Ask the admin to reopen it.' using errcode = '55000';
  end if;
  w := app.validate_winners(g.id, p_winners);
  insert into public.submissions(game_id,person_id,winners) values(g.id,pid,w)
  on conflict(game_id,person_id) do update set winners = excluded.winners, updated_at = now();
end $$;

create function public.reopen_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  perform 1 from public.games where id = p_game_id for update;
  if not found then raise exception 'Game not found.' using errcode = 'P0002'; end if;
  -- Keep submissions: reopening restores their derived result and edit rights.
  delete from public.settlements where game_id = p_game_id;
end $$;

create function public.void_game(p_game_id uuid, p_void boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_void is null then raise exception 'Say whether the game is void.' using errcode = '22023'; end if;
  update public.games set void = p_void where id = p_game_id;
  if not found then raise exception 'Game not found.' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.submit_result(uuid,uuid[]), public.settle_game(uuid,uuid[]),
  public.reopen_game(uuid), public.void_game(uuid,boolean) from public, anon;
grant execute on function public.submit_result(uuid,uuid[]), public.settle_game(uuid,uuid[]),
  public.reopen_game(uuid), public.void_game(uuid,boolean) to authenticated;
