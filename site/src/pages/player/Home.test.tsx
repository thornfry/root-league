import '@testing-library/jest-dom/vitest'
import { act, configure, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeFakeDb } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

// Auth and membership resolve in sequence; allow for the parallel build's CPU load.
configure({ asyncUtilTimeout: 5000 })

function scenario(joined = false, stage = 'open', submitted = false, flagged = false) {
  const fake = makeFakeDb()
  const member = { person_id: 'p-alex', list_in: submitted, list_flagged: flagged, ranked_factions: ['cats', 'birds'] }
  const state = { stage, member: joined ? member : null as typeof member | null, error: '' }
  const selects: string[] = []
  const from = vi.fn((table: string) => {
    const query = {
      select: (fields: string) => { selects.push(fields); return query },
      eq: () => query,
      single: async () => ({ data: { stage: state.stage }, error: null }),
      maybeSingle: async () => ({ data: table === 'seasons' ? { id: 's-1', name: 'Season 1', lists_lock_at: null } : state.member, error: null }),
    }
    return query
  })
  const originalRpc = fake.rpc.getMockImplementation()!
  fake.rpc.mockImplementation(async name => {
    if (name === 'join_league') {
      if (state.error) return { data: null, error: { message: state.error } }
      state.member ??= { ...member, list_in: false, ranked_factions: [] }
      return { data: {}, error: null }
    }
    return originalRpc(name)
  })
  h.db = Object.assign(fake.db, { from })
  return { ...fake, state, selects, from }
}

it('joins straight to My list with an acknowledgement and updates the menu', async () => {
  const fake = scenario()
  const { router } = renderApp('/')
  await userEvent.click(await screen.findByRole('button', { name: 'Join league' }))
  await screen.findByRole('heading', { name: "You're on the list!" })
  expect(router.state.location.pathname).toBe('/my-list')
  expect(screen.getByRole('link', { name: 'My list' })).toBeInTheDocument()
  expect(fake.rpc).toHaveBeenCalledWith('join_league', { p_season_id: 's-1' })
  expect(fake.from.mock.calls.flat()).not.toContain('roster')
  expect(fake.selects.join(' ')).not.toMatch(/\b(?:list|position|joined_at)\b/)
})

it.each([375, 1280])('warns an unsubmitted prospect without placement details at %i', async width => {
  scenario(true)
  renderApp('/', width)
  await screen.findByText('Not submitted yet.')
  expect(screen.getByRole('main').textContent).not.toMatch(/waitlist|league list|position|queue/i)
  expect(screen.queryByRole('button', { name: 'Join league' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review and submit' })).toHaveAttribute('href', '/my-list')
})

it('shows a submitted list', async () => {
  scenario(true, 'open', true)
  renderApp('/')
  expect(await screen.findByText('Submitted')).toBeInTheDocument()
  expect(screen.getByText('Marquise de Cat, Eyrie Dynasties')).toBeInTheDocument()
})

it('offers no Leave league button: the admin removes people', async () => {
  scenario(true, 'open', true)
  renderApp('/')
  await screen.findByText('Submitted')
  expect(screen.queryByRole('button', { name: 'Leave league' })).not.toBeInTheDocument()
})

it.each(['locked', 'live'])('closes joining when the server stage is %s', async stage => {
  scenario(false, stage)
  renderApp('/')
  await screen.findByText(stage === 'locked' ? 'Lists are locked. The season has not started yet.' : 'Joining is closed. Follow the games and make your picks.')
  expect(screen.queryByRole('button', { name: 'Join league' })).not.toBeInTheDocument()
})

it('refetches stage on focus and closes joining after lock', async () => {
  const fake = scenario()
  renderApp('/')
  await screen.findByRole('button', { name: 'Join league' })
  fake.state.stage = 'locked'
  await act(async () => { window.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')) })
  await screen.findByText('Lists are locked. The season has not started yet.')
  expect(screen.queryByRole('button', { name: 'Join league' })).not.toBeInTheDocument()
})

it('shows a lock race as an error and preserves the viewer state', async () => {
  const fake = scenario()
  fake.state.error = 'Joining is closed: lists have locked.'
  renderApp('/')
  await userEvent.click(await screen.findByRole('button', { name: 'Join league' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(fake.state.error)
  expect(fake.state.member).toBeNull()
})

it('asks the admin about a flagged list after lock', async () => {
  scenario(true, 'locked', true, true)
  renderApp('/')
  await screen.findByText('Not submitted yet.')
  expect(screen.getByText(/faction pool changed/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Review and submit' })).not.toBeInTheDocument()
})
