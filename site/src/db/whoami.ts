import { queryOptions } from '@tanstack/react-query'
import type { Db } from './client'
import type { Json } from './types'

/** What `public.whoami()` says about the caller. Roles are derived in the database (decision 43). */
export interface Whoami {
  signedIn: boolean
  /** Null when signed out. */
  discordId: string | null
  /** The Discord name from the sign-in, or the ID when the account has none. */
  discordName: string | null
  whitelisted: boolean
  isAdmin: boolean
  personId: string | null
  displayName: string | null
  roles: string[]
}

export const SIGNED_OUT: Whoami = {
  signedIn: false,
  discordId: null,
  discordName: null,
  whitelisted: false,
  isAdmin: false,
  personId: null,
  displayName: null,
  roles: [],
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** Turn the function's JSON into a typed value. Anything missing reads as the safest answer. */
export function parseWhoami(json: Json | null): Whoami {
  const o = json && typeof json === 'object' && !Array.isArray(json) ? json : {}
  return {
    signedIn: o.signed_in === true,
    discordId: str(o.discord_id),
    discordName: str(o.discord_name),
    whitelisted: o.whitelisted === true,
    isAdmin: o.whitelisted === true && o.is_admin === true,
    personId: str(o.person_id),
    displayName: str(o.display_name),
    roles: Array.isArray(o.roles) ? o.roles.filter((r): r is string => typeof r === 'string') : [],
  }
}

export async function fetchWhoami(db: Db): Promise<Whoami> {
  const { data, error } = await db.rpc('whoami')
  if (error) throw new Error(error.message)
  return parseWhoami(data)
}

/** Links or creates the caller's person row. Allowed for whitelisted callers only; calling it again changes nothing. */
export async function ensurePerson(db: Db): Promise<void> {
  const { error } = await db.rpc('ensure_person')
  if (error) throw new Error(error.message)
}

/**
 * Who am I, with the person row linked on the way. The whitelist is checked in the database on every call, so
 * refetching this is how an added or removed entry takes effect without signing in again.
 */
export function whoamiQuery(db: Db, userId: string) {
  return queryOptions({
    queryKey: ['whoami', userId],
    queryFn: async () => {
      let me = await fetchWhoami(db)
      if (me.whitelisted && !me.personId) {
        await ensurePerson(db)
        me = await fetchWhoami(db)
      }
      return me
    },
  })
}
