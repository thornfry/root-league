import type { RouteObject } from 'react-router'
import { AppRoot, CONSENT_PATH, LeaveGate, RequireAdmin } from './auth/AppGate'
import { Pairings } from './pages/player/Pairings'
import { Game } from './pages/player/Game'
import { Placeholder } from './pages/Placeholder'
import { Home } from './pages/player/Home'
import { MembershipListEntry } from './pages/player/ProspectHome'
import { Roster } from './pages/admin/Roster'
import { MyList } from './pages/player/MyList'
import { LeagueInfo } from './pages/player/LeagueInfo'
import { Players } from './pages/player/Players'

// One line per route, to keep merges small. A later commit replaces a line's element with its page.
export const routes: RouteObject[] = [
  {
    element: <AppRoot />,
    children: [
      { path: CONSENT_PATH, element: <LeaveGate /> },
      { path: '/', element: <Home /> },
      { path: '/players', element: <Players /> },
      { path: '/pairings', element: <Pairings /> },
      { path: '/game/:gameNo', element: <Game /> },
      { path: '/pickems', HydrateFallback: () => <h1>Pick&apos;ems</h1>, lazy: async () => ({ Component: (await import('./pages/player/Pickems')).Pickems }) },
      { path: '/my-list', element: <MembershipListEntry><MyList /></MembershipListEntry> },
      { path: '/info', element: <LeagueInfo /> },
      { path: '/info/:page', element: <LeagueInfo /> },
      // Admin pages sit behind the admin guard. One line per route, as above.
      {
        element: <RequireAdmin />,
        children: [
          { path: '/admin', lazy: async () => ({ Component: (await import('./pages/admin/Dashboard')).Dashboard }) },
          { path: '/admin/whitelist', lazy: async () => ({ Component: (await import('./pages/admin/Whitelist')).Whitelist }) },
          { path: '/admin/roster', element: <Roster /> },
          { path: '/admin/season', HydrateFallback: () => <p role="status">Loading season</p>, lazy: async () => ({ Component: (await import('./pages/admin/Season')).Season }) },
          { path: '/admin/start', HydrateFallback: () => <p role="status">Loading season</p>, lazy: async () => ({ Component: (await import('./pages/admin/StartSeason')).StartSeason }) },
          { path: '/admin/disputes', lazy: async () => ({ Component: (await import('./pages/admin/Disputes')).Disputes }) },
          { path: '/admin/fixit', element: <Placeholder title="Fix it" /> },
          { path: '/admin/csv', element: <Placeholder title="CSV" /> },
        ],
      },
      { path: '*', element: <Placeholder title="Page not found" /> },
    ],
  },
]
