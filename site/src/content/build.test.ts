// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { build } from 'vite'
import { buildLeaguePages, INFO_PAGES, leagueContent, renderMarkdown, REPO_ROOT, repoBase, rewriteLink } from './build'

const repo = 'https://github.com/example/league/blob/release/'

it('renders every source heading, nested lists and the current rule 7', () => {
  for (const page of buildLeaguePages(repo)) {
    const doc = new JSDOM(page.html).window.document
    const source = readFileSync(path.join(REPO_ROOT, 'league', page.file), 'utf8')
    const headings = [...source.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1])
    expect([...doc.querySelectorAll('h1,h2,h3')].map((h) => h.textContent)).toEqual(headings)
    expect(doc.querySelector('input,textarea,button,[contenteditable]')).toBeNull()
    if (page.key === 'rules') expect(doc.querySelector('ol')?.children[6]?.textContent)
      .toContain('at least one militant and one insurgent faction, and never Vagabond and Knaves together')
    if (page.key === 'how') expect(doc.querySelectorAll('ol > li > ul > li')).toHaveLength(2)
  }
})

it('resolves all generated links to an info route or an existing repo file', () => {
  for (const page of buildLeaguePages(repo)) {
    const doc = new JSDOM(page.html).window.document
    for (const a of doc.querySelectorAll('a')) {
      const href = a.getAttribute('href')!
      if (href.startsWith('/info/')) expect(INFO_PAGES.some((p) => href === `/info/${p.key}`)).toBe(true)
      else {
        expect(href.startsWith(repo)).toBe(true)
        expect(existsSync(path.join(REPO_ROOT, href.slice(repo.length).split('#')[0]!))).toBe(true)
      }
    }
  }
  expect(rewriteLink('./format.md#league-format', 'pairing-rules.md', repo)).toBe('/info/format#league-format')
  expect(rewriteLink('factions.md#reach', 'pairing-rules.md', repo)).toBe(`${repo}league/factions.md#reach`)
  expect(rewriteLink('../planning/tools/pairing/league_pairing.py#L173', 'how-pairing-works.md', repo))
    .toBe(`${repo}planning/tools/pairing/league_pairing.py#L173`)
  expect(rewriteLink('#the-three-steps', 'how-pairing-works.md', repo)).toBe('#the-three-steps')
})

it('accepts repository or blob/ref bases and rejects broken or unsafe content', () => {
  expect(repoBase('https://github.com/example/league/')).toBe('https://github.com/example/league/blob/main/')
  expect(repoBase(repo)).toBe(repo)
  expect(() => repoBase('javascript:alert(1)')).toThrow('VITE_REPO_URL')
  expect(() => rewriteLink('missing.md', 'format.md', repo)).toThrow('Broken league link')
  expect(() => rewriteLink('../../etc/passwd', 'format.md', repo)).toThrow('Broken league link')
  expect(() => renderMarkdown('[bad](javascript:alert%281%29)', 'format.md', repo)).toThrow('Unsupported league link')
  const doc = new JSDOM(renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>', 'format.md', repo)).window.document
  expect(doc.querySelector('script,img')).toBeNull()
})

it('ships HTML through a real Vite build without the parser or Markdown fetches', async () => {
  const result = await build({
    configFile: false, root: path.join(REPO_ROOT, 'site'), logLevel: 'silent',
    plugins: [leagueContent(repo)],
    build: { write: false, minify: false, rollupOptions: { input: 'virtual:league-info', preserveEntrySignatures: 'strict' } },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => 'output' in r ? r.output : [])
  const code = outputs.filter((o) => o.type === 'chunk').map((o) => o.code).join('\n')
  const built = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  expect(built.default).toEqual(buildLeaguePages(repo))
  expect(code).not.toMatch(/fetch\(|class Marked|readFileSync/)
})
