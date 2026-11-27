import { test, expect } from './support/fixtures'
import { expectNoHorizontalScroll, restAsPage, signInAs } from './support/browser'
import { SEASON_ID, withDatabase } from './support/database'
import { expectAccessible } from './support/axe'

test('S07: move buttons, keyboard move, reorder, swap, add, remove, privacy and Live', async ({ page, context }) => {
  test.setTimeout(90_000)
  await withDatabase(async (db) => {
    await db.query('update public.seasons set capacity = 8 where id = $1', [SEASON_ID])
    await db.query(`insert into public.people (display_name, seed_key)
      select 'Roster ' || n, 's07-' || n from generate_series(1, 10) n`)
    await db.query(`insert into public.roster (season_id, person_id, list, position)
      select $1, id, case when n <= 8 then 'league' else 'waitlist' end,
      case when n <= 8 then n else n - 8 end
      from (select id, replace(seed_key, 's07-', '')::int n from public.people where seed_key like 's07-%') p`, [SEASON_ID])
  })
  await signInAs(page, 'admin')
  await page.goto('/admin/roster')
  await expect(page.getByText('8 of 8', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Move Roster 9 to league list', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Move someone off first')
  await page.getByRole('button', { name: 'Cancel swap' }).click()
  await page.getByRole('button', { name: 'Move Roster 1 to waitlist', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Roster update' })).toContainText('Roster 1 moved to the waitlist.')
  await expect(page.getByText(/1 place is open/)).toBeVisible()
  const move = page.getByRole('button', { name: 'Move Roster 9 to league list', exact: true })
  await move.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status', { name: 'Roster update' })).toContainText('Roster 9 moved to the league list.')
  await page.getByRole('button', { name: 'Move Roster 10 to league list', exact: true }).click()
  await page.getByLabel('Swap with').selectOption({ label: 'Roster 2' })
  await page.getByRole('button', { name: 'Swap Roster 10 in', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Roster update' })).toContainText('Roster 10 swapped into the league list.')
  await page.getByRole('button', { name: 'Move Roster 1 up the waitlist', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Roster update' })).toContainText('Roster 1 moved to the waitlist.')
  await page.getByLabel('Name', { exact: true }).fill('Added player')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Roster update' })).toContainText('Added player added to the waitlist.')
  await page.getByRole('button', { name: 'Remove Added player', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('ranked list of 0 factions')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('Added player', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Added player', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from roster', exact: true }).click()
  await expect(page.getByText('Added player', { exact: true })).toHaveCount(0)
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)

  // A separate real player session must receive neither list nor position, before and after a move.
  const viewerContext = await context.browser()!.newContext({ baseURL: 'http://127.0.0.1:5173' })
  try {
    const viewer = await viewerContext.newPage()
    await signInAs(viewer, 'viewer')
    const snapshot = async () => {
      const response = await restAsPage(viewer, `roster_public?season_id=eq.${SEASON_ID}&select=person_id,display_name,list,position&order=person_id`)
      expect(response.status).toBe(200)
      const rows = JSON.parse(response.text) as { list: string | null; position: number | null }[]
      expect(rows.length).toBe(10)
      for (const row of rows) { expect(row.list).toBeNull(); expect(row.position).toBeNull() }
      return rows
    }
    const before = await snapshot()
    await page.getByRole('button', { name: 'Move Roster 9 to waitlist', exact: true }).click()
    await expect(page.getByRole('status', { name: 'Roster update' })).toContainText('Roster 9 moved to the waitlist.')
    expect(await snapshot()).toEqual(before)
    await viewer.goto('/admin/roster')
    await expect(viewer.getByRole('heading', { name: 'Home' })).toBeVisible()
  } finally { await viewerContext.close() }

  await withDatabase(async (db) => {
    await db.query('update public.seasons set started_at = now() where id = $1', [SEASON_ID])
  })
  await page.reload()
  await expect(page.getByText(/The season has started/)).toBeVisible()
  for (const button of await page.getByRole('button', { name: /^(Move |Remove Roster)/ }).all()) await expect(button).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
  const forbidden = await restAsPage(page, 'rpc/roster_move', { p_season_id: SEASON_ID, p_person_id: (await withDatabase(async (db) => (await db.query("select id from public.people where seed_key = 's07-9'")).rows[0] as { id: string })).id, p_to_list: 'league' })
  expect(forbidden.status).toBeGreaterThanOrEqual(400)
})
