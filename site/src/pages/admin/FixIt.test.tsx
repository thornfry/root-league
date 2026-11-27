import '@testing-library/jest-dom/vitest'
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { adminJson, makeFakeDb, viewerJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

type Row = Record<string, unknown>
const FACTION = ['cats', 'birds', 'otters', 'WA']
const NAMES = ['Alex', 'Blair', 'Casey', 'Devon']

interface World { tables: Record<string, Row[]>; log: Row[] }
let world: World

function freshWorld(): World {
  const people = [
    ...NAMES.map((display_name, i) => ({ id: `p${i}`, display_name, discord_id: `10000000000000000${i}`, seed_key: `seed${i}`, auth_user_id: i < 3 ? `u${i}` : null })),
    { id: 'p-new', display_name: 'New sign-in', discord_id: '100000000000000099', seed_key: null, auth_user_id: 'u-new' },
    { id: 'p-admin', display_name: 'Dev admin', discord_id: '100000000000000001', seed_key: null, auth_user_id: 'u-admin' },
  ]
  return {
    log: [{ id: 1, at: '2026-11-20T10:00:00.000Z', actor_person_id: 'p-admin', table_name: 'settlements', row_key: 'g1', action: 'insert', old: null, new: { game_id: 'g1', winners: ['p0'] } }],
    tables: {
      seasons: [{ id: 's', name: 'Season 1', is_current: true, capacity: 8, games_each: 2, maps: ['Autumn', 'Winter'], faction_pool: null, min_list_length: 4, lists_lock_at: '2026-11-01T10:00:00.000Z', started_at: '2026-11-02T10:00:00.000Z', seed: 'abc' }],
      season_stage: [{ stage: 'live' }],
      people,
      whitelist: [{ discord_id: '100000000000000001', is_admin: true }],
      roster: NAMES.map((_, i) => ({ season_id: 's', person_id: `p${i}`, list: 'league', position: i + 1, player_number: i + 1, list_submitted: true, list_flagged: false, ranked_factions: ['cats', 'birds', 'otters', 'WA'], joined_at: '2026-10-01T00:00:00.000Z' })),
      games: [{ id: 'g1', season_id: 's', game_no: 1, map_index: 0, void: false, game_seats: NAMES.map((_, i) => ({ game_id: 'g1', seat: i + 1, person_id: `p${i}`, faction: FACTION[i] })) }],
      submissions: [{ game_id: 'g1', person_id: 'p0', winners: ['p0'] }, { game_id: 'g1', person_id: 'p1', winners: ['p1'] }],
      settlements: [],
      picks: [{ game_id: 'g1', person_id: 'p-admin', first_pick: 'p0', second_pick: 'p1', updated_at: '2026-11-03T00:00:00.000Z' }],
      game_outcome: [{ game_id: 'g1', season_id: 's', state: 'disputed', winners: null }],
      roster_public: [], pickem_scores: [],
    },
  }
}

function setup(persona = adminJson(), warnings: string[] = []) {
  world = freshWorld()
  const auth = makeFakeDb({ whoami: persona })
  const queried: string[] = []
  const rows = (table: string) => table === 'edit_log' ? [...world.log].sort((a, b) => Number(b.id) - Number(a.id)) : world.tables[table] ?? []
  const from = vi.fn((table: string) => {
    queried.push(table)
    const filters: ((r: Row) => boolean)[] = []
    const chain: Record<string, unknown> = {}
    const done = () => rows(table).filter((r) => filters.every((f) => f(r)))
    chain.then = (resolve: (r: unknown) => void) => Promise.resolve({ data: done(), error: null }).then(resolve)
    for (const method of ['select', 'order', 'limit']) chain[method] = vi.fn(() => chain)
    chain.eq = vi.fn((col: string, value: unknown) => { filters.push((r) => r[col] === value); return chain })
    chain.in = vi.fn((col: string, values: unknown[]) => { filters.push((r) => values.includes(r[col])); return chain })
    for (const method of ['maybeSingle', 'single']) chain[method] = vi.fn(async () => ({ data: done()[0] ?? null, error: null }))
    return chain
  })
  const log = (table: string, action: string, old: Row | null, next: Row | null, key: string) =>
    world.log.push({ id: world.log.length + 1, at: '2026-11-27T12:00:00.000Z', actor_person_id: 'p-admin', table_name: table, row_key: key, action, old, new: next })
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'whoami') return { data: persona, error: null }
    const table = String(args.p_table)
    const key = (args.p_key ?? {}) as Row
    const find = () => world.tables[table === 'game_seats' ? 'game_seats' : table]?.find((r) => Object.entries(key).every(([k, v]) => r[k] === v))
    if (name === 'fixit_warnings') return { data: warnings, error: null }
    if (name === 'fixit_update' && table === 'game_seats') {
      const seats = world.tables.games![0]!.game_seats as Row[]
      const seat = seats.find((s) => s.seat === key.seat)!
      const old = { ...seat }
      Object.assign(seat, args.p_changes)
      log('game_seats', 'update', old, { ...seat }, `g1,${seat.seat}`)
      return { data: { row: seat, old, changed: true, warnings }, error: null }
    }
    if (name === 'fixit_update') {
      const row = find()!
      const old = { ...row }
      Object.assign(row, args.p_changes)
      log(table, 'update', old, { ...row }, String(Object.values(key)))
      return { data: { row, old, changed: true, warnings: [] }, error: null }
    }
    if (name === 'fixit_insert') {
      const row = { ...(args.p_row as Row) }
      world.tables[table]!.push(row)
      log(table, 'insert', null, row, String(row.game_id))
      return { data: { row, warnings: [] }, error: null }
    }
    if (name === 'fixit_delete_preview') {
      if (table === 'people' && key.id === 'p0') return { data: { table, row: {}, removes: { roster: 1, submissions: 1, picks: 0 }, blocked_by: 'This person is seated in 1 game. Replace them in those games first.' }, error: null }
      return { data: { table, row: {}, removes: { roster: 0, submissions: 2, picks: 3, pick_mentions: 1 }, blocked_by: null }, error: null }
    }
    if (name === 'fixit_delete') {
      const list = world.tables[table]!
      const i = list.findIndex((r) => Object.entries(key).every(([k, v]) => r[k] === v))
      const [gone] = list.splice(i, 1)
      log(table, 'delete', gone!, null, String(Object.values(key)))
      return { data: { deleted: gone, removed: {}, warnings: [] }, error: null }
    }
    if (name === 'void_game') { world.tables.games![0]!.void = args.p_void; return { data: null, error: null } }
    if (name === 'reopen_game') { world.tables.settlements = []; return { data: null, error: null } }
    if (name === 'settle_game') { world.tables.settlements = [{ game_id: 'g1', winners: args.p_winners }]; return { data: null, error: null } }
    if (name === 'link_person' || name === 'replace_player') return { data: { warnings: [] }, error: null }
    return auth.rpc(name)
  })
  h.db = { ...auth.db, from, rpc }
  return { rpc, from, queried, user: userEvent.setup() }
}

const calls = (rpc: ReturnType<typeof setup>['rpc'], name: string) => rpc.mock.calls.filter((c) => c[0] === name).map((c) => c[1])

beforeEach(() => { world = freshWorld() })

it('saves a seat edit that breaks a rule, names the rule, and logs who, when, old and new', async () => {
  const f = setup(adminJson(), ['Table reach at least 21 (rule 6): game 1 has a table reach of 20.'])
  renderApp('/admin/fixit?a=games')
  await screen.findByRole('heading', { name: 'Table 1, Autumn' })
  await f.user.selectOptions(screen.getByLabelText('Faction, seat 1'), 'WA')
  await f.user.click(screen.getByRole('button', { name: 'Save seats' }))
  await screen.findByText('Seats saved.')
  expect(calls(f.rpc, 'fixit_update')).toEqual([{ p_table: 'game_seats', p_key: { game_id: 'g1', seat: 1 }, p_changes: { faction: 'WA' } }])
  expect(screen.getByText(/This edit breaks 1 rule/)).toBeInTheDocument()
  expect(screen.getByText('It was saved anyway.', { exact: false })).toBeInTheDocument()
  expect(screen.getAllByText('Table reach at least 21 (rule 6): game 1 has a table reach of 20.').length).toBeGreaterThan(0)
  const log = screen.getByRole('region', { name: 'Edit log' })
  const row = (await within(log).findByText('Seats: Table 1 seat 1 changed')).closest('li')!
  expect(within(row).getByText('Dev admin')).toBeInTheDocument()
  expect(within(row).getByText('faction: cats')).toBeInTheDocument()
  expect(within(row).getByText('faction: WA')).toBeInTheDocument()
  expect(row.querySelector('time')).not.toBeNull()
})

it('shows the rules the table already breaks and a clear note when it breaks none', async () => {
  setup(adminJson(), [])
  renderApp('/admin/fixit?a=games')
  await screen.findByText('No pairing rule is broken.')
})

it('replaces a player in one game only', async () => {
  const f = setup()
  renderApp('/admin/fixit')
  await screen.findByRole('heading', { name: 'Replace a player in a slot' })
  await f.user.selectOptions(screen.getByLabelText('Replace'), 'p1')
  await f.user.selectOptions(screen.getByLabelText('With'), 'p-new')
  await f.user.selectOptions(screen.getByLabelText('In'), 'g1')
  await f.user.click(screen.getByRole('button', { name: 'Replace player' }))
  await screen.findByText('Player replaced.')
  expect(calls(f.rpc, 'replace_player')).toEqual([{ p_season_id: 's', p_from: 'p1', p_to: 'p-new', p_game_id: 'g1' }])
})

it('states what goes with a person before deleting them', async () => {
  const f = setup()
  renderApp('/admin/fixit?a=people')
  await f.user.click(await screen.findByRole('button', { name: 'Delete Casey' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete Casey?' })
  expect(within(dialog).getByText('This also deletes 2 submissions, 3 picks and 1 pick by other players that names them.')).toBeInTheDocument()
  expect(calls(f.rpc, 'fixit_delete')).toEqual([])
  await f.user.click(within(dialog).getByRole('button', { name: 'Delete person' }))
  await screen.findByText('Casey deleted.')
  expect(calls(f.rpc, 'fixit_delete')).toEqual([{ p_table: 'people', p_key: { id: 'p2' } }])
})

it('refuses to delete a seated person and says why', async () => {
  const f = setup()
  renderApp('/admin/fixit?a=people')
  await f.user.click(await screen.findByRole('button', { name: 'Delete Alex' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete Alex?' })
  expect(within(dialog).getByText('This person is seated in 1 game. Replace them in those games first.')).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Delete person' })).not.toBeInTheDocument()
})

it('renames a person and links a sign-in to a seeded name', async () => {
  const f = setup()
  renderApp('/admin/fixit?a=people')
  await f.user.click(await screen.findByRole('button', { name: 'Rename Blair' }))
  await f.user.clear(screen.getByLabelText('New name for Blair'))
  await f.user.type(screen.getByLabelText('New name for Blair'), 'Blair B')
  await f.user.click(screen.getByRole('button', { name: 'Save name' }))
  await screen.findByText('Renamed to Blair B.')
  expect(calls(f.rpc, 'fixit_update')).toEqual([{ p_table: 'people', p_key: { id: 'p1' }, p_changes: { display_name: 'Blair B' } }])
  await f.user.selectOptions(screen.getByLabelText('Seeded name'), 'p3')
  await f.user.click(screen.getByRole('button', { name: 'Link' }))
  await screen.findByText('Sign-in linked to the seeded name.')
  expect(calls(f.rpc, 'link_person')).toEqual([{ p_sign_in_person: 'p-new', p_seeded_person: 'p3' }])
})

it('edits a ranked list and sends only what changed', async () => {
  const f = setup()
  renderApp('/admin/fixit?a=roster')
  await screen.findByRole('heading', { name: 'Roster and lists' })
  expect(screen.getByRole('button', { name: 'Save roster entry' })).toBeDisabled()
  await f.user.click(screen.getByRole('button', { name: 'Remove Woodland Alliance' }))
  await f.user.click(screen.getByRole('button', { name: 'Move Marquise de Cat down' }))
  await f.user.click(screen.getByRole('button', { name: 'Save roster entry' }))
  await screen.findByText('Roster entry saved.')
  expect(calls(f.rpc, 'fixit_update')).toEqual([{ p_table: 'roster', p_key: { season_id: 's', person_id: 'p0' }, p_changes: { ranked_factions: ['birds', 'cats', 'otters'] } }])
})

it('edits season dates and the settings, writing only the changed columns', async () => {
  const f = setup()
  renderApp('/admin/fixit?a=season')
  const name = await screen.findByLabelText('Season name')
  await f.user.clear(name)
  await f.user.type(name, 'Season One')
  await f.user.clear(screen.getByLabelText('Maps'))
  await f.user.type(screen.getByLabelText('Maps'), 'Lake, Mountain')
  await f.user.click(screen.getByRole('button', { name: 'Save season' }))
  await screen.findByText('Season saved.')
  expect(calls(f.rpc, 'fixit_update')).toEqual([{ p_table: 'seasons', p_key: { id: 's' }, p_changes: { name: 'Season One', maps: ['Lake', 'Mountain'] } }])
})

it('edits a submission, sets the result, reopens, voids and unvoids', async () => {
  const f = setup()
  renderApp('/admin/fixit?a=results')
  await screen.findByRole('heading', { name: /Table 1/ })
  const alex = screen.getByRole('group', { name: 'Alex’s answer' })
  await f.user.click(within(alex).getByRole('checkbox', { name: 'Blair' }))
  await f.user.click(screen.getByRole('button', { name: 'Save answer for Alex' }))
  await screen.findByText('Alex’s answer saved.')
  expect(calls(f.rpc, 'fixit_update')).toEqual([{ p_table: 'submissions', p_key: { game_id: 'g1', person_id: 'p0' }, p_changes: { winners: ['p0', 'p1'] } }])
  const casey = screen.getByRole('group', { name: 'Casey’s answer' })
  await f.user.click(within(casey).getByRole('checkbox', { name: 'Casey' }))
  await f.user.click(screen.getByRole('button', { name: 'Save answer for Casey' }))
  await screen.findByText('Casey’s answer saved.')
  expect(calls(f.rpc, 'fixit_insert')).toEqual([{ p_table: 'submissions', p_row: { game_id: 'g1', person_id: 'p2', winners: ['p2'] } }])
  await f.user.click(within(screen.getByRole('group', { name: 'Final winners' })).getByRole('checkbox', { name: 'Devon' }))
  await f.user.click(screen.getByRole('button', { name: 'Set final result' }))
  await screen.findByText('Result set.')
  expect(calls(f.rpc, 'settle_game')).toEqual([{ p_game_id: 'g1', p_winners: ['p3'] }])
  await f.user.click(await screen.findByRole('button', { name: 'Reopen settled game' }))
  await screen.findByText('Game reopened.')
  await f.user.click(screen.getByRole('button', { name: 'Void game' }))
  await screen.findByText('Table 1 is void.')
  await f.user.click(await screen.findByRole('button', { name: 'Unvoid game' }))
  await screen.findByText('Table 1 is no longer void.')
  expect(calls(f.rpc, 'void_game')).toEqual([{ p_game_id: 'g1', p_void: true }, { p_game_id: 'g1', p_void: false }])
})

it('deletes a pick after a confirmation', async () => {
  const f = setup()
  renderApp('/admin/fixit?a=picks')
  await f.user.click(await screen.findByRole('button', { name: 'Delete pick by Dev admin on Table 1' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete this pick?' })
  await f.user.click(within(dialog).getByRole('button', { name: 'Delete pick' }))
  await screen.findByText('Pick deleted.')
  expect(calls(f.rpc, 'fixit_delete')).toEqual([{ p_table: 'picks', p_key: { game_id: 'g1', person_id: 'p-admin' } }])
  await screen.findByText('No picks yet.')
})

it('lists the log with who, when, old and new on a phone, and shows no horizontal table', async () => {
  setup()
  renderApp('/admin/fixit', 375)
  const log = await screen.findByRole('region', { name: 'Edit log' })
  const row = within(log).getByText('Settlements: Table 1 added').closest('li')!
  expect(within(row).getByText('Dev admin')).toBeInTheDocument()
  expect(within(row).getByText('none')).toBeInTheDocument()
  expect(within(row).getByText('winners: Alex')).toBeInTheDocument()
  expect(document.querySelector('table')).toBeNull()
})

it('shows the error from a refused write and keeps the page usable', async () => {
  const f = setup()
  const original = f.rpc.getMockImplementation()!
  f.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => name === 'fixit_update' ? { data: null, error: { message: 'A faction cannot be empty.' } } : original(name, args))
  renderApp('/admin/fixit?a=games')
  await screen.findByRole('heading', { name: 'Table 1, Autumn' })
  await f.user.selectOptions(screen.getByLabelText('Faction, seat 2'), 'cats')
  await f.user.click(screen.getByRole('button', { name: 'Save seats' }))
  await screen.findByText('A faction cannot be empty.')
  expect(screen.getByRole('button', { name: 'Save seats' })).toBeEnabled()
})

it('sends a player home and reads no Fix it data', async () => {
  const f = setup(viewerJson())
  renderApp('/admin/fixit')
  await screen.findByRole('heading', { name: 'Home' })
  await waitFor(() => expect(f.queried).not.toContain('edit_log'))
  expect(calls(f.rpc, 'fixit_update')).toEqual([])
})
