/// <reference types="node" />
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { adminJson, makeFakeDb } from '../test-support/fakeDb'
import { setViewport } from '../test-support/viewport'
import { routes } from '../routes'
import { ADMIN_NAV, playerNav } from './nav'
import { Placeholder } from './Placeholder'
import { Shell, type ShellSession } from './Shell'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

const player: ShellSession = { name: 'Alex', isAdmin: false, onRoster: true, seasonLabel: 'Season 1, live' }
const admin: ShellSession = { ...player, name: 'Will', isAdmin: true }

function renderShell(session: ShellSession, path = '/', width = 375) {
  setViewport(width)
  const router = createMemoryRouter(
    [
      {
        element: <Shell session={session} />,
        children: [
          { path: '/', element: <Placeholder title="Home" /> },
          { path: '/players', element: <Placeholder title="Standings" /> },
          { path: '/pairings', element: <Placeholder title="Pairings" /> },
          { path: '/game/:gameNo', element: <Placeholder title="Game" /> },
          { path: '/admin/roster', element: <Placeholder title="Roster" /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const labels = (items: { label: string }[]) => items.map((i) => i.label)

describe('Shell at phone width (375)', () => {
  it('shows the brand and a menu button, and no desktop bar', () => {
    renderShell(admin)
    expect(screen.getByRole('link', { name: 'Root League' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Admin' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('opens a menu that lists every route and sign out', async () => {
    const user = userEvent.setup()
    renderShell(admin)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const menu = screen.getByRole('navigation', { name: 'Menu' })
    const names = within(menu).getAllByRole('link').map((a) => a.textContent)
    expect(names).toEqual([...labels(playerNav(true)), ...labels(ADMIN_NAV)])
    expect(within(menu).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull()
  })

  it('groups the admin links under a label only an admin sees', async () => {
    const user = userEvent.setup()
    renderShell(admin)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByText('Admin only')).toBeInTheDocument()
  })

  it('has no admin links, group or bar for a non-admin', async () => {
    const user = userEvent.setup()
    renderShell(player)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const menu = screen.getByRole('navigation', { name: 'Menu' })
    expect(within(menu).getAllByRole('link').map((a) => a.textContent)).toEqual(labels(playerNav(true)))
    expect(screen.queryByText('Admin only')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Whitelist' })).toBeNull()
    expect(screen.queryByText('Admin')).toBeNull()
  })

  it('leaves My factions out of the menu for someone not on the roster', async () => {
    const user = userEvent.setup()
    renderShell({ ...player, onRoster: false })
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.queryByRole('link', { name: 'My factions' })).toBeNull()
    expect(screen.getByRole('link', { name: 'League info' })).toBeInTheDocument()
  })

  it('goes to the page and closes the menu when a link is chosen', async () => {
    const user = userEvent.setup()
    renderShell(admin)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('link', { name: 'Standings' }))
    expect(screen.getByRole('heading', { name: 'Standings' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Menu' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
  })

  it('closes the menu with its button', async () => {
    const user = userEvent.setup()
    renderShell(player)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByRole('navigation', { name: 'Menu' })).toBeNull()
  })

  it('marks the current page in the menu', async () => {
    const user = userEvent.setup()
    renderShell(admin, '/admin/roster')
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const menu = screen.getByRole('navigation', { name: 'Menu' })
    expect(within(menu).getByRole('link', { name: 'Roster' })).toHaveClass('on')
    expect(within(menu).getByRole('link', { name: 'Home' })).not.toHaveClass('on')
  })
})

describe('Shell at desktop width (1280)', () => {
  it('shows the top bar with every player link and no menu button', () => {
    renderShell(player, '/', 1280)
    const main = screen.getByRole('navigation', { name: 'Main' })
    expect(within(main).getAllByRole('link').map((a) => a.textContent)).toEqual(labels(playerNav(true)))
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull()
    expect(screen.getByText('Season 1, live')).toBeInTheDocument()
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('has no admin bar and no Admin tag for a non-admin', () => {
    renderShell(player, '/', 1280)
    expect(screen.queryByRole('navigation', { name: 'Admin' })).toBeNull()
    expect(screen.queryByText('Admin')).toBeNull()
  })

  it('shows the admin bar with every admin link and the Admin tag for an admin', () => {
    renderShell(admin, '/', 1280)
    const bar = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(bar).getAllByRole('link').map((a) => a.textContent)).toEqual(labels(ADMIN_NAV))
    expect(screen.getByText('Admin', { selector: '.tag' })).toHaveClass('adm')
  })

  it('marks the current page, and a game page marks Pairings', () => {
    renderShell(admin, '/game/3', 1280)
    expect(screen.getByRole('link', { name: 'Pairings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('marks Dashboard only on its own page, not on every admin page', () => {
    renderShell(admin, '/admin/roster', 1280)
    expect(screen.getByRole('link', { name: 'Roster' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('has a skip link to the main content', () => {
    renderShell(player, '/', 1280)
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})

describe('no horizontal scroll at 375', () => {
  // jsdom has no layout, so this checks what causes sideways scroll: fixed widths wider than the phone.
  it('renders no inline width wider than the viewport', async () => {
    const user = userEvent.setup()
    renderShell(admin)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) {
      for (const prop of ['width', 'minWidth'] as const) {
        const v = el.style[prop]
        if (v.endsWith('px')) expect(parseFloat(v), `${el.outerHTML} ${prop}`).toBeLessThanOrEqual(375)
      }
    }
  })

  it('sets no fixed width over 375px outside a wide-screen media query', () => {
    for (const file of ['src/ui/components.css', 'src/ui/shell.css']) {
      const css = readFileSync(file, 'utf8').replace(/@media[^{]*\(min-width[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '')
      for (const m of css.matchAll(/(?<![-\w])(?:min-)?width:\s*(\d+)px/g)) {
        expect(Number(m[1]), `${file}: ${m[0]}`).toBeLessThanOrEqual(375)
      }
    }
  })

  it('lets page children shrink, so a long name wraps instead of widening the page', () => {
    const css = readFileSync('src/ui/shell.css', 'utf8')
    expect(css).toMatch(/\.page > \* \{ min-width: 0; \}/)
    expect(readFileSync('src/ui/components.css', 'utf8')).toMatch(/\.disp \{[^}]*overflow-wrap: anywhere/)
  })
})

describe('routes', () => {
  // The real routes now sit behind sign-in, so these run as a signed-in admin through a fake client.
  async function at(path: string, width = 1280) {
    h.db = makeFakeDb({ whoami: adminJson() }).db
    setViewport(width)
    const router = createMemoryRouter(routes, { initialEntries: [path] })
    render(<RouterProvider router={router} />)
    await screen.findByRole('heading', { level: 1 })
  }

  it.each([...playerNav(true), ...ADMIN_NAV].map((i) => [i.label, i.to]))('has a placeholder page for %s at %s', async (label, to) => {
    await at(to!)
    expect(screen.getByRole('heading', { level: 1, name: to === '/info' ? 'League Format' : label })).toBeInTheDocument()
  })

  it.each(['/game/7', '/info/format', '/nowhere'])('renders a page at %s', async (path) => {
    await at(path)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('can be clicked through from the top bar', async () => {
    const user = userEvent.setup()
    await at('/')
    await user.click(screen.getByRole('link', { name: 'Standings' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Standings' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Fix it' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Fix it' })).toBeInTheDocument()
  })
})
