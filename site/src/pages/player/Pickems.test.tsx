import '@testing-library/jest-dom/vitest'
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeFakeDb, viewerJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'
import { nextPicks, pickableGames } from './Pickems'

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

const NAMES = ['Alex', 'Blair', 'Casey', 'Devon']
const FACTIONS = ['cats', 'birds', 'otters', 'WA']
// g1: your own game. g2 and g3: open. g4: recorded and picked. g5: recorded, no pick. g6: disputed. g7: void.
const STATES: Record<string, string> = { g1: 'upcoming', g2: 'upcoming', g3: 'upcoming', g4: 'recorded', g5: 'recorded', g6: 'disputed', g7: 'void' }

function setup() {
  const auth = makeFakeDb({ whoami: viewerJson({ roles: ['viewer', 'league_player'] }) })
  const ids = Object.keys(STATES)
  const rows: Record<string, unknown[] | unknown> = {
    seasons: { id: 's', maps: ['Autumn'], name: 'Season' }, season_stage: { stage: 'live' },
    games: ids.map((id, i) => ({ id, game_no: i + 1, season_id: 's', map_index: 0, void: id === 'g7',
      game_seats: FACTIONS.map((faction, j) => ({ seat: j + 1, faction, person_id: id === 'g1' && j === 0 ? 'p-alex' : `${id}-p${j}`, people: { display_name: id === 'g1' && j === 0 ? 'Alex' : NAMES[j] } })) })),
    game_outcome: ids.map(id => ({ game_id: id, state: STATES[id], winners: id === 'g4' || id === 'g5' ? [`${id}-p1`] : null })),
    picks: [{ game_id: 'g4', person_id: 'p-alex', first_pick: 'g4-p1', second_pick: 'g4-p2', people: { display_name: 'Alex' } }],
    pickem_scores: [{ game_id: 'g4', person_id: 'p-alex', points: 3, first_points: 3, second_points: 0 }],
    leaderboard: [{ person_id: 'other', rank: 1, display_name: 'Blair', points: 7 }, { person_id: 'p-alex', rank: 2, display_name: 'Alex', points: 3 }, { person_id: 'third', rank: 2, display_name: 'Casey', points: 3 }],
    edit_log: [], roster_public: [],
  }
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = { then: (resolve: (r: unknown) => void) => Promise.resolve({ data: rows[table], error: null }).then(resolve) }
    for (const method of ['select', 'eq', 'order', 'maybeSingle', 'single', 'or', 'in']) chain[method] = vi.fn(() => chain)
    return chain
  })
  auth.rpc.mockImplementation(async (name: string, args?: { p_game_id: string; p_first: string; p_second: string | null }) => {
    if (name === 'save_pick' && args) {
      const picks = (rows.picks as { game_id: string }[]).filter(p => p.game_id !== args.p_game_id)
      rows.picks = [...picks, { game_id: args.p_game_id, person_id: 'p-alex', first_pick: args.p_first, second_pick: args.p_second, people: { display_name: 'Alex' } }]
    }
    return { data: name === 'whoami' ? auth.state.whoami : {}, error: null }
  })
  h.db = { ...auth.db, from }
  return { ...auth, from, rows }
}

describe('nextPicks', () => {
  it.each([
    ['no picks yet: the tap is the first pick', null, null, 'a', { first: 'a', second: null }],
    ['a first pick exists: the tap is the second', 'a', null, 'b', { first: 'a', second: 'b' }],
    ['both exist: the tap replaces the second', 'a', 'b', 'c', { first: 'a', second: 'c' }],
    ['the second pick is tapped: it is removed', 'a', 'b', 'b', { first: 'a', second: null }],
    ['the first pick is tapped with a second: the second moves up', 'a', 'b', 'a', { first: 'b', second: null }],
    ['the lone first pick is tapped: nothing changes, a pick always has a first', 'a', null, 'a', { first: 'a', second: null }],
  ] as const)('%s', (_name, first, second, tapped, expected) => {
    expect(nextPicks(first, second, tapped)).toEqual(expected)
  })
  it('leaves your own games out, with open games first', () => {
    const game = (id: string, state: string, own = false) => ({ id, state, seats: [{ person_id: own ? 'me' : 'x' }] }) as never
    expect(pickableGames([game('a', 'recorded'), game('b', 'upcoming', true), game('c', 'upcoming')], 'me').map(g => (g as unknown as { id: string }).id)).toEqual(['c', 'a'])
  })
})

it('lists open games first with All first in the filter, and never offers your own game', async () => {
  setup()
  renderApp('/pickems', 375)
  const group = await screen.findByRole('group', { name: 'Filter pick’ems' })
  expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['All 6', 'Open 2', 'Done 4'])
  expect(screen.getByRole('button', { name: 'Open 2' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual(['Table 2', 'Table 3'])
  await userEvent.click(screen.getByRole('button', { name: 'All 6' }))
  expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual(['Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6', 'Table 7'])
  expect(screen.queryByRole('article', { name: 'Table 1' })).not.toBeInTheDocument()
})

it('shows your score and rank at the top and links to the leaderboard page', async () => {
  setup()
  const { router } = renderApp('/pickems')
  const card = (await screen.findByText('Score')).closest('.scorecard') as HTMLElement
  await waitFor(() => expect(card).toHaveTextContent('Rank2 of 3'))
  expect(card).toHaveTextContent('Score3 points')
  await userEvent.click(within(card).getByRole('link', { name: /Leaderboard/ }))
  expect(router.state.location.pathname).toBe('/pickems/leaderboard')
  const table = await screen.findByRole('table', { name: 'Pick’em leaderboard' })
  expect(within(table).getAllByRole('row').slice(1).map(r => r.textContent)).toEqual(['1Blair7', '2Alex You3', '2Casey3'])
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

it('saves each tap with no Save button: first pick, second pick, then drops the second', async () => {
  const f = setup()
  renderApp('/pickems', 375)
  const table = await screen.findByRole('article', { name: 'Table 2' })
  expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
  await userEvent.click(within(table).getByRole('button', { name: /Blair/ }))
  await waitFor(() => expect(f.rpc).toHaveBeenCalledWith('save_pick', { p_game_id: 'g2', p_first: 'g2-p1', p_second: null }))
  await waitFor(() => expect(within(table).getByRole('button', { name: /Blair/ })).toHaveAttribute('aria-pressed', 'true'))
  expect(within(table).getByText('1st pick')).toBeInTheDocument()
  await userEvent.click(within(table).getByRole('button', { name: /Devon/ }))
  await waitFor(() => expect(f.rpc).toHaveBeenCalledWith('save_pick', { p_game_id: 'g2', p_first: 'g2-p1', p_second: 'g2-p3' }))
  await within(table).findByText('2nd pick')
  await userEvent.click(within(table).getByRole('button', { name: /Devon/ }))
  await waitFor(() => expect(f.rpc).toHaveBeenLastCalledWith('save_pick', { p_game_id: 'g2', p_first: 'g2-p1', p_second: null }))
})

it('does nothing when the only pick is tapped, since a pick needs a first', async () => {
  const f = setup()
  renderApp('/pickems', 375)
  const table = await screen.findByRole('article', { name: 'Table 2' })
  await userEvent.click(within(table).getByRole('button', { name: /Blair/ }))
  await within(table).findByText('1st pick')
  f.rpc.mockClear()
  await userEvent.click(within(table).getByRole('button', { name: /Blair/ }))
  expect(f.rpc.mock.calls.filter(([name]) => name === 'save_pick')).toEqual([])
})

it('puts the old picks back and says so when a save is refused', async () => {
  const f = setup()
  renderApp('/pickems', 375)
  const table = await screen.findByRole('article', { name: 'Table 2' })
  f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Picks are closed for this game.' } })
  await userEvent.click(within(table).getByRole('button', { name: /Blair/ }))
  expect(await screen.findByText('Could not save that pick: Picks are closed for this game.')).toBeInTheDocument()
  await waitFor(() => expect(within(table).getByRole('button', { name: /Blair/ })).toHaveAttribute('aria-pressed', 'false'))
})

it('shows a done game with your picks beside the crowned winner and your points, and the result alone where you did not pick', async () => {
  setup()
  renderApp('/pickems', 375)
  await userEvent.click(await screen.findByRole('button', { name: 'Done 4' }))
  const picked = screen.getByRole('article', { name: 'Table 4' })
  expect(within(picked).queryByRole('button')).not.toBeInTheDocument()
  expect(within(picked).getByText('1st pick')).toBeInTheDocument()
  expect(within(picked).getByText('2nd pick')).toBeInTheDocument()
  expect(within(picked).getByText('Winner')).toBeInTheDocument()
  expect(within(picked).getByText('+3')).toBeInTheDocument()
  expect(picked).toHaveTextContent('You scored 3 points: Blair won.')
  const plain = screen.getByRole('article', { name: 'Table 5' })
  expect(within(plain).getByText('Winner')).toBeInTheDocument()
  expect(within(plain).queryByText(/pick$/)).not.toBeInTheDocument()
  expect(plain).toHaveTextContent('You made no pick on this game.')
  expect(screen.getByRole('article', { name: 'Table 6' })).toHaveTextContent('Scoring paused until the admin settles the game.')
  expect(screen.getByRole('article', { name: 'Table 7' })).toHaveTextContent('Void games score nothing.')
})

it('shows the faction on the badge and never writes the faction name', async () => {
  setup()
  renderApp('/pickems', 375)
  const table = await screen.findByRole('article', { name: 'Table 2' })
  expect(within(table).getAllByRole('img').map(i => i.getAttribute('aria-label'))).toEqual(['Marquise de Cat', 'Eyrie Dynasties', 'Riverfolk Company', 'Woodland Alliance'])
  expect(table).not.toHaveTextContent('Marquise de Cat')
})

describe('Home quick view', () => {
  it('links to Pick’ems while there are open games left to pick, and says how many', async () => {
    setup()
    renderApp('/', 375)
    const link = await screen.findByRole('link', { name: /2 open games to pick/ })
    expect(link).toHaveAttribute('href', '/pickems')
    expect(link).toHaveTextContent('Score3 points')
    expect(link).toHaveTextContent('Rank2 of 3')
  })
  it('links to the leaderboard once every open game is picked', async () => {
    const f = setup()
    const pick = (id: string) => ({ game_id: id, person_id: 'p-alex', first_pick: `${id}-p1`, second_pick: null, people: { display_name: 'Alex' } })
    f.rows.picks = [...(f.rows.picks as unknown[]), pick('g2'), pick('g3')]
    renderApp('/', 375)
    const link = await screen.findByRole('link', { name: /All open games picked/ })
    expect(link).toHaveAttribute('href', '/pickems/leaderboard')
  })
})
