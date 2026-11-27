import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useSession } from '../../auth/session'
import { getSupabase } from '../../db/client'
import { pairingsQuery, type LeagueGame } from '../../db/games'
import { fetchLeaderboard, fetchPicks, savePick } from '../../db/picks'
import { Alert, Button, Card, Tag } from '../../ui'

export function PickPanel({ game }: { game: LeagueGame }) {
  const session = useSession()
  const personId = session.status === 'in' ? session.whoami.personId : null
  const db = getSupabase()
  const client = useQueryClient()
  const open = game.state === 'upcoming'
  const seated = game.seats.some(s => s.person_id === personId)
  const picks = useQuery({ queryKey: ['picks', game.id, open, personId], queryFn: () => fetchPicks(db, [game.id], open ? personId! : undefined), enabled: !!personId && (!open || !seated), staleTime: 0 })
  const [draft, setDraft] = useState<{ first: string; second: string } | null>(null)
  const mutation = useMutation({ mutationFn: () => savePick(db, game.id, first, second || null), onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['picks'] }), client.invalidateQueries({ queryKey: ['leaderboard'] }), client.invalidateQueries({ queryKey: ['game-history', game.id] })])
    setDraft(null)
  } })
  const own = picks.data?.find(p => p.person_id === personId)
  const first = draft?.first ?? own?.first_pick ?? ''
  const second = draft?.second ?? own?.second_pick ?? ''
  const name = (id: string | null) => game.seats.find(s => s.person_id === id)?.name ?? 'None'
  if (!personId || (open && seated)) return null
  return <section className="stack" aria-label="Pick’ems"><h2 className="disp h2">{open ? 'Your picks' : 'Everyone’s picks'}</h2>
    {picks.isPending ? <p role="status">Loading picks…</p> : picks.isError ? <Alert tone="bad">Could not load picks: {picks.error.message}</Alert> : open ? <Card pad={16}><form className="stack" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
      <p>First pick scores 3 points; optional second pick scores 1. Picks stay hidden until the first result is recorded.</p>
      <fieldset className="stack" disabled={mutation.isPending}>
        <legend className="kicker">Pick winners</legend>
        <label className="stack">First pick<select value={first} onChange={e => { setDraft({ first: e.target.value, second: e.target.value === second ? '' : second }); mutation.reset() }}><option value="">Choose a player</option>{game.seats.map(s => <option key={s.person_id} value={s.person_id}>{s.name}</option>)}</select></label>
        <label className="stack">Second pick (optional)<select value={second} onChange={e => { setDraft({ first, second: e.target.value }); mutation.reset() }}><option value="">None</option>{game.seats.filter(s => s.person_id !== first).map(s => <option key={s.person_id} value={s.person_id}>{s.name}</option>)}</select></label>
      </fieldset>
      <Button type="submit" variant="pri" disabled={!first || first === second || mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save picks'}</Button>
      {own && !draft && <p role="status">Picks saved. You can change them until the first result.</p>}
      {mutation.isError && <Alert tone="bad">Could not save picks: {mutation.error.message}</Alert>}
    </form></Card> : <>
      <Tag>Picks closed</Tag>{game.state === 'disputed' && <Alert tone="warn">Scoring paused until the admin settles the game.</Alert>}{game.state === 'void' && <p>Void games score nothing.</p>}
      {!picks.data.length && <p>Nobody picked this game.</p>}
      {picks.data.map(p => <Card pad={16} key={p.person_id}><b>{p.name}{p.person_id === personId ? ' (you)' : ''}</b><p>First: {name(p.first_pick)} ({p.first_points} points). Second: {name(p.second_pick)} ({p.second_points} points).</p><b>{p.points} points</b></Card>)}
    </>}
  </section>
}

export function Pickems() {
  const db = getSupabase()
  const session = useSession()
  const personId = session.status === 'in' ? session.whoami.personId : null
  const pairings = useQuery(pairingsQuery(db))
  const season = pairings.data?.season
  const games = pairings.data?.games ?? []
  const picks = useQuery({ queryKey: ['picks', 'mine', season?.id, personId], queryFn: () => fetchPicks(db, games.map(g => g.id), personId!), enabled: !!season && !!personId && pairings.isSuccess, staleTime: 0 })
  const board = useQuery({ queryKey: ['leaderboard', season?.id], queryFn: () => fetchLeaderboard(db, season!.id), enabled: !!season, staleTime: 0 })
  if (pairings.isPending) return <div><h1 className="disp h1s">Pick&apos;ems</h1><p role="status">Loading pick’ems…</p></div>
  if (pairings.isError) return <div><h1 className="disp h1s">Pick&apos;ems</h1><Alert tone="bad">Could not load pick’ems: {pairings.error.message}</Alert></div>
  return <div className="stack18"><h1 className="disp h1s">Pick&apos;ems</h1><p>{season?.name ?? 'No current season.'}</p>
    {pairings.data.stage !== 'live' ? <p>Pick’ems open when pairings are published.</p> : <>
      <Card pad={16}><b>Your score: {board.data?.find(p => p.person_id === personId)?.points ?? 0} points</b></Card>
      <p className="muted">Your own games are not offered. First pick: 3 points. Second pick: 1 point.</p>
      <div className="game-columns"><div className="stack18"><section className="stack"><h2 className="disp h2">Open games</h2>
        {games.filter(g => g.state === 'upcoming' && !g.seats.some(s => s.person_id === personId)).map(g => <Card key={g.id} pad={16}><Link to={`/game/${g.game_no}`}>Table {g.game_no}, {g.mapName}</Link><p>{picks.data?.some(p => p.game_id === g.id) ? 'Picked' : 'No picks yet'}</p></Card>)}
        {!games.some(g => g.state === 'upcoming' && !g.seats.some(s => s.person_id === personId)) && <p>No open games.</p>}
      </section><section className="stack"><h2 className="disp h2">My picks</h2>
        {picks.isPending ? <p role="status">Loading your picks…</p> : picks.isError ? <Alert tone="bad">Could not load your picks: {picks.error.message}</Alert> : !picks.data.length ? <p>You have not picked yet. Open a game from the list.</p> : picks.data.map(p => {
          const g = games.find(g => g.id === p.game_id)!
          const name = (id: string | null) => g.seats.find(s => s.person_id === id)?.name ?? 'None'
          return <Card key={p.game_id} pad={16}><Link to={`/game/${g.game_no}`}>Table {g.game_no}, {g.mapName}</Link><p>First: {name(p.first_pick)}. Second: {name(p.second_pick)}.</p><p>{g.state === 'disputed' ? 'Scoring paused' : g.state === 'void' ? 'Void games score nothing' : g.state === 'upcoming' ? 'Picks stay hidden until the result' : `${p.points} points`}</p></Card>
        })}
      </section></div><section className="stack" aria-label="Leaderboard"><h2 className="disp h2">Leaderboard</h2>
        <Leaderboard seasonId={season!.id} personId={personId} />
      </section></div>
    </>}
  </div>
}

export function Leaderboard({ seasonId, personId, limit }: { seasonId: string; personId: string | null; limit?: number }) {
  const db = getSupabase()
  const board = useQuery({ queryKey: ['leaderboard', seasonId], queryFn: () => fetchLeaderboard(db, seasonId), staleTime: 0 })
  return board.isPending ? <p role="status">Loading leaderboard…</p> : board.isError ? <Alert tone="bad">Could not load leaderboard: {board.error.message}</Alert> : !board.data.length ? <p>No picks yet.</p> : <>{board.data.slice(0, limit).map(p => <Card key={p.person_id} pad={16}><div className="row"><b>Rank {p.rank}</b><span>{p.display_name}{p.person_id === personId ? ' (you)' : ''}</span><b>{p.points} points</b></div></Card>)}</>
}
