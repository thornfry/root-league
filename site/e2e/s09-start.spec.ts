import { test, expect } from './support/fixtures'
import { signInAs, expectNoHorizontalScroll } from './support/browser'
import { expectAccessible } from './support/axe'
import { SEASON_ID, withDatabase } from './support/database'
import { FACTIONS } from '../src/data/factions'
// Requires the CI Supabase stack; exercises the real worker and publish RPC.
test('S09: draft reproducibility, reload discards, publication closes joining', async ({ page }) => {
  await withDatabase(async db => {
    const pool = FACTIONS.map(f => f.code)
    await db.query("update public.seasons set capacity=8,games_each=2,maps=array['Autumn','Winter'],faction_pool=$2,min_list_length=2,lists_lock_at=now()+interval '1 day' where id=$1", [SEASON_ID, pool])
    for (let i = 0; i < 8; i++) {
      const { rows: [p] } = await db.query('insert into public.people(display_name) values ($1) returning id', [`Draft player ${i}`])
      await db.query("insert into public.roster(season_id,person_id,list,position,ranked_factions,list_submitted) values ($1,$2,'league',$3,$4,true)", [SEASON_ID, p.id, i + 1, pool])
    }
  })
  await signInAs(page, 'admin'); await page.goto('/admin/start')
  await expect(page.getByRole('button', { name: 'Assign factions', exact: true })).toBeDisabled()
  await withDatabase(async db => { await db.query("update public.seasons set lists_lock_at=now()-interval '1 day' where id=$1", [SEASON_ID]) })
  await page.reload()
  await page.getByLabel('Seed', { exact: true }).fill('s09-repeatable')
  await page.getByRole('button', { name: 'Assign factions', exact: true }).click()
  await expect(page.getByText('All hard rules met.', { exact: true })).toBeVisible({ timeout: 20000 })
  const first = await page.getByRole('heading', { name: /^P1:/ }).textContent()
  await expectNoHorizontalScroll(page); await expectAccessible(page)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Publish pairings', exact: true })).toHaveCount(0)
  await page.getByLabel('Seed', { exact: true }).fill('s09-repeatable')
  await page.getByRole('button', { name: 'Assign factions', exact: true }).click()
  await expect(page.getByText('All hard rules met.', { exact: true })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('heading', { name: /^P1:/ })).toHaveText(first!)
  await page.getByRole('button', { name: 'Publish pairings', exact: true }).click()
  await expect(page.getByText(/The season has started/)).toBeVisible()
  await page.evaluate(() => localStorage.clear()); await signInAs(page, 'viewer'); await page.goto('/pairings')
  await expect(page.getByRole('main')).toContainText('Draft player')
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Join league', exact: true })).toHaveCount(0)
})
