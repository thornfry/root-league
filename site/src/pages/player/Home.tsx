import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { useSession } from '../../auth/session'
import { joinLeague, MEMBERSHIP_KEY, useMembership } from '../../db/membership'
import { Alert, Button, ButtonLink, Card, Stat } from '../../ui'
import { getSupabase } from '../../db/client'
import { pairingsQuery, filterGames } from '../../db/games'
import { fetchLeaderboard } from '../../db/picks'
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
          </>}
        </Card>
      ) : null}
      {data?.stage === 'live' ? <LiveHome seasonId={data.season.id} personId={session.status === 'in' ? session.whoami.personId : null} /> : null}
    </div>
  )
}


function LiveHome({ seasonId, personId }: { seasonId: string; personId: string | null }) {
  const db = getSupabase()
  const games = useQuery(pairingsQuery(db))
  const mine = filterGames(games.data?.games ?? [], 'Mine', personId)
  return <>
    {games.isPending ? <p role="status">Loading your games</p> : null}
    {games.isError ? <Alert tone="bad">Could not load your games: {games.error.message} <Button onClick={() => void games.refetch()}>Try again</Button></Alert> : null}
    {mine.length ? <section className="stack" aria-labelledby="my-games-title">
      <h2 id="my-games-title" className="disp h2b">My games</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>{mine.map(game => {
        const seat = game.seats.find(s => s.person_id === personId)!
        const reportable = game.state !== 'void' && game.state !== 'settled'
        return <Card key={game.id} as="article" pad={16} className="stack">
          <div className="rowb"><b><Link to={`/game/${game.game_no}`}>Table {game.game_no}, {game.mapName}</Link></b>
            <GameStatus game={game} /></div>
          <div className="row"><span className="muted">Seat {seat.seat}</span><SeatFaction seat={seat} /></div>
          <p className="muted">{game.state === 'disputed' ? 'The admin will decide.' : game.state === 'void' ? 'This game is not counted.' : game.state === 'upcoming' ? 'No result yet.' : <GameWinners game={game} />}</p>
          {reportable ? <ButtonLink to={`/game/${game.game_no}`} variant={game.state === 'upcoming' ? 'pri' : 'default'}>{game.state === 'upcoming' ? 'Report result' : 'Edit result'}</ButtonLink> : null}
        </Card>
      })}</div>
    </section> : null}
    {personId ? <PickemQuickView seasonId={seasonId} personId={personId} /> : null}
  </>
}

/** Score and rank only. The Pick'ems page is in the menu, so there is no link here. */
function PickemQuickView({ seasonId, personId }: { seasonId: string; personId: string }) {
  const board = useQuery({ queryKey: ['leaderboard', seasonId], queryFn: () => fetchLeaderboard(getSupabase(), seasonId), staleTime: 0 })
  const mine = board.data?.find(row => row.person_id === personId)
  return <section className="stack" aria-labelledby="home-pickem-title">
    <h2 id="home-pickem-title" className="disp h2b">Pick&apos;ems</h2>
    {board.isPending ? <p role="status">Loading your pick&apos;ems</p> : null}
    {board.isError ? <Alert tone="bad">Could not load your pick&apos;ems: {board.error.message} <Button onClick={() => void board.refetch()}>Try again</Button></Alert> : null}
    {board.data ? <Card pad={16}><div className="row">
      <Stat value={mine?.points ?? 0} label="Score" sub="points" />
      <Stat value={mine ? mine.rank : 'None'} label="Rank" sub={mine ? `of ${board.data.length}` : 'no picks scored yet'} />
    </div></Card> : null}
  </section>
}
