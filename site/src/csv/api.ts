import { getSupabase } from '../db/client'
import type { Json } from '../db/types'
import { parseCsv, type CsvFiles } from './format'
import { unzip } from './zip'
export type Preview = { total_changes: number; changes: { file: string; action: string; key: string; columns?: string[] }[]; warnings: string[]; ignored: string[] }
export async function exportState(season: string) {
  const { data, error } = await getSupabase().rpc('export_league_state', { p_season_id: season })
  if (error) throw new Error(error.message)
  return data as unknown as CsvFiles
}
export async function importState(season: string, files: CsvFiles, preview: boolean) {
  const { data, error } = await getSupabase().rpc('import_league_state', { p_season_id: season, p_files: files as unknown as Json, p_preview: preview })
  if (error) throw new Error(error.message)
  return data as unknown as Preview
}
export async function readFiles(files: File[]): Promise<CsvFiles> {
  const result: CsvFiles = {}
  for (const file of files) {
    let entries: Record<string, string>
    try { entries = file.name.toLowerCase().endsWith('.zip') ? await unzip(await file.arrayBuffer()) : { [file.name]: await file.text() } }
    catch (e) { throw new Error(`${file.name}, row 1, column 1: ${e instanceof Error ? e.message : 'Cannot read file.'}`, { cause: e }) }
    for (const [name, text] of Object.entries(entries)) {
      if (name in result) throw new Error(`${name}, row 1, column 1: Duplicate file.`)
      result[name] = parseCsv(name, text)
    }
  }
  if (!Object.keys(result).length) throw new Error('Choose at least one CSV file.')
  return result
}
export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
