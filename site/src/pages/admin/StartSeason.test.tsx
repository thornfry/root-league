import '@testing-library/jest-dom/vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeFakeDb, adminJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'
import { FACTIONS } from '../../data/factions'
import { buildDraft } from '../../pairing/draft'
import { startChecks, type StartData } from '../../db/start'
const h = vi.hoisted(() => ({ db: null as unknown, cancel: vi.fn(), pending: false }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))
vi.mock('../../pairing/client', () => ({ startDraft: (request: Parameters<typeof buildDraft>[0]) => ({ result: h.pending ? new Promise(() => {}) : Promise.resolve(buildDraft(request, { iterations: 0 })), cancel: h.cancel }) }))
const pool = FACTIONS.map(f => f.code)
function data(): StartData {
  return { season: { id: 's', capacity: 8, games_each: 2, maps: ['Autumn', 'Winter'], faction_pool: pool, min_list_length: 2, seed: 'test' }, stage: 'locked', roster: Array.from({ length: 8 }, (_, i) => ({ person_id: `p${i}`, display_name: `Player ${i}`, list: 'league', list_in: true, list_flagged: false, ranked_factions: pool })) } as StartData
}
function setup(d = data()) {
  const fake = makeFakeDb({ whoami: adminJson() })
  const from = vi.fn((table: string) => {
    const answer = { data: table === 'seasons' ? d.season : table === 'season_stage' ? { stage: d.stage } : d.roster, error: null }
    const chain = { select: () => chain, eq: () => chain, order: async () => answer, single: async () => answer, maybeSingle: async () => answer }
    return chain
  })
  const rpc = vi.fn(async (name: string) => name === 'publish_pairings' ? { error: null, data: null } : fake.rpc(name))
  h.db = { ...fake.db, from, rpc }; renderApp('/admin/start')
  return { user: userEvent.setup(), rpc }
}
beforeEach(() => { h.pending = false; h.cancel.mockClear() })
it('offers Lock lists now only while lists are open', async () => {
  const d = data(); d.stage = 'open'
  const { user, rpc } = setup(d)
  await user.click(await screen.findByRole('button', { name: 'Lock lists now' }))
  await user.click(screen.getByRole('button', { name: 'Lock lists' }))
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('season_lock_lists', { p_season_id: 's' }))
})

it('names missing preconditions and blocks assignment', async () => {
  const d = data(); d.stage = 'open'; d.roster.pop(); d.roster[0]!.list_in = false
  setup(d)
  expect(await screen.findByRole('button', { name: 'Assign factions' }, { timeout: 10000 })).toBeDisabled()
  expect(screen.getByText(/Lists need attention: Player 0/)).toBeInTheDocument()
  expect(screen.getByText(/not marked Ready/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Edit Player 0’s factions' })).toHaveAttribute('href', '/my-list?player=p0')
  expect(startChecks(d).filter(c => !c.ok)).toHaveLength(3)
})
it('cancels and allows another run', async () => {
  h.pending = true
  const { user } = setup()
  await user.click(await screen.findByRole('button', { name: 'Assign factions' }, { timeout: 10000 }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(h.cancel).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Assign factions' })).toBeEnabled()
})
it('reports repeatable drafts and publishes number order', async () => {
  const { user, rpc } = setup()
  await user.click(await screen.findByRole('button', { name: 'Assign factions' }, { timeout: 10000 }))
  await screen.findByText('All hard rules met.')
  const first = screen.getByText(/^P1:/).textContent
  await user.click(screen.getByRole('button', { name: 'Run again with this seed' }))
  await screen.findByText('All hard rules met.')
  expect(screen.getByText(/^P1:/).textContent).toBe(first)
  await user.click(screen.getByRole('button', { name: 'Publish pairings' }))
  await screen.findByText(/The season has started/)
  expect(rpc).toHaveBeenCalledWith('publish_pairings', expect.objectContaining({ p_seed: 'test', p_order: expect.arrayContaining(['p0', 'p7']), p_games: expect.any(Array) }))
})
it('rejects shrunk lists naming the player', () => {
  const d = data(); d.roster[0]!.ranked_factions = ['cats']
  expect(startChecks(d).at(-1)).toMatchObject({ ok: false, text: 'Lists need attention: Player 0.', problems: [{ name: 'Player 0', reason: '1 of at least 2 factions picked.' }] })
})
it('names blocking players and tables without offering publication', async () => {
  const d = data(); d.roster.forEach(r => { r.ranked_factions = ['cats', 'birds'] })
  const { user } = setup(d)
  await user.click(await screen.findByRole('button', { name: 'Assign factions' }, { timeout: 10000 }))
  await screen.findByText(/Faction step could not meet the hard rules/)
  expect(screen.getByText(/^Players:/)).toHaveTextContent('Player')
  expect(screen.getByText(/^Tables:/)).toHaveTextContent(/\d/)
  expect(screen.queryByRole('button', { name: 'Publish pairings' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Edit a list on Fix it' })).toHaveAttribute('href', '/admin/fixit')
})
