import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { getSupabase } from '../../db/client'
import { fetchGameHistory, pairingsQuery } from '../../db/games'
import { findFaction } from '../../data/factions'
import { MIX_CONSTRAINT, MIN_REACH, tableReach } from '../../pairing/rules'
import { Alert, Card, Tag } from '../../ui'
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
      <section className="stack18" aria-label="Result">
        {game.state === 'disputed' ? <Alert tone="warn"><b>Disputed.</b> Two different answers. The admin will decide.</Alert>
          : game.state === 'void' ? <Alert tone="warn"><b>Void.</b> This game is not counted in standings or pick’ems.</Alert>
          : game.winners.length ? <Card pad={16}><div className="kicker">Result</div><b><GameWinners game={game} /></b></Card>
          : <Card pad={16}>No result yet. Seated players enter it after the game.</Card>}
      </section>
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
