import '@testing-library/jest-dom/vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeFakeDb, SIGNED_OUT_JSON, viewerJson } from '../test-support/fakeDb'
import { renderApp } from '../test-support/renderApp'
import { DEV_SIGNIN_MARKER } from './DevSignIn'

// Runs before the imports above, so the build-time switch reads "dev" when the gate module loads.
vi.hoisted(() => {
  import.meta.env.VITE_AUTH_MODE = 'dev'
})

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

describe('dev sign-in build', () => {
  it('sends Continue with Discord to the stand-in consent page', async () => {
    h.db = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON }).db
    const { router } = renderApp('/')
    await userEvent.click(await screen.findByRole('link', { name: 'Continue with Discord' }))
    expect(await screen.findByLabelText('Discord ID')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/discord')
    expect(document.querySelector(`[data-marker="${DEV_SIGNIN_MARKER}"]`)).not.toBeNull()
  })

  it('refuses an ID that is not digits and never calls Auth', async () => {
    const fake = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON })
    h.db = fake.db
    renderApp('/discord')
    await userEvent.type(await screen.findByLabelText('Discord ID'), 'alex')
    await userEvent.click(screen.getByRole('button', { name: 'Authorise' }))
    expect(screen.getByText('A Discord ID is 15 to 20 digits.')).toBeInTheDocument()
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('signs in as <id>@dev.invalid, creating the user on first use, then lands on the page asked for', async () => {
    const fake = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON })
    fake.auth.signUp.mockImplementation(async () => {
      fake.signIn(viewerJson())
      return { data: { session: { user: { id: 'user-1' } } as never }, error: null }
    })
    h.db = fake.db
    const { router } = renderApp('/discord')
    await userEvent.type(await screen.findByLabelText('Discord ID'), '100000000000000003')
    await userEvent.click(screen.getByRole('button', { name: 'Authorise' }))
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: '100000000000000003@dev.invalid' }),
    )
    expect(fake.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: '100000000000000003@dev.invalid' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('does not create the user again when sign-in works', async () => {
    const fake = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON })
    fake.auth.signInWithPassword.mockImplementation(async () => {
      fake.signIn(viewerJson())
      return { data: {}, error: null }
    })
    h.db = fake.db
    renderApp('/discord')
    await userEvent.click(await screen.findByRole('button', { name: 'Alex' }))
    await userEvent.click(screen.getByRole('button', { name: 'Authorise' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(fake.auth.signUp).not.toHaveBeenCalled()
  })

  it('shows the Auth error when the user cannot be created', async () => {
    const fake = makeFakeDb({ signedIn: false, whoami: SIGNED_OUT_JSON })
    fake.auth.signUp.mockResolvedValue({ data: { session: null }, error: { message: 'Signups not allowed' } })
    h.db = fake.db
    renderApp('/discord')
    await userEvent.type(await screen.findByLabelText('Discord ID'), '100000000000000015')
    await userEvent.click(screen.getByRole('button', { name: 'Authorise' }))
    expect(await screen.findByText('Signups not allowed')).toBeInTheDocument()
  })
})
