import { test, expect } from './support/fixtures'
import { signInAs, expectNoHorizontalScroll } from './support/browser'
import { SEASON_ID, withDatabase } from './support/database'
import { expectAccessible } from './support/axe'

// Runs on the local Supabase API in CI, in desktop and phone projects.
test('S03: valid layouts, uneven acknowledgement, settings and UTC round trip', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/admin/season')
  await page.getByLabel('Season name', { exact: true }).fill('Season setup trial')
  await page.getByLabel('10 players', { exact: true }).check()
  const games = page.getByRole('group', { name: 'Games each' })
  await expect(games.getByLabel('3 games')).toHaveCount(0)
  await expect(page.getByText(/30 seats/)).toBeVisible()
  await page.getByLabel('8 players', { exact: true }).check()
  for (const name of ['Autumn', 'Winter', 'Lake']) {
    await page.getByRole('button', { name: 'Add map', exact: true }).click()
    await page.getByLabel(`Map ${['Autumn', 'Winter', 'Lake'].indexOf(name) + 1}`, { exact: true }).fill(name)
  }
  for (const each of [2, 3]) {
    await games.getByLabel(`${each} games`, { exact: true }).check()
    await expect(page.getByText(/Meeting spread: 2/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save season', exact: true })).toBeDisabled()
    await page.getByLabel(/I acknowledge the uneven meetings/).check()
    await expect(page.getByRole('button', { name: 'Save season', exact: true })).toBeEnabled()
  }
  for (const faction of ['Marquise de Cat', 'Eyrie Dynasties', 'Woodland Alliance', 'Riverfolk Company']) {
    await page.getByRole('checkbox', { name: faction, exact: true }).check()
  }
  await page.getByLabel('Minimum list length', { exact: true }).fill('3')
  const wallClock = '2027-02-14T19:15:00'
  await page.getByLabel('Lists lock date and time', { exact: true }).fill(wallClock)
  const utc = await page.evaluate((value) => new Date(value).toISOString(), wallClock)
  await page.getByRole('button', { name: 'Save season', exact: true }).click()
  await expect(page.getByText('Season saved.', { exact: true })).toBeVisible()
  await withDatabase(async (db) => {
    const { rows: [season] } = await db.query('select * from public.seasons where id = $1', [SEASON_ID])
    expect(season.name).toBe('Season setup trial')
    expect(season.capacity).toBe(8)
    expect(season.games_each).toBe(3)
    expect(season.maps).toEqual(['Autumn', 'Winter', 'Lake'])
    expect(season.faction_pool).toEqual(['cats', 'birds', 'WA', 'otters'])
    expect(season.min_list_length).toBe(3)
    expect(season.lists_lock_at.toISOString()).toBe(utc)
  })
  await page.reload()
  await expect(page.getByLabel('Lists lock date and time')).toHaveValue(wallClock.replace(/:00$/, ''))
  const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  await expect(page.getByText(`Your time zone is ${zone}.`, { exact: false })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})

test('S03: capacity below league count is refused, Live locks layout, and create starts empty', async ({ page }) => {
  await withDatabase(async (db) => {
    await db.query("update public.seasons set capacity = 12, games_each = 4, maps = array['Autumn','Winter','Lake','Mountain'] where id = $1", [SEASON_ID])
    for (let position = 1; position <= 12; position++) {
      const { rows: [person] } = await db.query('insert into public.people (display_name) values ($1) returning id', [`Setup player ${position}`])
      await db.query("insert into public.roster (season_id, person_id, list, position) values ($1, $2, 'league', $3)", [SEASON_ID, person.id, position])
    }
  })
  await signInAs(page, 'admin')
  await page.goto('/admin/season')
  await page.getByLabel('10 players', { exact: true }).check()
  await page.getByRole('button', { name: 'Save season', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Move people to the waitlist first.')
  await withDatabase(async (db) => { await db.query('update public.seasons set started_at = now() where id = $1', [SEASON_ID]) })
  await page.reload()
  await expect(page.getByLabel('10 players', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('2 games', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add map', exact: true })).toHaveCount(0)
  await page.getByLabel('New season name', { exact: true }).fill('Next season')
  await page.getByRole('button', { name: 'Create season', exact: true }).click()
  await expect(page.getByLabel('Season name', { exact: true })).toHaveValue('Next season')
  await expect(page.getByLabel('12 players', { exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Minimum list length', { exact: true })).toBeEmpty()
  await expect(page.getByLabel('Lists lock date and time', { exact: true })).toBeEmpty()
  await expect(page.getByRole('checkbox', { name: 'Marquise de Cat', exact: true })).not.toBeChecked()
})
