import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../../db/client'
import { Alert, Button, Card } from '../../ui'
import { download, exportState, importState, readFiles, type Preview } from '../../csv/api'
import { encodeCsv, factionPicks, type CsvFiles } from '../../csv/format'
import { zip } from '../../csv/zip'

export function Csv() {
  const client = useQueryClient()
  const season = useQuery({ queryKey: ['csv-season'], queryFn: async () => {
    const { data, error } = await getSupabase().from('seasons').select('id, started_at').eq('is_current', true).maybeSingle()
    if (error) throw new Error(error.message)
    return data
  } })
  const [chosen, setChosen] = useState<File[]>([])
  const [checked, setChecked] = useState<{ files: CsvFiles; preview: Preview } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'CSV operation failed.') } finally { setBusy(false) } }
  const disabled = busy || !season.data
  return <>
    <header className="stack8"><div className="kicker">Admin</div><h1 className="disp h1s">CSV</h1></header>
    {season.isPending ? <p role="status">Loading season</p> : null}
    {season.error ? <Alert tone="bad">{season.error.message}<Button onClick={() => void season.refetch()}>Try again</Button></Alert> : null}
    {season.isSuccess && !season.data ? <Alert tone="info">No current season.</Alert> : null}
    {error ? <Alert tone="bad">Nothing imported. {error}</Alert> : null}
    {message ? <p role="status">{message}</p> : null}
    <Card pad={20}><div className="stack18"><h2 className="disp h2b">Export</h2><h3>Faction picks</h3><p>One row per player, with a column for each rank.</p>
      <Button disabled={disabled} onClick={() => void run(async () => { const files = await exportState(season.data!.id); download('faction-picks.csv', encodeCsv(factionPicks(files)), 'text/csv;charset=utf-8') })}>Download faction picks</Button>
      <h3>League state</h3><p>One CSV per area, downloaded together as league-state.zip.</p>
      <Button variant="pri" disabled={disabled} onClick={() => void run(async () => { const files = await exportState(season.data!.id); download('league-state.zip', zip(Object.fromEntries(Object.entries(files).map(([name, f]) => [name, encodeCsv(f)]))), 'application/zip') })}>Download league state</Button>
    </div></Card>
    <Card pad={20}><div className="stack18"><h2 className="disp h2b">Import league state</h2>
      <label htmlFor="csv-files">Choose the .csv files, or the zip</label><input id="csv-files" type="file" multiple accept=".csv,.zip,text/csv,application/zip" disabled={disabled} onChange={e => { setChosen(Array.from(e.target.files ?? [])); setChecked(null); setError(''); setMessage('') }} />
      <p style={{ overflowWrap: 'anywhere' }}>{chosen.map(f => f.name).join(', ')}</p>
      <Button disabled={disabled || !chosen.length} onClick={() => void run(async () => { setChecked(null); const files = await readFiles(chosen); const preview = await importState(season.data!.id, files, true); setChecked({ files, preview }) })}>Preview changes</Button>
      <p>All files must validate. Nothing is written until you confirm. Pairings are not imported; games and seats are references. The log is append-only.</p>
      {checked ? <>
        <h3>Preview: {checked.preview.total_changes} changes</h3>
        {season.data?.started_at ? <Alert tone="warn">The season has started. Review changes to games and results before importing.</Alert> : null}
        {checked.preview.warnings.map(w => <Alert key={w} tone="warn">{w}</Alert>)}
        <ul style={{ overflowWrap: 'anywhere' }}>{checked.preview.changes.map((c, i) => <li key={i}>{c.file}: {c.action} {c.key}{c.columns?.length ? ` (${c.columns.join(', ')})` : ''}</li>)}</ul>
        <p>Preview lists up to 200 changes. Log entries and pairing references are not imported.</p>
        <Button variant="danger" disabled={disabled || checked.preview.total_changes === 0} onClick={() => void run(async () => { const files = checked.files; setChecked(null); const result = await importState(season.data!.id, files, false); setMessage(`Imported ${result.total_changes} changes.`); await client.invalidateQueries() })}>Confirm import</Button>
      </> : null}
    </div></Card>
  </>
}
