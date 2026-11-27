// The 13 league factions: code, name, type, reach and an info page.
//
// Code, name, type and reach match league/factions.md exactly, and reach and
// name also match the Python tool; factions.test.ts checks both so a change in
// one place cannot drift. Info links go to the Root Database faction pages
// (https://www.therootdatabase.com/faction/<slug>/). Each URL was opened once
// and returned 200 on 2026-11-26.

export type FactionType = 'Militant' | 'Insurgent'

export type Faction = {
  /** Short code used on the league pages, e.g. "cats" or "WA". */
  readonly code: string
  readonly name: string
  readonly type: FactionType
  readonly reach: number
  /** Root Database page for the faction. */
  readonly infoUrl: string
}

const page = (slug: string) => `https://www.therootdatabase.com/faction/${slug}/`

/** Highest reach first, in the order of league/factions.md. */
export const FACTIONS: readonly Faction[] = [
  { code: 'cats', name: 'Marquise de Cat', type: 'Militant', reach: 10, infoUrl: page('marquise-de-cat') },
  { code: 'rats', name: 'Lord of the Hundreds', type: 'Militant', reach: 9, infoUrl: page('lord-of-the-hundreds') },
  { code: 'badgers', name: 'Keepers in Iron', type: 'Militant', reach: 8, infoUrl: page('keepers-in-iron') },
  { code: 'moles', name: 'Underground Duchy', type: 'Militant', reach: 8, infoUrl: page('underground-duchy') },
  { code: 'birds', name: 'Eyrie Dynasties', type: 'Militant', reach: 7, infoUrl: page('eyrie-dynasties') },
  { code: 'frogs', name: 'Lilypad Diaspora', type: 'Militant', reach: 7, infoUrl: page('lilypad-diaspora') },
  { code: 'otters', name: 'Riverfolk Company', type: 'Insurgent', reach: 5, infoUrl: page('riverfolk-company') },
  { code: 'vagabond', name: 'Vagabond', type: 'Insurgent', reach: 5, infoUrl: page('vagabond') },
  { code: 'knaves', name: 'Knaves of the Deepwood', type: 'Insurgent', reach: 4, infoUrl: page('knaves-of-the-deepwood') },
  { code: 'bats', name: 'Twilight Council', type: 'Insurgent', reach: 4, infoUrl: page('twilight-council') },
  { code: 'crows', name: 'Corvid Conspiracy', type: 'Insurgent', reach: 3, infoUrl: page('corvid-conspiracy') },
  { code: 'WA', name: 'Woodland Alliance', type: 'Insurgent', reach: 3, infoUrl: page('woodland-alliance') },
  { code: 'lizards', name: 'Lizard Cult', type: 'Insurgent', reach: 2, infoUrl: page('lizard-cult') },
]

/** Extra spellings accepted by findFaction, keyed by code. Lowercase. */
const EXTRA_ALIASES: Readonly<Record<string, readonly string[]>> = {
  cats: ['marquise', 'cat'],
  rats: ['hundreds', 'lord of hundreds'],
  badgers: ['keepers'],
  moles: ['duchy'],
  birds: ['eyrie', 'bird'],
  frogs: ['lilypad'],
  otters: ['riverfolk'],
  vagabond: ['vb'],
  bats: ['twilight'],
  crows: ['corvids', 'corvid'],
  WA: ['alliance'],
  lizards: ['lizard'],
}

const byCode = new Map<string, Faction>(FACTIONS.map((f) => [f.code, f]))

const lookup = new Map<string, Faction>()
for (const f of FACTIONS) {
  lookup.set(f.code.toLowerCase(), f)
  lookup.set(f.name.toLowerCase(), f)
  for (const alias of EXTRA_ALIASES[f.code] ?? []) lookup.set(alias, f)
}

/** The faction with this exact code, or undefined. */
export function factionByCode(code: string): Faction | undefined {
  return byCode.get(code)
}

/**
 * Resolve a code, full name or common alias, ignoring case and surrounding
 * space ("Marquise de Cat", "wa", "moles"). Undefined when nothing matches.
 */
export function findFaction(input: string): Faction | undefined {
  return lookup.get(input.trim().toLowerCase())
}
