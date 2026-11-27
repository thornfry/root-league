import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { getSupabase } from '../../db/client'
import { pairingsQuery } from '../../db/games'
import { Alert, Card } from '../../ui'
import { localDate } from '../player/Pairings'

export function Dashboard() {
  const db = getSupabase()
  const query = useQuery(pairingsQuery(db))
  const roster = useQuery({ queryKey: ['dashboard-roster', query.data?.season?.id], enabled: !!query.data?.season,
    queryFn: async () => {
      const { data, error } = await db.from('roster_public').select('list, list_in').eq('season_id', query.data!.season!.id)
      if (error) throw new Error(error.message)
      return data
    } })
  if (query.isPending) return <div className="stack"><h1 className="disp h1s">Dashboard</h1><p role="status">Loading dashboard…</p></div>
  if (query.isError) return <div className="stack"><h1 className="disp h1s">Dashboard</h1><Alert tone="bad">Could not load dashboard: {query.error.message}</Alert></div>
  const { season, stage, games } = query.data
  const disputed = games.filter(g => g.state === 'disputed')
  return <div className="stack18"><h1 className="disp h1s">Dashboard</h1>
    {!season ? <Card pad={20}>No current season. <Link to="/admin/season">Set up a season</Link></Card> : <Card pad={20}><div className="stack">
      <h2 className="disp h2">{stage === 'live' ? 'Season live' : stage === 'locked' ? 'Lists locked, season not started' : 'Lists open'}</h2>
      {stage === 'live' ? <>
        {disputed.length ? <Alert tone="warn"><b>{disputed.length} {disputed.length === 1 ? 'game is' : 'games are'} disputed.</b> {disputed.map(g => `Table ${g.game_no} on ${g.mapName}`).join(', ')}. <Link to="/admin/disputes">Open Disputes</Link></Alert> : <Alert tone="ok">No games are disputed.</Alert>}
        <p>{games.filter(g => ['recorded', 'settled'].includes(g.state)).length} of {games.filter(g => g.state !== 'void').length} games recorded</p>
        <p>{disputed.length} disputed</p>
      </> : <>
        {roster.isSuccess && <p>{roster.data.filter(r => r.list === 'league').length} of {season.capacity ?? 'unset capacity'} on the league list, {roster.data.filter(r => r.list === 'waitlist').length} on the waitlist. {roster.data.filter(r => r.list_in).length} lists submitted.</p>}
        {roster.isError && <Alert tone="bad">Could not load roster: {roster.error.message}</Alert>}
        {season.lists_lock_at && <p>Lists lock {localDate(season.lists_lock_at)}.</p>}
        {stage === 'locked' && <Link to="/admin/start">Start season</Link>}
      </>}
    </div></Card>}
    <nav aria-label="Dashboard actions" className="row">{[['roster', 'Roster'], ['season', 'Season'], ['start', 'Start season'], ['disputes', 'Disputes'], ['whitelist', 'Whitelist'], ['fixit', 'Fix it'], ['csv', 'CSV']].map(([path, label]) => <Link key={path} to={`/admin/${path}`}>{label}</Link>)}</nav>
  </div>
}
