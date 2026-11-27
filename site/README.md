# Root league website

React, TypeScript and Vite, backed by Supabase. Run commands below from `site/`
unless specified otherwise. League info is rendered from `../league/` at build
time; relative links are checked against the repository. Keep the repository
layout intact.

## Local development

Install Node 26, Docker, the Supabase CLI and `psql`, then:

```sh
npm ci
npm run db:start
npm run db:reset
cp .env.example .env.local
# Fill VITE_SUPABASE_ANON_KEY from `supabase status`.
ADMIN_DISCORD_ID=100000000000000001 npm run seed
npm run dev
```

The ID above is a fake local admin, seeded by the local stack. `.env.development`
and `.env.dev` select the local sign-in stand-in; `npm run build:dev` is for local
E2E testing. Never apply `supabase/seed.sql` to production: it enables dev sign-in.
Configure Discord OAuth and disable Email sign-in/sign-up in production Supabase.

```sh
npm run typecheck
npm run lint
npm test
npm run e2e:typecheck
npm run build
npm run check:no-dev
```

## Environment variables

Every `VITE_` value is **public**: Vite embeds it in browser JavaScript. Never put
a database password, service-role key or Discord client secret in a `VITE_`
variable. Set production values before building; changing runtime variables does
not update an existing bundle.

| Variable | Where | Meaning / default | Public? |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Vite / Docker build arg | Supabase project API URL; required for sign-in. Local env files use `http://127.0.0.1:54321`. | Yes |
| `VITE_SUPABASE_ANON_KEY` | Vite / Docker build arg | Supabase anon or publishable key; required for sign-in. RLS enforces access. Never use a service-role key. | Yes |
| `VITE_AUTH_MODE` | Vite / Docker build arg | Unset or `discord` for deployment. `dev` is for local dev only. Production builds reject `dev`; the image also runs `check:no-dev`. | Yes |
| `VITE_REPO_URL` | Vite / Docker build arg | HTTPS GitHub repository URL or `blob/ref` base for League info links. Default: `https://github.com/thornfry/root-league/blob/main`. | Yes |
| `PORT` | Caddy runtime | HTTP listening port, default `8080`; Railway injects it. Railway terminates public HTTPS. | Yes |
| `DATABASE_URL` | Seed process only | Database-owner PostgreSQL connection string. Defaults to the local Supabase database on port `54322`. | **Secret** |
| `ADMIN_DISCORD_ID` | Seed process only | Required 15–20 digit Discord user ID for the first admin. Use your real ID for production. | Personal data; keep private |
| `DISCORD_IDS` | Seed process only | Optional absolute path to a private JSON object mapping roster names to Discord IDs. No default. Keep the file outside the repo and Docker context. | Private file |
| `SUPABASE_URL` | GitHub repository secret | Project API URL used by the keep-alive workflow. | Public URL, stored as a secret |
| `SUPABASE_ANON_KEY` | GitHub repository secret | Anon/publishable API key used by keep-alive; no service-role key. | Public key, stored as a secret |
| `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID` | Local Supabase config only | Discord OAuth client ID; local provider is disabled by default. Production uses dashboard settings. | Public identifier |
| `SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET` | Local Supabase config only | Discord OAuth client secret, if explicitly enabling the local provider. Production uses dashboard settings. | **Secret** |
| `E2E_DATABASE_URL` | E2E tests only | Optional local database connection override; helper requires local Supabase on port `54322`. | **Secret** |
| `SEED_TEST_DATABASE_URL` | Seed integration tests only | Optional disposable PostgreSQL connection; unset skips these tests. | **Secret** |

The E2E browser helper also reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. Export the key from `supabase status` before running
`npm run e2e`. Never commit real credentials or private ID mappings; use ignored
`.env.local` files for local values and platform secrets for production.

## Container and Railway

From the **repository root**, build with public values in the environment:

```sh
docker build -f site/Dockerfile \
  --build-arg VITE_SUPABASE_URL \
  --build-arg VITE_SUPABASE_ANON_KEY \
  --build-arg VITE_REPO_URL \
  -t root-league-site .
docker run --rm -p 8080:8080 root-league-site
```

Open `/` and `/pairings/game/3`: both serve the SPA. Missing assets return 404.
`/assets/` contains Vite-fingerprinted files cached for one year; HTML and other
files revalidate. The final image contains Caddy and `dist/`, with no Node,
source files, database credentials or seed inputs.

In Railway, connect this repository, leave the service root at `/`, and set the
config file path to `/site/railway.toml`. It selects `site/Dockerfile`; the Docker
build context must stay at the repository root. Add `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` and optionally `VITE_REPO_URL` as service variables
(Railway makes declared Docker build args available). Leave `VITE_AUTH_MODE`
unset or set it to `discord`. Generate a public domain and configure the
Supabase Auth site URL and allowed redirect URLs to use that domain. The
container listens on Railway's `PORT`; no start-command override is needed.
Changes under `league/` trigger a rebuild to refresh League info.

See [Railway Docker builds](https://docs.railway.com/builds/dockerfiles),
[Railway config as code](https://docs.railway.com/config-as-code/reference) and
[Caddy SPA serving](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas).

## Weekly keep-alive

Add GitHub repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The
`Supabase keep-alive` workflow runs Wednesdays at 09:23 UTC and through **Run
workflow**. With either secret unset it exits successfully without a request.
When configured it GETs `/rest/v1/` with the API key, discards the response body
and fails on HTTP/network errors after bounded retries. It reads API metadata,
without a league account or a table read. Scheduled workflows run from the
default branch; ensure GitHub Actions schedules remain enabled. This mitigates
inactivity pausing; it cannot resume an already paused project.
