import { test, expect } from './support/fixtures'
import { expectNoHorizontalScroll, PERSONAS, restAsPage, signInAs } from './support/browser'
import { expectAccessible } from './support/axe'

const inviteId = '100000000000000101'

test('S02: add, atomic paste, duplicate, label, Admin and confirmed removal', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/admin/whitelist')
  await expect(page.getByRole('heading', { name: 'Whitelist', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /How to copy/ })).toBeVisible()
  await expect(page.getByText('Developer Mode', { exact: true })).toBeVisible()
  await page.getByLabel('Discord user ID', { exact: true }).fill(inviteId)
  await page.getByLabel('Name label (optional)').fill('New spectator')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: inviteId })
  await expect(row).toContainText('New spectator')
  await expect(row).toContainText('Dev admin')
  await page.getByLabel('Discord user ID', { exact: true }).fill(inviteId)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already on the whitelist')

  const valid = ['102', '103', '104', '105'].map((n) => `100000000000000${n}, Bulk ${n}`)
  const paste = page.getByLabel(/Or paste many/)
  await paste.fill([...valid.slice(0, 2), '12ab, Invalid', ...valid.slice(2)].join('\n'))
  await page.getByRole('button', { name: 'Add the valid rows' }).click()
  await expect(page.getByRole('alert')).toContainText('Row 3: "12ab"')
  const absent = await restAsPage(page, 'whitelist?discord_id=in.(100000000000000102,100000000000000103,100000000000000104,100000000000000105)&select=discord_id')
  expect(absent.status).toBe(200)
  expect(JSON.parse(absent.text)).toEqual([])
  await paste.fill(valid.join('\n'))
  await page.getByRole('button', { name: 'Add the valid rows' }).click()
  for (const suffix of ['102', '103', '104', '105']) await expect(page.getByRole('row').filter({ hasText: `100000000000000${suffix}` })).toBeVisible()

  await row.getByRole('button', { name: 'Edit label' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name label', { exact: true }).fill('Renamed spectator')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(row).toContainText('Renamed spectator')
  await row.getByRole('button', { name: 'Make admin' }).click()
  await expect(row.getByRole('button', { name: 'Remove admin' })).toBeVisible()
  await row.getByRole('button', { name: 'Remove admin' }).click()
  await expect(row.getByRole('button', { name: 'Make admin' })).toBeVisible()
  await row.getByRole('button', { name: 'Remove', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(dialog).toContainText('loses access at once')
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(row).toHaveCount(0)
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})

test('S02: removal through the screen revokes the viewer session on its next request', async ({ page, browser }) => {
  await signInAs(page, 'viewer')
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
  try {
    const admin = await context.newPage()
    await signInAs(admin, 'admin')
    await admin.goto('/admin/whitelist')
    await admin.getByRole('row').filter({ hasText: PERSONAS.viewer.id }).getByRole('button', { name: 'Remove', exact: true }).click()
    await admin.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(admin.getByRole('row').filter({ hasText: PERSONAS.viewer.id })).toHaveCount(0)
    const response = await restAsPage(page, 'people?select=id')
    if (response.status === 200) expect(JSON.parse(response.text)).toEqual([])
    else expect([401, 403]).toContain(response.status)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Not on the list yet' })).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
  } finally {
    await context.close()
  }
})
