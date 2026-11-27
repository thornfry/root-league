import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useSession } from '../../auth/session'
import { findFaction } from '../../data/factions'
import { getSupabase } from '../../db/client'
import { pairingsQuery, type LeagueGame } from '../../db/games'
import { clearPick, fetchLeaderboard, fetchPicks, savePick, type ScoredPick } from '../../db/picks'
import { Alert, ButtonLink, Card, Icon, SeatCell, Segmented, Tag, type FactionCode } from '../../ui'
import { GameStatus } from './Pairings'
import './pickems.css'

type PickFilter = 'All' | 'Open' | 'Done'

/**
 * What one tap does to a player's two picks. A tap on a player with no pick makes them the first
 * pick, or the second if a first exists. A tap on the second pick removes it. A tap on the first
 * pick moves the second up or clears the pick if there is no second.
 */
export function nextPicks(first: string | null, second: string | null, tapped: string): { first: string | null; second: string | null } {
  if (first === null) return { first: tapped, second: null }
  if (tapped === first) return { first: second, second: null }
  if (tapped === second) return { first, second: null }
  return { first, second: tapped }
}

/** Games you can pick: not your own. Open games first, then the rest in table order. */
export function pickableGames(games: LeagueGame[], personId: string | null): LeagueGame[] {
  const eligible = games.filter(g => !g.seats.some(s => s.person_id === personId))
  return [...eligible.filter(g => g.state === 'upcoming'), ...eligible.filter(g => g.state !== 'upcoming')]
}

export const picksKey = (seasonId: string | undefined, personId: string | null) => ['picks', 'mine', seasonId, personId]

/** Your picks on every game you could pick, in one read. Home and the Pick'ems page share it. */
export function useMyPicks(seasonId: string | undefined, personId: string | null, games: LeagueGame[], enabled: boolean) {
  const ids = pickableGames(games, personId).map(g => g.id)
  return useQuery({ queryKey: picksKey(seasonId, personId), queryFn: () => fetchPicks(getSupabase(), ids, personId!), enabled: enabled && !!seasonId && !!personId, staleTime: 0 })
}

export function usePickemBoard(seasonId: string | undefined) {
  return useQuery({ queryKey: ['leaderboard', seasonId], queryFn: () => fetchLeaderboard(getSupabase(), seasonId!), enabled: !!seasonId, staleTime: 0 })
}

export function Pickems() {
  const db = getSupabase()
  const session = useSession()
  const personId = session.status === 'in' ? session.whoami.personId : null
  const client = useQueryClient()
  const pairings = useQuery(pairingsQuery(db))
  const season = pairings.data?.season
  const games = pairings.data?.games ?? []
  const pickable = pickableGames(games, personId)
  const key = picksKey(season?.id, personId)
  const picks = useMyPicks(season?.id, personId, games, pairings.isSuccess && pairings.data.stage === 'live')
  const board = usePickemBoard(season?.id)
  const [filter, setFilter] = useState<PickFilter | null>(null)
  const save = useMutation({
    mutationFn: ({ gameId, first, second }: { gameId: string; first: string | null; second: string | null }) =>
      first === null ? clearPick(db, gameId) : savePick(db, gameId, first, second),
    // Show the tap at once; the server's answer replaces it, and a refusal puts the old picks back.
    onMutate: async ({ gameId, first, second }) => {
      await client.cancelQueries({ queryKey: key })
      const before = client.getQueryData<ScoredPick[]>(key)
      client.setQueryData<ScoredPick[]>(key, rows => {
        const rest = (rows ?? []).filter(p => p.game_id !== gameId)
        if (first === null) return rest
        const old = (rows ?? []).find(p => p.game_id === gameId)
        return [...rest, { ...(old ?? { game_id: gameId, person_id: personId!, updated_at: '', name: '', points: 0, first_points: 0, second_points: 0 }), first_pick: first, second_pick: second }]
      })
      return { before }
    },
    onError: (_error, _vars, context) => { client.setQueryData(key, context?.before) },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['picks'] }), client.invalidateQueries({ queryKey: ['leaderboard'] })])
    },
  })

  if (pairings.isPending) return <div className="stack"><h1 className="disp h1s">Pick&apos;ems</h1><p role="status">Loading pick’ems…</p></div>
  if (pairings.isError) return <div className="stack"><h1 className="disp h1s">Pick&apos;ems</h1><Alert tone="bad">Could not load pick’ems: {pairings.error.message}</Alert></div>
  const title = <div className="stack8"><div className="kicker">{season?.name ?? 'No current season'}</div><h1 className="disp h1s">Pick&apos;ems</h1></div>
  if (pairings.data.stage !== 'live') return <div className="stack18">{title}<p>Pick’ems open when pairings are published.</p></div>

  const mineRow = board.data?.find(row => row.person_id === personId)
  const open = pickable.filter(g => g.state === 'upcoming')
  const effective: PickFilter = filter ?? (open.length ? 'Open' : 'All')
  const shown = effective === 'All' ? pickable : effective === 'Open' ? open : pickable.filter(g => g.state !== 'upcoming')
  const mineByGame = new Map((picks.data ?? []).map(p => [p.game_id, p]))
  const tap = (game: LeagueGame, tapped: string) => {
    const own = mineByGame.get(game.id)
    save.mutate({ gameId: game.id, ...nextPicks(own?.first_pick ?? null, own?.second_pick ?? null, tapped) })
  }

  return <div className="stack18 pickems-view">
    <div className="pairings-title">{title}
      <Segmented label="Filter pick’ems" fit value={effective} onChange={setFilter}
        options={[{ value: 'All', label: 'All', count: pickable.length }, { value: 'Open', label: 'Open', count: open.length }, { value: 'Done', label: 'Done', count: pickable.length - open.length }]} /></div>
    <Card className="scorecard" pad={18}>
      <div className="score-numbers">
        <div className="stat"><span className="kicker">Score</span><span className="num">{mineRow?.points ?? 0}<span className="unit"> points</span></span></div>
        <div className="stat"><span className="kicker">Rank</span><span className="num">{mineRow ? mineRow.rank : 'None'}{mineRow && board.data ? <span className="unit"> of {board.data.length}</span> : null}</span></div>
      </div>
      <div className="stack8">
        <p className="muted">Pick up to two players per game. Tap a pick again to remove it.</p>
        <Link to="/info/pickems">Pick’em rules</Link>
        <ButtonLink to="/pickems/leaderboard" size="sm">Leaderboard <Icon name="arrow" size={14} /></ButtonLink>
      </div>
    </Card>
    {picks.isError ? <Alert tone="bad">Could not load your picks: {picks.error.message}</Alert> : null}
    {board.isError ? <Alert tone="bad">Could not load your score: {board.error.message}</Alert> : null}
    {save.isError ? <Alert tone="bad">Could not save that pick: {save.error.message}</Alert> : null}
    {picks.isPending && !picks.isError ? <p role="status">Loading your picks…</p> : null}
    {!shown.length ? <Card pad={16}>{effective === 'Open' ? 'No open games to pick.' : 'No games here.'}</Card> : <div className="stack">{shown.map(game => <PickGame key={game.id} game={game} own={mineByGame.get(game.id)} disabled={!picks.data || save.isPending} onTap={tapped => tap(game, tapped)} />)}</div>}
  </div>
}

function winnerNames(game: LeagueGame) {
  const names = game.seats.filter(s => game.winners.includes(s.person_id)).map(s => s.name)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? ''
}

function PickGame({ game, own, disabled, onTap }: { game: LeagueGame; own: ScoredPick | undefined; disabled: boolean; onTap: (personId: string) => void }) {
  const open = game.state === 'upcoming'
  const scored = ['recorded', 'settled'].includes(game.state)
  const markOf = (personId: string): 1 | 2 | null => own?.first_pick === personId ? 1 : own?.second_pick === personId ? 2 : null
  let note: string
  if (open) note = ''
  else if (game.state === 'disputed') note = 'Scoring paused until the admin settles the game.'
  else if (game.state === 'void') note = 'Void games score nothing.'
  else note = own ? `You scored ${own.points} ${own.points === 1 ? 'point' : 'points'}: ${winnerNames(game)} won.` : 'You made no pick on this game.'
  return <article className="card gcard pick-game" aria-label={`Table ${game.game_no}`}>
    <div className="gh">
      <span className="disp gno">Table {game.game_no}</span>
      <span className="gmap">{game.mapName}</span>
      <span className="gstate">
        {scored && own && own.points > 0 ? <span className="num pts">+{own.points}</span> : null}
        {open ? <Tag tone="ok" icon="eye">Picks open</Tag> : <GameStatus game={game} />}
      </span>
    </div>
    <div className="pick-cells">{game.seats.map(seat => {
      const mark = markOf(seat.person_id)
      const props = { name: seat.name, faction: seat.faction as FactionCode, factionName: findFaction(seat.faction)?.name ?? seat.faction, winner: scored && game.winners.includes(seat.person_id), pick: mark }
      const tag = mark === 1 ? <Tag tone="solid">1st pick</Tag> : mark === 2 ? <Tag>2nd pick</Tag> : null
      return <SeatCell key={seat.seat} {...props} disabled={disabled} onPick={open ? () => onTap(seat.person_id) : undefined}>{tag}</SeatCell>
    })}</div>
    {note && <p className="gf">{note}</p>}
  </article>
}

export function PickemLeaderboard() {
  const session = useSession()
  const personId = session.status === 'in' ? session.whoami.personId : null
  const pairings = useQuery(pairingsQuery(getSupabase()))
  const season = pairings.data?.season
  const board = usePickemBoard(season?.id)
  return <div className="stack18 pickems-view">
    <div className="stack8"><ButtonLink to="/pickems" variant="ghost" size="sm">Back to Pick&apos;ems</ButtonLink>
      <div className="kicker">{season?.name ?? ''}</div><h1 className="disp h1s">Pick&apos;em leaderboard</h1></div>
    {pairings.isError ? <Alert tone="bad">Could not load the season: {pairings.error.message}</Alert> : null}
    {board.isPending && !pairings.isError ? <p role="status">Loading leaderboard…</p> : null}
    {board.isError ? <Alert tone="bad">Could not load leaderboard: {board.error.message}</Alert> : null}
    {board.data ? !board.data.length ? <Card pad={16}>No picks scored yet.</Card> : <Card className="board">
      <table>
        <caption className="sr-only">Pick’em leaderboard</caption>
        <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col" className="r">Points</th></tr></thead>
        <tbody>{board.data.map(row => <tr key={row.person_id} className={row.person_id === personId ? 'me' : undefined}>
          <td className="num">{row.rank}</td>
          <th scope="row">{row.display_name}{row.person_id === personId ? <> <Tag tone="solid">You</Tag></> : null}</th>
          <td className="num r">{row.points}</td>
        </tr>)}</tbody>
      </table>
    </Card> : null}
  </div>
}
