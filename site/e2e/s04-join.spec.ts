import { test, expect } from './support/fixtures'
import { expectNoHorizontalScroll, restAsPage, signInAs } from './support/browser'
import { SEASON_ID, setListsLocked, withDatabase } from './support/database'
import { expectAccessible } from './support/axe'

test('S04: Join opens My list, joins once, and Leave clears the saved list', async ({ page }) => {
  await signInAs(page, 'viewer')
  await page.getByRole('button', { name: 'Join league', exact: true }).click()
  await expect(page).toHaveURL(/\/my-list$/)
  await expect(page.getByRole('heading', { name: "You're on the list!", exact: true })).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText(/waitlist|league list|queue|position/i)
  const again = await restAsPage(page, 'rpc/join_league', { p_season_id: SEASON_ID })
  expect(again.status, again.text).toBeLessThan(300)
  const own = await restAsPage(page, `roster_public?select=person_id&season_id=eq.${SEASON_ID}&is_me=eq.true`)
  expect(JSON.parse(own.text)).toHaveLength(1)
  await page.goto('/')
  await expect(page.getByText('Not submitted yet.', { exact: true })).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText(/waitlist|league list|queue|position/i)
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
  // Seed a draft: leave must discard the entire row, including these factions.
  await withDatabase(async db => {
    await db.query('update public.roster set ranked_factions = $1 where season_id = $2 and person_id = (select id from public.people where discord_id = $3)', [['cats', 'birds'], SEASON_ID, '100000000000000014'])
  })
  await page.getByRole('button', { name: 'Leave league', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('Not submitted yet.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Leave league', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Leave league', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Join league', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Join league', exact: true }).click()
  await expect(page.getByRole('heading', { name: "You're on the list!", exact: true })).toBeVisible()
  const cleared = await restAsPage(page, `roster_public?select=ranked_factions,list_in&season_id=eq.${SEASON_ID}&is_me=eq.true`)
  expect(JSON.parse(cleared.text)).toEqual([{ ranked_factions: [], list_in: false }])
})

test('S04: the closed note replaces Join after lists lock', async ({ page }) => {
  await setListsLocked()
  await signInAs(page, 'viewer')
  await expect(page.getByRole('heading', { name: 'Joining is closed' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Join league', exact: true })).toHaveCount(0)
  const refused = await restAsPage(page, 'rpc/join_league', { p_season_id: SEASON_ID })
  expect(refused.status).toBeGreaterThanOrEqual(400)
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})
