import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { getSupabase } from '../../db/client'
import type { Database } from '../../db/types'
import { FACTIONS } from '../../data/factions'
import { CAPACITIES, getLayout, isCapacity, MAX_MAPS, TEN_WITH_THREE_REASON, VALID_GAMES_EACH } from '../../data/valid-pairs'
import { Alert, Button, ButtonLink, Card, Field, FactionSeal, Tag, type FactionCode } from '../../ui'

import './Season.css'

type SeasonRow = Database['public']['Tables']['seasons']['Row']

/** datetime-local has no zone: translate the stored instant to this browser's wall clock. */
export function localDateTime(utc: string | null): string {
  if (!utc) return ''
  const date = new Date(utc)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function Season() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['season-setup'],
    queryFn: async () => {
      const { data, error } = await getSupabase().from('seasons').select('*').eq('is_current', true).maybeSingle()
      if (error) throw error
      return data
    },
  })
  const refresh = async () => { await client.invalidateQueries() }
  return <>
    <div className="kicker">Admin</div>
    <h1 className="disp h1s">Season</h1>
    {query.isPending ? <p role="status">Loading season</p> : query.isError ? <Alert tone="bad">{query.error.message}</Alert> : <>
      {query.data ? <SeasonForm key={query.data.id} season={query.data} refresh={refresh} /> : <Alert tone="info">No current season. Create one to set it up.</Alert>}
      <CreateSeason refresh={refresh} />
    </>}
  </>
}

function SeasonForm({ season, refresh }: { season: SeasonRow; refresh: () => Promise<void> }) {
  const [name, setName] = useState(season.name)
  const [capacity, setCapacity] = useState(season.capacity?.toString() ?? '')
  const [games, setGames] = useState(season.games_each?.toString() ?? '')
  const [maps, setMaps] = useState(season.maps ?? [])
  const [pool, setPool] = useState(season.faction_pool ?? [])
  const [minimum, setMinimum] = useState(season.min_list_length?.toString() ?? '')
  const [lock, setLock] = useState(localDateTime(season.lists_lock_at))
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const live = season.started_at !== null
  const cap = Number(capacity)
  const each = Number(games)
  const layout = getLayout(cap, each, maps.length)
  const uneven = cap === 8 && (each === 2 || each === 3)
  const gamesOptions = isCapacity(cap) ? VALID_GAMES_EACH[cap] : []
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || (uneven && !ack)) return
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      if ((games && maps.length < each) || maps.length > MAX_MAPS) throw new Error(`Use at least ${each} maps and at most ${MAX_MAPS}.`)
      if (maps.some((map) => !map.trim())) throw new Error('Every map needs a name.')
      const { error: failure } = await getSupabase().rpc('season_save', {
        p_season_id: season.id, p_name: name,
        p_capacity: capacity ? cap : undefined, p_games_each: games ? each : undefined,
        p_maps: maps.length ? maps.map((map) => map.trim()) : undefined,
        p_faction_pool: pool.length ? pool : undefined,
        p_min_list_length: minimum ? Number(minimum) : undefined,
        p_lists_lock_at: lock ? new Date(lock).toISOString() : undefined,
      })
      if (failure) throw failure
      await refresh()
      setSaved(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : (failure as { message: string }).message)
    } finally { setBusy(false) }
  }

  return <div className="season-layout">
    <Card pad={20}><form className="stack18" onSubmit={save}>
      <Field label="Season name" value={name} required onChange={(e) => setName(e.target.value)} />
      <fieldset disabled={live || busy}><legend>Capacity</legend><div className="row">
        {CAPACITIES.map((value) => <label className="rad" key={value}><input type="radio" name="capacity" value={value} checked={cap === value} onChange={() => {
          setCapacity(String(value)); setAck(false); setSaved(false)
          if (!VALID_GAMES_EACH[value].includes(each)) setGames('')
        }} />{value} players</label>)}
      </div></fieldset>
      <fieldset disabled={live || busy || !capacity}><legend>Games each</legend><div className="row">
        {gamesOptions.map((value) => <label className="rad" key={value}><input type="radio" name="games" checked={each === value} onChange={() => { setGames(String(value)); setAck(false); setSaved(false) }} />{value} games</label>)}
      </div></fieldset>
      <p className="muted">{TEN_WITH_THREE_REASON}</p>
      <fieldset disabled={busy}><legend>Maps</legend><div className="stack8">
        {maps.map((map, index) => <div className="row" key={index}>
          <Field label={`Map ${index + 1}`} value={map} required onChange={(e) => setMaps(maps.map((old, i) => i === index ? e.target.value : old))} />
          {!live && <Button type="button" onClick={() => { setMaps(maps.filter((_, i) => i !== index)); setAck(false) }} aria-label={`Remove map ${index + 1}`}>Remove</Button>}
        </div>)}
        {!live && <Button type="button" disabled={maps.length >= MAX_MAPS} onClick={() => { setMaps([...maps, '']); setAck(false) }}>Add map</Button>}
        <p className="muted">At least {games || 'games each'} maps, at most 6. The layout uses map names in order. Extra names beyond those used by the layout are unused.</p>
      </div></fieldset>
      <fieldset disabled={busy}><legend>Faction pool</legend><div className="season-pool">
        {FACTIONS.map((faction) => <label className="chk" key={faction.code}>
          <input type="checkbox" checked={pool.includes(faction.code)} onChange={(e) => setPool(e.target.checked ? [...pool, faction.code] : pool.filter((code) => code !== faction.code))} />
          <FactionSeal code={faction.code as FactionCode} />{faction.name}
        </label>)}
      </div><p className="muted">{pool.length} of {FACTIONS.length} in the pool. Removing a ranked faction flags affected lists for attention.</p></fieldset>
      <Field label="Minimum list length" type="number" min={1} max={pool.length || undefined} value={minimum} onChange={(e) => setMinimum(e.target.value)} />
      <Field label="Lists lock date and time" type="datetime-local" step={1} value={lock} onChange={(e) => setLock(e.target.value)} hint={`Your time zone is ${zone}. Everyone sees their local time; the date is stored in UTC.`} />
      <div className="row"><Button type="submit" variant="pri" disabled={busy || (uneven && !ack)}>{busy ? 'Saving' : 'Save season'}</Button><ButtonLink to="/admin/start">Start season</ButtonLink></div>
      {error && <Alert tone="bad">{error}</Alert>}
      {saved && <p role="status">Season saved.</p>}
    </form></Card>
    <div className="stack18"><Card pad={20}><div className="stack">
      <h2 className="disp h2b">Layout</h2>
      {layout ? <>
        <p>{cap} players, {each} games each: {layout.games.length} games, 4 players each.</p>
        <Tag tone={uneven ? 'warn' : 'ok'}>{uneven ? 'Uneven meetings' : 'Even meetings'}</Tag>
        <p>Meeting spread: {layout.stats.meetingSpread}. Each pair meets {layout.stats.fewestMeetings} to {layout.stats.mostMeetings} times.</p>
        <p className="muted">Nobody sits in the same seat twice. Map repeats: {layout.stats.mapRepeats}.</p>
      </> : <p>Choose capacity, games each and enough maps to see the layout.</p>}
      {uneven && <Alert tone="warn"><p>This layout has uneven meetings. Some pairs meet more often than others.</p>
        <label className="chk"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I acknowledge the uneven meetings. Use it anyway.</label>
      </Alert>}
    </div></Card>
    <Alert tone="info">Capacity, games each and map count {live ? 'are locked now the season has started' : 'lock when the season starts'}. Use <Link to="/admin/fixit">Fix it</Link> after start.</Alert></div>
  </div>
}

function CreateSeason({ refresh }: { refresh: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function create(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const { error: failure } = await getSupabase().rpc('season_create', { p_name: name })
      if (failure) throw failure
      await refresh()
      setName('')
    } catch (failure) { setError((failure as { message: string }).message) }
    finally { setBusy(false) }
  }
  return <Card pad={20}><form className="stack" onSubmit={create}>
    <h2 className="disp h2b">Create season</h2>
    <p className="muted">The new season becomes current. The previous season stays stored. Settings and roster start empty.</p>
    <Field label="New season name" required value={name} onChange={(e) => setName(e.target.value)} />
    <div><Button type="submit" disabled={busy}>{busy ? 'Creating' : 'Create season'}</Button></div>
    {error && <Alert tone="bad">{error}</Alert>}
  </form></Card>
}
