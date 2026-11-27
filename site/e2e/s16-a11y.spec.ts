import type { Page, TestInfo } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { expectAccessible } from './support/axe'
import { signInFast } from './support/api'
import { expectNoHorizontalScroll } from './support/browser'
import { SEASON_ID, setListsLocked, withDatabase } from './support/database'
import { identity } from './support/people'
import { addPick, addToRoster, configureSeason, createPeople, seedLiveSeason } from './support/scenario'

// S16: axe over every page and state in the design, at both widths (the project decides the width), plus the keyboard
// order on the roster board and the pick panel (desktop only). Colour is never the only signal: axe's colour and
// link-in-text-block rules run, and every status tag must carry a word.
//
// Each scenario signs in by placing a real session in storage (see support/api.ts); S01 and S14 use the sign-in page.

/** Waits for the page to finish loading, then runs the checks every page and state must pass. */
async function audit(page: Page, ready: string | RegExp) {
  await expect(page.getByRole('main')).toContainText(ready)
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0)
  await expectNoHorizontalScroll(page)
  const wordless = await page.$$eval('.tag', (tags) => tags.filter((tag) => !tag.textContent?.trim()).length)
  expect(wordless, 'every status tag carries a word').toBe(0)
  await expectAccessible(page)
}

async function visit(page: Page, path: string, ready: string | RegExp) {
  await page.goto(path)
  await audit(page, ready)
}

const cast = identity

test('S16: signed-out pages and the not-invited page', async ({ page }) => {
  await page.goto('/')
  await audit(page, 'Continue with Discord')
  await page.getByRole('link', { name: 'Continue with Discord' }).click()
  await audit(page, 'Dev stand-in')
  // The consent page with an error showing.
  await page.getByLabel('Discord ID', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Authorise', exact: true }).click()
  await expect(page.getByText('A Discord ID is 15 to 20 digits.')).toBeVisible()
  await audit(page, 'Dev stand-in')
  await signInFast(page, cast('Not invited'))
  await audit(page, 'Not on the list yet')
  await page.getByRole('button', { name: 'Check again', exact: true }).click()
  await expect(page.getByText('Still not on the list.')).toBeVisible()
  await audit(page, 'Still not on the list.')
})

async function seedOpenSeason() {
  return withDatabase(async (db) => {
    await configureSeason(db)
    const ids = await createPeople(db, ['Dev admin', 'Delaney', 'Alex', 'Matt', 'Nick', 'Adam', 'Zach', 'Kyra', 'Anthony', 'David', 'Spectator'])
    await addToRoster(db, ids, 'league', ['Delaney', 'Alex', 'Matt', 'Nick', 'Adam', 'Zach', 'Kyra', 'Anthony'])
    await addToRoster(db, ids, 'waitlist', ['David'], { factions: ['cats', 'birds'] })
    // A prospect who has joined and ranked nothing.
    await db.query("insert into public.roster (season_id, person_id, list, position) values ($1, $2, 'waitlist', 2)", [SEASON_ID, ids.Spectator])
    return ids
  })
}

test('S16: a viewer with the season open', async ({ page }, testInfo: TestInfo) => {
  test.setTimeout(120_000)
  await seedOpenSeason()
  await signInFast(page, cast('Corey'))
  await audit(page, 'Join league')
  if (testInfo.project.name === 'phone') {
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Menu' })).toBeVisible()
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Close menu', exact: true }).click()
  }
  await visit(page, '/players', 'Not ready')
  await visit(page, '/pairings', 'Not started.')
  await visit(page, '/pickems', /open when pairings are published/)
  await visit(page, '/info', 'League info')
  await visit(page, '/info/rules', 'League info')
  await visit(page, '/no-such-page', 'Page not found')
})

test('S16: a prospect with the season open', async ({ page }) => {
  test.setTimeout(120_000)
  await seedOpenSeason()
  // Submitted list.
  await signInFast(page, cast('Delaney'))
  await audit(page, 'Ready')
  await visit(page, '/my-list', 'Add a faction')
  await visit(page, '/players', 'Ready')
  // A prospect who has ranked nothing: the warning state and the empty list.
  await signInFast(page, cast('Spectator'))
  await audit(page, 'Not ready yet.')
  await visit(page, '/my-list', 'Nothing ranked yet.')
  await page.getByRole('button', { name: 'Add Marquise de Cat' }).click()
  await expect(page.getByRole('status', { name: 'List updates' })).toContainText('added')
  await audit(page, 'Unsaved changes')
})

test('S16: the admin pages with the season open', async ({ page }) => {
  test.setTimeout(240_000)
  await seedOpenSeason()
  await signInFast(page, cast('Dev admin'), '/admin')
  await audit(page, 'Lists open')
  await visit(page, '/admin/whitelist', 'Dev admin')
  await page.getByRole('button', { name: 'Edit label' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  // Pasted rows with a bad line: the error state.
  await page.getByLabel('Or paste many, one per line: ID, label').fill('12\n100000000000000101, Guest')
  await page.getByRole('button', { name: 'Check rows', exact: true }).click()
  await audit(page, 'Nothing added.')

  await visit(page, '/admin/roster', 'The league list is full.')
  // The refused drop: a full league list names the swap.
  await page.getByRole('button', { name: 'Move David to league list', exact: true }).click()
  await expect(page.getByRole('alert').first()).toContainText('league list is full')
  await audit(page, 'Swap David into the league list')
  await page.getByRole('button', { name: 'Cancel swap' }).click()
  await page.getByRole('button', { name: 'Remove David', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()

  await visit(page, '/admin/season', 'Uneven meetings')
  await page.getByLabel('I acknowledge the uneven meetings. Use it anyway.').check()
  await audit(page, 'Uneven meetings')
  await visit(page, '/admin/start', 'Not ready to start')
  await visit(page, '/admin/disputes', 'Nothing is disputed.')
  await visit(page, '/admin/fixit', 'There are no games yet.')
  await visit(page, '/admin/fixit?a=people', 'Link a sign-in to a seeded name')
  await visit(page, '/admin/fixit?a=roster', 'Edit log')
  await visit(page, '/admin/fixit?a=season', 'Season settings and dates')
  await visit(page, '/admin/csv', 'Import league state')
  await expect(page.getByRole('button', { name: 'Download league state' })).toBeEnabled()
  // The failure state: a file that is not a league file.
  await page.getByLabel('Choose the .csv files, or the zip').setInputFiles({ name: 'season.csv', mimeType: 'text/csv', buffer: Buffer.from('id,name\n1,x\n') })
  await page.getByRole('button', { name: 'Preview changes' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await audit(page, 'Nothing imported.')
})

test('S16: locked lists and the draft report', async ({ page }) => {
  test.setTimeout(240_000)
  await seedOpenSeason()
  await setListsLocked()
  await signInFast(page, cast('Corey'))
  await audit(page, 'Joining is closed')
  await visit(page, '/players', 'Marquise de Cat')
  await signInFast(page, cast('Delaney'), '/my-list')
  await audit(page, 'Locked')
  await visit(page, '/', 'Lists are locked')
  await signInFast(page, cast('Dev admin'), '/admin')
  await audit(page, 'Lists locked, season not started')
  await visit(page, '/admin/start', 'Ready to start')
  await page.getByLabel('Seed', { exact: true }).fill('s16-seed')
  await page.getByRole('button', { name: 'Assign factions', exact: true }).click()
  await expect(page.getByText('All hard rules met.', { exact: true })).toBeVisible({ timeout: 30_000 })
  await audit(page, 'Draft report')
})

test('S16: a live season, every game state', async ({ page }) => {
  test.setTimeout(300_000)
  const live = await seedLiveSeason(['recorded', 'disputed', 'settled', 'void', 'upcoming'])
  const [recorded, disputed, , voided, open] = live.games
  await withDatabase(async (db) => {
    const id = live.ids
    // A tie for first on the leaderboard, a paused pick, a void pick, and an open pick that stays hidden.
    await addPick(db, recorded!.id, id.David!, id.Delaney!, id.Matt!)
    await addPick(db, recorded!.id, id.Chuck!, id.Delaney!)
    await addPick(db, disputed!.id, id.Chuck!, id.Adam!)
    await addPick(db, voided!.id, id.Chuck!, id.Matt!)
    await addPick(db, open!.id, id.Spectator!, id.Delaney!)
  })

  // A league player seated at the recorded, settled and open games.
  await signInFast(page, cast('Delaney'))
  await audit(page, 'My games')
  await visit(page, '/pairings', 'Table 1')
  for (const filter of ['Mine', 'Completed', 'Upcoming']) {
    await page.getByRole('button', { name: new RegExp(`^${filter} `) }).click()
    await audit(page, 'Table')
  }
  await visit(page, '/game/1', 'Result')
  await visit(page, '/game/3', 'Settled by admin')
  await visit(page, '/game/5', 'Who won?')
  await page.getByRole('checkbox', { name: 'Delaney' }).check()
  await audit(page, 'Who won?')
  await visit(page, '/pickems', 'Score')
  await visit(page, '/pickems/leaderboard', 'Pick’em leaderboard')
  await visit(page, '/players', 'Delaney')

  // A viewer who is not in the league: the live Home, the pick panel and the unrevealed pick.
  await signInFast(page, cast('Spectator'))
  await audit(page, 'Season in progress')
  await visit(page, '/pickems', 'Picks open')

  // The admin pages with games in play.
  await signInFast(page, cast('Dev admin'), '/admin')
  await audit(page, '1 game is disputed.')
  await visit(page, '/admin/disputes', 'Settle this game')
  await page.getByRole('radio', { name: /^Use / }).first().check()
  await audit(page, 'Settle this game')
  await visit(page, '/admin/fixit?a=games', 'Table 1')
  await visit(page, '/admin/fixit?a=results', 'Final result')
  await visit(page, '/admin/fixit?a=picks', 'Delete pick')
  await visit(page, '/admin/fixit?a=people', 'Link a sign-in to a seeded name')
  await page.getByRole('button', { name: 'Delete Delaney', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|Cancel)$/ }).click()
  await visit(page, '/admin/roster', 'The season has started')
  await visit(page, '/admin/season', 'locked now the season has started')
  await visit(page, '/admin/start', 'The season has started.')
})

test('S16: keyboard order on the roster board', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Keyboard order is checked on desktop only.')
  test.setTimeout(90_000)
  await withDatabase(async (db) => {
    await configureSeason(db)
    const ids = await createPeople(db, ['Delaney', 'Alex', 'Matt', 'Nick', 'Adam'])
    await addToRoster(db, ids, 'league', ['Delaney', 'Alex', 'Matt'])
    await addToRoster(db, ids, 'waitlist', ['Nick', 'Adam'])
  })
  await signInFast(page, cast('Dev admin'), '/admin/roster')
  await expect(page.getByText('3 of 8', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Move Delaney to waitlist', exact: true }).focus()
  // Row by row: the move button, the waitlist arrows that apply, then Remove. Disabled controls are skipped.
  const expected = [
    'Remove Delaney',
    'Move Alex to waitlist', 'Remove Alex',
    'Move Matt to waitlist', 'Remove Matt',
    'Move Nick to league list', 'Move Nick down the waitlist', 'Remove Nick',
    'Move Adam to league list', 'Move Adam up the waitlist', 'Remove Adam',
    'Name',
  ]
  const seen: string[] = []
  for (let step = 0; step < expected.length; step++) {
    await page.keyboard.press('Tab')
    seen.push(await focusedName(page))
  }
  expect(seen).toEqual(expected)
  // The keyboard alone moves someone: the move button works with Enter and focus stays on a real control.
  await page.getByRole('button', { name: 'Move Nick to league list', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status', { name: 'Roster update' })).toContainText('Nick moved to the league list.')
})

test('S16: keyboard order on the pick cells', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Keyboard order is checked on desktop only.')
  test.setTimeout(90_000)
  await seedLiveSeason(['upcoming'])
  await signInFast(page, cast('Spectator'), '/pickems')
  const card = page.getByRole('article', { name: 'Table 1' })
  const cells = card.getByRole('button')
  await expect(cells).toHaveCount(4)
  // Each cell is a button in seat order, reachable by Tab and chosen with Enter. There is no Save button.
  await cells.first().focus()
  await page.keyboard.press('Tab')
  await expect(cells.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cells.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByText('Saved.')).toBeVisible()
})

/** The accessible name of whatever has focus: its label, aria-label or text. */
async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return ''
    const labelled = (el as HTMLInputElement).labels?.[0]?.childNodes[0]?.textContent
    return (el.getAttribute('aria-label') ?? labelled ?? el.textContent ?? '').trim()
  })
}
