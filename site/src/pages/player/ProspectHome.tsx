import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'
import { findFaction } from '../../data/factions'
import { leaveLeague, MEMBERSHIP_KEY, type Membership } from '../../db/membership'
import { Alert, Button, ButtonLink, Card, Modal, Tag } from '../../ui'

/** Keep around U5's MyList element: Join opens the picker with this acknowledgement. */
export function MembershipListEntry({ children }: { children: ReactNode }) {
  const { state } = useLocation()
  return <>{state?.joined === true ? <div className="stack8"><h1 className="disp h1s">You&apos;re on the list!</h1><p>Pick your factions and submit your list before lists lock.</p></div> : null}{children}</>
}

export function ProspectHome({ membership: { season, stage, member } }: { membership: Membership }) {
  const [confirm, setConfirm] = useState(false)
  const client = useQueryClient()
  const leave = useMutation({
    mutationFn: leaveLeague,
    onSuccess: async () => { await client.invalidateQueries(); setConfirm(false) },
    onError: () => { void client.invalidateQueries({ queryKey: MEMBERSHIP_KEY }) },
  })
  if (!member) return null
  const submitted = member.list_in && !member.list_flagged
  const factions = member.ranked_factions ?? []
  return <>
    {stage === 'locked' ? <Alert tone="info">Lists are locked. The season has not started yet.</Alert> : null}
    {season.lists_lock_at ? <p className="muted">Lists {stage === 'open' ? 'lock' : 'locked'}: {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' }).format(new Date(season.lists_lock_at))}</p> : null}
    <div className="cols2">
      <Card pad={16} className="stack">
        <h2 className="disp h2">Your faction list</h2>
        {submitted ? <div className="row"><Tag tone="ok" icon="check">Submitted</Tag><span className="muted">{factions.length} factions</span></div> : <Alert tone="warn"><b>Not submitted yet.</b> {stage === 'open' ? 'Rank your factions before lists lock.' : 'Lists are locked. Ask the admin.'}</Alert>}
        {member.list_flagged ? <Alert tone="warn">Your list needs attention because the faction pool changed.</Alert> : null}
        {factions.length ? <p>{factions.map(code => findFaction(code)?.name ?? code).join(', ')}</p> : null}
        {submitted || stage === 'open' ? <ButtonLink to="/my-list" variant={submitted ? 'default' : 'pri'}>{stage !== 'open' ? 'View my list' : submitted ? 'Edit my list' : factions.length ? 'Review and submit' : 'Rank my factions'}</ButtonLink> : null}
      </Card>
      <Card pad={16} className="stack"><h2 className="disp h2">Pairings</h2><p className="muted">Not published yet.</p><ButtonLink to="/pairings">See the layout</ButtonLink></Card>
    </div>
    <div><Button variant="ghost-danger" onClick={() => setConfirm(true)}>Leave league</Button></div>
    <Modal open={confirm} title="Leave league?" onClose={() => { if (!leave.isPending) setConfirm(false) }} actions={<><Button variant="danger" disabled={leave.isPending} onClick={() => leave.mutate(season.id)}>{leave.isPending ? 'Leaving' : 'Leave league'}</Button><Button disabled={leave.isPending} onClick={() => setConfirm(false)}>Cancel</Button></>}>
      <p>This removes you from the season and clears your ranked faction list.</p>
      {leave.isError ? <Alert tone="bad">Could not leave: {leave.error.message}</Alert> : null}
    </Modal>
  </>
}
