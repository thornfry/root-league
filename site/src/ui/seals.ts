/** The 13 faction codes with the two letters shown on a seal. Names, types and reach live in data/factions.ts. */
export const SEALS = {
  cats: 'CA',
  rats: 'LH',
  badgers: 'KI',
  moles: 'UD',
  birds: 'ED',
  frogs: 'LD',
  otters: 'RC',
  vagabond: 'VB',
  knaves: 'KD',
  bats: 'TC',
  crows: 'CC',
  WA: 'WA',
  lizards: 'LC',
} as const

export type FactionCode = keyof typeof SEALS
