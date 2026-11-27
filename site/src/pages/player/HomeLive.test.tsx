import '@testing-library/jest-dom/vitest'
import { configure, screen, within } from '@testing-library/react'
import { makeFakeDb } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'

configure({ asyncUtilTimeout: 5000 })

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

function setup(player = true, failure = false) {
  const fake = makeFakeDb()
  const calls: string[] = []
  const person = player ? 'p-alex' : 'other'
  const from = vi.fn((table: string) => {
    calls.push(table)
    const result = () => ({ data: table === 'seasons' ? { id: 's1', name: 'Season', maps: ['Autumn'] }
      : table === 'season_stage' ? { stage: 'live' }
      : table === 'roster_public' ? null
      : table === 'leaderboard' ? []
      : table === 'standings' ? [{ person_id: person, display_name: 'Alex', rank: 1, wins: 2, games_played: 3, games_left: 1 }]
      : table === 'game_outcome' ? [{ game_id: 'g1', state: 'upcoming', winners: null }, { game_id: 'g2', state: 'disputed', winners: ['other'] }]
      : [1, 2, 3].map(n => ({ id: `g${n}`, game_no: n, map_index: 0, game_seats: [{ person_id: n === 3 ? 'unrelated' : person, seat: 1, faction: 'cats', people: { display_name: 'Alex' } }] })),
      error: failure && table === 'standings' ? { message: 'Offline' } : null })
    const q = { select: () => q, eq: () => q, order: () => q, single: async () => result(), maybeSingle: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) }
    return q
  })
  h.db = Object.assign(fake.db, { from })
  return calls
}

it.each([375, 1280])('renders database standings and only seated tables at %i', async width => {
  const calls = setup()
  renderApp('/', width)
  const table = await screen.findByRole('table', { name: 'Season standings' })
  expect(within(table).getByRole('row', { name: '1 Alex (you) 2 3 1' })).toBeInTheDocument()
  const games = await screen.findByRole('region', { name: 'Your games' })
  expect(within(games).getAllByRole('article')).toHaveLength(2)
  expect(within(games).getByRole('link', { name: 'Enter result' })).toHaveAttribute('href', '/game/1')
  expect(games).toHaveTextContent('Disputed')
  expect(games).not.toHaveTextContent('Won by')
  expect(calls.filter(t => ['submissions', 'settlements', 'picks'].includes(t))).toEqual([])
})

it('shows standings to a spectator without a Your games section', async () => {
  setup(false)
  renderApp('/')
  await screen.findByRole('table', { name: 'Season standings' })
  expect(screen.queryByRole('region', { name: 'Your games' })).not.toBeInTheDocument()
  expect(screen.getByText('No picks yet.')).toBeInTheDocument()
})

it('reports a failed standings read without presenting an empty leaderboard', async () => {
  setup(true, true)
  renderApp('/')
  expect(await screen.findByText(/Could not load standings: Offline/)).toBeInTheDocument()
  expect(screen.queryByRole('table', { name: 'Season standings' })).not.toBeInTheDocument()
})
