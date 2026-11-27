// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { getLayout } from '../data/valid-pairs'
import { assignFactions } from './assign'
import { checkPairing } from './check'
import { buildReport } from './report'
import type { PairingInput } from './types'

const script = fileURLToPath(new URL('../../scripts/parity.py', import.meta.url))
interface ParityCase { fixture: string; input: PairingInput }
let cases: ParityCase[]

function python(mode: string, input?: PairingInput) {
  const result = spawnSync('python3', [script, mode], {
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error) throw result.error
  return result
}

function expectSharedRules(input: PairingInput) {
  // Only these two site-only rules are excluded. Structure, games each,
  // per-player and per-table faction uniqueness, reach and seats all remain.
  expect(checkPairing(input).filter((v) => v.rule !== 'mix' && v.rule !== 'own-list')).toEqual([])
  // P2's checker delegates meetings to the layout/report, so assert both
  // Python meeting constraints here, including pairs that never meet.
  const meetings = buildReport(input).meetings
  expect(meetings.pairs).toHaveLength(input.players.length * (input.players.length - 1) / 2)
  expect(meetings.spread).toBeLessThanOrEqual(1)
  expect(meetings.most).toBeLessThan(input.gamesEach)
}

beforeAll(() => {
  const result = python('--generate')
  expect(result.status, result.stderr || result.stdout).toBe(0)
  cases = JSON.parse(result.stdout) as ParityCase[]
}, 610_000)

describe('Python / TypeScript shared hard-rule parity', () => {
  it('covers both original mocks and Season 1 without altering their lists', () => {
    expect(cases.map((c) => [c.fixture, c.input.gamesEach])).toEqual([
      ['planning/tools/pairing/mock_preferences_FAKE.json', 2],
      ['planning/tools/pairing/mock12_preferences_FAKE.json', 3],
      ['season-1/preferences.json', 3],
      ['season-1/preferences.json', 4],
    ])
  })

  it.each([0, 1, 2, 3])('checks Python output in TypeScript, case %i', (index) => {
    expectSharedRules(cases[index]!.input)
  })

  it.each([0, 1, 2, 3])('checks a TypeScript draft in Python, case %i', (index) => {
    const { input, fixture } = cases[index]!
    const layout = getLayout(input.players.length, input.gamesEach, 4)
    expect(layout).toBeDefined()
    // P5 depends on P3; use its complete assigned draft, independent of the
    // P4 worker/draft wrapper being built in parallel.
    const draft = assignFactions({ layout: layout!, players: input.players, seed: 'parity' })
    if (!draft.ok) throw new Error(`${fixture}: ${draft.message}`)
    expect(checkPairing(draft.input)).toEqual([])
    expectSharedRules(draft.input)
    const result = python('--check', draft.input)
    expect(result.status, result.stderr || result.stdout).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual([])
  })

  it.each(['players', 'one-faction', 'reach', 'no-repeat', 'seat', 'meetings'] as const)(
    'both checkers reject a corrupted shared rule: %s', (rule) => {
      const input = structuredClone(cases[1]!.input)
      // Mutable copies keep the production input shapes readonly.
      const games = input.games.map((g) => ({ ...g, seats: g.seats.map((s) => ({ ...s })) }))
      const first = games[0]!
      const player = first.seats[0]!.player
      const later = games.slice(1).find((g) => g.seats.some((s) => s.player === player))!
      const seatIndex = later.seats.findIndex((s) => s.player === player)
      switch (rule) {
        case 'players': first.seats[1]!.player = player; break
        case 'one-faction': first.seats[1]!.faction = first.seats[0]!.faction; break
        case 'reach': first.seats.forEach((s, i) => { s.faction = ['lizards', 'WA', 'crows', 'bats'][i]! }); break
        case 'no-repeat': later.seats[seatIndex]!.faction = first.seats[0]!.faction; break
        case 'seat': [later.seats[0], later.seats[seatIndex]] = [later.seats[seatIndex]!, later.seats[0]!]; break
        case 'meetings': games[1] = structuredClone(first); break
      }
      const corrupted = { ...input, games }
      if (rule === 'meetings') {
        const meetings = buildReport(corrupted).meetings
        expect(meetings.spread > 1 || meetings.most >= input.gamesEach).toBe(true)
      } else {
        expect(checkPairing(corrupted).map((v) => v.rule)).toContain(rule)
      }
      const result = python('--check', corrupted)
      expect(result.status, result.stderr).toBe(1)
      const failures = JSON.parse(result.stdout) as string[]
      const message = {
        players: 'distinct players', 'one-faction': 'duplicate faction', reach: 'reach',
        'no-repeat': 'repeats a faction', seat: 'repeats a seat', meetings: 'meeting',
      }[rule]
      expect(failures.some((failure) => failure.includes(message)), failures.join('\n')).toBe(true)
    },
  )
})
