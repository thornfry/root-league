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
      : table === 'picks' || table === 'pickem_scores' ? []
      : table === 'leaderboard' ? [{ person_id: 'p-alex', display_name: 'Alex', points: 7, rank: 2 }, { person_id: 'p-sam', display_name: 'Sam', points: 9, rank: 1 }]
      : table === 'standings' ? [{ person_id: person, display_name: 'Alex', rank: 1, wins: 2, games_played: 3, games_left: 1 }]
      : table === 'game_outcome' ? [{ game_id: 'g1', state: 'upcoming', winners: null }, { game_id: 'g2', state: 'disputed', winners: ['other'] }]
      : [1, 2, 3].map(n => ({ id: `g${n}`, game_no: n, map_index: 0, game_seats: [{ person_id: n === 3 ? 'unrelated' : person, seat: 1, faction: 'cats', people: { display_name: 'Alex' } }] })),
      error: failure && table === 'leaderboard' ? { message: 'Offline' } : null })
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q, single: async () => result(), maybeSingle: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) }
    return q
  })
  h.db = Object.assign(fake.db, { from })
  return calls
}

it.each([375, 1280])('shows My games, with a report button on each, and the pick\'em score and rank at %i', async width => {
  const calls = setup()
  renderApp('/', width)
  const games = await screen.findByRole('region', { name: 'My games' })
  expect(within(games).getAllByRole('article')).toHaveLength(2)
  expect(within(games).getByRole('link', { name: 'Report result' })).toHaveAttribute('href', '/game/1/result')
  expect(within(games).getByRole('link', { name: 'Edit result' })).toHaveAttribute('href', '/game/2/result')
  expect(games).toHaveTextContent('Disputed')
  expect(games).not.toHaveTextContent('Won by')
  const pickems = await screen.findByRole('region', { name: "Pick'ems" })
  // One open game (table 3) has no pick, so the arrow goes to Pick'ems.
  const card = await within(pickems).findByRole('link')
  expect(card).toHaveTextContent('Score7 points')
  expect(card).toHaveTextContent('Rank2 of 2')
  expect(card).toHaveTextContent('1 open game to pick')
  expect(card).toHaveAttribute('href', '/pickems')
  expect(calls.filter(t => ['submissions', 'settlements'].includes(t))).toEqual([])
})

it('keeps standings and faction lists off Home, with one pick\'em link on the score card', async () => {
  setup()
  renderApp('/')
  await screen.findByRole('region', { name: 'My games' })
  await screen.findByRole('link', { name: /open game to pick/ })
  expect(screen.queryByRole('table', { name: 'Season standings' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Standings' })).not.toBeInTheDocument()
  const main = screen.getByRole('main')
  expect(within(main).getAllByRole('link').filter(a => /pickems/.test(a.getAttribute('href') ?? ''))).toHaveLength(1)
  expect(screen.queryByRole('region', { name: 'Your games' })).not.toBeInTheDocument()
})

it('hides My factions from the menu once the season is live', async () => {
  setup()
  renderApp('/')
  await screen.findByRole('region', { name: 'My games' })
  expect(screen.queryByRole('link', { name: 'My factions' })).not.toBeInTheDocument()
})

it('reports a failed pick\'em read without showing a zero score', async () => {
  setup(true, true)
  renderApp('/')
  expect(await screen.findByText(/Could not load your pick.ems: Offline/)).toBeInTheDocument()
  expect(screen.queryByText('Score')).not.toBeInTheDocument()
})
