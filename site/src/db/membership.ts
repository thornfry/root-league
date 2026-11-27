import { useQuery } from '@tanstack/react-query'
import { getSupabase } from './client'

/** Only the caller's public roster fields; placement is never requested, even for admins. */
export async function readMembership() {
  const db = getSupabase()
  const season = await db.from('seasons').select('id, name, lists_lock_at').eq('is_current', true).maybeSingle()
  if (season.error) throw new Error(season.error.message)
  if (!season.data) return null
  const [stage, member] = await Promise.all([
    db.from('season_stage').select('stage').eq('season_id', season.data.id).single(),
    db.from('roster_public').select('person_id, list_in, list_flagged, ranked_factions').eq('season_id', season.data.id).eq('is_me', true).maybeSingle(),
  ])
  if (stage.error) throw new Error(stage.error.message)
  if (member.error) throw new Error(member.error.message)
  if (!['open', 'locked', 'live'].includes(stage.data.stage ?? '')) throw new Error('Season stage is unavailable.')
  return { season: season.data, stage: stage.data.stage as 'open' | 'locked' | 'live', member: member.data }
}

export type Membership = NonNullable<Awaited<ReturnType<typeof readMembership>>>
export const MEMBERSHIP_KEY = ['membership'] as const

export function useMembership(personId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...MEMBERSHIP_KEY, personId],
    queryFn: readMembership,
    enabled: enabled && personId !== null,
    staleTime: 0,
    refetchInterval: 30_000,
  })
}

export async function joinLeague(seasonId: string) {
  const { error } = await getSupabase().rpc('join_league', { p_season_id: seasonId })
  if (error) throw new Error(error.message)
}

export async function leaveLeague(seasonId: string) {
  const { error } = await getSupabase().rpc('leave_league', { p_season_id: seasonId })
  if (error) throw new Error(error.message)
}
