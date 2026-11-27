import '@testing-library/jest-dom/vitest'
import { configure, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeFakeDb, adminJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))
function setup(state = 'disputed', persona = adminJson(), own: string[] | null = null) {
  const auth = makeFakeDb({ whoami: persona })
  const outcome = { game_id: 'g', state, winners: state === 'disputed' ? null : own }
  const rows: Record<string, unknown> = {
    seasons: { id: 's', maps: ['Autumn'], name: 'Season' }, season_stage: { stage: 'live' },
    games: [{ id: 'g', game_no: 1, season_id: 's', map_index: 0, void: state === 'void', game_seats: ['cats', 'birds', 'otters', 'WA'].map((faction, i) => ({ seat: i + 1, faction, person_id: i ? `p${i}` : 'p-alex', people: { display_name: ['Alex', 'Blair', 'Casey', 'Devon'][i] } })) }],
    game_outcome: [outcome], submissions: [{person_id: 'p-alex', winners: ['p-alex']}, {person_id: 'p1', winners: ['p1']}], edit_log: [], roster_public: [],
  }
  const filters: unknown[][] = []
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = { then: (resolve: (r: unknown) => void) => Promise.resolve({ data: rows[table], error: null }).then(resolve) }
    for (const method of ['select', 'eq', 'order', 'maybeSingle', 'single', 'or', 'in']) chain[method] = vi.fn((...args: unknown[]) => { if (table === 'submissions') filters.push([method, ...args]); return chain })
    return chain
  })
  auth.rpc.mockImplementation(async (name: string, ...args: unknown[]) => {
    if (name === 'whoami') return { data: persona, error: null }
    if (name === 'settle_game') { outcome.state = 'settled'; outcome.winners = (args[0] as { p_winners: string[] }).p_winners }
    if (name === 'reopen_game') { outcome.state = 'disputed'; outcome.winners = null }
    return { data: {}, error: null }
  })
  h.db = { ...auth.db, from }
  return { ...auth, from, filters }
}
it('shows both answers, settles a custom result, clears the banner and reopens', async () => {
  const f = setup()
  const { router } = renderApp('/admin')
  await screen.findByText('1 game is disputed.')
  await router.navigate('/admin/disputes')
  await screen.findByText('Says: Alex won')
  expect(screen.getByText('Says: Blair won')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: 'Enter a different result' }))
  expect(screen.getByRole('button', { name: 'Settle game' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Alex' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Blair' }))
  await userEvent.click(screen.getByRole('button', { name: 'Settle game' }))
  await screen.findByRole('button', { name: 'Reopen' })
  expect(f.rpc).toHaveBeenCalledWith('settle_game', { p_game_id: 'g', p_winners: ['p-alex', 'p1'] })
  await router.navigate('/admin')
  await screen.findByText('No games are disputed.')
  await router.navigate('/admin/disputes')
  await userEvent.click(await screen.findByRole('button', { name: 'Reopen' }))
  await screen.findByText('Says: Blair won')
  expect(f.rpc).toHaveBeenCalledWith('reopen_game', { p_game_id: 'g' })
})
it.each(['open', 'locked'])('shows the %s dashboard', async stage => {
  const f = setup()
  const original = f.from.getMockImplementation()!
  f.from.mockImplementation((table: string) => table === 'season_stage' ? { select: () => ({ eq: () => ({ single: async () => ({ data: { stage }, error: null }) }) }) } as ReturnType<typeof original> : original(table))
  renderApp('/admin')
  await screen.findByRole('heading', { name: stage === 'open' ? 'Lists open' : 'Lists locked, season not started' })
})
