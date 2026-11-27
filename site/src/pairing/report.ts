// The report the Start season screen shows for a draft: what each player got
// against their list, every table's reach and mix, how often pairs meet, and
// any rule that blocked it. It is built from the same input as the checker and
// holds the checker's violations, so the screen and the check cannot disagree.

import { factionByCode, type FactionType } from '../data/factions'
import { checkPairing } from './check'
import { MIN_REACH, MIX_CONSTRAINT, rankOnList, reachViolation, tableReach } from './rules'
import type { PairingInput, RuleId, Violation } from './types'

export interface PlayerGameReport {
  gameNo: number
  /** 1 to 4, seat 1 first in turn order. */
  seat: number
  map: number
  faction: string | null
  /** 1-based place on the player's list, null when off the list or unassigned. */
  rank: number | null
}

export interface PlayerReport {
  id: string
  name: string
  listLength: number
  games: PlayerGameReport[]
  /** Games with a faction that is not on the player's list. Rule 1: should be 0. */
  offList: number
  /** Games with a faction in the player's top gamesEach picks. */
  topPicks: number
  /** Worst place on the list among the games, null when nothing is placed. */
  worstRank: number | null
}

export interface TableReport {
  gameNo: number
  map: number
  seats: {
    seat: number
    playerId: string
    playerName: string
    faction: string | null
    type: FactionType | null
  }[]
  /** Sum of the known factions' reach; null when a seat has no known faction. */
  reach: number | null
  militant: number
  insurgent: number
  reachOk: boolean
  mixOk: boolean
  /** Every rule broken at this table, by rule id. */
  broken: RuleId[]
}

export interface MeetingPair {
  a: string
  b: string
  count: number
}

export interface MeetingReport {
  /** Every pair of players with the games they share, fewest first, then by name. */
  pairs: MeetingPair[]
  most: number
  fewest: number
  /** most minus fewest. */
  spread: number
  /** Pairs that never meet. */
  neverMet: number
  /** Sum over players of times they play a map they have already played (rule 5, reported only). */
  mapRepeats: number
}

export interface DraftReport {
  /** True when no hard rule is broken. */
  ok: boolean
  minReach: number
  players: PlayerReport[]
  tables: TableReport[]
  meetings: MeetingReport
  violations: Violation[]
  /** What blocks the draft: rules, player names and game numbers, each listed once. */
  blocking: { rules: RuleId[]; players: string[]; tables: number[] }
}

export function buildReport(input: PairingInput): DraftReport {
  const violations = checkPairing(input)
  const nameOf = new Map(input.players.map((p) => [p.id, p.name]))
  const name = (id: string) => nameOf.get(id) ?? id

  const players: PlayerReport[] = input.players.map((player) => {
    const games: PlayerGameReport[] = []
    for (const game of input.games) {
      const seat = game.seats.findIndex((s) => s.player === player.id)
      if (seat < 0) continue
      const faction = game.seats[seat]?.faction ?? null
      games.push({
        gameNo: game.gameNo,
        seat: seat + 1,
        map: game.map,
        faction,
        rank: faction === null ? null : rankOnList(player.list, faction),
      })
    }
    const ranks = games.flatMap((g) => (g.rank === null ? [] : [g.rank]))
    return {
      id: player.id,
      name: player.name,
      listLength: player.list.length,
      games,
      offList: games.filter((g) => g.faction !== null && g.rank === null).length,
      topPicks: ranks.filter((r) => r <= input.gamesEach).length,
      worstRank: ranks.length ? Math.max(...ranks) : null,
    }
  })

  const tables: TableReport[] = input.games.map((game) => {
    const factions = game.seats.map((s) => s.faction)
    const known = factions.flatMap((f) => (f !== null && factionByCode(f) ? [f] : []))
    const types = known.map((f) => factionByCode(f)?.type)
    const broken = [...new Set(violations.filter((v) => v.gameNo === game.gameNo).map((v) => v.rule))]
    const full = known.length === game.seats.length
    return {
      gameNo: game.gameNo,
      map: game.map,
      seats: game.seats.map((s, i) => ({
        seat: i + 1,
        playerId: s.player,
        playerName: name(s.player),
        faction: s.faction,
        type: (s.faction !== null && factionByCode(s.faction)?.type) || null,
      })),
      reach: full ? tableReach(known) : null,
      militant: types.filter((t) => t === 'Militant').length,
      insurgent: types.filter((t) => t === 'Insurgent').length,
      reachOk: full && reachViolation(known) === null,
      mixOk: full && MIX_CONSTRAINT.violation(known) === null,
      broken,
    }
  })

  // Meetings: every pair of league players, counted over the games.
  const together = new Map<string, number>()
  const key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
  for (const game of input.games) {
    const ids = game.seats.map((s) => s.player)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const k = key(ids[i] as string, ids[j] as string)
        together.set(k, (together.get(k) ?? 0) + 1)
      }
    }
  }
  const pairs: MeetingPair[] = []
  for (let i = 0; i < input.players.length; i++) {
    for (let j = i + 1; j < input.players.length; j++) {
      const a = input.players[i]!
      const b = input.players[j]!
      pairs.push({ a: a.name, b: b.name, count: together.get(key(a.id, b.id)) ?? 0 })
    }
  }
  pairs.sort((x, y) => x.count - y.count || x.a.localeCompare(y.a) || x.b.localeCompare(y.b))
  const counts = pairs.map((p) => p.count)
  const most = counts.length ? Math.max(...counts) : 0
  const fewest = counts.length ? Math.min(...counts) : 0

  let mapRepeats = 0
  for (const player of input.players) {
    const maps = new Set<number>()
    for (const game of input.games) {
      if (!game.seats.some((s) => s.player === player.id)) continue
      if (maps.has(game.map)) mapRepeats += 1
      maps.add(game.map)
    }
  }

  const rules = [...new Set(violations.map((v) => v.rule))]
  const blockingPlayers = [...new Set(violations.flatMap((v) => v.players))].map(name).sort()
  const blockingTables = [...new Set(violations.flatMap((v) => (v.gameNo === undefined ? [] : [v.gameNo])))].sort(
    (a, b) => a - b,
  )

  return {
    ok: violations.length === 0,
    minReach: MIN_REACH,
    players,
    tables,
    meetings: { pairs, most, fewest, spread: most - fewest, neverMet: counts.filter((c) => c === 0).length, mapRepeats },
    violations,
    blocking: { rules, players: blockingPlayers, tables: blockingTables },
  }
}
