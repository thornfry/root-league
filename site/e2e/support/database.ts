import { readFile } from 'node:fs/promises'
import pg from 'pg'

export const SEASON_ID = '20000000-0000-4000-8000-000000000001'
export const PRIVATE_SEASON_NAME = 'E2E private season canary'

/** Local superuser only. Never point the destructive scenario helpers at a hosted project. */
export async function withDatabase<T>(action: (db: pg.Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  const url = new URL(connectionString)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== '54322' || url.pathname !== '/postgres') {
    throw new Error('E2E_DATABASE_URL must name the local Supabase postgres database on port 54322.')
  }
  const db = new pg.Client({ connectionString, connectionTimeoutMillis: 3000, statement_timeout: 4000 })
  await db.connect()
  try {
    return await action(db)
  } finally {
    await db.end()
  }
}

/** Reset application data in one transaction, preserving migrations and Auth users (no repeated signups).
 * Replication mode bypasses the append-only audit guard for this superuser fixture only.
 * Discover tables so later database commits are reset too; never change production permissions.
 */
export async function resetDatabase(): Promise<number> {
  const start = performance.now()
  const seed = await readFile(new URL('../../supabase/seed.sql', import.meta.url), 'utf8')
  await withDatabase(async (db) => {
    await db.query('begin')
    try {
      await db.query("set local session_replication_role = 'replica'")
      const { rows } = await db.query<{ name: string }>(
        "select quote_ident(schemaname) || '.' || quote_ident(tablename) as name from pg_tables where schemaname = 'public'",
      )
      if (!rows.length) throw new Error('Apply the Supabase migrations before running e2e.')
      await db.query(`truncate ${rows.map((row) => row.name).join(', ')} restart identity cascade`)
      await db.query("set local session_replication_role = 'origin'")
      await db.query(seed)
      await db.query(
        'insert into public.seasons (id, slug, name, is_current) values ($1, $2, $3, true)',
        [SEASON_ID, 'e2e-season', PRIVATE_SEASON_NAME],
      )
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    }
  })
  return performance.now() - start
}

/** SQL time controls the server stage; a browser fake clock alone cannot lock lists. */
export async function setListsLocked(locked = true, seasonId = SEASON_ID): Promise<void> {
  await withDatabase(async (db) => {
    const result = await db.query(
      "update public.seasons set lists_lock_at = now() + ($1 * interval '1 day') where id = $2",
      [locked ? -1 : 1, seasonId],
    )
    if (result.rowCount !== 1) throw new Error(`Season not found: ${seasonId}`)
  })
}
