import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { getSupabase } from '../../db/client'
import type { Database } from '../../db/types'
import { Alert, Button, Field, Modal, Tag } from '../../ui'
import './Roster.css'

type Row = Database['public']['Views']['roster_public']['Row'] & { admin: boolean; linked: boolean }
type List = 'league' | 'waitlist'

async function loadRoster() {
  const db = getSupabase()
  const season = await db.from('seasons').select('*').eq('is_current', true).maybeSingle()
  if (season.error) throw season.error
  if (!season.data) return null
  const id = season.data.id
  const [roster, stage, people, whitelist] = await Promise.all([
    db.from('roster_public').select('*').eq('season_id', id).order('position'),
    db.from('season_stage').select('stage').eq('season_id', id).single(),
    db.from('people').select('id, discord_id'),
    db.from('whitelist').select('discord_id, is_admin'),
  ])
  for (const result of [roster, stage, people, whitelist]) if (result.error) throw result.error
  const admins = new Set(whitelist.data!.filter((p) => p.is_admin).map((p) => p.discord_id))
  const rows: Row[] = roster.data!.map((row) => {
    const discord = people.data!.find((p) => p.id === row.person_id)?.discord_id
    return { ...row, admin: !!discord && admins.has(discord), linked: !!discord }
  })
  return { season: season.data, stage: stage.data!.stage, rows }
}

function DropList({ list, disabled, children }: { list: List; disabled: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: list, disabled, data: { list } })
  return <div ref={setNodeRef} className={`card roster-drop ${isOver ? 'roster-over' : ''}`} role="list" aria-label={list === 'league' ? 'League list' : 'Waitlist'}>{children}</div>
}

function RosterRow({ row, live, disabled, index, count, onMove, onRemove }: {
  row: Row; live: boolean; disabled: boolean; index: number; count: number
  onMove: (row: Row, list: List, position?: number) => void; onRemove: (row: Row) => void
}) {
  const drag = useDraggable({ id: row.person_id, disabled, data: { list: row.list } })
  const drop = useDroppable({ id: `row-${row.person_id}`, disabled, data: { list: row.list, position: index + 1 } })
  const factions = row.ranked_factions?.length ?? 0
  return <div ref={(node) => { drag.setNodeRef(node); drop.setNodeRef(node) }} role="listitem" className={`roster-row ${drop.isOver ? 'roster-over' : ''}`} style={{ opacity: drag.isDragging ? 0.8 : 1, position: 'relative', zIndex: drag.isDragging ? 2 : undefined, transform: drag.transform ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` : undefined }}>
    <div className="rowb">
      <div className="roster-person"><b>{row.display_name}</b><div className="row">
        <span className="muted">{factions} {factions === 1 ? 'faction' : 'factions'}</span>
        <Tag tone={row.list_flagged ? 'bad' : row.list_in ? 'ok' : 'warn'}>{row.list_flagged ? 'Needs attention' : row.list_in ? 'Submitted' : factions ? 'Provisional' : 'No list'}</Tag>
        <Tag>{live && row.list === 'league' ? 'League player' : 'Prospect'}</Tag>
        {row.admin && <Tag tone="adm">Admin</Tag>}{!row.linked && <Tag>No sign-in linked</Tag>}
      </div></div>
      <Button size="sm" {...drag.attributes} {...drag.listeners} disabled={disabled} className="roster-handle" aria-label={`Drag ${row.display_name}`}>Drag</Button>
    </div>
    <div className="row">
      {row.list === 'waitlist' && <>
        <Button size="sm" disabled={disabled || index === 0} aria-label={`Move ${row.display_name} up the waitlist`} onClick={() => onMove(row, 'waitlist', index)}>Up</Button>
        <Button size="sm" disabled={disabled || index === count - 1} aria-label={`Move ${row.display_name} down the waitlist`} onClick={() => onMove(row, 'waitlist', index + 2)}>Down</Button>
      </>}
      <Button size="sm" disabled={disabled} aria-label={`Move ${row.display_name} to ${row.list === 'league' ? 'waitlist' : 'league list'}`} onClick={() => onMove(row, row.list === 'league' ? 'waitlist' : 'league')}>{row.list === 'league' ? 'To waitlist' : 'To league list'}</Button>
      <Button size="sm" variant="ghost-danger" disabled={disabled} aria-label={`Remove ${row.display_name}`} onClick={() => onRemove(row)}>Remove</Button>
    </div>
  </div>
}

export function Roster() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['admin-roster'], queryFn: loadRoster, staleTime: 0 })
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [remove, setRemove] = useState<Row | null>(null)
  const [swap, setSwap] = useState<Row | null>(null)
  const [swapTarget, setSwapTarget] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }), useSensor(KeyboardSensor))
  const data = query.data
  if (query.isPending) return <><h1 className="disp h1s">Roster</h1><p role="status">Loading roster</p></>
  if (query.isError) return <><h1 className="disp h1s">Roster</h1><Alert tone="bad">Could not load the roster: {query.error.message} <Button onClick={() => void query.refetch()}>Retry</Button></Alert></>
  if (!data) return <><h1 className="disp h1s">Roster</h1><Alert tone="info">Create a season on <Link to="/admin/season">Season</Link> first.</Alert></>
  const { season, rows, stage } = data
  const league = rows.filter((r) => r.list === 'league')
  const waitlist = rows.filter((r) => r.list === 'waitlist')
  const live = stage === 'live'
  const disabled = live || pending
  const open = season.capacity === null ? null : season.capacity - league.length

  async function write(action: () => PromiseLike<{ error: { message: string } | null }>, message: string) {
    if (busy.current || live) return
    busy.current = true
    setPending(true); setError(''); setNotice('')
    try {
      const result = await action()
      if (result.error) throw result.error
      setSwap(null); setSwapTarget(''); setRemove(null)
      // Other pages read this roster too. Refresh on the next navigation, and fetch this board now.
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'whoami' })
      setNotice(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string }).message ?? 'Could not save the roster. Try again.')
      await query.refetch()
    } finally { busy.current = false; setPending(false) }
  }
  function move(row: Row, list: List, position?: number) {
    if (disabled || busy.current) return
    if (list === 'league' && row.list !== 'league' && (open === null || open <= 0)) {
      setError(open === null ? 'Set capacity on Season before moving someone to the league list.' : 'The league list is full. Move someone off first, or swap in one move.')
      setNotice(''); setSwap(open === null ? null : row); setSwapTarget(league[0]?.person_id ?? '')
      return
    }
    void write(() => getSupabase().rpc('roster_move', { p_season_id: season.id, p_person_id: row.person_id, p_to_list: list, ...(position === undefined ? {} : { p_to_position: position }) }), `${row.display_name} moved to ${list === 'league' ? 'the league list' : 'the waitlist'}.`)
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const row = rows.find((r) => r.person_id === active.id)
    const destination = over.data.current
    if (row && destination) move(row, destination.list as List, destination.position as number | undefined)
  }
  return <div className="roster-page stack">
    <div className="rowb"><h1 className="disp h1s">Roster</h1><div className="row"><Tag>{stage === 'live' ? 'Live' : stage === 'locked' ? 'Lists locked' : 'Lists open'}</Tag><span className="muted">Capacity {season.capacity ?? 'not set'} is set on <Link to="/admin/season">Season</Link></span></div></div>
    {live ? <Alert tone="info">The season has started, so roster changes are off. Replace a player in a slot on <Link to="/admin/fixit">Fix it</Link>.</Alert> : open === null ? <Alert tone="warn">Set capacity on <Link to="/admin/season">Season</Link> before filling the league list.</Alert> : open > 0 ? <Alert tone="warn">{open} {open === 1 ? 'place is' : 'places are'} open. <Link to="/admin/start">Start season</Link> needs {season.capacity} on the league list.</Alert> : <Alert tone="ok">The league list is full.</Alert>}
    {error && <Alert tone="bad">{error}</Alert>}
    {swap && !live && <div className="card p16 stack"><b>Swap {swap.display_name} into the league list</b><label>Swap with<select aria-label="Swap with" value={swapTarget} disabled={pending} onChange={(e) => setSwapTarget(e.target.value)}>{league.map((r) => <option key={r.person_id} value={r.person_id}>{r.display_name}</option>)}</select></label><div className="row"><Button disabled={pending || !swapTarget} onClick={() => void write(() => getSupabase().rpc('roster_swap', { p_season_id: season.id, p_person_a: swap.person_id, p_person_b: swapTarget }), `${swap.display_name} swapped into the league list.`)}>Swap {swap.display_name} in</Button><Button disabled={pending} onClick={() => { setSwap(null); setError('') }}>Cancel swap</Button></div></div>}
    <div role="status" aria-label="Roster update" aria-live="polite">{pending ? 'Saving roster' : notice}</div>
    <p className="muted">Drag between lists. Use the move buttons and waitlist arrows with a keyboard or touch screen.</p>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="roster-columns">{(['league', 'waitlist'] as const).map((list) => {
        const members = list === 'league' ? league : waitlist
        return <section key={list} className="stack"><div className="rowb"><h2 className="disp h2">{list === 'league' ? 'League list' : 'Waitlist'}</h2><span className="num">{members.length}{list === 'league' ? ` of ${season.capacity ?? 'capacity not set'}` : ''}</span></div>
          <DropList list={list} disabled={disabled}>{members.length ? members.map((row, index) => <RosterRow key={row.person_id} row={row} live={live} disabled={disabled} index={index} count={members.length} onMove={move} onRemove={setRemove} />) : <p className="p16 muted">{list === 'league' ? 'Nobody is on the league list.' : 'The waitlist is empty.'}</p>}</DropList>
          {list === 'waitlist' && <p className="muted">In join order. Drag to reorder, or use Up and Down.</p>}
        </section>
      })}</div>
    </DndContext>
    <form className="card p16 stack roster-add" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void write(() => getSupabase().rpc('roster_add', { p_season_id: season.id, p_display_name: name.trim(), p_list: 'waitlist' }).then((result) => { if (!result.error) setName(''); return result }), `${name.trim()} added to the waitlist.`) }}>
      <h2 className="disp h2">Add a person by name</h2><Field label="Name" autoComplete="off" required value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} /><Button type="submit" disabled={disabled || !name.trim()}>Add</Button><p className="muted">They need a whitelisted Discord ID with a matching name label to sign in.</p>
    </form>
    <Modal open={!!remove} title={`Remove ${remove?.display_name ?? ''}?`} onClose={() => { if (!pending) setRemove(null) }} actions={<><Button variant="danger" disabled={disabled} onClick={() => remove && void write(() => getSupabase().rpc('roster_remove', { p_season_id: season.id, p_person_id: remove.person_id }), `${remove.display_name} removed from the roster.`)}>Remove from roster</Button><Button disabled={pending} onClick={() => setRemove(null)}>Cancel</Button></>}>
      <p>This removes {remove?.display_name} from this season’s roster and deletes their ranked list of {remove?.ranked_factions?.length ?? 0} factions. Their person record, sign-in access and any picks are kept.</p>
    </Modal>
  </div>
}
