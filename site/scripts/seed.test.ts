// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseSeed, runSeed, seedSql } from './seed.ts'

const preferences = JSON.parse(readFileSync(new URL('../../season-1/preferences.json', import.meta.url), 'utf8'))
const roster = readFileSync(new URL('../../season-1/roster.md', import.meta.url), 'utf8')
const players = parseSeed(preferences, roster)
const admin = '100000000000000001'

it('maps the repo lists, submitted flags and dense positions', () => {
  expect(players).toHaveLength(12)
  expect(players.filter((p) => p.list === 'league').map((p) => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  expect(players.filter((p) => p.list === 'waitlist').map((p) => p.position)).toEqual([1, 2])
  expect(players.filter((p) => p.submitted).map((p) => p.name).sort()).toEqual(['Alex', 'David', 'Kyra', 'Matt', 'Will'])
  expect(players.find((p) => p.name === 'Will')?.factions).toEqual(['birds', 'moles', 'lizards', 'bats', 'WA'])
  expect(players.every((p) => p.discordId === null)).toBe(true)
})

it('accepts optional string IDs and refuses invalid or duplicate IDs and names', () => {
  expect(parseSeed(preferences, roster, { Will: admin }).find((p) => p.name === 'Will')?.discordId).toBe(admin)
  expect(() => parseSeed(preferences, roster, { Will: 123 })).toThrow('ID string')
  expect(() => parseSeed(preferences, roster, { Will: admin, Alex: admin })).toThrow('duplicate ID')
  expect(() => parseSeed(preferences, roster, { Nobody: admin })).toThrow('missing from roster')
})

it('refuses a missing admin before file reads or connection', () => {
  expect(() => runSeed({})).toThrow('ADMIN_DISCORD_ID is required')
  expect(() => runSeed({ ADMIN_DISCORD_ID: 'wrong' })).toThrow('15–20 digits')
})

it('rejects malformed input before any writes', () => {
  expect(() => parseSeed({ ...preferences, players: { ...preferences.players, Will: ['unknown'] } }, roster)).toThrow('Unknown faction for Will')
  expect(() => parseSeed({ ...preferences, players: { ...preferences.players, Will: ['WA', 'alliance'] } }, roster)).toThrow('Duplicate faction')
  expect(() => parseSeed({ ...preferences, status: { ...preferences.status, Will: 'Other' } }, roster)).toThrow('Unknown list status')
  expect(() => parseSeed(preferences, roster.replace('Possible', 'Withdrawn'))).toThrow('Unknown roster status')
  expect(() => parseSeed(preferences, `${roster}\n| Will | Confirmed |`)).toThrow('Duplicate roster')
})

// Opt in against a migrated TEST database with its OWNER URL and psql on PATH.
// Fixture writes, TRUNCATE and all seed calls roll back. Never use a live DB.
const databaseUrl = process.env.SEED_TEST_DATABASE_URL
function insideTransaction(sql: string) {
  return sql.replace(/^begin;\n/, '').replace(/commit;\n$/, '')
}
const seed = insideTransaction(seedSql(players, admin))
const checksum = `select md5(string_agg(row_data, '' order by row_data)) from (
  select row_to_json(t)::text row_data from public.people t union all
  select row_to_json(t)::text from public.roster t union all
  select row_to_json(t)::text from public.seasons t union all
  select row_to_json(t)::text from public.whitelist t union all
  select row_to_json(t)::text from public.edit_log t) rows`
const ids = Object.fromEntries(players.map((p, i) => [p.name, `2000000000000000${String(i).padStart(2, '0')}`]))
// Exported so a scratch Postgres driver can run the same SQL without psql.
export const databaseChecks = `begin;
alter table public.edit_log disable trigger user;
truncate public.roster, public.seasons, public.people, public.whitelist, public.edit_log cascade;
alter table public.edit_log enable trigger user;
${seed}
create temp table before_seed as ${checksum};
${seed}
do $checks$ begin
  if (${checksum}) <> (select md5 from before_seed) then raise exception 'Rerun changed checksum'; end if;
  if (select count(*) from public.people) <> 12 then raise exception 'Expected 12 people'; end if;
  if (select count(*) from public.roster where list = 'league') <> 10 then raise exception 'Expected 10 league'; end if;
  if (select count(*) from public.roster where list = 'waitlist') <> 2 then raise exception 'Expected 2 waitlist'; end if;
  if exists (select 1 from public.seasons where capacity is not null or games_each is not null
    or maps is not null or faction_pool is not null or min_list_length is not null
    or lists_lock_at is not null or started_at is not null or seed is not null) then raise exception 'Settings must be unset'; end if;
end $checks$;
${players.map((p) => `do $check$ begin
  if not exists (select 1 from public.roster r join public.people p on p.id = r.person_id
    where p.seed_key = '${p.seedKey}' and r.list = '${p.list}' and r.position = ${p.position}
      and r.ranked_factions = array[${p.factions.map((f) => `'${f}'`).join(',')}]::text[]
      and r.list_submitted = ${p.submitted}) then raise exception 'Roster mismatch: ${p.name}'; end if;
end $check$;`).join('\n')}
${insideTransaction(seedSql(parseSeed(preferences, roster, ids), admin))}
do $links$ begin
  if (select count(*) from public.people p join public.whitelist w using (discord_id)
    where w.label = p.display_name) <> 12 then raise exception 'Expected 12 linked IDs'; end if;
end $links$;
update public.roster set ranked_factions = '{cats}', list_submitted = false;
update public.seasons set name = 'Edited', capacity = 12;
delete from public.roster where person_id = (select id from public.people where seed_key = 'season-1:will');
${seed}
do $edits$ begin
  if exists (select 1 from public.roster where ranked_factions <> '{cats}')
    or (select count(*) from public.roster) <> 11
    or not exists (select 1 from public.seasons where name = 'Edited' and capacity = 12)
    then raise exception 'Rerun overwrote admin edits'; end if;
end $edits$;
rollback;
`

it.skipIf(!databaseUrl)('imports, reruns without writes, links all IDs and preserves admin edits in Postgres', () => {
  const result = spawnSync('psql', ['-X', '--no-password', '--set=ON_ERROR_STOP=1', '--quiet'], {
    env: { ...process.env, PGDATABASE: databaseUrl }, encoding: 'utf8', input: databaseChecks,
  })
  expect(result.error).toBeUndefined()
  expect(result.stderr).not.toContain('ERROR:')
  expect(result.status).toBe(0)
}, 30_000)
