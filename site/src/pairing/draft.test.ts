import { describe, expect, it, vi } from 'vitest'
import { FACTIONS } from '../data/factions'
import { getLayout } from '../data/valid-pairs'
import { assignFactions } from './assign'
import { checkPairing } from './check'
import { buildDraft, type DraftRequest } from './draft'
import fixture from './fixtures/mock-12-players.json'

const request: DraftRequest = {
  season: { capacity: 12, gamesEach: 3, maps: ['Autumn', 'Winter', 'Lake', 'Mountain'], factionPool: FACTIONS.map((f) => f.code) },
  roster: fixture.players,
  seed: 'p4',
}

describe('draft builder', () => {
  it('returns the faction step unchanged, with players in number order', () => {
    const result = buildDraft(request)
    expect(result).toEqual(assignFactions({
      layout: getLayout(12, 3, 4)!,
      players: [...request.roster].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      pool: request.season.factionPool,
      seed: request.seed,
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(checkPairing(result.input)).toEqual([])
    getLayout(12, 3, 4)!.games.forEach((game, g) => {
      expect(result.games[g]!.seats.map((s) => s.player)).toEqual(game.slots.map((s) => result.players[s]!.id))
    })
    expect(buildDraft({ ...request, roster: [...request.roster].reverse() })).toEqual(result)
  })

  it('passes an infeasible report through without games', () => {
    const result = buildDraft({ ...request, roster: request.roster.map((p, i) => i === 0 ? { ...p, list: ['cats'] } : p) })
    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('games')
    if (result.ok) return
    expect(result.reason).toBe('short-list')
    expect(result.blocking).toEqual(result.report.blocking)
    expect(result.blocking.players).toContain(request.roster[0]!.name)
  })

  it('uses the time budget in shouldStop', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(20)
    try {
      const result = buildDraft(request, { budgetMs: 10 })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('stopped')
    } finally { clock.mockRestore() }
  })

  it('rejects unsupported settings and search controls', () => {
    expect(() => buildDraft({ ...request, season: { ...request.season, capacity: 10 } })).toThrow(RangeError)
    expect(() => buildDraft({ ...request, roster: request.roster.slice(1) })).toThrow(RangeError)
    for (const options of [{ budgetMs: 0 }, { budgetMs: Infinity }, { deals: 0 }, { iterations: -1 }, { nodesPerDeal: 1.5 }]) {
      expect(() => buildDraft(request, options)).toThrow(RangeError)
    }
  })
})
