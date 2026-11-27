// @vitest-environment node
import { Worker as NodeWorker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { FACTIONS } from '../data/factions'
import { checkPairing } from './check'
import { startDraft, type DraftWorker } from './client'
import type { DraftRequest } from './draft'
import fixture from './fixtures/mock-12-players.json'

const request: DraftRequest = {
  season: { capacity: 12, gamesEach: 3, maps: ['Autumn', 'Winter', 'Lake', 'Mountain'], factionPool: FACTIONS.map((f) => f.code) },
  roster: fixture.players,
  seed: 'p4-worker',
}
let workerCode: string

beforeAll(async () => {
  // Bundle the real browser worker and bridge its globals to a Node thread.
  const bundled = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL('./worker.ts', import.meta.url)), formats: ['iife'], name: 'PairingWorker' },
    },
  })
  const output = Array.isArray(bundled) ? bundled[0]! : bundled
  if (!('output' in output)) throw new Error('Expected worker bundle')
  const chunk = output.output.find((entry) => entry.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing worker entry')
  workerCode = `const { parentPort } = require('node:worker_threads');
    globalThis.self = { postMessage: data => parentPort.postMessage(data) };
    ${chunk.code}
    parentPort.on('message', data => self.onmessage({ data }));`
}, 30_000)

function createShim() {
  const node = new NodeWorker(workerCode, { eval: true })
  const shim: DraftWorker = {
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage: (data) => node.postMessage(data),
    terminate: vi.fn(() => { void node.terminate() }),
  }
  node.on('message', (data) => shim.onmessage?.({ data } as MessageEvent))
  node.on('error', (error) => shim.onerror?.({ message: error instanceof Error ? error.message : String(error) } as ErrorEvent))
  return shim
}

describe('worker client on a Node worker shim', () => {
  it('returns a valid 12-player draft and strictly increasing progress', async () => {
    const shim = createShim()
    const progress: number[] = []
    const result = await startDraft(request, { createWorker: () => shim, onProgress: (f) => progress.push(f) }).result
    expect(result.ok).toBe(true)
    if (result.ok) expect(checkPairing(result.input)).toEqual([])
    expect(progress.length).toBeGreaterThan(2)
    expect(progress.at(-1)).toBe(1)
    progress.forEach((f, i) => { if (i > 0) expect(f).toBeGreaterThan(progress[i - 1]!) })
    expect(shim.terminate).toHaveBeenCalledOnce()
    expect(shim.onmessage).toBeNull()
  })

  it('cancels running work, destroys it, and allows a clean rerun', async () => {
    const shim = createShim()
    const progress: number[] = []
    const run = startDraft(request, {
      iterations: 1_000_000_000,
      createWorker: () => shim,
      onProgress: (f) => { progress.push(f); run.cancel() },
    })
    await expect(run.result).rejects.toMatchObject({ name: 'AbortError' })
    expect(progress).toHaveLength(1)
    expect(shim.terminate).toHaveBeenCalledOnce()
    expect(shim.onmessage).toBeNull()
    expect(shim.onerror).toBeNull()
    run.cancel()
    expect(shim.terminate).toHaveBeenCalledOnce()
    expect((await startDraft(request, { createWorker: createShim }).result).ok).toBe(true)
  })

  it('returns the infeasible report without games', async () => {
    const result = await startDraft({ ...request, roster: request.roster.map((p, i) => i === 0 ? { ...p, list: [] } : p) }, { createWorker: createShim }).result
    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('games')
    if (!result.ok) {
      expect(result.reason).toBe('short-list')
      expect(result.report.ok).toBe(false)
      expect(result.blocking.players).toContain(request.roster[0]!.name)
    }
  })

  it('cleans up worker errors', async () => {
    const shim = createShim()
    await expect(startDraft({ ...request, roster: [] }, { createWorker: () => shim }).result).rejects.toMatchObject({ name: 'RangeError' })
    expect(shim.terminate).toHaveBeenCalledOnce()
  })

  it('does not create a worker for an already aborted signal', async () => {
    const factory = vi.fn(createShim)
    await expect(startDraft(request, { signal: AbortSignal.abort(), createWorker: factory }).result).rejects.toMatchObject({ name: 'AbortError' })
    expect(factory).not.toHaveBeenCalled()
  })

  it('aborts via a signal', async () => {
    const controller = new AbortController()
    const shim = createShim()
    const run = startDraft(request, { signal: controller.signal, createWorker: () => shim })
    controller.abort()
    await expect(run.result).rejects.toMatchObject({ name: 'AbortError' })
    expect(shim.terminate).toHaveBeenCalledOnce()
  })

  it('enforces the watchdog if the worker stops responding', async () => {
    vi.useFakeTimers()
    const shim: DraftWorker = { onmessage: null, onerror: null, onmessageerror: null, postMessage: () => {}, terminate: vi.fn() }
    try {
      const run = startDraft(request, { budgetMs: 10, createWorker: () => shim })
      const rejected = expect(run.result).rejects.toMatchObject({ name: 'TimeoutError' })
      await vi.advanceTimersByTimeAsync(1010)
      await rejected
      expect(shim.terminate).toHaveBeenCalledOnce()
      expect(shim.onmessage).toBeNull()
    } finally { vi.useRealTimers() }
  })
})
