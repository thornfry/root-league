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
    picks: [], pickem_scores: [], leaderboard: [], game_outcome: [outcome], submissions: own ? { winners: own } : null, edit_log: [], roster_public: [],
  }
  const filters: unknown[][] = []
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = { then: (resolve: (r: unknown) => void) => Promise.resolve({ data: rows[table], error: null }).then(resolve) }
    for (const method of ['select', 'eq', 'order', 'maybeSingle', 'single', 'or', 'in']) chain[method] = vi.fn((...args: unknown[]) => { if (table === 'picks') filters.push([method, ...args]); return chain })
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
  return { ...auth, from, filters, rows }
}

it('omits the pick control on own games', async () => {
  const f = setup()
  renderApp('/game/1')
  await screen.findByRole('checkbox', { name: 'Alex' })
  expect(screen.queryByLabelText('First pick')).not.toBeInTheDocument()
  expect(f.from.mock.calls.filter(([t]) => t === 'picks')).toHaveLength(0)
})
it('saves distinct picks and reads only own picks even for an admin', async () => {
  const f = setup('upcoming', adminJson())
  renderApp('/game/1')
  await userEvent.selectOptions(await screen.findByLabelText('First pick'), 'p1')
  expect(within(screen.getByLabelText('Second pick (optional)')).queryByRole('option', { name: 'Blair' })).not.toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Second pick (optional)'), 'p2')
  await userEvent.click(screen.getByRole('button', { name: 'Save picks' }))
  expect(f.filters).toContainEqual(['eq', 'person_id', 'p-admin'])
  expect(f.rpc).toHaveBeenCalledWith('save_pick', { p_game_id: 'g', p_first: 'p1', p_second: 'p2' })
})
it('reveals picks and pauses disputed scoring', async () => {
  const f = setup('disputed', viewerJson({ person_id: 'other' }))
  f.rows.picks = [{ game_id: 'g', person_id: 'spectator', first_pick: 'p1', second_pick: 'p2', people: { display_name: 'Spectator' } }]
  renderApp('/game/1')
  expect(await screen.findByText('Scoring paused until the admin settles the game.')).toBeInTheDocument()
  expect(screen.getByText('Spectator')).toBeInTheDocument()
  expect(screen.queryByLabelText('First pick')).not.toBeInTheDocument()
})
it('shows my picks, eligible open games and database tie ranks', async () => {
  const f = setup('upcoming', viewerJson({ person_id: 'other' }))
  f.rows.leaderboard = [{ person_id: 'other', rank: 1, display_name: 'Alex', points: 4 }, { person_id: 'second', rank: 1, display_name: 'Blair', points: 4 }]
  renderApp('/pickems')
  expect(await screen.findByText('Your score: 4 points')).toBeInTheDocument()
  expect(screen.getAllByText('Rank 1')).toHaveLength(2)
  expect(screen.getByRole('link', { name: 'Table 1, Autumn' })).toBeInTheDocument()
})

it('Home quick view shows the same score and rank as the leaderboard', async () => {
  const f = setup('upcoming', viewerJson({ person_id: 'other' }))
  f.rows.standings = []
  f.rows.leaderboard = [{ person_id: 'other', rank: 1, display_name: 'Alex', points: 4 }, { person_id: 'second', rank: 1, display_name: 'Blair', points: 4 }]
  renderApp('/')
  const home = await screen.findByRole('region', { name: "Pick'ems" })
  await within(home).findByText('4')
  expect(home).toHaveTextContent('Score4points')
  expect(home).toHaveTextContent('Rank1of 2')
  expect(home).not.toHaveTextContent('Blair')
})

it('keeps picks available for correction after a failed save', async () => {
  const f = setup('upcoming', viewerJson({ person_id: 'other' }))
  renderApp('/game/1')
  await userEvent.selectOptions(await screen.findByLabelText('First pick'), 'p1')
  f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Picks are closed for this game.' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save picks' }))
  expect(await screen.findByText('Could not save picks: Picks are closed for this game.')).toBeInTheDocument()
  expect(screen.getByLabelText('First pick')).toHaveValue('p1')
})
