# Website Build Sequence

The ordered commits that turn the approved plan, stories and design into the finished site, written so one implementation agent can take one commit at a time. It replaces the [plan](plan.md)'s "Build commits" list, which is stale and stays as it was. The rules behind the screens are in the [user stories](user-stories.md), the screens are in the [design](design.md) and its canvas, and the choices that shape the build are in [decisions](decisions.md) (new ones are 40 and up). The prototype that shows the target behaviour is `planning/website/prototype/index.html`. Nothing here is a league rule.

Three things this build follows that were decided outside the stories:

- **Screens:** the design canvas, as amended by decisions 26 to 28 (recorded on the prototype branch): Join league goes straight to faction picking with no queue place, a game page is ticked winners plus Submit with no per-player answers or confirmation counts, and there is no badge guide.
- **Ranked lists are hidden** from everyone except their owner and the admin until the lists lock date. This supersedes story 3 and decisions 5 and 25 on visibility. A prototype agent is recording it as its own decision; this build only follows it, and it is enforced in the database, not the screen.
- **Mine, All, Completed and Upcoming** and the other story rules stand unless a decision above says otherwise.

## Stack summary

| Part | Choice |
|---|---|
| Frontend | React, TypeScript, Vite, React Router (browser history), TanStack Query for fetching, supabase-js, `@dnd-kit` for roster drag, `fflate` for the CSV zip |
| Style | Plain CSS with tokens from the Foundations board; Barlow Condensed and Inter self-hosted with `@fontsource` so nothing loads from the network |
| Data and auth | Supabase: Postgres, row-level security, Auth with the Discord provider. No Edge Functions, no bot, no slash commands |
| Writes | Only through `security definer` SQL functions that check the caller; no client write policies on any table ([decision 42](decisions.md#42-every-write-is-a-sql-function-and-there-are-no-edge-functions)) |
| Pairing | Seat layouts precomputed by the Python tool into one JSON file; only the faction step is TypeScript, run in a Web Worker |
| Tests | Vitest and Testing Library for TypeScript, pgTAP through `supabase test db` for SQL, Playwright against the local stack for end to end, axe for accessibility ([decision 51](decisions.md#51-test-and-library-choices)) |
| Hosting | Static build served by Caddy in a container on Railway, built from the repo root so the league pages can be rendered into the site ([decision 49](decisions.md#49-railway-builds-from-the-repo-root-and-the-league-pages-are-read-at-build-time)) |

Everything lives in `site/` and `.github/` except two named edits: rule 7 in `league/pairing-rules.md` with its entry in `planning/open-questions.md` (commit P3, from plan A4), and the link in `planning/README.md`.

```
site/
  package.json  vite.config.ts  tsconfig*.json  eslint.config.js  index.html
  Dockerfile  Caddyfile  railway.toml  README.md
  src/
    main.tsx  routes.tsx            one line per route, to keep merges small
    auth/        client, session context, dev sign-in, route guards
    db/          generated types.ts, one query/RPC module per area
    data/        factions.ts, layouts.json, valid-pairs.ts
    pairing/     rng, rules, assign, draft, worker, report
    ui/          tokens.css, components, factions seals
    pages/       player/, admin/
    content/     league pages read from ../league at build time
  supabase/      config.toml, migrations/, seed.sql, tests/database/
  scripts/       seed.ts, gen-layouts.py, parity.py, check-no-dev.mjs
  e2e/           playwright.config.ts, support/, *.spec.ts
  docs/          setup-runbook.md
.github/workflows/  ci.yml, keepalive.yml
```

### Data model

Built up across the database commits (D1 to D6). All tables are in `public` with row-level security on. Clients read tables and views under policies and write only through functions. Names are a guide; the migrations are the contract once written.

| Table | Key columns | Notes |
|---|---|---|
| `whitelist` | `discord_id` (pk, digits), `label`, `is_admin`, `added_by`, `added_at` | The gate. `is_admin` is the Admin role ([decision 43](decisions.md#43-roles-are-derived-and-only-admin-is-stored)). |
| `people` | `id`, `display_name`, `discord_id` (unique, null), `auth_user_id` (unique, null), `seed_key` (unique, null) | League-wide. Created or linked at first sign-in by `ensure_person()`. |
| `seasons` | `id`, `slug`, `name`, `is_current`, `capacity` (8, 10, 12), `games_each`, `maps text[]`, `faction_pool text[]`, `min_list_length`, `lists_lock_at`, `started_at`, `seed` | Settings are null until the admin sets them; the site holds no defaults. A check allows only valid capacity and games pairs. |
| `roster` | `(season_id, person_id)`, `list` (`league`, `waitlist`), `position`, `ranked_factions text[]`, `list_submitted`, `player_number`, `joined_at` | The league list and the waitlist, ordered. `player_number` is set at start. |
| `games` | `id`, `season_id`, `game_no`, `map_index`, `void` | Written once at start. |
| `game_seats` | `(game_id, seat 1..4)`, `person_id`, `faction` | Unique person per game. |
| `submissions` | `(game_id, person_id)`, `winners uuid[]`, `updated_at` | One per seated player; changeable until settled. |
| `settlements` | `game_id`, `winners uuid[]`, `settled_by`, `at` | The admin's final answer; its presence stops player edits. |
| `picks` | `(game_id, person_id)`, `first_pick`, `second_pick`, `updated_at` | Pick'em picks. |
| `edit_log` | `id`, `at`, `actor_person_id`, `table_name`, `row_key`, `action`, `old jsonb`, `new jsonb` | Append only, written by one trigger on every table above ([decision 45](decisions.md#45-one-audit-trigger-writes-the-append-only-log)). |
| `app_config` | `key`, `value` | Holds the dev sign-in flag. Present only in the local seed, never in production. |

Views and functions the screens depend on:

- **`season_stage`:** Open, Locked or Live, derived from `started_at` and `lists_lock_at`, so moving the date earlier or later changes the stage with no job.
- **`roster_public`:** the Players page. Always shows who is in and whether a list is in; shows `ranked_factions` only to the owner, the admin, or once the stage is not Open. It never shows which list (league or waitlist) a person is on, except to the admin.
- **`game_outcome`:** per game, a state (`upcoming`, `recorded`, `disputed`, `settled`, `void`) and winners, derived from `submissions` and `settlements` ([decision 44](decisions.md#44-a-games-result-is-derived-from-its-submissions)). Disputed games show no winners.
- **`standings`, `pickem_scores`, `leaderboard`:** wins, games played and left; points by pick; ranks with ties sharing.
- **Functions:** `whoami`, `ensure_person`, `join_league`, `leave_league`, `save_ranked_list`, `submit_result`, `save_pick`, and the admin set `whitelist_*`, `roster_move`, `roster_swap`, `roster_add`, `roster_remove`, `season_save`, `season_create`, `publish_pairings`, `settle_game`, `reopen_game`, `void_game`, `fixit_update`, `fixit_insert`, `fixit_delete`, `link_person`, `replace_player`, `import_league_state`. Each checks the caller itself.

## Local dev approach and stubs

The site runs fully on one machine with Docker and the Supabase CLI. Nothing needs Will's accounts ([decision 40](decisions.md#40-the-site-is-built-local-first-and-every-account-bound-part-is-stubbed)).

- **Local stack:** `supabase start` from `site/` brings up Postgres, Auth and the REST API. Migrations apply on `supabase db reset`, and `supabase/seed.sql` adds placeholder data. `npm run db:start`, `db:reset`, `db:test`, `db:types` wrap these, and `db:types:check` fails if the generated `src/db/types.ts` is out of date.
- **Dev sign-in stand-in:** a page that takes a Discord ID and signs in through Supabase Auth with the email `<id>@dev.invalid` and a fixed password, creating the user on first use. The database turns that email back into a Discord ID only while `app_config` holds `dev_signin = on`, a row that exists only in the local seed. From there the whitelist check is the same code path as production. Real accounts use `auth.identities` and ignore the flag ([decision 41](decisions.md#41-dev-sign-in-goes-through-the-same-database-whitelist-check)).
- **Production guards:** the stand-in page is compiled in only when `VITE_AUTH_MODE=dev`. A production build with that value fails, `npm run check:no-dev` greps `dist/` for the stand-in's marker and `dev.invalid`, and CI runs it on every build. Even if all that failed, the database ignores the stand-in without the seed row.
- **Real Discord sign-in:** written from the first auth commit and switched on only by config. `VITE_AUTH_MODE=discord` (the default) calls `signInWithOAuth({ provider: 'discord', options: { scopes: 'identify' } })`. Locally the provider stays off in `config.toml`; in production it is configured in the Supabase dashboard.
- **Placeholder identities:** the local seed whitelists fixed fake IDs, `100000000000000001` for the admin and onwards for the 12 Season 1 names plus a spectator and one non-whitelisted account. They are marked fake and never appear in a production run. Real IDs are Will's to enter on the Whitelist page or in the seed's optional `DISCORD_IDS` file.
- **Seed command:** `npm run seed` reads `season-1/preferences.json` and `season-1/roster.md` and connects with `DATABASE_URL` (default: the local database). Confirmed maps to the league list, Possible to the waitlist, `Submitted` to a submitted list, `Provisional` to an unsubmitted one. It is idempotent. `ADMIN_DISCORD_ID` becomes the first admin ([decision 48](decisions.md#48-the-seed-links-people-by-discord-id-then-by-label)).
- **Stubs that remain stubs until Will acts:** the Supabase project and keys, the Discord OAuth application, the Railway service and the real Discord IDs. The runbook below is how he swaps them in.

## Common checks

Every commit's own checks are on top of these. An agent runs them before reporting done.

| Gate | Command, from `site/` | Applies when |
|---|---|---|
| **web** | `npm run typecheck && npm run lint && npm test` | always, from F1 |
| **db** | `npm run db:reset && npm run db:test && npm run db:types:check` | the commit touches `supabase/` |
| **e2e** | `npm run e2e` (desktop 1280 and phone 375 projects) | from E1; a commit that adds UI adds its spec |
| **python** | `python3 -m unittest` in `planning/tools/pairing/` | always; the tool and its tests stay unchanged |
| **scope** | `git diff --name-only <base>..HEAD` lists only paths named in the commit | always |
| **trailer** | commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` | always |

CI runs the same gates on every push to a branch that touches `site/`, `planning/tools/pairing/`, `league/` or `.github/`, as four jobs: `web`, `db`, `e2e`, `python`.

## Commit list

Ids are lanes: **F** foundation, **P** pairing, **D** database, **U** screens, **E** end to end, **R** runbook. A commit is done when its checks pass and every earlier gate still passes. Review its diff before starting a dependent commit. Divergences go in the pull request description, not here.

### Foundation

**F1. Scaffold `site/` and CI**

- **Scope:** Vite, React, TypeScript, React Router, Vitest, Testing Library, ESLint, a placeholder home page. Scripts `dev`, `build`, `build:dev`, `typecheck`, `lint`, `test`. `.github/workflows/ci.yml` with the `web` and `python` jobs. `.gitignore` entries for `node_modules`, `dist`, `.env*.local`, Playwright output.
- **Files:** `site/package.json` and lockfile, `site/vite.config.ts`, `site/tsconfig*.json`, `site/eslint.config.js`, `site/index.html`, `site/src/main.tsx`, `site/src/routes.tsx`, `site/src/App.test.tsx`, `.github/workflows/ci.yml`, `.gitignore`.
- **Checks:** web; python; one passing component test; CI green on the commit (both jobs); `build` output has no reference to `dev.invalid`; scope.
- **Depends on:** nothing.

**F2. Local Supabase stack and database CI**

- **Scope:** `supabase init` under `site/`, `config.toml` (Discord provider off, email sign-up on with no confirmation for local use, site URL `http://localhost:5173`), the `db:*` scripts, a smoke pgTAP test, type generation to `src/db/types.ts`, and the `db` CI job using `supabase/setup-cli` and `supabase start`.
- **Files:** `site/supabase/config.toml`, `site/supabase/tests/database/000_smoke.test.sql`, `site/src/db/types.ts`, `site/package.json`, `.github/workflows/ci.yml`.
- **Checks:** db; `npm run db:start` then `db:reset` succeed on a clean machine; CI `db` job green; `db:types:check` fails when a migration is added without regenerating (shown once, then reverted); scope.
- **Depends on:** F1.

**F3. Design system and app shell**

- **Scope:** `ui/tokens.css` from the Foundations board (forest header, status colours, spacing), self-hosted fonts, components (Button, Tag with word and icon, Card, Alert, Field, FactionSeal, Stat, Modal, Toast), the shell (brand and phone menu, desktop top bar, admin bar that only an admin sees), and a placeholder page per route so navigation can be clicked. No data.
- **Files:** `site/src/ui/*`, `site/src/pages/Shell.tsx`, `site/src/routes.tsx`, tests beside each component.
- **Checks:** web; tests for each component state; shell test at 375 and 1280 widths that the menu shows every route and the admin bar is absent for a non-admin prop; no horizontal scroll at 375 (jsdom layout check plus a Playwright check added in E1); text and tag colours meet 4.5:1 (token test computes ratios); no emoji in any string; scope.
- **Depends on:** F1.

**F4. Faction data**

- **Scope:** `site/src/data/factions.ts` with code, name, type, reach, an info URL (Root Database or Law of Root) for each of the 13 factions, and name and alias lookup. Each URL is opened once by the agent and the check date is recorded in a comment.
- **Files:** `site/src/data/factions.ts`, `site/src/data/factions.test.ts`.
- **Checks:** web; a test parses `league/factions.md` and matches code, name, type and reach exactly; a test parses `FACTIONS` and the codes from `planning/tools/pairing/league_pairing.py` and matches reach and names; every name in `season-1/preferences.json` resolves; every URL is https on `therootdatabase.com`; scope.
- **Depends on:** F1.

### Pairing

**P1. Seat layouts**

- **Scope:** `scripts/gen-layouts.py` imports the Python tool unchanged (`build_plan`, `assign_seats`) and writes `src/data/layouts.json` for every valid pair, 8 players with 2, 3 or 4 games, 10 with 2 or 4, 12 with 2, 3 or 4, and for each map count from games each up to 6 ([decision 47](decisions.md#47-layouts-are-generated-once-for-each-map-count)). Each layout holds, per game, the four player slots in turn-order seats and the map index, plus stored stats (meeting spread, most and fewest meetings, map repeats). `data/valid-pairs.ts` exports the valid pairs and a lookup, and says why 10 with 3 is not offered. `npm run layouts:check` regenerates and fails on a difference.
- **Files:** `site/scripts/gen-layouts.py`, `site/src/data/layouts.json`, `site/src/data/valid-pairs.ts`, `site/src/data/layouts.test.ts`, `package.json`.
- **Checks:** web; python; for every layout a test recomputes: every game has 4 distinct slots, every slot plays games-each games, meeting spread at most 1 (8 players with 3 games at most 2, and its stored spread equals the recomputed one), no pair meets in every game of a player, each player holds a different seat in each game, stored map repeats equal the recomputed count and the Python tool's `min_map_repeats` lower bound for that size (any size where the generator cannot reach the bound is named in the test with its pinned value and a reason); `layouts:check` passes twice with the same output; 10 with 3 is absent; scope (the Python tool is untouched).
- **Depends on:** F1.

**P2. Pairing core: random numbers, rules, check, report**

- **Scope:** `pairing/rng.ts` (seeded, reproducible), `pairing/rules.ts` (reach at least 21, militant and insurgent mix and never Vagabond with Knaves as one named constraint, no duplicate faction at a table, no repeat for a player, own list only), `pairing/check.ts` (the full hard-rule check over a layout plus assignment) and `pairing/report.ts` (factions against each player's list, meetings, blocking rules, in the shape the Start season screen shows).
- **Files:** `site/src/pairing/{rng,rules,check,report,types}.ts` and tests.
- **Checks:** web; the same seed gives the same sequence and a different seed does not; each rule has a passing and a failing unit test; the mix constraint lives in one file and one test fails if it is edited to change behaviour; the checker accepts the repo's sample 3-game and 4-game pairings, transcribed into test fixtures, and rejects a table with reach 20, a repeated faction, a repeated seat and an off-list faction; scope.
- **Depends on:** F4, P1.

**P3. Pairing: the faction step**

- **Scope:** `pairing/assign.ts`, a port of `assign_factions` against a fixed layout and a seeded draw of player numbers, with every hard rule enforced as a constraint and an infeasible result that names the blocking players and tables. Also the plan A4 doc edit: rule 7 in `league/pairing-rules.md` becomes "at least one militant and one insurgent per table, and never Vagabond and Knaves together", and the mix entry leaves `planning/open-questions.md` ([decision 50](decisions.md#50-the-written-mix-rule-is-edited-in-the-faction-step-commit)).
- **Files:** `site/src/pairing/assign.ts`, `site/src/pairing/assign.test.ts`, `site/src/pairing/fixtures/*.json`, `league/pairing-rules.md`, `planning/open-questions.md`.
- **Checks:** web; `season-1/preferences.json` on the 12-player layouts at 3 and 4 games gives zero off-list plays and passes `check`; the 12-player mock fixture passes; a fixture where one player lists too few factions returns infeasible and names that player; the same seed and lists give the same draft; changing the seed changes player numbers; the run finishes within 10 seconds on the 12-player, 4-game case; python; scope.
- **Depends on:** P2.

**P4. Pairing worker and draft**

- **Scope:** `pairing/draft.ts` builds a draft from the season settings, roster and a seed (deal player numbers, run the faction step, return games plus report). `pairing/worker.ts` and a small client wrapper run it in a Web Worker with progress messages, cancel and a time budget. Drafts are not stored ([decision 46](decisions.md#46-pairing-drafts-are-not-stored)).
- **Files:** `site/src/pairing/{draft,worker,client}.ts` and tests.
- **Checks:** web; a test runs the worker path under Vitest (worker module loaded in a Node worker shim) on the 12-player fixture and gets a valid draft; progress arrives in increasing order; cancel stops it before it finishes and leaves nothing behind; an infeasible run returns the report and no games; scope.
- **Depends on:** P3.

**P5. Parity with the Python tool**

- **Scope:** `scripts/parity.py` and a Vitest wrapper. It runs the Python tool on the repo's two mock preference files and `season-1/preferences.json`, checks that output with the TypeScript checker for the rules both have (4 distinct players, even meetings, no repeated faction, reach, seats), and runs the TypeScript draft through the Python `check` for the same shared rules. A `python` CI step runs it.
- **Files:** `site/scripts/parity.py`, `site/src/pairing/parity.test.ts`, `.github/workflows/ci.yml`.
- **Checks:** web; python; the parity test passes on all three fixtures in both directions; the Python tool and its tests are unchanged (`git diff` on `planning/tools/pairing/` is empty); scope.
- **Depends on:** P3, P1.

### Database

**D1. Access core: whitelist, identity, people, log**

- **Scope:** migrations for `whitelist`, `people`, `edit_log` with its audit trigger function, `app_config`, `app.discord_id()` (from `auth.identities`, with the dev fallback only when `app_config` allows it), `app.is_whitelisted()`, `app.is_admin()`, `app.person_id()`, the policy pattern every later table copies, and the functions `whoami`, `ensure_person` (link by Discord ID, then by whitelist label to an unlinked seeded name, else create) and `whitelist_add`, `whitelist_add_many`, `whitelist_label`, `whitelist_remove`, `whitelist_set_admin`. `seed.sql` (local only) sets `dev_signin = on` and adds the placeholder whitelist.
- **Files:** `site/supabase/migrations/*_access.sql`, `site/supabase/seed.sql`, `site/supabase/tests/database/010_access.test.sql`, `src/db/types.ts`.
- **Checks:** db; pgTAP covers, as signed-out, non-whitelisted, viewer and admin: nothing is readable by the first two; a viewer cannot call any `whitelist_*` function; a bad ID names its row; a duplicate is refused; removing an entry cuts the same session's next read; `ensure_person` links a seeded name by ID, then by label, else creates, and twice changes nothing; the dev fallback returns null when `app_config` has no row; `edit_log` rows exist for each admin write and cannot be updated or deleted by anyone; scope.
- **Depends on:** F2.

**D2. Seasons, roster and ranked lists**

- **Scope:** `seasons`, `roster`, `season_stage`, `roster_public` (list visibility rule), and functions `season_create`, `season_save` (valid pairs only, capacity not below the league list, maps at least games each and at most 6, games each and capacity locked after start), `join_league`, `leave_league` (clears the list), `save_ranked_list` (pool, distinct, minimum length, refused after lock, sets `list_submitted` only when it reaches the minimum), `roster_move`, `roster_swap`, `roster_add`, `roster_remove`, and the admin list edit. A pool change that removes a ranked faction flags the roster row instead of deleting.
- **Files:** `site/supabase/migrations/*_season_roster.sql`, `site/supabase/tests/database/020_season_roster.test.sql`, `src/db/types.ts`.
- **Checks:** db; pgTAP covers each row of the permission table for the roster, lists and settings as visitor, viewer, prospect and admin; joining twice changes nothing; joining after lock or start is refused; a drop onto a full league list is refused and a swap is allowed; a player cannot edit a list after the lock but the admin can; moving the lock date earlier locks at once and later unlocks while not started; **another viewer cannot read a prospect's ranked factions before the lock but can after it, and the owner and admin always can; `roster_public` never shows league or waitlist to a non-admin**; 10 with 3 games is refused; scope.
- **Depends on:** D1.

**D3. Games, seats and publishing the pairings**

- **Scope:** `games`, `game_seats`, and `publish_pairings(season, seed, order, games)`. The browser sends the computed draft; the function checks structure only (stage is Locked, capacity and games each set, league list exactly full, every list valid, 4 distinct players per game, each player in the right number of games, one seat per player per game, a faction on every seat) then writes player numbers, games and seats, sets `started_at` and `seed`, and closes joining. After start roster moves, joins and settings changes are refused.
- **Files:** `site/supabase/migrations/*_games.sql`, `site/supabase/tests/database/030_publish.test.sql`, `src/db/types.ts`.
- **Checks:** db; pgTAP: a non-admin cannot publish; publishing before the lock, with the league list short, or with an invalid list is refused with the missing item named; a valid draft for 12 players with 3 games each publishes 9 games; publishing twice is refused; after start `join_league` is refused and a roster move is refused; games and seats are readable by every viewer and by nobody else; scope.
- **Depends on:** D2.

**D4. Results, disputes and standings**

- **Scope:** `submissions`, `settlements`, `game_outcome`, `standings`, and `submit_result` (seated players only, winners seated at the game, non-empty, refused once settled), `settle_game`, `reopen_game`, `void_game` (and unvoid). The admin entering for a game they are not seated in settles it ([decision 44](decisions.md#44-a-games-result-is-derived-from-its-submissions)).
- **Files:** `site/supabase/migrations/*_results.sql`, `site/supabase/tests/database/040_results.test.sql`, `src/db/types.ts`.
- **Checks:** db; pgTAP: first submission gives `recorded`; a matching one changes nothing; a different one gives `disputed` with no winners shown; the disputer changing to match clears the dispute; a settled game rejects player edits and `reopen_game` allows them; a winner not seated is refused; a non-seated league player and a prospect are refused; one and two winners both stand; void games are in no standings count; standings update after an entry, a change, a settle and a void; each action has an `edit_log` row with the actor; a player reads only their own submission and the admin reads all; scope.
- **Depends on:** D3.

**D5. Pick'ems**

- **Scope:** `picks`, `save_pick`, `pickem_scores`, `leaderboard`, and the visibility rule: other people's picks are readable only once the game's picks are closed; the admin reads all.
- **Files:** `site/supabase/migrations/*_pickems.sql`, `site/supabase/tests/database/050_pickems.test.sql`, `src/db/types.ts`.
- **Checks:** db; pgTAP: picks open only before any submission, settlement or void; a seated player cannot pick on their own game, the admin the same when seated; first and second must differ and both be seated; a first pick that wins scores 3, a second 1, and a game with two winners scores each pick on its own, so one person can score 4; a disputed game scores nothing until settled and then recomputes; a void game scores nothing and rejects new picks; another person's pick is hidden while open and visible after it closes; the leaderboard ranks with ties sharing a rank and leaves out people with no picks; scope.
- **Depends on:** D4.

**D6. Fix it and CSV import**

- **Scope:** `fixit_update`, `fixit_insert`, `fixit_delete` over an allowlist of tables and columns (admin only, always writes the log with old and new), `link_person` (move a sign-in onto a seeded name and remove the empty duplicate), `replace_player` (swap the person in a slot, keeping seats and picks), a delete preview that counts what goes with a person, and `import_league_state(jsonb)`, which validates every file, row and column in one transaction and writes nothing on failure ([decision 42](decisions.md#42-every-write-is-a-sql-function-and-there-are-no-edge-functions)).
- **Files:** `site/supabase/migrations/*_fixit.sql`, `site/supabase/tests/database/060_fixit.test.sql`, `src/db/types.ts`.
- **Checks:** db; pgTAP: non-admins are refused on every function; an update changes data and logs old and new; `link_person` leaves one person row and moves the login; `replace_player` keeps the seat and the game; deleting a person reports and removes their picks and submissions; a bad import names file, row and column and changes nothing; an import of an unchanged export changes nothing; a table outside the allowlist is refused; scope.
- **Depends on:** D5.

**D7. Seed command**

- **Scope:** `scripts/seed.ts` and `npm run seed`, per the stubs section: Season 1 name and roster only (settings are left for the admin), the people with `seed_key`, lists and submitted flags, the first admin from `ADMIN_DISCORD_ID`, and an optional `DISCORD_IDS` JSON file of name to ID that fills `people.discord_id` and the whitelist.
- **Files:** `site/scripts/seed.ts`, `site/scripts/seed.test.ts`, `site/package.json`.
- **Checks:** web; db; on an empty database the seed gives 12 people, 10 on the league list and 2 on the waitlist, with lists and submitted flags equal to the two repo files; a second run changes nothing (row counts and a table checksum); without `ADMIN_DISCORD_ID` it refuses with a message; with a `DISCORD_IDS` file each named person links; scope.
- **Depends on:** D2.

### Screens

Each screen commit adds its own Playwright spec under `e2e/` once E1 exists, using the dev sign-in and the scenario helpers.

**U1. Sign-in, gate and session**

- **Scope:** Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only, a typed data layer with TanStack Query, the session and `whoami` context, the dev sign-in page behind `VITE_AUTH_MODE=dev`, the Discord sign-in button behind the default mode, and the gate pages from the canvas: `Landing`, the consent step (the stand-in in dev, Discord itself in production), `NotInvited` with the Discord name and sign-out, and sign-out. Route guards for signed-in and admin routes, and a vite config rule that fails a production build with `VITE_AUTH_MODE=dev`.
- **Files:** `site/src/auth/*`, `site/src/db/client.ts`, `site/src/pages/Landing.tsx`, `NotInvited.tsx`, `site/vite.config.ts`, `site/scripts/check-no-dev.mjs`, tests.
- **Checks:** web; component tests for signed-out, not-invited, viewer and admin shells; guards redirect; the OAuth button calls `signInWithOAuth` with provider `discord` and scope `identify` (mocked client); a production-mode build with `VITE_AUTH_MODE=dev` fails; the default build passes `check:no-dev`; the URL and key are read only from `import.meta.env`; no secret value in the repo; scope.
- **Depends on:** F3, D1.

**E1. End to end harness and the gate scenario**

- **Scope:** Playwright config with `desktop` (1280) and `phone` (375) projects, the `webServer` that builds with `build:dev` and serves `vite preview`, support helpers (direct Postgres connection to reset the database and set scenarios such as "lists locked", sign in as a placeholder persona, a fake clock), axe helper, and the `e2e` CI job. First spec: S01 below.
- **Files:** `site/e2e/playwright.config.ts`, `site/e2e/support/*`, `site/e2e/s01-gate.spec.ts`, `.github/workflows/ci.yml`, `site/package.json`.
- **Checks:** e2e on both projects; the CI `e2e` job is green and uploads traces on failure; a deliberately broken assertion fails the run (shown once, reverted); the helpers reset the database in under 5 seconds; scope.
- **Depends on:** U1, D1. Its helpers set up state with SQL, so it does not wait for the seed command.

**U2. Whitelist page**

- **Scope:** admin Whitelist page: list with label, who added and when, add one, paste many with per-row errors, edit label, remove with confirmation, set and unset Admin, and the how-to for copying a Discord ID.
- **Files:** `site/src/pages/admin/Whitelist.tsx`, `site/src/db/whitelist.ts`, `site/e2e/s02-whitelist.spec.ts`, tests.
- **Checks:** web; e2e S02; paste of five lines with one bad ID names the bad line and adds none, then adds the four after correction; removing the signed-in viewer's entry locks that session on the next request; scope.
- **Depends on:** U1, E1.

**U3. Season setup**

- **Scope:** admin Season page: name, capacity (8, 10, 12), games each limited to valid pairs with the 10 with 3 case explained, the layout's meeting spread shown, maps (at least games each, at most 6, with a note that the layout uses them in order), faction pool, minimum list length, lists lock date entered in local time and stored as UTC, create season, and the refusals from `season_save`.
- **Files:** `site/src/pages/admin/Season.tsx`, `site/src/data/valid-pairs.ts` use, `site/e2e/s03-season.spec.ts`, tests.
- **Checks:** web; e2e S03; the spread for 8 with 3 games is shown and needs an acknowledgement; capacity below the league list count is refused with the move-people message; after start the capacity and games fields are read-only; the date round trips through UTC with the zone named; scope.
- **Depends on:** U1, E1, D2, P1.

**U4. Home, Join and Prospect Home**

- **Scope:** Home for the viewer (Join league), Prospect Home (list state, "Not submitted yet" warning, Leave), the join action straight to "You're on the list" faction picking, the leave confirmation, and the closed note after lists lock or the season starts. No queue place and no list label anywhere.
- **Files:** `site/src/pages/player/Home.tsx`, `ProspectHome.tsx`, `site/src/db/membership.ts`, `site/e2e/s04-join.spec.ts`, tests.
- **Checks:** web; e2e S04; joining twice shows one entry; after lock the button is replaced by the closed note; no text matching waitlist or league list or position number appears for a prospect (a test scans the rendered page); leave clears the list; scope.
- **Depends on:** U1, E1, D2.

**U5. My list**

- **Scope:** `MyList` open, locked and read-only states: add from the pool, remove, reorder with buttons, validation messages, the Submit list button at top and in the bottom bar, the faction rows with type, reach and an info link, and the one muted lock line with date and zone. After lock it is read-only for all but the admin.
- **Files:** `site/src/pages/player/MyList.tsx`, `site/src/ui/FactionRow.tsx`, `site/e2e/s05-my-list.spec.ts`, tests.
- **Checks:** web; e2e S05; add, remove, reorder and duplicate and pool validation have messages; Submit stays off below the minimum; a save then reload shows the new list and submitted; a pool change that removes a ranked faction shows the flag; locked state is read-only; each faction link points at its info URL; scope.
- **Depends on:** U1, E1, D2, F4.

**U6. Players page**

- **Scope:** Players: names with "List in" or "Waiting" while lists are open; ranked lists once locked; the viewer's own list always visible to them; no list label or role tags.
- **Files:** `site/src/pages/player/Players.tsx`, `site/e2e/s06-players.spec.ts`, tests.
- **Checks:** web; e2e S06; **before the lock another viewer's request for a prospect's ranked factions returns nothing (checked through the API as well as the page), after the lock it returns the list**; the admin sees all lists; layout works at 375 wide; scope.
- **Depends on:** U1, E1, D2.

**U7. Roster board**

- **Scope:** admin Roster: League list with count against capacity and Waitlist in join order, drag with `@dnd-kit`, a move button on every row for touch, swap in one move, reorder in the waitlist, add by name, remove with confirmation naming what goes, refused-drop message, disabled once Live.
- **Files:** `site/src/pages/admin/Roster.tsx`, `site/e2e/s07-roster.spec.ts`, tests.
- **Checks:** web; e2e S07 covering drag and the move button; a drop onto a full league list shows the refusal; the page says how many places are open when below capacity; the player view shows no change; Live state disables moves; scope.
- **Depends on:** U1, E1, D2.

**U8. League info**

- **Scope:** a Vite plugin or `import.meta.glob` with `?raw` that reads `league/format.md`, `league/pairing-rules.md` and `league/how-pairing-works.md` at build time, renders them, and rewrites links: links between the three stay inside the site, every other relative link goes to the repo on GitHub from `VITE_REPO_URL`. Desktop and phone layouts, no badge guide.
- **Files:** `site/src/content/*`, `site/src/pages/player/LeagueInfo.tsx`, `site/vite.config.ts`, tests.
- **Checks:** web; a test builds the pages and asserts the rendered text contains each file's headings; every link resolves (an internal route or a repo URL for an existing file); rule 7 reads the new text from P3; no page is editable; no rule text appears under `supabase/`; scope.
- **Depends on:** F3, P3 (rule 7 is current after it).

**U9. Pairings and game page (read)**

- **Scope:** Pairings pre-start from the hardcoded layout (player numbers, no names, the lock date), after start the game list with Mine, All, Completed and Upcoming (All default, Mine hidden for non-players, Disputed in Upcoming, Void in neither), and a read-only Game page: table number, map, four seats with player and faction, reach and mix tags, winners, history.
- **Files:** `site/src/pages/player/Pairings.tsx`, `Game.tsx`, `site/src/db/games.ts`, `site/e2e/s08-pairings.spec.ts`, tests.
- **Checks:** web; e2e S08; pre-start page has no person name and no faction for any persona; filters give the right counts on a fixture season; a long name and four faction rows wrap at 375 wide; the page for a game the viewer does not play still loads; scope.
- **Depends on:** U1, E1, D3, P1.

**U10. Start season**

- **Scope:** admin Start season: the preconditions checklist naming what is missing with a fix link, the seed field and re-roll, run with progress and cancel through the worker, the draft report (factions against lists, tables with reach, mix and rules), the failed state naming blocking players and tables with "re-roll" and "edit a list on Fix it" actions, and Publish calling `publish_pairings`. The draft is held in the browser only.
- **Files:** `site/src/pages/admin/StartSeason.tsx`, `site/src/db/start.ts`, `site/e2e/s09-start.spec.ts`, tests.
- **Checks:** web; e2e S09; Start is off until locked, league list full and every list valid, and says which; the same seed gives the same report twice; a shrunk list gives the failed state naming that player and no draft; cancel leaves the page usable; after Publish the pairings are visible to a viewer and joining is closed; reloading before Publish loses the draft and the same seed rebuilds it; scope.
- **Depends on:** P4, D3, U3, U7, U9, E1.

**U11. Submit and edit results**

- **Scope:** on the Game page, the seated player's ticked winners with Submit, then the recorded winners with Edit result; the disputed notice ("the admin will decide") with no per-player answers; the settled note; submissions never shown to other players.
- **Files:** `site/src/pages/player/Game.tsx` (result block), `site/src/db/results.ts`, `site/e2e/s10-results.spec.ts`, tests.
- **Checks:** web; e2e S10; one winner and two winners; a non-seated player and a prospect see the result and no controls; two different submissions show Disputed and no winners; matching again clears it; a settled game offers no edit; the page never renders another player's answer; scope.
- **Depends on:** D4, U9, E1.

**U12. Admin dashboard and Disputes**

- **Scope:** admin Dashboard in the three stages (lists open, "lists locked, season not started" with a link to Start season, live with counts), the dispute banner, and Disputes with both answers, settle by choosing one or entering another, and reopen.
- **Files:** `site/src/pages/admin/Dashboard.tsx`, `Disputes.tsx`, `site/e2e/s10-disputes.spec.ts`, tests.
- **Checks:** web; e2e S10 (disputes); the banner appears while any game is disputed and goes after settle; settling stops player edits and reopen restores them; the log shows each step with the actor; scope.
- **Depends on:** U11.

**U13. Home standings and Your games**

- **Scope:** Home for league players and everyone else after start: standings (wins, games played, games left, disputed and void ignored), the pick'em leaderboard block, and "Your games" with the result or an Enter result button.
- **Files:** `site/src/pages/player/Home.tsx` (extended), `site/src/db/standings.ts`, `site/e2e/s17-standings.spec.ts`, tests.
- **Checks:** web; e2e S17; standings match a hand-worked fixture with a disputed and a void game; they update after an entry, an edit and a settle; Your games shows only the player's tables; scope.
- **Depends on:** D4, U4, E1.

**U14. Pick'ems**

- **Scope:** the pick panel on the Game page (first and second pick, hidden-until-result note, absent on the player's own games), revealed picks with points once closed, My picks with open games and score, and the Leaderboard.
- **Files:** `site/src/pages/player/Pickems.tsx`, `Game.tsx` (pick panel), `site/src/db/picks.ts`, `site/e2e/s11-pickems.spec.ts`, tests.
- **Checks:** web; e2e S11; the control is absent, not disabled, on the player's own games; the same person cannot be first and second; picks hide until the first submission then show; a disputed game shows scoring paused; the leaderboard ties share a rank; scope.
- **Depends on:** D5, U9, E1.

**U15. Fix it**

- **Scope:** admin Fix it by area (people and roles, roster and lists, season and dates, games with seats and factions, submissions and results, pick'ems), editing any value, rule warnings from the checker that never block saving, the visible log with old and new values, link a sign-in to a seeded name, replace a player in a slot, void and unvoid, delete a pick, and the phone layout.
- **Files:** `site/src/pages/admin/FixIt.tsx`, `site/src/db/fixit.ts`, `site/e2e/s12-fixit.spec.ts`, tests.
- **Checks:** web; e2e S12 on desktop and phone; an edit that gives a table reach 20 shows the rule name and still saves; the log row shows who, when, old and new; deleting a person states how many picks and submissions go with them; standings and pick'em scores recalculate after an edit to a result; scope.
- **Depends on:** D6, U12, E1.

**U16. CSV page**

- **Scope:** admin CSV: faction picks export (one row per player, a column per rank), league state export as a zip of one file per area, import with file choice, a preview of what changes, confirm, and failure that names file, row and column. Parsing and zipping in the browser; the write is `import_league_state`.
- **Files:** `site/src/pages/admin/Csv.tsx`, `site/src/csv/*`, `site/e2e/s13-csv.spec.ts`, tests.
- **Checks:** web; e2e S13; export then import of unchanged data shows zero changes and writes nothing; a corrupted cell fails with file, row and column and the database is unchanged; an import after start warns about games and results; the import is one log entry with the file names; pairings are not in the files; scope.
- **Depends on:** D6, E1.

**U17. Deployment**

- **Scope:** `site/Dockerfile` (multi-stage: build from the repo root context, serve `dist/` with Caddy), `Caddyfile` with the single-page fallback and cache headers, `railway.toml`, `site/README.md` listing every environment variable and what is public, and `.github/workflows/keepalive.yml` (weekly and manual, calls the Supabase REST URL from repository secrets and passes quietly when they are unset).
- **Files:** `site/Dockerfile`, `site/Caddyfile`, `site/railway.toml`, `site/README.md`, `.github/workflows/keepalive.yml`, `.dockerignore`.
- **Checks:** web; `docker build -f site/Dockerfile .` from the repo root succeeds and the container serves `/` and a deep link such as `/pairings/game/3` with the page, and an unknown asset 404s; `check:no-dev` passes on the image's `dist`; the League info pages are in the build; the keepalive workflow runs from manual dispatch and exits 0 with and without secrets; `site/README.md` lists every `VITE_` and seed variable and no secret value is in the repo (a grep test for key-shaped strings); scope.
- **Depends on:** U1, U8.

### End to end and runbook

**E2. Full journey and accessibility pass**

- **Scope:** `e2e/s14-full-journey.spec.ts`, one serial spec that mirrors the prototype's click-through from the empty season to a played one (scenario S14), the permission sweep through the API (S15), and an axe pass over every page and state in the canvas at both widths (S16).
- **Files:** `site/e2e/s14-full-journey.spec.ts`, `site/e2e/s15-permissions.spec.ts`, `site/e2e/s16-a11y.spec.ts`, `site/e2e/support/*`.
- **Checks:** all gates; every scenario in the list below passes on both projects; axe reports no serious or critical violations; the run from a clean checkout (`db:reset`, `build:dev`, `e2e`) takes under 10 minutes; the production build passes `check:no-dev`; scope.
- **Depends on:** U2 to U17 and P5.

**R1. Setup runbook**

- **Scope:** `site/docs/setup-runbook.md` written from the outline below, and a pointer to it from `site/README.md`. Docs only.
- **Files:** `site/docs/setup-runbook.md`, `site/README.md`.
- **Checks:** every outline section is present with one line per step, a bold verb first and a success line per section; every environment variable and secret named in `site/README.md` appears in a step; every link and file path resolves; no emoji; a reader who has not seen this file can follow the local trial section on a clean machine (the agent follows it once and records any gap in the pull request); scope.
- **Depends on:** U17.

## Order and parallel work

Wave means "can start once every commit in earlier waves is merged". Commits in one wave touch different files, so each agent works in its own worktree. The shared files are `routes.tsx` (one line per route) and `ci.yml` and `package.json` (append only); the merge order inside a wave is the list order.

| Wave | Commits | Each waits for |
|---|---|---|
| 1 | F1 | nothing |
| 2 | F2, F3, F4, P1 | F1 |
| 3 | D1, P2 | D1: F2. P2: F4, P1 |
| 4 | D2, P3, U1 | D2: D1. P3: P2. U1: F3, D1 |
| 5 | D3, D7, P4, P5, U8, E1 | D3 and D7: D2. P4 and P5: P3 (P5 also P1). U8: F3 and P3. E1: U1, D1 |
| 6 | D4, U2, U3, U4, U5, U6, U7, U9, U17 | D4: D3. U2 and U4 to U7: E1 and D2 (U5 also F4). U3: E1, D2, P1. U9: E1, D3, P1. U17: U1, U8 |
| 7 | D5, U10, U11, U13, R1 | D5: D4. U10: P4, U3, U7, U9. U11: D4, U9. U13: D4, U4, E1. R1: U17 |
| 8 | D6, U12, U14 | D6: D5. U12: U11. U14: D5, U9 |
| 9 | U15, U16 | U15: D6, U12. U16: D6 |
| 10 | E2 | U2 to U17 and P5 |

U8 waits for P3 so that rule 7 reads the new text.

Single-agent order, if nothing runs in parallel: F1, F2, F3, F4, P1, D1, P2, D2, P3, U8, U1, D7, D3, P4, P5, E1, U2, U3, U4, U5, U6, U7, D4, U9, U17, D5, U11, U10, U13, U14, D6, U12, U16, U15, E2, R1.

Review rule: each diff is reviewed against this file and the stories before the next dependent commit starts. Rule drift between the SQL and the TypeScript checker is the main risk, so D3, D4 and D5 reviews check the pgTAP cases against the stories' tables, and P2 and P3 reviews check the rules against `league/pairing-rules.md`.

## End to end scenarios

Spec names are in the commit list. All run on the `desktop` and `phone` projects unless marked. The helpers set the starting state by direct database access; the steps are by the browser. The sequence follows the prototype's click-through.

| Id | Spec | What it proves |
|---|---|---|
| S01 | gate | Signed out shows only the sign-in page. A non-whitelisted ID sees "not invited" with the Discord name and no league data in the network responses. A whitelisted ID reaches Home. Adding the non-invited ID to the whitelist lets them in on reload with no new sign-in. Removing an entry from the admin's page locks that open session on its next request. The dev sign-in page is present in this build. |
| S02 | whitelist | Add one, paste five with one bad line (nothing added, row named), correct and add, duplicate refused, label edit, remove, assign and remove Admin. The how-to for copying an ID is shown. |
| S03 | season | Capacity and games each offer only valid pairs; 10 with 3 is absent and explained; the 8 with 3 spread is shown and needs acknowledging; maps, pool, minimum length and lock date save; capacity below the league list is refused. |
| S04 | join | A viewer clicks Join league, lands on "You're on the list" with no queue place. Join twice is one entry. Prospect Home warns "Not submitted yet". Leave clears the list. After lock, the button is the closed note. |
| S05 | my list | Add, reorder, remove, validation messages, Submit list, locked read-only, admin edits any list after lock, faction info links, one muted lock line with the zone. |
| S06 | players | Before lock: names with List in or Waiting, no ranked list for others, own list visible, API returns nothing for others' lists. After lock: every list visible. Admin sees all at any time. |
| S07 | roster | Drag and move button, swap, refused drop when full, waitlist reorder, add by name, remove with confirmation, players see no difference, disabled when Live. |
| S08 | pairings | Pre-start layout with numbers and no names. After start: All, Mine, Completed and Upcoming counts, Mine hidden for non-players, game page for a game the viewer is not in. Phone wrapping at 375. |
| S09 | start season | Checklist blocks and names the gap; the lock passes; a shrunk list fails and names the player; re-roll; draft report; same seed same draft; Publish opens pairings and closes joining. |
| S10 | results | A seated player submits and edits; a second player agrees; a different answer disputes with no winners shown; the admin banner appears; the admin settles; player edits stop; reopen restores them; a non-seated player cannot submit; standings update at each step. |
| S17 | standings | Standings and Your games on Home match a hand-worked fixture with a disputed and a void game, update after an entry, an edit and a settle, and the pick'em leaderboard block agrees with the Leaderboard page. |
| S11 | pick'ems | Picks hide until the first submission, then show; own-game control absent; first and second differ; scoring of 3 and 1 and a two-winner game; disputed pauses; void scores nothing; the leaderboard ties share a rank. |
| S12 | fix it | Edit a seat faction so a table breaks reach 21: the warning names the rule and the save works; the log shows old and new; link a sign-in to a seeded name; replace a player; void and unvoid; delete a pick with its count; run on the phone. |
| S13 | csv | Export picks and state, import unchanged shows no change, a corrupted cell fails with file, row and column and writes nothing, import after start warns, one log entry. |
| S14 | full journey | Serial, mirrors the prototype: Landing, consent, not invited and back, viewer home, Join, pick factions and Submit, Pairings before start, admin whitelists and sets the season, moves people, lock passes, Start season, publish, Pairings as a player (Mine), enter a result, a dispute and its settlement, picks and the leaderboard, standings on Home, Fix it, CSV export. |
| S15 | permissions | Through supabase-js as each of signed-out, non-whitelisted, viewer, prospect, league player and admin, every function and table in the permission table is tried and refused or allowed as the table says. Includes direct writes to tables, which are all refused. |
| S16 | accessibility | axe over every page and state in the design at both widths; keyboard order on the roster board and the pick panel; colour is never the only signal. Desktop only for the keyboard cases. |

## Setup runbook outline

The finished runbook is `site/docs/setup-runbook.md` (R1). It is for Will, not for build agents. One line per step, a bold verb first, a few words of note, and a success line at the end of each section. No emoji.

**Try it locally first** (no accounts)

- **Install** Docker, Node and the Supabase CLI.
- **Run** `npm ci` and `npm run db:start` in `site/`.
- **Run** `npm run db:reset`, then `npm run seed` with the placeholder admin ID.
- **Start** `npm run dev` and open the address it prints.
- **Sign in** with the dev page as each placeholder persona.
- **Run** `npm run e2e` for the full click-through.
- Success: the dev site shows Season 1 and the e2e run passes.

**Supabase**

- **Create** the project; note the URL, anon key and database connection string.
- **Disable** the Email provider and email sign-up.
- **Enable** the Discord provider with the client ID and secret from the next section.
- **Set** the site URL and redirect URL to the Railway domain.
- **Link** the CLI and run `supabase db push` from `site/`.
- Success: the tables exist and the Discord provider shows enabled.

**Discord**

- **Create** the application; copy the client ID and client secret.
- **Add** the Supabase callback URL as a redirect.
- **Check** the scope is identity only; no bot, no server invite.
- Success: the Discord login button reaches Discord and returns to the site.

**Railway**

- **Create** a service from the repo with the repo root as the build context and `site/Dockerfile` as the Dockerfile.
- **Set** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_REPO_URL`, and leave `VITE_AUTH_MODE` unset.
- **Deploy** and open the public URL.
- Success: the sign-in page loads and a deep link loads.

**Real IDs and data**

- **Sign in** once as yourself with real Discord, no whitelist yet.
- **Run** `select identity_data from auth.identities` and confirm the Discord user ID is in `provider_id` ([decision 41](decisions.md#41-dev-sign-in-goes-through-the-same-database-whitelist-check)).
- **Run** the seed with `DATABASE_URL`, your real `ADMIN_DISCORD_ID` and a `DISCORD_IDS` file.
- **Sign in** again; the Admin bar shows.
- **Add** the rest of the IDs on the Whitelist page; the how-to is there.
- **Set** capacity, games each, maps, pool, minimum length and lock date on the Season page.
- Success: Players and Roster match `season-1/`.

**Keep-alive and checks**

- **Add** the repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- **Run** the keep-alive workflow once by hand.
- **Check** a not-whitelisted account sees only "not invited".
- **Check** the production site has no dev sign-in page.
- Success: the workflow passes and both checks hold.

**After launch**

- **Update** `league/how-pairing-works.md` and the READMEs to point at the site once accepted.
- **Leave** the Python tool in place as the reference.
- **Export** the CSV state after each stage as a backup.
- Success: the repo points at the site and a backup is saved.

## Known gaps

The simplest mechanism was chosen each time. These are the gaps, to fix when they bite.

- **Dev sign-in is a second login path.** It exists only with the local seed row and a dev build; three guards stop it reaching production, and a test covers each.
- **Discord ID source is assumed.** The database reads the ID from `auth.identities` with the Discord provider. That field name is documented but not tested against live Discord offline; the first real sign-in checks it (runbook, Real IDs and data).
- **Drafts are lost on reload.** The seed rebuilds the same draft, and a draft is quick to remake.
- **Layouts are fixed.** 8 players with 3 games is uneven by design and the page says so; a better layout is a regenerated file.
- **Maps beyond 6 and extra map names are not used.** A season with more map names than its layout uses leaves the extra names unused, and the page says so.
- **No live updates.** Pages refetch on navigation and window focus; two people at one table see each other's result on the next refresh.
- **Writes are only functions.** There is no direct admin table write, so every admin need is a function; Fix it's allowlist covers the rest.
- **Rules in SQL and TypeScript.** The rule checker and the publish checks can drift; the pgTAP and parity tests are the guard, and Fix it warns using the TypeScript checker.
- **League info needs a redeploy.** A rule change in the repo shows on the site after the next Railway build.
- **Free plan pausing and limits** are as in the [plan](plan.md#known-gaps); the keep-alive workflow is the mitigation.
- **Hosting from the repo root** means a change to any file under `league/` triggers a Railway build.
