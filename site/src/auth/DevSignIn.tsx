import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { getSupabase, type Db } from '../db/client'
import { Button, ButtonLink, Card, Field } from '../ui'

/**
 * The dev sign-in stand-in (decision 41). This file is imported only when `VITE_AUTH_MODE=dev`, so a normal
 * build carries none of it. `scripts/check-no-dev.mjs` looks for the marker below and for the stand-in's email
 * domain in `dist/`.
 */
export const DEV_SIGNIN_MARKER = 'rl-dev-signin-standin'

const DEV_EMAIL_DOMAIN = 'dev.invalid'
// Not a secret: the stand-in account only works against a local database that holds the dev_signin seed row.
const DEV_PASSWORD = 'dev-signin-standin-only'

export const isDiscordId = (id: string) => /^[0-9]{15,20}$/.test(id)

/** Signs in as `<id>@dev.invalid`, making the Auth user on first use. Returns an error message, or null. */
export async function devSignIn(db: Db, discordId: string, name?: string): Promise<string | null> {
  const email = `${discordId}@${DEV_EMAIL_DOMAIN}`
  const first = await db.auth.signInWithPassword({ email, password: DEV_PASSWORD })
  if (!first.error) return null
  const created = await db.auth.signUp({
    email,
    password: DEV_PASSWORD,
    options: name ? { data: { full_name: name } } : undefined,
  })
  if (created.error) return created.error.message
  return created.data.session ? null : 'The local stack did not return a session. Turn off email confirmation.'
}

// Fake IDs from supabase/seed.sql, so each seeded person is one click.
const PERSONAS: { id: string; name: string }[] = [
  { id: '100000000000000001', name: 'Dev admin' },
  { id: '100000000000000002', name: 'Delaney' },
  { id: '100000000000000003', name: 'Alex' },
  { id: '100000000000000004', name: 'Matt' },
  { id: '100000000000000005', name: 'Nick' },
  { id: '100000000000000006', name: 'Adam' },
  { id: '100000000000000007', name: 'Zach' },
  { id: '100000000000000008', name: 'Kyra' },
  { id: '100000000000000009', name: 'Anthony' },
  { id: '100000000000000010', name: 'David' },
  { id: '100000000000000011', name: 'Will' },
  { id: '100000000000000012', name: 'Chuck' },
  { id: '100000000000000013', name: 'Corey' },
  { id: '100000000000000014', name: 'Spectator' },
  { id: '100000000000000015', name: 'Not invited' },
]

export default function DevSignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [id, setId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  async function submit(event: FormEvent) {
    event.preventDefault()
    const clean = id.trim()
    if (!isDiscordId(clean)) {
      setError('A Discord ID is 15 to 20 digits.')
      return
    }
    setBusy(true)
    const name = PERSONAS.find((p) => p.id === clean)?.name
    const problem = await devSignIn(getSupabase(), clean, name)
    setBusy(false)
    if (problem) setError(problem)
    else navigate(from, { replace: true })
  }

  return (
    <main className="gate" id="main" data-marker={DEV_SIGNIN_MARKER}>
      <div className="note">
        <b>Dev stand-in</b> for the real Discord page, so the flow reads end to end. Not Discord&apos;s design, and not in a
        production build.
      </div>
      <Card pad={20}>
        <form className="stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
          <h1 className="disp" style={{ fontSize: 40 }}>
            Root League wants to see who you are
          </h1>
          <p style={{ fontSize: 15 }}>Your Discord username, avatar and user ID.</p>
          <Field
            label="Discord ID"
            inputMode="numeric"
            autoComplete="off"
            value={id}
            onChange={(e) => {
              setId(e.target.value)
              setError(null)
            }}
            error={error ?? undefined}
          />
          <div className="persona-list" role="group" aria-label="Placeholder people">
            {PERSONAS.map((p) => (
              <Button key={p.id} size="sm" onClick={() => setId(p.id)}>
                {p.name}
              </Button>
            ))}
          </div>
          <Button type="submit" variant="discord" disabled={busy} style={{ minHeight: 52 }}>
            Authorise
          </Button>
          <ButtonLink to="/">Cancel</ButtonLink>
        </form>
      </Card>
    </main>
  )
}
