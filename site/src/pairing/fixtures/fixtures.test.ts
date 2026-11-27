import { describe, expect, it } from 'vitest'
import { factionByCode } from '../../data/factions'
import sample3Doc from '../../../../planning/season-1/sample-pairings-3-games.md?raw'
import sample4Doc from '../../../../planning/season-1/sample-pairings-4-games.md?raw'
import { tableReach } from '../rules'
import { SAMPLE_3, SAMPLE_4, type SampleFixture } from './samples'

/** The game table and the per-player table of a sample page. */
function parseSample(doc: string) {
  const games = new Map<number, { map: string; seats: { player: string; faction: string }[]; reach: number; mix: string }>()
  for (const line of doc.split('\n')) {
    const c = line.split('|').map((x) => x.trim())
    if (c.length === 10 && /^\d+$/.test(c[1]!)) {
      const seats = c.slice(3, 7).map((cell) => {
        const [player, faction] = cell.split(': ')
        return { player: player!, faction: faction! }
      })
      games.set(Number(c[1]), { map: c[2]!, seats, reach: Number(c[7]), mix: c[8]! })
    }
  }
  const plays: { player: string; gameNo: number; seat: number; map: string; faction: string; rank: number }[] = []
  for (const line of doc.split('\n')) {
    const player = line.split('|')[1]?.trim()
    for (const m of line.matchAll(/Game (\d+), seat (\d), (\w+), (\w+) \(#(\d+)\)/g)) {
      plays.push({ player: player!, gameNo: +m[1]!, seat: +m[2]!, map: m[3]!, faction: m[4]!, rank: +m[5]! })
    }
  }
  return { games, plays }
}

describe.each([
  ['3-game', SAMPLE_3, sample3Doc, 9],
  ['4-game', SAMPLE_4, sample4Doc, 12],
] as [string, SampleFixture, string, number][])('%s sample fixture', (_name, fixture, doc, gameCount) => {
  const parsed = parseSample(doc)

  it('has the games of the page, seat by seat', () => {
    expect(parsed.games.size).toBe(gameCount)
    expect(fixture.games).toHaveLength(gameCount)
    for (const game of fixture.games) {
      const row = parsed.games.get(game.gameNo)!
      expect(fixture.maps[game.map], `game ${game.gameNo} map`).toBe(row.map)
      expect(game.seats.map((s) => ({ player: s.player, faction: factionByCode(s.faction!)?.code })), `game ${game.gameNo}`).toEqual(
        row.seats,
      )
    }
  })

  it("has each game's reach and mix as the page states them", () => {
    for (const game of fixture.games) {
      const row = parsed.games.get(game.gameNo)!
      const codes = game.seats.map((s) => s.faction!)
      expect(tableReach(codes), `game ${game.gameNo} reach`).toBe(row.reach)
      const militant = codes.filter((c) => factionByCode(c)?.type === 'Militant').length
      expect(`${militant} / ${4 - militant}`, `game ${game.gameNo} mix`).toBe(row.mix)
    }
  })

  it("has each player's seat, map and list rank as the page states them", () => {
    expect(parsed.plays).toHaveLength(12 * fixture.gamesEach)
    for (const play of parsed.plays) {
      const game = fixture.games.find((g) => g.gameNo === play.gameNo)!
      const seat = game.seats[play.seat - 1]!
      expect(seat.player).toBe(play.player)
      expect(seat.faction).toBe(play.faction)
      expect(fixture.maps[game.map]).toBe(play.map)
      const list = fixture.players.find((p) => p.id === play.player)!.list
      expect(list.indexOf(play.faction) + 1, `${play.player} ${play.faction}`).toBe(play.rank)
    }
  })
})
