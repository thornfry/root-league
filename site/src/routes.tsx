import type { RouteObject } from 'react-router'
import { AppRoot, CONSENT_PATH, LeaveGate, RequireAdmin } from './auth/AppGate'
import { Placeholder } from './pages/Placeholder'
import { Home } from './pages/player/Home'
import { MembershipListEntry } from './pages/player/ProspectHome'
import { Roster } from './pages/admin/Roster'
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
      { path: '/pairings', element: <Placeholder title="Pairings" /> },
      { path: '/game/:gameNo', element: <Placeholder title="Game" /> },
      { path: '/pickems', element: <Placeholder title="Pick'ems" /> },
      { path: '/my-list', element: <MembershipListEntry><Placeholder title="My list" /></MembershipListEntry> },
      { path: '/info', element: <LeagueInfo /> },
      { path: '/info/:page', element: <LeagueInfo /> },
      // Admin pages sit behind the admin guard. One line per route, as above.
      {
        element: <RequireAdmin />,
        children: [
          { path: '/admin', element: <Placeholder title="Dashboard" /> },
          { path: '/admin/whitelist', lazy: async () => ({ Component: (await import('./pages/admin/Whitelist')).Whitelist }) },
          { path: '/admin/roster', element: <Roster /> },
          { path: '/admin/season', HydrateFallback: () => <p role="status">Loading season</p>, lazy: async () => ({ Component: (await import('./pages/admin/Season')).Season }) },
          { path: '/admin/start', element: <Placeholder title="Start season" /> },
          { path: '/admin/disputes', element: <Placeholder title="Disputes" /> },
          { path: '/admin/fixit', element: <Placeholder title="Fix it" /> },
          { path: '/admin/csv', element: <Placeholder title="CSV" /> },
        ],
      },
      { path: '*', element: <Placeholder title="Page not found" /> },
    ],
  },
]
