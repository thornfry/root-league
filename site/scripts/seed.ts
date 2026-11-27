/**
 * One-time Season 1 import; reruns preserve the live database (decision 48).
 * Requires psql on PATH and a database-owner DATABASE_URL (defaults to local
 * Supabase). ADMIN_DISCORD_ID is required. DISCORD_IDS optionally names a private
 * JSON file of { "Roster name": "digits" }; IDs must be strings, never numbers.
 * No fake IDs or dev flags are generated here; those belong to supabase/seed.sql.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findFaction } from '../src/data/factions.ts'

export type SeedPlayer = {
  name: string
  seedKey: string
  list: 'league' | 'waitlist'
  position: number
  factions: string[]
  submitted: boolean
  discordId: string | null
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return value as Record<string, unknown>
}

function discordId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9]{15,20}$/.test(value)) {
    throw new Error(`${label} must be a Discord ID string of 15–20 digits.`)
  }
  return value
}

export function parseSeed(preferences: unknown, roster: string, ids: unknown = {}): SeedPlayer[] {
  const input = object(preferences, 'preferences')
  const lists = object(input.players, 'preferences.players')
  const statuses = object(input.status, 'preferences.status')
  const mapping = object(ids, 'DISCORD_IDS')
  const positions = { league: 0, waitlist: 0 }
  const names = new Set<string>()
  const players: SeedPlayer[] = []
  for (const line of roster.split(/\r?\n/)) {
    const cells = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(line)
    if (!cells || cells[1] === 'Player' || /^[-: ]+$/.test(cells[1])) continue
    const [, name, status] = cells
    if (status !== 'Confirmed' && status !== 'Possible') throw new Error(`Unknown roster status for ${name}: ${status}`)
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate roster name: ${name}`)
    names.add(name.toLowerCase())
    const ranked = lists[name]
    if (!Array.isArray(ranked) || !ranked.length) throw new Error(`Missing faction list for ${name}.`)
    const factions = ranked.map((value: unknown) => {
      const faction = typeof value === 'string' ? findFaction(value) : undefined
      if (!faction) throw new Error(`Unknown faction for ${name}: ${String(value)}`)
      return faction.code
    })
    if (new Set(factions).size !== factions.length) throw new Error(`Duplicate faction for ${name}.`)
    if (statuses[name] !== 'Submitted' && statuses[name] !== 'Provisional') throw new Error(`Unknown list status for ${name}.`)
    const list = status === 'Confirmed' ? 'league' : 'waitlist'
    players.push({ name, seedKey: `season-1:${name.toLowerCase()}`, list, position: ++positions[list], factions,
      submitted: statuses[name] === 'Submitted',
      discordId: Object.hasOwn(mapping, name) ? discordId(mapping[name], `DISCORD_IDS.${name}`) : null })
  }
  if (!players.length) throw new Error('No roster rows found.')
  for (const name of [...Object.keys(lists), ...Object.keys(statuses), ...Object.keys(mapping)]) {
    if (!players.some((p) => p.name === name)) throw new Error(`Name missing from roster: ${name}`)
  }
  const linked = players.flatMap((p) => p.discordId ? [p.discordId] : [])
  if (new Set(linked).size !== linked.length) throw new Error('DISCORD_IDS contains a duplicate ID.')
  return players
}

export function seedSql(players: SeedPlayer[], adminId: string): string {
  discordId(adminId, 'ADMIN_DISCORD_ID')
  // Hex JSON is safe both as a SQL literal and as psql input, even for names
  // containing quotes, backslashes, newlines or psql meta-command characters.
  const payload = Buffer.from(JSON.stringify({ players, adminId })).toString('hex')
  return `begin;
select pg_advisory_xact_lock(hashtextextended('root-league:season-1-seed', 0));
do $seed$
declare
  data jsonb := convert_from(decode('${payload}', 'hex'), 'UTF8')::jsonb;
  item jsonb;
  pid uuid;
  sid uuid;
  fresh boolean;
  existing public.people;
  candidates uuid[];
  did text;
begin
  insert into public.seasons (slug, name, is_current)
  values ('season-1', 'Season 1', not exists (select 1 from public.seasons where is_current))
  on conflict (slug) do nothing returning id into sid;
  fresh := found;
  if not fresh then select id into sid from public.seasons where slug = 'season-1'; end if;

  insert into public.whitelist (discord_id, is_admin)
  values (data->>'adminId', true)
  on conflict (discord_id) do update set is_admin = true where not public.whitelist.is_admin;

  for item in select value from jsonb_array_elements(data->'players') loop
    did := item->>'discordId';
    select * into existing from public.people where seed_key = item->>'seedKey';
    if not found and did is not null then
      select * into existing from public.people where discord_id = did;
    end if;
    if existing.id is null then
      select array_agg(id) into candidates from public.people
       where lower(btrim(display_name)) = lower(item->>'name') and seed_key is null
         and (discord_id is null or discord_id = did);
      if cardinality(candidates) > 1 then raise exception 'Ambiguous seeded name: %', item->>'name'; end if;
      select * into existing from public.people where id = candidates[1];
    end if;
    if existing.id is null then
      insert into public.people (display_name, seed_key, discord_id)
      values (item->>'name', item->>'seedKey', did) returning id into pid;
    else
      pid := existing.id;
      if existing.seed_key is not null and existing.seed_key <> item->>'seedKey' then
        raise exception 'Discord ID belongs to another seeded person: %', item->>'name';
      end if;
      if did is not null and existing.discord_id is not null and existing.discord_id <> did then
        raise exception 'Person already has a different Discord ID: %', item->>'name';
      end if;
      update public.people set seed_key = item->>'seedKey', discord_id = coalesce(discord_id, did)
       where id = pid and (seed_key is null or (discord_id is null and did is not null));
    end if;
    if did is not null then
      insert into public.whitelist (discord_id, label) values (did, item->>'name')
      on conflict (discord_id) do nothing;
    end if;
    if fresh then
      insert into public.roster (season_id, person_id, list, position, ranked_factions, list_submitted)
      values (sid, pid, item->>'list', (item->>'position')::integer,
        array(select jsonb_array_elements_text(item->'factions')), (item->>'submitted')::boolean);
    end if;
  end loop;
end;
$seed$;
commit;
`
}

export function runSeed(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.ADMIN_DISCORD_ID) throw new Error('ADMIN_DISCORD_ID is required; set it to the first admin’s Discord user ID.')
  discordId(env.ADMIN_DISCORD_ID, 'ADMIN_DISCORD_ID')
  const root = new URL('../../', import.meta.url)
  const players = parseSeed(
    JSON.parse(readFileSync(new URL('season-1/preferences.json', root), 'utf8')),
    readFileSync(new URL('season-1/roster.md', root), 'utf8'),
    env.DISCORD_IDS ? JSON.parse(readFileSync(env.DISCORD_IDS, 'utf8')) : {},
  )
  const result = spawnSync('psql', ['-X', '--no-password', '--set=ON_ERROR_STOP=1', '--quiet'], {
    input: seedSql(players, env.ADMIN_DISCORD_ID), encoding: 'utf8',
    env: { ...env, PGDATABASE: env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' },
  })
  if (result.error) throw new Error('Unable to run psql. Install the PostgreSQL client and put psql on PATH.')
  // Do not print a connection error that might contain database credentials.
  if (result.status !== 0) throw new Error('Season 1 seed failed; the transaction was rolled back. Check database access and existing identity conflicts.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runSeed()
    console.log('Season 1 seeded. Existing settings, lists and roster edits were preserved.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Season 1 seed failed.')
    process.exitCode = 1
  }
}
