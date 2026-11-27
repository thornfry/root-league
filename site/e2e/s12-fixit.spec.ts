import { test, expect } from './support/fixtures'
import { signInAs, restAsPage, expectNoHorizontalScroll } from './support/browser'
import { SEASON_ID, withDatabase } from './support/database'

// Runs in both the desktop and the phone project. CI only: it needs the Supabase API and database.
test('S12 admin fixes seats, results, picks and people, and the log shows each change', async ({ page }) => {
  const { game, ids, picker } = await withDatabase(async db => {
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
    await db.query('insert into public.settlements(game_id,winners) values ($1,$2)', [game, [ids[0]]])
    const spectator = await db.query<{ id: string }>("insert into public.people(display_name) values ('Pat Picker') returning id")
    const picker = spectator.rows[0]!.id
    await db.query('insert into public.picks(game_id,person_id,first_pick,second_pick) values ($1,$2,$3,$4)', [game, picker, ids[0], ids[1]])
    return { game, ids, picker }
  })
  const points = async () => JSON.parse((await restAsPage(page, `pickem_scores?select=points&game_id=eq.${game}&person_id=eq.${picker}`)).text) as { points: number }[]

  await signInAs(page, 'admin')
  await page.goto('/admin/fixit?a=results')
  expect((await points())[0]!.points).toBe(3)
  await page.getByRole('group', { name: 'Final winners' }).getByRole('checkbox', { name: 'Blair' }).check()
  await page.getByRole('button', { name: 'Set final result' }).click()
  await expect(page.getByText('Result set.')).toBeVisible()
  expect((await points())[0]!.points).toBe(4)

  // An edit that gives the table reach 20 names the rule and still saves.
  await page.goto('/admin/fixit?a=games')
  await page.getByLabel('Faction, seat 2').selectOption('lizards')
  await page.getByRole('button', { name: 'Save seats' }).click()
  await expect(page.getByText('Seats saved.')).toBeVisible()
  await expect(page.getByText(/Table reach at least 21 \(rule 6\)/).first()).toBeVisible()
  const saved = await withDatabase(db => db.query('select faction from public.game_seats where game_id=$1 and seat=2', [game]))
  expect(saved.rows[0]!.faction).toBe('lizards')

  // The log row shows who, when, old and new.
  const row = page.getByRole('region', { name: 'Edit log' }).getByRole('listitem').filter({ hasText: 'Seats: Table 1 seat 2 changed' }).first()
  await expect(row).toContainText('Dev admin')
  await expect(row).toContainText('faction: birds')
  await expect(row).toContainText('faction: lizards')
  await expect(row.locator('time')).toBeVisible()
  await expectNoHorizontalScroll(page)

  // Void and unvoid.
  await page.goto('/admin/fixit?a=results')
  await page.getByRole('button', { name: 'Void game' }).click()
  await expect(page.getByText('Table 1 is void.')).toBeVisible()
  await page.getByRole('button', { name: 'Unvoid game' }).click()
  await expect(page.getByText('Table 1 is no longer void.')).toBeVisible()

  // Deleting a pick, then a person, states what goes with them.
  await page.goto('/admin/fixit?a=picks')
  await page.getByRole('button', { name: 'Delete pick by Pat Picker on Table 1' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete pick' }).click()
  await expect(page.getByText('Pick deleted.')).toBeVisible()
  await withDatabase(db => db.query('insert into public.picks(game_id,person_id,first_pick) values ($1,$2,$3)', [game, picker, ids[2]]))
  await page.goto('/admin/fixit?a=people')
  await page.getByRole('button', { name: 'Delete Pat Picker' }).click()
  await expect(page.getByRole('dialog').getByText('This also deletes 1 pick.')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete person' }).click()
  await expect(page.getByText('Pat Picker deleted.')).toBeVisible()
  await page.getByRole('button', { name: 'Delete Casey' }).click()
  await expect(page.getByRole('dialog').getByText(/seated in 1 game/)).toBeVisible()
  await expectNoHorizontalScroll(page)
})
