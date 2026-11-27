import { readFile } from 'node:fs/promises'
import { unzip } from '../src/csv/zip'
import { test, expect } from './support/fixtures'
import { signInAs, restAsPage, expectNoHorizontalScroll } from './support/browser'
import { SEASON_ID, withDatabase } from './support/database'
import { encodeCsv, type CsvFiles } from '../src/csv/format'

test('S13 preview, atomic validation, unchanged import and logged confirmation', async ({ page }) => {
  await signInAs(page, 'admin')
  const exported = await restAsPage(page, 'rpc/export_league_state', { p_season_id: SEASON_ID })
  const files = JSON.parse(exported.text) as CsvFiles
  const season = structuredClone(files['season.csv']!)
  const upload = async () => page.getByLabel('Choose the .csv files, or the zip').setInputFiles({ name: 'season.csv', mimeType: 'text/csv', buffer: Buffer.from(encodeCsv(season)) })
  await page.goto('/admin/csv')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download league state' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('league-state.zip')
  const bytes = await readFile((await download.path())!)
  const archive = await unzip(Uint8Array.from(bytes).buffer)
  expect(Object.keys(archive).sort()).toEqual(Object.keys(files).sort())
  expect(Object.keys(archive).some(name => /pairing/.test(name))).toBe(false)
  await upload()
  await page.getByRole('button', { name: 'Preview changes' }).click()
  await expect(page.getByText('Preview: 0 changes')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
  season.rows[0]!.capacity = 'broken'
  await upload()
  await page.getByRole('button', { name: 'Preview changes' }).click()
  await expect(page.getByRole('alert')).toContainText('season.csv')
  await expect(page.getByRole('alert')).toContainText('capacity')
  await expect(page.getByRole('alert')).toContainText('row')
  const unchanged = await restAsPage(page, 'rpc/export_league_state', { p_season_id: SEASON_ID })
  expect(JSON.parse(unchanged.text)).toEqual(files)
  season.rows[0]!.capacity = (JSON.parse(unchanged.text) as CsvFiles)['season.csv']!.rows[0]!.capacity!
  season.rows[0]!.name = 'CSV edited season'
  await withDatabase(db => db.query('update public.seasons set started_at=now() where id=$1', [SEASON_ID]))
  await page.reload()
  await upload()
  await page.getByRole('button', { name: 'Preview changes' }).click()
  await expect(page.getByText(/The season has started/)).toBeVisible()
  await page.getByRole('button', { name: 'Confirm import' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toBeVisible()
  await withDatabase(async db => {
    const log = await db.query("select new from public.edit_log where table_name='import'")
    expect(log.rows).toHaveLength(1)
    expect(log.rows[0].new.files).toEqual(['season.csv'])
  })
  await expectNoHorizontalScroll(page)
})
