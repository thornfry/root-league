-- A ranked list holds at most five factions (decision 53). Saving a shorter list
-- still works, so players can keep partial picks; a list counts as submitted
-- (shown as Ready) only from the season minimum up to five.

create function app.list_max() returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

revoke all on function app.list_max() from public;

create or replace function public.save_ranked_list(p_season_id uuid, p_factions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := app.require_person();
  s public.seasons;
  list_in text[] := coalesce(p_factions, '{}');
  problem text;
begin
  s := app.roster_season(p_season_id, false);
  if not exists (select 1 from public.roster r where r.season_id = s.id and r.person_id = pid) then
    raise exception 'Join the league before ranking factions.' using errcode = '55000';
  end if;
  if app.stage_of(s.started_at, s.lists_lock_at) <> 'open' and not app.is_admin() then
    raise exception 'Lists are locked. Ask the admin to change yours.' using errcode = '55000';
  end if;
  problem := app.list_problem(s.faction_pool, list_in);
  if problem is not null then
    raise exception '%', problem using errcode = '22023';
  end if;
  if cardinality(list_in) > app.list_max() then
    raise exception 'A list can hold at most % factions.', app.list_max() using errcode = '22023';
  end if;
  update public.roster r
     set ranked_factions = list_in,
         list_flagged = false,
         list_submitted = (s.min_list_length is not null and cardinality(list_in) >= s.min_list_length)
   where r.season_id = s.id and r.person_id = pid;
end;
$$;

create or replace function public.roster_set_list(p_season_id uuid, p_person_id uuid, p_factions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  list_in text[] := coalesce(p_factions, '{}');
  problem text;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, false);
  if not exists (select 1 from public.roster r where r.season_id = s.id and r.person_id = p_person_id) then
    raise exception 'That person is not on the roster.' using errcode = 'P0002';
  end if;
  problem := app.list_problem(s.faction_pool, list_in);
  if problem is not null then
    raise exception '%', problem using errcode = '22023';
  end if;
  if cardinality(list_in) > app.list_max() then
    raise exception 'A list can hold at most % factions.', app.list_max() using errcode = '22023';
  end if;
  update public.roster r
     set ranked_factions = list_in,
         list_flagged = false,
         list_submitted = (s.min_list_length is not null and cardinality(list_in) >= s.min_list_length)
   where r.season_id = s.id and r.person_id = p_person_id;
end;
$$;
