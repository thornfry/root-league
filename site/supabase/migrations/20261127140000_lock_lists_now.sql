-- Lock lists now (decision 56). Lists lock is derived from seasons.lists_lock_at
-- (app.stage_of), so locking early is just setting that date to now. There is no
-- unlock function: moving or clearing the date on the Season page and saving
-- reopens lists, because the stage is derived on every read.

create function public.season_lock_lists(p_season_id uuid)
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
    raise exception 'The season has started, so lists are already locked.' using errcode = '55000';
  end if;
  -- Already locked: keep the date it locked at.
  if app.stage_of(s.started_at, s.lists_lock_at) = 'locked' then
    return s;
  end if;
  update public.seasons set lists_lock_at = now() where id = s.id returning * into s;
  return s;
end;
$$;

revoke all on function public.season_lock_lists(uuid) from public, anon;
grant execute on function public.season_lock_lists(uuid) to authenticated;
