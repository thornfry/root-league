import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSession } from '../../auth/session'
import { FACTIONS, findFaction } from '../../data/factions'
import { getSupabase } from '../../db/client'
import type { Database } from '../../db/types'
import { Alert, Button, Tag } from '../../ui'
import { FactionRow } from '../../ui/FactionRow'
import './my-list.css'

type Season = Database['public']['Tables']['seasons']['Row']
type Entry = Database['public']['Views']['roster_public']['Row']

/** The most factions a list can hold; the database refuses more (decision 53). */
export const LIST_MAX = 5

/** Validation also handles old lists invalidated by a pool change, without silently dropping ranks. */
export function listProblems(codes: string[], pool: string[]) {
  const problems: string[] = []
  if (new Set(codes).size !== codes.length) problems.push('Each faction can appear only once. Remove the duplicate faction.')
  for (const code of new Set(codes)) {
    if (!pool.includes(code)) problems.push(`${findFaction(code)?.name ?? code} is outside the season pool. Remove it before saving.`)
  }
  return problems
}

export function MyList() {
  const session = useSession()
  const admin = session.status === 'in' && session.whoami.isAdmin
  const personId = session.status === 'in' ? session.whoami.personId : null
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string>(() => params.get('player') ?? '')
  const query = useQuery({
    queryKey: ['my-list', personId],
    staleTime: 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const db = getSupabase()
      const seasonResult = await db.from('seasons').select('*').eq('is_current', true).maybeSingle()
      if (seasonResult.error) throw new Error(seasonResult.error.message)
      const season = seasonResult.data
      if (!season) return null
      const [stage, roster] = await Promise.all([
        db.from('season_stage').select('stage').eq('season_id', season.id).single(),
        db.from('roster_public').select('*').eq('season_id', season.id),
      ])
      if (stage.error) throw new Error(stage.error.message)
      if (roster.error) throw new Error(roster.error.message)
      return { season, stage: stage.data.stage, roster: roster.data }
    },
  })
  if (query.isPending) return <><h1 className="disp h1s">My factions</h1><p role="status">Loading your factions…</p></>
  if (query.error) return <><h1 className="disp h1s">My factions</h1><Alert tone="bad">{query.error.message}</Alert></>
  if (!query.data) return <><h1 className="disp h1s">My factions</h1><p>No current season yet.</p></>
  const { season, stage, roster } = query.data
  const entry = roster.find(row => row.person_id === (admin && selected ? selected : personId))
  return <div className="my-list stack">
    <h1 className="disp h1s">My factions</h1>
    <p className="muted my-list-lock">{season.lists_lock_at
      ? `Lists lock: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(new Date(season.lists_lock_at))} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
      : 'Lists lock date has not been set.'}</p>
    {admin && <label className="stack8">Edit a player’s factions
      <select value={entry?.person_id ?? ''} onChange={e => setSelected(e.target.value)}>
        <option value="">Choose a player</option>
        {roster.map(row => <option key={row.person_id} value={row.person_id}>{row.display_name}</option>)}
      </select>
    </label>}
    {!entry ? <Alert tone="info">Join the league to rank factions. <Link to="/">Back to Home</Link></Alert>
      : <ListEditor key={`${season.id}:${entry.person_id}`} season={season} entry={entry} editable={admin || stage === 'open'} admin={admin} />}
  </div>
}

function ListEditor({ season, entry, editable, admin }: { season: Season; entry: Entry; editable: boolean; admin: boolean }) {
  const [codes, setCodes] = useState(entry.ranked_factions ?? [])
  const [saved, setSaved] = useState(entry.ranked_factions ?? [])
  const [message, setMessage] = useState('')
  const client = useQueryClient()
  const pool = season.faction_pool ?? []
  const minimum = season.min_list_length
  const problems = listProblems(codes, pool)
  const ready = minimum !== null && codes.length >= minimum && codes.length <= LIST_MAX && problems.length === 0
  const full = codes.length >= LIST_MAX
  const mutation = useMutation({
    mutationFn: async () => {
      const args = { p_season_id: season.id, p_factions: codes }
      const { error } = admin
        ? await getSupabase().rpc('roster_set_list', { ...args, p_person_id: entry.person_id })
        : await getSupabase().rpc('save_ranked_list', args)
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => {
      setSaved([...codes])
      setMessage(ready ? 'Factions saved. You are ready.' : 'Factions saved. Not ready yet.')
      await client.invalidateQueries({ queryKey: ['my-list'] })
    },
    onError: async () => { await client.invalidateQueries({ queryKey: ['my-list'] }) },
  })
  function change(next: string[], notice: string) { setCodes(next); setMessage(notice); mutation.reset() }
  function move(index: number, delta: number) {
    const next = [...codes]
    const code = next[index]
    const neighbor = next[index + delta]
    if (code === undefined || neighbor === undefined) return
    next[index] = neighbor
    next[index + delta] = code
    change(next, `${findFaction(code)?.name ?? code} moved to rank ${index + delta + 1}.`)
  }
  const dirty = JSON.stringify(codes) !== JSON.stringify(saved)
  const savable = dirty && problems.length === 0 && codes.length <= LIST_MAX
  const save = <Button variant="pri" disabled={!savable || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Saving…' : 'Save factions'}</Button>
  const range = minimum === null ? null : minimum >= LIST_MAX ? `${LIST_MAX}` : `${minimum} to ${LIST_MAX}`
  return <>
    {editable ? <>
      <p className="muted">Best first. {range === null ? 'The admin must set a minimum list length before your list can be ready.' : `Pick ${range} factions.`} Each faction can appear only once. You can save part of a list and come back to it.</p>
      <div className="row">{dirty ? <Tag tone="warn">Unsaved changes</Tag> : entry.list_in && !entry.list_flagged && problems.length === 0 ? <Tag tone="ok" icon="check">Ready</Tag> : <Tag tone="warn">Not ready</Tag>}</div>
      {range !== null && !ready && problems.length === 0 && <Alert tone="warn">{codes.length > LIST_MAX
        ? `A list can hold at most ${LIST_MAX} factions. Remove ${codes.length - LIST_MAX} to be ready.`
        : `Pick ${range} factions to be ready. You have ${codes.length}.`}</Alert>}
    </> : <><Tag icon="lock">Locked</Tag><Alert tone="info">Lists are locked. Ask the admin if something needs changing.</Alert></>}
    {entry.list_flagged && <Alert tone="warn">The faction pool changed. Review your list and save it again.</Alert>}
    {problems.map(problem => <Alert key={problem} tone="warn">{problem}</Alert>)}
    <p role="status" aria-label="List updates" aria-live="polite">{message}</p>
    {mutation.error && <Alert tone="bad">{mutation.error.message}</Alert>}
    <div className="stack" aria-label="Ranked factions">
      {!codes.length && <p className="muted">Nothing ranked yet. Add a faction below.</p>}
      {codes.map((code, i) => <FactionRow key={`${i}:${code}`} code={code} rank={i + 1} flagged={!pool.includes(code)}>
        {editable && <>
          <Button size="sm" disabled={i === 0 || mutation.isPending} aria-label={`Move ${findFaction(code)?.name ?? code} up`} onClick={() => move(i, -1)}>Up</Button>
          <Button size="sm" disabled={i === codes.length - 1 || mutation.isPending} aria-label={`Move ${findFaction(code)?.name ?? code} down`} onClick={() => move(i, 1)}>Down</Button>
          <Button size="sm" variant="ghost-danger" disabled={mutation.isPending} aria-label={`Remove ${findFaction(code)?.name ?? code}`} onClick={() => change(codes.filter((_, index) => index !== i), `${findFaction(code)?.name ?? code} removed.`)}>Remove</Button>
        </>}
      </FactionRow>)}
    </div>
    {editable && <>
      <h2 className="disp h2">Add a faction</h2>
      {full && <p className="muted">Your list holds {LIST_MAX} factions, the most it can. Remove one to add another.</p>}
      <div className="my-list-pool">{FACTIONS.filter(f => pool.includes(f.code) && !codes.includes(f.code)).map(f => <FactionRow key={f.code} code={f.code}>
        <Button disabled={mutation.isPending || full} aria-label={`Add ${f.name}`} onClick={() => change([...codes, f.code], `${f.name} added.`)}>Add</Button>
      </FactionRow>)}</div>
      {!full && pool.every(code => codes.includes(code)) && <p>All factions in the season pool are ranked.</p>}
      <Button disabled={mutation.isPending || !dirty} onClick={() => change([...saved], 'Changes discarded.')}>Discard changes</Button>
      <div className="my-list-bottom">{save}</div>
    </>}
  </>
}
