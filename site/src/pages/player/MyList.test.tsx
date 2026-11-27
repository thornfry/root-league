import '@testing-library/jest-dom/vitest'
import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { adminJson, makeFakeDb, viewerJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'
import { listProblems } from './MyList'

vi.setConfig({ testTimeout: 30_000 })
configure({ asyncUtilTimeout: 10_000 })

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

function fixture({ admin = false, stage = 'open', codes = [] as string[], flagged = false } = {}) {
  const fake = makeFakeDb({ whoami: admin ? adminJson() : viewerJson({ roles: ['viewer', 'prospect'] }) })
  const state = {
    stage,
    season: { id: 'season', faction_pool: ['cats', 'birds', 'WA'], min_list_length: 2, lists_lock_at: '2027-01-01T12:00:00Z' },
    roster: [{ person_id: 'p-alex', display_name: 'Alex', ranked_factions: codes, list_in: codes.length >= 2, list_flagged: flagged }],
  }
  const from = vi.fn((table: string) => {
    const result = () => ({ data: table === 'seasons' ? state.season : table === 'season_stage' ? { stage: state.stage } : state.roster, error: null })
    const chain = { select: () => chain, eq: () => chain, single: async () => result(), maybeSingle: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) }
    return chain
  })
  const rpc = vi.fn(async (name: string, args?: { p_factions: string[] }) => {
    if (name === 'whoami') return { data: fake.state.whoami, error: null }
    state.roster[0]!.ranked_factions = [...args!.p_factions]
    state.roster[0]!.list_in = true
    state.roster[0]!.list_flagged = false
    return { data: null, error: null }
  })
  h.db = { ...fake.db, from, rpc }
  return { state, rpc }
}

it.each([375, 1280])('adds, reorders, removes, submits and reloads at %i px', async width => {
  const { rpc } = fixture()
  const user = userEvent.setup()
  const { router, ...view } = renderApp('/my-list', width)
  await screen.findByRole('heading', { name: 'Add a faction' })
  expect(screen.getAllByRole('button', { name: 'Save factions' })).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Save factions' })).toBeDisabled()
  expect(screen.getByText('Not ready', { exact: true })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Add Marquise de Cat' }))
  expect(screen.queryByRole('button', { name: 'Add Marquise de Cat' })).toBeNull()
  expect(screen.getByRole('status', { name: 'List updates' })).toHaveTextContent('Marquise de Cat added.')
  await user.click(screen.getByRole('button', { name: 'Add Eyrie Dynasties' }))
  await user.click(screen.getByRole('button', { name: 'Move Eyrie Dynasties up' }))
  expect(screen.getByRole('status', { name: 'List updates' })).toHaveTextContent('rank 1')
  await user.click(screen.getByRole('button', { name: 'Remove Marquise de Cat' }))
  expect(screen.getByText('Pick 2 to 5 factions to be ready. You have 1.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Add Woodland Alliance' }))
  await user.click(screen.getByRole('button', { name: 'Save factions' }))
  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(router.state.location.state).toEqual({ listSaved: true })
  expect(rpc).toHaveBeenCalledWith('save_ranked_list', { p_season_id: 'season', p_factions: ['birds', 'WA'] })
  view.unmount()
  renderApp('/my-list', width)
  await screen.findByText('Ready', { exact: true })
  const ranks = screen.getByLabelText('Ranked factions')
  expect(within(ranks).getAllByRole('strong')[0]).toHaveTextContent('Eyrie Dynasties')
  expect(screen.getByRole('link', { name: /Faction info: Eyrie/ })).toHaveAttribute('href', 'https://www.therootdatabase.com/faction/eyrie-dynasties/')
  expect(document.querySelectorAll('.my-list-lock')).toHaveLength(1)
  expect(document.querySelector('.my-list-lock')).toHaveTextContent(Intl.DateTimeFormat().resolvedOptions().timeZone)
  expect(document.querySelectorAll('main')).toHaveLength(1)
})

it('flags invalid stored lists and explains duplicate and pool validation', async () => {
  fixture({ codes: ['cats', 'cats', 'rats'], flagged: true })
  renderApp('/my-list')
  await screen.findByText(/The faction pool changed/)
  expect(screen.getByText(/Remove the duplicate faction/)).toBeInTheDocument()
  expect(screen.getByText(/Lord of the Hundreds is outside/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save factions' })).toBeDisabled()
  expect(listProblems(['cats'], ['cats'])).toEqual([])
})

it.each(['locked', 'live'])('renders %s lists read-only', async stage => {
  fixture({ stage, codes: ['cats', 'birds'] })
  renderApp('/my-list')
  await screen.findByText('Locked', { exact: true })
  expect(screen.queryByRole('button', { name: 'Save factions' })).toBeNull()
  expect(screen.queryByRole('button', { name: /Move|Remove|Add / })).toBeNull()
})

it('lets an admin edit another list after lock', async () => {
  const { rpc } = fixture({ admin: true, stage: 'locked', codes: ['cats', 'birds'] })
  const { router } = renderApp('/my-list')
  await userEvent.selectOptions(await screen.findByLabelText('Edit a player’s factions'), 'p-alex')
  await userEvent.click(screen.getByRole('button', { name: 'Move Eyrie Dynasties up' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save factions' }))
  await screen.findByText('Factions saved. You are ready.')
  expect(router.state.location.pathname).toBe('/my-list')
  expect(rpc).toHaveBeenCalledWith('roster_set_list', { p_season_id: 'season', p_person_id: 'p-alex', p_factions: ['birds', 'cats'] })
})

it('opens the player named in the link for an admin', async () => {
  fixture({ admin: true, codes: ['cats', 'birds'] })
  renderApp('/my-list?player=p-alex')
  expect(await screen.findByLabelText('Edit a player’s factions')).toHaveValue('p-alex')
  expect(screen.getByRole('button', { name: 'Move Eyrie Dynasties up' })).toBeInTheDocument()
})

it('asks a viewer to join without exposing list controls', async () => {
  const { state } = fixture()
  state.roster = []
  renderApp('/my-list')
  await screen.findByText(/Join the league to rank factions/)
  expect(screen.queryByRole('button', { name: 'Save factions' })).toBeNull()
})

it('saves a partial list and returns Home', async () => {
  const { rpc } = fixture()
  const user = userEvent.setup()
  const { router } = renderApp('/my-list')
  await user.click(await screen.findByRole('button', { name: 'Add Marquise de Cat' }))
  await user.click(screen.getByRole('button', { name: 'Save factions' }))
  await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(rpc).toHaveBeenCalledWith('save_ranked_list', { p_season_id: 'season', p_factions: ['cats'] })
})

it('stops at five factions', async () => {
  const { state } = fixture()
  state.season.faction_pool = ['cats', 'birds', 'WA', 'otters', 'frogs', 'rats']
  const user = userEvent.setup()
  renderApp('/my-list')
  for (const name of ['Marquise de Cat', 'Lord of the Hundreds', 'Eyrie Dynasties', 'Lilypad Diaspora', 'Riverfolk Company']) await user.click(await screen.findByRole('button', { name: `Add ${name}` }))
  expect(screen.getByRole('button', { name: 'Add Woodland Alliance' })).toBeDisabled()
  expect(screen.getByText(/the most it can/)).toBeInTheDocument()
})
