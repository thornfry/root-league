import { test, expect } from './support/fixtures'
import { expectNoHorizontalScroll, restAsPage, signInAs } from './support/browser'
import { SEASON_ID, setListsLocked } from './support/database'
import { expectAccessible } from './support/axe'

test('S04: Join opens My list, joins once, and Home offers no Leave button', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Leave league', exact: true })).toHaveCount(0)
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
