-- D5 / story 12, ADR 19 and 44. Pick'ems: a first pick (3 points) and an optional
-- second pick (1 point) per person per game they are not seated in.
--
-- Rules this file implements
--   * Picks are open until the game is closed: it has a submission, a
--     settlement or is void (the same test as game_outcome.state <> 'upcoming').
--   * Other people's picks are readable only once the game is closed. The owner
--     and the admin read their own and all picks at any time.
--   * Only recorded and settled games score. Disputed, void and upcoming games
--     score nothing, and scores are derived, so a settlement or unvoid
--     recalculates them with no job.
--   * A person with no picks is not on the leaderboard. A person with only open
--     picks is (with 0 points), as the story says nothing about hiding that.

create table public.picks (
  game_id uuid not null references public.games(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  first_pick uuid not null references public.people(id) on delete cascade,
  second_pick uuid references public.people(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (game_id, person_id),
  check (second_pick is null or second_pick <> first_pick)
);

-- True once the game takes no more picks. Reads the private tables as the
-- function owner, so a policy or view can use it without exposing a claim.
create function app.picks_closed(p_game_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.games g where g.id = p_game_id and g.void)
      or exists (select 1 from public.settlements s where s.game_id = p_game_id)
      or exists (select 1 from public.submissions s where s.game_id = p_game_id)
$$;
revoke all on function app.picks_closed(uuid) from public, anon;
grant execute on function app.picks_closed(uuid) to authenticated;

-- Points for one pick of weight p_weight: only a recorded or settled game
-- scores, and only when the picked player is among its winners.
create function app.pick_points(p_state text, p_winners uuid[], p_pick uuid, p_weight integer)
returns integer
language sql immutable set search_path = '' as $$
  select case when p_state in ('recorded', 'settled') and p_pick = any (p_winners)
              then p_weight else 0 end
$$;
revoke all on function app.pick_points(text, uuid[], uuid, integer) from public, anon;
grant execute on function app.pick_points(text, uuid[], uuid, integer) to authenticated;

select app.lock_down('public.picks',
  'app.is_whitelisted() and (person_id = app.person_id() or app.is_admin() or app.picks_closed(game_id))');
create trigger picks_audit after insert or update or delete on public.picks
  for each row execute function app.audit_row('game_id', 'person_id');

-- Make or change the caller's picks for a game. p_second null clears the second
-- pick. The caller must not be seated at the game, the admin included. The game
-- row is locked first, as submit_result and void_game do, so a pick cannot slip
-- in beside the submission that closes the game.
create function public.save_pick(p_game_id uuid, p_first uuid, p_second uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare pid uuid := app.person_id();
begin
  if not app.is_whitelisted() or pid is null then
    raise exception 'Sign in with a whitelisted account to pick.' using errcode = '42501';
  end if;
  perform 1 from public.games where id = p_game_id for update;
  if not found then raise exception 'Game not found.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.game_seats s where s.game_id = p_game_id and s.person_id = pid) then
    raise exception 'You are playing in this game, so you cannot pick it.' using errcode = '42501';
  end if;
  if app.picks_closed(p_game_id) then
    raise exception 'Picks are closed for this game.' using errcode = '55000';
  end if;
  if p_first is null then
    raise exception 'Choose a first pick.' using errcode = '22023';
  end if;
  if p_second is not null and p_second = p_first then
    raise exception 'The first and second pick must be different players.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(array[p_first, p_second]) x
             where x is not null and not exists (
               select 1 from public.game_seats s where s.game_id = p_game_id and s.person_id = x)) then
    raise exception 'Both picks must be players seated at this game.' using errcode = '22023';
  end if;
  insert into public.picks(game_id, person_id, first_pick, second_pick)
  values (p_game_id, pid, p_first, p_second)
  on conflict (game_id, person_id) do update
    set first_pick = excluded.first_pick, second_pick = excluded.second_pick, updated_at = now();
end $$;
revoke all on function public.save_pick(uuid, uuid, uuid) from public, anon;
grant execute on function public.save_pick(uuid, uuid, uuid) to authenticated;

-- Points per pick row, for the My picks page and the game page. A row is
-- visible under the same rule as the pick itself, so no open pick leaks.
create view public.pickem_scores with (security_barrier = true) as
select p.game_id, g.season_id, p.person_id, o.state,
  app.pick_points(o.state, o.winners, p.first_pick, 3) as first_points,
  app.pick_points(o.state, o.winners, p.second_pick, 1) as second_points,
  app.pick_points(o.state, o.winners, p.first_pick, 3)
    + app.pick_points(o.state, o.winners, p.second_pick, 1) as points
from public.picks p
join public.games g on g.id = p.game_id
join public.game_outcome o on o.game_id = p.game_id
where app.is_whitelisted()
  and (p.person_id = app.person_id() or app.is_admin() or app.picks_closed(p.game_id));
revoke all on public.pickem_scores from public, anon, authenticated;
grant select on public.pickem_scores to authenticated;

-- One row per person per season with at least one pick. Ties share a rank and
-- the next rank skips, as standings does. Shows points only, never a pick.
create view public.leaderboard with (security_barrier = true) as
select t.season_id, t.person_id, p.display_name, t.points,
  rank() over (partition by t.season_id order by t.points desc) as rank
from (
  select g.season_id, k.person_id,
    sum(app.pick_points(o.state, o.winners, k.first_pick, 3)
      + app.pick_points(o.state, o.winners, k.second_pick, 1))::bigint as points
  from public.picks k
  join public.games g on g.id = k.game_id
  join public.game_outcome o on o.game_id = k.game_id
  group by g.season_id, k.person_id
) t
join public.people p on p.id = t.person_id
where app.is_whitelisted();
revoke all on public.leaderboard from public, anon, authenticated;
grant select on public.leaderboard to authenticated;
