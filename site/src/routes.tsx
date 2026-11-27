import type { RouteObject } from 'react-router'
import { AppRoot, CONSENT_PATH, LeaveGate, RequireAdmin } from './auth/AppGate'
import { Placeholder } from './pages/Placeholder'

// One line per route, to keep merges small. A later commit replaces a line's element with its page.
export const routes: RouteObject[] = [
  {
    element: <AppRoot />,
    children: [
      { path: CONSENT_PATH, element: <LeaveGate /> },
      { path: '/', element: <Placeholder title="Home" /> },
      { path: '/players', element: <Placeholder title="Players" /> },
      { path: '/pairings', element: <Placeholder title="Pairings" /> },
      { path: '/game/:gameNo', element: <Placeholder title="Game" /> },
      { path: '/pickems', element: <Placeholder title="Pick'ems" /> },
      { path: '/my-list', element: <Placeholder title="My list" /> },
      { path: '/info', element: <Placeholder title="League info" /> },
      { path: '/info/:page', element: <Placeholder title="League info" /> },
      // Admin pages sit behind the admin guard. One line per route, as above.
      {
        element: <RequireAdmin />,
        children: [
          { path: '/admin', element: <Placeholder title="Dashboard" /> },
          { path: '/admin/whitelist', element: <Placeholder title="Whitelist" /> },
          { path: '/admin/roster', element: <Placeholder title="Roster" /> },
          { path: '/admin/season', element: <Placeholder title="Season" /> },
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
