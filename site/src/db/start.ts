import { getSupabase } from './client'
import type { Tables, Json } from './types'
import type { AssignedDraft } from '../pairing/assign'
import { getLayout } from '../data/valid-pairs'

export async function loadStart() {
  const db = getSupabase()
  const season = await db.from('seasons').select('*').eq('is_current', true).maybeSingle()
  if (season.error) throw new Error(season.error.message)
  if (!season.data) return null
  const [stage, roster] = await Promise.all([
    db.from('season_stage').select('stage').eq('season_id', season.data.id).single(),
    db.from('roster_public').select('*').eq('season_id', season.data.id).eq('list', 'league').order('position'),
  ])
  if (stage.error) throw new Error(stage.error.message)
  if (roster.error) throw new Error(roster.error.message)
  return { season: season.data, stage: stage.data.stage, roster: roster.data }
}
export type StartData = NonNullable<Awaited<ReturnType<typeof loadStart>>>
export function startChecks({ season: s, stage, roster }: StartData) {
  const settings = !!(s.capacity && s.games_each && s.maps && getLayout(s.capacity, s.games_each, s.maps.length) && s.faction_pool?.length && s.min_list_length)
  const invalid = roster.filter(r => !r.list_in || r.list_flagged || !r.ranked_factions || r.ranked_factions.length < Math.max(s.min_list_length ?? 1, s.games_each ?? 1) || new Set(r.ranked_factions).size !== r.ranked_factions.length || r.ranked_factions.some(f => !s.faction_pool?.includes(f)))
  return [
    { ok: settings, text: settings ? 'Season settings complete.' : 'Complete the season settings.', link: '/admin/season' },
    { ok: stage === 'locked', text: stage === 'locked' ? 'Lists are locked.' : 'Lists must be locked before starting.', link: '/admin/season' },
    { ok: roster.length === s.capacity, text: `League list: ${roster.length} of ${s.capacity ?? 'unset'} players.`, link: '/admin/roster' },
    { ok: !invalid.length, text: invalid.length ? `Lists need attention: ${invalid.map(r => r.display_name).join(', ')}.` : 'Every league player has a valid submitted list.', link: '/admin/fixit' },
  ]
}
export async function publishDraft(season: Tables<'seasons'>, draft: AssignedDraft) {
  const { error } = await getSupabase().rpc('publish_pairings', {
    p_season_id: season.id, p_seed: draft.seed, p_order: draft.players.map(p => p.id),
    p_games: draft.games as unknown as Json,
  })
  if (error) throw new Error(error.message)
}
