import '@testing-library/jest-dom/vitest'
import { configure, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { adminJson, makeFakeDb } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'

configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

function setup(picks: { game_id: string }[]) {
  const auth = makeFakeDb({ whoami: adminJson() })
  const seats = (id: string) => ['cats', 'birds', 'otters', 'WA'].map((faction, i) => ({ game_id: id, seat: i + 1, faction, person_id: `p${i}`, people: { display_name: `P${i}` } }))
  const rows: Record<string, unknown> = {
    seasons: { id: 's', maps: ['Autumn'], name: 'Season' }, season_stage: { stage: 'live' },
    games: [1, 2, 3, 4].map((n) => ({ id: `g${n}`, game_no: n, season_id: 's', map_index: 0, void: n === 3, game_seats: seats(`g${n}`) })),
    game_outcome: [{ game_id: 'g1', state: 'upcoming', winners: null }, { game_id: 'g2', state: 'disputed', winners: null }, { game_id: 'g4', state: 'settled', winners: ['p0'] }],
    picks, roster_public: [],
  }
  const queries: unknown[][] = []
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = { then: (resolve: (r: unknown) => void) => Promise.resolve({ data: rows[table], error: null }).then(resolve) }
    for (const m of ['select', 'eq', 'order', 'maybeSingle', 'single', 'in']) chain[m] = vi.fn((...args: unknown[]) => { if (table === 'picks') queries.push([m, ...args]); return chain })
    return chain
  })
  h.db = { ...auth.db, from }
  return queries
}

it('counts picks on disputed and void games, and not picks on other games', async () => {
  setup([{ game_id: 'g1' }, { game_id: 'g2' }, { game_id: 'g2' }, { game_id: 'g3' }, { game_id: 'g4' }])
  renderApp('/admin')
  expect(await screen.findByText(/3 picks to review/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Fix it' })).toHaveAttribute('href', '/admin/fixit?a=picks')
})

it('says no picks to review when there are none, with no link', async () => {
  setup([{ game_id: 'g1' }])
  renderApp('/admin')
  expect(await screen.findByText('0 picks to review')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Open Fix it' })).not.toBeInTheDocument()
})
