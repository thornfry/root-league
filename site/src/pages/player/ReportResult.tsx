import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { useSession } from '../../auth/session'
import { getSupabase } from '../../db/client'
import { pairingsQuery, type LeagueGame } from '../../db/games'
import { fetchOwnResult, submitResult } from '../../db/results'
import { Alert, Button, Card } from '../../ui'
import { SeatFaction } from './Pairings'

export function ReportResult() {
  const { gameNo } = useParams()
  const session = useSession()
  const who = session.status === 'in' ? session.whoami : null
  const db = getSupabase()
  const query = useQuery(pairingsQuery(db))
  const game = query.data?.games.find(g => String(g.game_no) === gameNo)
  const seated = !!game?.seats.some(s => s.person_id === who?.personId)
  const canSubmit = !!who && (who.isAdmin || (seated && who.roles.includes('league_player')))
  const editable = !!game && canSubmit && game.state !== 'settled' && game.state !== 'void'
  const whoId = who?.personId ?? null
  const own = useQuery({
    queryKey: ['own-result', game?.id, whoId],
    queryFn: () => fetchOwnResult(db, game!.id, whoId!),
    enabled: editable && seated && whoId !== null,
    staleTime: 0,
  })

  if (query.isPending) return <p role="status">Loading game…</p>
  if (query.isError) return <Alert tone="bad">Could not load game: {query.error.message}</Alert>
  if (!game) return <div className="stack"><h1 className="disp h1s">No such game</h1><Link to="/pairings">All pairings</Link></div>

  return <div className="stack18 pairings-view">
    <div className="stack8">
      <p className="kicker">Table {game.game_no}, {game.mapName}</p>
      <h1 className="disp h1s">{game.state === 'upcoming' ? 'Report result' : 'Edit result'}</h1>
    </div>
    {!editable ? <Alert tone="info">You can’t report or edit a result for this game.</Alert>
      : seated && own.isPending ? <p role="status">Loading your result…</p>
      : seated && own.isError ? <Alert tone="bad">Could not load your result: {own.error.message}</Alert>
      : <ResultForm key={game.id} game={game} initial={own.data ?? []} adminSettlement={!seated} />}
    <Link to="/pairings">Back to pairings</Link>
  </div>
}

function ResultForm({ game, initial, adminSettlement }: { game: LeagueGame; initial: string[]; adminSettlement: boolean }) {
  const [draft, setDraft] = useState<string[] | null>(null)
  const selected = draft ?? initial
  const db = getSupabase()
  const client = useQueryClient()
  const navigate = useNavigate()
  const mutation = useMutation({
    mutationFn: (winners: string[]) => submitResult(db, game.id, winners),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['pairings'] }),
        client.invalidateQueries({ queryKey: ['own-result', game.id] }),
        client.invalidateQueries({ queryKey: ['game-history', game.id] }),
        client.invalidateQueries({ queryKey: ['players'] }),
        client.invalidateQueries({ queryKey: ['picks'] }),
        client.invalidateQueries({ queryKey: ['leaderboard'] }),
      ])
      navigate('/', { replace: true })
    },
  })

  return <Card pad={16}><form className="stack" onSubmit={e => {
    e.preventDefault()
    if (selected.length && !mutation.isPending) mutation.mutate(selected)
  }}>
    <h2 className="disp h2">Who won?</h2><p className="muted">Tick every winner.</p>
    {adminSettlement && <p>The admin’s entry settles this game and stops player edits.</p>}
    <fieldset className="stack" disabled={mutation.isPending}><legend className="kicker">Winners</legend>
      {game.seats.map(s => <label key={s.person_id} className="row">
        <input type="checkbox" aria-label={s.name} checked={selected.includes(s.person_id)}
          onChange={e => setDraft(e.target.checked ? [...selected, s.person_id] : selected.filter(id => id !== s.person_id))} />
        <span className="stack"><b>{s.name}</b><SeatFaction seat={s} /></span>
      </label>)}
    </fieldset>
    <Button type="submit" variant="pri" disabled={!selected.length || mutation.isPending}>{mutation.isPending ? 'Submitting…' : 'Submit'}</Button>
    {mutation.isError && <Alert tone="bad">Could not submit result: {mutation.error.message}</Alert>}
  </form></Card>
}
