import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useSession } from '../../auth/session'
import { findFaction } from '../../data/factions'
import { getSupabase } from '../../db/client'
import { Alert, Button, Card, FactionSeal, Icon, type FactionCode } from '../../ui'
import './Players.css'

// Privacy belongs to roster_public: never fetch the underlying roster table here.
async function loadPlayers() {
  const db = getSupabase()
  const season = await db.from('seasons').select('id').eq('is_current', true).maybeSingle()
  if (season.error) throw new Error(season.error.message)
  if (!season.data) return null
  const seasonId = season.data.id
  const [stage, roster] = await Promise.all([
    db.from('season_stage').select('stage').eq('season_id', seasonId).single(),
    db.from('roster_public').select('person_id, display_name, is_me, list_in, ranked_factions')
      .eq('season_id', seasonId).order('display_name'),
  ])
  if (stage.error) throw new Error(stage.error.message)
  if (roster.error) throw new Error(roster.error.message)
  return { stage: stage.data.stage, players: roster.data }
}

export function Players() {
  const session = useSession()
  const me = session.status === 'in' ? session.whoami : null
  const players = useQuery({
    queryKey: ['players', me?.personId, me?.isAdmin],
    queryFn: loadPlayers,
    enabled: me !== null,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const open = players.data?.stage === 'open'
  const expanded = !open || me?.isAdmin
  return <>
    <div className="stack8">
      <h1 className="disp h1s">Players</h1>
      {open && <p className="muted">{me?.isAdmin
        ? 'Ranked lists show to players once they lock. As admin you see them now.'
        : 'Ranked lists show here once they lock. Until then only the owner and the admin see them.'}</p>}
    </div>
    {players.isPending && <p role="status" className="muted">Loading players</p>}
    {players.isError && <Alert tone="bad">
      Could not load players: {players.error.message} <Button onClick={() => void players.refetch()}>Try again</Button>
    </Alert>}
    {players.isSuccess && !players.data && <p className="muted">No current season yet.</p>}
    {players.data && (players.data.players.length === 0
      ? <p className="muted">No players have joined yet.</p>
      : <div className={expanded ? 'players-grid' : 'players-open card'}>
        {players.data.players.map((player) => <Card as="section" key={player.person_id} className="players-entry" pad={16}>
          <div className="players-heading">
            <h2>{player.display_name}</h2>
            {open && (player.is_me
              ? <Link to="/my-list" className={`players-status ${player.list_in ? 'players-list-in' : 'players-not-ready'}`} aria-label={`${player.list_in ? 'Ready' : 'Not ready'}, edit my factions`}>
                {player.list_in ? 'Ready' : 'Not ready'}<Icon name="arrow" size={14} />
              </Link>
              : <span className={player.list_in ? 'players-list-in' : 'muted'}>{player.list_in ? 'Ready' : 'Not ready'}</span>)}
          </div>
          {player.ranked_factions !== null && (player.ranked_factions.length
            ? <ol className="players-factions" aria-label={`${player.display_name}'s ranked factions`}>
              {player.ranked_factions.map((code, index) => {
                const faction = findFaction(code)
                return <li key={`${index}-${code}`}>
                  <span className="num players-rank" aria-hidden="true">{index + 1}</span>
                  {faction && <FactionSeal code={faction.code as FactionCode} />}
                  <span>{faction?.name ?? code}</span>
                </li>
              })}
            </ol>
            : <p className="muted">No list yet.</p>)}
        </Card>)}
      </div>)}
  </>
}
