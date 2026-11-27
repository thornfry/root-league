// The hard pairing rules, one predicate each. They mirror league/pairing-rules.md
// (the numbers below are that page's numbers); rules.test.ts reads the page and
// fails if a title here no longer matches. Rules 3 and 5 (even meetings, a new
// map each game) belong to the fixed layout and are only reported, never
// checked here.
//
// The militant and insurgent mix, including "never Vagabond with Knaves", is
// MIX_CONSTRAINT below and nowhere else: change it there and only there.

import { factionByCode } from '../data/factions'
import type { RuleId } from './types'

/** Seats at a table. */
export const TABLE_SIZE = 4

/** Rule 6: least table reach, the Law of Root's recommended sum for 4 players (5.2.1). */
export const MIN_REACH = 21

/** What each rule is called, for messages and reports. `number` is the page's rule number. */
export const RULES: Readonly<Record<RuleId, { number: number | null; title: string }>> = {
  'own-list': { number: 1, title: "Factions only from the player's own list" },
  'no-repeat': { number: 2, title: 'No repeats, high picks' },
  seat: { number: 4, title: 'Different seat every game' },
  reach: { number: 6, title: 'Table reach at least 21' },
  mix: { number: 7, title: 'Militant and insurgent mix' },
  'one-faction': { number: 8, title: 'One of each faction and one board per table' },
  players: { number: null, title: 'Four different players at every table' },
  'games-each': { number: null, title: 'Every player plays the same number of games' },
  faction: { number: null, title: 'Every seat has a known faction' },
}

/** Rule 1: the faction is somewhere on the player's list. */
export function isOnList(list: readonly string[], faction: string): boolean {
  return list.includes(faction)
}

/** The 1-based place of a faction on a list, or null when it is not on it. */
export function rankOnList(list: readonly string[], faction: string): number | null {
  const i = list.indexOf(faction)
  return i < 0 ? null : i + 1
}

/** Rule 2 (the hard part): factions that appear more than once in one player's games. */
export function repeatedFactions(factions: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const f of factions) {
    if (seen.has(f)) repeated.add(f)
    seen.add(f)
  }
  return [...repeated]
}

/** Rule 8: factions that sit twice at one table. */
export function duplicateFactions(table: readonly string[]): string[] {
  return repeatedFactions(table)
}

/** Rule 6: the sum of the table's reach. Unknown codes count as 0. */
export function tableReach(table: readonly string[]): number {
  return table.reduce((sum, code) => sum + (factionByCode(code)?.reach ?? 0), 0)
}

/** Rule 6: a message when the table is under the minimum, else null. */
export function reachViolation(table: readonly string[]): string | null {
  const reach = tableReach(table)
  return reach < MIN_REACH ? `table reach is ${reach}, below the minimum of ${MIN_REACH}` : null
}

/**
 * Rule 7, the one named mix constraint: a full table has at least one militant
 * and at least one insurgent faction, and Vagabond and Knaves are never both
 * at it. `violation` returns the reason or null. A table with fewer than
 * TABLE_SIZE factions can still be completed, so only the never-together pair
 * can fail it.
 */
export const MIX_CONSTRAINT = {
  id: 'mix' as const,
  name: 'Militant and insurgent mix',
  neverTogether: ['vagabond', 'knaves'] as const,
  violation(table: readonly string[]): string | null {
    const [first, second] = MIX_CONSTRAINT.neverTogether
    if (table.includes(first) && table.includes(second)) {
      return `${factionByCode(first)?.name ?? first} and ${factionByCode(second)?.name ?? second} are at the same table`
    }
    if (table.length < TABLE_SIZE) return null
    const types = table.map((code) => factionByCode(code)?.type)
    if (!types.includes('Militant')) return 'no militant faction at the table'
    if (!types.includes('Insurgent')) return 'no insurgent faction at the table'
    return null
  },
}
