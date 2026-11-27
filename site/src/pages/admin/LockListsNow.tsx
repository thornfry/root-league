import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../../db/client'
import type { Database } from '../../db/types'
import { Alert, Button, ConfirmModal } from '../../ui'

type SeasonRow = Database['public']['Tables']['seasons']['Row']

/** Lists lock at `lists_lock_at`; this sets it to now, after a confirmation (decision 56). */
export function LockListsNow({ seasonId, onLocked }: { seasonId: string; onLocked?: (season: SeasonRow) => void }) {
  const client = useQueryClient()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function lock() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { data, error: failure } = await getSupabase().rpc('season_lock_lists', { p_season_id: seasonId })
      if (failure) throw new Error(failure.message)
      setAsking(false)
      onLocked?.(data)
      await client.invalidateQueries()
    } catch (failure) {
      setAsking(false)
      setError(failure instanceof Error ? failure.message : 'Could not lock lists.')
    } finally { setBusy(false) }
  }
  return <>
    <Button type="button" icon="lock" disabled={busy} onClick={() => setAsking(true)}>Lock lists now</Button>
    {error && <Alert tone="bad">{error}</Alert>}
    <ConfirmModal open={asking} title="Lock lists now?" confirmLabel={busy ? 'Locking' : 'Lock lists'} onConfirm={() => void lock()} onCancel={() => { if (!busy) setAsking(false) }}>
      <p>Players will no longer be able to change their factions. You can still edit any list as admin. To reopen lists, set a later lock date on the Season page and save.</p>
    </ConfirmModal>
  </>
}
