import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSupabase } from '../db/client'
import { SIGNED_OUT, whoamiQuery, type Whoami } from '../db/whoami'

/**
 * Where the visitor stands. `not-invited` is a signed-in Discord account that is not on the whitelist; it holds
 * no league data. `in` is a whitelisted viewer or admin.
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; whoami: Whoami }
  | { status: 'not-invited'; whoami: Whoami }
  | { status: 'in'; whoami: Whoami }
  | { status: 'error'; message: string }

export type SessionValue = SessionState & {
  signOut: () => Promise<void>
  /** Ask the database again who this is. A whitelist change then takes effect with no new sign-in. */
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession needs a SessionProvider above it.')
  return value
}

/** Tracks the Supabase sign-in and the `whoami` answer for it. Pages read both through `useSession`. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [auth, setAuth] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    const db = getSupabase()
    // The first event, INITIAL_SESSION, carries the stored session, so no separate getSession call is needed.
    const { data } = db.auth.onAuthStateChange((_event, session) => setAuth(session))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = auth?.user.id
  const who = useQuery({
    ...whoamiQuery(getSupabase(), userId ?? ''),
    enabled: userId !== undefined,
    // The answer is cheap and the whitelist can change under an open session, so ask again on focus.
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut()
    queryClient.clear()
  }, [queryClient])

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['whoami'] })
  }, [queryClient])

  const state = useMemo<SessionState>(() => {
    if (auth === undefined) return { status: 'loading' }
    if (auth === null) return { status: 'signed-out', whoami: SIGNED_OUT }
    if (who.isError && !who.data) return { status: 'error', message: who.error.message }
    if (!who.data) return { status: 'loading' }
    if (!who.data.signedIn) return { status: 'signed-out', whoami: SIGNED_OUT }
    return { status: who.data.whitelisted ? 'in' : 'not-invited', whoami: who.data }
  }, [auth, who.data, who.isError, who.error])

  const value = useMemo<SessionValue>(() => ({ ...state, signOut, refresh }), [state, signOut, refresh])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/** One query client for the app, with the session on top of it. */
export function AuthProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }))
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  )
}
