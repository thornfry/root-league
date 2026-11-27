/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'

// Vitest runs from site/. Every source file under src/ is scanned: strings, markup, CSS and comments.
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`
    return e.isDirectory() ? files(p) : [p]
  })
}

const EMOJI = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}/u

describe('no emoji', () => {
  const source = files('src').filter((f) => /\.(ts|tsx|css|json)$/.test(f))

  it('scans the shell and design system files', () => {
    expect(source).toEqual(expect.arrayContaining(['src/ui/tokens.css', 'src/pages/Shell.tsx', 'src/ui/Tag.tsx']))
  })

  it.each(source)('%s has none', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(EMOJI)
  })

  it('would catch one', () => {
    expect('Submitted ' + String.fromCodePoint(0x2705)).toMatch(EMOJI)
  })
})
