import type { SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from './support/fixtures'
import { anonClient, apiAs, type Db } from './support/api'
import { SEASON_ID, withDatabase } from './support/database'
import { identity, type CastName } from './support/people'
import { POOL, MAPS, addToRoster, addPick, configureSeason, createPeople, seedLiveSeason } from './support/scenario'
import type { Database } from '../src/db/types'

// S15: every table, view and function a client can reach, tried through supabase-js with a real session for each
// kind of person, and refused or allowed as the roles in user-stories.md say. Nothing here mocks the API or uses a
// service key. Data is set up with SQL; every attempt is made through the API.
//
// How to read a verdict:
//   ok      the call succeeds
//   denied  the permission gate refuses it (SQLSTATE 42501) and no row anywhere changes
//   gate    the permission gate lets it through; the database may still refuse the values (any code but 42501)
//   code    the gate lets it through and the named state refusal follows (55000 state, P0002 not found)

type Who = 'anon' | 'outsider' | 'viewer' | 'prospect' | 'league' | 'admin'
type Verdict = 'ok' | 'denied' | 'gate' | { code: string }
type Row = Record<string, unknown>
type Table = keyof Database['public']['Tables']
type View = keyof Database['public']['Views']
interface Outcome { data: unknown; error: { code?: string; message: string } | null }

const ORDER: Who[] = ['anon', 'outsider', 'viewer', 'prospect', 'league', 'admin']
const NOBODY = '00000000-0000-4000-8000-0000000000aa'
const NOBODY_TOO = '00000000-0000-4000-8000-0000000000bb'

// Everything the API exposes, typed against the generated schema so a typo or a missing table fails the typecheck.
const TABLES = ['app_config', 'edit_log', 'game_seats', 'games', 'people', 'picks', 'roster', 'seasons', 'settlements', 'submissions', 'whitelist'] as const satisfies readonly Table[]
const VIEWS = ['game_outcome', 'leaderboard', 'pickem_scores', 'roster_public', 'season_stage', 'standings'] as const satisfies readonly View[]

/** Rows that exist in the database, counted around every refused attempt. Refusing is not enough: nothing may change. */
async function snapshot() {
  return withDatabase(async (db) => (await db.query(`select
    (select count(*) from public.whitelist) as whitelist, (select count(*) from public.people) as people,
    (select count(*) from public.seasons) as seasons, (select count(*) from public.roster) as roster,
    (select count(*) from public.games) as games, (select count(*) from public.game_seats) as game_seats,
    (select count(*) from public.submissions) as submissions, (select count(*) from public.settlements) as settlements,
    (select count(*) from public.picks) as picks, (select count(*) from public.edit_log) as edit_log,
    (select md5(string_agg(is_admin::text || label, ',' order by discord_id)) from public.whitelist) as whitelist_state,
    (select md5(string_agg(display_name || coalesce(discord_id, ''), ',' order by id)) from public.people) as people_state`)).rows[0] as Row)
}

function judge(label: string, outcome: Outcome, verdict: Verdict) {
  const code = outcome.error?.code
  const said = outcome.error ? `${outcome.error.code ?? '?'} ${outcome.error.message}` : 'no error'
  if (verdict === 'ok') expect(outcome.error, `${label}: expected success, got ${said}`).toBeNull()
  // PGRST202 is how the API reports a function the caller may not execute, for a role that cannot see it at all.
  else if (verdict === 'denied') expect(['42501', 'PGRST202'], `${label}: expected refusal, got ${said}`).toContain(code)
  else if (verdict === 'gate') expect(['42501', 'PGRST202', 'PGRST301'], `${label}: expected the gate to pass, got ${said}`).not.toContain(code)
  else expect(code, `${label}: expected ${verdict.code}, got ${said}`).toBe(verdict.code)
}

interface Ctx {
  season: string
  lockAt: string
  /** Person id by display name, refreshed before every call. */
  ids: Record<string, string>
  games: string[]
  added?: string
  person: (name: CastName) => string
}

function makeCtx(lockAt: string): Ctx {
  const ctx: Ctx = { season: SEASON_ID, lockAt, ids: {}, games: [], person: (name) => ctx.ids[name] ?? NOBODY }
  return ctx
}

async function refresh(ctx: Ctx) {
  ctx.ids = await withDatabase(async (db) => Object.fromEntries((await db.query<{ display_name: string; id: string }>('select display_name, id from public.people')).rows.map((r) => [r.display_name, r.id])))
}

interface Call {
  label: string
  run: (db: Db, ctx: Ctx) => PromiseLike<Outcome>
  expect: Partial<Record<Who, Verdict>>
  check?: (who: Who, outcome: Outcome, ctx: Ctx) => void
}

/** Runs each call as each kind of person, in order, so a later call sees what an earlier one allowed. */
async function sweep(calls: Call[], clients: Partial<Record<Who, Db>>, ctx: Ctx) {
  for (const call of calls) {
    await refresh(ctx)
    for (const who of ORDER) {
      const verdict = call.expect[who]
      const db = clients[who]
      if (!verdict || !db) continue
      const label = `${call.label} as ${who}`
      const before = verdict === 'denied' ? await snapshot() : null
      const outcome = await call.run(db, ctx)
      judge(label, outcome, verdict)
      call.check?.(who, outcome, ctx)
      if (before) expect(await snapshot(), `${label} must change nothing`).toEqual(before)
    }
  }
}

type ReadVerdict = 'denied' | 'none' | 'rows' | ((rows: Row[], ctx: Ctx) => void)
interface Read { source: Table | View; expect: Partial<Record<Who, ReadVerdict>> }

async function sweepReads(reads: Read[], clients: Partial<Record<Who, Db>>, ctx: Ctx) {
  await refresh(ctx)
  for (const read of reads) {
    for (const who of ORDER) {
      const verdict = read.expect[who]
      const db = clients[who]
      if (!verdict || !db) continue
      const label = `read ${read.source} as ${who}`
      const { data, error } = await (db as unknown as SupabaseClient).from(read.source).select('*')
      const rows = (data ?? []) as Row[]
      if (verdict === 'denied') {
        expect(error?.code, `${label}: expected refusal, got ${error?.message ?? 'rows'}`).toBe('42501')
        expect(rows).toEqual([])
      } else {
        expect(error, `${label}: ${error?.message}`).toBeNull()
        if (verdict === 'none') expect(rows, `${label}: expected no rows`).toEqual([])
        else if (verdict === 'rows') expect(rows.length, `${label}: expected rows`).toBeGreaterThan(0)
        else verdict(rows, ctx)
      }
    }
  }
}

// One probe per table: an insert, an update and a delete that name real columns, so only the permission can stop them.
const PROBES: Record<Table, { insert: Row; patch: Row; key: [string, string | number] }> = {
  app_config: { insert: { key: 'sweep', value: 'x' }, patch: { value: 'x' }, key: ['key', 'dev_signin'] },
  edit_log: { insert: { table_name: 'sweep', action: 'insert' }, patch: { table_name: 'sweep' }, key: ['id', 1] },
  game_seats: { insert: { game_id: NOBODY, seat: 1, person_id: NOBODY, faction: 'cats' }, patch: { faction: 'cats' }, key: ['seat', 1] },
  games: { insert: { season_id: SEASON_ID, game_no: 99, map_index: 0 }, patch: { void: true }, key: ['game_no', 1] },
  people: { insert: { display_name: 'Sweep' }, patch: { display_name: 'Sweep' }, key: ['display_name', 'Delaney'] },
  picks: { insert: { game_id: NOBODY, person_id: NOBODY, first_pick: NOBODY }, patch: { first_pick: NOBODY }, key: ['game_id', NOBODY] },
  roster: { insert: { season_id: SEASON_ID, person_id: NOBODY, list: 'waitlist', position: 99 }, patch: { position: 99 }, key: ['position', 1] },
  seasons: { insert: { slug: 'sweep', name: 'Sweep' }, patch: { name: 'Sweep' }, key: ['id', SEASON_ID] },
  settlements: { insert: { game_id: NOBODY, winners: [NOBODY] }, patch: { winners: [NOBODY] }, key: ['game_id', NOBODY] },
  submissions: { insert: { game_id: NOBODY, person_id: NOBODY, winners: [NOBODY] }, patch: { winners: [NOBODY] }, key: ['game_id', NOBODY] },
  whitelist: { insert: { discord_id: '100000000000000099', is_admin: true }, patch: { is_admin: true }, key: ['discord_id', '100000000000000002'] },
}
const VIEW_PROBES: Record<View, { patch: Row; key: [string, string | number] }> = {
  game_outcome: { patch: { state: 'settled' }, key: ['state', 'upcoming'] },
  leaderboard: { patch: { points: 99 }, key: ['rank', 1] },
  pickem_scores: { patch: { points: 99 }, key: ['points', 0] },
  roster_public: { patch: { list: 'league' }, key: ['list', 'waitlist'] },
  season_stage: { patch: { stage: 'live' }, key: ['stage', 'open'] },
  standings: { patch: { rank: 1 }, key: ['rank', 1] },
}

/** Direct writes. Every table and view refuses every one of them, for everyone, the admin included (decision 42). */
async function sweepWrites(clients: Partial<Record<Who, Db>>) {
  for (const who of ORDER) {
    const db = clients[who] as unknown as SupabaseClient | undefined
    if (!db) continue
    for (const table of TABLES) {
      const probe = PROBES[table]
      const before = await snapshot()
      const label = `direct write to ${table} as ${who}`
      const inserted = await db.from(table).insert(probe.insert)
      expect(inserted.error?.code, `insert ${label}: ${inserted.error?.message ?? 'was allowed'}`).toBe('42501')
      const updated = await db.from(table).update(probe.patch).eq(probe.key[0], probe.key[1])
      expect(updated.error?.code, `update ${label}: ${updated.error?.message ?? 'was allowed'}`).toBe('42501')
      const deleted = await db.from(table).delete().eq(probe.key[0], probe.key[1])
      expect(deleted.error?.code, `delete ${label}: ${deleted.error?.message ?? 'was allowed'}`).toBe('42501')
      expect(await snapshot(), `${label} must change nothing`).toEqual(before)
    }
    for (const view of VIEWS) {
      const probe = VIEW_PROBES[view]
      const before = await snapshot()
      const label = `direct write to view ${view} as ${who}`
      // A view may refuse for a different reason than a table (it may not be updatable at all). It must refuse.
      expect((await db.from(view).insert(probe.patch)).error, `insert ${label}`).not.toBeNull()
      expect((await db.from(view).update(probe.patch).eq(probe.key[0], probe.key[1])).error, `update ${label}`).not.toBeNull()
      expect((await db.from(view).delete().eq(probe.key[0], probe.key[1])).error, `delete ${label}`).not.toBeNull()
      expect(await snapshot(), `${label} must change nothing`).toEqual(before)
    }
  }
}

const none = { anon: 'denied', outsider: 'none' } as const

const whoamiCheck = (expected: Partial<Record<Who, (me: Row) => void>>): Call['check'] => (who, outcome) => expected[who]?.(outcome.data as Row)

test('S15: before the season starts, every function and table by signed-out, not invited, viewer, prospect and admin', async () => {
  test.setTimeout(240_000)
  const lockAt = new Date(Date.now() + 86_400_000).toISOString()
  await withDatabase(async (db) => {
    await configureSeason(db)
    const ids = await createPeople(db, ['Delaney', 'Alex'])
    await addToRoster(db, ids, 'waitlist', ['Delaney'], { factions: ['cats', 'birds'] })
    await db.query(
      "insert into public.roster (season_id, person_id, list, position, ranked_factions, list_submitted) values ($1, $2, 'waitlist', 2, $3, true)",
      [SEASON_ID, ids.Alex, ['rats', 'frogs']],
    )
  })
  const clients: Partial<Record<Who, Db>> = {
    anon: anonClient(),
    outsider: await apiAs(identity('Not invited')),
    viewer: await apiAs(identity('Spectator')),
    prospect: await apiAs(identity('Delaney')),
    admin: await apiAs(identity('Dev admin')),
  }
  const ctx = makeCtx(lockAt)
  const mine = (rows: Row[], ctx2: Ctx, name: CastName) => rows.find((r) => r.person_id === ctx2.person(name))

  // Reads. A refused table gives 42501; a gated row gives an empty list, never a different failure.
  await sweepReads([
    { source: 'app_config', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'denied' } },
    { source: 'whitelist', expect: { ...none, viewer: 'none', prospect: 'none', admin: 'rows' } },
    { source: 'edit_log', expect: { ...none, viewer: 'none', prospect: 'none', admin: 'rows' } },
    { source: 'roster', expect: { ...none, viewer: 'none', prospect: 'none', admin: 'rows' } },
    { source: 'people', expect: { ...none, viewer: 'rows', prospect: 'rows', admin: 'rows' } },
    { source: 'seasons', expect: { ...none, viewer: 'rows', prospect: 'rows', admin: 'rows' } },
    { source: 'season_stage', expect: { ...none, viewer: 'rows', prospect: 'rows', admin: 'rows' } },
    {
      source: 'roster_public',
      expect: {
        ...none,
        // Before the lock a viewer sees who is in and whether a list is in, and nothing about any list, place or date.
        viewer: (rows) => {
          expect(rows.length).toBe(2)
          for (const row of rows) {
            expect([row.ranked_factions, row.list, row.position, row.joined_at, row.list_flagged]).toEqual([null, null, null, null, null])
          }
        },
        // A prospect sees their own ranked list and nobody else's.
        prospect: (rows, c) => {
          expect(mine(rows, c, 'Delaney')?.ranked_factions).toEqual(['cats', 'birds'])
          expect(mine(rows, c, 'Delaney')?.is_me).toBe(true)
          expect(mine(rows, c, 'Alex')?.ranked_factions).toBeNull()
          expect(rows.every((r) => r.list === null && r.position === null)).toBe(true)
        },
        // The admin sees every list and the roster place.
        admin: (rows, c) => {
          expect(mine(rows, c, 'Alex')?.ranked_factions).toEqual(['rats', 'frogs'])
          expect(rows.map((r) => r.list)).toEqual(['waitlist', 'waitlist'])
        },
      },
    },
    ...(['games', 'game_seats', 'submissions', 'settlements', 'picks', 'game_outcome', 'standings', 'leaderboard', 'pickem_scores'] as const).map((source) => ({
      // No game exists yet. Whoever may read these tables gets an empty list; whoever may not gets a refusal or nothing.
      source, expect: { anon: 'denied', outsider: 'none', viewer: 'none', prospect: 'none', admin: 'none' } as const,
    })),
  ], clients, ctx)

  const calls: Call[] = [
    { label: 'whoami', expect: { anon: 'ok', outsider: 'ok', viewer: 'ok', prospect: 'ok', admin: 'ok' },
      run: (db) => db.rpc('whoami'),
      check: whoamiCheck({
        anon: (me) => expect([me.signed_in, me.whitelisted]).toEqual([false, false]),
        outsider: (me) => expect([me.signed_in, me.whitelisted, me.person_id ?? null]).toEqual([true, false, null]),
        viewer: (me) => expect([me.whitelisted, me.is_admin]).toEqual([true, false]),
        prospect: (me) => expect(me.roles).toEqual(['viewer']),
        admin: (me) => expect([me.is_admin, me.roles]).toEqual([true, ['viewer', 'admin']]),
      }) },
    { label: 'ensure_person', expect: { anon: 'denied', outsider: 'denied', viewer: 'ok', prospect: 'ok', admin: 'ok' }, run: (db) => db.rpc('ensure_person') },
    // A viewer has no place on the roster yet, so there is no list to save. A prospect saves their own.
    { label: 'save_ranked_list before joining', expect: { anon: 'denied', outsider: 'denied', viewer: { code: '55000' }, prospect: 'ok', admin: { code: '55000' } },
      run: (db, c) => db.rpc('save_ranked_list', { p_season_id: c.season, p_factions: ['cats', 'birds'] }) },
    { label: 'join_league', expect: { anon: 'denied', outsider: 'denied', viewer: 'ok', prospect: 'ok', admin: 'ok' },
      run: (db, c) => db.rpc('join_league', { p_season_id: c.season }) },
    { label: 'save_ranked_list after joining', expect: { anon: 'denied', outsider: 'denied', viewer: 'ok', prospect: 'ok', admin: 'ok' },
      run: (db, c) => db.rpc('save_ranked_list', { p_season_id: c.season, p_factions: ['cats', 'birds', 'WA'] }) },
    { label: 'save_ranked_list with a repeated faction', expect: { anon: 'denied', outsider: 'denied', viewer: { code: '22023' }, prospect: { code: '22023' }, admin: { code: '22023' } },
      run: (db, c) => db.rpc('save_ranked_list', { p_season_id: c.season, p_factions: ['cats', 'cats'] }) },
    { label: 'roster_set_list', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('roster_set_list', { p_season_id: c.season, p_person_id: c.person('Delaney'), p_factions: ['cats', 'birds'] }) },
    { label: 'roster_move', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('roster_move', { p_season_id: c.season, p_person_id: c.person('Delaney'), p_to_list: 'league' }) },
    { label: 'roster_swap', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('roster_swap', { p_season_id: c.season, p_person_a: c.person('Delaney'), p_person_b: c.person('Spectator') }) },
    { label: 'roster_add', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('roster_add', { p_season_id: c.season, p_display_name: 'Sweep added', p_list: 'waitlist' }),
      check: (who, outcome, c) => { if (who === 'admin') c.added = outcome.data as string } },
    { label: 'roster_remove', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('roster_remove', { p_season_id: c.season, p_person_id: c.added ?? NOBODY }) },
    { label: 'publish_pairings', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: '55000' } },
      run: (db, c) => db.rpc('publish_pairings', { p_season_id: c.season, p_seed: 'sweep', p_order: [], p_games: [] }) },
    // Whoever is whitelisted and has a person reaches the game lookup; there is no such game, so the answer is not found.
    { label: 'submit_result', expect: { anon: 'denied', outsider: 'denied', viewer: { code: 'P0002' }, prospect: { code: 'P0002' }, admin: { code: 'P0002' } },
      run: (db) => db.rpc('submit_result', { p_game_id: NOBODY, p_winners: [NOBODY_TOO] }) },
    { label: 'save_pick', expect: { anon: 'denied', outsider: 'denied', viewer: { code: 'P0002' }, prospect: { code: 'P0002' }, admin: { code: 'P0002' } },
      run: (db) => db.rpc('save_pick', { p_game_id: NOBODY, p_first: NOBODY_TOO }) },
    { label: 'settle_game', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: 'P0002' } },
      run: (db) => db.rpc('settle_game', { p_game_id: NOBODY, p_winners: [NOBODY_TOO] }) },
    { label: 'reopen_game', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: 'P0002' } },
      run: (db) => db.rpc('reopen_game', { p_game_id: NOBODY }) },
    { label: 'void_game', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: 'P0002' } },
      run: (db) => db.rpc('void_game', { p_game_id: NOBODY, p_void: true }) },
    { label: 'fixit_insert', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'gate' },
      run: (db) => db.rpc('fixit_insert', { p_table: 'people', p_row: { display_name: 'Fix it sweep' } }) },
    { label: 'fixit_update', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: 'P0002' } },
      run: (db) => db.rpc('fixit_update', { p_table: 'people', p_key: { id: NOBODY }, p_changes: { display_name: 'Nobody' } }) },
    { label: 'fixit_delete_preview', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: 'P0002' } },
      run: (db) => db.rpc('fixit_delete_preview', { p_table: 'people', p_key: { id: NOBODY } }) },
    { label: 'fixit_delete', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'gate' },
      run: (db) => db.rpc('fixit_delete', { p_table: 'people', p_key: { id: NOBODY } }) },
    { label: 'fixit_warnings', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: 'P0002' } },
      run: (db) => db.rpc('fixit_warnings', { p_table: 'people', p_key: { id: NOBODY } }) },
    { label: 'fixit_update outside the allowlist', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: '22023' } },
      run: (db) => db.rpc('fixit_update', { p_table: 'whitelist', p_key: { discord_id: '100000000000000001' }, p_changes: { is_admin: false } }) },
    { label: 'link_person', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: 'P0002' } },
      run: (db) => db.rpc('link_person', { p_sign_in_person: NOBODY, p_seeded_person: NOBODY_TOO }) },
    { label: 'replace_player', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: { code: 'P0002' } },
      run: (db, c) => db.rpc('replace_player', { p_season_id: c.season, p_from: NOBODY, p_to: NOBODY_TOO }) },
    { label: 'export_league_state', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('export_league_state', { p_season_id: c.season }) },
    { label: 'import_league_state', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'gate' },
      run: (db, c) => db.rpc('import_league_state', { p_season_id: c.season, p_files: {}, p_preview: true }) },
    { label: 'whitelist_add', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db) => db.rpc('whitelist_add', { p_discord_id: '100000000000000099', p_label: 'Sweep' }) },
    { label: 'whitelist_add_many', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db) => db.rpc('whitelist_add_many', { p_entries: [{ discord_id: '100000000000000098', label: 'Sweep many' }] }) },
    { label: 'whitelist_label', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db) => db.rpc('whitelist_label', { p_discord_id: '100000000000000099', p_label: 'Sweep renamed' }) },
    { label: 'whitelist_set_admin on', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db) => db.rpc('whitelist_set_admin', { p_discord_id: '100000000000000099', p_is_admin: true }) },
    { label: 'whitelist_set_admin off', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db) => db.rpc('whitelist_set_admin', { p_discord_id: '100000000000000099', p_is_admin: false }) },
    { label: 'whitelist_remove', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db) => db.rpc('whitelist_remove', { p_discord_id: '100000000000000099' }) },
    { label: 'whitelist_remove the other', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db) => db.rpc('whitelist_remove', { p_discord_id: '100000000000000098' }) },
    { label: 'leave_league', expect: { anon: 'denied', outsider: 'denied', viewer: 'ok', prospect: 'ok', admin: 'ok' },
      run: (db, c) => db.rpc('leave_league', { p_season_id: c.season }) },
    { label: 'season_save', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('season_save', { p_season_id: c.season, p_name: 'Sweep season', p_capacity: 8, p_games_each: 2, p_maps: MAPS, p_faction_pool: POOL, p_min_list_length: 2, p_lists_lock_at: c.lockAt }) },
    // Last: it makes a new season current, which would change the answer to every call after it.
    { label: 'season_create', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', admin: 'ok' },
      run: (db) => db.rpc('season_create', { p_name: 'Sweep second season' }) },
  ]
  await sweep(calls, clients, ctx)

  // Admin writes through functions landed: nothing the sweep added is left on the whitelist.
  const left = await withDatabase(async (db) => (await db.query("select count(*)::int as n from public.whitelist where discord_id in ('100000000000000098', '100000000000000099')")).rows[0] as { n: number })
  expect(left.n).toBe(0)

  // Direct table and view writes: all refused, for all six kinds of person that exist in this phase.
  await sweepWrites(clients)
})

test('S15: after the season starts, the league player, the waitlisted prospect and what a started season refuses', async () => {
  test.setTimeout(240_000)
  const live = await seedLiveSeason(['upcoming', 'recorded', 'upcoming', 'upcoming'])
  const [g1, g2, g3, g4] = live.games.map((g) => g.id) as [string, string, string, string]
  await withDatabase(async (db) => {
    // Alex's pick on a closed game, David's on an open one.
    await addPick(db, g2, live.ids.Alex!, live.ids.Adam!, live.ids.Zach!)
    await addPick(db, g4, live.ids.David!, live.ids.Matt!)
  })
  const clients: Partial<Record<Who, Db>> = {
    anon: anonClient(),
    outsider: await apiAs(identity('Not invited')),
    viewer: await apiAs(identity('Spectator')),
    prospect: await apiAs(identity('David')),
    league: await apiAs(identity('Delaney')),
    admin: await apiAs(identity('Dev admin')),
  }
  const ctx = makeCtx(new Date().toISOString())
  ctx.games = [g1, g2, g3, g4]
  const person = (name: CastName) => live.ids[name]!

  const roles = (expected: string[]) => (me: Row) => expect(me.roles).toEqual(expected)
  const calls: Call[] = [
    { label: 'ensure_person', expect: { anon: 'denied', outsider: 'denied', viewer: 'ok', prospect: 'ok', league: 'ok', admin: 'ok' }, run: (db) => db.rpc('ensure_person') },
    { label: 'whoami roles', expect: { anon: 'ok', outsider: 'ok', viewer: 'ok', prospect: 'ok', league: 'ok', admin: 'ok' }, run: (db) => db.rpc('whoami'),
      check: whoamiCheck({
        anon: roles([]), outsider: roles([]), viewer: roles(['viewer']), prospect: roles(['viewer', 'prospect']),
        league: roles(['viewer', 'league_player']), admin: roles(['viewer', 'admin']),
      }) },
    // Delaney sits at game 3, so she may not pick it. The others may pick any game that is still open.
    { label: 'save_pick on an open game', expect: { anon: 'denied', outsider: 'denied', viewer: 'ok', prospect: 'ok', league: 'denied', admin: 'ok' },
      run: (db) => db.rpc('save_pick', { p_game_id: g3, p_first: person('Alex'), p_second: person('Adam') }) },
    { label: 'save_pick naming someone not at the table', expect: { anon: 'denied', outsider: 'denied', viewer: { code: '22023' }, prospect: { code: '22023' }, league: 'denied', admin: { code: '22023' } },
      run: (db) => db.rpc('save_pick', { p_game_id: g3, p_first: person('Matt') }) },
    { label: 'save_pick with the same first and second', expect: { anon: 'denied', outsider: 'denied', viewer: { code: '22023' }, prospect: { code: '22023' }, league: 'denied', admin: { code: '22023' } },
      run: (db) => db.rpc('save_pick', { p_game_id: g3, p_first: person('Alex'), p_second: person('Alex') }) },
    { label: 'save_pick on a game with a result', expect: { anon: 'denied', outsider: 'denied', viewer: { code: '55000' }, prospect: { code: '55000' }, league: { code: '55000' }, admin: { code: '55000' } },
      run: (db) => db.rpc('save_pick', { p_game_id: g2, p_first: person('Adam') }) },
    // Delaney sits at game 1 and is a league player of a started season. Everyone else is refused; the admin settles it.
    { label: 'submit_result by a seated league player', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'ok', admin: 'ok' },
      run: (db) => db.rpc('submit_result', { p_game_id: g1, p_winners: [person('Delaney')] }) },
    { label: 'submit_result at a table they are not seated at', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied' },
      run: (db) => db.rpc('submit_result', { p_game_id: g4, p_winners: [person('Matt')] }) },
    { label: 'submit_result after the admin settled', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: { code: '55000' } },
      run: (db) => db.rpc('submit_result', { p_game_id: g1, p_winners: [person('Alex')] }) },
    { label: 'save_pick on a settled game', expect: { anon: 'denied', outsider: 'denied', viewer: { code: '55000' }, prospect: { code: '55000' }, league: 'denied', admin: { code: '55000' } },
      run: (db) => db.rpc('save_pick', { p_game_id: g1, p_first: person('Delaney') }) },
    { label: 'settle_game', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db) => db.rpc('settle_game', { p_game_id: g3, p_winners: [person('Alex')] }) },
    { label: 'reopen_game', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db) => db.rpc('reopen_game', { p_game_id: g3 }) },
    { label: 'void_game', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db) => db.rpc('void_game', { p_game_id: g2, p_void: true }) },
    { label: 'unvoid with void_game', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db) => db.rpc('void_game', { p_game_id: g2, p_void: false }) },
    // Joining, leaving, list edits and every roster move are closed once the season has started.
    { label: 'join_league', expect: { anon: 'denied', outsider: 'denied', viewer: { code: '55000' }, prospect: 'ok', league: 'ok', admin: { code: '55000' } },
      run: (db, c) => db.rpc('join_league', { p_season_id: c.season }) },
    { label: 'leave_league', expect: { anon: 'denied', outsider: 'denied', viewer: { code: '55000' }, prospect: { code: '55000' }, league: { code: '55000' }, admin: { code: '55000' } },
      run: (db, c) => db.rpc('leave_league', { p_season_id: c.season }) },
    { label: 'save_ranked_list', expect: { anon: 'denied', outsider: 'denied', viewer: { code: '55000' }, prospect: { code: '55000' }, league: { code: '55000' }, admin: { code: '55000' } },
      run: (db, c) => db.rpc('save_ranked_list', { p_season_id: c.season, p_factions: ['cats', 'birds'] }) },
    { label: 'roster_set_list', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('roster_set_list', { p_season_id: c.season, p_person_id: person('Delaney'), p_factions: ['cats', 'birds', 'WA'] }) },
    { label: 'roster_move', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: { code: '55000' } },
      run: (db, c) => db.rpc('roster_move', { p_season_id: c.season, p_person_id: person('David'), p_to_list: 'league' }) },
    { label: 'roster_swap', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: { code: '55000' } },
      run: (db, c) => db.rpc('roster_swap', { p_season_id: c.season, p_person_a: person('David'), p_person_b: person('Delaney') }) },
    { label: 'roster_add', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: { code: '55000' } },
      run: (db, c) => db.rpc('roster_add', { p_season_id: c.season, p_display_name: 'Too late' }) },
    { label: 'roster_remove', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: { code: '55000' } },
      run: (db, c) => db.rpc('roster_remove', { p_season_id: c.season, p_person_id: person('David') }) },
    { label: 'publish_pairings again', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: { code: '55000' } },
      run: (db, c) => db.rpc('publish_pairings', { p_season_id: c.season, p_seed: 'again', p_order: [], p_games: [] }) },
    { label: 'season_save keeping capacity and games', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('season_save', { p_season_id: c.season, p_name: 'Sweep season', p_capacity: 8, p_games_each: 2, p_maps: MAPS, p_faction_pool: POOL, p_min_list_length: 2, p_lists_lock_at: c.lockAt }) },
    { label: 'season_save changing capacity', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: { code: '55000' } },
      run: (db, c) => db.rpc('season_save', { p_season_id: c.season, p_name: 'Sweep season', p_capacity: 12, p_games_each: 2, p_maps: MAPS, p_faction_pool: POOL, p_min_list_length: 2, p_lists_lock_at: c.lockAt }) },
    { label: 'fixit_update a seat', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db) => db.rpc('fixit_update', { p_table: 'game_seats', p_key: { game_id: g3, seat: 1 }, p_changes: { faction: 'cats' } }) },
    { label: 'fixit_delete_preview a person', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db) => db.rpc('fixit_delete_preview', { p_table: 'people', p_key: { id: person('Chuck') } }) },
    { label: 'fixit_warnings for a game', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db) => db.rpc('fixit_warnings', { p_table: 'games', p_key: { id: g3 } }) },
    { label: 'replace_player in one game', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('replace_player', { p_season_id: c.season, p_from: person('Zach'), p_to: person('Chuck'), p_game_id: g3 }) },
    { label: 'export_league_state', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'ok' },
      run: (db, c) => db.rpc('export_league_state', { p_season_id: c.season }) },
    { label: 'whitelist_remove', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: { code: 'P0002' } },
      run: (db) => db.rpc('whitelist_remove', { p_discord_id: '100000000000000099' }) },
  ]
  await sweep(calls, clients, ctx)

  const rowsOf = (rows: Row[]) => rows.map((r) => `${r.game_id}:${r.person_id}`)
  const picksSeen = (rows: Row[], visible: string[], hidden: string[]) => {
    const keys = rowsOf(rows)
    for (const key of visible) expect(keys, `picks should include ${key}`).toContain(key)
    for (const key of hidden) expect(keys, `picks should not include ${key}`).not.toContain(key)
  }
  const pick = (game: string, name: CastName) => `${game}:${person(name)}`
  const everyoneWhitelisted = { viewer: 'rows', prospect: 'rows', league: 'rows', admin: 'rows' } as const
  await sweepReads([
    { source: 'app_config', expect: { anon: 'denied', outsider: 'denied', viewer: 'denied', prospect: 'denied', league: 'denied', admin: 'denied' } },
    { source: 'whitelist', expect: { ...none, viewer: 'none', prospect: 'none', league: 'none', admin: 'rows' } },
    { source: 'edit_log', expect: { ...none, viewer: 'none', prospect: 'none', league: 'none', admin: 'rows' } },
    { source: 'roster', expect: { ...none, viewer: 'none', prospect: 'none', league: 'none', admin: (rows) => expect(rows.length).toBe(9) } },
    ...(['people', 'seasons', 'season_stage', 'games', 'game_seats', 'game_outcome', 'standings', 'settlements'] as const).map((source) => ({ source, expect: { ...none, ...everyoneWhitelisted } })),
    {
      source: 'roster_public',
      // After the start every list is open to read, but no one except the admin learns which list a person is on.
      expect: {
        ...none,
        ...Object.fromEntries((['viewer', 'prospect', 'league'] as const).map((who) => [who, (rows: Row[]) => {
          expect(rows.length).toBe(9)
          expect(rows.every((r) => r.list === null && r.position === null && r.joined_at === null)).toBe(true)
          expect(rows.every((r) => Array.isArray(r.ranked_factions))).toBe(true)
        }])),
        admin: (rows) => expect(rows.filter((r) => r.list === 'league').length).toBe(8),
      },
    },
    {
      // A submission is private to its owner and the admin, even when the game is closed.
      source: 'submissions',
      expect: {
        ...none, viewer: 'none', prospect: 'none',
        league: (rows, c) => { expect(rows.length).toBe(1); expect(rows[0]!.person_id).toBe(c.person('Delaney')) },
        admin: (rows) => expect(rows.length).toBe(2),
      },
    },
    {
      // A pick is private until its game closes; the owner and the admin always read it.
      source: 'picks',
      expect: {
        ...none,
        viewer: (rows) => picksSeen(rows, [pick(g3, 'Spectator'), pick(g2, 'Alex')], [pick(g3, 'David'), pick(g4, 'David'), pick(g3, 'Dev admin')]),
        prospect: (rows) => picksSeen(rows, [pick(g3, 'David'), pick(g4, 'David'), pick(g2, 'Alex')], [pick(g3, 'Spectator'), pick(g3, 'Dev admin')]),
        league: (rows) => picksSeen(rows, [pick(g2, 'Alex')], [pick(g3, 'David'), pick(g4, 'David'), pick(g3, 'Spectator')]),
        admin: (rows) => picksSeen(rows, [pick(g2, 'Alex'), pick(g3, 'Spectator'), pick(g3, 'David'), pick(g4, 'David'), pick(g3, 'Dev admin')], []),
      },
    },
    {
      source: 'pickem_scores',
      expect: {
        ...none,
        viewer: (rows) => picksSeen(rows, [pick(g3, 'Spectator'), pick(g2, 'Alex')], [pick(g4, 'David'), pick(g3, 'David')]),
        prospect: (rows) => picksSeen(rows, [pick(g4, 'David'), pick(g2, 'Alex')], [pick(g3, 'Spectator')]),
        league: (rows) => picksSeen(rows, [pick(g2, 'Alex')], [pick(g4, 'David'), pick(g3, 'Spectator')]),
        admin: (rows) => picksSeen(rows, [pick(g4, 'David'), pick(g3, 'Spectator'), pick(g2, 'Alex')], []),
      },
    },
    { source: 'leaderboard', expect: { ...none, ...everyoneWhitelisted } },
  ], clients, ctx)

  await sweepWrites(clients)
})
