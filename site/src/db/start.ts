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
/** Why a league player's list blocks the start, in plain words, or null when it is fine. */
export function listBlocker(r: StartData['roster'][number], pool: string[], need: number): string | null {
  const codes = r.ranked_factions ?? []
  if (r.list_flagged) return 'A faction on the list left the season pool. Open the list and save it again.'
  if (new Set(codes).size !== codes.length) return 'The list has a faction twice.'
  const outside = codes.filter(f => !pool.includes(f))
  if (outside.length) return `The list has factions outside the season pool: ${outside.join(', ')}.`
  if (codes.length < need) return `${codes.length} of at least ${need} factions picked.`
  if (!r.list_in) return `${codes.length} factions picked, but the list is not marked Ready. Open it and save it.`
  return null
}

export function startChecks({ season: s, stage, roster }: StartData) {
  const settings = !!(s.capacity && s.games_each && s.maps && getLayout(s.capacity, s.games_each, s.maps.length) && s.faction_pool?.length && s.min_list_length)
  const need = Math.max(s.min_list_length ?? 1, s.games_each ?? 1)
  const problems = roster.flatMap(r => {
    const reason = listBlocker(r, s.faction_pool ?? [], need)
    return reason ? [{ personId: r.person_id, name: r.display_name, reason, link: `/my-list?player=${r.person_id}` }] : []
  })
  return [
    { ok: settings, text: settings ? 'Season settings complete.' : 'Complete the season settings.', link: '/admin/season' },
    { ok: stage === 'locked', text: stage === 'locked' ? 'Lists are locked.' : 'Lists must be locked before starting.', link: '/admin/season' },
    { ok: roster.length === s.capacity, text: `League list: ${roster.length} of ${s.capacity ?? 'unset'} players.`, link: '/admin/roster' },
    { ok: !problems.length, text: problems.length ? `Lists need attention: ${problems.map(p => p.name).join(', ')}.` : 'Every league player has a Ready list.', link: '/admin/roster', problems },
  ]
}
export async function publishDraft(season: Tables<'seasons'>, draft: AssignedDraft) {
  const { error } = await getSupabase().rpc('publish_pairings', {
    p_season_id: season.id, p_seed: draft.seed, p_order: draft.players.map(p => p.id),
    p_games: draft.games as unknown as Json,
  })
  if (error) throw new Error(error.message)
}
