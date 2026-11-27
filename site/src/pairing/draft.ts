import { getLayout } from '../data/valid-pairs'
import { assignFactions, type AssignOptions, type AssignResult } from './assign'
import type { PairingPlayer } from './types'

export interface DraftRequest {
  season: {
    capacity: number
    gamesEach: number
    /** Names in map-index order. */
    maps: readonly string[]
    factionPool: readonly string[]
  }
  /** Only the league list, with faction codes, not the waitlist. */
  roster: readonly PairingPlayer[]
  seed: string
}

/** Serializable search controls, also accepted by the worker client. */
export interface DraftOptions {
  /** Defaults to 10 seconds. Must be finite and positive. */
  budgetMs?: number
  deals?: number
  nodesPerDeal?: number
  iterations?: number
}

export const DEFAULT_BUDGET_MS = 10_000

export function draftBudget(options: DraftOptions): number {
  const budget = options.budgetMs ?? DEFAULT_BUDGET_MS
  if (!Number.isFinite(budget) || budget <= 0) throw new RangeError('budgetMs must be finite and positive')
  for (const key of ['deals', 'nodesPerDeal', 'iterations'] as const) {
    const value = options[key]
    if (value !== undefined && (!Number.isSafeInteger(value) || value < (key === 'iterations' ? 0 : 1))) {
      throw new RangeError(`${key} must be a ${key === 'iterations' ? 'non-negative' : 'positive'} safe integer`)
    }
  }
  return budget
}

/**
 * Build an ephemeral draft. P3 deals numbers and returns players in number order;
 * do not shuffle them again. No persistence or database access happens here.
 * A deadline may return P3's valid best-so-far draft, or its stopped report.
 * Reproducibility assumes the search completes within the budget.
 */
export function buildDraft(
  request: DraftRequest,
  options: DraftOptions = {},
  hooks: Pick<AssignOptions, 'shouldStop' | 'onProgress'> = {},
): AssignResult {
  const budget = draftBudget(options)
  const { season, roster, seed } = request
  const layout = getLayout(season.capacity, season.gamesEach, season.maps.length)
  if (!layout) throw new RangeError('No layout exists for this capacity, games each and map count')
  if (roster.length !== season.capacity) throw new RangeError('The league list must fill the season capacity')
  const deadline = performance.now() + budget
  return assignFactions({
    ...options,
    layout,
    // Query ordering should not change the meaning of the seed.
    players: [...roster].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    seed,
    pool: season.factionPool,
    shouldStop: () => performance.now() >= deadline || (hooks.shouldStop?.() ?? false),
    onProgress: hooks.onProgress,
  })
}
