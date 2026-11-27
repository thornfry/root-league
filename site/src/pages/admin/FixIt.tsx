import { useId, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../../db/client'
import {
  AREAS, describeLog, fetchFixit, fixitDelete, fixitDeletePreview, fixitInsert, fixitUpdate, fixitWarnings, linkPerson, reopenGame,
  removesText, replacePlayer, settleGame, setVoid, type AreaId, type DeletePreview, type FixData, type FixGame, type FixPerson,
} from '../../db/fixit'
import { FACTIONS } from '../../data/factions'
import { Alert, Button, Card, Field, Modal, Tag } from '../../ui'
import { localDate } from '../player/Pairings'
import './FixIt.css'

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`
const factionName = (code: string) => FACTIONS.find((f) => f.code === code)?.name ?? code

// Shared pieces ---------------------------------------------------------------------------------

interface Doer { busy: boolean; error: string; notice: string; warnings: string[]; run: (fn: () => Promise<string[] | void>, notice: string) => Promise<boolean>; fail: (e: unknown) => void }

/** Runs one write, then refreshes everything on screen (standings, pick'em scores and the log included). */
function useDoer(): Doer {
  const client = useQueryClient()
  const [state, setState] = useState({ busy: false, error: '', notice: '', warnings: [] as string[] })
  async function run(fn: () => Promise<string[] | void>, notice: string) {
    setState({ busy: true, error: '', notice: '', warnings: [] })
    try {
      const warnings = (await fn()) ?? []
      await client.invalidateQueries()
      setState({ busy: false, error: '', notice, warnings })
      return true
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : String(e), notice: '', warnings: [] })
      return false
    }
  }
  const fail = (e: unknown) => setState({ busy: false, error: e instanceof Error ? e.message : String(e), notice: '', warnings: [] })
  return { ...state, run, fail }
}

function Feedback({ d }: { d: Doer }) {
  return <div className="stack" aria-live="polite">
    {d.error && <Alert tone="bad">{d.error}</Alert>}
    {d.notice && <Alert tone="ok">{d.notice}</Alert>}
    {d.warnings.length > 0 && <Warnings list={d.warnings} saved />}
  </div>
}

/** Rule warnings never block a save, so they read as news about what was saved. */
function Warnings({ list, saved }: { list: string[]; saved?: boolean }) {
  return <Alert tone="warn"><b>{saved ? `This edit breaks ${plural(list.length, 'rule')}.` : `${plural(list.length, 'rule')} broken.`}</b> {saved ? 'It was saved anyway.' : 'You can still change it.'}
    <ul className="fix-list">{list.map((w) => <li key={w}>{w}</li>)}</ul></Alert>
}

function Select({ label, value, onChange, children, disabled }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; disabled?: boolean }) {
  const id = useId()
  return <div className="field"><label htmlFor={id}>{label}</label>
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>{children}</select></div>
}

function Winners({ legend, game, names, value, onChange }: { legend: string; game: FixGame; names: (id: string) => string; value: string[]; onChange: (v: string[]) => void }) {
  return <fieldset className="fix-winners"><legend>{legend}</legend>
    {game.seats.map((s) => <label className="row" key={s.person_id}>
      <input type="checkbox" checked={value.includes(s.person_id)} onChange={(e) => onChange(e.target.checked ? [...value, s.person_id] : value.filter((id) => id !== s.person_id))} />
      <span>{names(s.person_id)}</span></label>)}
  </fieldset>
}

const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

// People and roles ---------------------------------------------------------------------------------

function PeoplePanel({ data, d }: { data: FixData; d: Doer }) {
  const db = getSupabase()
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null)
  const [del, setDel] = useState<{ person: FixPerson; preview: DeletePreview } | null>(null)
  const [signIn, setSignIn] = useState('')
  const [seeded, setSeeded] = useState('')
  const signIns = data.people.filter((p) => p.auth_user_id && !p.seed_key)
  const seededNames = data.people.filter((p) => p.seed_key && !p.auth_user_id)
  const onRoster = (id: string) => data.roster.find((r) => r.person_id === id)
  const roleOf = (p: FixPerson) => p.discord_id && data.adminDiscordIds.includes(p.discord_id) ? <Tag tone="adm">Admin</Tag>
    : onRoster(p.id) ? <Tag>{onRoster(p.id)!.list === 'league' ? 'League list' : 'Waitlist'}</Tag> : <Tag>Viewer</Tag>
  const signInId = signIn || signIns[0]?.id || ''
  const seededId = seeded || seededNames[0]?.id || ''
  return <div className="stack18">
    <Card pad={20}><div className="stack"><h2 className="disp h2">People and roles</h2>
      <ul className="fix-rows" aria-label="People">
        {data.people.map((p) => <li key={p.id} className="fix-row">
          <div className="fix-main"><b>{p.display_name}</b>
            <span className="muted">{p.discord_id ?? 'No Discord ID'}</span></div>
          <div className="row">{roleOf(p)}{!p.auth_user_id && <Tag>No sign-in linked</Tag>}</div>
          {rename?.id === p.id ? <form className="fix-inline" onSubmit={(e) => { e.preventDefault(); if (rename.name.trim()) void d.run(async () => { await fixitUpdate(db, 'people', { id: p.id }, { display_name: rename.name.trim() }); setRename(null) }, `Renamed to ${rename.name.trim()}.`) }}>
            <Field label={`New name for ${p.display_name}`} value={rename.name} onChange={(e) => setRename({ id: p.id, name: e.target.value })} />
            <Button type="submit" variant="pri" size="sm" disabled={d.busy || !rename.name.trim()}>Save name</Button>
            <Button size="sm" onClick={() => setRename(null)}>Cancel</Button></form>
            : <div className="row">
              <Button size="sm" aria-label={`Rename ${p.display_name}`} onClick={() => setRename({ id: p.id, name: p.display_name })}>Rename</Button>
              <Button size="sm" variant="ghost-danger" aria-label={`Delete ${p.display_name}`} disabled={d.busy}
                onClick={() => void fixitDeletePreview(db, 'people', { id: p.id }).then((preview) => setDel({ person: p, preview }), d.fail)}>Delete</Button></div>}
        </li>)}
      </ul></div></Card>
    <Card pad={20}><div className="stack"><h3 className="disp h2">Link a sign-in to a seeded name</h3>
      {signIns.length && seededNames.length ? <>
        <p className="muted">Moves the sign-in onto the seeded name and removes the empty duplicate. It is refused if the duplicate holds a roster entry, seat, submission or pick.</p>
        <div className="fix-pair">
          <Select label="Sign-in" value={signInId} onChange={setSignIn}>{signIns.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.discord_id ?? 'no Discord ID'})</option>)}</Select>
          <Select label="Seeded name" value={seededId} onChange={setSeeded}>{seededNames.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select></div>
        <div className="row"><Button variant="pri" disabled={d.busy} onClick={() => void d.run(() => linkPerson(db, signInId, seededId), 'Sign-in linked to the seeded name.')}>Link</Button></div></>
        : <p className="muted">Every seeded name has a sign-in, or nobody has signed in without a seeded name.</p>}
    </div></Card>
    <Modal open={!!del} title={`Delete ${del?.person.display_name ?? ''}?`} onClose={() => { if (!d.busy) setDel(null) }}
      actions={<>{del && !del.preview.blocked_by && <Button variant="danger" disabled={d.busy} onClick={() => void d.run(async () => { const w = await fixitDelete(db, 'people', { id: del.person.id }); setDel(null); return w }, `${del.person.display_name} deleted.`)}>Delete person</Button>}
        <Button disabled={d.busy} onClick={() => setDel(null)}>{del?.preview.blocked_by ? 'Close' : 'Cancel'}</Button></>}>
      {del && (del.preview.blocked_by ? <Alert tone="bad">{del.preview.blocked_by}</Alert> : <p>{removesText(del.preview.removes)}</p>)}
    </Modal>
  </div>
}

// Roster and lists -----------------------------------------------------------------------------------

function RosterEditor({ data, personId, d }: { data: FixData; personId: string; d: Doer }) {
  const db = getSupabase()
  const entry = data.roster.find((r) => r.person_id === personId)!
  const [list, setList] = useState(entry.list)
  const [position, setPosition] = useState(String(entry.position))
  const [number, setNumber] = useState(entry.player_number == null ? '' : String(entry.player_number))
  const [submitted, setSubmitted] = useState(entry.list_submitted)
  const [flagged, setFlagged] = useState(entry.list_flagged)
  const [ranked, setRanked] = useState<string[]>(entry.ranked_factions)
  const [add, setAdd] = useState('')
  const free = FACTIONS.filter((f) => !ranked.includes(f.code))
  const addCode = add && free.some((f) => f.code === add) ? add : free[0]?.code ?? ''
  const move = (i: number, by: number) => { const next = [...ranked]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x!); setRanked(next) }
  const save = () => {
    const changes: Record<string, string | number | boolean | string[] | null> = {}
    if (list !== entry.list) changes.list = list
    if (Number(position) !== entry.position) changes.position = Number(position)
    if ((number === '' ? null : Number(number)) !== entry.player_number) changes.player_number = number === '' ? null : Number(number)
    if (submitted !== entry.list_submitted) changes.list_submitted = submitted
    if (flagged !== entry.list_flagged) changes.list_flagged = flagged
    if (!same(ranked, entry.ranked_factions) || ranked.join() !== entry.ranked_factions.join()) changes.ranked_factions = ranked
    return d.run(async () => (await fixitUpdate(db, 'roster', { season_id: entry.season_id, person_id: entry.person_id }, changes)).warnings, 'Roster entry saved.')
  }
  const dirty = list !== entry.list || Number(position) !== entry.position || (number === '' ? null : Number(number)) !== entry.player_number
    || submitted !== entry.list_submitted || flagged !== entry.list_flagged || ranked.join() !== entry.ranked_factions.join()
  return <div className="stack">
    <div className="fix-pair">
      <Select label="Roster place" value={list} onChange={setList}><option value="league">League list</option><option value="waitlist">Waitlist</option></Select>
      <Field label="Position on the list" inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value)} />
      <Field label="Player number" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} hint="Empty until the season starts." /></div>
    <label className="row"><input type="checkbox" checked={submitted} onChange={(e) => setSubmitted(e.target.checked)} />List submitted</label>
    <label className="row"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />List needs attention</label>
    <div className="lbl">Ranked list ({plural(ranked.length, 'faction')})</div>
    <ol className="fix-rows" aria-label="Ranked list">
      {ranked.map((code, i) => <li className="fix-row" key={code}>
        <div className="fix-main"><span className="num fix-rank">{i + 1}</span><span>{factionName(code)}</span></div>
        <div className="row">
          <Button size="sm" aria-label={`Move ${factionName(code)} up`} disabled={i === 0} onClick={() => move(i, -1)}>Up</Button>
          <Button size="sm" aria-label={`Move ${factionName(code)} down`} disabled={i === ranked.length - 1} onClick={() => move(i, 1)}>Down</Button>
          <Button size="sm" variant="ghost-danger" aria-label={`Remove ${factionName(code)}`} onClick={() => setRanked(ranked.filter((c) => c !== code))}>Remove</Button></div>
      </li>)}
    </ol>
    {free.length > 0 && <div className="row fix-add"><Select label="Add a faction" value={addCode} onChange={setAdd}>{free.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}</Select>
      <Button size="sm" onClick={() => { setRanked([...ranked, addCode]); setAdd('') }}>Add</Button></div>}
    <div className="row"><Button variant="pri" disabled={d.busy || !dirty} onClick={() => void save()}>Save roster entry</Button></div>
  </div>
}

function RosterPanel({ data, d }: { data: FixData; d: Doer }) {
  const [person, setPerson] = useState('')
  if (!data.season) return <Card pad={20}>There is no current season.</Card>
  const name = (id: string) => data.people.find((p) => p.id === id)?.display_name ?? 'Unknown person'
  const sorted = [...data.roster].sort((a, b) => name(a.person_id).localeCompare(name(b.person_id)))
  if (!sorted.length) return <Card pad={20}>Nobody is on the roster yet.</Card>
  const id = sorted.some((r) => r.person_id === person) ? person : sorted[0]!.person_id
  return <Card pad={20}><div className="stack"><h2 className="disp h2">Roster and lists</h2>
    <Select label="Person" value={id} onChange={setPerson}>{sorted.map((r) => <option key={r.person_id} value={r.person_id}>{name(r.person_id)} ({r.list === 'league' ? 'league list' : 'waitlist'})</option>)}</Select>
    <RosterEditor key={`${id}:${JSON.stringify(data.roster.find((r) => r.person_id === id))}`} data={data} personId={id} d={d} /></div></Card>
}

// Season settings and dates ----------------------------------------------------------------------

type Kind = 'text' | 'int' | 'time' | 'list'
const SEASON_FIELDS: { col: string; label: string; kind: Kind; hint?: string }[] = [
  { col: 'name', label: 'Season name', kind: 'text' },
  { col: 'capacity', label: 'Capacity', kind: 'int' },
  { col: 'games_each', label: 'Games each', kind: 'int' },
  { col: 'min_list_length', label: 'Minimum list length', kind: 'int' },
  { col: 'lists_lock_at', label: 'Lists lock', kind: 'time' },
  { col: 'started_at', label: 'Season started', kind: 'time', hint: 'Empty means not started.' },
  { col: 'maps', label: 'Maps', kind: 'list', hint: 'Separate with commas.' },
  { col: 'faction_pool', label: 'Faction pool', kind: 'list', hint: 'Faction codes, separated with commas.' },
  { col: 'seed', label: 'Seed', kind: 'text' },
]
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const t = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`
}
const shown = (v: unknown, kind: Kind) => v == null ? '' : kind === 'time' ? toLocalInput(String(v)) : Array.isArray(v) ? v.join(', ') : String(v)
function parseField(raw: string, kind: Kind): string | number | string[] | null {
  const v = raw.trim()
  if (kind === 'list') return v ? v.split(',').map((x) => x.trim()).filter(Boolean) : null
  if (!v) return null
  if (kind === 'int') return Number(v)
  if (kind === 'time') return new Date(v).toISOString()
  return v
}

function SeasonEditor({ season, d }: { season: NonNullable<FixData['season']>; d: Doer }) {
  const db = getSupabase()
  const original = Object.fromEntries(SEASON_FIELDS.map((f) => [f.col, shown((season as Record<string, unknown>)[f.col], f.kind)]))
  const [values, setValues] = useState(original)
  const changed = SEASON_FIELDS.filter((f) => values[f.col] !== original[f.col])
  const save = () => {
    const changes = Object.fromEntries(changed.map((f) => [f.col, parseField(values[f.col]!, f.kind)]))
    return d.run(async () => (await fixitUpdate(db, 'seasons', { id: season.id }, changes)).warnings, 'Season saved.')
  }
  return <div className="stack">
    {SEASON_FIELDS.map((f) => <Field key={f.col} label={f.label} hint={f.hint} type={f.kind === 'time' ? 'datetime-local' : 'text'} inputMode={f.kind === 'int' ? 'numeric' : undefined}
      value={values[f.col]} onChange={(e) => setValues({ ...values, [f.col]: e.target.value })} />)}
    {season.started_at && <Alert tone="warn">The season has started. Changing capacity or games each does not change the published games. It still saves.</Alert>}
    <div className="row"><Button variant="pri" disabled={d.busy || !changed.length} onClick={() => void save()}>Save season</Button></div>
  </div>
}

function SeasonPanel({ data, d }: { data: FixData; d: Doer }) {
  if (!data.season) return <Card pad={20}>There is no current season. <Link to="/admin/season">Set one up</Link></Card>
  return <Card pad={20}><div className="stack"><h2 className="disp h2">Season settings and dates</h2>
    <SeasonEditor key={JSON.stringify(data.season)} season={data.season} d={d} /></div></Card>
}

// Games, seats and factions ------------------------------------------------------------------------

const mapOf = (data: FixData, g: FixGame) => data.season?.maps?.[g.map_index] ?? 'Map not set'

function GameSelect({ data, value, onChange }: { data: FixData; value: string; onChange: (v: string) => void }) {
  return <Select label="Game" value={value} onChange={onChange}>{data.games.map((g) => <option key={g.id} value={g.id}>Table {g.game_no}, {mapOf(data, g)}</option>)}</Select>
}

function SeatEditor({ data, game, d }: { data: FixData; game: FixGame; d: Doer }) {
  const db = getSupabase()
  const [draft, setDraft] = useState(game.seats.map((s) => ({ person_id: s.person_id, faction: s.faction })))
  const current = useQuery({ queryKey: ['fixit-warnings', game.id], queryFn: () => fixitWarnings(db, 'games', { id: game.id }) })
  const dirty = game.seats.some((s, i) => s.person_id !== draft[i]!.person_id || s.faction !== draft[i]!.faction)
  const save = () => d.run(async () => {
    let warnings: string[] = []
    for (const [i, s] of game.seats.entries()) {
      const next = draft[i]!
      const changes: Record<string, string> = {}
      if (next.person_id !== s.person_id) changes.person_id = next.person_id
      if (next.faction !== s.faction) changes.faction = next.faction
      if (Object.keys(changes).length) warnings = (await fixitUpdate(db, 'game_seats', { game_id: game.id, seat: s.seat }, changes)).warnings
    }
    return warnings
  }, 'Seats saved.')
  const set = (i: number, patch: Partial<(typeof draft)[number]>) => setDraft(draft.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return <div className="stack">
    <ul className="fix-rows" aria-label="Seats">
      {game.seats.map((s, i) => <li key={s.seat} className="fix-row fix-seat">
        <span className="num fix-rank">{s.seat}</span>
        <Select label={`Player, seat ${s.seat}`} value={draft[i]!.person_id} onChange={(v) => set(i, { person_id: v })}>
          {data.people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select>
        <Select label={`Faction, seat ${s.seat}`} value={draft[i]!.faction} onChange={(v) => set(i, { faction: v })}>
          {FACTIONS.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}</Select>
      </li>)}
    </ul>
    {d.warnings.length === 0 && current.isSuccess && (current.data.length ? <Warnings list={current.data} /> : <Alert tone="ok">No pairing rule is broken.</Alert>)}
    <p className="muted">Rule warnings never stop a save. To swap two players at one table, replace one of them first.</p>
    <div className="row"><Button variant="pri" disabled={d.busy || !dirty} onClick={() => void save()}>Save seats</Button></div>
  </div>
}

function ReplaceCard({ data, d }: { data: FixData; d: Doer }) {
  const db = getSupabase()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [game, setGame] = useState('')
  if (!data.season) return null
  const season = data.season
  const seated = data.people.filter((p) => data.roster.some((r) => r.person_id === p.id) || data.games.some((g) => g.seats.some((s) => s.person_id === p.id)))
  const fromId = from || seated[0]?.id || ''
  const toId = to || data.people.find((p) => p.id !== fromId)?.id || ''
  return <Card pad={20}><div className="stack"><h3 className="disp h2">Replace a player in a slot</h3>
    <p className="muted">The seats and picks stay and name the new player. Choose a game to replace them in that game only, for someone who did not turn up.</p>
    <div className="fix-pair">
      <Select label="Replace" value={fromId} onChange={setFrom}>{seated.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select>
      <Select label="With" value={toId} onChange={setTo}>{data.people.filter((p) => p.id !== fromId).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select>
      <Select label="In" value={game} onChange={setGame}><option value="">Every game this season</option>{data.games.map((g) => <option key={g.id} value={g.id}>Table {g.game_no} only</option>)}</Select></div>
    <div className="row"><Button variant="pri" disabled={d.busy || !fromId || !toId} onClick={() => void d.run(() => replacePlayer(db, season.id, fromId, toId, game || undefined), 'Player replaced.')}>Replace player</Button></div>
  </div></Card>
}

function GamesPanel({ data, d }: { data: FixData; d: Doer }) {
  const [gameId, setGameId] = useState('')
  const game = data.games.find((g) => g.id === gameId) ?? data.games[0]
  return <div className="stack18">
    {!game ? <Card pad={20}>There are no games yet. Start the season first.</Card> : <Card pad={20}><div className="stack">
      <div className="rowb"><h2 className="disp h2">Table {game.game_no}, {mapOf(data, game)}</h2><GameSelect data={data} value={game.id} onChange={setGameId} /></div>
      <SeatEditor key={`${game.id}:${JSON.stringify(game.seats)}`} data={data} game={game} d={d} /></div></Card>}
    {game && <ReplaceCard data={data} d={d} />}
  </div>
}

// Submissions and results --------------------------------------------------------------------------

function Answer({ game, names, person, current, d }: { game: FixGame; names: (id: string) => string; person: FixPerson | undefined; current: string[] | null; d: Doer }) {
  const db = getSupabase()
  const [winners, setWinners] = useState(current ?? [])
  const who = person?.display_name ?? 'Unknown person'
  const personId = person?.id ?? ''
  const key = { game_id: game.id, person_id: personId }
  return <div className="fix-row fix-answer"><div className="stack8"><b>{who}</b><span className="muted">{current ? `Says ${current.map(names).join(', ')} won` : 'No answer'}</span></div>
    <Winners legend={`${who}’s answer`} game={game} names={names} value={winners} onChange={setWinners} />
    <div className="row"><Button size="sm" disabled={d.busy || !winners.length || (!!current && same(winners, current))}
      onClick={() => void d.run(async () => current ? (await fixitUpdate(db, 'submissions', key, { winners })).warnings : (await fixitInsert(db, 'submissions', { ...key, winners })).warnings, `${who}’s answer saved.`)}>Save answer for {who}</Button>
      {current && <Button size="sm" variant="ghost-danger" disabled={d.busy} onClick={() => void d.run(() => fixitDelete(db, 'submissions', key), `${who}’s answer removed.`)}>Remove answer for {who}</Button>}</div></div>
}

function ResultsPanel({ data, d }: { data: FixData; d: Doer }) {
  const db = getSupabase()
  const [gameId, setGameId] = useState('')
  const game = data.games.find((g) => g.id === gameId) ?? data.games[0]
  const settlement = game ? data.settlements.find((s) => s.game_id === game.id) : undefined
  const names = (id: string) => data.people.find((p) => p.id === id)?.display_name ?? 'Unknown person'
  const [final, setFinal] = useState<string[]>([])
  if (!game) return <Card pad={20}>There are no games yet.</Card>
  const answers = data.submissions.filter((s) => s.game_id === game.id)
  const state = game.void ? 'Void' : settlement ? 'Settled' : answers.length ? 'Answers in' : 'Upcoming'
  return <Card pad={20}><div className="stack">
    <div className="rowb"><h2 className="disp h2">Table {game.game_no} <Tag tone={game.void ? 'bad' : 'neutral'}>{state}</Tag></h2><GameSelect data={data} value={game.id} onChange={(v) => { setGameId(v); setFinal([]) }} /></div>
    {game.seats.map((s) => <Answer key={`${game.id}:${s.person_id}:${answers.find((a) => a.person_id === s.person_id)?.winners.join()}`} game={game} names={names}
      person={data.people.find((p) => p.id === s.person_id)} current={answers.find((a) => a.person_id === s.person_id)?.winners ?? null} d={d} />)}
    <div className="fix-row fix-answer"><div className="stack8"><b>Final result</b>
      <span className="muted">{settlement ? `Settled: ${settlement.winners.map(names).join(', ')} won` : 'Not settled by the admin'}</span></div>
      <Winners legend="Final winners" game={game} names={names} value={final.length || !settlement ? final : settlement.winners} onChange={setFinal} />
      <div className="row"><Button size="sm" disabled={d.busy || !final.length} onClick={() => void d.run(() => settleGame(db, game.id, final), 'Result set.')}>Set final result</Button>
        {settlement && <Button size="sm" disabled={d.busy} onClick={() => void d.run(() => reopenGame(db, game.id), 'Game reopened.')}>Reopen settled game</Button>}</div></div>
    <div className="row">{game.void
      ? <Button disabled={d.busy} onClick={() => void d.run(() => setVoid(db, game.id, false), `Table ${game.game_no} is no longer void.`)}>Unvoid game</Button>
      : <Button variant="danger" disabled={d.busy} onClick={() => void d.run(() => setVoid(db, game.id, true), `Table ${game.game_no} is void.`)}>Void game</Button>}</div>
  </div></Card>
}

// Pick'ems -------------------------------------------------------------------------------------------

function PicksPanel({ data, d }: { data: FixData; d: Doer }) {
  const db = getSupabase()
  const [del, setDel] = useState<FixData['picks'][number] | null>(null)
  const person = (id: string) => data.people.find((p) => p.id === id)?.display_name ?? 'Unknown person'
  const table = (id: string) => `Table ${data.games.find((g) => g.id === id)?.game_no ?? '?'}`
  return <Card pad={20}><div className="stack"><h2 className="disp h2">Pick&apos;ems</h2>
    {data.picks.length ? <ul className="fix-rows" aria-label="Picks">
      {data.picks.map((p) => <li className="fix-row" key={`${p.game_id}:${p.person_id}`}>
        <div className="fix-main"><b>{person(p.person_id)}</b><span className="muted">{table(p.game_id)}</span></div>
        <span>First: {person(p.first_pick)}. Second: {p.second_pick ? person(p.second_pick) : 'none'}.</span>
        <Button size="sm" variant="ghost-danger" disabled={d.busy} aria-label={`Delete pick by ${person(p.person_id)} on ${table(p.game_id)}`} onClick={() => setDel(p)}>Delete pick</Button></li>)}
    </ul> : <p className="muted">No picks yet.</p>}
    <Modal open={!!del} title="Delete this pick?" onClose={() => { if (!d.busy) setDel(null) }}
      actions={<><Button variant="danger" disabled={d.busy} onClick={() => del && void d.run(async () => { await fixitDelete(db, 'picks', { game_id: del.game_id, person_id: del.person_id }); setDel(null) }, 'Pick deleted.')}>Delete pick</Button>
        <Button disabled={d.busy} onClick={() => setDel(null)}>Cancel</Button></>}>
      {del && <p>{person(del.person_id)}&apos;s pick on {table(del.game_id)} goes, and the scores recalculate. It stays in the log.</p>}
    </Modal>
  </div></Card>
}

// Edit log ----------------------------------------------------------------------------------------------

function EditLog({ data }: { data: FixData }) {
  const people = new Map(data.people.map((p) => [p.id, p.display_name]))
  const games = new Map(data.games.map((g) => [g.id, `Table ${g.game_no}`]))
  const look = { person: (id: string) => people.get(id), game: (id: string) => games.get(id) }
  return <section className="stack" aria-labelledby="fix-log-h"><h2 id="fix-log-h" className="disp h2">Edit log</h2>
    {data.log.length ? <ol className="fix-log">{data.log.map((e) => {
      const t = describeLog(e, look)
      return <li key={e.id} className="card fix-log-row">
        <div><span className="kicker">Who</span><span>{e.actor_person_id ? people.get(e.actor_person_id) ?? 'Unknown person' : 'System'}</span></div>
        <div><span className="kicker">When</span><time dateTime={e.at}>{localDate(e.at)}</time></div>
        <div><span className="kicker">What</span><span>{t.what}</span></div>
        <div><span className="kicker">Old</span><span>{t.old}</span></div>
        <div><span className="kicker">New</span><span>{t.next}</span></div>
      </li>
    })}</ol> : <Card pad={20}>Nothing has been edited yet.</Card>}
    <span className="muted fix-note">The log is append-only. It shows the latest {data.log.length} changes, each with who made it, when, and the old and new values.</span>
  </section>
}

// The page ----------------------------------------------------------------------------------------------

function Body({ area, data }: { area: AreaId; data: FixData }) {
  const d = useDoer()
  return <div className="stack18">
    <Feedback d={d} />
    {area === 'people' && <PeoplePanel data={data} d={d} />}
    {area === 'roster' && <RosterPanel data={data} d={d} />}
    {area === 'season' && <SeasonPanel data={data} d={d} />}
    {area === 'games' && <GamesPanel data={data} d={d} />}
    {area === 'results' && <ResultsPanel data={data} d={d} />}
    {area === 'picks' && <PicksPanel data={data} d={d} />}
  </div>
}

export function FixIt() {
  const [params] = useSearchParams()
  const area = AREAS.find((a) => a.id === params.get('a'))?.id ?? 'games'
  const query = useQuery({ queryKey: ['fixit'], queryFn: () => fetchFixit(getSupabase()), staleTime: 0 })
  if (query.isPending) return <div className="stack"><h1 className="disp h1s">Fix it</h1><p role="status">Loading Fix it</p></div>
  if (query.isError) return <div className="stack"><h1 className="disp h1s">Fix it</h1><Alert tone="bad">Could not load Fix it: {query.error.message}</Alert></div>
  const quick: [string, AreaId, string][] = [['Link a sign-in to a seeded name', 'people', 'Link a sign-in'], ['Replace a player in a slot', 'games', 'Replace a player'], ['Void game', 'results', 'Void'], ['Unvoid game', 'results', 'Unvoid'], ['Delete a pick’em pick', 'picks', 'Delete pick']]
  return <div className="stack18 fix-page"><div className="rowb"><h1 className="disp h1s">Fix it</h1><Link to="/admin">Dashboard</Link></div>
    <div className="fix-columns">
      <nav className="stack8" aria-label="Fix it areas"><div className="kicker">Area</div>
        {AREAS.map((a) => <Link key={a.id} to={`?a=${a.id}`} aria-current={a.id === area ? 'page' : undefined} className="fix-nav">{a.label}</Link>)}</nav>
      <div className="stack18"><Body key={area} area={area} data={query.data} />
        <Card pad={20}><div className="stack"><div className="kicker">Other fixes</div><div className="row">
          {quick.map(([label, to]) => <Link key={label} className="btn sm" to={`?a=${to}`}>{label}</Link>)}</div></div></Card></div>
    </div>
    <EditLog data={query.data} />
  </div>
}
