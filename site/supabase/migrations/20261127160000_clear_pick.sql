-- Take back your picks on a game, so a first pick can be changed from scratch.
-- save_pick always needs a first pick, so clearing a lone first pick is its own
-- call. The same checks as save_pick apply: the game is locked first, your own
-- games are not pickable, and a closed game keeps its picks.
create function public.clear_pick(p_game_id uuid)
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
  delete from public.picks where game_id = p_game_id and person_id = pid;
end $$;
revoke all on function public.clear_pick(uuid) from public, anon;
grant execute on function public.clear_pick(uuid) to authenticated;
