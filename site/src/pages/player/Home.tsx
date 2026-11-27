import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { useSession } from '../../auth/session'
import { joinLeague, MEMBERSHIP_KEY, useMembership } from '../../db/membership'
import { Alert, Button, ButtonLink, Card } from '../../ui'
import { getSupabase } from '../../db/client'
import { pairingsQuery, filterGames } from '../../db/games'
import { standingsQuery } from '../../db/standings'
import { GameStatus, GameWinners, SeatFaction } from './Pairings'
import { ProspectHome } from './ProspectHome'

export function Home() {
  const session = useSession()
  const membership = useMembership(session.status === 'in' ? session.whoami.personId : null)
  const client = useQueryClient()
  const navigate = useNavigate()
  const join = useMutation({
    mutationFn: joinLeague,
    onSuccess: async () => {
      await client.invalidateQueries()
      navigate('/my-list', { state: { joined: true } })
    },
    onError: () => { void client.invalidateQueries({ queryKey: MEMBERSHIP_KEY }) },
  })
  const data = membership.data

  return (
    <div className="stack">
      <div><h1 className="disp h1s">Home</h1>{data ? <p className="muted">{data.season.name}</p> : null}</div>
      {membership.isPending ? <p role="status">Loading season</p> : null}
      {membership.isError ? <Alert tone="bad">Could not load the season: {membership.error.message} <Button onClick={() => void membership.refetch()}>Try again</Button></Alert> : null}
      {membership.isSuccess && !data ? <Alert tone="info">No current season yet.</Alert> : null}
      {join.isError ? <Alert tone="bad">Could not join: {join.error.message}</Alert> : null}
      {data?.member && data.stage !== 'live' ? <ProspectHome membership={data} /> : data && !(data.stage === 'live' && session.status === 'in' && session.whoami.roles.includes('league_player')) ? (
        <Card pad={18} className="stack">
          {data.stage === 'open' ? <>
            <h2 className="disp h2b">Join {data.season.name}</h2>
            <Button variant="pri" icon="plus" disabled={join.isPending} onClick={() => join.mutate(data.season.id)}>{join.isPending ? 'Joining' : 'Join league'}</Button>
          </> : <>
            <h2 className="disp h2b">{data.stage === 'live' ? 'Season in progress' : 'Joining is closed'}</h2>
            <p>{data.stage === 'live' ? 'Joining is closed. Follow the games and make your picks.' : 'Lists are locked. The season has not started yet.'}</p>
            {data.stage === 'live' ? <ButtonLink to="/pickems" variant="pri">Pick&apos;ems</ButtonLink> : null}
          </>}
        </Card>
      ) : null}
      {data?.stage === 'live' ? <LiveHome seasonId={data.season.id} personId={session.status === 'in' ? session.whoami.personId : null} /> : null}
    </div>
  )
}


function LiveHome({ seasonId, personId }: { seasonId: string; personId: string | null }) {
  const db = getSupabase()
  const standings = useQuery(standingsQuery(db, seasonId))
  const games = useQuery(pairingsQuery(db))
  const mine = filterGames(games.data?.games ?? [], 'Mine', personId)
  return <>
    {games.isPending ? <p role="status">Loading your games</p> : null}
    {games.isError ? <Alert tone="bad">Could not load your games: {games.error.message} <Button onClick={() => void games.refetch()}>Try again</Button></Alert> : null}
    {mine.length ? <section className="stack" aria-labelledby="your-games-title">
      <h2 id="your-games-title" className="disp h2b">Your games</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>{mine.map(game => {
        const seat = game.seats.find(s => s.person_id === personId)!
        return <Card key={game.id} as="article" pad={16} className="stack">
          <div className="rowb"><b><Link to={`/game/${game.game_no}`}>Table {game.game_no}, {game.mapName}</Link></b>
            {game.state === 'upcoming' ? <ButtonLink to={`/game/${game.game_no}`} variant="pri">Enter result</ButtonLink> : <GameStatus game={game} />}</div>
          <div className="row"><span className="muted">Seat {seat.seat}</span><SeatFaction seat={seat} /></div>
          <p className="muted">{game.state === 'disputed' ? 'The admin will decide.' : game.state === 'void' ? 'This game is not counted.' : game.state === 'upcoming' ? 'No result yet.' : <GameWinners game={game} />}</p>
        </Card>
      })}</div>
    </section> : null}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24 }}>
      <section className="stack" aria-labelledby="standings-title">
        <h2 id="standings-title" className="disp h2b">Standings</h2>
        {standings.isPending ? <p role="status">Loading standings</p> : null}
        {standings.isError ? <Alert tone="bad">Could not load standings: {standings.error.message} <Button onClick={() => void standings.refetch()}>Try again</Button></Alert> : null}
        {standings.data ? <Card><table style={{ width: '100%', tableLayout: 'fixed' }}>
          <caption className="sr">Season standings</caption>
          <thead><tr><th style={{ width: 30 }} scope="col">#</th><th scope="col">Player</th><th style={{ width: 42 }} scope="col">Wins</th><th style={{ width: 54 }} scope="col">Played</th><th style={{ width: 36 }} scope="col">Left</th></tr></thead>
          <tbody>{standings.data.map(row => <tr key={row.person_id}>
            <td className="num">{row.rank}</td><th scope="row" style={{ overflowWrap: 'anywhere' }}>{row.display_name}{row.person_id === personId ? ' (you)' : ''}</th>
            <td className="num">{row.wins}</td><td>{row.games_played}</td><td>{row.games_left}</td>
          </tr>)}</tbody>
        </table>{!standings.data.length ? <p>No standings yet.</p> : null}</Card> : null}
      </section>
      <section className="stack" aria-labelledby="home-pickem-title" data-pickem-leaderboard-slot>
        <h2 id="home-pickem-title" className="disp h2b">Pick'em leaderboard</h2>
        {/* U14 / D5 integration slot: replace with the top five from D5's leaderboard contract. */}
        <Card pad={16}><p className="muted">Leaderboard coming soon.</p></Card>
      </section>
    </div>
  </>
}
