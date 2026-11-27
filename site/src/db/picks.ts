import type { Db } from './client'
import type { Tables } from './types'

export type ScoredPick = Tables<'picks'> & { name: string; points: number; first_points: number; second_points: number }
export async function fetchPicks(db: Db, gameIds: string[], personId?: string): Promise<ScoredPick[]> {
  if (!gameIds.length) return []
  let query = db.from('picks').select('*, people!picks_person_id_fkey(display_name)').in('game_id', gameIds)
  let scores = db.from('pickem_scores').select('*').in('game_id', gameIds)
  if (personId) { query = query.eq('person_id', personId); scores = scores.eq('person_id', personId) }
  const [p, s] = await Promise.all([query, scores])
  if (p.error) throw new Error(p.error.message)
  if (s.error) throw new Error(s.error.message)
  return p.data.map(pick => {
    const score = s.data.find(row => row.game_id === pick.game_id && row.person_id === pick.person_id)
    return { ...pick, name: pick.people.display_name, points: score?.points ?? 0, first_points: score?.first_points ?? 0, second_points: score?.second_points ?? 0 }
  })
}
export async function fetchLeaderboard(db: Db, seasonId: string) {
  const { data, error } = await db.from('leaderboard').select('*').eq('season_id', seasonId).order('rank').order('display_name')
  if (error) throw new Error(error.message)
  return data
}
export async function savePick(db: Db, gameId: string, first: string, second: string | null) {
  const { error } = await db.rpc('save_pick', { p_game_id: gameId, p_first: first, p_second: second as string /* Supabase generated optional args omit SQL null; null clears an existing second pick. */ })
  if (error) throw new Error(error.message)
}

export async function clearPick(db: Db, gameId: string) {
  const { error } = await db.rpc('clear_pick', { p_game_id: gameId })
  if (error) throw new Error(error.message)
}
