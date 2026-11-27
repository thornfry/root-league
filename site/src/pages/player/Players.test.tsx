import '@testing-library/jest-dom/vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { adminJson, makeFakeDb, viewerJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'

const fake = makeFakeDb()
vi.mock('../../db/client', () => ({ getSupabase: () => fake.db, isConfigured: () => true }))
let stage: string
let current: boolean
let failure: boolean
let rows: typeof initialRows
const initialRows = [
  { person_id: 'p-alex', display_name: 'Alex', is_me: true, list_in: true, ranked_factions: ['birds', 'cats'] as string[] | null },
  { person_id: 'p-other', display_name: 'Other player', is_me: false, list_in: false, ranked_factions: null as string[] | null },
]
const from = vi.fn((table: string) => {
  const result = () => ({
    data: table === 'seasons' ? (current ? { id: 'season-1' } : null) : table === 'season_stage' ? { stage } : rows,
    error: failure ? { message: 'Database unavailable' } : null,
  })
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => result()),
    single: vi.fn(async () => result()), order: vi.fn(async () => result()) }
  return query
})

beforeEach(() => {
  stage = 'open'
  current = true
  failure = false
  rows = structuredClone(initialRows)
  fake.state.whoami = viewerJson()
  Object.assign(fake.db, { from })
  from.mockClear()
})

it('shows only status for others before lock, with the owner list in rank order and no tags', async () => {
  renderApp('/players', 375)
  const list = await screen.findByRole('list', { name: "Alex's ranked factions" })
  expect(within(list).getAllByRole('listitem').map((row) => row.textContent)).toEqual(['1EDEyrie Dynasties', '2CAMarquise de Cat'])
  expect(screen.getByText('List in')).toBeVisible()
  expect(screen.getByText('Waiting')).toBeVisible()
  expect(screen.queryByRole('list', { name: "Other player's ranked factions" })).not.toBeInTheDocument()
  expect(document.querySelector('#main .tag')).toBeNull()
  expect(screen.queryByText(/waitlist|league list|prospect/i)).not.toBeInTheDocument()
  expect(from.mock.calls.map(([table]) => table)).toEqual(['seasons', 'season_stage', 'roster_public'])
})

it.each(['locked', 'live'])('shows every returned list in %s stage', async (nextStage) => {
  stage = nextStage
  rows[1]!.ranked_factions = ['WA', 'otters']
  renderApp('/players')
  expect(await screen.findByRole('list', { name: "Other player's ranked factions" })).toBeVisible()
  expect(screen.getByText('Woodland Alliance')).toBeVisible()
  expect(screen.queryByText('Waiting')).not.toBeInTheDocument()
  expect(screen.queryByText(/Ranked lists show here/)).not.toBeInTheDocument()
})

it('shows admin lists before lock with the explanatory note and handles an empty list', async () => {
  fake.state.whoami = adminJson()
  rows[1]!.ranked_factions = []
  renderApp('/players')
  expect(await screen.findByText(/As admin you see them now/)).toBeVisible()
  expect(screen.getByText('No list yet.')).toBeVisible()
  expect(screen.getByRole('list', { name: "Alex's ranked factions" })).toBeVisible()
})

it('handles a season with no players', async () => {
  rows = []
  renderApp('/players')
  expect(await screen.findByText('No players have joined yet.')).toBeVisible()
})

it('handles no current season without requesting roster data', async () => {
  current = false
  renderApp('/players')
  expect(await screen.findByText('No current season yet.')).toBeVisible()
  expect(from).toHaveBeenCalledTimes(1)
})

it('reports query failures and offers a retry', async () => {
  failure = true
  renderApp('/players')
  await waitFor(() => expect(screen.getByText(/Could not load players: Database unavailable/)).toBeVisible(), { timeout: 4000 })
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
})
