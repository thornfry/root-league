import { queryOptions } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Db } from './client'
import type { Database, Tables } from './types'

export type GameState = 'upcoming' | 'recorded' | 'disputed' | 'settled' | 'void'
export type Outcome = { game_id: string; season_id: string; state: GameState; winners: string[] | null }
// D4 adds this view in parallel with U9. Keep its read contract local until generated types include it.
type GamesDatabase = Omit<Database, 'public'> & { public: Omit<Database['public'], 'Views'> & {
  Views: Database['public']['Views'] & { game_outcome: { Row: Outcome; Relationships: [] } }
} }
export type GameSeat = Tables<'game_seats'> & { name: string }
export interface LeagueGame extends Tables<'games'> { seats: GameSeat[]; state: GameState; winners: string[]; mapName: string }
export interface PairingsData { season: Tables<'seasons'> | null; stage: string | null; games: LeagueGame[] }
export type GameFilter = 'Mine' | 'All' | 'Completed' | 'Upcoming'
export function filterGames(games: LeagueGame[], filter: GameFilter, personId: string | null): LeagueGame[] {
  return games.filter(g => filter === 'All' || (filter === 'Mine' ? g.seats.some(s => s.person_id === personId)
    : filter === 'Completed' ? ['recorded', 'settled'].includes(g.state) : ['upcoming', 'disputed'].includes(g.state)))
}

export async function fetchPairings(db: Db): Promise<PairingsData> {
  const seasonResult = await db.from('seasons').select('*').eq('is_current', true).maybeSingle()
  if (seasonResult.error) throw new Error(seasonResult.error.message)
  const season = seasonResult.data
  if (!season) return { season: null, stage: null, games: [] }
  const stageResult = await db.from('season_stage').select('stage').eq('season_id', season.id).single()
  if (stageResult.error) throw new Error(stageResult.error.message)
  const stage = stageResult.data.stage
  // No people, roster, seats or result queries before publication, even for an admin.
  if (stage !== 'live') return { season, stage, games: [] }
  const [games, outcomes] = await Promise.all([
    db.from('games').select('*, game_seats(*, people(display_name))').eq('season_id', season.id).order('game_no'),
    (db as unknown as SupabaseClient<GamesDatabase>).from('game_outcome').select('*').eq('season_id', season.id),
  ])
  if (games.error) throw new Error(games.error.message)
  // D3 alone has no results yet. All other errors must remain visible.
  if (outcomes.error && !['42P01', 'PGRST205'].includes(outcomes.error.code)) throw new Error(outcomes.error.message)
  return { season, stage, games: games.data.map(g => {
    const outcome = outcomes.data?.find(o => o.game_id === g.id)
    const state = g.void ? 'void' : outcome?.state ?? 'upcoming'
    return { ...g, mapName: season.maps?.[g.map_index] ?? 'Map not set', state,
      winners: ['recorded', 'settled'].includes(state) ? outcome?.winners ?? [] : [],
      seats: g.game_seats.map(s => ({ ...s, name: s.people.display_name })).sort((a, b) => a.seat - b.seat) }
  }) }
}
export const pairingsQuery = (db: Db) => queryOptions({ queryKey: ['pairings'], queryFn: () => fetchPairings(db), staleTime: 0 })

export interface GameHistory { id: number; at: string; actor: string; text: string }
export async function fetchGameHistory(db: Db, gameId: string): Promise<GameHistory[]> {
  const { data, error } = await db.from('edit_log').select('id, at, actor_person_id, table_name, action')
    .or(`row_key.eq.${gameId},new->>game_id.eq.${gameId},old->>game_id.eq.${gameId}`)
    .order('at', { ascending: false }).order('id', { ascending: false })
  if (error) throw new Error(error.message)
  const ids = [...new Set(data.flatMap(r => r.actor_person_id ? [r.actor_person_id] : []))]
  const people = ids.length ? await db.from('people').select('id, display_name').in('id', ids) : { data: [], error: null }
  if (people.error) throw new Error(people.error.message)
  // Describe events without exposing any player's submitted answer, including to admins on this page.
  return data.map(r => ({ id: r.id, at: r.at,
    actor: people.data?.find(p => p.id === r.actor_person_id)?.display_name ?? 'System',
    text: `${r.table_name === 'submissions' ? 'Result submission' : r.table_name === 'settlements' ? 'Admin settlement' : r.table_name === 'game_seats' ? 'Seat' : 'Game'} ${r.action === 'INSERT' ? 'added' : r.action === 'DELETE' ? 'removed' : 'updated'}.`,
  }))
}
