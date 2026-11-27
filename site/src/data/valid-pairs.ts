import layoutData from './layouts.json'

/** Player counts a season can have. */
export const CAPACITIES = [8, 10, 12] as const
export type Capacity = (typeof CAPACITIES)[number]

/** Most maps a season can use; a layout exists for each count up to this. */
export const MAX_MAPS = 6

/** Valid games-each values for each capacity. Mirrors PAIRS in scripts/gen-layouts.py. */
export const VALID_GAMES_EACH: Record<Capacity, readonly number[]> = {
  8: [2, 3, 4],
  10: [2, 4],
  12: [2, 3, 4],
}

/**
 * Why 10 players with 3 games is not offered: that is 30 seats, and a table
 * has 4, so the games do not fill whole tables (30 / 4 is not a whole number).
 * Every offered pair has players x games divisible by 4.
 */
export const TEN_WITH_THREE_REASON =
  '10 players with 3 games each is 30 seats, which does not fill 4-seat tables.'

export function isCapacity(n: number): n is Capacity {
  return (CAPACITIES as readonly number[]).includes(n)
}

/** True when the pair is one the site offers. */
export function isValidPair(capacity: number, gamesEach: number): boolean {
  return isCapacity(capacity) && VALID_GAMES_EACH[capacity].includes(gamesEach)
}

/** Why a pair is not valid, or null when it is valid. */
export function invalidPairReason(capacity: number, gamesEach: number): string | null {
  if (isValidPair(capacity, gamesEach)) return null
  if (!isCapacity(capacity)) return `Capacity must be one of ${CAPACITIES.join(', ')}.`
  if (capacity === 10 && gamesEach === 3) return TEN_WITH_THREE_REASON
  return `${capacity} players can play ${VALID_GAMES_EACH[capacity].join(', ')} games each.`
}

/** Map counts a season can use with this games-each: games each up to MAX_MAPS. */
export function validMapCounts(gamesEach: number): number[] {
  const counts: number[] = []
  for (let m = gamesEach; m <= MAX_MAPS; m++) counts.push(m)
  return counts
}

/**
 * A precomputed layout. Slots are player slots numbered from 0; player numbers
 * are dealt onto slots later. In each game `slots[i]` is the slot in seat i+1,
 * and seats run in turn order. `map` is an index from 0 to `maps - 1`.
 */
export interface LayoutGame {
  map: number
  slots: [number, number, number, number]
}

export interface LayoutStats {
  /** Most meetings of any pair minus fewest. */
  meetingSpread: number
  mostMeetings: number
  fewestMeetings: number
  /** Times, summed over players, that a player plays a map they have already played. */
  mapRepeats: number
  /** Fewest repeats any layout of this size can have (the Python tool's min_map_repeats). */
  mapRepeatsLowerBound: number
}

export interface Layout {
  players: number
  gamesEach: number
  maps: number
  stats: LayoutStats
  games: LayoutGame[]
}

const layouts = layoutData as unknown as Record<string, Layout>

export function layoutKey(players: number, gamesEach: number, maps: number): string {
  return `${players}-${gamesEach}-${maps}`
}

/** Every layout, keyed `players-gamesEach-maps`. */
export const ALL_LAYOUTS: Readonly<Record<string, Layout>> = layouts

/** The layout for a setup, or null when the pair or map count is not offered. */
export function getLayout(players: number, gamesEach: number, maps: number): Layout | null {
  if (!isValidPair(players, gamesEach)) return null
  return layouts[layoutKey(players, gamesEach, maps)] ?? null
}
