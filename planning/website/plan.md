# Website Plan

The plan for a league website: players rank factions, everyone sees players, pairings and results, and players report results. The decisions behind it are in [decisions.md](decisions.md). Nothing here is a league rule; the rules stay on the [league pages](../../league/).

## Goals

- **Faction lists:** players submit and edit their own ranked list until a deadline.
- **Display:** everyone can see the roster, lists, pairings, results and standings, with no login.
- **Results:** a player at a table reports its winners; the admin can fix anything.
- **Pairings:** the admin generates them in the browser with a TypeScript port of the pairing tool, reviews a draft and publishes.
- **Login:** Discord, restricted to members of the league's Discord server.
- **Discord app:** slash commands and channel posts, without an always-on process.
- **Fit:** the data model matches the repo files, and the repo gets exported snapshots.

## Decided scope for v1

In v1:

- Discord sign-in and self-join, gated on the league's Discord server and an optional role.
- Roster, with Confirmed, Possible and Withdrawn status, curated by the admin.
- Ranked faction lists with an automatic deadline.
- Pairing generation in a Web Worker, a draft, then publish.
- Public pages: standings, players, pairings, game detail, season archive.
- Result entry by players at the table, with admin edit and void, and an audit log.
- Admin pages: roster, season settings, pairing run, results, export.
- Export of `preferences.json`, `pairings.md` and `roster.md`.
- Slash commands `/result` and `/mypairings`, and channel posts for published pairings and entered results. These are built last and can slip without blocking launch.

Not in v1:

- Final table, cut tiebreaks, finishing places and scores. See the [final table notes](../season-1/final-table.md).
- Game scheduling, dates, reminders or rounds.
- Re-pairing after games have been played, and pairing late joiners into a published schedule.
- A Discord Activity.
- Email or any login besides Discord.
- Importing results from the repo files, other than the one-time seed.

## Stack and hosting

| Part | Choice | Why |
|---|---|---|
| Frontend | React, TypeScript, Vite, React Router, supabase-js | One language, static build, no server |
| Pairing | Pure TypeScript in `site/src/pairing/`, run in a Web Worker | Long anneal never blocks anything; no server cost |
| Data and auth | Supabase: Postgres, Auth with the Discord provider, row-level security | Free, Discord login built in, permissions enforced at the database |
| Server code | Supabase Edge Functions: `join`, `discord`, `notify` | HTTP only, no always-on process |
| Hosting | Static build served from Railway | Uses the Railway account Will has |
| Tests | Vitest for TypeScript, `supabase test db` (pgTAP) for SQL | Rules in both languages are tested |

Research on 2026-11-26, to re-check before launch:

- **Supabase Free:** projects with low activity over about 7 days are paused, with a warning email about a week before; 500 MB database; 2 active free projects; 50,000 monthly active users; 500,000 Edge Function invocations a month. A paused project can be restored from the dashboard. Pro is $25 a month and is never paused.
- **Railway Hobby:** $5 a month, which includes $5 of resource usage; usage above that is billed. A static site uses well under that.
- **Cost:** about $5 a month, all of it Railway. A 12-player league uses a tiny fraction of the Supabase free limits.

One Supabase project is used for production. Local development uses the Supabase CLI against the migrations in the repo; how Will runs it on his machine is his own business and is not built into the repo.

## Data model

All tables are in the `public` schema, created by migrations in `site/supabase/migrations/`. Faction codes are the short codes from [factions](../../league/factions.md) (`cats`, `rats`, `badgers`, `moles`, `birds`, `frogs`, `otters`, `vagabond`, `knaves`, `bats`, `crows`, `WA`, `lizards`). Faction names, types and reach live in one TypeScript file, `site/src/data/factions.ts`, tested against `league/factions.md` and the Python tool's `FACTIONS`, not in the database.

| Table | Key columns | Notes |
|---|---|---|
| `players` | `id`, `display_name`, `discord_id` (unique, nullable), `auth_user_id` (unique, nullable), `is_admin` | League-wide. Seed rows have no login until someone signs in and is linked. |
| `seasons` | `id`, `slug`, `name`, `games_each`, `maps text[]`, `faction_pool text[]` (null means all), `min_list_length`, `lists_deadline`, `is_current` | `maps` holds map names; the count is its length. Settings are entered by the admin, not hard-coded. |
| `season_players` | `season_id`, `player_id`, `status` (`confirmed`, `possible`, `withdrawn`), `ranked_factions text[]`, `list_status` (`submitted`, `provisional`) | The season roster and each list. One row per player per season. Primary key `(season_id, player_id)`. |
| `pairing_runs` | `id`, `season_id`, `seed`, `params jsonb`, `report jsonb`, `status` (`draft`, `published`, `discarded`), `created_by`, `created_at` | A run's input snapshot and its rule report. At most one `published` run per season. |
| `games` | `id`, `season_id`, `run_id`, `game_no`, `map_index`, `status` (`scheduled`, `played`, `void`) | `game_no` is the number players see and use in `/result`. Unique `(season_id, game_no)`. |
| `game_seats` | `game_id`, `seat` (1 to 4), `player_id`, `faction` | Unique `(game_id, seat)` and `(game_id, player_id)`. |
| `game_winners` | `game_id`, `player_id` | One or more rows per played game. Each row is one full win. The player must be seated at the game. |
| `result_log` | `id`, `game_id`, `actor_player_id`, `action` (`set`, `void`, `unvoid`), `winners uuid[]`, `at` | Append only. Written by the database functions, never by the client. |

Constraints that matter:

- **Lists:** `ranked_factions` has distinct values, all in the season's pool, with length at least `min_list_length`. Checked in the save function.
- **Seats:** a game has exactly four seats once published.
- **Winners:** a `played` game has at least one winner; a `scheduled` or `void` game has none.

Views:

- `players_public`: `id`, `display_name`. The `players` table itself is readable only by the owner and the admin, because it holds `discord_id` and `auth_user_id`.
- `standings`: per season and player, wins (count of `game_winners` on `played` games), games played, games scheduled.

Season settings such as games each, map names, the faction pool and the minimum list length are values Will enters on the Season page before running pairing. The site holds no defaults for them and does not decide them.

## Auth and permissions

**Sign-in.** Supabase Auth with the Discord provider, default scopes. The app registers one Discord application that serves login, the bot identity and the slash commands.

**Join.** After sign-in a user with no player record calls the `join` Edge Function with their Supabase token.

1. **Resolve** their Discord user ID from the auth identity.
2. **Check** `GET /guilds/{guild}/members/{id}` on the Discord REST API with the bot token.
3. **Refuse** with a clear message if they are not in the server, or if a role ID is configured and they do not hold it.
4. **Link** to an existing player row if one has that `discord_id` and no login. Otherwise create a player and a `season_players` row for the current season with status Possible and a Provisional empty list.

Server ID, role ID and bot token are Edge Function secrets. An unset role ID means any server member may join.

**Admin bootstrap.** Will's seed row carries his Discord ID from the seed command's environment and `is_admin = true`; his first sign-in links it. More admins are a flag the admin can set.

**Permission table.**

| Action | Visitor | Player | Admin |
|---|---|---|---|
| View everything | yes | yes | yes |
| Sign in and join | server members only | n/a | n/a |
| Save own ranked list | no | until the season deadline | any time, any player |
| Enter or change a game's winners | no | games they are seated in | any game |
| Void or unvoid a game | no | no | yes |
| Edit roster, status, names, link or remove players | no | no | yes |
| Season settings, deadline, create season | no | no | yes |
| Run, publish or discard pairings | no | no | yes |
| Export repo files | no | no | yes |

**Enforcement.** Players never write tables directly. Two security-definer functions do their writes:

- `save_ranked_list(season_id, factions)`: checks the caller is that season's player, the deadline has not passed, and the list is valid; sets `list_status` to submitted.
- `enter_result(game_id, winner_ids)`: checks the caller is seated at the game or is admin, the game is published, every winner is seated at it, and the set is non-empty; replaces the winners, sets the game `played`, writes `result_log`.

The admin has row-level policies for direct writes, plus functions for the awkward cases: `publish_run`, `void_game`, `link_player` (move a joiner's login onto a seeded row and delete the empty joiner row). `/result` calls `enter_result` with the service role after mapping the Discord user to a player, so the checks are identical.

## Relationship to the repo files and the pairing tool

**Source of truth.** The database. The repo files are seeded from once and then exported.

- **Seed:** `site/scripts/seed` reads `season-1/preferences.json` and `season-1/roster.md` and creates the Season 1 row, seed players, roster statuses and lists. The faction names in the JSON map to codes. Status `Submitted` and `Provisional` carry across. It is idempotent.
- **Export:** the admin Export page produces three files in the current formats and the admin commits them. `preferences.json` keeps the `players` and `status` keys and full faction names. `pairings.md` keeps the `Game | Map | Seat 1..4 | Winner` table with cells as `Player: Faction`; multiple winners are comma separated. `roster.md` keeps `Player | Status`.
- **Direction:** database to repo only. Hand edits to the repo files after the seed are not read back.

**Pairing tool.** The Python tool stays in `planning/tools/pairing/`, unchanged, as the reference. The TypeScript port is in `site/src/pairing/` and follows the same three steps: tables and maps, factions, seats, then a hard-rule check.

- **Same algorithm, stricter rules:** the port bans off-list factions outright and enforces the mix and reach 21, as on [decision 10](decisions.md#10-the-port-enforces-the-written-pairing-rules). The Python tool does not, and the plan leaves it that way.
- **Seeded and reproducible:** the port uses its own seeded generator. The same lists, settings and seed give the same pairings in TypeScript. They do not match the Python tool's output for the same seed.
- **Parity tests:** both implementations must pass the same hard-rule checks. Fixtures are the repo's two mock preference files plus `season-1/preferences.json`. Python results go through the TypeScript checker, and TypeScript results go through the Python checker, for the rules both have: 4 distinct players, even meetings, no repeated faction, reach, seats. Rules only the port has are tested in TypeScript.
- **Input and output:** the pairing function takes players with ranked lists, games each, map count and a seed. It returns games with seats and factions, plus a report of meetings, map repeats, list ranks and any blocking rule. Infeasible runs return the report instead of games.
- **Who plays:** only Confirmed players are paired. Possible and Withdrawn players are not.
- **Running it:** the admin page starts a Web Worker, shows progress, and the result is stored as a `draft` run. Nothing is public until the admin publishes.
- **Stale guard:** if any list, status or setting changes after a draft was made, the page marks the draft stale. Publishing a stale draft needs an explicit confirm.
- **After publishing:** a published run cannot be replaced once any game has a winner, unless the admin voids those games first. Discarding is only possible before publishing.

## Pages

Public, no login. Season switcher in the header; the current season is the default.

| Page | Shows |
|---|---|
| Home and standings | Wins, games played and games left per player; recent results; link to rules |
| Players | Roster with status; each player's ranked list and list status |
| Player | One player's list, their games with seat, faction, map and result |
| Pairings | All games, filterable by player, map or status; game number, map, four seats with factions, winners |
| Game | One game; result entry form for those allowed to enter |
| Seasons | Archive list |
| Rules | Links to the repo's league pages, not copies |

Signed in:

| Page | Shows |
|---|---|
| Sign in and join | Discord button, join result or refusal message |
| My list | Edit and reorder own ranked list, with the deadline and a countdown; locked after it |

Admin:

| Page | Does |
|---|---|
| Roster | Edit names, status, Discord IDs, admin flag; link, remove |
| Season | Settings, deadline, pool, maps, create season, copy roster |
| Pairing | Run, view report and draft, publish, discard |
| Results | Edit or void any game; view the log |
| Export | Download the three repo files |

## Deployment

- **Supabase:** one project. Discord provider on, redirect URL set to the Railway site. Migrations pushed with the CLI. Edge Functions deployed with the CLI.
- **Railway:** one service built from `site/`. The build is `npm ci && npm run build`; a small Caddy container serves `dist/` with a single-page fallback. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, and both are public values.
- **Discord application:** one app with the login redirect, a bot in the league server (no gateway connection needed), the interactions endpoint URL pointing at the `discord` function, and one channel webhook for posts.
- **Keep-alive:** a scheduled GitHub Actions job calls the Supabase REST API weekly so the free project is not paused.

### Setup and cutover, for Will

One line per step. These are run by Will, not by build agents.

**Supabase**

- **Create** or pick the project; note the URL and anon key.
- **Enable** the Discord provider with the Discord app's client ID and secret.
- **Set** the site URL and redirect URL to the Railway domain.
- ✅ Signing in from the deployed site returns to the site with a session.

**Discord**

- **Create** the Discord application; copy client ID, client secret, public key and bot token.
- **Invite** the bot to the league server with the `bot` and `applications.commands` scopes and no permissions.
- **Create** a channel webhook for announcements.
- **Set** the Edge Function secrets: guild ID, optional role ID, bot token, public key, webhook URL.
- **Set** the interactions endpoint URL to the `discord` function.
- ✅ A server member joins; a non-member is refused.

**Railway**

- **Create** a service from the repo with root `site/`.
- **Set** the two public environment variables.
- ✅ The public URL loads and shows the seeded Season 1.

**Data**

- **Run** the seed with Will's Discord ID in the environment.
- **Check** the roster and every list against `season-1/`.
- **Set** games each, map names, pool, minimum list length and deadline on the Season page.
- ✅ Standings and Players pages match the repo files.

**After launch**

- **Export** and commit the three repo files whenever the season changes.
- **Update** `league/how-pairing-works.md` and the READMEs to point at the site once Will accepts it.
- **Leave** the Python tool in place; it stays as the reference.
- ✅ The repo files match the site.

## Known gaps

- **Free-plan pausing.** The weekly job mitigates it. GitHub can disable scheduled workflows after a long stretch without repository activity; if the project pauses, restore it from the Supabase dashboard.
- **Rules in SQL.** Permissions live in policies and functions, which are harder to read and change than application code. They are covered by pgTAP tests in the same commits that add them.
- **Two implementations of pairing.** Drift is possible. Shared hard-rule fixtures catch rule drift, not quality drift.
- **Not the same output as Python.** Published pairings can be checked by rerunning the TypeScript tool with the stored seed, not the Python one.
- **No result confirmation.** Any player at a table can change its winners at any time. The log shows who did, and the admin can fix it.
- **Public lists while editing.** Players can see each other's lists before the deadline.
- **Membership checked at join only.** Leaving the server does not remove a player; the admin does.
- **Bot REST intent.** Discord's documentation lists the single-member REST call among those that work without a privileged intent. The `join` commit verifies that; the fallback is the `guilds.members.read` scope checked with the user's own token at sign-in.
- **Interaction timing.** Discord needs an initial response within 3 seconds. Edge Function cold starts should fit; if not, the function replies with a deferred response and follows up.
- **No re-pairing.** A withdrawal mid-season leaves games unplayed or void. Late joiners are not paired. Both are manual for the admin.
- **No final table.** Cut tiebreaks and finishing places are outside v1.
- **Deadline time zone.** Stored in UTC and shown in the viewer's local time with the zone named.
- **Single copy of the data.** Between exports the repo is out of date.
- **Free-plan limits and prices** were checked on 2026-11-26 and can change.

## Build commits

Each commit is one implementation agent's scope. Run the tests named in its checks; a commit is done when its checks pass and the repo's earlier tests still pass. Group A is the core site and is enough to launch. Group B is the Discord app and can slip.

### Group A: core site

**A1. Scaffold `site/`**

- Vite, React, TypeScript, React Router, Vitest, ESLint, a placeholder home page, `npm run build|test|lint|typecheck`.
- A CI workflow running typecheck, lint and test on `site/` changes.
- Checks: all four scripts pass; CI is green on the commit; no file outside `site/` and `.github/` changes.

**A2. Faction data**

- `site/src/data/factions.ts`: code, name, type, reach for the 13 factions, plus name and alias lookup.
- Checks: a test parses `league/factions.md` and matches it exactly; a second test parses `FACTIONS` and `MILITANT` from the Python tool and matches; `season-1/preferences.json` names all resolve.

**A3. Pairing port: tables and maps**

- Seeded random number generator, feasibility (`games_total`), deal, anneal on meetings and map repeats, as in `build_plan`.
- Checks: for 10 players with 4 games and for 12 players with 3 and 4 games, meeting spread is at most 1 and no pair meets in every game; the same seed gives the same plan; infeasible counts such as 10 players with 3 games return an error.

**A4. Pairing port: factions**

- Faction assignment as in `assign_factions`, with hard rules: own list only, no repeat for a player, no duplicate at a table, reach at least 21, at least one militant and one insurgent, never Vagabond with Knaves. The mix is a named constraint in one file.
- Infeasible results return a report naming the blocking players and tables.
- Make the mix a written rule: rule 7 in `league/pairing-rules.md` becomes "at least one militant and one insurgent per table, and never Vagabond and Knaves together"; remove the mix entry from `planning/open-questions.md`. Reach of at least 21 (rule 6) is already written and is enforced here.
- Checks: `season-1/preferences.json` at 3 and 4 games gives zero off-list plays and every rule holds; a fixture where one player lists too few factions returns infeasible with that player named; the mix constraint is covered by unit tests.

**A5. Pairing port: seats, check, report**

- König seat colouring as in `assign_seats`, the full `check`, and the report in the same shape as the Python `report` data.
- Parity script: runs the Python tool on the fixture files and checks its output with the TypeScript checker, and runs the port and checks its output with the Python `check` for the shared rules.
- Checks: nobody repeats a seat for up to 4 games; the parity script passes on `mock_preferences_FAKE.json`, `mock12_preferences_FAKE.json` and `season-1/preferences.json`; the Python tool and its tests are unchanged.

**A6. Pairing worker**

- A Web Worker wrapper with progress messages, cancel, and a time budget, around the port.
- Checks: a test runs the worker in a headless Vitest environment on the 12-player fixture and gets a valid result; cancel stops it before it finishes.

**A7. Database schema**

- Migrations for every table, constraint, view and function in the data model and permission table: `save_ranked_list`, `enter_result`, `publish_run`, `void_game`, `link_player`, with row-level policies and the append-only log.
- Checks: `supabase test db` passes pgTAP tests covering each row of the permission table as visitor, player, other player and admin; a player cannot enter a result for a game they are not in; after the deadline `save_ranked_list` fails; `players` is not readable by a visitor.

**A8. Seed command**

- `site/scripts/seed` reading `season-1/preferences.json` and `season-1/roster.md`, using the Discord ID for Will's row from the environment.
- Checks: after running it on an empty database there are 12 players, 10 confirmed and 2 possible, with lists and statuses equal to the files; running it twice changes nothing.

**A9. Auth and session**

- Supabase client, Discord sign-in and sign-out, a session context, a header with the season switcher, and route guards for signed-in and admin pages.
- Checks: component tests for signed-out, signed-in and admin headers; guards redirect correctly; the Supabase URL and anon key come only from environment variables.

**A10. Join function and flow**

- The `join` Edge Function with the Discord membership and role check, linking to a seeded row by Discord ID, and the Sign in and join page. Admin `link_player` UI is in A14.
- Checks: function tests with the Discord API mocked cover member, non-member, wrong role, role unset, existing seed row and fresh joiner; the commit records one manual run against the real Discord server confirming the REST call works with the bot token and no privileged intent.

**A11. Public read pages**

- Home and standings, Players, Player, Pairings, Game (read only) and Seasons, all from the views and tables with no login.
- Checks: component tests with fixture data; a test seeds a published run with two results and the standings match by hand; every page renders with no session; layout works at 375 pixels wide.

**A12. My list**

- Edit and reorder the signed-in player's list with the season's pool and length rule, save through `save_ranked_list`, and show the deadline and lock state.
- Checks: tests for add, remove, reorder and validation messages; the form is read-only after the deadline; a save then reload shows the new list and Submitted.

**A13. Result entry and admin results**

- Result form on Game for seated players, plus admin edit, void and the log view, all through `enter_result` and `void_game`.
- Checks: tests cover one winner, two winners and a non-seated player rejected; the log shows each change with actor; standings update after an entry, an edit and a void.

**A14. Admin: roster and season**

- Roster edit, status, Discord ID, admin flag, link and remove; season settings and deadline; create season; copy roster.
- Checks: non-admins cannot reach the pages or the writes; linking a joiner to a seeded row moves their login and leaves one player row; a created season has its own empty lists and games.

**A15. Admin: pairing run and publish**

- The Pairing page using the worker: choose seed and settings, show the report and draft, mark stale drafts, publish and discard.
- Checks: a 12-player run from the seeded data publishes 12 games for 3 games each, visible on the public Pairings page; changing a list marks the draft stale; publishing is refused when games already have winners; an infeasible run shows the blocking players.

**A16. Admin: export**

- Export page producing `preferences.json`, `pairings.md` and `roster.md`.
- Checks: exported `preferences.json` is accepted by the Python tool's loader and by the seed command, and a round trip leaves the database unchanged; exported `pairings.md` has the same columns as `season-1/pairings.md`; multiple winners are comma separated.

**A17. Deployment**

- Railway build and serve config, single-page fallback, environment variable documentation in `site/README.md`, and the weekly keep-alive workflow.
- Checks: the build serves from the container locally and a deep link such as a game URL loads; the keep-alive workflow runs from a manual dispatch and returns success; `site/README.md` lists every environment variable and no secret appears in the repo.
- Launch point: after A17, Will runs the setup steps above and the league can start.

### Group B: Discord app

**B1. Interactions endpoint and `/mypairings`**

- The `discord` Edge Function: signature verification, PING response, a command registration script, and `/mypairings` listing the invoker's games, results and opponents.
- Checks: tests for a valid and an invalid signature and for PING; `/mypairings` for a player with two games and for a user who is not a player; registration script is idempotent; the response is ephemeral.

**B2. `/result`**

- `/result game winner [winner2 winner3 winner4]` with game-number autocomplete limited to the invoker's unplayed games, calling `enter_result` as the invoker's player.
- Checks: tests for a seated player, a non-seated player, a winner not at the table, two winners and an admin entering for another table; the response states who won and that the admin can fix it.

**B3. Channel posts**

- The `notify` function behind a database webhook on `publish_run` and `result_log` inserts, posting to the channel webhook with a shared-secret check.
- Checks: a published run posts one message listing game count and a link; a result posts game number, winners and who entered it; a failed post does not fail the database write; a request without the secret is refused.

**B4. Docs and cutover**

- `site/README.md` setup, an admin runbook in the style of the cutover steps above, and a draft of the `league/how-pairing-works.md` and README changes saved in `site/docs/` for Will to apply.
- Checks: every setup step in this plan is covered; links resolve; no emoji; the planning folder index is current.

## Sequence notes

- **Order:** A1 first. A2 to A6 (pairing) and A7 to A8 (data) are independent and can run in parallel. A9 needs A1 and A7. A10 needs A9. A11 to A16 need A7, A9, and for A15 also A6. A17 is last in Group A. Group B needs A7 and A10 and starts after A17.
- **Review:** each commit is reviewed on its diff before the next starts, with the plan as the contract. Divergences go in the PR description, not in this plan.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
