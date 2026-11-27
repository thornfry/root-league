import '@testing-library/jest-dom/vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeFakeDb, notInvitedJson, SIGNED_OUT_JSON } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

it.each([375, 1280])('navigates all three read-only pages at %i px', async (width) => {
  h.db = makeFakeDb().db
  const { container, router } = renderApp('/info', width)
  await screen.findByRole('heading', { name: 'League Format' })
  const nav = screen.getByRole('navigation', { name: 'League info pages' })
  expect(within(nav).getAllByRole('link')).toHaveLength(3)
  expect(within(nav).getByRole('link', { name: 'League format' })).toHaveAttribute('aria-current', 'page')
  await userEvent.click(within(nav).getByRole('link', { name: 'Pairing rules' }))
  expect(await screen.findByRole('heading', { name: 'Pairing Rules' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/info/rules')
  expect(within(screen.getByRole('article')).getByRole('link', { name: 'format' })).toHaveAttribute('href', '/info/format')
  expect(screen.getByRole('article')).toHaveTextContent('never Vagabond and Knaves together')
  await userEvent.click(within(nav).getByRole('link', { name: 'How pairing works' }))
  expect(await screen.findByRole('heading', { name: 'How Pairing Works' })).toBeInTheDocument()
  expect(container.querySelectorAll('main')).toHaveLength(1)
  expect(screen.getByRole('article').querySelector('input,textarea,button,[contenteditable]')).toBeNull()
  expect(screen.queryByText(/badge guide/i)).not.toBeInTheDocument()
})

it('switches pages from the Section picker used on phones', async () => {
  h.db = makeFakeDb().db
  const { router } = renderApp('/info', 375)
  await screen.findByRole('heading', { name: 'League Format' })
  await userEvent.selectOptions(screen.getByLabelText('Section'), 'rules')
  expect(await screen.findByRole('heading', { name: 'Pairing Rules' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/info/rules')
  expect(screen.getByLabelText('Section')).toHaveValue('rules')
})

it('opens a deep link and defaults unknown keys to format', async () => {
  h.db = makeFakeDb().db
  const { router } = renderApp('/info/how')
  await screen.findByRole('heading', { name: 'How Pairing Works' })
  await router.navigate('/info/unknown')
  expect(await screen.findByRole('heading', { name: 'League Format' })).toBeInTheDocument()
})

it.each(['signed out', 'not invited'])('gates content for %s visitors', async (state) => {
  h.db = makeFakeDb(state === 'signed out'
    ? { signedIn: false, whoami: SIGNED_OUT_JSON }
    : { whoami: notInvitedJson() }).db
  renderApp('/info/rules')
  if (state === 'signed out') await screen.findByRole('button', { name: 'Continue with Discord' })
  else await screen.findByRole('heading', { name: 'Not on the list yet' })
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByText(/never Vagabond and Knaves together/)).not.toBeInTheDocument()
})
