import type { Db } from './client'
import type { Json, Tables } from './types'

/** The Fix it areas, in the order of the stories. */
export const AREAS = [
  { id: 'people', label: 'People and roles' },
  { id: 'roster', label: 'Roster and lists' },
  { id: 'season', label: 'Season settings and dates' },
  { id: 'games', label: 'Games, seats and factions' },
  { id: 'results', label: 'Submissions and results' },
  { id: 'picks', label: 'Pick’ems' },
] as const
export type AreaId = (typeof AREAS)[number]['id']

export type FixPerson = Pick<Tables<'people'>, 'id' | 'display_name' | 'discord_id' | 'seed_key' | 'auth_user_id'>
export type FixSeat = Pick<Tables<'game_seats'>, 'game_id' | 'seat' | 'person_id' | 'faction'>
export type FixGame = Pick<Tables<'games'>, 'id' | 'game_no' | 'map_index' | 'void'> & { seats: FixSeat[] }
export type FixLogRow = Pick<Tables<'edit_log'>, 'id' | 'at' | 'actor_person_id' | 'table_name' | 'row_key' | 'action' | 'old' | 'new'>
export interface FixData {
  season: Tables<'seasons'> | null
  people: FixPerson[]
  adminDiscordIds: string[]
  roster: Tables<'roster'>[]
  games: FixGame[]
  submissions: Pick<Tables<'submissions'>, 'game_id' | 'person_id' | 'winners'>[]
  settlements: Pick<Tables<'settlements'>, 'game_id' | 'winners'>[]
  picks: Tables<'picks'>[]
  log: FixLogRow[]
}

const LOG_LIMIT = 100

export async function fetchFixit(db: Db): Promise<FixData> {
  const season = await db.from('seasons').select('*').eq('is_current', true).maybeSingle()
  if (season.error) throw new Error(season.error.message)
  const sid = season.data?.id
  const [people, whitelist, log] = await Promise.all([
    db.from('people').select('id, display_name, discord_id, seed_key, auth_user_id').order('display_name'),
    db.from('whitelist').select('discord_id, is_admin'),
    db.from('edit_log').select('id, at, actor_person_id, table_name, row_key, action, old, new').order('id', { ascending: false }).limit(LOG_LIMIT),
  ])
  for (const r of [people, whitelist, log]) if (r.error) throw new Error(r.error.message)
  const empty = { roster: [], games: [], submissions: [], settlements: [], picks: [] }
  const base = {
    season: season.data, people: people.data ?? [], log: log.data ?? [],
    adminDiscordIds: (whitelist.data ?? []).filter((w) => w.is_admin).map((w) => w.discord_id),
  }
  if (!sid) return { ...base, ...empty }
  const games = await db.from('games').select('id, game_no, map_index, void, game_seats(game_id, seat, person_id, faction)').eq('season_id', sid).order('game_no')
  if (games.error) throw new Error(games.error.message)
  const ids = (games.data ?? []).map((g) => g.id)
  const [roster, submissions, settlements, picks] = await Promise.all([
    db.from('roster').select('*').eq('season_id', sid).order('position'),
    ids.length ? db.from('submissions').select('game_id, person_id, winners').in('game_id', ids) : { data: [], error: null },
    ids.length ? db.from('settlements').select('game_id, winners').in('game_id', ids) : { data: [], error: null },
    ids.length ? db.from('picks').select('*').in('game_id', ids) : { data: [], error: null },
  ])
  for (const r of [roster, submissions, settlements, picks]) if (r.error) throw new Error(r.error.message)
  return {
    ...base,
    roster: roster.data ?? [],
    games: (games.data ?? []).map((g) => ({ ...g, seats: [...g.game_seats].sort((a, b) => a.seat - b.seat) })),
    submissions: submissions.data ?? [], settlements: settlements.data ?? [], picks: picks.data ?? [],
  }
}

// Writes ------------------------------------------------------------------------------------------

type Obj = Record<string, Json | undefined>

/** What an edit returns: the new row and the pairing rules it breaks. A warning never stops the save. */
export interface FixResult { row: Obj; old?: Obj; changed?: boolean; warnings: string[] }

async function call<T>(db: Db, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (db as unknown as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

const result = (d: Json): FixResult => {
  const o = (d ?? {}) as Obj
  return { row: (o.row ?? {}) as Obj, old: o.old as Obj | undefined, changed: o.changed as boolean | undefined, warnings: ((o.warnings ?? []) as string[]) }
}

export async function fixitUpdate(db: Db, table: string, key: Obj, changes: Obj): Promise<FixResult> {
  return result(await call<Json>(db, 'fixit_update', { p_table: table, p_key: key, p_changes: changes }))
}
export async function fixitInsert(db: Db, table: string, row: Obj): Promise<FixResult> {
  return result(await call<Json>(db, 'fixit_insert', { p_table: table, p_row: row }))
}
export interface DeletePreview { removes: Record<string, number>; blocked_by: string | null }
export async function fixitDeletePreview(db: Db, table: string, key: Obj): Promise<DeletePreview> {
  const d = await call<{ removes?: Record<string, number>; blocked_by?: string | null }>(db, 'fixit_delete_preview', { p_table: table, p_key: key })
  return { removes: d.removes ?? {}, blocked_by: d.blocked_by ?? null }
}
export async function fixitDelete(db: Db, table: string, key: Obj): Promise<string[]> {
  const d = await call<{ warnings?: string[] }>(db, 'fixit_delete', { p_table: table, p_key: key })
  return d.warnings ?? []
}
export async function fixitWarnings(db: Db, table: string, key: Obj): Promise<string[]> {
  return (await call<string[] | null>(db, 'fixit_warnings', { p_table: table, p_key: key })) ?? []
}
export async function linkPerson(db: Db, signIn: string, seeded: string): Promise<void> {
  await call(db, 'link_person', { p_sign_in_person: signIn, p_seeded_person: seeded })
}
/** With a game this replaces the person in that game only; without one it replaces them for the whole season. */
export async function replacePlayer(db: Db, seasonId: string, from: string, to: string, gameId?: string): Promise<string[]> {
  const d = await call<{ warnings?: string[] }>(db, 'replace_player', { p_season_id: seasonId, p_from: from, p_to: to, ...(gameId ? { p_game_id: gameId } : {}) })
  return d.warnings ?? []
}
export async function setVoid(db: Db, gameId: string, isVoid: boolean): Promise<void> {
  await call(db, 'void_game', { p_game_id: gameId, p_void: isVoid })
}
export async function reopenGame(db: Db, gameId: string): Promise<void> {
  await call(db, 'reopen_game', { p_game_id: gameId })
}
export async function settleGame(db: Db, gameId: string, winners: string[]): Promise<void> {
  await call(db, 'settle_game', { p_game_id: gameId, p_winners: winners })
}

// Text for the page -------------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The sentence a delete confirmation shows: what goes with the row. */
export function removesText(removes: Record<string, number>): string {
  const parts: string[] = []
  const add = (key: string, one: string, many?: string) => { if (removes[key]) parts.push(plural(removes[key], one, many)) }
  add('roster', 'roster entry', 'roster entries')
  add('seats', 'seat')
  add('games', 'game')
  add('submissions', 'submission')
  add('settlements', 'settlement')
  add('picks', 'pick')
  add('pick_mentions', 'pick by other players that names them', 'picks by other players that name them')
  if (!parts.length) return 'Nothing else goes with it.'
  return `This also deletes ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}.`
}

export interface LogLookup { person: (id: string) => string | undefined; game: (id: string) => string | undefined }

const TABLE_LABEL: Record<string, string> = {
  people: 'People', whitelist: 'Whitelist', seasons: 'Season', roster: 'Roster', games: 'Games', game_seats: 'Seats',
  submissions: 'Submissions', settlements: 'Settlements', picks: 'Pick’ems', import: 'Import',
}
const VERB: Record<string, string> = { insert: 'added', update: 'changed', delete: 'removed' }

function text(v: unknown, look: LogLookup): string {
  if (v === null || v === undefined) return 'none'
  if (Array.isArray(v)) return v.length ? v.map((x) => text(x, look)).join(', ') : 'none'
  if (typeof v === 'string') return look.person(v) ?? look.game(v) ?? v
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** A log row as plain text. An update lists only the columns that changed. */
export function describeLog(e: Pick<FixLogRow, 'table_name' | 'action' | 'old' | 'new'>, look: LogLookup) {
  const o = (e.old ?? {}) as Obj
  const n = (e.new ?? {}) as Obj
  const row = { ...o, ...n }
  const gameNo = typeof row.game_id === 'string' ? look.game(row.game_id) : e.table_name === 'games' ? `Table ${row.game_no}` : undefined
  const subject = e.table_name === 'people' ? text(row.display_name, look)
    : e.table_name === 'seasons' ? text(row.name, look)
    : e.table_name === 'whitelist' ? text(row.discord_id, look)
    : e.table_name === 'game_seats' ? `${gameNo ?? 'Game'} seat ${row.seat}`
    : e.table_name === 'roster' ? text(row.person_id, look)
    : ['submissions', 'picks', 'settlements'].includes(e.table_name)
      ? [gameNo, typeof row.person_id === 'string' ? look.person(row.person_id) : undefined].filter(Boolean).join(', ')
      : gameNo ?? ''
  const keys = e.action === 'update' ? Object.keys(n).filter((k) => JSON.stringify(n[k]) !== JSON.stringify(o[k])) : Object.keys(e.action === 'delete' ? o : n)
  const show = (src: Obj) => keys.filter((k) => !(k === 'id' || k === 'game_id')).map((k) => `${k}: ${text(src[k], look)}`).join('; ') || 'none'
  return {
    what: `${TABLE_LABEL[e.table_name] ?? e.table_name}: ${subject ? `${subject} ` : ''}${VERB[e.action] ?? e.action}`.replace(/ +/g, ' '),
    old: e.action === 'insert' ? 'none' : show(o),
    next: e.action === 'delete' ? 'none' : show(n),
  }
}
