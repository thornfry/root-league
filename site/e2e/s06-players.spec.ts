import { test, expect } from './support/fixtures'
import { expectNoHorizontalScroll, restAsPage, signInAs } from './support/browser'
import { SEASON_ID, setListsLocked, withDatabase } from './support/database'
import { expectAccessible } from './support/axe'

const DELANEY = '30000000-0000-4000-8000-000000000001'
const OTHER = '30000000-0000-4000-8000-000000000002'
const LONG_NAME = 'A player with a very long display name that wraps across the phone screen'

async function setupPlayers() {
  await withDatabase(async (db) => {
    await db.query(`insert into public.people (id, display_name, discord_id) values
      ($1, 'Delaney', '100000000000000002'), ($2, $3, null)`, [DELANEY, OTHER, LONG_NAME])
    await db.query(`insert into public.roster (season_id, person_id, list, position, ranked_factions, list_submitted)
      values ($1, $2, 'league', 1, array['cats', 'birds'], true),
             ($1, $3, 'waitlist', 1, array['WA', 'otters'], false)`, [SEASON_ID, DELANEY, OTHER])
  })
  await setListsLocked(false)
}

test('S06: lists are private through the page and API until lock, then visible to everyone', async ({ page }) => {
  await setupPlayers()
  await signInAs(page, 'player')
  await page.goto('/players')
  await expect(page.getByRole('list', { name: "Delaney's ranked factions" })).toBeVisible()
  await expect(page.getByText('Woodland Alliance', { exact: true })).toHaveCount(0)
  const own = await restAsPage(page, `roster_public?select=ranked_factions&person_id=eq.${DELANEY}`)
  expect(own.status).toBe(200)
  expect(JSON.parse(own.text)).toEqual([{ ranked_factions: ['cats', 'birds'] }])
  const other = await restAsPage(page, `roster_public?select=ranked_factions&person_id=eq.${OTHER}`)
  expect(other.status).toBe(200)
  expect(JSON.parse(other.text)).toEqual([{ ranked_factions: null }])

  // A spectator cannot retrieve even the prospect's list; the page is not the privacy boundary.
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Continue with Discord' })).toBeVisible()
  await signInAs(page, 'viewer')
  await page.goto('/players')
  await expect(page.getByText('List in', { exact: true })).toBeVisible()
  await expect(page.getByText('Waiting', { exact: true })).toBeVisible()
  await expect(page.getByRole('list')).toHaveCount(0)
  const hidden = await restAsPage(page, `roster_public?select=ranked_factions&person_id=eq.${DELANEY}`)
  expect(hidden.status).toBe(200)
  expect(JSON.parse(hidden.text)).toEqual([{ ranked_factions: null }])
  const placement = await restAsPage(page, 'roster_public?select=list,position')
  expect(placement.status).toBe(200)
  expect(JSON.parse(placement.text)).toEqual([{ list: null, position: null }, { list: null, position: null }])
  await expect(page.locator('#main .tag')).toHaveCount(0)
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)

  await setListsLocked()
  await page.reload()
  await expect(page.getByRole('list', { name: "Delaney's ranked factions" })).toBeVisible()
  await expect(page.getByRole('list', { name: `${LONG_NAME}'s ranked factions` })).toBeVisible()
  await expect(page.getByText('Woodland Alliance', { exact: true })).toBeVisible()
  const revealed = await restAsPage(page, `roster_public?select=ranked_factions&person_id=eq.${DELANEY}`)
  expect(revealed.status).toBe(200)
  expect(JSON.parse(revealed.text)).toEqual([{ ranked_factions: ['cats', 'birds'] }])
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})

test('S06: admin sees every ranked list while open with an explanation and no tags', async ({ page }) => {
  await setupPlayers()
  await signInAs(page, 'admin')
  await page.goto('/players')
  await expect(page.getByText(/As admin you see them now/)).toBeVisible()
  await expect(page.getByRole('list', { name: "Delaney's ranked factions" })).toBeVisible()
  await expect(page.getByText('Woodland Alliance', { exact: true })).toBeVisible()
  const response = await restAsPage(page, `roster_public?select=ranked_factions&person_id=eq.${OTHER}`)
  expect(response.status).toBe(200)
  expect(JSON.parse(response.text)).toEqual([{ ranked_factions: ['WA', 'otters'] }])
  await expect(page.locator('#main .tag')).toHaveCount(0)
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})
