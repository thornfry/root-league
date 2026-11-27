-- D6: Fix it and the CSV league state (build.md D6; stories 10 and 13; decisions
-- 23, 42, 45). Follows the pattern in the header of the D1 access migration.
--
-- What is here
--   * fixit_update, fixit_insert, fixit_delete (and fixit_delete_preview,
--     fixit_warnings) over an allowlist of tables and columns (app.fixit_spec).
--     Admin only. Every row change goes through the audit trigger, so the log
--     holds old and new, who and when, with no log code in these functions. An
--     edit that breaks a pairing rule is saved and returns the rule it breaks.
--   * link_person (move a sign-in onto a seeded name), replace_player (swap the
--     person in a slot, keeping seats and picks).
--   * export_league_state and import_league_state: the league's state as one
--     file per area, and the all-or-nothing way back in. app.import_spec is the
--     one description of those files.
--
-- The log. Row changes are logged by the audit trigger on each table (old and
-- new, actor, time), so an import leaves one entry per changed row as well as
-- one summary entry (table_name 'import') that names the files and the range of
-- row entries, as story 13 asks. An update that sets the values already there
-- writes nothing.
--
-- Not here: voiding a game and settling a result are D4's void_game and
-- settle_game; Fix it reaches the same columns through fixit_update when it
-- needs to. The whitelist has its own functions (they guard the last admin), so
-- it is not on the Fix it allowlist, and neither are edit_log and app_config.
--
-- Errors follow D2: 42501 not an admin, 22023 bad input, 55000 not possible in
-- the current state, P0002 not found, 23505 already exists.

-- The player number is checked at the end of a statement set, so an import can
-- swap two numbers (the place on a list already worked this way).
alter table public.roster drop constraint roster_player_number_key;
alter table public.roster add constraint roster_player_number_key
  unique (season_id, player_number) deferrable initially immediate;

-- Allowlists ------------------------------------------------------------------

-- Which tables Fix it may change, their key columns, the columns an update may
-- change (never a key column) and the columns an insert may set.
create function app.fixit_spec()
returns table (tbl text, key_cols text[], edit_cols text[], insert_cols text[])
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('people', '{id}'::text[],
       '{display_name,discord_id,seed_key}'::text[],
       '{id,display_name,discord_id,seed_key}'::text[]),
    ('seasons', '{id}',
       '{slug,name,is_current,capacity,games_each,maps,faction_pool,min_list_length,lists_lock_at,started_at,seed}',
       '{id,slug,name,is_current,capacity,games_each,maps,faction_pool,min_list_length,lists_lock_at,started_at,seed}'),
    ('roster', '{season_id,person_id}',
       '{list,position,ranked_factions,list_submitted,list_flagged,player_number,joined_at}',
       '{season_id,person_id,list,position,ranked_factions,list_submitted,list_flagged,player_number,joined_at}'),
    ('games', '{id}',
       '{game_no,map_index,void}',
       '{id,season_id,game_no,map_index,void}'),
    ('game_seats', '{game_id,seat}',
       '{person_id,faction}',
       '{game_id,seat,person_id,faction}'),
    ('submissions', '{game_id,person_id}',
       '{winners,updated_at}',
       '{game_id,person_id,winners,updated_at}'),
    ('settlements', '{game_id}',
       '{winners,settled_by,at}',
       '{game_id,winners,settled_by,at}'),
    ('picks', '{game_id,person_id}',
       '{first_pick,second_pick,updated_at}',
       '{game_id,person_id,first_pick,second_pick,updated_at}')
  ) v (tbl, key_cols, edit_cols, insert_cols)
$$;

-- The files of the league state, one per area. `mode` says what an import does
-- with the rows of that file:
--   upsert     adds or changes rows, removes none (people are league wide)
--   mirror     adds, changes and removes, so the file is the season's state
--   update     changes rows that exist, adds none
--   reference  pairings: the rows must match the published games and seats,
--              apart from the columns in edit_cols (a game's void flag)
-- `scope` limits a file to the season being imported: self (its own row),
-- season (season_id), game (game_id of one of the season's games) or none.
-- The log is exported (log.csv) and never imported.
create function app.import_spec()
returns table (ord integer, file text, tbl text, mode text, scope text,
               key_cols text[], cols text[], edit_cols text[])
language sql
immutable
set search_path = ''
as $$
  select * from (values
    (1, 'people.csv', 'people', 'upsert', 'none', '{id}'::text[],
       '{id,display_name,discord_id,seed_key}'::text[],
       '{display_name,discord_id,seed_key}'::text[]),
    (2, 'season.csv', 'seasons', 'update', 'self', '{id}',
       '{id,slug,name,is_current,capacity,games_each,maps,faction_pool,min_list_length,lists_lock_at,started_at,seed}',
       '{slug,name,is_current,capacity,games_each,maps,faction_pool,min_list_length,lists_lock_at,started_at,seed}'),
    (3, 'roster.csv', 'roster', 'mirror', 'season', '{season_id,person_id}',
       '{season_id,person_id,list,position,player_number,joined_at}',
       '{list,position,player_number,joined_at}'),
    (4, 'lists.csv', 'roster', 'update', 'season', '{season_id,person_id}',
       '{season_id,person_id,ranked_factions,list_submitted,list_flagged}',
       '{ranked_factions,list_submitted,list_flagged}'),
    (5, 'games.csv', 'games', 'reference', 'season', '{id}',
       '{id,season_id,game_no,map_index,void}',
       '{void}'),
    (6, 'seats.csv', 'game_seats', 'reference', 'game', '{game_id,seat}',
       '{game_id,seat,person_id,faction}',
       '{}'),
    (7, 'submissions.csv', 'submissions', 'mirror', 'game', '{game_id,person_id}',
       '{game_id,person_id,winners,updated_at}',
       '{winners,updated_at}'),
    (8, 'results.csv', 'settlements', 'mirror', 'game', '{game_id}',
       '{game_id,winners,settled_by,at}',
       '{winners,settled_by,at}'),
    (9, 'picks.csv', 'picks', 'mirror', 'game', '{game_id,person_id}',
       '{game_id,person_id,first_pick,second_pick,updated_at}',
       '{first_pick,second_pick,updated_at}')
  ) v (ord, file, tbl, mode, scope, key_cols, cols, edit_cols)
$$;

-- Value helpers ---------------------------------------------------------------

-- A cell as the column's own type, in JSON form, or an error from the type's
-- input rules. p_raw is JSON null, a string or an array of strings.
create function app.typed_cell(p_tbl text, p_col text, p_raw jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v jsonb;
begin
  execute format('select to_jsonb(jsonb_populate_record(null::public.%I, $1)) -> $2', p_tbl)
    into v using jsonb_build_object(p_col, p_raw), p_col;
  return v;
end;
$$;

-- Checks an object of column values against an allowed list and returns it with
-- every value typed. The error names the table and column.
create function app.fixit_typed(p_tbl text, p_obj jsonb, p_allowed text[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  k text;
  typed jsonb := '{}'::jsonb;
  required text[];
begin
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then
    raise exception 'Expected an object of column values.' using errcode = '22023';
  end if;
  select coalesce(array_agg(a.attname::text), '{}') into required
    from pg_catalog.pg_attribute a
   where a.attrelid = ('public.' || quote_ident(p_tbl))::regclass
     and a.attnotnull and a.attnum > 0 and not a.attisdropped;
  for k in select jsonb_object_keys(p_obj) loop
    if not k = any (p_allowed) then
      raise exception 'Column "%" of % cannot be set on Fix it.', k, p_tbl using errcode = '22023';
    end if;
    if jsonb_typeof(p_obj -> k) = 'null' and k = any (required) then
      raise exception 'Column "%" of % cannot be empty.', k, p_tbl using errcode = '22023';
    end if;
    begin
      typed := typed || jsonb_build_object(k, app.typed_cell(p_tbl, k, p_obj -> k));
    exception when others then
      raise exception 'Column "%" of %: %', k, p_tbl, sqlerrm using errcode = '22023';
    end;
  end loop;
  return typed;
end;
$$;

-- A plain sentence for a database refusal.
create function app.db_problem(p_message text, p_detail text, p_constraint text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_constraint
    when 'seasons_valid_pair' then 'That capacity and games each is not a valid pair (10 players cannot play 3 games each).'
    when 'seasons_maps_cover_games' then 'There must be at least as many maps as games each.'
    when 'seasons_min_fits_pool' then 'The minimum list length is longer than the faction pool.'
    when 'seasons_one_current' then 'Only one season can be current.'
    when 'roster_list_position_key' then 'Another person already holds that place on the list.'
    when 'roster_player_number_key' then 'Another player already has that player number.'
    when 'game_seats_pkey' then 'That seat is already taken in the game.'
    when 'game_seats_game_id_person_id_key' then 'That person already has a seat in the game.'
    else p_message || coalesce(' (' || p_detail || ')', '')
  end
$$;

-- Raises a refusal from a failed write, with the code the caller expects.
create function app.raise_db_problem(
  p_sqlstate text, p_message text, p_detail text, p_constraint text, p_column text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_sqlstate = '23502' and nullif(p_column, '') is not null then
    raise exception 'Not saved. Column "%" cannot be empty.', p_column using errcode = '22023';
  end if;
  raise exception 'Not saved. %', app.db_problem(p_message, p_detail, p_constraint)
    using errcode = case when p_sqlstate = '23505' then '23505' else '22023' end;
end;
$$;

-- Rule warnings --------------------------------------------------------------

-- The pairing rules a published game breaks, named as league/pairing-rules.md and
-- the TypeScript checker name them. Warnings never block an edit.
create function app.game_warnings(p_game_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.games;
  n integer;
  reach integer;
  militant integer;
  insurgent integer;
  w text[] := '{}';
  r record;
begin
  select * into g from public.games x where x.id = p_game_id;
  if not found then
    return w;
  end if;
  select count(*) into n from public.game_seats s where s.game_id = g.id;
  if n <> 4 then
    w := w || format('Four different players at every table: game %s has %s seats.', g.game_no, n);
  end if;

  for r in select s.seat, s.faction from public.game_seats s
            where s.game_id = g.id
              and not exists (select 1 from app.pairing_factions() k where k.code = s.faction) loop
    w := w || format('Every seat has a known faction: game %s seat %s has "%s".', g.game_no, r.seat, r.faction);
  end loop;

  select coalesce(sum(k.reach), 0),
         count(*) filter (where k.militant),
         count(*) filter (where not k.militant)
    into reach, militant, insurgent
    from public.game_seats s join app.pairing_factions() k on k.code = s.faction
   where s.game_id = g.id;
  if n = 4 and reach < 21 then
    w := w || format('Table reach at least 21 (rule 6): game %s has a table reach of %s.', g.game_no, reach);
  end if;
  if n = 4 and (militant = 0 or insurgent = 0) then
    w := w || format('Militant and insurgent mix (rule 7): game %s needs at least one militant and one insurgent faction.', g.game_no);
  end if;
  if exists (select 1 from public.game_seats s where s.game_id = g.id and s.faction = 'vagabond')
     and exists (select 1 from public.game_seats s where s.game_id = g.id and s.faction = 'knaves') then
    w := w || format('Militant and insurgent mix (rule 7): game %s has Vagabond and Knaves together.', g.game_no);
  end if;

  for r in select s.faction from public.game_seats s
            where s.game_id = g.id group by s.faction having count(*) > 1 loop
    w := w || format('One of each faction and one board per table (rule 8): game %s has %s more than once.', g.game_no, r.faction);
  end loop;

  for r in select p.display_name, s.faction
             from public.game_seats s
             join public.people p on p.id = s.person_id
            where s.game_id = g.id
              and not exists (select 1 from public.roster x
                               where x.season_id = g.season_id and x.person_id = s.person_id
                                 and s.faction = any (x.ranked_factions)) loop
    w := w || format('Factions only from the player''s own list (rule 1): %s plays %s in game %s, which is not on their list.',
                     r.display_name, r.faction, g.game_no);
  end loop;

  for r in select distinct p.display_name, s.faction
             from public.game_seats s
             join public.people p on p.id = s.person_id
            where s.game_id = g.id
              and exists (select 1 from public.game_seats o
                            join public.games og on og.id = o.game_id
                           where og.season_id = g.season_id and o.game_id <> g.id
                             and o.person_id = s.person_id and o.faction = s.faction) loop
    w := w || format('No repeats, high picks (rule 2): %s plays %s more than once.', r.display_name, r.faction);
  end loop;

  for r in select distinct p.display_name, s.seat
             from public.game_seats s
             join public.people p on p.id = s.person_id
            where s.game_id = g.id
              and exists (select 1 from public.game_seats o
                            join public.games og on og.id = o.game_id
                           where og.season_id = g.season_id and o.game_id <> g.id
                             and o.person_id = s.person_id and o.seat = s.seat) loop
    w := w || format('Different seat every game (rule 4): %s sits in seat %s more than once.', r.display_name, r.seat);
  end loop;

  for r in select distinct p.display_name
             from public.game_seats s
             join public.people p on p.id = s.person_id
            where s.game_id = g.id
              and exists (select 1 from public.game_seats o
                            join public.games og on og.id = o.game_id
                           where og.season_id = g.season_id and o.game_id <> g.id
                             and o.person_id = s.person_id and og.map_index = g.map_index) loop
    w := w || format('Different map every game (rule 5): %s plays the same map more than once.', r.display_name);
  end loop;

  return w;
end;
$$;

-- What an edited or inserted row breaks, for the tables where a rule applies.
create function app.row_warnings(p_table text, p_row jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w text[] := '{}';
  ssn public.seasons;
  r record;
  gid uuid;
  problem text;
  league_count integer;
begin
  if p_table in ('games', 'game_seats') then
    return app.game_warnings(coalesce((p_row ->> 'game_id')::uuid, (p_row ->> 'id')::uuid));
  end if;

  if p_table = 'roster' then
    select * into ssn from public.seasons x where x.id = (p_row ->> 'season_id')::uuid;
    if found then
      if ssn.faction_pool is not null then
        problem := app.list_problem(ssn.faction_pool,
          array(select jsonb_array_elements_text(p_row -> 'ranked_factions')));
        if problem is not null then
          w := w || ('Ranked list: ' || problem);
        end if;
      end if;
      if (p_row ->> 'list_submitted')::boolean and ssn.min_list_length is not null
         and jsonb_array_length(p_row -> 'ranked_factions') < ssn.min_list_length then
        w := w || format('Ranked list: marked submitted but shorter than the minimum of %s.', ssn.min_list_length);
      end if;
      if ssn.capacity is not null then
        select count(*) into league_count from public.roster x
         where x.season_id = ssn.id and x.list = 'league';
        if league_count > ssn.capacity then
          w := w || format('League list: %s people on a list with capacity %s.', league_count, ssn.capacity);
        end if;
      end if;
    end if;
    return w;
  end if;

  if p_table = 'seasons' then
    select * into ssn from public.seasons x where x.id = (p_row ->> 'id')::uuid;
    if found then
      if ssn.capacity is not null then
        select count(*) into league_count from public.roster x
         where x.season_id = ssn.id and x.list = 'league';
        if league_count > ssn.capacity then
          w := w || format('League list: %s people on a list with capacity %s.', league_count, ssn.capacity);
        end if;
      end if;
      if exists (select 1 from public.games g
                  where g.season_id = ssn.id and g.map_index >= coalesce(cardinality(ssn.maps), 0)) then
        w := w || 'Maps: a game uses a map that is no longer in the season''s map list.'::text;
      end if;
    end if;
    return w;
  end if;

  if p_table in ('submissions', 'settlements') then
    gid := (p_row ->> 'game_id')::uuid;
    for r in select p.display_name
               from jsonb_array_elements_text(p_row -> 'winners') x
               join public.people p on p.id = x::uuid
              where not exists (select 1 from public.game_seats s
                                 where s.game_id = gid and s.person_id = x::uuid) loop
      w := w || format('Winners must be seated at the game: %s is not.', r.display_name);
    end loop;
    if p_table = 'submissions'
       and not exists (select 1 from public.game_seats s
                        where s.game_id = gid and s.person_id = (p_row ->> 'person_id')::uuid) then
      w := w || 'Results come from seated players: this person is not seated at the game.'::text;
    end if;
    return w;
  end if;

  if p_table = 'picks' then
    gid := (p_row ->> 'game_id')::uuid;
    if exists (select 1 from public.game_seats s
                where s.game_id = gid and s.person_id = (p_row ->> 'person_id')::uuid) then
      w := w || 'Pick''em: a seated player cannot pick their own game.'::text;
    end if;
    for r in select x.who, p.display_name
               from (values ('first', p_row ->> 'first_pick'), ('second', p_row ->> 'second_pick')) x (who, pid)
               join public.people p on p.id = x.pid::uuid
              where not exists (select 1 from public.game_seats s
                                 where s.game_id = gid and s.person_id = x.pid::uuid) loop
      w := w || format('Pick''em: the %s pick, %s, is not seated at the game.', r.who, r.display_name);
    end loop;
    return w;
  end if;

  return w;
end;
$$;

-- What deleting a row takes with it, and what stops the delete. p_key is typed.
create function app.fixit_dependents(p_table text, p_key jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid;
  removes jsonb := '{}'::jsonb;
  blocked text;
  seats integer;
begin
  if p_table = 'people' then
    pid := (p_key ->> 'id')::uuid;
    select count(*) into seats from public.game_seats s where s.person_id = pid;
    removes := jsonb_build_object(
      'roster', (select count(*) from public.roster x where x.person_id = pid),
      'submissions', (select count(*) from public.submissions x where x.person_id = pid),
      'picks', (select count(*) from public.picks x where x.person_id = pid),
      'pick_mentions', (select count(*) from public.picks x
                         where x.person_id <> pid and (x.first_pick = pid or x.second_pick = pid)));
    if seats > 0 then
      blocked := format('This person is seated in %s game%s. Replace them in those games first.',
                        seats, case when seats = 1 then '' else 's' end);
    end if;
  elsif p_table = 'seasons' then
    pid := (p_key ->> 'id')::uuid;
    removes := jsonb_build_object(
      'roster', (select count(*) from public.roster x where x.season_id = pid),
      'games', (select count(*) from public.games x where x.season_id = pid),
      'seats', (select count(*) from public.game_seats x join public.games g on g.id = x.game_id where g.season_id = pid),
      'submissions', (select count(*) from public.submissions x join public.games g on g.id = x.game_id where g.season_id = pid),
      'settlements', (select count(*) from public.settlements x join public.games g on g.id = x.game_id where g.season_id = pid),
      'picks', (select count(*) from public.picks x join public.games g on g.id = x.game_id where g.season_id = pid));
  elsif p_table = 'games' then
    pid := (p_key ->> 'id')::uuid;
    removes := jsonb_build_object(
      'seats', (select count(*) from public.game_seats x where x.game_id = pid),
      'submissions', (select count(*) from public.submissions x where x.game_id = pid),
      'settlements', (select count(*) from public.settlements x where x.game_id = pid),
      'picks', (select count(*) from public.picks x where x.game_id = pid));
  end if;
  return jsonb_build_object('removes', removes, 'blocked_by', blocked);
end;
$$;

-- Fix it: edit, add, delete ------------------------------------------------------

-- Changes some columns of one row. p_key names the row by its key columns and
-- p_changes holds the new values. Returns the new row, the old row, whether
-- anything changed and the pairing rules the row now breaks (the save is never
-- blocked by them). A change that sets the same values writes and logs nothing.
create function public.fixit_update(p_table text, p_key jsonb, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  spec record;
  k jsonb;
  ch jsonb;
  old_row jsonb;
  new_row jsonb;
  where_sql text;
  set_sql text;
  changed text[];
  msg text;
  det text;
  cn text;
  col text;
begin
  perform app.require_admin();
  select * into spec from app.fixit_spec() s where s.tbl = p_table;
  if not found then
    raise exception 'Fix it cannot change "%".', coalesce(p_table, '') using errcode = '22023';
  end if;
  k := app.fixit_typed(p_table, p_key, spec.key_cols);
  if (select count(*) from jsonb_object_keys(k)) <> cardinality(spec.key_cols) then
    raise exception 'Name the row by %.', array_to_string(spec.key_cols, ', ') using errcode = '22023';
  end if;
  ch := app.fixit_typed(p_table, p_changes, spec.edit_cols);
  if ch = '{}'::jsonb then
    raise exception 'Say which values to change.' using errcode = '22023';
  end if;

  select string_agg(format('t.%I = r.%I', c, c), ' and ') into where_sql from unnest(spec.key_cols) c;
  if p_table = 'seasons' then
    perform app.lock_season((k ->> 'id')::uuid);
  elsif p_table = 'roster' then
    perform app.lock_season((k ->> 'season_id')::uuid);
  end if;

  execute format('select to_jsonb(t) from public.%I t, jsonb_populate_record(null::public.%I, $1) r where %s for update of t',
                 p_table, p_table, where_sql)
    into old_row using k;
  if old_row is null then
    raise exception 'There is no such row in %.', p_table using errcode = 'P0002';
  end if;

  changed := array(select c from jsonb_object_keys(ch) c where (old_row -> c) is distinct from (ch -> c));
  if cardinality(changed) = 0 then
    return jsonb_build_object('row', old_row, 'old', old_row, 'changed', false,
                              'warnings', to_jsonb(app.row_warnings(p_table, old_row)));
  end if;

  select string_agg(format('%I = r.%I', c, c), ', ') into set_sql from unnest(changed) c;
  begin
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where %s returning to_jsonb(t)',
                   p_table, set_sql, p_table, where_sql)
      into new_row using (k || ch);
  exception when others then
    get stacked diagnostics msg = message_text, det = pg_exception_detail,
                            cn = constraint_name, col = column_name;
    if sqlstate like '23%' or sqlstate in ('22P02', '22003', '22007', '22008', '22001') then
      perform app.raise_db_problem(sqlstate, msg, det, cn, col);
    end if;
    raise;
  end;
  return jsonb_build_object('row', new_row, 'old', old_row, 'changed', true,
                            'warnings', to_jsonb(app.row_warnings(p_table, new_row)));
end;
$$;

-- Adds one row. p_row holds the columns to set; the key columns that have no
-- default must be there. Returns the new row and any rules it breaks.
create function public.fixit_insert(p_table text, p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  spec record;
  r jsonb;
  new_row jsonb;
  cols text;
  msg text;
  det text;
  cn text;
  col text;
begin
  perform app.require_admin();
  select * into spec from app.fixit_spec() s where s.tbl = p_table;
  if not found then
    raise exception 'Fix it cannot change "%".', coalesce(p_table, '') using errcode = '22023';
  end if;
  r := app.fixit_typed(p_table, p_row, spec.insert_cols);
  if r = '{}'::jsonb then
    raise exception 'Give the values of the new row.' using errcode = '22023';
  end if;
  if p_table = 'seasons' and r ? 'id' then
    perform app.lock_season((r ->> 'id')::uuid);
  elsif p_table = 'roster' and r ? 'season_id' then
    perform app.lock_season((r ->> 'season_id')::uuid);
  end if;

  select string_agg(quote_ident(c), ', ') into cols from jsonb_object_keys(r) c;
  begin
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I)',
                   p_table, cols, cols, p_table, p_table)
      into new_row using r;
  exception when others then
    get stacked diagnostics msg = message_text, det = pg_exception_detail,
                            cn = constraint_name, col = column_name;
    if sqlstate like '23%' or sqlstate in ('22P02', '22003', '22007', '22008', '22001') then
      perform app.raise_db_problem(sqlstate, msg, det, cn, col);
    end if;
    raise;
  end;
  return jsonb_build_object('row', new_row, 'warnings', to_jsonb(app.row_warnings(p_table, new_row)));
end;
$$;

-- What a delete would take with it, so the page can name the counts before it
-- asks. blocked_by is set when the delete would be refused.
create function public.fixit_delete_preview(p_table text, p_key jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  spec record;
  k jsonb;
  where_sql text;
  old_row jsonb;
  dep jsonb;
begin
  perform app.require_admin();
  select * into spec from app.fixit_spec() s where s.tbl = p_table;
  if not found then
    raise exception 'Fix it cannot change "%".', coalesce(p_table, '') using errcode = '22023';
  end if;
  k := app.fixit_typed(p_table, p_key, spec.key_cols);
  if (select count(*) from jsonb_object_keys(k)) <> cardinality(spec.key_cols) then
    raise exception 'Name the row by %.', array_to_string(spec.key_cols, ', ') using errcode = '22023';
  end if;
  select string_agg(format('t.%I = r.%I', c, c), ' and ') into where_sql from unnest(spec.key_cols) c;
  execute format('select to_jsonb(t) from public.%I t, jsonb_populate_record(null::public.%I, $1) r where %s',
                 p_table, p_table, where_sql)
    into old_row using k;
  if old_row is null then
    raise exception 'There is no such row in %.', p_table using errcode = 'P0002';
  end if;
  dep := app.fixit_dependents(p_table, k);
  return jsonb_build_object('table', p_table, 'row', old_row,
                            'removes', dep -> 'removes', 'blocked_by', dep -> 'blocked_by');
end;
$$;

-- Deletes one row and what hangs off it (the foreign keys cascade). A person who
-- is still seated at a game is refused: replace them first. Returns the row and
-- the counts that went with it.
create function public.fixit_delete(p_table text, p_key jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  spec record;
  k jsonb;
  where_sql text;
  old_row jsonb;
  dep jsonb;
  gone record;
  places jsonb := '[]'::jsonb;
  warnings text[] := '{}';
  msg text;
  det text;
  cn text;
  col text;
begin
  perform app.require_admin();
  select * into spec from app.fixit_spec() s where s.tbl = p_table;
  if not found then
    raise exception 'Fix it cannot change "%".', coalesce(p_table, '') using errcode = '22023';
  end if;
  k := app.fixit_typed(p_table, p_key, spec.key_cols);
  if (select count(*) from jsonb_object_keys(k)) <> cardinality(spec.key_cols) then
    raise exception 'Name the row by %.', array_to_string(spec.key_cols, ', ') using errcode = '22023';
  end if;
  select string_agg(format('t.%I = r.%I', c, c), ' and ') into where_sql from unnest(spec.key_cols) c;
  if p_table = 'seasons' then
    perform app.lock_season((k ->> 'id')::uuid);
  elsif p_table = 'roster' then
    perform app.lock_season((k ->> 'season_id')::uuid);
  end if;

  execute format('select to_jsonb(t) from public.%I t, jsonb_populate_record(null::public.%I, $1) r where %s for update of t',
                 p_table, p_table, where_sql)
    into old_row using k;
  if old_row is null then
    raise exception 'There is no such row in %.', p_table using errcode = 'P0002';
  end if;
  dep := app.fixit_dependents(p_table, k);
  if dep ->> 'blocked_by' is not null then
    raise exception '%', dep ->> 'blocked_by' using errcode = '55000';
  end if;

  if p_table = 'people' then
    select coalesce(jsonb_agg(jsonb_build_object('season_id', x.season_id, 'list', x.list)), '[]'::jsonb)
      into places from public.roster x where x.person_id = (k ->> 'id')::uuid;
  end if;
  begin
    execute format('delete from public.%I t using jsonb_populate_record(null::public.%I, $1) r where %s',
                   p_table, p_table, where_sql)
      using k;
  exception when others then
    get stacked diagnostics msg = message_text, det = pg_exception_detail,
                            cn = constraint_name, col = column_name;
    if sqlstate like '23%' then
      perform app.raise_db_problem(sqlstate, msg, det, cn, col);
    end if;
    raise;
  end;

  if p_table = 'roster' then
    perform app.roster_renumber((old_row ->> 'season_id')::uuid, old_row ->> 'list');
  elsif p_table = 'people' then
    for gone in select (e ->> 'season_id')::uuid as season_id, e ->> 'list' as list
                  from jsonb_array_elements(places) e loop
      perform app.roster_renumber(gone.season_id, gone.list);
    end loop;
  elsif p_table = 'game_seats' then
    warnings := app.game_warnings((old_row ->> 'game_id')::uuid);
  end if;
  return jsonb_build_object('deleted', old_row, 'removed', dep -> 'removes',
                            'warnings', to_jsonb(warnings));
end;
$$;

-- The rules the row as it stands breaks, for the page to show beside it.
create function public.fixit_warnings(p_table text, p_key jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  spec record;
  k jsonb;
  where_sql text;
  cur jsonb;
begin
  perform app.require_admin();
  select * into spec from app.fixit_spec() s where s.tbl = p_table;
  if not found then
    raise exception 'Fix it cannot change "%".', coalesce(p_table, '') using errcode = '22023';
  end if;
  k := app.fixit_typed(p_table, p_key, spec.key_cols);
  if (select count(*) from jsonb_object_keys(k)) <> cardinality(spec.key_cols) then
    raise exception 'Name the row by %.', array_to_string(spec.key_cols, ', ') using errcode = '22023';
  end if;
  select string_agg(format('t.%I = r.%I', c, c), ' and ') into where_sql from unnest(spec.key_cols) c;
  execute format('select to_jsonb(t) from public.%I t, jsonb_populate_record(null::public.%I, $1) r where %s',
                 p_table, p_table, where_sql)
    into cur using k;
  if cur is null then
    raise exception 'There is no such row in %.', p_table using errcode = 'P0002';
  end if;
  return to_jsonb(app.row_warnings(p_table, cur));
end;
$$;

-- People: link a sign-in, replace a player -------------------------------------------

-- Moves a sign-in (and its Discord ID) from the person it created onto a seeded
-- name, then removes the empty duplicate. The duplicate must hold nothing: no
-- roster entry, seat, submission or pick, so nothing is lost. Whitelist rows it
-- added are credited to the seeded person.
create function public.link_person(p_sign_in_person uuid, p_seeded_person uuid)
returns public.people
language plpgsql
security definer
set search_path = ''
as $$
declare
  si public.people;
  sd public.people;
  held text;
begin
  perform app.require_admin();
  if p_sign_in_person is null or p_seeded_person is null or p_sign_in_person = p_seeded_person then
    raise exception 'Pick two different people: the sign-in and the seeded name.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('people-link', 0));
  select * into si from public.people x where x.id = p_sign_in_person for update;
  if not found then
    raise exception 'The sign-in person does not exist.' using errcode = 'P0002';
  end if;
  select * into sd from public.people x where x.id = p_seeded_person for update;
  if not found then
    raise exception 'The seeded person does not exist.' using errcode = 'P0002';
  end if;
  if si.auth_user_id is null then
    raise exception '% has not signed in, so there is no sign-in to move.', si.display_name using errcode = '55000';
  end if;
  if sd.auth_user_id is not null then
    raise exception '% already has a sign-in linked.', sd.display_name using errcode = '55000';
  end if;
  if sd.discord_id is not null and sd.discord_id is distinct from si.discord_id then
    raise exception '% already has a different Discord ID.', sd.display_name using errcode = '55000';
  end if;

  select concat_ws(', ',
           case when n.r > 0 then n.r || ' roster entr' || case when n.r = 1 then 'y' else 'ies' end end,
           case when n.s > 0 then n.s || ' seat' || case when n.s = 1 then '' else 's' end end,
           case when n.u > 0 then n.u || ' submission' || case when n.u = 1 then '' else 's' end end,
           case when n.p > 0 then n.p || ' pick' || case when n.p = 1 then '' else 's' end end)
    into held
    from (select (select count(*) from public.roster x where x.person_id = si.id) as r,
                 (select count(*) from public.game_seats x where x.person_id = si.id) as s,
                 (select count(*) from public.submissions x where x.person_id = si.id) as u,
                 (select count(*) from public.picks x
                   where x.person_id = si.id or x.first_pick = si.id or x.second_pick = si.id) as p) n;
  if held <> '' then
    raise exception '% is not empty (%). Remove or replace those first, or link the other way round.',
      si.display_name, held using errcode = '55000';
  end if;

  update public.whitelist set added_by = sd.id where added_by = si.id;
  delete from public.people where id = si.id;
  update public.people
     set auth_user_id = si.auth_user_id,
         discord_id = coalesce(sd.discord_id, si.discord_id)
   where id = sd.id
  returning * into sd;
  return sd;
end;
$$;

-- Swaps the person in one slot in one game: the seat row stays, naming the new
-- person. Their old submission goes (it was theirs). Winners that named the old
-- person name the new one. Picks that named the old person name the new one, and
-- the new person's own picks on the game go, as a seated player cannot pick it.
create function app.replace_in_game(p_game_id uuid, p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
  subs_removed integer;
  winners_changed integer := 0;
  n integer;
  own_picks integer;
  picks_changed integer;
begin
  select * into g from public.games x where x.id = p_game_id for update;
  if not exists (select 1 from public.game_seats s where s.game_id = p_game_id and s.person_id = p_from) then
    raise exception 'That person is not seated in game %.', g.game_no using errcode = 'P0002';
  end if;
  if exists (select 1 from public.game_seats s where s.game_id = p_game_id and s.person_id = p_to) then
    raise exception 'The new person is already seated in game %.', g.game_no using errcode = '55000';
  end if;

  delete from public.submissions where game_id = p_game_id and person_id = p_from;
  get diagnostics subs_removed = row_count;

  update public.submissions
     set winners = app.winner_set(array_replace(winners, p_from, p_to))
   where game_id = p_game_id and p_from = any (winners);
  get diagnostics n = row_count;
  winners_changed := n;
  update public.settlements
     set winners = app.winner_set(array_replace(winners, p_from, p_to))
   where game_id = p_game_id and p_from = any (winners);
  get diagnostics n = row_count;
  winners_changed := winners_changed + n;

  delete from public.picks where game_id = p_game_id and person_id = p_to;
  get diagnostics own_picks = row_count;
  -- Two picks that would become the same player keep only the first.
  update public.picks set second_pick = null
   where game_id = p_game_id
     and ((first_pick = p_from and second_pick = p_to) or (first_pick = p_to and second_pick = p_from));
  update public.picks
     set first_pick = case when first_pick = p_from then p_to else first_pick end,
         second_pick = case when second_pick = p_from then p_to else second_pick end
   where game_id = p_game_id and (first_pick = p_from or second_pick = p_from);
  get diagnostics picks_changed = row_count;

  update public.game_seats set person_id = p_to where game_id = p_game_id and person_id = p_from;
  return jsonb_build_object('game_no', g.game_no, 'submissions_removed', subs_removed,
                            'winners_updated', winners_changed, 'picks_updated', picks_changed,
                            'own_picks_removed', own_picks);
end;
$$;

-- Replaces a person in a slot. With a game it changes that one game (the person
-- did not turn up for it). Without one it changes the whole season: every seat
-- they hold, and their roster entry (list, place, player number and ranked list)
-- passes to the new person, who must not already be on the league list. If the
-- new person was on the waitlist that entry is removed. Seats and picks stay.
create function public.replace_player(
  p_season_id uuid, p_from uuid, p_to uuid, p_game_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  rf public.roster;
  rt public.roster;
  g record;
  per_game jsonb := '[]'::jsonb;
  warnings text[] := '{}';
  w text[];
  replaced uuid[] := '{}';
  gid uuid;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, false);
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'Pick two different people.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.people x where x.id = p_from) then
    raise exception 'The person being replaced does not exist.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.people x where x.id = p_to) then
    raise exception 'The new person does not exist.' using errcode = 'P0002';
  end if;

  if p_game_id is not null then
    if not exists (select 1 from public.games x where x.id = p_game_id and x.season_id = s.id) then
      raise exception 'That game is not in this season.' using errcode = 'P0002';
    end if;
    per_game := jsonb_build_array(app.replace_in_game(p_game_id, p_from, p_to));
    warnings := app.game_warnings(p_game_id);
    return jsonb_build_object('games', per_game, 'roster_moved', false, 'warnings', to_jsonb(warnings));
  end if;

  select * into rf from public.roster x where x.season_id = s.id and x.person_id = p_from for update;
  if not found then
    raise exception 'The person being replaced is not on this season''s roster.' using errcode = 'P0002';
  end if;
  select * into rt from public.roster x where x.season_id = s.id and x.person_id = p_to for update;
  if found and rt.list = 'league' then
    raise exception 'The new person is already on the league list. Replace them with someone else, or edit the seats on Fix it.'
      using errcode = '55000';
  end if;

  for g in select x.id from public.games x
            where x.season_id = s.id
              and exists (select 1 from public.game_seats st where st.game_id = x.id and st.person_id = p_from)
            order by x.game_no loop
    per_game := per_game || jsonb_build_array(app.replace_in_game(g.id, p_from, p_to));
    replaced := replaced || g.id;
  end loop;

  if rt.person_id is not null then
    delete from public.roster where season_id = s.id and person_id = p_to;
    perform app.roster_renumber(s.id, rt.list);
  end if;
  update public.roster set person_id = p_to where season_id = s.id and person_id = p_from;

  -- Judged once the new player holds the roster entry, so their list counts.
  foreach gid in array replaced loop
    w := app.game_warnings(gid);
    warnings := array(select distinct u from unnest(warnings || w) u order by u);
  end loop;
  return jsonb_build_object('games', per_game, 'roster_moved', true, 'warnings', to_jsonb(warnings));
end;
$$;

-- CSV league state ------------------------------------------------------------

-- A cell as the text a CSV holds: empty for null, the elements of a list joined
-- with a bar, JSON text for an object.
create function app.csv_text(v jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(v)
    when 'null' then ''
    when 'array' then coalesce((select string_agg(e #>> '{}', '|' order by o)
                                  from jsonb_array_elements(v) with ordinality x (e, o)), '')
    else coalesce(v #>> '{}', '')
  end
$$;

-- A CSV cell back to JSON for its column: null when empty, a list when the
-- column is a list (split on the bar). Native JSON values are accepted too.
create function app.csv_raw(v jsonb, p_is_list boolean)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text;
begin
  case jsonb_typeof(v)
    when 'null' then
      return null;
    when 'array' then
      if not p_is_list then
        raise exception 'Expected one value, not a list.';
      end if;
      if jsonb_array_length(v) = 0 then
        return null;
      end if;
      t := app.csv_text(v);
    when 'object' then
      raise exception 'Expected text, not an object.';
    else
      t := v #>> '{}';
  end case;
  if t = '' then
    return null;
  end if;
  if p_is_list then
    if '' = any (string_to_array(t, '|')) then
      raise exception 'The list has an empty entry (use one bar between entries).';
    end if;
    return to_jsonb(string_to_array(t, '|'));
  end if;
  return to_jsonb(t);
end;
$$;

-- Which of the columns a refusal is about, from its detail, constraint name and
-- the file's changeable columns.
create function app.problem_column(p_constraint text, p_detail text, p_cols text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select u.c from unnest(p_cols) with ordinality u (c, o)
      where p_detail ~ ('Key \(([^)]*, )?' || u.c || '(, [^)]*)?\)')
      order by u.o limit 1),
    (select u.c from unnest(p_cols) with ordinality u (c, o)
      where p_constraint is not null and position(u.c in p_constraint) > 0
      order by length(u.c) desc, u.o limit 1))
$$;

-- Adds a problem to the list, up to 50 of them.
create function app.err_add(p_errors jsonb, p_file text, p_row integer, p_col text, p_problem text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_array_length(p_errors) >= 50 then p_errors
    else p_errors || jsonb_build_array(jsonb_build_object(
           'file', p_file, 'row', p_row, 'column', p_col, 'problem', p_problem)) end
$$;

-- Stops an import, naming file, row and column of the first problems. The detail
-- is the full list as JSON for the page to show per row.
create function app.import_fail(p_errors jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  total integer := jsonb_array_length(p_errors);
  shown text;
begin
  select string_agg(format('%s%s%s: %s', e ->> 'file',
                           case when (e ->> 'row')::integer > 0 then ' row ' || (e ->> 'row') else '' end,
                           case when e ->> 'column' is not null then ', column ' || (e ->> 'column') else '' end,
                           e ->> 'problem'), '; ' order by o)
    into shown
    from jsonb_array_elements(p_errors) with ordinality x (e, o)
   where o <= 5;
  raise exception 'Nothing was imported. %',
    shown || case when total > 5 then format(' (and %s more)', total - 5) else '' end
    using errcode = '22023', detail = p_errors::text;
end;
$$;

-- Runs one write for an import and names the file, row and column of a refusal.
create function app.import_exec(p_sql text, p_payload jsonb, p_file text, p_row integer, p_cols text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  msg text;
  det text;
  cn text;
  col text;
begin
  execute p_sql using p_payload;
exception when others then
  get stacked diagnostics msg = message_text, det = pg_exception_detail,
                          cn = constraint_name, col = column_name;
  if sqlstate like '23%' or sqlstate in ('22P02', '22003', '22007', '22008', '22001') then
    perform app.import_fail(jsonb_build_array(jsonb_build_object(
      'file', p_file, 'row', p_row,
      'column', coalesce(nullif(col, ''), app.problem_column(cn, det, p_cols)),
      'problem', app.db_problem(msg, det, cn))));
  end if;
  raise;
end;
$$;

-- The league state as one file per area. Each file has its columns in order and
-- its rows as text, the same shape import_league_state takes back, so an export
-- imported unchanged changes nothing. Season files cover p_season_id; people are
-- league wide; the log is the whole log and is never imported.
create function public.export_league_state(p_season_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sp record;
  out jsonb := '{}'::jsonb;
  found_rows jsonb;
  key_expr text;
  scope_sql text;
  log_cols text[] := array['id', 'at', 'actor_person_id', 'table_name', 'row_key', 'action', 'old', 'new'];
begin
  perform app.require_admin();
  if not exists (select 1 from public.seasons x where x.id = p_season_id) then
    raise exception 'That season does not exist.' using errcode = 'P0002';
  end if;
  for sp in select * from app.import_spec() s order by s.ord loop
    scope_sql := case sp.scope
      when 'none' then 'true'
      when 'self' then 't.id = $1'
      when 'season' then 't.season_id = $1'
      else 't.game_id in (select g.id from public.games g where g.season_id = $1)' end;
    select string_agg(format('to_jsonb(t) ->> %L', c), ', ' order by o) into key_expr
      from unnest(sp.key_cols) with ordinality u (c, o);
    execute format($q$
      select coalesce(jsonb_agg(x.r order by x.k), '[]'::jsonb) from (
        select concat_ws('|', %s) as k,
               (select jsonb_object_agg(c, to_jsonb(app.csv_text(to_jsonb(t) -> c))) from unnest($2) c) as r
          from public.%I t where %s) x$q$, key_expr, sp.tbl, scope_sql)
      into found_rows using p_season_id, sp.cols;
    out := out || jsonb_build_object(sp.file,
             jsonb_build_object('columns', to_jsonb(sp.cols), 'rows', found_rows));
  end loop;

  select coalesce(jsonb_agg(x.r order by x.id), '[]'::jsonb) into found_rows
    from (select l.id,
                 (select jsonb_object_agg(c, to_jsonb(app.csv_text(to_jsonb(l) -> c)))
                    from unnest(log_cols) c) as r
            from public.edit_log l) x;
  return out || jsonb_build_object('log.csv',
           jsonb_build_object('columns', to_jsonb(log_cols), 'rows', found_rows));
end;
$$;

-- The work of an import. Checks every file, row and column first and writes
-- nothing while any is wrong, then writes in dependency order and names the file
-- and row of any refusal; the caller's one function call is one transaction, so a
-- refusal undoes every write. Returns what changed per file.
create function app.import_apply(p_season public.seasons, p_files jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sp record;
  fname text;
  errs jsonb := '[]'::jsonb;
  typed jsonb := '{}'::jsonb;
  files_out jsonb := '{}'::jsonb;
  changes jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  ignored jsonb := '[]'::jsonb;
  game_ids uuid[];
  rows_in jsonb;
  item jsonb;
  trow jsonb;
  ex jsonb;
  existing jsonb;
  ord_row record;
  n integer;
  c text;
  raw jsonb;
  bad boolean;
  not_null text[];
  list_cols text[];
  keytext text;
  seen text[];
  parsed jsonb;
  diff text[];
  outside text[];
  key_expr text;
  scope_sql text;
  where_sql text;
  col_list text;
  set_sql text;
  added integer;
  changed integer;
  removed integer;
  unchanged integer;
  total integer := 0;
  live_changes integer := 0;
  log_before bigint;
  log_id bigint;
begin
  if p_files is null or jsonb_typeof(p_files) <> 'object' then
    raise exception 'Expected the league state files as an object of file name to rows.' using errcode = '22023';
  end if;

  -- 1. Which files -----------------------------------------------------------
  for fname in select jsonb_object_keys(p_files) loop
    if fname = 'log.csv' then
      ignored := ignored || to_jsonb(fname);
    elsif not exists (select 1 from app.import_spec() s where s.file = fname) then
      errs := app.err_add(errs, fname, 0, null,
        'Not a league state file. Expected people.csv, season.csv, roster.csv, lists.csv, games.csv, seats.csv, submissions.csv, results.csv or picks.csv.');
    end if;
  end loop;
  select coalesce(array_agg(g.id), '{}') into game_ids from public.games g where g.season_id = p_season.id;

  -- 2. Every file, row and column, before any write -----------------------------
  for sp in select * from app.import_spec() s order by s.ord loop
    continue when not p_files ? sp.file;
    rows_in := p_files -> sp.file;
    if jsonb_typeof(rows_in) = 'object' then
      rows_in := rows_in -> 'rows';
    end if;
    if jsonb_typeof(rows_in) is distinct from 'array' then
      errs := app.err_add(errs, sp.file, 0, null, 'Expected a list of rows.');
      continue;
    end if;

    select coalesce(array_agg(a.attname::text), '{}') into not_null
      from pg_catalog.pg_attribute a
     where a.attrelid = ('public.' || quote_ident(sp.tbl))::regclass
       and a.attnotnull and a.attnum > 0 and not a.attisdropped;
    select coalesce(array_agg(a.attname::text), '{}') into list_cols
      from pg_catalog.pg_attribute a join pg_catalog.pg_type ty on ty.oid = a.atttypid
     where a.attrelid = ('public.' || quote_ident(sp.tbl))::regclass
       and ty.typcategory = 'A' and a.attnum > 0 and not a.attisdropped;

    parsed := '[]'::jsonb;
    seen := '{}';
    n := 0;
    for item in select value from jsonb_array_elements(rows_in) loop
      n := n + 1;
      if jsonb_typeof(item) <> 'object' then
        errs := app.err_add(errs, sp.file, n, null, 'Expected a row of columns.');
        continue;
      end if;
      bad := false;
      trow := '{}'::jsonb;
      for c in select jsonb_object_keys(item) loop
        if not c = any (sp.cols) then
          errs := app.err_add(errs, sp.file, n, c,
            'Unknown column. Expected ' || array_to_string(sp.cols, ', ') || '.');
          bad := true;
        end if;
      end loop;
      foreach c in array sp.cols loop
        if not item ? c then
          errs := app.err_add(errs, sp.file, n, c, 'Column is missing.');
          bad := true;
          continue;
        end if;
        begin
          raw := app.csv_raw(item -> c, c = any (list_cols));
          if raw is null and c = any (list_cols) and c = any (not_null) then
            raw := '[]'::jsonb;
          end if;
          if raw is null and (c = any (sp.key_cols) or c = any (not_null)) then
            errs := app.err_add(errs, sp.file, n, c, 'A value is required.');
            bad := true;
            continue;
          end if;
          trow := trow || jsonb_build_object(c, app.typed_cell(sp.tbl, c, raw));
        exception when others then
          errs := app.err_add(errs, sp.file, n, c, sqlerrm);
          bad := true;
        end;
      end loop;
      if bad then
        continue;
      end if;

      select string_agg(trow ->> kc, '|' order by o) into keytext
        from unnest(sp.key_cols) with ordinality u (kc, o);
      if keytext = any (seen) then
        errs := app.err_add(errs, sp.file, n, sp.key_cols[1],
          format('Repeats row %s: the same %s twice.', array_position(seen, keytext), array_to_string(sp.key_cols, ' and ')));
        continue;
      end if;
      seen := seen || keytext;

      if sp.scope = 'self' and (trow ->> 'id')::uuid is distinct from p_season.id then
        errs := app.err_add(errs, sp.file, n, 'id', 'This is not the season being imported.');
        continue;
      elsif sp.scope = 'season' and (trow ->> 'season_id')::uuid is distinct from p_season.id then
        errs := app.err_add(errs, sp.file, n, 'season_id', 'This row belongs to another season.');
        continue;
      elsif sp.scope = 'game' and not (trow ->> 'game_id')::uuid = any (game_ids) then
        errs := app.err_add(errs, sp.file, n, 'game_id', 'This is not a game of the season being imported.');
        continue;
      end if;
      parsed := parsed || jsonb_build_array(trow);
    end loop;
    typed := typed || jsonb_build_object(sp.file, parsed);
  end loop;
  if jsonb_array_length(errs) > 0 then
    perform app.import_fail(errs);
  end if;

  -- 3. Write, file by file, in dependency order ---------------------------------
  select coalesce(max(l.id), 0) into log_before from public.edit_log l;
  for sp in select * from app.import_spec() s order by s.ord loop
    continue when not typed ? sp.file;
    scope_sql := case sp.scope
      when 'none' then 'true'
      when 'self' then 't.id = $1'
      when 'season' then 't.season_id = $1'
      else 't.game_id in (select g.id from public.games g where g.season_id = $1)' end;
    select string_agg(format('to_jsonb(t) ->> %L', kc), ', ' order by o) into key_expr
      from unnest(sp.key_cols) with ordinality u (kc, o);
    select string_agg(format('t.%I = r.%I', kc, kc), ' and ') into where_sql from unnest(sp.key_cols) kc;
    select string_agg(quote_ident(cc), ', ') into col_list from unnest(sp.cols) cc;
    execute format($q$
      select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb) from (
        select concat_ws('|', %s) as k,
               (select jsonb_object_agg(e.key, e.value) from jsonb_each(to_jsonb(t)) e where e.key = any($2)) as v
          from public.%I t where %s) x$q$, key_expr, sp.tbl, scope_sql)
      into existing using p_season.id, sp.cols;

    if sp.tbl = 'roster' and sp.file = 'roster.csv' then
      set constraints public.roster_list_position_key, public.roster_player_number_key deferred;
    end if;

    added := 0; changed := 0; removed := 0; unchanged := 0;
    seen := '{}';
    n := 0;
    for ord_row in select value as v from jsonb_array_elements(typed -> sp.file) loop
      n := n + 1;
      trow := ord_row.v;
      select string_agg(trow ->> kc, '|' order by o) into keytext
        from unnest(sp.key_cols) with ordinality u (kc, o);
      seen := seen || keytext;
      ex := existing -> keytext;
      if ex is null then
        if sp.mode in ('update', 'reference') then
          perform app.import_fail(jsonb_build_array(jsonb_build_object(
            'file', sp.file, 'row', n, 'column', sp.key_cols[1],
            'problem', case sp.mode
              when 'reference' then 'Pairings are not imported: this row is not in the published pairings.'
              else 'There is no such row to update.' end)));
        end if;
        perform app.import_exec(
          format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                 sp.tbl, col_list, col_list, sp.tbl),
          trow, sp.file, n, sp.edit_cols || sp.key_cols);
        added := added + 1;
        if jsonb_array_length(changes) < 200 then
          changes := changes || jsonb_build_array(jsonb_build_object(
            'file', sp.file, 'action', 'added', 'key', keytext));
        end if;
      else
        diff := array(select cc from unnest(sp.cols) cc where (ex -> cc) is distinct from (trow -> cc));
        if cardinality(diff) = 0 then
          unchanged := unchanged + 1;
        else
          outside := array(select d from unnest(diff) d where not d = any (sp.edit_cols));
          if cardinality(outside) > 0 then
            perform app.import_fail(jsonb_build_array(jsonb_build_object(
              'file', sp.file, 'row', n, 'column', outside[1],
              'problem', 'Pairings are not imported: this value differs from the published pairings.')));
          end if;
          select string_agg(format('%I = r.%I', d, d), ', ') into set_sql from unnest(diff) d;
          perform app.import_exec(
            format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where %s',
                   sp.tbl, set_sql, sp.tbl, where_sql),
            trow, sp.file, n, sp.edit_cols || sp.key_cols);
          changed := changed + 1;
          if jsonb_array_length(changes) < 200 then
            changes := changes || jsonb_build_array(jsonb_build_object(
              'file', sp.file, 'action', 'changed', 'key', keytext, 'columns', to_jsonb(diff)));
          end if;
        end if;
      end if;
    end loop;

    if sp.mode = 'mirror' then
      for keytext, ex in select e.key, e.value from jsonb_each(existing) e loop
        continue when keytext = any (seen);
        perform app.import_exec(
          format('delete from public.%I t using jsonb_populate_record(null::public.%I, $1) r where %s',
                 sp.tbl, sp.tbl, where_sql),
          ex, sp.file, 0, sp.edit_cols || sp.key_cols);
        removed := removed + 1;
        if jsonb_array_length(changes) < 200 then
          changes := changes || jsonb_build_array(jsonb_build_object(
            'file', sp.file, 'action', 'removed', 'key', keytext));
        end if;
      end loop;
    end if;

    if sp.tbl = 'roster' and sp.file = 'roster.csv' then
      perform app.import_exec('set constraints public.roster_list_position_key, public.roster_player_number_key immediate',
                              '{}'::jsonb, sp.file, 0, array['list', 'position', 'player_number']);
    end if;

    files_out := files_out || jsonb_build_object(sp.file, jsonb_build_object(
      'added', added, 'changed', changed, 'removed', removed, 'unchanged', unchanged));
    total := total + added + changed + removed;
    if sp.file in ('games.csv', 'submissions.csv', 'results.csv', 'picks.csv') then
      live_changes := live_changes + added + changed + removed;
    end if;
  end loop;

  if p_season.started_at is not null and live_changes > 0 then
    warnings := warnings || to_jsonb(format(
      'The season has started. This import changes %s game, submission, result or pick row%s that players have already seen.',
      live_changes, case when live_changes = 1 then '' else 's' end));
  end if;

  -- 4. One log entry for the import, with the file names ------------------------
  if total > 0 then
    insert into public.edit_log (actor_person_id, table_name, row_key, action, new)
    values (app.person_id(), 'import', p_season.id::text, 'insert', jsonb_build_object(
              'files', (select jsonb_agg(f order by f) from jsonb_object_keys(p_files) f),
              'counts', files_out,
              'first_log_id', (select min(l.id) from public.edit_log l where l.id > log_before),
              'last_log_id', (select max(l.id) from public.edit_log l)))
    returning id into log_id;
  end if;

  return jsonb_build_object(
    'season_id', p_season.id,
    'files', files_out,
    'total_changes', total,
    'changes', changes,
    'ignored', ignored,
    'warnings', warnings,
    'log_id', log_id);
end;
$$;

-- Imports league state for one season from the files export_league_state makes
-- (or the same files edited): { "picks.csv": [ {column: text, ...}, ... ], ... }
-- or each file as { columns, rows }. Files the call does not name are left alone;
-- a file it names is the state of that area (see app.import_spec). Nothing is
-- written when any file, row or column is wrong: the error names the file, row
-- and column, and its detail is the full list as JSON. With p_preview the whole
-- import runs and is then undone, so the page can show exactly what would change
-- (counts and the first 200 changes per call) before the admin confirms.
create function public.import_league_state(p_season_id uuid, p_files jsonb, p_preview boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  result jsonb;
begin
  perform app.require_admin();
  s := app.roster_season(p_season_id, false);
  begin
    result := app.import_apply(s, p_files);
    if p_preview then
      raise exception 'preview' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    result := result || jsonb_build_object('preview', true, 'log_id', null);
    return result;
  end;
  return result || jsonb_build_object('preview', false);
end;
$$;

-- Privileges ------------------------------------------------------------------------

-- Helpers in the app schema are called from the functions above, which run with
-- their owner's rights; no client role needs them.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'app'::regnamespace
       and p.proname in ('fixit_spec', 'import_spec', 'typed_cell', 'fixit_typed', 'db_problem',
                         'raise_db_problem', 'game_warnings', 'row_warnings', 'fixit_dependents',
                         'replace_in_game', 'csv_text', 'csv_raw', 'problem_column', 'err_add',
                         'import_fail', 'import_exec', 'import_apply')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

revoke all on function
  public.fixit_update(text, jsonb, jsonb),
  public.fixit_insert(text, jsonb),
  public.fixit_delete(text, jsonb),
  public.fixit_delete_preview(text, jsonb),
  public.fixit_warnings(text, jsonb),
  public.link_person(uuid, uuid),
  public.replace_player(uuid, uuid, uuid, uuid),
  public.export_league_state(uuid),
  public.import_league_state(uuid, jsonb, boolean)
  from public, anon;
grant execute on function
  public.fixit_update(text, jsonb, jsonb),
  public.fixit_insert(text, jsonb),
  public.fixit_delete(text, jsonb),
  public.fixit_delete_preview(text, jsonb),
  public.fixit_warnings(text, jsonb),
  public.link_person(uuid, uuid),
  public.replace_player(uuid, uuid, uuid, uuid),
  public.export_league_state(uuid),
  public.import_league_state(uuid, jsonb, boolean)
  to authenticated;
