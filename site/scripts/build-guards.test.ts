/// <reference types="node" />
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findDev, FORBIDDEN } from './check-no-dev.mjs'

// The three guards that keep the dev sign-in stand-in out of production (decision 41), tested against real builds.
// The third guard, the database ignoring the stand-in without its seed row, is covered in 010_access.test.sql.

const vite = join(process.cwd(), 'node_modules/vite/bin/vite.js')
const out: string[] = []

function build(mode: string, env: Record<string, string>) {
  const outDir = mkdtempSync(join(tmpdir(), 'rl-build-'))
  out.push(outDir)
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITE_')))
  const run = spawnSync(process.execPath, [vite, 'build', '--mode', mode, '--outDir', outDir, '--emptyOutDir'], {
    env: { ...clean, ...env },
    encoding: 'utf8',
  })
  return { outDir, status: run.status, output: `${run.stdout}${run.stderr}` }
}

afterAll(() => out.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('dev sign-in guards', () => {
  it('fails a production build that asks for the stand-in', () => {
    const run = build('production', { VITE_AUTH_MODE: 'dev' })
    expect(run.status).not.toBe(0)
    expect(run.output).toMatch(/VITE_AUTH_MODE=dev is only for local builds/)
  })

  it('fails any other deployable mode that asks for the stand-in', () => {
    expect(build('staging', { VITE_AUTH_MODE: 'dev' }).status).not.toBe(0)
  })

  it('fails on a mode value it does not know', () => {
    const run = build('production', { VITE_AUTH_MODE: 'yes' })
    expect(run.status).not.toBe(0)
    expect(run.output).toMatch(/must be "discord" or "dev"/)
  })

  it('passes the default build and finds nothing for check:no-dev', () => {
    const run = build('production', {})
    expect(run.status).toBe(0)
    expect(findDev(run.outDir)).toEqual([])
    const script = spawnSync(process.execPath, ['scripts/check-no-dev.mjs', run.outDir], { encoding: 'utf8' })
    expect(script.status).toBe(0)
  })

  it('builds the stand-in for the local dev mode, and check:no-dev then fails it', () => {
    const run = build('dev', {})
    expect(run.status).toBe(0)
    const hits = findDev(run.outDir)
    expect(hits.map((h) => h.needle).sort()).toEqual([...FORBIDDEN].sort())
    const script = spawnSync(process.execPath, ['scripts/check-no-dev.mjs', run.outDir], { encoding: 'utf8' })
    expect(script.status).toBe(1)
    expect(script.stderr).toContain('dev sign-in stand-in')
  })

  it('keeps the marker the check looks for in step with the stand-in page', () => {
    const page = readFileSync('src/auth/DevSignIn.tsx', 'utf8')
    for (const needle of FORBIDDEN) expect(page).toContain(needle)
  })
})
