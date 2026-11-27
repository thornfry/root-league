import type { AssignResult } from './assign'
import { draftBudget, type DraftOptions, type DraftRequest } from './draft'
import type { DraftWorkerMessage, DraftWorkerRequest } from './worker'

/** The small portion of Worker also implemented by the Node test shim. */
export interface DraftWorker {
  onmessage: ((event: MessageEvent<DraftWorkerMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(message: DraftWorkerRequest): void
  terminate(): void
}

export interface DraftClientOptions extends DraftOptions {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
  createWorker?: () => DraftWorker
}

export interface DraftRun {
  result: Promise<AssignResult>
  /** Rejects result with AbortError and destroys the worker and its draft. */
  cancel(): void
}

/** One isolated worker per run. The caller owns the result; the client stores no drafts. */
export function startDraft(request: DraftRequest, options: DraftClientOptions = {}): DraftRun {
  let cancel = () => {}
  const result = new Promise<AssignResult>((resolve, reject) => {
    let worker: DraftWorker | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let finished = false
    const finish = (value?: AssignResult, error?: unknown) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', cancel)
      if (worker) {
        worker.onmessage = null
        worker.onerror = null
        worker.onmessageerror = null
        worker.terminate()
      }
      if (error !== undefined) reject(error)
      else resolve(value!)
    }
    cancel = () => finish(undefined, new DOMException('Pairing cancelled', 'AbortError'))
    try {
      const budget = draftBudget(options)
      if (options.signal?.aborted) return cancel()
      worker = options.createWorker?.() ?? new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      options.signal?.addEventListener('abort', cancel, { once: true })
      let last = -1
      worker.onmessage = ({ data }) => {
        if (finished) return
        if (data.type === 'result') finish(data.result)
        else if (data.type === 'error') {
          const error = new Error(data.message)
          error.name = data.name
          finish(undefined, error)
        } else if (data.fraction > last) {
          last = data.fraction
          try {
            options.onProgress?.(data.fraction)
          } catch (error) {
            finish(undefined, error)
          }
        }
      }
      worker.onerror = (event) => finish(undefined, new Error(event.message || 'Pairing worker failed'))
      worker.onmessageerror = () => finish(undefined, new Error('Could not read the pairing worker response'))
      // Allow worker startup/serialization and a final cooperative stop/report.
      // This watchdog also kills a worker stuck between shouldStop polls.
      timer = setTimeout(() => finish(undefined, new DOMException('Pairing time budget exceeded', 'TimeoutError')), budget + 1000)
      const { budgetMs, deals, nodesPerDeal, iterations } = options
      worker.postMessage({ request, options: { budgetMs, deals, nodesPerDeal, iterations } })
    } catch (error) {
      finish(undefined, error)
    }
  })
  return { result, cancel: () => cancel() }
}
