import type { Browser, Page, TestInfo } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { signInFast } from './support/api'
import { expectNoHorizontalScroll, signInAs } from './support/browser'
import { SEASON_ID, setListsLocked, withDatabase } from './support/database'
import { CAST, identity, type CastName } from './support/people'
import { POOL, createPeople } from './support/scenario'
import { FACTIONS } from '../src/data/factions'

// S14: one serial journey, from the empty season to a played one, following the prototype's click-through.
// It is one test on purpose: the database is reset before every test, and each step needs the one before it.
//
// Divergence from the order in build.md, which says Join and pick factions come before the admin sets the season: a
// season with no pool offers no factions to pick, so the admin saves the season first. The whitelist step also comes
// first, so that "not invited and back" is the same person getting in.
//
// The sign-in page is used for the two people at the start of the journey. After that a session is placed in storage,
// so a journey that changes person a dozen times does not spend Auth's per-address sign-in limit.

async function openPerson(browser: Browser, testInfo: TestInfo) {
  const { viewport, isMobile, hasTouch } = testInfo.project.use
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport, isMobile, hasTouch })
  return { context, page: await context.newPage() }
}

/** Opens a page through the header: the Menu button first on a phone, the bar on a desktop. */
async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('link', { name: label, exact: true }).first().click()
}

const pad = (n: number) => String(n).padStart(2, '0')
/** The value of a datetime-local control for this moment plus a day, in the browser's own zone. */
function tomorrowLocal(): string {
  const d = new Date(Date.now() + 86_400_000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

interface GameRow { game_no: number; id: string; names: string[] }
const loadGames = () => withDatabase(async (db) => (await db.query<GameRow>(
  `select g.game_no, g.id, array_agg(p.display_name order by s.seat) as names
     from public.games g join public.game_seats s on s.game_id = g.id join public.people p on p.id = s.person_id
    group by g.id order by g.game_no`)).rows)

test('S14: the full journey from the empty season to a played one', async ({ page, browser }, testInfo) => {
  test.setTimeout(420_000)
  const { context: adminContext, page: admin } = await openPerson(browser, testInfo)
  const person = identity('Spectator')
  const ADD_TO_LEAGUE: CastName[] = ['Spectator', 'Delaney', 'Alex', 'Matt', 'Nick', 'Adam', 'Zach', 'Kyra']
  try {
    await test.step('landing, consent and "not on the list yet"', async () => {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: /Root\s*League/ })).toBeVisible()
      await expect(page.getByRole('navigation')).toHaveCount(0)
      await page.getByRole('link', { name: 'Continue with Discord' }).click()
      await expect(page).toHaveURL(/\/discord$/)
      await expect(page.getByText('Dev stand-in', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: CAST['Not invited'].name, exact: true }).click()
      await expect(page.getByLabel('Discord ID', { exact: true })).toHaveValue(CAST['Not invited'].id)
      await page.getByRole('button', { name: 'Authorise', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Not on the list yet' })).toBeVisible()
      await expect(page.getByLabel('Your Discord ID')).toHaveText(CAST['Not invited'].id)
      await expect(page.getByRole('navigation')).toHaveCount(0)
      await expectNoHorizontalScroll(page)
    })

    await test.step('the admin whitelists them, and they come back in', async () => {
      await signInAs(admin, 'admin')
      await navigate(admin, 'Whitelist')
      await expect(admin.getByRole('heading', { name: 'Whitelist', exact: true })).toBeVisible()
      await admin.getByLabel('Discord user ID', { exact: true }).fill(CAST['Not invited'].id)
      await admin.getByLabel('Name label (optional)').fill('Not invited')
      await admin.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(admin.getByRole('table', { name: 'Invited Discord accounts' })).toContainText(CAST['Not invited'].id)
      await expectNoHorizontalScroll(admin)
      // No new sign-in: the same session asks again.
      await page.getByRole('button', { name: 'Check again', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Join league', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Whitelist', exact: true })).toHaveCount(0)
    })

    await test.step('the admin sets the season', async () => {
      await navigate(admin, 'Season')
      await expect(admin.getByRole('heading', { name: 'Season', exact: true })).toBeVisible()
      await admin.getByLabel('Season name', { exact: true }).fill('Season 1')
      await admin.getByRole('radio', { name: '8 players', exact: true }).check()
      await admin.getByRole('radio', { name: '2 games', exact: true }).check()
      await admin.getByRole('button', { name: 'Add map', exact: true }).click()
      await admin.getByLabel('Map 1', { exact: true }).fill('Autumn')
      await admin.getByRole('button', { name: 'Add map', exact: true }).click()
      await admin.getByLabel('Map 2', { exact: true }).fill('Winter')
      for (const faction of FACTIONS) await admin.locator('label.chk', { hasText: faction.name }).getByRole('checkbox').check()
      await admin.getByLabel('Minimum list length').fill('2')
      await admin.getByLabel('Lists lock date and time').fill(tomorrowLocal())
      // 8 players with 2 games is an uneven layout: saving waits for the acknowledgement.
      await expect(admin.getByRole('button', { name: 'Save season', exact: true })).toBeDisabled()
      await admin.getByLabel('I acknowledge the uneven meetings. Use it anyway.').check()
      await admin.getByRole('button', { name: 'Save season', exact: true }).click()
      await expect(admin.getByText('Season saved.', { exact: true })).toBeVisible()
      await expectNoHorizontalScroll(admin)
    })

    await test.step('a viewer joins, ranks factions and submits', async () => {
      await signInFast(page, person)
      await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Join league', exact: true }).click()
      await expect(page.getByRole('heading', { name: "You're on the list!", exact: true })).toBeVisible()
      await expect(page.getByRole('main')).not.toContainText(/waitlist|league list|queue|position/i)
      await page.getByRole('button', { name: 'Add Marquise de Cat' }).click()
      await page.getByRole('button', { name: 'Add Eyrie Dynasties' }).click()
      await page.getByRole('button', { name: 'Add Woodland Alliance' }).click()
      await page.getByRole('button', { name: 'Add Vagabond' }).click()
      await page.getByRole('button', { name: 'Save factions', exact: true }).click()
      await expect(page.getByText('Factions saved.', { exact: true })).toBeVisible()
      await expect(page.getByText('Ready', { exact: true })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    await test.step('the other players join, and Pairings shows the layout with no names', async () => {
      // Seven more people have joined and ranked every faction, as the real league would over time.
      await withDatabase(async (db) => {
        const names: CastName[] = ['Delaney', 'Alex', 'Matt', 'Nick', 'Adam', 'Zach', 'Kyra', 'David']
        const ids = await createPeople(db, names)
        for (const name of names) {
          await db.query(
            `insert into public.roster (season_id, person_id, list, position, ranked_factions, list_submitted)
             select $1::uuid, $2::uuid, 'waitlist', coalesce(max(position), 0) + 1, $3::text[], true from public.roster where season_id = $1 and list = 'waitlist'`,
            [SEASON_ID, ids[name], POOL],
          )
        }
      })
      await navigate(page, 'Pairings')
      await expect(page.getByText('Not started.', { exact: false })).toBeVisible()
      await expect(page.getByText('P1', { exact: true }).first()).toBeVisible()
      await expect(page.getByRole('main')).not.toContainText(/Delaney|Alex|Matt|Marquise|Eyrie/)
      await expectNoHorizontalScroll(page)
      await navigate(page, 'Standings')
      await expect(page.getByRole('main')).toContainText('Delaney')
      // Before the lock the viewer reads their own ranked list and nobody else's.
      await expect(page.getByRole('list', { name: "Spectator's ranked factions" })).toBeVisible()
      await expect(page.getByRole('list', { name: "Delaney's ranked factions" })).toHaveCount(0)
    })

    await test.step('the admin moves eight people onto the league list, then the lock passes', async () => {
      await navigate(admin, 'Roster')
      await expect(admin.getByRole('heading', { name: 'League list', exact: true })).toBeVisible()
      for (const name of ADD_TO_LEAGUE) {
        await admin.getByRole('button', { name: `Move ${name} to league list`, exact: true }).click()
        await expect(admin.getByRole('status', { name: 'Roster update' })).toContainText(`${name} moved to the league list.`)
      }
      await expect(admin.getByText('The league list is full.', { exact: true })).toBeVisible()
      await expect(admin.getByRole('list', { name: 'Waitlist', exact: true })).toContainText('David')
      await expectNoHorizontalScroll(admin)
      await setListsLocked()
      await admin.goto('/admin')
      await expect(admin.getByRole('heading', { name: 'Lists locked, season not started' })).toBeVisible()
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Players', exact: true })).toBeVisible()
      await expect(page.getByRole('main')).toContainText('Marquise de Cat')
    })

    await test.step('Start season: draft, report and publish', async () => {
      await navigate(admin, 'Start season')
      await expect(admin.getByRole('heading', { name: 'Ready to start' })).toBeVisible()
      await admin.getByLabel('Seed', { exact: true }).fill('s14-journey')
      await admin.getByRole('button', { name: 'Assign factions', exact: true }).click()
      await expect(admin.getByText('All hard rules met.', { exact: true })).toBeVisible({ timeout: 30_000 })
      await expect(admin.getByRole('heading', { name: /^P1:/ })).toBeVisible()
      await expectNoHorizontalScroll(admin)
      await admin.getByRole('button', { name: 'Publish pairings', exact: true }).click()
      await expect(admin.getByText(/The season has started/)).toBeVisible()
    })

    const games = await loadGames()
    expect(games).toHaveLength(4)
    const mine = games.find((g) => g.names.includes('Delaney'))!
    const rival = mine.names.find((name) => name !== 'Delaney') as CastName
    const pickGame = games.find((g) => !g.names.includes('Spectator') && g.game_no !== mine.game_no)!
    const pickWinner = pickGame.names[0] as CastName

    await test.step('a league player sees Pairings, with Mine', async () => {
      await signInFast(page, identity('Delaney'))
      await expect(page.getByRole('region', { name: 'My games' })).toBeVisible()
      await navigate(page, 'Pairings')
      await expect(page.getByRole('group', { name: 'Filter games' }).getByRole('button', { name: /^Mine 2$/ })).toBeVisible()
      await expect(page.getByRole('group', { name: 'Filter games' }).getByRole('button', { name: /^All 4$/ })).toBeVisible()
      await page.getByRole('button', { name: /^Mine / }).click()
      await expect(page.getByRole('button', { name: /^Mine / })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('heading', { name: /^Table \d+$/ }).first()).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    await test.step('she enters a result; another seated player disagrees; the admin settles it', async () => {
      await page.goto(`/game/${mine.game_no}/result`)
      await page.getByRole('checkbox', { name: 'Delaney' }).check()
      await page.getByRole('button', { name: 'Submit', exact: true }).click()
      await expect(page.getByText('Won by Delaney', { exact: true })).toBeVisible()

      await signInFast(page, identity(rival), `/game/${mine.game_no}/result`)
      await page.getByRole('checkbox', { name: rival }).check()
      await page.getByRole('button', { name: 'Submit', exact: true }).click()
      await expect(page.getByRole('region', { name: 'My games' })).toContainText('Disputed')
      await expect(page.getByText(/Won by/)).toHaveCount(0)
      await expectNoHorizontalScroll(page)

      await admin.goto('/admin')
      await expect(admin.getByText('1 game is disputed.')).toBeVisible()
      await admin.getByRole('link', { name: 'Open Disputes' }).click()
      await admin.getByRole('radio', { name: /Use Delaney/ }).check()
      await admin.getByRole('button', { name: 'Settle game', exact: true }).click()
      await expect(admin.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible()
      await admin.goto('/admin')
      await expect(admin.getByText('No games are disputed.')).toBeVisible()

      await signInFast(page, identity('Delaney'))
      await expect(page.getByText('Settled by admin', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('Won by Delaney', { exact: true })).toBeVisible()
      await expect(page.getByRole('article').filter({ hasText: `Table ${mine.game_no},` }).getByRole('link', { name: 'Edit result' })).toHaveCount(0)
    })

    await test.step('picks and the leaderboard', async () => {
      await signInFast(page, person, '/pickems')
      const pickCard = page.getByRole('article', { name: `Table ${pickGame.game_no}` })
      await pickCard.getByRole('button', { name: new RegExp(pickWinner) }).click()
      await expect(pickCard.getByText('1st pick')).toBeVisible()
      await expect(pickCard.getByRole('button', { name: new RegExp(pickWinner) })).toBeEnabled()
      // The admin is not seated at this table, so the entry settles it and the pick scores.
      await admin.goto(`/game/${pickGame.game_no}/result`)
      await admin.getByRole('checkbox', { name: pickWinner }).check()
      await admin.getByRole('button', { name: 'Submit', exact: true }).click()
      await expect(admin).toHaveURL(/\/$/)
      await admin.goto('/pairings')
      await expect(admin.getByRole('article', { name: `Table ${pickGame.game_no}` })).toContainText('Settled by admin')
      await page.goto('/pickems')
      await expect(page.locator('.scorecard')).toContainText('3 points')
      await page.getByRole('link', { name: /Leaderboard/ }).click()
      await expect(page.getByRole('table', { name: 'Pick’em leaderboard' })).toContainText('Spectator')
      await expect(page.getByRole('table', { name: 'Pick’em leaderboard' }).getByRole('cell', { name: '1', exact: true })).toHaveCount(1)
      await expectNoHorizontalScroll(page)
    })

    await test.step('standings agree with the two results', async () => {
      await signInFast(page, identity('Delaney'))
      const inPick = pickGame.names.includes('Delaney')
      const wins = 1 + (inPick && pickWinner === 'Delaney' ? 1 : 0)
      const played = inPick ? 2 : 1
      await page.goto('/players')
      const row = page.getByRole('table', { name: 'Season standings' }).getByRole('row').filter({ hasText: 'Delaney' })
      await expect(row.getByRole('cell')).toHaveText(`${wins}-${played - wins}`)
      await expectNoHorizontalScroll(page)
    })

    await test.step('Fix it: a seat edit that breaks a rule still saves, and the log shows it', async () => {
      await admin.goto('/admin/fixit?a=games')
      for (const seat of [1, 2, 3]) await admin.getByLabel(`Faction, seat ${seat}`, { exact: true }).selectOption('lizards')
      await admin.getByRole('button', { name: 'Save seats' }).click()
      await expect(admin.getByText('Seats saved.')).toBeVisible()
      await expect(admin.getByText(/Table reach at least 21 \(rule 6\)/).first()).toBeVisible()
      const log = admin.getByRole('region', { name: 'Edit log' })
      await expect(log).toContainText('Dev admin')
      await expect(log).toContainText('faction: lizards')
      await expectNoHorizontalScroll(admin)
    })

    await test.step('CSV export: faction picks and the league state', async () => {
      await admin.goto('/admin/csv')
      await expect(admin.getByRole('button', { name: 'Download league state' })).toBeEnabled()
      const picks = admin.waitForEvent('download')
      await admin.getByRole('button', { name: 'Download faction picks' }).click()
      expect((await picks).suggestedFilename()).toBe('faction-picks.csv')
      const state = admin.waitForEvent('download')
      await admin.getByRole('button', { name: 'Download league state' }).click()
      expect((await state).suggestedFilename()).toBe('league-state.zip')
      await expectNoHorizontalScroll(admin)
    })
  } finally {
    await adminContext.close()
  }
})
