import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useSession } from '../../auth/session'
import { joinLeague, MEMBERSHIP_KEY, useMembership } from '../../db/membership'
import { Alert, Button, ButtonLink, Card } from '../../ui'
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
      {data?.member && data.stage !== 'live' ? <ProspectHome membership={data} /> : data ? (
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
    </div>
  )
}
