import { queryOptions } from '@tanstack/react-query'
import type { Db } from './client'

/** D4 owns counting, exclusion of disputed/void results, and shared ranks. */
export async function fetchStandings(db: Db, seasonId: string) {
  const { data, error } = await db.from('standings').select('*').eq('season_id', seasonId)
    .order('rank').order('display_name').order('person_id')
  if (error) throw new Error(error.message)
  return data
}

export const standingsQuery = (db: Db, seasonId: string) => queryOptions({
  queryKey: ['standings', seasonId], queryFn: () => fetchStandings(db, seasonId), staleTime: 0,
})
