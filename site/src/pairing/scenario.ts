// A small valid two-game scenario for tests, plus helpers to break one rule at
// a time. Not used by the site.

import { FACTIONS } from '../data/factions'
import type { PairingGame, PairingInput, PairingPlayer } from './types'

const ALL = FACTIONS.map((f) => f.code)

/** Four players whose lists hold every faction, so only the games decide a rule. */
export const PLAYERS: PairingPlayer[] = ['Ann', 'Bo', 'Cy', 'Di'].map((name) => ({
  id: name.toLowerCase(),
  name,
  list: ALL,
}))

const game = (gameNo: number, order: string[], factions: (string | null)[]): PairingGame => ({
  gameNo,
  map: gameNo - 1,
  seats: order.map((player, i) => ({ player, faction: factions[i] ?? null })),
})

/**
 * Game 1: cats, otters, WA, bats (reach 22, 1 militant and 3 insurgent).
 * Game 2: rats, badgers, knaves, lizards (reach 23, 2 and 2). Each player has a
 * new faction, a new seat and the same table, which passes every hard rule.
 */
export function validScenario(): PairingInput {
  return {
    gamesEach: 2,
    players: PLAYERS,
    games: [
      game(1, ['ann', 'bo', 'cy', 'di'], ['cats', 'otters', 'WA', 'bats']),
      game(2, ['bo', 'ann', 'di', 'cy'], ['badgers', 'rats', 'lizards', 'knaves']),
    ],
  }
}

/** The scenario with one game replaced. */
export function withGame(input: PairingInput, index: number, replacement: PairingGame): PairingInput {
  return { ...input, games: input.games.map((g, i) => (i === index ? replacement : g)) }
}

export { game }
