import { describe, expect, it } from 'vitest'
import { checkPairing } from './check'
import { PLAYERS, game, validScenario, withGame } from './scenario'
import { SAMPLE_3, SAMPLE_4 } from './fixtures/samples'
import type { PairingInput, RuleId } from './types'

const rulesOf = (input: PairingInput): RuleId[] => [...new Set(checkPairing(input).map((v) => v.rule))]

describe('checkPairing on the repo samples', () => {
  it('accepts the 3-game sample', () => {
    expect(checkPairing(SAMPLE_3)).toEqual([])
  })

  it('accepts the 4-game sample', () => {
    expect(checkPairing(SAMPLE_4)).toEqual([])
  })

  it('rejects the 4-game sample with one table edited to reach 20', () => {
    // Game 5 is Adam birds, Nick lizards, Kyra cats, Matt rats (28). Make it
    // birds 7, frogs 7, bats 4, lizards 2 = 20, with every faction on the
    // player's list, so reach is the only rule that breaks.
    const base = structuredClone(SAMPLE_4)
    const lists = new Map(base.players.map((p) => [p.id, p.list as string[]]))
    const edit = base.games.find((g) => g.gameNo === 5)!
    const swaps = ['birds', 'lizards', 'frogs', 'bats'] // Adam, Nick, Kyra, Matt
    ;(edit.seats as { player: string; faction: string | null }[]).forEach((seat, i) => {
      seat.faction = swaps[i]!
      if (!lists.get(seat.player)!.includes(swaps[i]!)) lists.get(seat.player)!.push(swaps[i]!)
    })
    const result = checkPairing(base)
    expect(result.map((v) => v.rule)).toContain('reach')
    expect(result.find((v) => v.rule === 'reach')).toMatchObject({ gameNo: 5 })
    expect(result.find((v) => v.rule === 'reach')!.message).toContain('20')
  })
})

describe('checkPairing on the small scenario', () => {
  it('passes the valid scenario', () => {
    expect(checkPairing(validScenario())).toEqual([])
  })

  it('rejects reach 20 and names only that rule', () => {
    // birds 7 + frogs 7 + crows 3 + WA 3 = 20, two of each type.
    const input = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'di'], ['birds', 'frogs', 'crows', 'WA']))
    const result = checkPairing(input)
    expect(result.map((v) => v.rule)).toEqual(['reach'])
    expect(result[0]).toMatchObject({ gameNo: 1, players: ['ann', 'bo', 'cy', 'di'] })
    expect(result[0]!.message).toContain('20')
  })

  it('accepts reach 21 on the same table with one faction changed', () => {
    const input = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'di'], ['birds', 'frogs', 'bats', 'WA']))
    expect(checkPairing(input)).toEqual([])
  })

  it('rejects a faction seated twice at one table', () => {
    const input = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'di'], ['cats', 'otters', 'cats', 'bats']))
    const result = checkPairing(input)
    expect(result.map((v) => v.rule)).toEqual(['one-faction'])
    expect(result[0]).toMatchObject({ gameNo: 1, players: ['ann', 'cy'] })
  })

  it('rejects a player repeating a faction in another game', () => {
    // Di has bats in game 1 and again in game 2; game 2 stays valid (reach 25, 2 and 2).
    const input = withGame(
      validScenario(),
      1,
      game(2, ['bo', 'ann', 'di', 'cy'], ['badgers', 'rats', 'bats', 'knaves']),
    )
    const result = checkPairing(input)
    expect(result.map((v) => v.rule)).toEqual(['no-repeat'])
    expect(result[0]).toMatchObject({ gameNo: 2, players: ['di'] })
    expect(result[0]!.message).toContain('games 1 and 2')
  })

  it('rejects a player sitting in the same seat twice', () => {
    // Game 2 order ann, cy, bo, di: Ann is seat 1 again and Di is seat 4 again.
    const input = withGame(
      validScenario(),
      1,
      game(2, ['ann', 'cy', 'bo', 'di'], ['rats', 'badgers', 'knaves', 'lizards']),
    )
    const result = checkPairing(input)
    expect(result.map((v) => v.rule)).toEqual(['seat', 'seat'])
    expect(result.map((v) => v.players)).toEqual([['ann'], ['di']])
    expect(result[0]!.message).toContain('seat 1 in games 1 and 2')
  })

  it('rejects a faction that is not on the player list', () => {
    const input: PairingInput = {
      ...validScenario(),
      players: PLAYERS.map((p) => (p.id === 'di' ? { ...p, list: p.list.filter((c) => c !== 'bats') } : p)),
    }
    const result = checkPairing(input)
    expect(result.map((v) => v.rule)).toEqual(['own-list'])
    expect(result[0]).toMatchObject({ gameNo: 1, players: ['di'] })
    expect(result[0]!.message).toContain('Twilight Council')
  })

  it('rejects a table of only militant factions', () => {
    const input = withGame(validScenario(), 1, game(2, ['bo', 'ann', 'di', 'cy'], ['badgers', 'rats', 'moles', 'birds']))
    const result = checkPairing(input)
    expect(result.map((v) => v.rule)).toEqual(['mix'])
    expect(result[0]!.message).toContain('no insurgent')
  })

  it('rejects a table of only insurgent factions', () => {
    // Four insurgent factions cannot reach 21 (the most they make is 18), so reach breaks too.
    const input = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'di'], ['otters', 'WA', 'bats', 'vagabond']))
    expect(rulesOf(input)).toEqual(['mix', 'reach'])
  })

  it('rejects Vagabond and Knaves at one table even with both types present', () => {
    // rats, badgers, vagabond, knaves: reach 26 and two of each type.
    const input = withGame(
      validScenario(),
      1,
      game(2, ['bo', 'ann', 'di', 'cy'], ['badgers', 'rats', 'vagabond', 'knaves']),
    )
    const result = checkPairing(input)
    expect(result.map((v) => v.rule)).toEqual(['mix'])
    expect(result[0]!.message).toContain('Vagabond and Knaves of the Deepwood')
  })

  it('rejects a seat with no faction, and an unknown faction code', () => {
    const missing = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'di'], ['cats', 'otters', 'WA', null]))
    expect(checkPairing(missing).map((v) => v.rule)).toEqual(['faction'])
    const unknown = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'di'], ['cats', 'otters', 'WA', 'dragons']))
    const result = checkPairing(unknown)
    expect(result.map((v) => v.rule)).toEqual(['faction'])
    expect(result[0]!.message).toContain('dragons')
  })

  it('rejects a table with a repeated player and one with a stranger', () => {
    const repeated = withGame(validScenario(), 0, game(1, ['ann', 'ann', 'cy', 'di'], ['cats', 'otters', 'WA', 'bats']))
    expect(rulesOf(repeated)).toContain('players')
    const stranger = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'zed'], ['cats', 'otters', 'WA', 'bats']))
    expect(checkPairing(stranger).find((v) => v.rule === 'players')!.players).toEqual(['zed'])
  })

  it('rejects a table that is not four seats', () => {
    const three = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy'], ['cats', 'otters', 'WA']))
    expect(rulesOf(three)).toContain('players')
  })

  it('rejects a player with the wrong number of games', () => {
    const input = { ...validScenario(), gamesEach: 3 }
    const result = checkPairing(input)
    expect(result.map((v) => v.rule)).toEqual(['games-each', 'games-each', 'games-each', 'games-each'])
    expect(result[0]!.message).toBe('Ann plays 2 games, not 3')
  })

  it('returns every broken rule at once instead of stopping at the first', () => {
    const input = withGame(validScenario(), 0, game(1, ['ann', 'bo', 'cy', 'di'], ['WA', 'WA', 'crows', 'bats']))
    expect(rulesOf(input)).toEqual(expect.arrayContaining(['one-faction', 'reach', 'mix']))
  })
})
