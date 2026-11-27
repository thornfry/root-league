import { describe, expect, it } from 'vitest'
import { FACTIONS } from '../data/factions'
import pairingRulesDoc from '../../../league/pairing-rules.md?raw'
import {
  MIN_REACH,
  MIX_CONSTRAINT,
  RULES,
  TABLE_SIZE,
  duplicateFactions,
  isOnList,
  rankOnList,
  reachViolation,
  repeatedFactions,
  tableReach,
} from './rules'

const sources = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

describe('rules match league/pairing-rules.md', () => {
  it('has the same title for every numbered rule', () => {
    const doc = new Map<number, string>()
    for (const m of pairingRulesDoc.matchAll(/^(\d+)\. \*\*(.+?)\*\*/gm)) {
      doc.set(Number(m[1]), m[2]!.replace(/\.$/, ''))
    }
    const numbered = Object.values(RULES).filter((r) => r.number !== null)
    expect(numbered.length).toBe(6)
    for (const rule of numbered) {
      expect(doc.get(rule.number!), `rule ${rule.number}`).toBe(rule.title)
    }
  })

  it('uses the 4-player reach sum from factions.md and the Law of Root', () => {
    expect(MIN_REACH).toBe(21)
    expect(TABLE_SIZE).toBe(4)
    expect(RULES.reach.title).toContain(String(MIN_REACH))
  })
})

describe('rule 1: own list only', () => {
  const list = ['cats', 'WA', 'birds']
  it('passes a faction on the list', () => {
    expect(isOnList(list, 'WA')).toBe(true)
    expect(rankOnList(list, 'birds')).toBe(3)
  })
  it('fails a faction off the list', () => {
    expect(isOnList(list, 'rats')).toBe(false)
    expect(rankOnList(list, 'rats')).toBeNull()
  })
})

describe('rule 2: no repeat for a player', () => {
  it('passes four different factions', () => {
    expect(repeatedFactions(['cats', 'rats', 'WA', 'birds'])).toEqual([])
  })
  it('fails a faction played twice and names it once', () => {
    expect(repeatedFactions(['cats', 'rats', 'cats', 'cats'])).toEqual(['cats'])
  })
})

describe('rule 8: no duplicate faction at a table', () => {
  it('passes four different factions', () => {
    expect(duplicateFactions(['cats', 'rats', 'WA', 'birds'])).toEqual([])
  })
  it('fails a faction seated twice', () => {
    expect(duplicateFactions(['cats', 'otters', 'cats', 'WA'])).toEqual(['cats'])
  })
})

describe('rule 6: table reach at least 21', () => {
  it('adds up the factions', () => {
    expect(tableReach(['rats', 'moles', 'WA', 'knaves'])).toBe(24)
  })
  it('passes exactly 21', () => {
    expect(tableReach(['birds', 'frogs', 'bats', 'crows'])).toBe(21)
    expect(reachViolation(['birds', 'frogs', 'bats', 'crows'])).toBeNull()
  })
  it('fails 20 and says why', () => {
    expect(tableReach(['birds', 'frogs', 'bats', 'lizards'])).toBe(20)
    expect(reachViolation(['birds', 'frogs', 'bats', 'lizards'])).toBe('table reach is 20, below the minimum of 21')
  })
})

describe('rule 7: the mix constraint', () => {
  it('passes a table with both types and no Vagabond with Knaves', () => {
    expect(MIX_CONSTRAINT.violation(['cats', 'rats', 'WA', 'knaves'])).toBeNull()
    expect(MIX_CONSTRAINT.violation(['cats', 'otters', 'WA', 'bats'])).toBeNull()
  })
  it('fails four militant factions', () => {
    expect(MIX_CONSTRAINT.violation(['cats', 'rats', 'moles', 'birds'])).toBe('no insurgent faction at the table')
  })
  it('fails four insurgent factions', () => {
    expect(MIX_CONSTRAINT.violation(['otters', 'WA', 'bats', 'lizards'])).toBe('no militant faction at the table')
  })
  it('fails Vagabond with Knaves, even with both types present', () => {
    expect(MIX_CONSTRAINT.violation(['cats', 'rats', 'vagabond', 'knaves'])).toContain('at the same table')
  })
  it('lets a part-filled table fail only on the pair, since it can still be completed', () => {
    expect(MIX_CONSTRAINT.violation(['cats', 'rats', 'moles'])).toBeNull()
    expect(MIX_CONSTRAINT.violation(['vagabond', 'knaves'])).not.toBeNull()
  })

  // Pins what the constraint accepts, over every table of 4 different
  // factions. Edit the constraint to change behaviour and this fails. The
  // expected function is written out separately, from the type column of
  // league/factions.md, so the constraint is not tested against itself.
  it('accepts exactly the tables rule 7 allows, across all 715', () => {
    const militant = new Set(['cats', 'rats', 'badgers', 'moles', 'birds', 'frogs'])
    const codes = FACTIONS.map((f) => f.code)
    let accepted = 0
    let total = 0
    for (let a = 0; a < codes.length; a++)
      for (let b = a + 1; b < codes.length; b++)
        for (let c = b + 1; c < codes.length; c++)
          for (let d = c + 1; d < codes.length; d++) {
            const table = [codes[a]!, codes[b]!, codes[c]!, codes[d]!]
            const militants = table.filter((x) => militant.has(x)).length
            const expected =
              militants >= 1 && militants <= 3 && !(table.includes('vagabond') && table.includes('knaves'))
            expect(MIX_CONSTRAINT.violation(table) === null, table.join(',')).toBe(expected)
            total += 1
            if (expected) accepted += 1
          }
    expect(total).toBe(715)
    // By hand: 665 tables have 1 to 3 militants, and 45 of those hold Vagabond and Knaves.
    expect(accepted).toBe(665 - 45)
  })
})
describe('the mix lives in one file', () => {
  it('names Vagabond and Knaves only in rules.ts', () => {
    // scenario.ts is test data: it names factions to build tables and enforces nothing.
    const others = Object.entries(sources).filter(
      ([path]) => !path.endsWith('.test.ts') && path !== './rules.ts' && path !== './scenario.ts',
    )
    expect(others.length).toBeGreaterThan(0)
    for (const [path, source] of others) {
      expect(source, path).not.toMatch(/vagabond|knaves/i)
      expect(source, path).not.toMatch(/neverTogether/)
    }
    expect(sources['./rules.ts']).toMatch(/neverTogether: \['vagabond', 'knaves'\]/)
  })
})
