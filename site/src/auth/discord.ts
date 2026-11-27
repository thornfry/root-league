import type { Db } from '../db/client'

/** Real sign-in: Discord asks for identity only (decision 25). It returns to the page the person was on. */
export async function signInWithDiscord(db: Db): Promise<string | null> {
  const { error } = await db.auth.signInWithOAuth({
    provider: 'discord',
    options: { scopes: 'identify', redirectTo: window.location.href },
  })
  return error ? error.message : null
}
