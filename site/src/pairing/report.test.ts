import { describe, expect, it } from 'vitest'
import { buildReport } from './report'
import { SAMPLE_3, SAMPLE_4 } from './fixtures/samples'
import { game, validScenario, withGame } from './scenario'

describe('buildReport on the 3-game sample', () => {
  const report = buildReport(SAMPLE_3)

  it('passes with nothing blocking', () => {
    expect(report.ok).toBe(true)
    expect(report.violations).toEqual([])
    expect(report.blocking).toEqual({ rules: [], players: [], tables: [] })
    expect(report.minReach).toBe(21)
  })

  it('gives every player their top 3 and nothing off the list', () => {
    expect(report.players).toHaveLength(12)
    for (const p of report.players) {
      expect(p.games, p.name).toHaveLength(3)
      expect(p.offList, p.name).toBe(0)
      expect(p.topPicks, p.name).toBe(3)
      expect(p.worstRank, p.name).toBeLessThanOrEqual(3)
    }
    const adam = report.players.find((p) => p.name === 'Adam')!
    // The page: Game 3 seat 4 cats (#1), game 5 seat 2 birds (#3), game 7 seat 3 vagabond (#2).
    expect(adam.games.map((g) => [g.gameNo, g.seat, g.faction, g.rank])).toEqual([
      [3, 4, 'cats', 1],
      [5, 2, 'birds', 3],
      [7, 3, 'vagabond', 2],
    ])
  })

  it('reports each table with reach and type counts as the page does', () => {
    expect(report.tables).toHaveLength(9)
    const reach = report.tables.map((t) => t.reach)
    expect(reach).toEqual([24, 29, 22, 24, 31, 24, 24, 22, 24])
    expect(report.tables.map((t) => `${t.militant} / ${t.insurgent}`)).toEqual([
      '2 / 2',
      '2 / 2',
      '2 / 2',
      '2 / 2',
      '3 / 1',
      '2 / 2',
      '2 / 2',
      '2 / 2',
      '2 / 2',
    ])
    for (const t of report.tables) {
      expect(t.reachOk && t.mixOk && t.broken.length === 0).toBe(true)
      expect(t.seats.map((s) => s.seat)).toEqual([1, 2, 3, 4])
    }
  })

  it('reports meetings as the page states them: everyone meets 9 once and misses 2', () => {
    const m = report.meetings
    expect(m.pairs).toHaveLength(66)
    expect(m.most).toBe(1)
    expect(m.fewest).toBe(0)
    expect(m.spread).toBe(1)
    expect(m.neverMet).toBe(12)
    // The page lists 4 groups of 3 who never meet; the first group is Adam, Delaney, Zach.
    const never = new Set(m.pairs.filter((p) => p.count === 0).map((p) => `${p.a}/${p.b}`))
    expect(never.has('Adam/Delaney') || never.has('Delaney/Adam')).toBe(true)
  })

  it('counts map repeats: 3 players twice and David three times', () => {
    expect(report.meetings.mapRepeats).toBe(5)
  })
})

describe('buildReport on the 4-game sample', () => {
  const report = buildReport(SAMPLE_4)

  it('passes and gives every player their top 4', () => {
    expect(report.ok).toBe(true)
    for (const p of report.players) {
      expect(p.offList).toBe(0)
      expect(p.topPicks).toBe(4)
    }
  })

  it('has 6 pairs meeting twice, the rest once, and the 12 map repeats the page states', () => {
    const m = report.meetings
    expect(m.fewest).toBe(1)
    expect(m.most).toBe(2)
    expect(m.spread).toBe(1)
    expect(m.neverMet).toBe(0)
    expect(m.pairs.filter((p) => p.count === 2)).toHaveLength(6)
    expect(m.mapRepeats).toBe(12)
  })
})

describe('buildReport on a draft that breaks rules', () => {
  const broken = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'di'], ['birds', 'frogs', 'crows', 'WA']))
  const report = buildReport(broken)

  it('is not ok and names the blocking rule, table and players', () => {
    expect(report.ok).toBe(false)
    expect(report.violations.map((v) => v.rule)).toEqual(['reach'])
    expect(report.blocking).toEqual({ rules: ['reach'], players: ['Ann', 'Bo', 'Cy', 'Di'], tables: [1] })
  })

  it('marks the table that breaks and leaves the other alone', () => {
    const [one, two] = report.tables
    expect(one).toMatchObject({ gameNo: 1, reach: 20, reachOk: false, mixOk: true, broken: ['reach'] })
    expect(two).toMatchObject({ gameNo: 2, reach: 23, reachOk: true, mixOk: true, broken: [] })
  })

  it('shows an off-list faction against the list', () => {
    const input = {
      ...validScenario(),
      players: validScenario().players.map((p) => (p.id === 'di' ? { ...p, list: ['cats'] } : p)),
    }
    const di = buildReport(input).players.find((p) => p.id === 'di')!
    expect(di.offList).toBe(2)
    expect(di.games.map((g) => g.rank)).toEqual([null, null])
    expect(di.topPicks).toBe(0)
  })

  it('leaves reach null and does not judge a table with an unassigned seat', () => {
    const open = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'di'], ['cats', 'otters', 'WA', null]))
    const t = buildReport(open).tables[0]!
    expect(t.reach).toBeNull()
    expect(t.reachOk).toBe(false)
    expect(t.broken).toEqual(['faction'])
    expect(t.seats[3]).toMatchObject({ faction: null, type: null })
  })
})
