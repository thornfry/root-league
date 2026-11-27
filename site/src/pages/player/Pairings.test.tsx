import '@testing-library/jest-dom/vitest'
import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeFakeDb, viewerJson, adminJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'
import { filterGames, fetchPairings, fetchGameHistory } from '../../db/games'
import type { Db } from '../../db/client'

// Parallel build agents can delay otherwise immediate query microtasks.
configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))
const codes = ['cats', 'birds', 'otters', 'WA']
const names = ['An unusually long player name that must wrap across lines on a phone', 'Blair', 'Casey', 'Devon']
function fixture(stage = 'live', persona = viewerJson()) {
  const auth = makeFakeDb({ whoami: persona })
  const season = { id: 'season', name: 'Test season', capacity: 8, games_each: 2, maps: ['Autumn', 'Winter'], lists_lock_at: '2026-12-01T20:00:00Z' }
  const states = ['upcoming', 'recorded', 'settled', 'disputed', 'void']
  const games = states.map((state, i) => ({ id: `g${i}`, game_no: i + 1, season_id: 'season', map_index: 0, void: state === 'void',
    game_seats: codes.map((faction, j) => ({ faction, game_id: `g${i}`, seat: j + 1, person_id: i === 0 && j === 0 ? 'p-alex' : `p${j}`, people: { display_name: names[j] } })) }))
  const outcomes = states.map((state, i) => ({ game_id: `g${i}`, state, winners: ['p0'] })) // disputed/void must discard even a bad payload
  const rows: Record<string, unknown> = { seasons: season, season_stage: { stage }, games, game_outcome: outcomes, edit_log: [], people: [] }
  const from = vi.fn((table: string) => {
    const result = { data: rows[table], error: null }
    const chain: Record<string, unknown> = { then: (resolve: (r: unknown) => void) => Promise.resolve(result).then(resolve) }
    for (const method of ['select', 'eq', 'order', 'maybeSingle', 'single', 'or', 'in']) chain[method] = vi.fn(() => chain)
    return chain
  })
  h.db = { ...auth.db, from }
  return { db: h.db as Db, from, rows }
}

it.each([viewerJson(), viewerJson({ roles: ['viewer', 'prospect'] }), adminJson()])('pre-start queries no identities for each persona', async persona => {
  const f = fixture('open', persona)
  renderApp('/pairings', 375)
  await screen.findAllByText('P1')
  const main = screen.getByRole('main')
  expect(main).toHaveTextContent('Lists lock')
  expect(main).toHaveTextContent(Intl.DateTimeFormat().resolvedOptions().timeZone) // local zone is explicitly named
  expect(main).not.toHaveTextContent(names[0]!)
  expect(main).not.toHaveTextContent('Marquise')
  // The shell reads only the viewer's membership. Pre-start pairings must
  // never request people, game seats, results, or anyone else's roster row.
  for (const [index, [table]] of f.from.mock.calls.entries()) {
    expect(['seasons', 'season_stage', 'roster_public']).toContain(table)
    if (table === 'roster_public') {
      const query = f.from.mock.results[index]!.value
      expect(query.select).toHaveBeenCalledWith('person_id, list_in, list_flagged, ranked_factions')
      expect(query.eq).toHaveBeenCalledWith('season_id', 'season')
      expect(query.eq).toHaveBeenCalledWith('is_me', true)
      expect(query.order).not.toHaveBeenCalled()
    }
  }
  expect(within(main).getAllByRole('article')).toHaveLength(4)
})
it('defaults to All, filters with exact counts, and retains disputed in Upcoming only', async () => {
  fixture()
  renderApp('/pairings')
  const all = await screen.findByRole('button', { name: 'All 5' })
  expect(all).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Upcoming 2' }))
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(table).toHaveTextContent('Disputed')
  expect(table).not.toHaveTextContent('Void')
  expect(table).not.toHaveTextContent('Won by')
  await userEvent.click(screen.getByRole('button', { name: 'Completed 2' }))
  expect(table).toHaveTextContent('Won by')
  await userEvent.click(screen.getByRole('button', { name: 'Mine 1' }))
  expect(within(table).getAllByRole('row')).toHaveLength(2)
})
it('hides Mine from a viewer with no seat and opens another player’s game', async () => {
  fixture('live', viewerJson({ person_id: 'spectator' }))
  renderApp('/game/2', 375)
  await screen.findByRole('heading', { name: 'Table 2 Autumn' })
  expect(screen.getByRole('main')).toHaveTextContent(names[0]!)
  expect(screen.getByRole('main')).toHaveTextContent('Reach 25')
  expect(screen.getByRole('main')).toHaveTextContent('Militant + Insurgent')
  expect(await screen.findByText('No history available to you.')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'All pairings' }))
  await screen.findByRole('button', { name: 'All 5' })
  expect(screen.queryByRole('button', { name: /Mine/ })).not.toBeInTheDocument()
})
it('never displays disputed or void winners', async () => {
  const f = fixture()
  const data = await fetchPairings(f.db)
  expect(data.games[3]?.winners).toEqual([])
  expect(data.games[4]?.winners).toEqual([])
  expect(filterGames(data.games, 'All', null)).toHaveLength(5)
})
it('shows a missing-game message for unpublished or unknown games', async () => {
  fixture('locked')
  renderApp('/game/999')
  expect(await screen.findByRole('heading', { name: 'No such game' })).toBeInTheDocument()
})
it('formats history with actors and event text, never raw answers', async () => {
  const f = fixture()
  f.rows.edit_log = [{ id: 1, at: '2026-11-26T00:00:00Z', actor_person_id: 'p1', action: 'UPDATE', table_name: 'submissions', new: { winners: ['SECRET'] } }]
  f.rows.people = [{ id: 'p1', display_name: 'Blair' }]
  const history = await fetchGameHistory(f.db, 'g1')
  expect(history[0]).toMatchObject({ actor: 'Blair', text: 'Result submission updated.' })
  expect(JSON.stringify(history)).not.toContain('SECRET')
})
