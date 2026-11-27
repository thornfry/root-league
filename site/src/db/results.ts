import type { Db } from './client'

/** Filter by both keys even for admins, whose database policy permits broader reads. */
export async function fetchOwnResult(db: Db, gameId: string, personId: string): Promise<string[] | null> {
  const { data, error } = await db.from('submissions').select('winners').eq('game_id', gameId).eq('person_id', personId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.winners ?? null
}

export async function submitResult(db: Db, gameId: string, winners: string[]): Promise<void> {
  const { error } = await db.rpc('submit_result', { p_game_id: gameId, p_winners: winners })
  if (error) throw new Error(error.message)
}
