import '@testing-library/jest-dom/vitest'
import { screen } from '@testing-library/react'
import { makeFakeDb } from './test-support/fakeDb'
import { renderApp } from './test-support/renderApp'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('./db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

describe('routes', () => {
  it('renders Home inside the shell for a signed-in viewer', async () => {
    h.db = makeFakeDb().db
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Root League' })).toBeInTheDocument()
  })
})
