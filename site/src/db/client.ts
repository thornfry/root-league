import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

export type Db = SupabaseClient<Database>

/** The only place the project URL and the public (anon) key are read. Neither is a secret. */
function readConfig(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && anonKey ? { url, anonKey } : null
}

/** False when the two public variables are missing, so the app can say so instead of crashing. */
export function isConfigured(): boolean {
  return readConfig() !== null
}

let client: Db | null = null

/** The one Supabase client, made on first use. Throws if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing. */
export function getSupabase(): Db {
  if (client) return client
  const config = readConfig()
  if (!config) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see site/.env.example).')
  // PKCE keeps the OAuth code out of the address bar history as a token.
  client = createClient<Database>(config.url, config.anonKey, { auth: { flowType: 'pkce' } })
  return client
}
