import { test as base, expect } from '@playwright/test'
import { resetDatabase } from './database'

export const test = base.extend<{ database: void }>({
  // Playwright requires a destructured first argument even for a dependency-free fixture.
  // eslint-disable-next-line no-empty-pattern
  database: [async ({}, use) => {
    const elapsed = await resetDatabase()
    expect(elapsed, 'scenario reset must finish within five seconds').toBeLessThan(5000)
    await use()
  }, { auto: true }],
})
export { expect }
