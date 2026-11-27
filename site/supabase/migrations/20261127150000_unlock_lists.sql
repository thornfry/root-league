-- Unlock lists (decision 56). The mirror of season_lock_lists: clears the lock
-- date so lists are open again with no date set. The admin can then set a new
-- lock date on the Season page.

create function public.season_unlock_lists(p_season_id uuid)
returns public.seasons
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, false);
  if s.started_at is not null then
    raise exception 'The season has started, so lists cannot be reopened.' using errcode = '55000';
  end if;
  -- Already open: leave any planned lock date alone.
  if app.stage_of(s.started_at, s.lists_lock_at) = 'open' then
    return s;
  end if;
  update public.seasons set lists_lock_at = null where id = s.id returning * into s;
  return s;
end;
$$;

revoke all on function public.season_unlock_lists(uuid) from public, anon;
grant execute on function public.season_unlock_lists(uuid) to authenticated;
