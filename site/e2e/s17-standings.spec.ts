import { test, expect } from './support/fixtures'
import { expectNoHorizontalScroll, restAsPage, signInAs } from './support/browser'
import { SEASON_ID, withDatabase } from './support/database'
import { expectAccessible } from './support/axe'

// Four tables: upcoming, shared-win recorded, disputed, void. Void contributes
// nothing; the dispute remains left. Every player starts at 1 win, 1 played, 2 left.
test('S17: Standings counts outcomes and refreshes after entry, edit and settlement', async ({ page }) => {
  const fixture = await withDatabase(async db => {
    await db.query("update public.seasons set started_at=now(), maps=array['Autumn'] where id=$1", [SEASON_ID])
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const { rows } = await db.query<{ id: string }>('insert into public.people(display_name,discord_id) values ($1,$2) returning id', [i === 0 ? 'Delaney' : `Player ${i}`, i === 0 ? '100000000000000002' : null])
      ids.push(rows[0]!.id)
      await db.query("insert into public.roster(season_id,person_id,list,position,player_number) values ($1,$2,'league',$3,$3)", [SEASON_ID, ids[i], i + 1])
    }
    const games: string[] = []
    for (let n = 0; n < 4; n++) {
      const { rows } = await db.query<{ id: string }>('insert into public.games(season_id,game_no,map_index,void) values ($1,$2,0,$3) returning id', [SEASON_ID, n + 1, n === 3])
      games.push(rows[0]!.id)
      for (let i = 0; i < 4; i++) await db.query('insert into public.game_seats(game_id,seat,person_id,faction) values ($1,$2,$3,$4)', [games[n], i + 1, ids[i], ['cats', 'birds', 'otters', 'WA'][i]])
    }
    await db.query('insert into public.submissions(game_id,person_id,winners) values ($1,$2,$3),($4,$2,$5),($4,$6,$7),($8,$2,$3)', [games[1], ids[0], ids, games[2], [ids[0]], ids[1], [ids[1]], games[3]])
    return { ids, games }
  })
  await signInAs(page, 'player')
  // Standings show a record (wins-losses).
  const assertOwn = async (wins: number, played: number) => {
    await page.goto('/players')
    const own = page.getByRole('table', { name: 'Season standings' }).getByRole('row').filter({ hasText: 'Delaney' })
    await expect(own.getByRole('cell')).toHaveText(`${wins}-${played - wins}`)
    await page.goto('/')
  }
  await assertOwn(1, 1)
  const mine = page.getByRole('region', { name: 'My games' })
  await expect(mine.getByRole('article')).toHaveCount(4)
  await expect(mine.getByRole('link', { name: 'Report result' })).toHaveAttribute('href', '/game/1/result')
  await expect(mine).toContainText('Disputed')
  await expect(mine).toContainText('Void')
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
  for (const winners of [[fixture.ids[0]], [fixture.ids[1]]]) {
    const result = await restAsPage(page, 'rpc/submit_result', { p_game_id: fixture.games[0], p_winners: winners })
    expect(result.status, result.text).toBeLessThan(300)
    await assertOwn(winners[0] === fixture.ids[0] ? 2 : 1, 2)
  }
  await page.evaluate(() => localStorage.clear())
  await signInAs(page, 'admin')
  const settled = await restAsPage(page, 'rpc/settle_game', { p_game_id: fixture.games[2], p_winners: [fixture.ids[0]] })
  expect(settled.status, settled.text).toBeLessThan(300)
  await assertOwn(2, 3)
  await expect(page.getByRole('region', { name: 'My games' })).toHaveCount(0)
  // D5/U14 will add leaderboard parity here when its public contract lands.
})
