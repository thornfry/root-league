# Will's setup runbook

Run shell commands from `site/` unless a step says otherwise. Replace quoted placeholders with your values; keep credentials and private ID files outside the repository. See the [environment reference](../README.md#environment-variables).

## Try it locally first

- **Install** Node 26, Docker, the Supabase CLI and PostgreSQL's `psql`; start Docker.
- **Enter** `cd site` from the repository root.
- **Install** dependencies with `npm ci`.
- **Start** the local stack with `npm run db:start`.
- **Reset** the local database with `npm run db:reset`; local data is replaced.
- **Copy** the environment template with `cp .env.example .env.local`.
- **Read** `supabase status`; copy the API URL and anon key into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Keep** `VITE_AUTH_MODE=dev` in the checked-in development env files; local Email sign-up stays enabled without confirmation in [config.toml](../supabase/config.toml).
- **Seed** Season 1 with `ADMIN_DISCORD_ID=100000000000000001 npm run seed`; the default `DATABASE_URL` is local port 54322.
- **Start** `npm run dev` and open its printed address.
- **Sign in** using the dev persona buttons: admin `100000000000000001`, players `100000000000000002` through `100000000000000013`, spectator `100000000000000014`, and not-invited `100000000000000015`; sign out between personas.
- **Check** the admin bar, Season 1 roster, spectator access and not-invited gate.
- **Stop** the dev server with Ctrl-C before E2E; Playwright needs port 5173 free.
- **Install** the browser with `npx playwright install chromium`; install any reported OS prerequisites.
- **Export** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the shell using `export VITE_SUPABASE_URL='http://127.0.0.1:54321'` and `export VITE_SUPABASE_ANON_KEY='LOCAL_ANON_KEY'`; E2E helpers do not read `.env.local`.
- **Leave** `E2E_DATABASE_URL` unset for the default local database; overrides must still target local Supabase port 54322.
- **Run** `npm run e2e`; it builds and serves the dev bundle, resets test data, and checks desktop and phone scenarios.
- **Leave** `SEED_TEST_DATABASE_URL` unset for normal tests; set it only to a disposable database for destructive seed integration tests.

✓ Success: Season 1 is visible and the available E2E scenarios pass on desktop and phone.

## Supabase

- **Create** a hosted Supabase project; save its project reference, API URL, anon/publishable key and database-owner connection string privately.
- **Disable** the Email provider and email sign-up in hosted Auth; keep Discord sign-up available for first-time users.
- **Leave** the local Discord provider disabled in [config.toml](../supabase/config.toml); hosted settings belong in the dashboard.
- **Reserve** `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET` for optional local OAuth testing only; hosted Discord uses the dashboard fields below.
- **Log in** with `supabase login`.
- **Link** with `supabase link --project-ref 'PROJECT_REF'`; enter the hosted database password when prompted.
- **Apply** migrations with `supabase db push`; never use `--include-seed`, apply [seed.sql](../supabase/seed.sql), or reset the hosted database.
- **Continue** through Discord and Railway below to finish provider credentials and redirect URLs.

✓ Success: hosted tables exist; local dev seed data and the dev-sign-in flag are absent.

## Discord

- **Create** an application in the Discord Developer Portal; copy its OAuth2 client ID and client secret privately.
- **Add** the redirect URL shown by Supabase's Discord provider, normally `https://PROJECT_REF.supabase.co/auth/v1/callback`, to the application's OAuth2 redirects.
- **Enable** Discord in hosted Supabase Auth using that client ID and secret.
- **Keep** the app-requested scope `identify`; no bot, bot token, server invite or guild membership scope is needed.
- **Continue** to Railway to configure the site's return URL before testing login.

✓ Success: Supabase shows Discord enabled and its callback matches the Discord redirect exactly.

## Railway

- **Create** a service connected to this repository and the branch you intend to deploy.
- **Set** service root `/` and config file path `/site/railway.toml`; [railway.toml](../railway.toml) selects [site/Dockerfile](../Dockerfile) with the repository root as build context.
- **Set** service build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the hosted project's public API URL and anon/publishable key.
- **Set** `VITE_REPO_URL` to the HTTPS GitHub repository or `blob/ref` base for League info links; omit it to use the README's default.
- **Leave** `VITE_AUTH_MODE` unset or set it to `discord`; never deploy `dev`.
- **Keep** secrets out of all `VITE_*` variables; these values are public browser code and require a rebuild after changes.
- **Leave** the start command unchanged; Railway supplies `PORT`, and Caddy defaults to 8080 locally.
- **Generate** a Railway public domain and set hosted Supabase Auth's Site URL and allowed redirect URL to its exact HTTPS origin.
- **Deploy** and open `/` and `/pairings/game/3`; both should load the app's sign-in gate rather than a server 404.
- **Test** the Discord button; consent must return to the Railway site.

✓ Success: the sign-in gate and deep link load, and Discord returns to the site.

## Real IDs and data

- **Copy** real Discord user IDs by enabling Developer Mode under Discord Settings → Advanced, then choosing Copy User ID on each person.
- **Sign in** once as yourself through real Discord before whitelisting; expect “not invited”.
- **Run** `select user_id, provider, provider_id, identity_data from auth.identities where provider = 'discord' order by created_at desc;` in the hosted Supabase SQL editor.
- **Confirm** your Discord ID matches the row's `provider_id`; the database reads this column, not a key assumed inside `identity_data`; stop if it differs.
- **Create** a private JSON file outside the repo and Docker context, mapping exact names from [roster.md](../../season-1/roster.md) to quoted real Discord IDs; include your roster entry if you play.
- **Set** `export DATABASE_URL='HOSTED_DATABASE_OWNER_CONNECTION_STRING'`, using the project's connection details reachable from your machine.
- **Set** `export ADMIN_DISCORD_ID='YOUR_REAL_DISCORD_ID'` and `export DISCORD_IDS='/absolute/private/discord-ids.json'`.
- **Seed** with `npm run seed`; it imports [preferences.json](../../season-1/preferences.json), maps Confirmed to league and Possible to waitlist, and whitelists mapped IDs plus the admin.
- **Keep** the mapping complete before players sign in; reruns preserve existing season settings, roster edits and lists rather than overwriting live data.
- **Clear** shell values after seeding with `unset DATABASE_URL ADMIN_DISCORD_ID DISCORD_IDS`.
- **Sign in** again as yourself; confirm the Admin bar and your seeded roster identity, if mapped.
- **Add** remaining real IDs on Admin → Whitelist, including spectators; labels alone do not replace the seed's ID mapping.
- **Set** capacity, games each, maps, faction pool, minimum list length and lock date on Admin → Season.
- **Compare** Players and Admin → Roster with the Season 1 source files; confirm submitted versus provisional lists.

✓ Success: your admin sign-in works and Players and Roster match Season 1 without fake IDs.

## Keep-alive and checks

- **Refresh** GitHub CLI workflow scope with `gh auth refresh -h github.com -s workflow`; complete its interactive authorization before pushing workflow changes.
- **Add** repository Actions secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` using the hosted API URL and anon/publishable key; never use a service-role key.
- **Ensure** [keepalive.yml](../../.github/workflows/keepalive.yml) is on the default branch and scheduled Actions are enabled; it runs Wednesdays at 09:23 UTC.
- **Run** GitHub Actions → Supabase keep-alive → Run workflow; inspect the successful run with both secrets configured.
- **Check** the run did make its configured request; missing secrets intentionally pass without a request, and keep-alive cannot resume an already paused project.
- **Check** a separate non-whitelisted Discord account sees only “not invited” and no league data.
- **Check** production sign-in offers Discord with no dev persona buttons or dev sign-in page.
- **Check** the [CI workflow](../../.github/workflows/ci.yml) passes its web, database, E2E and Python jobs after deployment changes.

✓ Success: configured keep-alive passes, CI passes and both production access checks hold.

## After launch

- **Update** [how-pairing-works.md](../../league/how-pairing-works.md) and the repository READMEs with the accepted public site URL once launch is accepted.
- **Keep** the [Python pairing tool](../../planning/tools/pairing/league_pairing.py) as the reference.
- **Export** league state from Admin → CSV after each stage; save the backup privately when that screen is available.
- **Redeploy** after changing league Markdown; League info is rendered at build time.

✓ Success: the repo points at the accepted site and a league-state backup is saved.
