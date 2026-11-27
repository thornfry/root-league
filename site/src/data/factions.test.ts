import { describe, expect, it } from 'vitest'
import { FACTIONS, factionByCode, findFaction } from './factions'
import factionsDoc from '../../../league/factions.md?raw'
import pairingTool from '../../../planning/tools/pairing/league_pairing.py?raw'
import preferencesJson from '../../../season-1/preferences.json?raw'

/** Rows of the faction table in league/factions.md. */
function parseFactionsDoc() {
  const rows: { code: string; name: string; type: string; reach: number }[] = []
  for (const line of factionsDoc.split('\n')) {
    const cells = line.split('|').map((c: string) => c.trim())
    // "| cats | Marquise de Cat | Militant | 10 |" splits to ['', cats, ..., '']
    if (cells.length !== 6) continue
    const [, code, name, type, reach] = cells
    if (!code || !name || !type || !reach || !/^\d+$/.test(reach)) continue
    rows.push({ code, name, type, reach: Number(reach) })
  }
  return rows
}

/** FACTIONS, CODES and MILITANT from the Python tool, joined on its keys. */
function parsePython() {
  const src = pairingTool
  const block = (name: string) => {
    const m = src.match(new RegExp(`^${name} = \\{([\\s\\S]*?)^\\}`, 'm'))
    if (!m?.[1]) throw new Error(`${name} not found in league_pairing.py`)
    return m[1]
  }
  const factions = new Map<string, { name: string; reach: number }>()
  for (const m of block('FACTIONS').matchAll(/"(\w+)": \("([^"]+)", (\d+)\)/g)) {
    factions.set(m[1]!, { name: m[2]!, reach: Number(m[3]) })
  }
  const codes = new Map<string, string>()
  for (const m of block('CODES').matchAll(/"(\w+)": "(\w+)"/g)) codes.set(m[1]!, m[2]!)
  const militantSrc = src.match(/^MILITANT = \{([^}]*)\}/m)?.[1] ?? ''
  const militant = new Set([...militantSrc.matchAll(/"(\w+)"/g)].map((m) => m[1]!))
  return { factions, codes, militant }
}

describe('factions data', () => {
  it('has the 13 league factions with unique codes and names', () => {
    expect(FACTIONS).toHaveLength(13)
    expect(new Set(FACTIONS.map((f) => f.code)).size).toBe(13)
    expect(new Set(FACTIONS.map((f) => f.name)).size).toBe(13)
  })

  it('matches league/factions.md on code, name, type and reach, in order', () => {
    const doc = parseFactionsDoc()
    expect(doc).toHaveLength(13)
    expect(FACTIONS.map(({ code, name, type, reach }) => ({ code, name, type, reach }))).toEqual(doc)
  })

  it('matches the Python tool on reach, name, code and type', () => {
    const py = parsePython()
    expect(py.factions.size).toBe(13)
    for (const [key, { name, reach }] of py.factions) {
      const code = py.codes.get(key)
      expect(code, `code for ${key}`).toBeDefined()
      const f = factionByCode(code!)
      expect(f, `faction ${code}`).toBeDefined()
      expect(f).toMatchObject({ name, reach, type: py.militant.has(key) ? 'Militant' : 'Insurgent' })
    }
  })

  it('links every faction to a distinct https page on therootdatabase.com', () => {
    for (const f of FACTIONS) {
      const url = new URL(f.infoUrl)
      expect(url.protocol, f.code).toBe('https:')
      expect(['therootdatabase.com', 'www.therootdatabase.com'], f.code).toContain(url.hostname)
    }
    expect(new Set(FACTIONS.map((f) => f.infoUrl)).size).toBe(13)
  })
})

describe('faction lookup', () => {
  it('resolves every season-1 preference name', () => {
    const prefs = JSON.parse(preferencesJson) as {
      players: Record<string, string[]>
    }
    const names = Object.values(prefs.players).flat()
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(findFaction(name), name).toBeDefined()
  })

  it('resolves codes, names and aliases ignoring case and space', () => {
    expect(findFaction('cats')?.name).toBe('Marquise de Cat')
    expect(findFaction('  wa ')?.code).toBe('WA')
    expect(findFaction('Woodland Alliance')?.code).toBe('WA')
    expect(findFaction('hundreds')?.code).toBe('rats')
    expect(findFaction('Eyrie')?.code).toBe('birds')
    expect(findFaction('Lord of the Hundreds')?.code).toBe('rats')
  })

  it('resolves every code and full name to its faction', () => {
    for (const f of FACTIONS) {
      expect(findFaction(f.code)).toBe(f)
      expect(findFaction(f.name)).toBe(f)
    }
  })

  it('returns undefined for an unknown name', () => {
    expect(findFaction('Teamfight Tactics')).toBeUndefined()
    expect(findFaction('')).toBeUndefined()
    expect(factionByCode('nope')).toBeUndefined()
  })
})
