import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { getSupabase } from '../../db/client'
import { fetchGameHistory, pairingsQuery } from '../../db/games'
import { useSession } from '../../auth/session'
import { fetchOwnResult, submitResult } from '../../db/results'
import type { LeagueGame } from '../../db/games'
import { findFaction } from '../../data/factions'
import { MIX_CONSTRAINT, MIN_REACH, tableReach } from '../../pairing/rules'
import { Alert, Button, Card, Tag } from '../../ui'
import { GameStatus, GameWinners, localDate, SeatFaction } from './Pairings'

export function Game() {
  const { gameNo } = useParams()
  const db = getSupabase()
  const query = useQuery(pairingsQuery(db))
  const game = query.data?.games.find(g => String(g.game_no) === gameNo)
  const history = useQuery({ queryKey: ['game-history', game?.id], queryFn: () => fetchGameHistory(db, game!.id), enabled: !!game, staleTime: 0 })
  if (query.isPending) return <div className="stack"><h1 className="disp h1s">Game</h1><p role="status">Loading game…</p></div>
  if (query.isError) return <div className="stack"><h1 className="disp h1s">Game</h1><Alert tone="bad">Could not load game: {query.error.message}</Alert></div>
  if (!game) return <div className="stack"><h1 className="disp h1s">No such game</h1><Link to="/pairings">All pairings</Link></div>
  const factions = game.seats.map(s => s.faction)
  const reach = tableReach(factions)
  const mix = MIX_CONSTRAINT.violation(factions)
  return <div className="stack18 pairings-view">
    <Link to="/pairings">All pairings</Link>
    <h1 className="disp h1s">Table {game.game_no} <span className="muted">{game.mapName}</span></h1>
    <div className="row"><GameStatus game={game} /><Tag tone={reach >= MIN_REACH ? 'neutral' : 'warn'}>Reach {reach}</Tag><Tag tone={mix ? 'warn' : 'neutral'}>{mix ? 'Mix needs attention' : 'Militant + Insurgent'}</Tag></div>
    <div className="game-columns">
      <ResultBlock key={game.id} game={game} />
      <div className="stack18">
        <Card as="section"><ol className="pairing-seats game-seats">{game.seats.map(s => {
          const f = findFaction(s.faction)
          return <li key={s.seat}><div className="row"><span className="kicker">Seat {s.seat}{s.seat === 1 ? ', goes first' : ''}</span>{game.winners.includes(s.person_id) && <Tag tone="ok">Winner</Tag>}</div><b>{s.name}</b><SeatFaction seat={s} />{f && <div className="row"><Tag tone={f.type === 'Militant' ? 'mil' : 'ins'}>{f.type}</Tag><span className="reach">Reach {f.reach}</span></div>}</li>
        })}</ol></Card>
        <section className="stack"><h2 className="disp h2">History</h2><Card pad={16}>{history.isPending ? <p role="status">Loading history…</p> : history.isError ? <Alert tone="bad">Could not load history: {history.error.message}</Alert> : history.data.length ? <ol className="game-history">{history.data.map(h => <li key={h.id}><b>{h.actor}</b> {h.text}<div className="muted"><time dateTime={h.at}>{localDate(h.at)}</time></div></li>)}</ol> : <p className="muted">No history available to you.</p>}</Card></section>
      </div>
    </div>
  </div>
}

function ResultBlock({ game }: { game: LeagueGame }) {
  const session = useSession()
  const who = session.status === 'in' ? session.whoami : null
  const seated = game.seats.some(s => s.person_id === who?.personId)
  const canSubmit = !!who && (who.isAdmin || (seated && who.roles.includes('league_player')))
  const editable = canSubmit && !['settled', 'void'].includes(game.state)
  const db = getSupabase()
  const client = useQueryClient()
  const own = useQuery({ queryKey: ['own-result', game.id, who?.personId],
    queryFn: () => fetchOwnResult(db, game.id, who!.personId!), enabled: editable && seated, staleTime: 0 })
  const [draft, setDraft] = useState<string[] | null>(null)
  const mutation = useMutation({ mutationFn: (winners: string[]) => submitResult(db, game.id, winners),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['pairings'] }),
        client.invalidateQueries({ queryKey: ['own-result', game.id] }),
        client.invalidateQueries({ queryKey: ['game-history', game.id] }),
        client.invalidateQueries({ queryKey: ['standings'] }),
      ])
      setDraft(null)
    },
  })
  const ready = !seated || own.isSuccess
  const showForm = editable && ready && (draft !== null || !own.data)
  const selected = draft ?? []
  return <section className="stack18" aria-label="Result">
    {game.state === 'disputed' ? <Alert tone="warn"><b>Disputed.</b> Two different answers. The admin will decide.</Alert>
      : game.state === 'void' ? <Alert tone="warn"><b>Void.</b> This game is not counted in standings or pick’ems.</Alert>
      : game.winners.length ? <Card pad={16}><div className="kicker">Result</div><b><GameWinners game={game} /></b></Card>
      : !showForm && <Card pad={16}>No result yet. Seated players enter it after the game.</Card>}
    {game.state === 'settled' && <Tag tone="ok">Settled by admin</Tag>}
    {editable && seated && own.isPending && <p role="status">Loading your result…</p>}
    {editable && own.isError && <Alert tone="bad">Could not load your result: {own.error.message}</Alert>}
    {editable && ready && !showForm && <Button onClick={() => { mutation.reset(); setDraft(own.data ?? []) }}>Edit result</Button>}
    {showForm && <Card pad={16}><form className="stack" onSubmit={e => { e.preventDefault(); mutation.mutate(selected) }}>
      <h2 className="disp h2">Who won?</h2><p className="muted">Tick every winner.</p>
      {!seated && <p>The admin’s entry settles this game and stops player edits.</p>}
      <fieldset className="stack" disabled={mutation.isPending}><legend className="kicker">Winners</legend>
        {game.seats.map(s => <label key={s.person_id} className="row"><input type="checkbox" aria-label={s.name} checked={selected.includes(s.person_id)} onChange={e => setDraft(e.target.checked ? [...selected, s.person_id] : selected.filter(id => id !== s.person_id))} /><span className="stack"><b>{s.name}</b><SeatFaction seat={s} /></span></label>)}
      </fieldset>
      <div className="row"><Button type="submit" variant="pri" disabled={!selected.length || mutation.isPending}>{mutation.isPending ? 'Submitting…' : 'Submit'}</Button>
        {own.data && <Button disabled={mutation.isPending} onClick={() => { setDraft(null); mutation.reset() }}>Cancel</Button>}</div>
    </form></Card>}
    {mutation.isError && <Alert tone="bad">Could not submit result: {mutation.error.message}</Alert>}
  </section>
}
