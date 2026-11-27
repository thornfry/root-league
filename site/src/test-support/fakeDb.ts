import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'
import type { Db } from '../db/client'

type Listener = (event: string, session: Session | null) => void

export type WhoamiJson = Record<string, unknown>

export const SIGNED_OUT_JSON: WhoamiJson = { signed_in: false, whitelisted: false, is_admin: false, roles: [] }

export const viewerJson = (over: WhoamiJson = {}): WhoamiJson => ({
  signed_in: true,
  discord_id: '100000000000000003',
  discord_name: 'alex#1',
  whitelisted: true,
  is_admin: false,
  person_id: 'p-alex',
  display_name: 'Alex',
  roles: ['viewer'],
  ...over,
})

export const adminJson = (over: WhoamiJson = {}): WhoamiJson =>
  viewerJson({ is_admin: true, display_name: 'Dev admin', person_id: 'p-admin', roles: ['viewer', 'admin'], ...over })

export const notInvitedJson = (over: WhoamiJson = {}): WhoamiJson => ({
  signed_in: true,
  discord_id: '100000000000000015',
  discord_name: 'stranger#9',
  whitelisted: false,
  is_admin: false,
  roles: [],
  ...over,
})

/**
 * A stand-in for the Supabase client with just what U1 uses. `state.whoami` is what `whoami()` answers; change
 * it and refresh to model the admin editing the whitelist.
 */
export function makeFakeDb(opts: { signedIn?: boolean; whoami?: WhoamiJson } = {}) {
  const listeners = new Set<Listener>()
  const state = {
    session: opts.signedIn === false ? null : ({ user: { id: 'user-1' } } as Session),
    whoami: opts.whoami ?? (opts.signedIn === false ? SIGNED_OUT_JSON : viewerJson()),
  }
  const emit = (event: string) => listeners.forEach((cb) => cb(event, state.session))
  const signIn = (whoami: WhoamiJson) => {
    state.session = { user: { id: 'user-1' } } as Session
    state.whoami = whoami
    emit('SIGNED_IN')
  }

  const auth = {
    onAuthStateChange: vi.fn((cb: Listener) => {
      listeners.add(cb)
      queueMicrotask(() => cb('INITIAL_SESSION', state.session))
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
    }),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null as { message: string } | null })),
    signInWithPassword: vi.fn<(args: { email: string; password: string }) => Promise<{ data: object; error: { message: string } | null }>>(
      async () => ({ data: {}, error: { message: 'Invalid login credentials' } }),
    ),
    signUp: vi.fn<
      (args: { email: string; password: string; options?: unknown }) => Promise<{ data: { session: Session | null }; error: { message: string } | null }>
    >(async () => ({ data: { session: null }, error: null })),
    signOut: vi.fn(async () => {
      state.session = null
      state.whoami = SIGNED_OUT_JSON
      emit('SIGNED_OUT')
      return { error: null }
    }),
  }
  const rpc = vi.fn(async (name: string) => {
    if (name === 'ensure_person') {
      state.whoami = { ...state.whoami, person_id: 'p-linked', display_name: 'Linked name' }
      return { data: {}, error: null }
    }
    if (name === 'whoami') return { data: state.whoami, error: null }
    return { data: null, error: { message: `unexpected rpc ${name}` } }
  })
  return { db: { auth, rpc } as unknown as Db, auth, rpc, state, signIn }
}
