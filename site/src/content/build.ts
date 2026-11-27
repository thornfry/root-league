/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'
import type { Plugin } from 'vite'

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
export const INFO_PAGES = [
  { key: 'format', file: 'format.md', label: 'League format' },
  { key: 'rules', file: 'pairing-rules.md', label: 'Pairing rules' },
  { key: 'how', file: 'how-pairing-works.md', label: 'How pairing works' },
] as const

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Accept a repository URL, or a blob/ref base for deployments pinned to a branch. */
export function repoBase(value = 'https://github.com/thornfry/root-league/blob/main'): string {
  const url = new URL(value.replace(/\/$/, ''))
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.search || url.hash) {
    throw new Error('VITE_REPO_URL must be an HTTPS GitHub repository or blob/ref URL.')
  }
  return `${url.href}${url.pathname.includes('/blob/') ? '' : '/blob/main'}/`
}

export function rewriteLink(href: string, source: string, repoUrl?: string): string {
  if (href.startsWith('#')) return href
  if (/^https?:\/\//i.test(href)) return href
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) {
    throw new Error(`Unsupported league link: ${href}`)
  }
  const [, file = '', suffix = ''] = href.match(/^([^?#]*)(.*)$/) ?? []
  const target = path.posix.normalize(path.posix.join('league', path.posix.dirname(source), decodeURI(file)))
  if (target.startsWith('../') || !existsSync(path.join(REPO_ROOT, target))) {
    throw new Error(`Broken league link in ${source}: ${href}`)
  }
  const internal = INFO_PAGES.find((page) => target === `league/${page.file}`)
  return internal ? `/info/${internal.key}${suffix}` : `${repoBase(repoUrl)}${target}${suffix}`
}

export function renderMarkdown(markdown: string, source: string, repoUrl?: string): string {
  const ids = new Map<string, number>()
  const parser = new Marked({
    gfm: true,
    renderer: {
      link({ href, title, tokens }) {
        const url = rewriteLink(href, source, repoUrl)
        return `<a href="${escape(url)}"${title ? ` title="${escape(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`
      },
      heading({ depth, text, tokens }) {
        const slug = text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\s-]/gu, '').trim().replace(/\s+/g, '-')
        const count = ids.get(slug) ?? 0
        ids.set(slug, count + 1)
        return `<h${depth} id="${escape(slug)}${count ? `-${count}` : ''}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
      // The repo supplies prose, never executable HTML or remote image embeds.
      html({ text }) { return escape(text) },
      image({ text }) { return escape(text) },
    },
  })
  return parser.parse(markdown, { async: false })
}

export function buildLeaguePages(repoUrl?: string) {
  repoBase(repoUrl)
  return INFO_PAGES.map((page) => ({
    ...page,
    html: renderMarkdown(readFileSync(path.join(REPO_ROOT, 'league', page.file), 'utf8'), page.file, repoUrl),
  }))
}

/** Only generated HTML enters the client bundle; Markdown and its parser stay at build time. */
export function leagueContent(repoUrl?: string): Plugin {
  const moduleId = 'virtual:league-info'
  const resolvedId = `\0${moduleId}`
  return {
    name: 'league-info',
    resolveId(id) { if (id === moduleId) return resolvedId },
    load(id) {
      if (id !== resolvedId) return
      for (const page of INFO_PAGES) this.addWatchFile(path.join(REPO_ROOT, 'league', page.file))
      return `export default ${JSON.stringify(buildLeaguePages(repoUrl))}`
    },
    handleHotUpdate(ctx) {
      if (INFO_PAGES.some((page) => ctx.file === path.join(REPO_ROOT, 'league', page.file))) {
        const mod = ctx.server.moduleGraph.getModuleById(resolvedId)
        if (mod) ctx.server.moduleGraph.invalidateModule(mod)
        ctx.server.ws.send({ type: 'full-reload' })
        return []
      }
    },
  }
}
