// The faction step: a port of assign_factions from planning/tools/pairing,
// run against a fixed seat layout instead of inventing the games itself.
//
// 1. Deal player numbers: the seed shuffles the players, the first gets number
//    1 and layout slot 0, and so on. The layout then says who sits where.
// 2. Find a faction for every seat so that every hard rule holds: own list
//    only, no repeat for a player, one of each faction at a table, reach at
//    least 21, the mix. The tables are solved exactly (depth first, the table
//    with the fewest options first), never by luck, and a deal with no answer
//    is dealt again from the same seed up to `deals` times.
// 3. Improve the first answer toward players' top picks by annealing, but only
//    ever through moves that keep every hard rule true.
//
// Hard rules are never traded for better picks, and a faction off a player's
// list is never used. When no answer exists the result says so and names the
// blocking players and tables, built from the same report the screen shows.
//
// The result depends only on the seed, the layout, the players and their
// lists, and the pool: no clock, so the same inputs always give the same draft.
// `shouldStop` and `onProgress` let a caller cancel or show progress.

import { FACTIONS } from '../data/factions'
import type { Layout } from '../data/valid-pairs'
import { checkPairing } from './check'
import { buildReport, type DraftReport } from './report'
import { createRng, type Rng, type Seed } from './rng'
import { MIX_CONSTRAINT, TABLE_SIZE, duplicateFactions, reachViolation } from './rules'
import type { PairingGame, PairingInput, PairingPlayer } from './types'

export interface AssignOptions {
  /** A layout for exactly `players.length` players. */
  layout: Layout
  /** Everyone in the season, with their ranked list as faction codes. Numbers are dealt, so order does not matter. */
  players: readonly PairingPlayer[]
  seed: Seed
  /** Faction codes the season uses. Defaults to all 13. A list entry outside the pool is not playable. */
  pool?: readonly string[]
  /** Times to deal the player numbers again when a deal has no answer. Default 6. */
  deals?: number
  /** Search steps allowed on one deal before giving up on it. Default 20000. */
  nodesPerDeal?: number
  /** Annealing steps toward higher picks. Default 30000. */
  iterations?: number
  /**
   * Polled during the search; true stops it. With no draft found yet the result
   * has reason 'stopped'; once a valid draft exists it is returned as it stands,
   * with whatever improvement was done so far.
   */
  shouldStop?: () => boolean
  /** Called with a rising fraction from 0 to 1. */
  onProgress?: (fraction: number) => void
}

export interface AssignedDraft {
  ok: true
  seed: string
  /** Which deal worked, from 1. Above 1 means earlier deals had no answer. */
  deal: number
  /** Players in number order: `players[0]` is player 1. */
  players: PairingPlayer[]
  games: PairingGame[]
  /** The same draft in the checker's shape. */
  input: PairingInput
  report: DraftReport
}

export type InfeasibleReason = 'short-list' | 'no-solution' | 'search-limit' | 'stopped'

export interface InfeasibleDraft {
  ok: false
  seed: string
  reason: InfeasibleReason
  /** One sentence for the screen. */
  message: string
  /** Rules, player names and game numbers that block it: `report.blocking`. */
  blocking: DraftReport['blocking']
  /** The report of a best-effort attempt, with its broken rules in `violations`. */
  report: DraftReport
}

export type AssignResult = AssignedDraft | InfeasibleDraft

const DEFAULT_DEALS = 6
const DEFAULT_NODES_PER_DEAL = 20000
const DEFAULT_ITERATIONS = 30000
/** Search steps between two looks at `shouldStop`. */
const POLL = 256

/** One slot's view of the problem: lists are as codes, best first, inside the pool. */
interface Problem {
  /** Players by slot, which is player number minus 1. */
  players: PairingPlayer[]
  lists: string[][]
  /** Per game, the slot in each seat, seat 1 first. */
  tables: number[][]
  maps: number[]
  /** Per slot, the (game, seat) places they play. */
  places: { game: number; seat: number }[][]
}

type Assignment = (string | null)[][]

/** A hard-rule-valid table: distinct factions, reach at least 21, the mix. */
function tableOk(factions: readonly string[]): boolean {
  return (
    duplicateFactions(factions).length === 0 &&
    reachViolation(factions) === null &&
    MIX_CONSTRAINT.violation(factions) === null
  )
}

function buildProblem(order: PairingPlayer[], layout: Layout, pool: ReadonlySet<string>): Problem {
  const lists = order.map((p) => [...new Set(p.list)].filter((code) => pool.has(code)))
  const places: Problem['places'] = order.map(() => [])
  layout.games.forEach((game, g) => {
    game.slots.forEach((slot, seat) => places[slot]!.push({ game: g, seat }))
  })
  return {
    players: order,
    lists,
    tables: layout.games.map((g) => [...g.slots]),
    maps: layout.games.map((g) => g.map),
    places,
  }
}

function toInput(p: Problem, gamesEach: number, asg: Assignment): PairingInput {
  return {
    gamesEach,
    players: p.players,
    games: p.tables.map((slots, g) => ({
      gameNo: g + 1,
      map: p.maps[g]!,
      seats: slots.map((slot, seat) => ({ player: p.players[slot]!.id, faction: asg[g]![seat] ?? null })),
    })),
  }
}

// --------------------------------------------------------------- exact search

interface Combo {
  f: string[]
  /** Sum of list places (0-based) of the four factions: lower is better. */
  cost: number
}

type SearchResult =
  | { status: 'found'; asg: string[][] }
  | { status: 'none' }
  | { status: 'limit' }
  | { status: 'stopped' }

/** Every way to fill one table that is valid on its own. */
function tableCombos(p: Problem, game: number): Combo[] {
  const slots = p.tables[game]!
  const out: Combo[] = []
  const chosen: string[] = []
  const rec = (seat: number, cost: number) => {
    if (seat === TABLE_SIZE) {
      if (tableOk(chosen)) out.push({ f: [...chosen], cost })
      return
    }
    const list = p.lists[slots[seat]!]!
    for (let i = 0; i < list.length; i++) {
      chosen.push(list[i]!)
      // On a part-filled table the mix can only fail on the forbidden pair, so this prunes early.
      if (duplicateFactions(chosen).length === 0 && MIX_CONSTRAINT.violation(chosen) === null) {
        rec(seat + 1, cost + i)
      }
      chosen.pop()
    }
  }
  rec(0, 0)
  return out
}

function search(p: Problem, rng: Rng, nodeLimit: number, stop: () => boolean): SearchResult {
  const tableCount = p.tables.length
  let combos: Combo[][] = Array.from({ length: tableCount }, (_, g) => tableCombos(p, g))
  if (combos.some((c) => c.length === 0)) return { status: 'none' }
  const assigned = new Array<boolean>(tableCount).fill(false)
  const choice: string[][] = new Array<string[]>(tableCount)
  let nodes = 0
  let halted: 'limit' | 'stopped' | null = null

  const rec = (left: number): boolean => {
    if (left === 0) return true
    // The unassigned table with the fewest options goes next (first of equals).
    let pick = -1
    for (let g = 0; g < tableCount; g++) {
      if (!assigned[g] && (pick < 0 || combos[g]!.length < combos[pick]!.length)) pick = g
    }
    const options = rng.shuffle(combos[pick]!).sort((a, b) => a.cost - b.cost)
    const slots = p.tables[pick]!
    for (const option of options) {
      nodes += 1
      if (nodes > nodeLimit) {
        halted = 'limit'
        return false
      }
      if (nodes % POLL === 0 && stop()) {
        halted = 'stopped'
        return false
      }
      const taken = new Map<number, string>()
      slots.forEach((slot, seat) => taken.set(slot, option.f[seat]!))
      // The other tables lose every option that repeats a faction for a player here.
      const saved = combos
      const next = combos.slice()
      let dead = false
      for (let g = 0; g < tableCount && !dead; g++) {
        if (assigned[g] || g === pick) continue
        const table = p.tables[g]!
        if (!table.some((slot) => taken.has(slot))) continue
        const kept = combos[g]!.filter((c) => table.every((slot, seat) => taken.get(slot) !== c.f[seat]))
        if (kept.length === 0) dead = true
        next[g] = kept
      }
      if (dead) continue
      combos = next
      assigned[pick] = true
      choice[pick] = option.f
      if (rec(left - 1)) return true
      assigned[pick] = false
      combos = saved
      if (halted) return false
    }
    return false
  }

  const found = rec(tableCount)
  if (found) return { status: 'found', asg: choice }
  if (halted) return { status: halted }
  return { status: 'none' }
}

// ------------------------------------------------------------------ improving

/** Anneal toward top picks through moves that keep every hard rule true. */
function improve(
  p: Problem,
  start: string[][],
  gamesEach: number,
  rng: Rng,
  iterations: number,
  stop: () => boolean,
  progress: (done: number) => void,
): string[][] {
  const n = p.players.length
  const asg = start.map((row) => row.slice())
  const base = (gamesEach * (gamesEach - 1)) / 2
  const regretOf = (slot: number): number => {
    let sum = 0
    for (const { game, seat } of p.places[slot]!) sum += p.lists[slot]!.indexOf(asg[game]![seat]!)
    return sum - base
  }
  const regrets = Array.from({ length: n }, (_, s) => regretOf(s))
  const energy = (): number => {
    let worst = 0
    let total = 0
    for (const r of regrets) {
      if (r > worst) worst = r
      total += r
    }
    return worst * 1000 + total
  }
  const usedBy = (slot: number): string[] => p.places[slot]!.map(({ game, seat }) => asg[game]![seat]!)

  let current = energy()
  let best = asg.map((row) => row.slice())
  let bestEnergy = current
  const t0 = 300
  const t1 = 0.3
  const cool = Math.pow(t1 / t0, 1 / Math.max(1, iterations))
  let temp = t0

  for (let step = 0; step < iterations; step++) {
    if (step % POLL === 0) {
      if (stop()) break
      progress(step)
    }
    temp *= cool
    const r = rng.next()
    // Each move is an undo list of [game, seat, previous faction] and the slots whose regret changes.
    const undo: [number, number, string][] = []
    const touched: number[] = []
    const apply = (game: number, seat: number, faction: string) => {
      undo.push([game, seat, asg[game]![seat]!])
      asg[game]![seat] = faction
    }
    let tables: number[]

    if (r < 0.3) {
      // A player swaps the factions of two of their games.
      const slot = rng.int(n)
      const places = p.places[slot]!
      if (places.length < 2) continue
      const a = places[rng.int(places.length)]!
      const b = places[rng.int(places.length)]!
      if (a.game === b.game) continue
      const fa = asg[a.game]![a.seat]!
      const fb = asg[b.game]![b.seat]!
      apply(a.game, a.seat, fb)
      apply(b.game, b.seat, fa)
      tables = [a.game, b.game]
    } else if (r < 0.65) {
      // Two players at one table swap factions.
      const game = rng.int(p.tables.length)
      const i = rng.int(TABLE_SIZE)
      const j = rng.int(TABLE_SIZE)
      if (i === j) continue
      const si = p.tables[game]![i]!
      const sj = p.tables[game]![j]!
      const fi = asg[game]![i]!
      const fj = asg[game]![j]!
      if (!p.lists[si]!.includes(fj) || !p.lists[sj]!.includes(fi)) continue
      if (usedBy(si).includes(fj) || usedBy(sj).includes(fi)) continue
      apply(game, i, fj)
      apply(game, j, fi)
      touched.push(si, sj)
      tables = [game]
    } else {
      // One seat takes a faction from its player's list that they have not used.
      const slot = rng.int(n)
      const place = p.places[slot]![rng.int(p.places[slot]!.length)]!
      const used = usedBy(slot)
      const free = p.lists[slot]!.filter((code) => !used.includes(code))
      if (free.length === 0) continue
      apply(place.game, place.seat, free[rng.int(free.length)]!)
      touched.push(slot)
      tables = [place.game]
    }

    const rollback = () => {
      for (let k = undo.length - 1; k >= 0; k--) {
        const [game, seat, was] = undo[k]!
        asg[game]![seat] = was
      }
    }
    if (!tables.every((g) => tableOk(asg[g]!))) {
      rollback()
      continue
    }
    const before = touched.map((s) => regrets[s]!)
    for (const s of touched) regrets[s] = regretOf(s)
    const next = energy()
    if (next <= current || rng.next() < Math.exp((current - next) / temp)) {
      current = next
      if (next < bestEnergy) {
        bestEnergy = next
        best = asg.map((row) => row.slice())
      }
    } else {
      rollback()
      touched.forEach((s, k) => (regrets[s] = before[k]!))
    }
  }
  return best
}

// ------------------------------------------------------------------ diagnosing

/**
 * A best-effort filling that keeps own-list and breaks as few other rules as
 * it can find, for the report of an infeasible run. A player with too short a
 * list gets empty seats, which the checker names.
 */
function bestEffort(p: Problem, gamesEach: number, rng: Rng, iterations: number, stop: () => boolean): Assignment {
  const asg: Assignment = p.tables.map((t) => t.map(() => null))
  const movable: { slot: number; game: number; seat: number }[] = []
  p.players.forEach((_, slot) => {
    const picks = rng.shuffle(p.lists[slot]!)
    p.places[slot]!.forEach(({ game, seat }, k) => {
      const faction = picks[k]
      if (faction === undefined) return
      asg[game]![seat] = faction
      movable.push({ slot, game, seat })
    })
  })
  const cost = () => checkPairing(toInput(p, gamesEach, asg)).length
  let current = cost()
  for (let step = 0; step < iterations && current > 0 && movable.length > 0; step++) {
    if (step % POLL === 0 && stop()) break
    const { slot, game, seat } = movable[rng.int(movable.length)]!
    const list = p.lists[slot]!
    const was = asg[game]![seat]!
    asg[game]![seat] = list[rng.int(list.length)]!
    const next = cost()
    if (next <= current) current = next
    else asg[game]![seat] = was
  }
  return asg
}

// ------------------------------------------------------------------------ main

export function assignFactions(options: AssignOptions): AssignResult {
  const { layout, players } = options
  if (layout.players !== players.length) {
    throw new RangeError(`the layout is for ${layout.players} players but ${players.length} were given`)
  }
  if (new Set(players.map((x) => x.id)).size !== players.length) {
    throw new RangeError('player ids must be different')
  }
  const seed = String(options.seed)
  const gamesEach = layout.gamesEach
  const pool = new Set(options.pool ?? FACTIONS.map((f) => f.code))
  const deals = options.deals ?? DEFAULT_DEALS
  const nodesPerDeal = options.nodesPerDeal ?? DEFAULT_NODES_PER_DEAL
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const stop = options.shouldStop ?? (() => false)
  const progress = options.onProgress ?? (() => {})
  const rng = createRng(seed)

  // The first deal is the one an infeasible report is built on.
  let firstDeal: Problem | null = null
  let outcome: 'none' | 'limit' | 'stopped' = 'none'

  const infeasible = (reason: InfeasibleReason, message: string, problem: Problem): InfeasibleDraft => {
    const asg = bestEffort(problem, gamesEach, rng, 4000, stop)
    const report = buildReport(toInput(problem, gamesEach, asg))
    progress(1)
    return { ok: false, seed, reason, message, blocking: report.blocking, report }
  }

  for (let deal = 1; deal <= deals; deal++) {
    const problem = buildProblem(rng.shuffle(players), layout, pool)
    firstDeal ??= problem
    if (stop()) {
      outcome = 'stopped'
      break
    }

    if (deal === 1) {
      // A player who lists fewer factions than they play games cannot be seated: no deal helps.
      const short = problem.players.filter((_, s) => problem.lists[s]!.length < gamesEach)
      if (short.length > 0) {
        const named = short
          .map((x) => `${x.name} lists ${problem.lists[problem.players.indexOf(x)]!.length}`)
          .join(', ')
        return infeasible(
          'short-list',
          `Each player needs a list of at least ${gamesEach} factions for ${gamesEach} games: ${named}.`,
          problem,
        )
      }
    }

    const found = search(problem, rng, nodesPerDeal, stop)
    if (found.status === 'stopped') {
      outcome = 'stopped'
      break
    }
    if (found.status === 'limit') outcome = 'limit'
    if (found.status !== 'found') continue

    progress(0.2)
    const better = improve(problem, found.asg, gamesEach, rng, iterations, stop, (done) =>
      progress(0.2 + 0.75 * (done / Math.max(1, iterations))),
    )
    const input = toInput(problem, gamesEach, better)
    // Never hand out a draft the checker rejects.
    if (checkPairing(input).length > 0) {
      outcome = 'none'
      continue
    }
    const report = buildReport(input)
    progress(1)
    return { ok: true, seed, deal, players: problem.players, games: [...input.games], input, report }
  }

  const problem = firstDeal as Problem
  if (outcome === 'stopped') return infeasible('stopped', 'The search was stopped before a draft was found.', problem)
  if (outcome === 'limit') {
    return infeasible(
      'search-limit',
      'No draft was found in the search budget; the lists may leave no valid tables.',
      problem,
    )
  }
  return infeasible('no-solution', 'No faction draft keeps every rule with these lists.', problem)
}
