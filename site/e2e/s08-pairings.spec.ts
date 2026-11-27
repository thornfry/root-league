import { test, expect } from './support/fixtures'
import { signInAs, expectNoHorizontalScroll } from './support/browser'
import { SEASON_ID, withDatabase } from './support/database'

const longName = 'An unusually long player name that must wrap across lines on a phone'
async function setup(live = false) {
  await withDatabase(async db => {
    await db.query("update public.seasons set capacity=8, games_each=2, maps=array['Autumn','Winter'], lists_lock_at=now()+interval '1 day' where id=$1", [SEASON_ID])
    const ids: string[] = []
    for (let i = 0; i < 8; i++) {
      const person = await db.query<{ id: string }>('insert into public.people(display_name, discord_id) values ($1,$2) returning id', [i === 0 ? 'Delaney' : i === 1 ? longName : `Seat player ${i}`, i === 0 ? '100000000000000002' : null])
      const id = person.rows[0]!.id
      ids.push(id)
      await db.query("insert into public.roster(season_id,person_id,list,position,player_number) values ($1,$2,'league',$3,$3)", [SEASON_ID, id, i + 1])
    }
    if (!live) return
    await db.query('update public.seasons set started_at=now() where id=$1', [SEASON_ID])
    for (let i = 0; i < 5; i++) {
      const g = await db.query<{ id: string }>('insert into public.games(season_id,game_no,map_index,void) values ($1,$2,0,$3) returning id', [SEASON_ID, i + 1, i === 4])
      const gid = g.rows[0]!.id
      // Only table 1 includes the signed-in player; table 2 tests a non-seated read.
      const seats = i === 0 ? ids.slice(0, 4) : ids.slice(1, 5)
      for (let j = 0; j < 4; j++) await db.query('insert into public.game_seats(game_id,seat,person_id,faction) values ($1,$2,$3,$4)', [gid, j + 1, seats[j], ['cats', 'birds', 'otters', 'WA'][j]])
      if (i === 1 || i === 3) await db.query('insert into public.submissions(game_id,person_id,winners) values ($1,$2,$3)', [gid, seats[0], [seats[0]]])
      if (i === 2) await db.query('insert into public.settlements(game_id,winners,settled_by) values ($1,$2,$3)', [gid, [seats[0]], seats[0]])
      if (i === 3) await db.query('insert into public.submissions(game_id,person_id,winners) values ($1,$2,$3)', [gid, seats[1], [seats[1]]])
    }
  })
}

test('S08 pre-start layout hides names and factions for every persona', async ({ page }) => {
  await setup()
  for (const persona of ['viewer', 'player', 'admin'] as const) {
    if (page.url() !== 'about:blank') await page.evaluate(() => localStorage.clear())
    await signInAs(page, persona)
    await page.goto('/pairings')
    const main = page.getByRole('main')
    await expect(main.getByText('P1', { exact: true }).first()).toBeVisible()
    await expect(main).toContainText('Lists lock')
    await expect(main).not.toContainText('Delaney')
    await expect(main).not.toContainText(longName)
    await expect(main).not.toContainText('Marquise de Cat')
    await expect(main.getByRole('article')).toHaveCount(4)
    await expectNoHorizontalScroll(page)
  }
})

test('S08 live counts, read-only non-seated game and phone wrapping', async ({ page }) => {
  await setup(true)
  await signInAs(page, 'player')
  await page.goto('/pairings')
  await expect(page.getByRole('button', { name: 'All 5' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Mine 1' }).click()
  const games = page.locator('.pairing-cards:visible article, .pairing-table:visible tbody tr')
  await expect(games).toHaveCount(1)
  await page.getByRole('button', { name: 'Completed 2' }).click()
  await expect(games).toHaveCount(2)
  await page.getByRole('button', { name: 'Upcoming 2' }).click()
  await expect(games).toHaveCount(2)
  await expect(page.locator('.pairing-cards:visible, .pairing-table:visible')).toContainText('Disputed')
  await expectNoHorizontalScroll(page)
  await page.goto('/game/2')
  await expect(page.getByRole('heading', { name: 'Table 2 Autumn' })).toBeVisible()
  await expect(page.locator('.game-seats > li')).toHaveCount(4)
  await expect(page.getByRole('main')).toContainText(longName)
  await expect(page.getByRole('main')).toContainText('Woodland Alliance')
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expectNoHorizontalScroll(page)
  await page.goto('/game/4')
  await expect(page.getByRole('main')).toContainText('The admin will decide.')
  await expect(page.getByRole('main')).not.toContainText('Won by')
  await page.evaluate(() => localStorage.clear())
  await signInAs(page, 'viewer')
  await page.goto('/pairings')
  await expect(page.getByRole('button', { name: 'All 5' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Mine/ })).toHaveCount(0)
})
