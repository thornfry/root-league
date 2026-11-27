import { test, expect } from './support/fixtures'
import { signInAs, expectNoHorizontalScroll } from './support/browser'
import { SEASON_ID, withDatabase } from './support/database'

test('S10 admin settles a dispute and reopens with an actor history', async ({ page }) => {
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
  await withDatabase(async db => {
    for (let i = 0; i < 2; i++) await db.query('insert into public.submissions(game_id,person_id,winners) values ($1,$2,$3)', [game, ids[i], [ids[i]]])
  })
  await signInAs(page, 'admin')
  await page.goto('/admin')
  await expect(page.getByText('1 game is disputed.')).toBeVisible()
  await page.getByRole('link', { name: 'Open Disputes' }).click()
  await expect(page.getByText('Says: Delaney won')).toBeVisible()
  await expect(page.getByText('Says: Blair won')).toBeVisible()
  await page.getByRole('radio', { name: /Use Delaney/ }).check()
  await page.getByRole('button', { name: 'Settle game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible()
  await page.goto('/admin')
  await expect(page.getByText('No games are disputed.')).toBeVisible()
  await page.goto('/admin/disputes')
  await page.getByRole('button', { name: 'Reopen', exact: true }).click()
  await expect(page.getByText('Says: Blair won')).toBeVisible()
  await expect(page.getByText('Admin settlement added.')).toBeVisible()
  await expect(page.getByText('Admin settlement removed.')).toBeVisible()
  await expectNoHorizontalScroll(page)
  const log = await withDatabase(db => db.query("select e.action, p.display_name from public.edit_log e join public.people p on p.id=e.actor_person_id where e.table_name='settlements' and (e.new->>'game_id'=$1 or e.old->>'game_id'=$1)", [game]))
  expect(log.rows.map(r => r.action).sort()).toEqual(['delete', 'insert'])
  expect(log.rows.every(r => !!r.display_name)).toBe(true)
})
