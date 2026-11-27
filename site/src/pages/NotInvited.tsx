import { useState } from 'react'
import { useSession } from '../auth/session'
import { Alert, Button, Card, useToast } from '../ui'

/**
 * A signed-in account that is not on the whitelist. It names the Discord account and shows the ID to send to the
 * admin. It reads nothing else, so no league data can reach it.
 */
export function NotInvited({ discordName, discordId }: { discordName: string | null; discordId: string | null }) {
  const session = useSession()
  const toast = useToast()
  const [checked, setChecked] = useState(false)

  async function copy() {
    if (!discordId) return
    try {
      await navigator.clipboard.writeText(discordId)
      toast('ID copied')
    } catch {
      toast('Could not copy. Select the ID and copy it by hand.', { bad: true })
    }
  }

  async function checkAgain() {
    await session.refresh()
    setChecked(true)
  }

  return (
    <main className="gate" id="main">
      <div className="stack18">
        <h1 className="disp h1s">Not on the list yet</h1>
        {discordName ? (
          <p className="muted">
            Signed in as <b>{discordName}</b>.
          </p>
        ) : null}
        <p style={{ fontSize: 17 }}>Send your Discord ID to the admin, then check again.</p>
        <Card pad={16}>
          <div className="stack">
            <div className="kicker">Your Discord ID</div>
            <div className="num" aria-label="Your Discord ID" style={{ fontSize: 30, letterSpacing: '.04em', wordBreak: 'break-all' }}>
              {discordId ?? 'Unknown'}
            </div>
            <Button icon="copy" onClick={copy} disabled={!discordId}>
              Copy my ID
            </Button>
          </div>
        </Card>
        {checked ? <Alert tone="info">Still not on the list. Ask the admin to add this ID.</Alert> : null}
        <Button variant="pri" icon="arrow" onClick={checkAgain}>
          Check again
        </Button>
      </div>
    </main>
  )
}
