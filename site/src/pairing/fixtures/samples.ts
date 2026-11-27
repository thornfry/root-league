// The repo's two sample pairings (planning/season-1/sample-pairings-*.md),
// transcribed into JSON for tests. Not real pairings. fixtures.test.ts checks
// them against the markdown so the two cannot drift.

import type { PairingInput } from '../types'
import sample3 from './sample-3-games.json'
import sample4 from './sample-4-games.json'

export interface SampleFixture extends PairingInput {
  source: string
  /** Map names in index order; `games[].map` indexes into this. */
  maps: string[]
}

export const SAMPLE_3 = sample3 as unknown as SampleFixture
export const SAMPLE_4 = sample4 as unknown as SampleFixture
