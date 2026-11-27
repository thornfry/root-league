import { describe, expect, it } from 'vitest'
import { createRng, newSeed } from './rng'

const draw = (seed: string | number, n = 20) => {
  const rng = createRng(seed)
  return Array.from({ length: n }, () => rng.next())
}

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draw('league-1')).toEqual(draw('league-1'))
  })

  it('gives a different sequence for a different seed', () => {
    expect(draw('league-1')).not.toEqual(draw('league-2'))
    expect(draw('a')).not.toEqual(draw('b'))
  })

  it('treats a number seed as its decimal text', () => {
    expect(draw(42)).toEqual(draw('42'))
  })

  it('pins the first draws so a change of algorithm is noticed', () => {
    // Published pairings are rebuilt from their seed, so these must not move.
    expect(draw('league-1', 3)).toEqual([0.07057488802820444, 0.9729566252790391, 0.05306050833314657])
  })

  it('stays in [0, 1)', () => {
    for (const x of draw('range', 2000)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('int stays in range, reaches every value and refuses a bad bound', () => {
    const rng = createRng('int')
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const v = rng.int(6)
      expect(Number.isInteger(v)).toBe(true)
      seen.add(v)
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5])
    expect(rng.int(1)).toBe(0)
    expect(() => rng.int(0)).toThrow(RangeError)
    expect(() => rng.int(2.5)).toThrow(RangeError)
  })

  it('shuffle keeps the items, leaves the input alone and repeats for a seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const a = createRng('shuffle').shuffle(input)
    const b = createRng('shuffle').shuffle(input)
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x - y)).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(createRng('other').shuffle(input)).not.toEqual(a)
  })
})

describe('newSeed', () => {
  it('is 8 hex digits and changes between calls', () => {
    const a = newSeed()
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    expect(newSeed()).not.toBe(a)
  })
})
