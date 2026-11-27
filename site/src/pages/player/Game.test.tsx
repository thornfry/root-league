import '@testing-library/jest-dom/vitest'
import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeFakeDb, viewerJson, adminJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))
function setup(state = 'upcoming', persona = viewerJson({ roles: ['viewer', 'league_player'] }), own: string[] | null = null) {
  const auth = makeFakeDb({ whoami: persona })
  const outcome = { game_id: 'g', state, winners: state === 'disputed' ? null : own }
  const rows: Record<string, unknown> = {
    seasons: { id: 's', maps: ['Autumn'], name: 'Season' }, season_stage: { stage: 'live' },
    games: [{ id: 'g', game_no: 1, season_id: 's', map_index: 0, void: state === 'void', game_seats: ['cats', 'birds', 'otters', 'WA'].map((faction, i) => ({ seat: i + 1, faction, person_id: i ? `p${i}` : 'p-alex', people: { display_name: ['Alex', 'Blair', 'Casey', 'Devon'][i] } })) }],
    game_outcome: [outcome], submissions: own ? { winners: own } : null, edit_log: [], roster_public: [],
  }
  const filters: unknown[][] = []
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = { then: (resolve: (r: unknown) => void) => Promise.resolve({ data: rows[table], error: null }).then(resolve) }
    for (const method of ['select', 'eq', 'order', 'maybeSingle', 'single', 'or', 'in']) chain[method] = vi.fn((...args: unknown[]) => { if (table === 'submissions') filters.push([method, ...args]); return chain })
    return chain
  })
  auth.rpc.mockImplementation(async (name: string, ...args: unknown[]) => {
    if (name === 'whoami') return { data: persona, error: null }
    if (name === 'submit_result') {
      const w = (args[0] as { p_winners: string[] }).p_winners
      rows.submissions = { winners: w }; outcome.state = 'recorded'; outcome.winners = w
      return { data: {}, error: null }
    }
    return { data: {}, error: null }
  })
  h.db = { ...auth.db, from }
  return { ...auth, from, filters }
}
it('submits one winner, then edits to two winners using only the owner’s answer', async () => {
  const f = setup()
  renderApp('/game/1')
  await screen.findByRole('checkbox', { name: 'Alex' })
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Alex' }))
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Edit result' }))
  expect(screen.getByRole('checkbox', { name: 'Alex' })).toBeChecked()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Blair' }))
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByRole('button', { name: 'Edit result' })
  expect(f.rpc).toHaveBeenCalledWith('submit_result', { p_game_id: 'g', p_winners: ['p-alex', 'p1'] })
  expect(f.filters).toContainEqual(['eq', 'person_id', 'p-alex'])
  expect(f.filters).toContainEqual(['select', 'winners'])
})
it.each([viewerJson({ person_id: 'other', roles: ['league_player'] }), viewerJson({ person_id: 'other', roles: ['prospect'] })])('has no controls or submission reads for non-seated people', async persona => {
  const f = setup('recorded', persona, ['p1'])
  renderApp('/game/1')
  await screen.findByText('Won by Blair')
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(f.from.mock.calls.filter(([t]) => t === 'submissions')).toHaveLength(0)
})
it('hides every disputed answer and lets the owner edit', async () => {
  setup('disputed', undefined, ['p1'])
  renderApp('/game/1')
  await screen.findByRole('button', { name: 'Edit result' })
  const result = screen.getByRole('region', { name: 'Result' })
  expect(result).toHaveTextContent('The admin will decide.')
  expect(result).not.toHaveTextContent('Blair')
  expect(screen.queryByText(/Won by/)).not.toBeInTheDocument()
  expect(within(result).queryByText(/confirm/i)).not.toBeInTheDocument()
})
it.each(['settled', 'void'])('prevents editing a %s game', async state => {
  const f = setup(state, undefined, ['p1'])
  renderApp('/game/1')
  await screen.findByRole('heading', { name: 'Table 1 Autumn' })
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit result' })).not.toBeInTheDocument()
  expect(f.from.mock.calls.filter(([t]) => t === 'submissions')).toHaveLength(0)
})
it('explains that an unseated admin entry settles the game', async () => {
  const f = setup('upcoming', adminJson())
  renderApp('/game/1')
  await screen.findByRole('checkbox', { name: 'Alex' })
  expect(screen.getByText(/admin’s entry settles/)).toBeInTheDocument()
  expect(f.from.mock.calls.filter(([t]) => t === 'submissions')).toHaveLength(0)
})
it('keeps selected winners after a refused submission', async () => {
  const f = setup()
  renderApp('/game/1')
  await screen.findByRole('checkbox', { name: 'Alex' })
  await userEvent.click(screen.getByRole('checkbox', { name: 'Alex' }))
  f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'This game is settled. Ask the admin to reopen it.' } })
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText(/Could not submit result: This game is settled/)).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Alex' })).toBeChecked()
})
