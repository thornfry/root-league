/** The placeholder cast from supabase/seed.sql: id 100000000000000001 onwards, in this order. */
const LABELS = [
  'Dev admin', 'Delaney', 'Alex', 'Matt', 'Nick', 'Adam', 'Zach', 'Kyra', 'Anthony', 'David', 'Will', 'Chuck', 'Corey',
  'Spectator', 'Not invited',
] as const

export type CastName = (typeof LABELS)[number]
export interface Identity { id: string; name: CastName }

export const CAST: Record<CastName, Identity> = Object.fromEntries(
  LABELS.map((name, index) => [name, { id: `100000000000000${String(index + 1).padStart(3, '0')}`, name }]),
) as Record<CastName, Identity>

export const identity = (name: CastName): Identity => CAST[name]
