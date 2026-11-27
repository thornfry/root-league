/** Navigation entries, in the order the canvas shows them. One list feeds the desktop bar and the phone menu. */
export interface NavItem {
  to: string
  label: string
  /** Match only this exact path, not the paths under it. */
  end?: boolean
  /** Also lit on these path prefixes (a game page lights Pairings). */
  also?: string[]
}

export const PLAYER_NAV: NavItem[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/players', label: 'Players' },
  { to: '/pairings', label: 'Pairings', also: ['/game'] },
  { to: '/pickems', label: "Pick'ems" },
]

/** Shown only to someone on the roster. */
export const MY_LIST_NAV: NavItem = { to: '/my-list', label: 'My factions' }

export const INFO_NAV: NavItem = { to: '/info', label: 'League info' }

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/whitelist', label: 'Whitelist' },
  { to: '/admin/roster', label: 'Roster' },
  { to: '/admin/season', label: 'Season' },
  { to: '/admin/start', label: 'Start season' },
  { to: '/admin/disputes', label: 'Disputes' },
  { to: '/admin/fixit', label: 'Fix it' },
  { to: '/admin/csv', label: 'CSV' },
]

export function playerNav(onRoster: boolean): NavItem[] {
  return [...PLAYER_NAV, ...(onRoster ? [MY_LIST_NAV] : []), INFO_NAV]
}

export function isActive(item: NavItem, pathname: string): boolean {
  const hit = (p: string) => pathname === p || pathname.startsWith(`${p}/`)
  if (item.end) return pathname === item.to
  return hit(item.to) || (item.also ?? []).some(hit)
}
