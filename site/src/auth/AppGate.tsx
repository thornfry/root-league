import { lazy, Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { isConfigured } from '../db/client'
import { Landing } from '../pages/Landing'
import { NotInvited } from '../pages/NotInvited'
import { Shell, type ShellSession } from '../pages/Shell'
import { Alert } from '../ui'
import { GateFrame } from './GateFrame'
import { AuthProviders, useSession } from './session'

// The stand-in is imported behind this exact comparison and nowhere else. Vite replaces the variable with its
// value at build time, so a build without `VITE_AUTH_MODE=dev` drops the import and the page with it.
const DevSignIn = import.meta.env.VITE_AUTH_MODE === 'dev' ? lazy(() => import('./DevSignIn')) : null

export const CONSENT_PATH = '/discord'

/** Root route element: refuses to start without the two public Supabase variables, else provides the session. */
export function AppRoot() {
  if (!isConfigured()) {
    return (
      <GateFrame>
        <main className="gate" id="main">
          <h1 className="disp h1s">Not set up</h1>
          <Alert tone="bad">
            This site has no Supabase address. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
          </Alert>
        </main>
      </GateFrame>
    )
  }
  return (
    <AuthProviders>
      <AppGate />
    </AuthProviders>
  )
}

/**
 * The signed-in guard. Only a whitelisted sign-in reaches the shell and the pages below it; everyone else gets a
 * gate page in place, so the address they asked for survives sign-in and a reload.
 */
export function AppGate() {
  const session = useSession()
  const { pathname } = useLocation()

  switch (session.status) {
    case 'loading':
      return (
        <GateFrame>
          <main className="gate" id="main">
            <p role="status" className="muted">
              Loading
            </p>
          </main>
        </GateFrame>
      )
    case 'error':
      return (
        <GateFrame>
          <main className="gate" id="main">
            <Alert tone="bad">Could not reach the league database: {session.message}</Alert>
          </main>
        </GateFrame>
      )
    case 'signed-out':
      return (
        <GateFrame>
          {DevSignIn && pathname === CONSENT_PATH ? (
            <Suspense fallback={null}>
              <DevSignIn />
            </Suspense>
          ) : (
            <Landing />
          )}
        </GateFrame>
      )
    case 'not-invited':
      return (
        <GateFrame onSignOut={session.signOut}>
          <NotInvited discordName={session.whoami.discordName} discordId={session.whoami.discordId} />
        </GateFrame>
      )
    case 'in': {
      const me = session.whoami
      const shell: ShellSession = {
        name: me.displayName ?? me.discordName ?? 'Signed in',
        isAdmin: me.isAdmin,
        // The roster arrives with D2's tables; My list appears for roster members once U4 reads it.
        onRoster: false,
      }
      return <Shell session={shell} onSignOut={session.signOut} />
    }
  }
}

/** Admin routes. A signed-in person who is not an admin goes back to Home; the database refuses them regardless. */
export function RequireAdmin() {
  const session = useSession()
  return session.status === 'in' && session.whoami.isAdmin ? <Outlet /> : <Navigate to="/" replace />
}

/** The consent page address belongs to the sign-in flow. Someone already in is sent home from it. */
export function LeaveGate() {
  return <Navigate to="/" replace />
}
