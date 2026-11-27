import { test, expect } from './support/fixtures'
import { expectNoHorizontalScroll, restAsPage, signInAs } from './support/browser'
import { SEASON_ID, setListsLocked, withDatabase } from './support/database'
import { expectAccessible } from './support/axe'

async function prepare() {
  await withDatabase(async db => {
    await db.query("update public.seasons set capacity = 8, games_each = 2, maps = array['Autumn','Winter'], faction_pool = array['cats','birds','WA'], min_list_length = 2, lists_lock_at = now() + interval '1 day' where id = $1", [SEASON_ID])
  })
}

test('S05: add, reorder, remove, submit, reload, pool flag and locked read-only', async ({ page }) => {
  await prepare()
  await signInAs(page, 'player')
  expect((await restAsPage(page, 'rpc/join_league', { p_season_id: SEASON_ID })).status).toBe(204)
  await page.goto('/my-list')
  const submit = page.getByRole('button', { name: 'Submit list', exact: true })
  await expect(submit).toHaveCount(2)
  await expect(submit.first()).toBeDisabled()
  await page.getByRole('button', { name: 'Add Marquise de Cat' }).click()
  await page.getByRole('button', { name: 'Add Eyrie Dynasties' }).click()
  await page.getByRole('button', { name: 'Move Eyrie Dynasties up' }).click()
  await expect(page.getByRole('status', { name: 'List updates' })).toContainText('rank 1')
  await page.getByRole('button', { name: 'Remove Marquise de Cat' }).click()
  await expect(submit.first()).toBeDisabled()
  await page.getByRole('button', { name: 'Add Woodland Alliance' }).click()
  await submit.last().click()
  await expect(page.getByRole('status', { name: 'List updates' })).toHaveText('List submitted.')
  await page.reload()
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible()
  const rows = page.getByLabel('Ranked factions')
  await expect(rows.locator('strong').first()).toHaveText('Eyrie Dynasties')
  await expect(page.getByRole('link', { name: /About Eyrie Dynasties/ })).toHaveAttribute('href', 'https://www.therootdatabase.com/faction/eyrie-dynasties/')
  await expect(page.locator('.my-list-lock')).toHaveCount(1)
  const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  await expect(page.locator('.my-list-lock')).toContainText(zone)
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
  await withDatabase(async db => {
    await db.query("update public.seasons set faction_pool = array['cats','birds'] where id = $1", [SEASON_ID])
  })
  await page.reload()
  await expect(page.getByText(/Woodland Alliance is outside the season pool/)).toBeVisible()
  await expect(submit.first()).toBeDisabled()
  await setListsLocked()
  await page.reload()
  await expect(page.getByText('Locked', { exact: true })).toBeVisible()
  await expect(submit).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Move .* up|Remove Woodland/ })).toHaveCount(0)
})

test('S05: admin edits any player list after lock', async ({ page }) => {
  await prepare()
  await signInAs(page, 'player')
  await restAsPage(page, 'rpc/join_league', { p_season_id: SEASON_ID })
  await setListsLocked()
  await page.evaluate(() => localStorage.clear())
  await signInAs(page, 'admin')
  await page.goto('/my-list')
  await page.getByLabel('Edit a player’s list').selectOption({ label: 'Delaney' })
  await page.getByRole('button', { name: 'Add Marquise de Cat' }).click()
  await page.getByRole('button', { name: 'Add Eyrie Dynasties' }).click()
  await page.getByRole('button', { name: 'Submit list', exact: true }).first().click()
  await expect(page.getByRole('status', { name: 'List updates' })).toHaveText('List submitted.')
  await expectAccessible(page)
})
