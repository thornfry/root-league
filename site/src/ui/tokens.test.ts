/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { SEALS } from './seals'

// Vitest blanks CSS imports, so the file is read straight from disk.
const tokensCss = readFileSync('src/ui/tokens.css', 'utf8') // vitest runs from site/

type Tokens = Record<string, string>

function declarations(block: string): Tokens {
  const out: Tokens = {}
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
  return out
}

function blockAfter(css: string, selector: string): string {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`no ${selector} in tokens.css`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

const light = declarations(blockAfter(tokensCss, ':root {'))
const darkExplicit = declarations(blockAfter(tokensCss, ':root[data-theme="dark"]'))
const darkMedia = declarations(blockAfter(tokensCss, ':root:not([data-theme="light"])'))
const dark: Tokens = { ...light, ...darkExplicit }

function channel(v: number) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
export function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** Every text and background pair the components use. Text is held to 4.5:1. */
const PAIRS: [string, string, string][] = [
  ['ink', 'paper', 'body text on the page'],
  ['ink', 'card', 'body text on a card'],
  ['ink2', 'paper', 'muted text on the page'],
  ['ink2', 'card', 'muted text and kickers on a card'],
  ['ink2', 'forest-wash', 'muted text on a highlighted row'],
  ['ink', 'forest-wash', 'text on a highlighted row'],
  ['link', 'paper', 'links on the page'],
  ['link', 'card', 'links on a card'],
  ['#FFFFFF', 'forest', 'primary button and solid tag'],
  ['paper', 'adm', 'admin tag'],
  ['ok', 'ok-wash', 'ok tag and alert'],
  ['warn', 'warn-wash', 'warn tag'],
  ['warn-ink', 'warn-wash', 'warn alert'],
  ['clay', 'clay-wash', 'bad and militant tag, bad alert'],
  ['blue', 'blue-wash', 'insurgent tag and info alert'],
  ['ok', 'card', 'ok text on a card'],
  ['clay', 'card', 'danger button and error text'],
  ['ink', 'ok-wash', 'selected option'],
  ['#FFFFFF', 'discord', 'Discord button'],
  ['#FFFFFF', '#15201B', 'toast'],
  ['#FFFFFF', '#8A2F1A', 'error toast'],
  ['#FFFFFF', 'forest-d', 'brand and active nav on the band'],
  ['band-text', 'forest-d', 'nav and signed-in text on the band'],
  ['#FFFFFF', 'band-adm', 'active admin nav'],
  ['band-adm-text', 'band-adm', 'admin nav and label'],
  ['#E8EFEA', 'forest-d', 'band default text'],
]

function resolve(tokens: Tokens, ref: string): string {
  if (ref.startsWith('#')) return ref
  const v = tokens[`--${ref}`]
  if (!v) throw new Error(`token --${ref} missing`)
  return v
}

describe('design tokens', () => {
  it('hold the Foundations board colours', () => {
    expect(light['--paper']).toBe('#EEF0EA')
    expect(light['--forest']).toBe('#1D4B38')
    expect(light['--forest-d']).toBe('#0F1C16')
    expect(light['--amber']).toBe('#E39A2D')
    expect(light['--ok']).toBe('#1D6B43')
    expect(light['--warn']).toBe('#7A4B00')
    expect(light['--clay']).toBe('#8A2F1A')
    expect(light['--blue']).toBe('#2F4858')
  })

  it('name the three typefaces', () => {
    expect(light['--f-display']).toContain('IM Fell English')
    expect(light['--f-body']).toContain('Baskervville')
    expect(light['--f-ui']).toContain('Alegreya Sans')
  })

  it('keep the dark values the same in the media query and the explicit theme', () => {
    expect(darkMedia).toEqual(darkExplicit)
  })

  it.each(PAIRS)('text pair %s on %s meets 4.5:1 in the light theme (%s)', (fg, bg) => {
    expect(ratio(resolve(light, fg), resolve(light, bg))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(PAIRS)('text pair %s on %s meets 4.5:1 in the dark theme (%s)', (fg, bg) => {
    expect(ratio(resolve(dark, fg), resolve(dark, bg))).toBeGreaterThanOrEqual(4.5)
  })

  it('gives every faction seal readable letters', () => {
    for (const code of Object.keys(SEALS)) {
      const bg = light[`--seal-${code}`]
      const ink = light[`--seal-${code}-ink`]
      expect(bg, `--seal-${code}`).toBeDefined()
      expect(ink, `--seal-${code}-ink`).toBeDefined()
      expect(ratio(ink!, bg!), `${code} seal`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('has a seal colour for exactly the 13 factions', () => {
    const seals = Object.keys(light).filter((k) => /^--seal-\w+$/.test(k))
    expect(seals).toHaveLength(13)
    expect(Object.keys(SEALS)).toHaveLength(13)
  })

  it('gives the status tags a word-bearing style, never a bare colour swatch', () => {
    // The canvas rule: colour is never the only signal. The tag component requires children, checked in Tag.test.
    expect(light['--ok-wash']).not.toBe(light['--warn-wash'])
  })
})
