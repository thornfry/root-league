E1 scenarios use the real local Supabase API and Postgres, with no network mocks.

From `site/`, start Docker and run `npm run db:start` and `npm run db:reset`.
Export `VITE_SUPABASE_ANON_KEY` from `supabase status -o env` (`ANON_KEY`),
then run `npx playwright install chromium` and `npm run e2e`.
The webServer builds with `build:dev` (loads `.env.dev`) and serves Vite preview
on 127.0.0.1:5173. It deliberately refuses to reuse a running server.
CI supplies the local public URL and anon key; no hosted credentials are needed.

`npm run e2e:typecheck` checks the harness separately from app TypeScript.
For the database-free smoke check, a nonempty dummy anon key is enough:
`VITE_SUPABASE_ANON_KEY=local-smoke-only npm run e2e -- --grep 'the dev build'`.
This checks actual browser rendering, both widths, deep links, the dev stand-in,
axe on the landing page and the fake clock, without signing in.

Database specs import `test` and `expect` from `support/fixtures`. The auto
fixture resets public tables and reloads the local seed before each test,
including each project and retry. Auth users survive so repeated runs reuse
accounts. No Auth session is shared between browser contexts. One worker is
required: these scenarios share a database. Reset time is asserted below five
seconds. Only the local database on port 54322 is accepted; use
`E2E_DATABASE_URL` to override its connection credentials. The reset temporarily
bypasses audit triggers as the local superuser within its transaction.

`withDatabase` supports parameterized SQL scenario setup. `setListsLocked`
changes database time relative to now; `setBrowserTime` freezes only the browser's
Date while timers continue. Freezing the browser cannot change SQL deadlines.
`signInAs` uses the persona button, then Authorise at `/discord`.
`restAsPage` probes the real API with that page's JWT, never a service-role key.
`expectAccessible` rejects serious and critical WCAG A/AA violations.

S01 uses the admin whitelist_remove RPC because the admin Whitelist UI is a
placeholder until U2. U2/S02 must additionally prove removal from that page.
S01 already proves that the open session's next API request loses access, and
that adding an outsider lets the existing session in on reload.
Full S01 and reset timing require Docker and are CI-only on machines without it.
Failure traces, screenshots and the HTML report are uploaded by CI.

E2 adds three helpers. `people.ts` is the cast: fixed placeholder Discord IDs, so a
persona links to the person a scenario inserted. `api.ts` has `apiAs(who)`, a typed
supabase-js client that sends that person's JWT, and `signInFast(page, who, path)`,
which places a real session in browser storage. Sessions are cached per worker
because local Auth rate-limits sign-ins; the sign-in page itself is used only where
a scenario proves it (S01, S14). `scenario.ts` seeds a configured season, people,
roster lists and a started season with one game per requested state.

S14 sets the season through the admin screens before anyone joins, because no
faction pool exists until the admin saves it. S15 runs on both widths but touches
only the API. S16 checks keyboard order on desktop only.
