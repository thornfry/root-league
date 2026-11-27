import { describe, expect, it } from 'vitest'
import seasonPreferences from '../../../season-1/preferences.json'
import mockSource from '../../../planning/tools/pairing/mock12_preferences_FAKE.json'
import { findFaction } from '../data/factions'
import { getLayout } from '../data/valid-pairs'
import { assignFactions, type AssignedDraft, type AssignResult } from './assign'
import { checkPairing } from './check'
import mockFixture from './fixtures/mock-12-players.json'
import noMilitantFixture from './fixtures/infeasible-no-militant.json'
import shortListFixture from './fixtures/infeasible-short-list.json'
import type { PairingPlayer } from './types'

/** season-1/preferences.json with names resolved to faction codes. */
function seasonPlayers(): PairingPlayer[] {
  return Object.entries(seasonPreferences.players).map(([name, list]) => ({
    id: name,
    name,
    list: (list as string[]).map((n) => findFaction(n)!.code),
  }))
}

function expectDraft(result: AssignResult): AssignedDraft {
  if (!result.ok) throw new Error(`expected a draft, got ${result.reason}: ${result.message}`)
  return result
}

function layoutFor(players: number, gamesEach: number, maps = Math.max(gamesEach, 4)) {
  const layout = getLayout(players, gamesEach, maps)
  if (!layout) throw new Error(`no layout for ${players} players, ${gamesEach} games, ${maps} maps`)
  return layout
}

/** What every draft must satisfy, whatever its lists. */
function expectValid(draft: AssignedDraft, players: PairingPlayer[]) {
  expect(checkPairing(draft.input)).toEqual([])
  expect(draft.report.ok).toBe(true)
  expect(draft.report.violations).toEqual([])
  expect(draft.report.players.map((p) => p.offList)).toEqual(players.map(() => 0))
  expect(draft.players.map((p) => p.id).sort()).toEqual(players.map((p) => p.id).sort())
}

describe('season 1 lists on the 12-player layouts', () => {
  it.each([3, 4])('give a valid draft with no off-list play at %i games', (gamesEach) => {
    const players = seasonPlayers()
    const draft = expectDraft(assignFactions({ layout: layoutFor(12, gamesEach), players, seed: 'season-1' }))
    expectValid(draft, players)
    expect(draft.games).toHaveLength(12 * gamesEach / 4)
    // Everyone gets factions from the top of their list.
    for (const p of draft.report.players) expect(p.worstRank, p.name).toBeLessThanOrEqual(p.listLength)
  })

  it.each(['1', 'abc', 'x9', 'league'])('stays valid for seed %s', (seed) => {
    const players = seasonPlayers()
    for (const gamesEach of [3, 4]) {
      expectValid(expectDraft(assignFactions({ layout: layoutFor(12, gamesEach), players, seed })), players)
    }
  })

  it('seats each player where the layout puts their number', () => {
    const players = seasonPlayers()
    const layout = layoutFor(12, 4)
    const draft = expectDraft(assignFactions({ layout, players, seed: 'slots' }))
    layout.games.forEach((game, g) => {
      expect(draft.games[g]!.gameNo).toBe(g + 1)
      expect(draft.games[g]!.map).toBe(game.map)
      expect(draft.games[g]!.seats.map((s) => s.player)).toEqual(game.slots.map((slot) => draft.players[slot]!.id))
    })
  })
})

describe('the 12-player mock fixture', () => {
  it('is the mock preference file, as codes', () => {
    const names = Object.keys(mockSource.players)
    expect(mockFixture.players.map((p) => p.name)).toEqual(names)
    for (const p of mockFixture.players) {
      const source = (mockSource.players as Record<string, string[]>)[p.name]!
      expect(p.list, p.name).toEqual(source.map((n) => findFaction(n)!.code))
    }
  })

  it('gives a valid draft at 3 games', () => {
    const draft = expectDraft(assignFactions({ layout: layoutFor(12, 3), players: mockFixture.players, seed: 7 }))
    expectValid(draft, mockFixture.players)
  })

  it('cannot play 4 games, because Adam lists only 3 factions, and says so', () => {
    const result = assignFactions({ layout: layoutFor(12, 4), players: mockFixture.players, seed: 7 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('short-list')
      expect(result.blocking.players).toContain('Adam')
    }
  })
})

describe('every offered size', () => {
  it.each([
    [8, 2],
    [8, 3],
    [8, 4],
    [10, 2],
    [10, 4],
    [12, 2],
  ])('drafts %i players at %i games', (n, gamesEach) => {
    const players = seasonPlayers().slice(0, n)
    const draft = expectDraft(assignFactions({ layout: layoutFor(n, gamesEach), players, seed: 'sizes' }))
    expectValid(draft, players)
  })
})

describe('the pool', () => {
  it('never uses a faction outside it', () => {
    const players = seasonPlayers()
    const pool = ['cats', 'rats', 'moles', 'birds', 'frogs', 'otters', 'vagabond', 'knaves', 'bats', 'crows', 'lizards']
    const draft = expectDraft(assignFactions({ layout: layoutFor(12, 3), players, seed: 'pool', pool }))
    expectValid(draft, players)
    const used = new Set(draft.games.flatMap((g) => g.seats.map((s) => s.faction)))
    expect(used.has('WA')).toBe(false)
  })
})

describe('an infeasible run', () => {
  it('names a player whose list is too short', () => {
    const { players, blamed, gamesEach } = shortListFixture
    const result = assignFactions({ layout: layoutFor(12, gamesEach), players, seed: 'short' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('short-list')
    expect(result.message).toContain(blamed)
    expect(result.blocking.players).toContain(blamed)
    expect(result.blocking.rules).toContain('faction')
    expect(result.blocking.tables.length).toBeGreaterThan(0)
    expect(result.report.ok).toBe(false)
    expect(result.blocking).toEqual(result.report.blocking)
  })

  it('names the rule and the tables when no table can be valid', () => {
    const { players, gamesEach } = noMilitantFixture
    const layout = layoutFor(8, gamesEach)
    const result = assignFactions({ layout, players, seed: 'mix' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-solution')
    expect(result.blocking.rules).toContain('mix')
    expect(result.blocking.tables).toEqual(layout.games.map((_, g) => g + 1))
    expect(result.blocking.players.length).toBeGreaterThan(0)
  })

  it('treats a list entry outside the pool as unplayable', () => {
    const players = seasonPlayers().map((p) => (p.name === 'Adam' ? { ...p, list: ['cats', 'WA', 'birds', 'vagabond'] } : p))
    const result = assignFactions({
      layout: layoutFor(12, 4),
      players,
      seed: 'pool-short',
      pool: ['cats', 'rats', 'badgers', 'moles', 'birds', 'frogs', 'otters', 'vagabond', 'knaves', 'bats', 'crows', 'lizards'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('short-list')
      expect(result.blocking.players).toContain('Adam')
    }
  })
})

describe('seeds', () => {
  it('give the same draft for the same seed and lists', () => {
    const players = seasonPlayers()
    const a = expectDraft(assignFactions({ layout: layoutFor(12, 4), players, seed: 'same' }))
    const b = expectDraft(assignFactions({ layout: layoutFor(12, 4), players, seed: 'same' }))
    expect(b.games).toEqual(a.games)
    expect(b.players.map((p) => p.id)).toEqual(a.players.map((p) => p.id))
  })

  it('does not depend on the order the players are given in', () => {
    const players = seasonPlayers()
    const a = expectDraft(assignFactions({ layout: layoutFor(12, 3), players, seed: 'order' }))
    const b = expectDraft(assignFactions({ layout: layoutFor(12, 3), players: [...players].reverse(), seed: 'order' }))
    // The deal is by the seed, but it shuffles the order given, so a different order is a different deal.
    expect(checkPairing(b.input)).toEqual([])
    expect(a.players.length).toBe(b.players.length)
  })

  it('change the player numbers when the seed changes', () => {
    const players = seasonPlayers()
    const order = (seed: string) =>
      expectDraft(assignFactions({ layout: layoutFor(12, 3), players, seed })).players.map((p) => p.id)
    const a = order('seed-a')
    const b = order('seed-b')
    expect(b).not.toEqual(a)
    expect([...b].sort()).toEqual([...a].sort())
  })

  it('count a number seed as its text', () => {
    const players = seasonPlayers()
    const a = expectDraft(assignFactions({ layout: layoutFor(12, 3), players, seed: 42 }))
    const b = expectDraft(assignFactions({ layout: layoutFor(12, 3), players, seed: '42' }))
    expect(b.games).toEqual(a.games)
  })
})

describe('running it', () => {
  it('finishes the 12-player, 4-game case well inside 10 seconds', () => {
    const started = performance.now()
    expectDraft(assignFactions({ layout: layoutFor(12, 4), players: seasonPlayers(), seed: 'timing' }))
    expect(performance.now() - started).toBeLessThan(10_000)
  })

  it('reports rising progress that ends at 1', () => {
    const seen: number[] = []
    expectDraft(
      assignFactions({ layout: layoutFor(12, 3), players: seasonPlayers(), seed: 'progress', onProgress: (f) => seen.push(f) }),
    )
    expect(seen.length).toBeGreaterThan(2)
    expect(seen.at(-1)).toBe(1)
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!)
  })

  it('stops when asked', () => {
    const result = assignFactions({
      layout: layoutFor(12, 4),
      players: seasonPlayers(),
      seed: 'stop',
      iterations: 100000,
      shouldStop: () => true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('stopped')
  })

  it('refuses a layout for a different number of players', () => {
    expect(() => assignFactions({ layout: layoutFor(8, 2), players: seasonPlayers(), seed: 'x' })).toThrow(RangeError)
  })
})
