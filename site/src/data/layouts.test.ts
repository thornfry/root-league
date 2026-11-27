import { describe, expect, it } from 'vitest'
import {
  ALL_LAYOUTS,
  CAPACITIES,
  MAX_MAPS,
  TEN_WITH_THREE_REASON,
  VALID_GAMES_EACH,
  getLayout,
  invalidPairReason,
  isValidPair,
  layoutKey,
  validMapCounts,
  type Layout,
} from './valid-pairs'

const TABLE = 4

/** Fewest repeat map plays any layout can have: a map used by k games has 4k seats for n players. */
function repeatLowerBound(n: number, g: number, maps: number): number {
  const total = (n * g) / TABLE
  let bound = 0
  for (let i = 0; i < maps; i++) {
    const k = Math.floor(total / maps) + (i < total % maps ? 1 : 0)
    bound += Math.max(0, TABLE * k - n)
  }
  return bound
}

function meetings(layout: Layout): number[] {
  const n = layout.players
  const m = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (const game of layout.games) {
    for (const a of game.slots) {
      for (const b of game.slots) {
        if (a < b) m[a]![b]! += 1
      }
    }
  }
  const counts: number[] = []
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) counts.push(m[a]![b]!)
  return counts
}

function mapRepeats(layout: Layout): number {
  let repeats = 0
  for (let p = 0; p < layout.players; p++) {
    const seen = new Array<number>(layout.maps).fill(0)
    for (const game of layout.games) if (game.slots.includes(p)) seen[game.map]! += 1
    repeats += seen.reduce((sum, k) => sum + Math.max(0, k - 1), 0)
  }
  return repeats
}

/**
 * Sizes where the layout does not reach the Python tool's lower bound for map
 * repeats, with the pinned repeat count. Anything not listed must equal the
 * bound. Reason, the same for every entry: the tool's search puts the meeting
 * spread and the pair rules ahead of map repeats, and the best plan it found
 * within the spread limit has this many repeats. Fewer repeats appeared in
 * trial runs only at a spread above the limit (12 players, 3 games, 6 maps
 * reaches 0 repeats at spread 2 and 3 repeats at spread 1). The bound itself
 * counts only seat shortage, so it is not always reachable together with the
 * spread. Regenerating with a different tool or seeds changes this list.
 */
const ABOVE_BOUND_REASON =
  'meeting spread is held within its limit first; fewer repeats only came with a larger spread'
const ABOVE_BOUND: Record<string, number> = {
  '8-2-2': 2,
  '8-2-3': 1,
  '8-3-3': 3,
  '8-3-4': 2,
  '8-3-5': 1,
  '8-4-4': 4,
  '8-4-5': 3,
  '8-4-6': 2,
  '10-2-2': 4,
  '10-2-3': 2,
  '10-2-4': 1,
  '10-4-4': 7,
  '10-4-5': 5,
  '10-4-6': 4,
  '12-2-2': 4,
  '12-3-3': 6,
  '12-3-4': 5,
  '12-3-5': 4,
  '12-3-6': 3,
  '12-4-4': 9,
  '12-4-5': 7,
  '12-4-6': 6,
}

/**
 * Meeting-spread limit by size: 1, except 8 players with 2 or 3 games (see
 * SPREAD_LIMIT in scripts/gen-layouts.py). 8 with 3 games has 36 meetings over
 * 28 pairs. 8 with 2 games cannot reach 1 at all: each player sits in 2 of 4
 * tables, so players are edges joining table pairs, and 8 players on the 6
 * table pairs force two pairs of tables to share two players.
 */
function spreadLimit(n: number, g: number): number {
  return n === 8 && (g === 2 || g === 3) ? 2 : 1
}

/** Pairs that may meet in every game of a player: none, except 8 with 2 games (2, proved above). */
function alwaysMeetLimit(n: number, g: number): number {
  return n === 8 && g === 2 ? 2 : 0
}

const expectedKeys: string[] = []
for (const capacity of CAPACITIES) {
  for (const g of VALID_GAMES_EACH[capacity]) {
    for (let m = g; m <= MAX_MAPS; m++) expectedKeys.push(layoutKey(capacity, g, m))
  }
}

describe('layout set', () => {
  it('has exactly one layout for each valid pair and map count', () => {
    expect(Object.keys(ALL_LAYOUTS).sort()).toEqual([...expectedKeys].sort())
    expect(expectedKeys).toHaveLength(32)
  })

  it('has no layout for 10 players with 3 games and explains why', () => {
    for (let m = 3; m <= MAX_MAPS; m++) expect(ALL_LAYOUTS[layoutKey(10, 3, m)]).toBeUndefined()
    expect(isValidPair(10, 3)).toBe(false)
    expect(getLayout(10, 3, 4)).toBeNull()
    expect(invalidPairReason(10, 3)).toBe(TEN_WITH_THREE_REASON)
    expect(TEN_WITH_THREE_REASON).toMatch(/30 seats/)
  })

  it('offers games each up to 6 maps and no fewer', () => {
    expect(validMapCounts(2)).toEqual([2, 3, 4, 5, 6])
    expect(validMapCounts(4)).toEqual([4, 5, 6])
    expect(getLayout(12, 4, 3)).toBeNull()
    expect(getLayout(12, 4, 7)).toBeNull()
    expect(getLayout(12, 4, 6)).not.toBeNull()
  })

  it('accepts only the eight valid pairs', () => {
    const valid: [number, number][] = []
    for (const n of [6, 8, 10, 12, 14]) {
      for (let g = 1; g <= 6; g++) if (isValidPair(n, g)) valid.push([n, g])
    }
    expect(valid).toEqual([
      [8, 2], [8, 3], [8, 4], [10, 2], [10, 4], [12, 2], [12, 3], [12, 4],
    ])
    expect(invalidPairReason(8, 2)).toBeNull()
    expect(invalidPairReason(9, 2)).toMatch(/Capacity/)
    expect(invalidPairReason(12, 5)).toMatch(/2, 3, 4/)
  })
})

describe.each(Object.entries(ALL_LAYOUTS))('layout %s', (key, layout) => {
  const n = layout.players
  const g = layout.gamesEach

  it('is keyed by its own size and has the right number of games', () => {
    expect(key).toBe(layoutKey(n, g, layout.maps))
    expect(layout.games).toHaveLength((n * g) / TABLE)
  })

  it('seats 4 distinct slots in every game, all inside the roster', () => {
    for (const game of layout.games) {
      expect(game.slots).toHaveLength(TABLE)
      expect(new Set(game.slots).size).toBe(TABLE)
      for (const s of game.slots) {
        expect(Number.isInteger(s)).toBe(true)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThan(n)
      }
      expect(Number.isInteger(game.map)).toBe(true)
      expect(game.map).toBeGreaterThanOrEqual(0)
      expect(game.map).toBeLessThan(layout.maps)
    }
  })

  it('has every slot play games-each games', () => {
    const played = new Array<number>(n).fill(0)
    for (const game of layout.games) for (const s of game.slots) played[s]! += 1
    expect(played).toEqual(new Array<number>(n).fill(g))
  })

  it('keeps the meeting spread within its limit and stores the recomputed figures', () => {
    const counts = meetings(layout)
    const spread = Math.max(...counts) - Math.min(...counts)
    expect(spread).toBeLessThanOrEqual(spreadLimit(n, g))
    expect(layout.stats.meetingSpread).toBe(spread)
    expect(layout.stats.mostMeetings).toBe(Math.max(...counts))
    expect(layout.stats.fewestMeetings).toBe(Math.min(...counts))
  })

  it('has no pair meet in every game of a player, bar the proved 8-with-2 case', () => {
    const always = meetings(layout).filter((c) => c >= g).length
    expect(always).toBeLessThanOrEqual(alwaysMeetLimit(n, g))
  })

  it('gives each slot a different seat in each of its games', () => {
    for (let p = 0; p < n; p++) {
      const seats = layout.games
        .filter((game) => game.slots.includes(p))
        .map((game) => game.slots.indexOf(p))
      expect(new Set(seats).size).toBe(seats.length)
    }
  })

  it('stores the recomputed map repeats and meets the lower bound', () => {
    const repeats = mapRepeats(layout)
    const bound = repeatLowerBound(n, g, layout.maps)
    expect(layout.stats.mapRepeats).toBe(repeats)
    expect(layout.stats.mapRepeatsLowerBound).toBe(bound)
    expect(repeats).toBeGreaterThanOrEqual(bound)
    const pinned = ABOVE_BOUND[key]
    if (pinned !== undefined) {
      expect(repeats).toBe(pinned)
      expect(repeats).toBeGreaterThan(bound)
    } else {
      expect(repeats).toBe(bound)
    }
  })
})

describe('ABOVE_BOUND', () => {
  it('names only layouts that exist and gives the reason', () => {
    for (const key of Object.keys(ABOVE_BOUND)) expect(ALL_LAYOUTS[key]).toBeDefined()
    expect(ABOVE_BOUND_REASON.length).toBeGreaterThan(0)
  })
})
