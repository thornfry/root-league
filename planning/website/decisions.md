# Website Decisions

Decisions for the league website, newest first, in a short ADR form. All were made in the planning interview on 2026-11-26. The plan they shape is [plan.md](plan.md). League-wide decisions are on [planning decisions](../decisions.md).

## 12. The app lives in site/, beside the existing tooling

- **Date:** 2026-11-26
- **Context:** The repo holds league rules, season data and a working pairing tool. Reworking tooling that works means building beside it.
- **Decision:** All website code goes in a new `site/` folder. Nothing under `league/`, `season-1/` or `planning/tools/` changes until the cutover steps in the plan, which Will runs.
- **Consequence:** The old tool and pages keep working throughout the build.

## 11. Discord app: HTTP slash commands and channel posts in v1, built last

- **Date:** 2026-11-26
- **Context:** Will is open to a Discord app. A bot on the gateway needs an always-on process; an HTTP interactions endpoint does not. Supabase Edge Functions can host one on the free plan (500,000 invocations a month).
- **Decision:** v1 includes `/result` and `/mypairings` slash commands via an HTTP interactions endpoint on a Supabase Edge Function, plus channel posts through a Discord webhook when pairings are published and when a result is entered. A Discord Activity is out of scope. These commits come after the core site so they can slip without blocking launch.
- **Consequence:** No bot hosting cost. The app cannot read ordinary chat messages, which nothing here needs. Slash commands call the same database function as the web form, so the rules live in one place.

## 10. The port enforces the written pairing rules

- **Date:** 2026-11-26
- **Context:** The Python tool can fall back to off-list factions and ignores the militant and insurgent mix. Rule 7 says only "a sensible mix".
- **Decision:** Will adopted the sample pairings' mix as a written rule (2026-11-26). The TypeScript pairing enforces every hard rule on [pairing rules](../../league/pairing-rules.md): own-list factions only, no repeated factions, table reach at least 21, and at least one militant and one insurgent per table with never Vagabond and Knaves together. The mix is a named constraint in one file so it can change. If the lists cannot satisfy the rules, the run says which players and tables block it.
- **Consequence:** A run can be infeasible where the Python tool would return something. That is intended; the fix is longer lists.

## 9. Faction lists lock at a fixed deadline, enforced automatically

- **Date:** 2026-11-26
- **Context:** Changing lists after pairings exist would invalidate them.
- **Decision:** Each season has a lists deadline. The database refuses player edits after it. The admin can edit any list at any time and can move the deadline.
- **Consequence:** Late joiners are handled by admin edit. Changing a list after pairings are published is the admin's call, and the site warns that pairings are stale.

## 8. Seasons are in the data model; the UI shows the current one

- **Date:** 2026-11-26
- **Context:** The repo already separates league-wide pages from `season-1/` data.
- **Decision:** Every season-scoped table carries `season_id`. Players are league-wide, so one login spans seasons. The UI shows the current season with a season switcher for past ones. Creating a season is an admin form.
- **Consequence:** Cheap now, costly to retrofit. Copying a roster into a new season is a button, not per-season configuration beyond the settings listed in the plan.

## 7. Results record winners only, and each winner gets a full win

- **Date:** 2026-11-26
- **Context:** The league scores a win and nothing else. Some Root games have more than one winner, such as a Vagabond coalition win.
- **Decision:** A result is a set of one or more winning players from that game's table. No scores, places, win type or notes. Each winner counts one full win. Faction, seat and map come from the pairing.
- **Consequence:** Standings are a simple win count. The final-cut tiebreak that sums finishing places cannot be computed from site data; the final table is outside v1.

## 6. Anyone in the Discord server can join; the admin curates

- **Date:** 2026-11-26
- **Context:** Will wants self-join, gated on the league's Discord server, with an optional role.
- **Decision:** After Discord sign-in the `join` Edge Function checks server membership, and the configured role if one is set, with the app's bot token against the Discord REST API. Joiners start as Possible. The admin can edit, confirm, rename, link a joiner to a seeded roster row, or remove.
- **Consequence:** No Discord IDs need collecting up front. Membership is checked at join only, so leaving the server does not remove a player; the admin does that. The bot must be in the server. Fallback if the single-member REST call needs a privileged intent: request the `guilds.members.read` scope and check with the user's token at sign-in.

## 5. Everything is public, including ranked lists

- **Date:** 2026-11-26
- **Context:** `preferences.json` is already public in the repo.
- **Decision:** All site data is readable without login. Only writes need Discord sign-in.
- **Consequence:** Simple read policies. Players can see each other's lists while still editing them.

## 4. Players enter results; the admin can fix; no confirmation step

- **Date:** 2026-11-26
- **Context:** A 12-player friendly league does not need a dispute process, and an extra confirmation step is where results go missing.
- **Decision:** Any player seated at a game can enter or change its winners. The admin can edit or void any result. Every change is written to an append-only log with who made it.
- **Consequence:** A wrong entry is fixed by the admin or another player at the table, and the log shows who changed what. There is no lock on a result.

## 3. The Python pairing tool is ported to TypeScript and kept as the reference

- **Date:** 2026-11-26
- **Context:** The brief's default was to reuse the Python tool. Will chose to port it so the whole site is one language and pairing needs no server.
- **Decision:** The algorithm is ported to TypeScript and run in a Web Worker in the admin's browser, so a long anneal never blocks a web request. The Python tool and its tests stay in place and unchanged as the reference. Parity is tested on rules, not identical output: both implementations must pass the same hard-rule checks on shared fixtures, and each other's output.
- **Consequence:** Two implementations exist. Seeded output differs between them because the random number generators differ; the TypeScript tool is reproducible from its own seed. The Python tool keeps its documented gaps; the site's version is the one that meets the rules.

## 2. The database is live; the repo gets exported snapshots

- **Date:** 2026-11-26
- **Context:** `preferences.json` and `pairings.md` are the data today.
- **Decision:** Once the site is live, the database is the source of truth. The admin page exports `preferences.json`, `pairings.md` and `roster.md` in their current formats for Will to commit. Sync is one way, database to repo. The database is seeded once from the current files.
- **Consequence:** The repo stays a readable archive and the Python tool's input format is unchanged. Edits made directly in the repo files after seeding do not flow back.

## 1. Supabase with a static TypeScript SPA on Railway

- **Date:** 2026-11-26
- **Context:** Will has a Railway account and maybe a free Supabase project. Research on 2026-11-26: the Supabase Free plan pauses a project with low activity over about 7 days, caps the database at 500 MB, includes 50,000 monthly active users, supports Discord login natively, and allows 500,000 Edge Function invocations a month. Railway Hobby is $5 a month including $5 of usage, billed by resource use.
- **Decision:** Supabase provides Postgres, Discord sign-in, row-level security and Edge Functions. A static React and TypeScript single-page app, built with Vite, is served from Railway. There is no application server.
- **Consequence:** About $5 a month, all of it Railway. Known gaps: a keep-alive ping is needed so the free project does not pause between busy periods, and permissions live in SQL policies and functions, which need their own tests.
