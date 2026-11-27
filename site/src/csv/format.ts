export type CsvFile = { columns: string[]; rows: Record<string, string>[] }
export type CsvFiles = Record<string, CsvFile>
export function encodeCsv(file: CsvFile) {
  const cell = (v: string) => /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
  return [file.columns, ...file.rows.map(row => file.columns.map(c => row[c] ?? ''))].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
export function parseCsv(name: string, input: string): CsvFile {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false, closed = false
  const fail = (message: string): never => { throw new Error(`${name}, row ${rows.length + 1}, column ${rows[0]?.[row.length] ?? row.length + 1}: ${message}`) }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { value += '"'; i++ } else { quoted = false; closed = true } } else value += c; continue }
    if (c === ',' || c === '\r' || c === '\n') {
      row.push(value); value = ''; closed = false
      if (c !== ',') { rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++ }
    } else if (c === '"' && !value && !closed) quoted = true
    else { if (closed || c === '"') fail('Unexpected character or quote.'); value += c }
  }
  if (quoted) fail('Unclosed quoted cell.')
  if (value || row.length || closed) { row.push(value); rows.push(row) }
  const columns = rows.shift() ?? []
  if (!columns.length || columns.some(c => !c) || new Set(columns).size !== columns.length) throw new Error(`${name}, row 1, column 1: Missing or duplicate header.`)
  return { columns, rows: rows.map((r, i) => { if (r.length !== columns.length) throw new Error(`${name}, row ${i + 2}, column ${columns[Math.min(r.length, columns.length - 1)]}: Wrong number of cells.`); return Object.fromEntries(columns.map((c, j) => [c, r[j]!])) }) }
}
export function factionPicks(files: CsvFiles): CsvFile {
  const people = new Map(files['people.csv']!.rows.map(r => [r.id, r.display_name]))
  const lists = files['lists.csv']!.rows.map(r => ({ name: people.get(r.person_id ?? '') ?? r.person_id ?? '', ranks: (r.ranked_factions ? r.ranked_factions.split('|') : []) }))
  const columns = ['player', ...Array.from({ length: Math.max(0, ...lists.map(r => r.ranks.length)) }, (_, i) => `rank_${i + 1}`)]
  return { columns, rows: lists.map(r => Object.fromEntries(columns.map((c, i) => [c, i === 0 ? r.name : r.ranks[i - 1] ?? '']))) }
}
