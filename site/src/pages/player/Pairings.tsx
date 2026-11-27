import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useSession } from '../../auth/session'
import { getSupabase } from '../../db/client'
import { filterGames, pairingsQuery, type GameFilter, type LeagueGame, type GameSeat } from '../../db/games'
import { getLayout } from '../../data/valid-pairs'
import { findFaction } from '../../data/factions'
import { Alert, ButtonLink, Card, FactionSeal, SeatCell, Segmented, Tag, type FactionCode } from '../../ui'
import './pairings.css'

export function GameStatus({ game }: { game: LeagueGame }) {
  const labels = { upcoming: 'Upcoming', recorded: 'Recorded', disputed: 'Disputed', settled: 'Settled by admin', void: 'Void' }
  return <Tag tone={game.state === 'disputed' ? 'warn' : game.state === 'void' ? 'bad' : ['recorded', 'settled'].includes(game.state) ? 'ok' : 'neutral'}>{labels[game.state]}</Tag>
}
export function SeatFaction({ seat }: { seat: GameSeat }) {
  const faction = findFaction(seat.faction)
  return <span className="fchip"><FactionSeal code={seat.faction as FactionCode} /><span className="fn">{faction?.name ?? seat.faction}</span></span>
}
export function GameWinners({ game }: { game: LeagueGame }) {
  return game.winners.length ? <>Won by {game.seats.filter(s => game.winners.includes(s.person_id)).map(s => s.name).join(', ')}</> : null
}
export function localDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')'
}
/** The seat cell for one seat of a game, with the winner and "You" marks filled in. */
export function GameSeatCell({ seat, game, personId }: { seat: GameSeat; game: LeagueGame; personId: string | null }) {
  return <SeatCell name={seat.name} faction={seat.faction as FactionCode} factionName={findFaction(seat.faction)?.name ?? seat.faction}
    winner={game.winners.includes(seat.person_id)} you={seat.person_id === personId} />
}
export function Pairings() {
  const session = useSession()
  const personId = session.status === 'in' ? session.whoami.personId : null
  const [filter, setFilter] = useState<GameFilter>('All')
  const query = useQuery(pairingsQuery(getSupabase()))
  if (query.isPending) return <div className="stack"><h1 className="disp h1s">Pairings</h1><p role="status">Loading pairings…</p></div>
  if (query.isError) return <div className="stack"><h1 className="disp h1s">Pairings</h1><Alert tone="bad">Could not load pairings: {query.error.message}</Alert></div>
  const { season, stage, games } = query.data
  if (!season) return <div className="stack"><h1 className="disp h1s">Pairings</h1><p>No current season yet.</p></div>
  const layout = season.capacity && season.games_each && season.maps ? getLayout(season.capacity, season.games_each, season.maps.length) : null
  const mine = games.some(g => g.seats.some(s => s.person_id === personId))
  // All is always first.
  const filters: GameFilter[] = mine ? ['All', 'Mine', 'Completed', 'Upcoming'] : ['All', 'Completed', 'Upcoming']
  const active = filter === 'Mine' && !mine ? 'All' : filter
  const visible = filterGames(games, active, personId)
  return <div className="stack18 pairings-view">
    <div className="pairings-title"><div className="stack8"><div className="kicker">{season.name}</div><h1 className="disp h1s">Pairings</h1></div>
      {stage === 'live' ? <Segmented label="Filter games" fit options={filters.map(f => ({ value: f, label: f, count: filterGames(games, f, personId).length }))} value={active} onChange={setFilter} /> : null}</div>
    {stage !== 'live' ? <>
      <Alert tone="info"><b>Not started.</b> Names and factions show up when the season starts. {season.lists_lock_at ? <>Lists lock {localDate(season.lists_lock_at)}.</> : 'The lists lock date has not been set.'}</Alert>
      {layout ? <><p className="muted">Layout for {season.capacity} players, {season.games_each} games each. Player numbers are dealt at random when the admin starts the season.</p>
        <div className="pairing-layout">{layout.games.map((g, i) => <Card as="article" key={i}>
          <div className="rowb p-head"><h2 className="disp h2">Table {i + 1}</h2><span>{season.maps?.[g.map]}</span><Tag>Not started</Tag></div>
          <div className="layout-seats">{g.slots.map((slot, seat) => <div key={seat}><div className="kicker">Seat {seat + 1}</div><span className="num">P{slot + 1}</span></div>)}</div>
        </Card>)}</div></> : <Card pad={16}>The admin is setting up this season’s layout.</Card>}
    </> : <>
      {!visible.length ? <Card pad={16}>No games here.</Card> : <div className="card game-list">
        <div className="game-list-head" aria-hidden="true"><span>Table</span>{[1, 2, 3, 4].map(n => <span key={n}>Seat {n}</span>)}</div>
        <ul className="game-rows">{visible.map(g => {
          const seated = g.seats.some(s => s.person_id === personId)
          // A seated player can report or edit until the game is void or settled by the admin.
          const report = seated && ['upcoming', 'recorded', 'disputed'].includes(g.state)
          return <li key={g.id}><article className="game-row" aria-label={`Table ${g.game_no}`}>
            <div className="tcol">
              <Link to={`/game/${g.game_no}`} className="tno disp">Table {g.game_no}</Link>
              <span className="tmap">{g.mapName}</span>
              <span className="tact"><GameStatus game={g} />
                {report ? <ButtonLink to={`/game/${g.game_no}`} size="sm" variant={g.state === 'upcoming' ? 'pri' : 'default'}>{g.state === 'upcoming' ? 'Report result' : 'Edit result'}</ButtonLink> : null}</span>
            </div>
            <div className="seat-cells">{g.seats.map(s => <GameSeatCell key={s.seat} seat={s} game={g} personId={personId} />)}</div>
          </article></li>
        })}</ul>
      </div>}
    </>}
  </div>
}
