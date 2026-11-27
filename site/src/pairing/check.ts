// The full hard-rule check: a layout with players and factions placed on it
// goes in, every broken rule comes out. An empty result means the pairings
// pass. Rules 3 and 5 (meetings, maps) are the layout's and appear in the
// report, not here. Everything is returned, never thrown, so Fix it can show
// each warning and still let the admin save.

import { factionByCode } from '../data/factions'
import {
  MIX_CONSTRAINT,
  RULES,
  TABLE_SIZE,
  duplicateFactions,
  isOnList,
  reachViolation,
  repeatedFactions,
} from './rules'
import type { PairingGame, PairingInput, PairingPlayer, Violation } from './types'

/** The faction codes at a table that have a known faction, in seat order. */
function knownFactions(game: PairingGame): string[] {
  return game.seats.flatMap((s) => (s.faction !== null && factionByCode(s.faction) ? [s.faction] : []))
}

export function checkPairing(input: PairingInput): Violation[] {
  const violations: Violation[] = []
  const byId = new Map<string, PairingPlayer>(input.players.map((p) => [p.id, p]))
  const nameOf = (id: string) => byId.get(id)?.name ?? id
  const add = (v: Violation) => violations.push(v)

  // Seats and factions each player has, across their games, in game order.
  const seatsOf = new Map<string, { gameNo: number; seat: number }[]>()
  const factionsOf = new Map<string, { gameNo: number; faction: string }[]>()

  for (const game of input.games) {
    const gameNo = game.gameNo
    const ids = game.seats.map((s) => s.player)

    // Four different players, all known.
    if (game.seats.length !== TABLE_SIZE) {
      add({
        rule: 'players',
        gameNo,
        players: [],
        message: `game ${gameNo} has ${game.seats.length} seats, not ${TABLE_SIZE}`,
      })
    }
    const dupPlayers = ids.filter((id, i) => ids.indexOf(id) !== i)
    for (const id of new Set(dupPlayers)) {
      add({
        rule: 'players',
        gameNo,
        players: [id],
        message: `game ${gameNo}: ${nameOf(id)} sits at the table more than once`,
      })
    }
    for (const id of new Set(ids)) {
      if (!byId.has(id)) {
        add({ rule: 'players', gameNo, players: [id], message: `game ${gameNo}: ${id} is not in the league` })
      }
    }

    game.seats.forEach((seat, i) => {
      const seats = seatsOf.get(seat.player) ?? []
      seats.push({ gameNo, seat: i + 1 })
      seatsOf.set(seat.player, seats)
    })

    // Each seat has a faction the league knows.
    game.seats.forEach((seat, i) => {
      if (seat.faction === null) {
        add({
          rule: 'faction',
          gameNo,
          players: [seat.player],
          message: `game ${gameNo}, seat ${i + 1}: no faction for ${nameOf(seat.player)}`,
        })
      } else if (!factionByCode(seat.faction)) {
        add({
          rule: 'faction',
          gameNo,
          players: [seat.player],
          message: `game ${gameNo}, seat ${i + 1}: "${seat.faction}" is not a league faction`,
        })
      }
    })

    // Rule 1: own list only.
    for (const seat of game.seats) {
      const player = byId.get(seat.player)
      if (!player || seat.faction === null || !factionByCode(seat.faction)) continue
      const list = factionsOf.get(seat.player) ?? []
      list.push({ gameNo, faction: seat.faction })
      factionsOf.set(seat.player, list)
      if (!isOnList(player.list, seat.faction)) {
        add({
          rule: 'own-list',
          gameNo,
          players: [seat.player],
          message: `game ${gameNo}: ${player.name} has ${factionByCode(seat.faction)?.name ?? seat.faction}, which is not on their list`,
        })
      }
    }

    // Rules 8, 6 and 7 look at the table's factions.
    const table = knownFactions(game)
    const dupFactions = duplicateFactions(table)
    for (const code of dupFactions) {
      add({
        rule: 'one-faction',
        gameNo,
        players: game.seats.filter((s) => s.faction === code).map((s) => s.player),
        message: `game ${gameNo}: ${factionByCode(code)?.name ?? code} is at the table twice`,
      })
    }
    const mixMessage = MIX_CONSTRAINT.violation(table)
    // A table with a faction missing cannot be judged as a whole, so the mix
    // and reach rules wait until every seat has one; a forbidden pair shows now.
    const complete = table.length === game.seats.length && table.length === TABLE_SIZE
    if (mixMessage !== null) {
      add({ rule: 'mix', gameNo, players: ids, message: `game ${gameNo}: ${mixMessage}` })
    }
    if (complete) {
      const reachMessage = reachViolation(table)
      if (reachMessage !== null) {
        add({ rule: 'reach', gameNo, players: ids, message: `game ${gameNo}: ${reachMessage}` })
      }
    }
  }

  // Rule 2: a player never repeats a faction.
  for (const [id, plays] of factionsOf) {
    for (const code of repeatedFactions(plays.map((p) => p.faction))) {
      const games = plays.filter((p) => p.faction === code).map((p) => p.gameNo)
      add({
        rule: 'no-repeat',
        gameNo: games[1],
        players: [id],
        message: `${nameOf(id)} plays ${factionByCode(code)?.name ?? code} in games ${games.join(' and ')}`,
      })
    }
  }

  // Rule 4: a different seat in each game.
  for (const [id, seats] of seatsOf) {
    const seen = new Map<number, number[]>()
    for (const { gameNo, seat } of seats) seen.set(seat, [...(seen.get(seat) ?? []), gameNo])
    for (const [seat, games] of seen) {
      if (games.length > 1) {
        add({
          rule: 'seat',
          gameNo: games[1],
          players: [id],
          message: `${nameOf(id)} sits in seat ${seat} in games ${games.join(' and ')}`,
        })
      }
    }
  }

  // Every player plays the games each the season sets.
  for (const player of input.players) {
    const played = seatsOf.get(player.id)?.length ?? 0
    if (played !== input.gamesEach) {
      add({
        rule: 'games-each',
        players: [player.id],
        message: `${player.name} plays ${played} games, not ${input.gamesEach}`,
      })
    }
  }

  return violations
}

/** The title of the rule a violation breaks, as league/pairing-rules.md words it. */
export function ruleTitle(violation: Violation): string {
  return RULES[violation.rule].title
}
