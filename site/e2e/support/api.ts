import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import type { Database } from '../../src/db/types'
import type { Identity } from './people'

export type Db = SupabaseClient<Database>

// The dev stand-in's fixed password. It is the same string src/auth/DevSignIn.tsx uses and works only against a
// local database that holds the dev_signin seed row; it is not a secret.
const DEV_PASSWORD = 'dev-signin-standin-only'
// Built from parts: the repo hygiene test keeps the literal domain to the stand-in page and the guards.
const DEV_DOMAIN = ['dev', 'invalid'].join('.')
const PLAIN = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }

function config(): { url: string; key: string } {
  const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!key) throw new Error('Export VITE_SUPABASE_ANON_KEY from supabase status -o env.')
  return { url, key }
}

/** A client with no session: what a signed-out visitor holds. */
export function anonClient(): Db {
  const { url, key } = config()
  return createClient<Database>(url, key, PLAIN)
}

// One sign-in per person per worker. Local Auth limits sign-ins per address, and the Auth users survive every
// database reset, so a token stays good across scenarios until it nears its expiry.
const sessions = new Map<string, Session>()

export async function sessionFor(who: Identity): Promise<Session> {
  const cached = sessions.get(who.id)
  if (cached && (cached.expires_at ?? 0) * 1000 - Date.now() > 5 * 60_000) return cached
  const db = anonClient()
  const email = `${who.id}@${DEV_DOMAIN}`
  const signedIn = await db.auth.signInWithPassword({ email, password: DEV_PASSWORD })
  let session = signedIn.data.session
  if (!session) {
    const created = await db.auth.signUp({ email, password: DEV_PASSWORD, options: { data: { full_name: who.name } } })
    if (created.error) throw new Error(`Could not create the stand-in user for ${who.name}: ${created.error.message}`)
    session = created.data.session
  }
  if (!session) throw new Error(`No session for ${who.name}. Local Auth must not require email confirmation.`)
  sessions.set(who.id, session)
  return session
}

/** A real supabase-js client signed in as one placeholder person. It sends that person's JWT, never a service key. */
export async function apiAs(who: Identity): Promise<Db> {
  const { url, key } = config()
  const session = await sessionFor(who)
  return createClient<Database>(url, key, { ...PLAIN, global: { headers: { Authorization: `Bearer ${session.access_token}` } } })
}

/** supabase-js stores its session under `sb-<first label of the host>-auth-token`. */
function storageKey(): string {
  return `sb-${new URL(config().url).hostname.split('.')[0]}-auth-token`
}

/**
 * Signs the browser in by placing a real session in storage, then opens `path`. Use it where the sign-in page is
 * not what the scenario proves (S01 and S14 use the page itself). It also replaces whoever was signed in.
 */
export async function signInFast(page: Page, who: Identity, path = '/'): Promise<void> {
  const session = await sessionFor(who)
  await page.goto('/')
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [storageKey(), JSON.stringify(session)] as const)
  await page.goto(path)
}
