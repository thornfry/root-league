/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), '..')
const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((f) => f.startsWith('site/') && !f.endsWith('package-lock.json') && !/\.(woff2?|png|jpg|ico)$/.test(f))

const read = (file: string) => readFileSync(join(root, file), 'utf8')

describe('repo hygiene for sign-in', () => {
  it('reads the Supabase URL and key only in src/db/client.ts', () => {
    const readers = tracked.filter(
      (f) =>
        f.startsWith('site/src/') &&
        !f.includes('.test.') &&
        f !== 'site/src/db/client.ts' &&
        /import\.meta\.env\.VITE_SUPABASE/.test(read(f)),
    )
    expect(readers).toEqual([])
  })

  it('has no key-shaped value anywhere in site/', () => {
    const shapes = [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, /sb_(secret|publishable)_[A-Za-z0-9_-]{10,}/, /service_role\s*[:=]\s*['"][^'"]+/]
    const hits = tracked.filter((f) => !f.includes('hygiene.test') && shapes.some((re) => re.test(read(f))))
    expect(hits).toEqual([])
  })

  it('names no real Discord client secret or database password in the env files', () => {
    for (const f of tracked.filter((f) => /\/\.env/.test(f))) {
      for (const line of read(f).split('\n')) {
        const [key, value = ''] = line.split('=')
        if (/KEY|SECRET|PASSWORD/.test(key ?? '') && !(key ?? '').startsWith('#')) expect(value.trim()).toBe('')
      }
    }
  })

  it('carries the dev stand-in domain in the stand-in page and the guards only', () => {
    const files = tracked.filter((f) => /\.(ts|tsx|mjs|css|html)$/.test(f) && read(f).includes('dev.invalid'))
    const allowed = [
      'site/src/auth/DevSignIn.tsx',
      'site/src/auth/AppGate.dev.test.tsx',
      'site/scripts/check-no-dev.mjs',
      'site/scripts/build-guards.test.ts',
      'site/src/auth/hygiene.test.ts',
    ]
    expect(files.filter((f) => !allowed.includes(f))).toEqual([])
  })
})
