import { test, expect } from './support/fixtures'
import { signInAs, restAsPage, expectNoHorizontalScroll } from './support/browser'
import { SEASON_ID, withDatabase } from './support/database'

test('S11 hidden picks, scoring, disputes, voids and shared ranks', async ({ page }) => {
  const { game, ids } = await withDatabase(async db => {
    await db.query("update public.seasons set capacity=8,games_each=2,maps=array['Autumn','Winter'],started_at=now(),lists_lock_at=now()-interval '1 day' where id=$1", [SEASON_ID])
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const p = await db.query<{ id: string }>('insert into public.people(display_name,discord_id) values ($1,$2) returning id', [['Delaney', 'Blair', 'Casey', 'Devon'][i], i === 0 ? '100000000000000002' : null])
      ids.push(p.rows[0]!.id)
      await db.query("insert into public.roster(season_id,person_id,list,position,player_number) values ($1,$2,'league',$3,$3)", [SEASON_ID, ids[i], i + 1])
    }
    const g = await db.query<{ id: string }>('insert into public.games(season_id,game_no,map_index) values ($1,1,0) returning id', [SEASON_ID])
    const game = g.rows[0]!.id
    for (let i = 0; i < 4; i++) await db.query('insert into public.game_seats(game_id,seat,person_id,faction) values ($1,$2,$3,$4)', [game, i + 1, ids[i], ['cats', 'birds', 'otters', 'WA'][i]])
    return { game, ids }
  })
  await signInAs(page, 'viewer')
  await page.goto('/pickems')
  const table = page.getByRole('article', { name: 'Table 1' })
  const delaney = table.getByRole('button', { name: /Delaney/ })
  await delaney.click()
  await expect(delaney).toHaveAttribute('aria-pressed', 'true')
  await delaney.click()
  await expect(delaney).toHaveAttribute('aria-pressed', 'false')
  await delaney.click()
  await table.getByRole('button', { name: /Blair/ }).click()
  await expect(table.getByText('2nd pick')).toBeVisible()
  await expect(delaney).toBeEnabled()
  await page.evaluate(() => localStorage.clear())
  await signInAs(page, 'admin')
  await page.goto('/pickems')
  // Picks stay hidden: the admin reads only their own, and has none yet.
  await expect(page.getByRole('article', { name: 'Table 1' }).getByText('1st pick')).toHaveCount(0)
  expect((await restAsPage(page, 'rpc/save_pick', { p_game_id: game, p_first: ids[0], p_second: ids[1] })).status).toBe(204)
  await page.evaluate(() => localStorage.clear())
  await signInAs(page, 'player')
  await page.goto('/pickems')
  await expect(page.getByRole('article', { name: 'Table 1' })).toHaveCount(0)
  await page.goto('/game/1/result')
  await page.getByRole('checkbox', { name: 'Delaney' }).check()
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  const scored = async (text: string) => {
    await page.evaluate(() => localStorage.clear())
    await signInAs(page, 'viewer')
    await page.goto('/pickems')
    await page.getByRole('button', { name: /^Done / }).click()
    await expect(page.getByRole('article', { name: 'Table 1' })).toContainText(text)
    await page.evaluate(() => localStorage.clear())
  }
  await scored('You scored 3 points: Delaney won.')
  await signInAs(page, 'player')
  await page.goto('/game/1/result')
  await page.getByRole('checkbox', { name: 'Blair' }).check()
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await scored('You scored 4 points: Delaney and Blair won.')
  await signInAs(page, 'viewer')
  await page.goto('/pickems/leaderboard')
  // The viewer and the admin tie on 4 points and share rank 1.
  await expect(page.getByRole('cell', { name: '1', exact: true })).toHaveCount(2)
  await withDatabase(db => db.query('insert into public.submissions(game_id,person_id,winners) values ($1,$2,$3)', [game, ids[1], [ids[1]]]))
  await page.goto('/pickems')
  await page.getByRole('button', { name: /^Done / }).click()
  await expect(page.getByRole('article', { name: 'Table 1' })).toContainText('Scoring paused until the admin settles the game.')
  await withDatabase(db => db.query('delete from public.submissions where game_id=$1 and person_id=$2', [game, ids[1]]))
  await withDatabase(db => db.query('update public.submissions set winners=$2 where game_id=$1', [game, [ids[1]]]))
  await page.reload()
  await page.getByRole('button', { name: /^Done / }).click()
  await expect(page.getByRole('article', { name: 'Table 1' })).toContainText('You scored 1 point: Blair won.')
  await withDatabase(db => db.query('update public.games set void=true where id=$1', [game]))
  await page.reload()
  await page.getByRole('button', { name: /^Done / }).click()
  await expect(page.getByRole('article', { name: 'Table 1' })).toContainText('Void games score nothing.')
  await expectNoHorizontalScroll(page)
})
