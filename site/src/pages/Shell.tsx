import { useState, useSyncExternalStore } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import '../ui/styles.css'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Tag } from '../ui/Tag'
import { ToastProvider } from '../ui/Toast'
import { ADMIN_NAV, isActive, playerNav, type NavItem } from './nav'

export const DESKTOP_QUERY = '(min-width: 900px)'

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True from 900px wide up, where the top bar replaces the phone menu. Phone first when it cannot tell. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}

export interface ShellSession {
  name: string
  isAdmin: boolean
  /** Whether the person is on the roster, which adds My list to the menu. */
  onRoster: boolean
  /** Shown in the desktop bar, such as "Season 1, live". */
  seasonLabel?: string
}

function Brand() {
  return (
    <Link className="brand" to="/">
      Root <i>League</i>
    </Link>
  )
}

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return items.map((item) => {
    const on = isActive(item, pathname)
    return (
      <Link key={item.to} to={item.to} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
        {item.label}
      </Link>
    )
  })
}

function DesktopHeader({ session, pathname, onSignOut }: { session: ShellSession; pathname: string; onSignOut?: () => void }) {
  return (
    <header>
      <div className="band">
        <div className="dtop top">
          <Brand />
          <nav aria-label="Main">
            <NavLinks items={playerNav(session.onRoster)} pathname={pathname} />
          </nav>
          <div className="right">
            {session.seasonLabel ? <span className="who">{session.seasonLabel}</span> : null}
            <span className="who">
              Signed in as <b>{session.name}</b>
            </span>
            {session.isAdmin ? <Tag tone="adm">Admin</Tag> : null}
            <Button size="sm" className="band-btn" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
      {session.isAdmin ? (
        <div className="band adm">
          <div className="dtop adminbar">
            <span className="kicker">Admin</span>
            <nav aria-label="Admin">
              <NavLinks items={ADMIN_NAV} pathname={pathname} />
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  )
}

function PhoneHeader({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <header className="band">
      <div className="bar">
        <Brand />
        <button
          type="button"
          className="menu-btn"
          aria-label={open ? 'Close menu' : 'Menu'}
          aria-expanded={open}
          aria-controls="phone-menu"
          onClick={onToggle}
        >
          <Icon name={open ? 'close' : 'menu'} size={22} />
        </button>
      </div>
    </header>
  )
}

function MenuPanel({ session, pathname, onSignOut }: { session: ShellSession; pathname: string; onSignOut?: () => void }) {
  const link = (item: NavItem) => (
    <Link key={item.to} to={item.to} className={isActive(item, pathname) ? 'mlink on' : 'mlink'}>
      {item.label}
    </Link>
  )
  return (
    <nav id="phone-menu" className="page menu" aria-label="Menu">
      <div>{playerNav(session.onRoster).map(link)}</div>
      {session.isAdmin ? (
        <div className="stack8">
          <div className="kicker">Admin only</div>
          {ADMIN_NAV.map(link)}
        </div>
      ) : null}
      <Button onClick={onSignOut}>Sign out</Button>
    </nav>
  )
}

/**
 * The frame around every signed-in page: the header band with the phone menu or the desktop bar, the admin
 * bar for an admin only, and the page itself through the router outlet. It reads no data: the session comes in.
 */
export function Shell({ session, onSignOut }: { session: ShellSession; onSignOut?: () => void }) {
  const isDesktop = useIsDesktop()
  const { pathname, key } = useLocation()
  // The menu closes on its own when the route changes, because it remembers which location opened it.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const menuOpen = !isDesktop && openedAt === key

  return (
    <ToastProvider>
      <div className="lg">
        <a className="sr" href="#main">
          Skip to content
        </a>
        {isDesktop ? (
          <DesktopHeader session={session} pathname={pathname} onSignOut={onSignOut} />
        ) : (
          <PhoneHeader open={menuOpen} onToggle={() => setOpenedAt(menuOpen ? null : key)} />
        )}
        {menuOpen ? (
          <MenuPanel session={session} pathname={pathname} onSignOut={onSignOut} />
        ) : (
          <main id="main" className="page">
            <Outlet />
          </main>
        )}
      </div>
    </ToastProvider>
  )
}
