import { expect, type Page } from '@playwright/test'

export const PERSONAS = {
  admin: { id: '100000000000000001', name: 'Dev admin' },
  player: { id: '100000000000000002', name: 'Delaney' },
  viewer: { id: '100000000000000014', name: 'Spectator' },
  outsider: { id: '100000000000000015', name: 'Not invited' },
} as const

export async function signInAs(page: Page, persona: keyof typeof PERSONAS): Promise<void> {
  await page.goto('/discord')
  await expect(page.getByText('Dev stand-in', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: PERSONAS[persona].name, exact: true }).click()
  await expect(page.getByLabel('Discord ID', { exact: true })).toHaveValue(PERSONAS[persona].id)
  await page.getByRole('button', { name: 'Authorise', exact: true }).click()
  await expect(page.getByRole('heading', { name: persona === 'outsider' ? 'Not on the list yet' : 'Home', exact: true })).toBeVisible()
}

/** Keep timers and network running; this only freezes Date for countdown rendering. Install before navigation. */
export async function setBrowserTime(page: Page, time: string | Date): Promise<void> {
  await page.clock.setFixedTime(new Date(time))
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

/** Real REST call using this browser's existing Auth session, never a service-role bypass or mock. */
export async function restAsPage(page: Page, path: string, body?: object) {
  const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!key) throw new Error('Export VITE_SUPABASE_ANON_KEY from supabase status -o env.')
  return page.evaluate(async ({ url, key, path, body }) => {
    const sessionKey = Object.keys(localStorage).find((key) => /^sb-.*-auth-token$/.test(key))
    const session = sessionKey ? JSON.parse(localStorage.getItem(sessionKey)!) as { access_token: string } : null
    const response = await fetch(`${url}/rest/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { apikey: key, Authorization: `Bearer ${session?.access_token ?? key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, text: await response.text() }
  }, { url, key, path, body })
}
