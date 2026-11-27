import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useSession } from '../../auth/session'
import { changeWhitelist, listWhitelist, parseInvites, type WhitelistChange, type WhitelistEntry } from '../../db/whitelist'
import { Alert, Button, Card, Field, Modal, Tag, useToast } from '../../ui'
import './whitelist.css'

type Dialog = { kind: 'label' | 'remove'; entry: WhitelistEntry }

export function Whitelist() {
  const queryClient = useQueryClient()
  const session = useSession()
  const toast = useToast()
  const list = useQuery({ queryKey: ['whitelist'], queryFn: listWhitelist })
  const [id, setId] = useState('')
  const [label, setLabel] = useState('')
  const [paste, setPaste] = useState('')
  const [checked, setChecked] = useState<ReturnType<typeof parseInvites> | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const mutation = useMutation({
    mutationFn: changeWhitelist,
    onSuccess: async (_, change) => {
      if (change.kind === 'add') { setId(''); setLabel('') }
      if (change.kind === 'many') { setPaste(''); setChecked(null) }
      setDialog(null)
      toast(change.kind === 'remove' ? 'Removed from the whitelist.' : 'Whitelist saved.')
      // Refresh identity too: an admin can remove their own access or Admin role.
      await session.refresh()
      await queryClient.invalidateQueries({ queryKey: ['whitelist'] })
    },
  })
  const rows = list.data ?? []
  const busy = mutation.isPending
  const blocked = busy || !list.data || list.isError
  const checkRows = () => {
    const result = parseInvites(paste, rows.map((row) => row.discord_id))
    setChecked(result)
    mutation.reset()
    return result
  }
  const save = (change: WhitelistChange) => mutation.mutate(change)
  const openDialog = (kind: Dialog['kind'], entry: WhitelistEntry) => {
    mutation.reset()
    setEditLabel(entry.label ?? '')
    setDialog({ kind, entry })
  }
  const closeDialog = () => { if (!busy) { setDialog(null); mutation.reset() } }
  const error = mutation.isError ? <Alert tone="bad">{mutation.error.message}</Alert> : null

  return <>
    <header className="stack8"><div className="kicker">Admin</div><h1 className="disp h1s">Whitelist</h1></header>
    <Card pad={20}>
      <div className="stack18">
        <h2 className="disp h2b">Add people</h2>
        <form className="stack18" onSubmit={(event) => { event.preventDefault(); save({ kind: 'add', id, label }) }}>
          <div className="whitelist-fields">
            <Field label="Discord user ID" inputMode="numeric" placeholder="digits only" autoComplete="off" required value={id} onChange={(event) => setId(event.target.value)} />
            <Field label="Name label (optional)" placeholder="for your eyes only" autoComplete="off" value={label} onChange={(event) => setLabel(event.target.value)} />
          </div>
          <div className="row"><Button type="submit" variant="pri" icon="plus" disabled={blocked}>Add</Button></div>
        </form>
        {!dialog ? error : null}
        <Field label="Or paste many, one per line: ID, label" multiline spellCheck={false} placeholder={'100000000000000101, Spectator 1\n100000000000000102, Spectator 2'} value={paste} onChange={(event) => { setPaste(event.target.value); setChecked(null) }} />
        {checked ? <Alert tone={checked.errors.length ? 'bad' : 'ok'}>
          {checked.errors.length ? <><b>Nothing added. Fix the rows and try again.</b>{checked.errors.map((message) => <div key={message}>{message}</div>)}</> : <b>All {checked.entries.length} rows look good.</b>}
        </Alert> : null}
        <div className="row">
          <Button disabled={blocked} onClick={checkRows}>Check rows</Button>
          <Button variant="pri" disabled={blocked} onClick={() => { const result = checkRows(); if (!result.errors.length) save({ kind: 'many', entries: result.entries }) }}>Add the valid rows</Button>
        </div>
        <span className="muted">All rows must be valid. If any row needs fixing, nothing is added.</span>
      </div>
    </Card>
    {list.isPending ? <p role="status">Loading whitelist…</p> : null}
    {list.isError ? <Alert tone="bad">{list.error.message} <Button onClick={() => void list.refetch()}>Try again</Button></Alert> : null}
    {list.data ? <Card className="whitelist-table-wrap"><table className="whitelist-table">
      <caption className="sr">Invited Discord accounts</caption>
      <thead><tr><th scope="col">Discord user ID</th><th scope="col">Admin</th><th scope="col">Added by</th><th scope="col">Added</th><th scope="col"><span className="sr">Actions</span></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.discord_id}>
        <td data-label="Discord user ID"><span className="num">{row.discord_id}</span> {row.label}</td>
        <td data-label="Admin"><div className="row">{row.is_admin ? <Tag tone="adm">Admin</Tag> : null}<Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ kind: 'admin', id: row.discord_id, admin: !row.is_admin })}>{row.is_admin ? 'Remove admin' : 'Make admin'}</Button></div></td>
        <td data-label="Added by" className="muted">{row.added_by_name}</td>
        <td data-label="Added" className="muted"><time dateTime={row.added_at}>{new Date(row.added_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</time></td>
        <td><div className="row"><Button size="sm" variant="ghost" disabled={busy} onClick={() => openDialog('label', row)}>Edit label</Button><Button size="sm" variant="ghost-danger" disabled={busy} onClick={() => openDialog('remove', row)}>Remove</Button></div></td>
      </tr>)}</tbody>
    </table>{!rows.length ? <p className="p20">No invited accounts yet.</p> : null}</Card> : null}
    <Card pad={20}><div className="stack">
      <h2 className="disp h2b">How to copy someone's Discord ID</h2>
      <ol className="whitelist-help"><li>In Discord, open <b>Settings</b>, then <b>Advanced</b>, and turn on <b>Developer Mode</b>.</li><li>Right-click the person, in a server or a message.</li><li>Choose <b>Copy User ID</b> and paste it here.</li></ol>
      <span className="muted">Players can copy their own ID from the sign-in page.</span>
    </div></Card>
    <Alert tone="warn">Removing an entry cuts access at once. Their roster entry and list stay until you remove them on <Link to="/admin/roster">Roster</Link>.</Alert>
    <Modal open={dialog !== null} title={dialog?.kind === 'label' ? 'Edit label' : 'Remove from the whitelist?'} onClose={closeDialog} actions={<>
      <Button variant={dialog?.kind === 'remove' ? 'danger' : 'pri'} disabled={busy} onClick={() => { if (dialog) save(dialog.kind === 'remove' ? { kind: 'remove', id: dialog.entry.discord_id } : { kind: 'label', id: dialog.entry.discord_id, label: editLabel }) }}>{dialog?.kind === 'remove' ? 'Remove' : 'Save'}</Button>
      <Button disabled={busy} onClick={closeDialog}>Cancel</Button>
    </>}>
      <div className="stack">{dialog?.kind === 'label' ? <Field label="Name label" value={editLabel} onChange={(event) => setEditLabel(event.target.value)} /> : <p>{dialog?.entry.label || dialog?.entry.discord_id} loses access at once, even in an open session. Their roster entry and list stay.</p>}{dialog ? error : null}</div>
    </Modal>
  </>
}
