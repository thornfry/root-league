import { useState } from 'react'
import { useLocation } from 'react-router'
import { signInWithDiscord } from '../auth/discord'
import { isDevAuth } from '../auth/mode'
import { getSupabase } from '../db/client'
import { Alert, Button, ButtonLink } from '../ui'

/** The signed-out page. It shows the league name and one way in, and nothing else (story 2). */
export function Landing() {
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onDiscord() {
    setBusy(true)
    setError(await signInWithDiscord(getSupabase()))
    setBusy(false)
  }

  return (
    <main className="gate" id="main">
      <h1 className="disp" style={{ fontSize: 88 }}>
        Root
        <br />
        League
      </h1>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {isDevAuth() ? (
        <ButtonLink
          variant="discord"
          to="/discord"
          state={{ from: location.pathname }}
          style={{ width: '100%', minHeight: 52, fontSize: 16 }}
        >
          Continue with Discord
        </ButtonLink>
      ) : (
        <Button variant="discord" disabled={busy} onClick={onDiscord} style={{ width: '100%', minHeight: 52, fontSize: 16 }}>
          Continue with Discord
        </Button>
      )}
    </main>
  )
}
