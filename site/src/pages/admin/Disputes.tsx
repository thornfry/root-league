import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { getSupabase } from '../../db/client'
import { fetchGameHistory, pairingsQuery, type LeagueGame } from '../../db/games'
import { Alert, Button, Card } from '../../ui'
import { localDate, SeatFaction } from '../player/Pairings'

export function Disputes() {
  const db = getSupabase()
  const client = useQueryClient()
  const query = useQuery(pairingsQuery(db))
  const [params] = useSearchParams()
  const mutation = useMutation({ mutationFn: async (id: string) => {
    const { error } = await db.rpc('reopen_game', { p_game_id: id })
    if (error) throw new Error(error.message)
  }, onSuccess: () => client.invalidateQueries() })
  if (query.isPending) return <div className="stack"><h1 className="disp h1s">Disputes</h1><p role="status">Loading disputes…</p></div>
  if (query.isError) return <div className="stack"><h1 className="disp h1s">Disputes</h1><Alert tone="bad">Could not load disputes: {query.error.message}</Alert></div>
  const open = query.data.games.filter(g => g.state === 'disputed')
  const settled = query.data.games.filter(g => g.state === 'settled')
  const selected = params.has('g') ? [...open, ...settled].find(g => String(g.game_no) === params.get('g')) : open[0]
  return <div className="stack18"><h1 className="disp h1s">Disputes</h1><Link to="/admin">Dashboard</Link>
    <div className="game-columns"><div className="stack18"><h2 className="disp h2">Open, {open.length}</h2>
      {open.length ? open.map(g => <Card pad={16} key={g.id}><Link to={`?g=${g.game_no}`}>Table {g.game_no}, {g.mapName}</Link> — Disputed</Card>) : <Card pad={20}>Nothing is disputed.</Card>}
      <h2 className="disp h2">Settled, {settled.length}</h2>
      {settled.length ? settled.map(g => <Card pad={16} key={g.id}><div className="stack"><b>Table {g.game_no}</b><p>{g.winners.map(id => g.seats.find(s => s.person_id === id)?.name ?? 'Unknown player').join(', ')} won</p><Link to={`?g=${g.game_no}`}>View history</Link><Button disabled={mutation.isPending} onClick={() => mutation.mutate(g.id)}>Reopen</Button></div></Card>) : <p>Nothing settled yet.</p>}
      {mutation.isError && <Alert tone="bad">Could not reopen game: {mutation.error.message}</Alert>}
    </div>{selected?.state === 'settled'
      ? <section className="stack18"><h2 className="disp h2">Table {selected.game_no}, {selected.mapName}</h2><GameHistory gameId={selected.id} /></section>
      : selected ? <Settlement key={selected.id} game={selected} /> : <Card pad={20}>Pick a disputed game to settle it.</Card>}</div>
  </div>
}

function Settlement({ game }: { game: LeagueGame }) {
  const db = getSupabase()
  const client = useQueryClient()
  const answers = useQuery({ queryKey: ['dispute-answers', game.id], queryFn: async () => {
    const { data, error } = await db.from('submissions').select('person_id, winners').eq('game_id', game.id)
    if (error) throw new Error(error.message)
    return data
  } })
  const [choice, setChoice] = useState('')
  const [other, setOther] = useState<string[]>([])
  const chosen = choice === 'other' ? other : answers.data?.find(a => a.person_id === choice)?.winners ?? []
  const mutation = useMutation({ mutationFn: async () => {
    const { error } = await db.rpc('settle_game', { p_game_id: game.id, p_winners: chosen })
    if (error) throw new Error(error.message)
  }, onSuccess: () => client.invalidateQueries() })
  const names = (ids: string[]) => ids.map(id => game.seats.find(s => s.person_id === id)?.name ?? 'Unknown player').join(', ')
  return <section className="stack18" aria-label={`Settle table ${game.game_no}`}><h2 className="disp h2">Table {game.game_no}, {game.mapName}</h2>
    <Card pad={20}><div className="stack">{game.seats.map(s => <div key={s.person_id}><b>Seat {s.seat}: {s.name}</b><SeatFaction seat={s} /><p>{answers.data?.find(a => a.person_id === s.person_id) ? `Says: ${names(answers.data.find(a => a.person_id === s.person_id)!.winners)} won` : answers.isSuccess ? 'No answer yet' : 'Loading answer…'}</p></div>)}</div></Card>
    {answers.isError && <Alert tone="bad">Could not load answers: {answers.error.message}</Alert>}
    <Card pad={20}><form className="stack" onSubmit={e => { e.preventDefault(); if (chosen.length) mutation.mutate() }}><h3 className="disp h2">Settle this game</h3>
      <fieldset disabled={mutation.isPending || !answers.isSuccess} className="stack"><legend>Choose a result</legend>
        {answers.data?.map(a => <label key={a.person_id}><input type="radio" name="answer" checked={choice === a.person_id} onChange={() => setChoice(a.person_id)} />Use {names([a.person_id])}’s answer: {names(a.winners)} won</label>)}
        <label><input type="radio" name="answer" checked={choice === 'other'} onChange={() => setChoice('other')} />Enter a different result</label>
        {choice === 'other' && <fieldset><legend>Winners, one or more</legend>{game.seats.map(s => <label className="row" key={s.person_id}><input type="checkbox" checked={other.includes(s.person_id)} onChange={e => setOther(e.target.checked ? [...other, s.person_id] : other.filter(id => id !== s.person_id))} />{s.name}</label>)}</fieldset>}
      </fieldset><p>Players can’t edit it after this unless you reopen the game.</p><Button type="submit" variant="pri" disabled={!chosen.length || mutation.isPending}>Settle game</Button>
      <Button onClick={() => { setChoice(''); setOther([]); mutation.reset() }} disabled={mutation.isPending}>Cancel</Button>
      {mutation.isError && <Alert tone="bad">Could not settle game: {mutation.error.message}</Alert>}
    </form></Card>
    <GameHistory gameId={game.id} />
  </section>
}

function GameHistory({ gameId }: { gameId: string }) {
  const history = useQuery({ queryKey: ['game-history', gameId], queryFn: () => fetchGameHistory(getSupabase(), gameId) })
  return <Card pad={20}><h3 className="disp h2">History of this game</h3>{history.isError
    ? <Alert tone="bad">Could not load history: {history.error.message}</Alert>
    : history.isPending ? <p role="status">Loading history…</p>
      : history.data.length ? <ol>{history.data.map(h => <li key={h.id}><b>{h.actor}</b> {h.text} <time dateTime={h.at}>{localDate(h.at)}</time></li>)}</ol>
        : <p>No history available.</p>}</Card>
}
