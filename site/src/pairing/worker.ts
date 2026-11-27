import type { AssignResult } from './assign'
import { buildDraft, type DraftOptions, type DraftRequest } from './draft'

export interface DraftWorkerRequest {
  request: DraftRequest
  options: DraftOptions
}

export type DraftWorkerMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'result'; result: AssignResult }
  | { type: 'error'; name: string; message: string }

// A narrow worker scope avoids adding WebWorker globals to the app's DOM types.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DraftWorkerRequest>) => void) | null
  postMessage(message: DraftWorkerMessage): void
}

scope.onmessage = ({ data }) => {
  try {
    let last = -1
    const result = buildDraft(data.request, data.options, {
      onProgress: (fraction) => {
        if (fraction > last) {
          last = fraction
          scope.postMessage({ type: 'progress', fraction })
        }
      },
    })
    scope.postMessage({ type: 'result', result })
  } catch (error) {
    scope.postMessage({
      type: 'error',
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
