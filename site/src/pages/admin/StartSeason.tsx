import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { loadStart, publishDraft, startChecks, type StartData } from '../../db/start'
import { startDraft, type DraftRun } from '../../pairing/client'
import type { AssignResult } from '../../pairing/assign'
import { findFaction } from '../../data/factions'
import { Alert, Button, Card, Field, Tag } from '../../ui'
import { LockListsNow } from './LockListsNow'

export function StartSeason() {
  const query = useQuery({ queryKey: ['admin-start'], queryFn: loadStart, staleTime: 0 })
  return <><div className="kicker">Admin</div><h1 className="disp h1s">Start season</h1>
    {query.isPending ? <p role="status">Loading season</p> : query.isError ? <Alert tone="bad">{query.error.message} <Button onClick={() => void query.refetch()}>Retry</Button></Alert> : !query.data ? <Alert tone="info">Create a season on <Link to="/admin/season">Season</Link> first.</Alert> : <StartFlow key={JSON.stringify(query.data)} data={query.data} />}
  </>
}
function StartFlow({ data }: { data: StartData }) {
  const client = useQueryClient()
  const [seed, setSeed] = useState(() => data.season.seed ?? crypto.randomUUID())
  const [result, setResult] = useState<AssignResult | null>(null)
  const [running, setRunning] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const run = useRef<DraftRun | null>(null)
  useEffect(() => () => { const active = run.current; run.current = null; active?.cancel() }, [])
  const checks = startChecks(data)
  const ready = checks.every(c => c.ok)
  const busy = running || publishing
  function changeSeed(value: string) { setSeed(value); setResult(null); setError('') }
  async function assign() {
    if (!ready || busy || !seed.trim()) return
    setResult(null); setError(''); setRunning(true); setProgress(0)
    const s = data.season
    const active = startDraft({ seed, season: { capacity: s.capacity!, gamesEach: s.games_each!, maps: s.maps!, factionPool: s.faction_pool! }, roster: data.roster.map(r => ({ id: r.person_id, name: r.display_name, list: r.ranked_factions! })) }, { onProgress: setProgress })
    run.current = active
    try { const draft = await active.result; if (run.current === active) setResult(draft) }
    catch (failure) { if (run.current === active) setError(failure instanceof Error ? failure.message : 'Draft failed.') }
    finally { if (run.current === active) { run.current = null; setRunning(false) } }
  }
  async function publish() {
    if (!result?.ok || busy) return
    setPublishing(true); setError('')
    try { await publishDraft(data.season, result); setPublished(true); setResult(null); await client.invalidateQueries() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Publish failed.'); setResult(null); void client.invalidateQueries({ queryKey: ['admin-start'] }) }
    finally { setPublishing(false) }
  }
  if (published || data.stage === 'live') return <Alert tone="ok">The season has started. <Link to="/pairings">See the pairings</Link>. Joining is closed.</Alert>
  return <div className="stack18">
    <h2 className="disp h2b">{ready ? 'Ready to start' : 'Not ready to start'}</h2>
    {checks.map(c => <Alert key={c.link + c.text} tone={c.ok ? 'ok' : 'bad'}>{c.text} {!c.ok && !c.problems?.length && <Link to={c.link}>Fix this</Link>}
      {c.problems?.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{c.problems.map(p => <li key={p.personId}><b>{p.name}:</b> {p.reason} <Link to={p.link}>Edit {p.name}’s factions</Link></li>)}</ul> : null}
    </Alert>)}
    {data.stage === 'open' && <div className="row"><LockListsNow seasonId={data.season.id} /><span className="muted">Locks lists now, without waiting for the lock date.</span></div>}
    <Card pad={20}><div className="stack18"><h2 className="disp h2b">1. Player numbers</h2><p>Numbers are dealt at random from the seed. Same seed and lists, same draft. Reloading discards the unpublished draft.</p>
      <Field label="Seed" value={seed} disabled={busy} onChange={e => changeSeed(e.target.value)} />
      <Button disabled={busy} onClick={() => changeSeed(crypto.randomUUID())}>Re-roll with a new seed</Button>
      <h2 className="disp h2b">2. Assign factions</h2>
      {running ? <><progress aria-label="Assigning factions" max={100} value={Math.round(progress * 100)} /><p role="status">Assigning factions, {Math.round(progress * 100)}%</p><Button onClick={() => { const active = run.current; run.current = null; active?.cancel(); setRunning(false); setResult(null) }}>Cancel</Button></> : <Button disabled={!ready || busy || !seed.trim()} onClick={() => void assign()}>{result ? 'Run again with this seed' : 'Assign factions'}</Button>}
    </div></Card>
    {error && <Alert tone="bad">{error}</Alert>}
    {result && <>
      <h2 className="disp h2b">3. Draft report</h2>
      {!result.ok ? <><Alert tone="bad">Faction step could not meet the hard rules. No draft was saved. {result.message}</Alert><Card pad={20}><h3>What blocked it</h3><p>Players: {result.blocking.players.join(', ') || 'None identified'}</p><p>Tables: {result.blocking.tables.join(', ') || 'None identified'}</p><p>Rules: {result.blocking.rules.join(', ')}</p>{result.report.violations.map((v, i) => <p key={i}>{v.message}</p>)}<Link to="/admin/fixit">Edit a list on Fix it</Link></Card></> : <>
        <Tag tone="warn">Draft: nobody can see it yet</Tag><Alert tone="ok">All hard rules met.</Alert>
        {result.players.map((p, i) => <Card pad={16} key={p.id}><h3>P{i + 1}: {p.name}</h3><p>Ranked list: {p.list.map(f => findFaction(f)?.name ?? f).join(', ')}</p>{result.report.players.find(r => r.id === p.id)?.games.map(g => <p key={g.gameNo}>Table {g.gameNo}: {findFaction(g.faction ?? '')?.name ?? g.faction}, rank {g.rank}, seat {g.seat}</p>)}</Card>)}
        {result.report.tables.map(t => <Card pad={16} key={t.gameNo}><h3>Table {t.gameNo}: {data.season.maps?.[t.map]}</h3><p>Reach: {t.reach}. Mix: {t.militant} militant, {t.insurgent} insurgent. Rules: {t.broken.length ? t.broken.join(', ') : 'Met'}.</p></Card>)}
        <Card pad={20}><h3>Meetings</h3><p>Fewest: {result.report.meetings.fewest}. Most: {result.report.meetings.most}. Spread: {result.report.meetings.spread}. Map repeats: {result.report.meetings.mapRepeats}.</p><details><summary>All player meetings</summary>{result.report.meetings.pairs.map((p, i) => <p key={i}>{p.a} and {p.b}: {p.count}</p>)}</details></Card>
        <Card pad={20}><h2 className="disp h2b">4. Publish</h2><p>Pairings go live, joining closes and pick'ems open.</p><Button disabled={busy || !ready} onClick={() => void publish()}>Publish pairings</Button> <Button disabled={busy} onClick={() => setResult(null)}>Discard draft</Button></Card>
      </>}
    </>}
  </div>
}
