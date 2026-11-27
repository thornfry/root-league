// Shared shapes for the pairing code. Factions are always the short codes from
// league/factions.md ("cats", "WA"), never names.

/** A player with their ranked list, best first, as faction codes. */
export interface PairingPlayer {
  id: string
  name: string
  list: readonly string[]
}

/** One seat at a table. `faction` is null until the faction step fills it in. */
export interface PairingSeat {
  player: string
  faction: string | null
}

/**
 * One game. `seats[0]` is seat 1, first in turn order. `map` is an index into
 * the season's maps, as in the layout.
 */
export interface PairingGame {
  gameNo: number
  map: number
  seats: readonly PairingSeat[]
}

/** A layout with players and factions placed on it: what the checker looks at. */
export interface PairingInput {
  gamesEach: number
  players: readonly PairingPlayer[]
  games: readonly PairingGame[]
}

/**
 * The rule that a violation or a report line is about. The number rules come
 * from league/pairing-rules.md; the three without a number are structure the
 * layout itself guarantees (and Fix it can break).
 */
export type RuleId =
  | 'players'
  | 'games-each'
  | 'seat'
  | 'faction'
  | 'own-list'
  | 'no-repeat'
  | 'reach'
  | 'mix'
  | 'one-faction'

/** One broken hard rule, with the tables and players it names. */
export interface Violation {
  rule: RuleId
  message: string
  /** The game it is about, when it is about one table. */
  gameNo?: number
  /** Ids of the players it blames, in the order they appear. */
  players: string[]
}
