import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../../db/client'
import type { Database } from '../../db/types'
import { Alert, Button, ConfirmModal } from '../../ui'

type SeasonRow = Database['public']['Tables']['seasons']['Row']

/**
 * One button that flips with the lock state (decision 56). While lists are open it locks them now; while
 * they are locked it reopens them with no lock date. Both ask first.
 */
export function LockListsToggle({ seasonId, locked, onChanged }: { seasonId: string; locked: boolean; onChanged?: (season: SeasonRow, locked: boolean) => void }) {
  const client = useQueryClient()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function change() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { data, error: failure } = await getSupabase().rpc(locked ? 'season_unlock_lists' : 'season_lock_lists', { p_season_id: seasonId })
      if (failure) throw new Error(failure.message)
      setAsking(false)
      onChanged?.(data, !locked)
      await client.invalidateQueries()
    } catch (failure) {
      setAsking(false)
      setError(failure instanceof Error ? failure.message : 'Could not change the lists.')
    } finally { setBusy(false) }
  }
  return <>
    <Button type="button" icon="lock" disabled={busy} onClick={() => setAsking(true)}>{locked ? 'Unlock lists' : 'Lock lists now'}</Button>
    {error && <Alert tone="bad">{error}</Alert>}
    <ConfirmModal open={asking} title={locked ? 'Unlock lists?' : 'Lock lists now?'} confirmLabel={busy ? 'Working' : locked ? 'Unlock lists' : 'Lock lists'} onConfirm={() => void change()} onCancel={() => { if (!busy) setAsking(false) }}>
      {locked
        ? <p>Players will be able to change their factions again. The lock date is cleared; set a new one on the Season page when you want lists to lock on their own.</p>
        : <p>Players will no longer be able to change their factions. You can still edit any list as admin. You can unlock again from this button.</p>}
    </ConfirmModal>
  </>
}
