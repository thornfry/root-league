import '@testing-library/jest-dom/vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeFakeDb, adminJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'
import { FACTIONS } from '../../data/factions'
import { localDateTime } from './Season'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

function setup(over = {}) {
  let season = { id: 'season-1', name: 'Season 1', capacity: 12, games_each: 4, maps: ['Autumn', 'Winter', 'Lake', 'Mountain'], faction_pool: FACTIONS.map((f) => f.code), min_list_length: 4, lists_lock_at: '2026-12-12T18:30:00.000Z', started_at: null, ...over }
  const fake = makeFakeDb({ whoami: adminJson() })
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => {
    if (name === 'season_save') return { data: season, error: null }
    if (name === 'season_unlock_lists') { season = { ...season, lists_lock_at: null } as unknown as typeof season; return { data: season, error: null } }
    if (name === 'season_lock_lists') { season = { ...season, lists_lock_at: '2020-01-01T00:00:00.000Z' }; return { data: season, error: null } }
    if (name === 'season_create') { season = { ...season, id: 'new', name: String(args?.p_name), capacity: null, games_each: null, maps: null, faction_pool: null, min_list_length: null, lists_lock_at: null } as unknown as typeof season; return { data: season, error: null } }
    return fake.rpc(name)
  })
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: season, error: null }) }) }) }))
  h.db = { ...fake.db, rpc, from }
  renderApp('/admin/season')
  return { rpc, user: userEvent.setup() }
}

async function ready() { return screen.findByLabelText('Season name') }

it('offers valid pairs only, clearing an invalid games choice, and explains 10 with 3', async () => {
  const { user } = setup()
  await ready()
  await user.click(screen.getByLabelText('3 games'))
  await user.click(screen.getByLabelText('10 players'))
  const group = screen.getByRole('group', { name: 'Games each' })
  expect(within(group).queryByLabelText('3 games')).not.toBeInTheDocument()
  expect(within(group).getByLabelText('2 games')).not.toBeChecked()
  expect(within(group).getByLabelText('4 games')).not.toBeChecked()
  expect(screen.getByText(/30 seats/)).toBeInTheDocument()
})

it.each([2, 3])('requires a fresh acknowledgement for 8 with %i games and shows stored spread', async (games) => {
  const { user } = setup({ capacity: 8, games_each: games })
  await ready()
  expect(screen.getByText(/Meeting spread: 2/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save season' })).toBeDisabled()
  await user.click(screen.getByLabelText(/I acknowledge/))
  expect(screen.getByRole('button', { name: 'Save season' })).toBeEnabled()
  await user.click(screen.getByLabelText(`${games === 2 ? 3 : 2} games`))
  expect(screen.getByRole('button', { name: 'Save season' })).toBeDisabled()
})

it('saves all settings and round trips the local date through UTC with its zone', async () => {
  const { user, rpc } = setup()
  await ready()
  expect(screen.getByLabelText('Lists lock date and time')).toHaveValue(localDateTime('2026-12-12T18:30:00.000Z').replace(/:00$/, ''))
  expect(screen.getByText(new RegExp(Intl.DateTimeFormat().resolvedOptions().timeZone))).toBeInTheDocument()
  await user.clear(screen.getByLabelText('Season name'))
  await user.type(screen.getByLabelText('Season name'), 'Renamed')
  await user.click(screen.getByRole('checkbox', { name: 'Marquise de Cat' }))
  await user.click(screen.getByRole('button', { name: 'Save season' }))
  await screen.findByText('Season saved.')
  expect(rpc).toHaveBeenCalledWith('season_save', expect.objectContaining({ p_name: 'Renamed', p_capacity: 12, p_games_each: 4, p_maps: ['Autumn', 'Winter', 'Lake', 'Mountain'], p_faction_pool: FACTIONS.slice(1).map((f) => f.code), p_min_list_length: 4, p_lists_lock_at: '2026-12-12T18:30:00.000Z' }))
})

it('shows the authoritative capacity refusal with the move-people message', async () => {
  const { user, rpc } = setup()
  await ready()
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'Capacity 10 is below the 12 people on the league list. Move people to the waitlist first.' } })
  await user.click(screen.getByLabelText('10 players'))
  await user.click(screen.getByRole('button', { name: 'Save season' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Move people to the waitlist first.')
})

it('locks capacity, games and map count after start but keeps map names editable', async () => {
  setup({ started_at: '2026-12-01T00:00:00Z' })
  await ready()
  expect(screen.getByLabelText('8 players')).toBeDisabled()
  expect(screen.getByLabelText('2 games')).toBeDisabled()
  expect(screen.getByLabelText('Map 1')).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Add map' })).not.toBeInTheDocument()
})

it('refuses too few maps and creates a new current season with no defaults', async () => {
  const { user, rpc } = setup()
  await ready()
  await user.click(screen.getByRole('button', { name: 'Remove map 1' }))
  await user.click(screen.getByRole('button', { name: 'Save season' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Use at least 4 maps')
  expect(rpc.mock.calls.some(([name]) => name === 'season_save')).toBe(false)
  await user.type(screen.getByLabelText('New season name'), 'Season 2')
  await user.click(screen.getByRole('button', { name: 'Create season' }))
  await screen.findByDisplayValue('Season 2')
  expect(screen.getByLabelText('Minimum list length')).toHaveValue(null)
  expect(screen.queryByLabelText('Map 1')).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Marquise de Cat' })).not.toBeChecked()
  expect(screen.getByLabelText('12 players')).not.toBeChecked()
})

it('locks lists now after a confirmation, then offers to unlock them', async () => {
  const { rpc, user } = setup({ lists_lock_at: '2099-01-01T00:00:00.000Z' })
  await ready()
  await user.click(screen.getByRole('button', { name: 'Lock lists now' }))
  expect(rpc).not.toHaveBeenCalledWith('season_lock_lists', expect.anything())
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(rpc).not.toHaveBeenCalledWith('season_lock_lists', expect.anything())
  await user.click(screen.getByRole('button', { name: 'Lock lists now' }))
  await user.click(screen.getByRole('button', { name: 'Lock lists' }))
  await screen.findByRole('button', { name: 'Unlock lists' })
  expect(rpc).toHaveBeenCalledWith('season_lock_lists', { p_season_id: 'season-1' })
  expect(screen.queryByRole('button', { name: 'Lock lists now' })).toBeNull()
})

it('unlocks locked lists after a confirmation and clears the lock date', async () => {
  const { rpc, user } = setup({ lists_lock_at: '2020-01-01T00:00:00.000Z' })
  await ready()
  await user.click(screen.getByRole('button', { name: 'Unlock lists' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unlock lists' }))
  await screen.findByRole('button', { name: 'Lock lists now' })
  expect(rpc).toHaveBeenCalledWith('season_unlock_lists', { p_season_id: 'season-1' })
  expect(screen.getByLabelText('Lists lock date and time')).toHaveValue('')
})
