import { test, expect } from './support/fixtures'
import { PERSONAS, signInAs, restAsPage, expectNoHorizontalScroll, setBrowserTime } from './support/browser'
import { PRIVATE_SEASON_NAME, withDatabase } from './support/database'
import { test as smokeTest, type Page, type Response } from '@playwright/test'
import { expectAccessible } from './support/axe'

async function expectNoLeagueData(page: Page) {
  // Probe real responses even when the gate itself requests only whoami.
  for (const table of ['people', 'whitelist', 'seasons', 'roster', 'roster_public', 'season_stage', 'edit_log', 'app_config']) {
    const response = await restAsPage(page, `${table}?select=*`)
    expect(response.text).not.toContain(PRIVATE_SEASON_NAME)
    if (response.status === 200) expect(JSON.parse(response.text), table).toEqual([])
    else expect([401, 403], `${table}: ${response.text}`).toContain(response.status)
  }
}

// E1 precedes U2: Whitelist is a placeholder. Use the real admin RPC here;
// U2's S02 adds removal through that screen and the same session check.
test('S01: the whitelist gates data and an existing session gains and loses access', async ({ page, context }) => {
  await page.goto('/players')
  await expect(page.getByRole('link', { name: 'Continue with Discord' })).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Players', exact: true })).toHaveCount(0)
  await expectNoLeagueData(page)
  await expectNoHorizontalScroll(page)

  const responses: Promise<string>[] = []
  const capture = (response: Response) => {
    if (response.url().includes('/rest/v1/')) responses.push(response.text())
  }
  page.on('response', capture)
  await signInAs(page, 'outsider')
  await expect(page.getByText('Signed in as Not invited.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expectNoLeagueData(page)
  page.off('response', capture)
  const bodies = await Promise.all(responses)
  expect(bodies.length).toBeGreaterThan(0)
  for (const body of bodies) {
    expect(body).not.toContain(PRIVATE_SEASON_NAME)
    expect(body).not.toMatch(/"(?:ranked_factions|seed_key|capacity|old|new)"\s*:/)
  }
  await expectNoHorizontalScroll(page)
  await withDatabase(async (db) => {
    await db.query('insert into public.whitelist (discord_id, label) values ($1, $2)', [PERSONAS.outsider.id, 'Not invited'])
  })
  // Preserve the browser and JWT: reload must suffice without a second sign-in.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
  const visible = await restAsPage(page, 'seasons?select=name')
  expect(visible.status).toBe(200)
  expect(visible.text).toContain(PRIVATE_SEASON_NAME)
  await expectNoHorizontalScroll(page)

  const adminContext = await context.browser()!.newContext({ baseURL: 'http://127.0.0.1:5173' })
  try {
    const admin = await adminContext.newPage()
    await signInAs(admin, 'admin')
    const removed = await restAsPage(admin, 'rpc/whitelist_remove', { p_discord_id: PERSONAS.outsider.id })
    expect(removed.status, removed.text).toBeLessThan(300)
    // The still-open session's next data request is refused by RLS.
    await expectNoLeagueData(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Not on the list yet' })).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
  } finally {
    await adminContext.close()
  }
})

test('S01: an invited viewer reaches Home and can sign out', async ({ page }) => {
  await signInAs(page, 'viewer')
  await expectNoHorizontalScroll(page)
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await expect(page.getByRole('link', { name: 'Whitelist', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Continue with Discord' })).toBeVisible()
  await expectNoLeagueData(page)
})

// Base test: proves the built preview, widths and browser without a database.
smokeTest('the dev build serves the signed-out gate and stand-in on a deep link', async ({ page }, testInfo) => {
  await setBrowserTime(page, '2026-11-26T12:00:00Z')
  await page.goto('/players')
  await expect(page.getByRole('link', { name: 'Continue with Discord' })).toBeVisible()
  expect(await page.evaluate(() => window.innerWidth)).toBe(testInfo.project.name === 'phone' ? 375 : 1280)
  expect(await page.evaluate(() => new Date().toISOString())).toBe('2026-11-26T12:00:00.000Z')
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
  await page.getByRole('link', { name: 'Continue with Discord' }).click()
  await expect(page).toHaveURL(/\/discord$/)
  await expect(page.getByText('Dev stand-in', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Spectator', exact: true }).click()
  await expect(page.getByLabel('Discord ID', { exact: true })).toHaveValue('100000000000000014')
  await expectNoHorizontalScroll(page)
})
