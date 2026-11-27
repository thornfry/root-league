import '@testing-library/jest-dom/vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { adminJson, makeFakeDb, notInvitedJson, SIGNED_OUT_JSON, viewerJson } from '../test-support/fakeDb'
import { renderApp } from '../test-support/renderApp'

const h = vi.hoisted(() => ({ db: null as unknown, configured: true }))
vi.mock('../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => h.configured }))

beforeEach(() => {
  h.configured = true
})

const hasNav = () => screen.queryByRole('navigation', { name: 'Main' }) !== null
const hasMenu = () => screen.queryByRole('button', { name: /menu/i }) !== null

describe('signed out', () => {
  it('shows only the sign-in page at any address, with no navigation', async () => {
    h.db = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON }).db
    renderApp('/admin/whitelist')
    expect(await screen.findByRole('button', { name: 'Continue with Discord' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Root\s*League/)
    expect(hasNav()).toBe(false)
    expect(hasMenu()).toBe(false)
    expect(screen.queryByRole('heading', { name: 'Whitelist' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('starts Discord sign-in with the identify scope only', async () => {
    const fake = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON })
    h.db = fake.db
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Discord' }))
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledTimes(1)
    const [args] = fake.auth.signInWithOAuth.mock.calls[0] as unknown as [{ provider: string; options: { scopes: string } }]
    expect(args.provider).toBe('discord')
    expect(args.options.scopes).toBe('identify')
  })

  it('shows the error when Discord sign-in cannot start', async () => {
    const fake = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON })
    fake.auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: { message: 'Provider is not enabled' } })
    h.db = fake.db
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Discord' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider is not enabled')
  })

  it('does not offer the dev consent page in a normal build', async () => {
    h.db = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON }).db
    renderApp('/discord')
    expect(await screen.findByRole('button', { name: 'Continue with Discord' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Discord ID')).not.toBeInTheDocument()
  })
})

describe('not invited', () => {
  it('names the Discord account, shows the ID with a Copy button and no league data', async () => {
    const fake = makeFakeDb({ whoami: notInvitedJson() })
    h.db = fake.db
    renderApp('/players')
    expect(await screen.findByRole('heading', { name: 'Not on the list yet' })).toBeInTheDocument()
    expect(screen.getByText('stranger#9')).toBeInTheDocument()
    expect(screen.getByLabelText('Your Discord ID')).toHaveTextContent('100000000000000015')
    expect(screen.getByRole('button', { name: 'Copy my ID' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(hasNav()).toBe(false)
    expect(screen.queryByRole('heading', { name: 'Players' })).not.toBeInTheDocument()
    // The only database calls are who-am-i.
    expect(fake.rpc.mock.calls.every(([name]) => name === 'whoami')).toBe(true)
  })

  it('copies the ID to the clipboard', async () => {
    h.db = makeFakeDb({ whoami: notInvitedJson() }).db
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'Copy my ID' }))
    expect(writeText).toHaveBeenCalledWith('100000000000000015')
    expect(await screen.findByText('ID copied')).toBeInTheDocument()
  })

  it('says so when the clipboard is refused', async () => {
    h.db = makeFakeDb({ whoami: notInvitedJson() }).db
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'Copy my ID' }))
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument()
  })

  it('signs out', async () => {
    const fake = makeFakeDb({ whoami: notInvitedJson() })
    h.db = fake.db
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(fake.auth.signOut).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Continue with Discord' })).toBeInTheDocument()
  })

  it('lets them in once they are added, with no new sign-in', async () => {
    const fake = makeFakeDb({ whoami: notInvitedJson() })
    h.db = fake.db
    renderApp('/')
    await screen.findByRole('heading', { name: 'Not on the list yet' })
    fake.state.whoami = viewerJson({ discord_id: '100000000000000015', person_id: 'p-new' })
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('says it is still not on the list when checked too early', async () => {
    h.db = makeFakeDb({ whoami: notInvitedJson() }).db
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }))
    expect(await screen.findByText(/Still not on the list/)).toBeInTheDocument()
  })
})

describe('signed in', () => {
  it('gives a viewer the shell with no admin bar', async () => {
    h.db = makeFakeDb().db
    renderApp('/', 1280)
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('gives an admin the admin bar', async () => {
    h.db = makeFakeDb({ whoami: adminJson() }).db
    renderApp('/', 1280)
    const bar = await screen.findByRole('navigation', { name: 'Admin' })
    expect(within(bar).getByRole('link', { name: 'Whitelist' })).toBeInTheDocument()
  })

  it('links the person on the way in when whitelisted with no person row', async () => {
    const fake = makeFakeDb({ whoami: viewerJson({ display_name: null, person_id: null }) })
    h.db = fake.db
    renderApp('/')
    await screen.findByRole('heading', { name: 'Home' })
    expect(fake.rpc.mock.calls.map(([name]) => name)).toEqual(['whoami', 'ensure_person', 'whoami'])
    expect(screen.getByText('Linked name')).toBeInTheDocument()
  })

  it('does not call ensure_person for someone already linked', async () => {
    const fake = makeFakeDb()
    h.db = fake.db
    renderApp('/')
    await screen.findByRole('heading', { name: 'Home' })
    expect(fake.rpc.mock.calls.map(([name]) => name)).toEqual(['whoami'])
  })

  it('signs out from the shell', async () => {
    const fake = makeFakeDb()
    h.db = fake.db
    renderApp('/', 1280)
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(fake.auth.signOut).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Continue with Discord' })).toBeInTheDocument()
  })

  it('locks an open session when the whitelist entry is removed, on the next check', async () => {
    const fake = makeFakeDb()
    h.db = fake.db
    renderApp('/')
    await screen.findByRole('heading', { name: 'Home' })
    fake.state.whoami = notInvitedJson()
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(await screen.findByRole('heading', { name: 'Not on the list yet' })).toBeInTheDocument()
    expect(hasNav()).toBe(false)
  })
})

describe('route guards', () => {
  it('sends a viewer from an admin page to Home', async () => {
    h.db = makeFakeDb().db
    const { router } = renderApp('/admin/whitelist')
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByRole('heading', { name: 'Whitelist' })).not.toBeInTheDocument()
  })

  it('lets an admin reach an admin page', async () => {
    h.db = makeFakeDb({ whoami: adminJson() }).db
    const { router } = renderApp('/admin/whitelist')
    expect(await screen.findByRole('heading', { name: 'Whitelist' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/whitelist')
  })

  it('sends a signed-in person away from the consent address', async () => {
    h.db = makeFakeDb().db
    const { router } = renderApp('/discord')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('keeps the address while signed out, so a deep link survives a reload', async () => {
    h.db = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON }).db
    const { router } = renderApp('/pairings')
    await screen.findByRole('button', { name: 'Continue with Discord' })
    expect(router.state.location.pathname).toBe('/pairings')
  })
})

describe('setup', () => {
  it('says what is missing when the Supabase address is not set', async () => {
    h.configured = false
    h.db = null
    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL')
  })

  it('shows an error, not a blank page, when the database cannot be reached', async () => {
    const fake = makeFakeDb()
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'fetch failed' } })
    h.db = fake.db
    renderApp('/')
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('fetch failed')
  })
})
