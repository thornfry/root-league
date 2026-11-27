# Website Decisions

Decisions for the league website, newest first, in a short ADR form. All were made in the planning interview on 2026-11-26. The plan they shape is [plan.md](plan.md). League-wide decisions are on [planning decisions](../decisions.md).

Entries 13 to 25 come from the user stories review on 2026-11-26, and entries 26 and 27 from the design review the same day. Each names the decision it supersedes or reaffirms; the old entries and the [plan](plan.md) are left as they were. The stories are in [user-stories.md](user-stories.md).

## 27. Ranked lists are private until the lists lock date

- **Date:** 2026-11-26
- **Context:** Story 3, [5](#5-everything-is-public-including-ranked-lists) and [25](#25-access-is-a-whitelist-of-discord-user-ids) let everyone who can read the site, which is now every whitelisted person, see ranked lists as soon as they are saved. The approved design hides them until lock ([26](#26-the-approved-design-amends-the-story-screens)) and left it as an open item. Will has confirmed it.
- **Decision:** A ranked faction list is visible only to its owner and the admin until the lists lock date. Before lock, the Players page shows each person's name and whether their list is in, and nothing else; after lock, it shows every ranked list to everyone who can read the site. The rule is enforced in the database read policy, not only on the screen, so another person's list cannot be fetched before lock. The admin still sees and edits every list at any time (Players, Roster and Fix it). This supersedes the list-visibility lines of story 3, the "public, including ranked lists" decision in 5, and the "ranked lists readable from the moment they are saved" consequence in 25. Everything else in 5 and 25 stands: the site is readable only by whitelisted people, and writes need a sign-in.
- **Consequence:** Players cannot copy or counter each other's lists while ranking. The repo's `preferences.json` is already public, so this hides lists only on the site, and only the seed's lists were ever in the open. The read policy needs a lock-date check, and the admin's CSV export includes lists regardless.

Entries 40 to 51 come from writing the [build sequence](build.md). They are numbered from 40 on purpose: other work on the website branches is adding entries from 27, and starting at 40 keeps the numbers from colliding. The gap from 27 to 39 is not missing entries.

Entries from 52 on come from Will's click-through of the running site on 2026-11-27.

## 58. Once the season is live, Home is My games and a pick'em score, and Players is the standings

- **Date:** 2026-11-27
- **Context:** Will's first look at the site with the league started. Faction lists, the Home standings table and My factions were all setup-time screens, and the live pages carried too much.
- **Decision:** Home shows My games (renamed from Your games) and a pick'em quick view of the player's score and rank. It no longer shows standings, the pick'em leaderboard, or any link to Pick'ems, which is in the menu. A game the player is seated at has a Report result button (Edit result once it has a result) unless it is void or settled by the admin. Players shows standings instead of faction lists: player name on the left and a W-L record, with no rank, played or left columns, since everyone plays the same number of games and the record gives games left. Losses are games played minus wins. My factions leaves the menu and its page sends the player Home once the season is live; the admin still edits any list through Roster and Fix it. This supersedes the standings and Pick'em leaderboard slots on Home in decision 26's design, and story 3's lists on the live Players page.
- **Consequence:** The standings view still carries wins, played and left; only the page shows less. The pick'em quick view counts only people with at least one scored pick, so "rank 2 of 5" means five people have scored.
- **Open, waiting on Will's review of the canvas:** the filter control on Pairings (a design-language component), a one-row-per-game Pairings table with the winners highlighted, a click-to-pick Pick'ems page with no dropdowns, and the pick'em leaderboard as its own page. None of these is built yet.

## 57. The e2e suite runs locally on request, not in CI

- **Date:** 2026-11-27
- **Context:** Decision 51 added a Playwright suite, and CI ran it against a full Supabase stack on every push. It never passed there, each run took about 17 minutes, and it depended on the Supabase CLI and stack starting up. Will would rather CI stay off vendor services and test the core, and run the browser suite himself when a change is big.
- **Decision:** CI no longer runs the e2e job. The specs stay in `site/e2e`, the web job still type-checks them (`npm run e2e:typecheck`), and the suite runs locally with `npm run e2e` when Will asks for it. The rest of decision 51 stands.
- **Consequence:** A pull request can be green with a broken browser flow, so run the suite before large merges. A local run wipes the local database on port 54322. The `db` job still uses the Supabase CLI for pgTAP.

## 56. The admin can lock and unlock lists with one button

- **Date:** 2026-11-27
- **Context:** Lists lock when `seasons.lists_lock_at` passes (the stage is derived by `app.stage_of`; see decision 20). Will does not want to wait for the date once everyone has submitted.
- **Decision:** An admin-only function `season_lock_lists(p_season_id)` sets `lists_lock_at` to now. It does nothing if lists are already locked and refuses once the season has started. A "Lock lists now" button with a confirmation sits on the Season page beside the lock date and on the Start season page. Once lists are locked the same button reads "Unlock lists" and calls `season_unlock_lists`, which clears the lock date (a no-op if lists are already open, refused once the season has started). Setting a later date on the Season page and saving also reopens lists, because the stage is derived on every read.
- **Consequence:** Locking early overwrites the planned lock date and unlocking clears it, so set a new date after unlocking if you want lists to lock on their own. Decision 20's single lock date is now the date the admin chose or the moment they pressed the button. The change is in the edit log like any other season change. Ranked lists become visible to everyone at that moment (decision 27).

## 55. Type is Baskervville, IM Fell English and Alegreya Sans

- **Date:** 2026-11-27
- **Context:** Will tried new faces on the design canvas and approved a classic, bookish set over Barlow Condensed and Inter.
- **Decision:** The site uses Baskervville for reading text (`--f-body`), IM Fell English for headings and the wordmark (`--f-display`, weight 400 only, mixed case), and Alegreya Sans for labels, controls and numbers (`--f-ui`). This supersedes only the font names in the Look line of design.md. Decision 51's self-hosting through `@fontsource`, Latin subset, is unchanged.
- **Consequence:** Headings are never bold or uppercase, because IM Fell English has one weight. Small text of 12 to 14px stays on Alegreya Sans, since Baskervville is weak at small sizes.

## 54. The roster board moves people with buttons, not drag and drop

- **Date:** 2026-11-27
- **Context:** Decision 51 chose `@dnd-kit` for roster drag, with a move button on every row. Will found the Drag handle odd and drag and drop awkward, and the Submitted, Provisional and No list tags unclear.
- **Decision:** Each roster row has one move button, To waitlist or To league, plus Up and Down on the waitlist and Remove. There is no drag and drop, and `@dnd-kit` is removed. A row's list tag is Ready or Not ready, as on Players. This supersedes the drag line of decision 51.
- **Consequence:** One click per move, and the keyboard order is shorter. Reordering a long waitlist takes several Up or Down clicks.

## 53. A list is Ready at three to five factions, and holds at most five

- **Date:** 2026-11-27
- **Context:** Story 5 lets a list grow to the whole pool and calls it Submitted once it reaches the season minimum. Will wants at most five factions, partial lists saved, and the words Ready and Not ready.
- **Decision:** A ranked list holds at most five factions; `save_ranked_list` and `roster_set_list` refuse a longer one. Any shorter list saves, so players can stop part way. A list is Ready (the stored `list_submitted`) when it has from the season minimum up to five factions and is not flagged. The site says Ready and Not ready instead of Submitted, List in and Waiting, and My list is renamed My factions; the route stays `/my-list`. The cap of five is a constant in the database (`app.list_max()`) and the site (`LIST_MAX`), not a season setting. This supersedes the length line of story 5.
- **Consequence:** Known gaps: a season minimum above five, or games each above five, leaves no list able to be Ready, and the Season page does not warn about it. Lists written directly (Fix it, CSV import, test fixtures) are not capped.

## 52. Players cannot leave the league from the site

- **Date:** 2026-11-27
- **Context:** Story 4 gives a prospect a Leave league button on Home. Will would rather removing people stay with the admin.
- **Decision:** Home has no Leave league button. The admin removes people on Roster. The `leave_league` function stays in the database, unused by the site. This supersedes the leave line of story 4 and its row in the permissions table.
- **Consequence:** A prospect who wants out asks the admin.

## 51. Test and library choices

- **Date:** 2026-11-26
- **Context:** The build needs a fetching layer, drag and drop, fonts and test tools, and each choice could be a long argument.
- **Decision:** One npm package in `site/`. TanStack Query for fetching and caching, React Router with browser history (Caddy serves the single-page fallback), `@dnd-kit` for roster drag with a move button on every row, `fflate` for the CSV zip, fonts self-hosted through `@fontsource` so no page loads from another site, Vitest and Testing Library, pgTAP through `supabase test db`, Playwright with a desktop and a 375 pixel project, and axe for accessibility. Each screen commit adds its own end to end spec; commit E2 adds the full journey. There is no live subscription; pages refetch on navigation and window focus.
- **Consequence:** Fewer moving parts and a build that works offline. Two people at one table see each other's result on the next refresh, not at once.

## 50. The written mix rule is edited in the faction step commit

- **Date:** 2026-11-26
- **Context:** Plan commit A4 edits rule 7 of `league/pairing-rules.md` and removes the mix entry from `planning/open-questions.md`. [Decision 12](#12-the-app-lives-in-site-beside-the-existing-tooling) says nothing outside `site/` changes before the cutover steps. [Decision 10](#10-the-port-enforces-the-written-pairing-rules) records that Will adopted the mix as a written rule.
- **Decision:** Commit P3 makes the two edits, as A4 says, because the site's faction step enforces the rule and the League info pages must say what the site does. They are the only edits outside `site/` and `.github/` besides the README link. The rest of the cutover stays Will's.
- **Consequence:** The rule text and the code change in one diff, so they cannot drift. The Python tool still does not enforce the mix and is not touched.

## 49. Railway builds from the repo root and the league pages are read at build time

- **Date:** 2026-11-26
- **Context:** [Decision 22](#22-faction-info-and-league-info-come-from-the-repo) renders `league/*.md` into the site at build time. The plan had the Railway service use `site/` as its root, where `league/` is out of reach.
- **Decision:** The Railway service builds from the repo root with `site/Dockerfile`, which builds the static site and serves it with Caddy and a single-page fallback. Links between the three league pages stay inside the site and every other relative link goes to the repo on GitHub from `VITE_REPO_URL`.
- **Consequence:** A change under `league/` triggers a build and a deploy, which is the intended way a rule change reaches the site. The setup steps say to set the build context to the repo root.

## 48. The seed links people by Discord ID, then by label

- **Date:** 2026-11-26
- **Context:** [Decision 25](#25-access-is-a-whitelist-of-discord-user-ids) says a whitelist entry matching a seeded name links at first sign-in, but the repo files hold names and no Discord IDs, and Will gathers the IDs later.
- **Decision:** The seed creates people with a `seed_key` and no Discord ID. An optional `DISCORD_IDS` JSON file of name to ID, kept out of the repo, fills IDs and the whitelist at seed time. At first sign-in `ensure_person` links by Discord ID, then by a whitelist label equal to an unlinked seeded name, and otherwise creates a person. If two names match, nothing links and the admin uses Fix it. The seed's `ADMIN_DISCORD_ID` is the first admin. Provisional lists carry across as lists that are not submitted.
- **Consequence:** Will can whitelist by typing a name as the label and have the person land on their seeded list with no manual link. A wrong label is a Fix it job.

## 47. Layouts are generated once for each map count

- **Date:** 2026-11-26
- **Context:** [Decision 21](#21-seat-layouts-are-hardcoded-and-factions-are-assigned-in-the-app) hardcodes layouts for each valid player count and games each. The map index in a layout depends on how many maps the season has, and the stories let the admin enter any number of maps at least as many as games each.
- **Decision:** The generator makes a layout for each valid pair and each map count from games each up to 6, 8 pairs in all, using the Python tool's table and map search and its seat colouring, unchanged. The Season page offers between games each and 6 maps and says the layout uses them in order. Stored statistics (meeting spread, map repeats) are rechecked by tests and shown on the setup page. This supersedes the "at least as many as games each" wording in story 1 with a cap of 6.
- **Consequence:** No layout search runs on the site, and each setup is reproducible. A better layout is a regenerated file. More than 6 maps is a code change.

## 46. Pairing drafts are not stored

- **Date:** 2026-11-26
- **Context:** The plan stored a draft run in the database. Story 7 and decision 20 have the draft visible only to the admin and then published, with the same seed and lists giving the same draft.
- **Decision:** A draft lives only in the browser. Publish sends the computed assignment to `publish_pairings`, which checks its structure (counts, seats, factions present, stage, lists valid) and writes the games. It does not rerun the pairing rules; the browser's checker did that, and Fix it can still change anything afterwards with a warning.
- **Consequence:** No draft table and no stale guard. A reload loses the draft and the stored seed rebuilds it. A modified client could publish a rule-breaking draft, but only the admin can publish.

## 45. One audit trigger writes the append-only log

- **Date:** 2026-11-26
- **Context:** Stories 9 and 10 want every submission and every edit logged with who, when, old and new, and decision 23 wants the log append only.
- **Decision:** One trigger function, attached to every league table, writes the old and new row and the acting person to `edit_log`. No role can update or delete log rows. Functions do not write the log themselves.
- **Consequence:** A new table is logged by attaching the trigger, and no function can forget to log. The log records row changes, not intent; a moved person is two rows' worth of change, shown as one line by the screens.

## 44. A game's result is derived from its submissions

- **Date:** 2026-11-26
- **Context:** [Decision 18](#18-every-seated-player-submits-a-result-and-conflicts-go-to-the-admin) describes recorded, disputed and settled states, and [decision 26](#26-the-approved-design-amends-the-story-screens) removes per-player answers from the page. A stored state would have to be kept in step with the submissions.
- **Decision:** The state comes from a view over submissions and the admin's settlement. No submission is upcoming; all submissions with the same winners are recorded; different winners are disputed with no winners shown; a settlement overrides and stops player edits until the admin reopens; a void game is void. Standings and pick'em scores read the view, so a change anywhere recalculates them. A seated admin submits like a player. An admin who is not seated enters a result as a settlement.
- **Consequence:** A dispute clears itself when the answers agree, and there is nothing to repair if a row is edited on Fix it. Players read only their own submission.

## 43. Roles are derived and only Admin is stored

- **Date:** 2026-11-26
- **Context:** [Decision 17](#17-permissions-come-from-four-app-roles) says roles are held in a roles table. Three of the four follow from facts the database already holds.
- **Decision:** Viewer is a whitelisted sign-in, prospect is a person on the roster before the season starts, league player is a person on the league list once it has started, and Admin is a flag on the whitelist row, so an admin can be named before they have ever signed in. A `whoami` function returns the derived roles. This changes only where roles are held, not what each can do.
- **Consequence:** No second table to keep in step with the roster. Starting the season turns league-list prospects into league players with no extra write. Roles stay fixed in code, as 17 says.

## 42. Every write is a SQL function and there are no Edge Functions

- **Date:** 2026-11-26
- **Context:** The plan listed Edge Functions for join, Discord and notify, and gave the admin direct write policies. Decisions 11, 14 and 24 removed the Discord functions, and access is now a whitelist checked in the database.
- **Decision:** The site has no Edge Functions. Tables are readable under row-level policies and no client can write one directly, admin included. Every change goes through a `security definer` function that checks the caller, including Fix it (an allowlisted generic update, insert and delete) and the CSV import, which is one function taking validated rows and writing all or nothing. Row-level policies and function checks are tested together in pgTAP.
- **Consequence:** One way to write, one place to check permissions, and nothing to deploy beside the migrations. A new admin need is a new function or an allowlist entry.

## 41. Dev sign-in goes through the same database whitelist check

- **Date:** 2026-11-26
- **Context:** Will's accounts are not available while the site is built, and the build must run end to end without them. A stand-in that skipped the whitelist would test nothing real.
- **Decision:** The stand-in is a page that signs in with the Supabase email provider as `<discord id>@dev.invalid`. The database resolves a Discord ID from `auth.identities` for the real Discord provider, and from that email only while the `app_config` table holds `dev_signin = on`, a row only the local seed inserts. Everything after, including the whitelist and admin checks, is the same code. The page is built only with `VITE_AUTH_MODE=dev`; a production build with it fails, a script checks the production bundle for the stand-in, and CI runs both. Real sign-in uses `signInWithOAuth` with the `identify` scope and is on by default, switched by configuration in the Supabase dashboard. The first real sign-in checks that the Discord ID is in `provider_id`, a step in the runbook.
- **Consequence:** The whitelist, roles and every function are tested through the real path. Production would need three separate mistakes before the stand-in worked, and the last guard is in the database.

## 40. The site is built local-first and every account-bound part is stubbed

- **Date:** 2026-11-26
- **Context:** Will is away and wants to return to a finished site. The Supabase project and keys, the Discord OAuth application, the Railway service and the real Discord IDs all need his accounts. This is entry 40, not 27, to avoid collisions with entries other agents are adding from 27.
- **Decision:** The site is built and tested entirely against the Supabase CLI's local stack. Each account-bound part is written, tested with a stand-in and switched on by configuration: Discord OAuth by `VITE_AUTH_MODE` and the dashboard settings, Supabase by the two public `VITE_` variables, Railway by a Dockerfile and `railway.toml`, and real IDs by the Whitelist page and the seed's optional ID file. The last build commits are a full click-through end to end run and a runbook for Will, one line per step, which turn each stub into the real thing. The sequence is in [build.md](build.md); it replaces the plan's stale commit list.
- **Consequence:** Nothing blocks on Will until the runbook. The first real sign-in and real IDs are unproven until he does it, and the runbook says what to check.

## 26. The approved design amends the story screens

- **Date:** 2026-11-26
- **Context:** Will reviewed the design canvas ([design.md](design.md)) with comments and approved it. Several screens differ from the stories: they are simpler than the stories describe.
- **Decision:** The canvas is the source of truth for screens. It drops the Join page and the queue place (Join league goes straight to faction picking), the per-player answer list and confirmation counts on a game, the badge reading guide, role tags for players, and the large lock countdown card. It adds a Submit list button, a Your games block on Home, and a phone menu. The Players page shows only who has a list in until lists lock. The rules in the stories are unchanged: disputes, submissions and their log, pool-change flags and the lock date all stay. The full list is on [design.md](design.md#changed-from-the-stories). This supersedes the story text it names, for the screens only.
- **Consequence:** The stories are not edited. A builder reads the design for what to show and the stories for what must be true. Three points wait for Will: whether disputes stay, whether ranked lists stay hidden until lock, and the countdown line.

## 25. Access is a whitelist of Discord user IDs

- **Date:** 2026-11-26
- **Context:** Will first wanted login-only, then public reading with a Discord server check ([13](#13-reading-is-open-to-everyone-and-writing-needs-a-discord-sign-in), [14](#14-sign-in-needs-discord-server-membership-and-no-bot-token)), and in between considered personal invite links and codes. He has now decided on a whitelist of Discord user IDs. He knows he has to gather the IDs, using Discord's developer mode.
- **Decision:** The admin enters each person's Discord user ID ahead of time, with an optional name label. There is one shared season link, which is the site address; it carries no code and is not secret. A Discord sign-in whose user ID is on the whitelist becomes a viewer. Any other sign-in sees only a "not invited" message and no league data. A visitor who has not signed in sees only the sign-in page. Every read and write is checked against the whitelist in the database, so removing an ID cuts off that person at once, including from an open session. There are no per-person codes and no Discord server check. This supersedes 13, which made reading public, and 14, which gated on server membership, and it replaces the gating in the plan's Join section. It leaves [15](#15-joining-is-a-button-that-lands-on-the-waitlist) in place: a whitelisted viewer still clicks Join league and lands on the waitlist. It also leaves the roles in [17](#17-permissions-come-from-four-app-roles) in place, with viewer now meaning whitelisted and signed in.
- **Consequence:** The site is private to the people Will lists, spectators and pick'em players included, so each spectator needs an ID entered. Sign-in asks Discord for the identity scope only; there is no bot, no bot token and no server ID to configure. A whitelist entry whose ID matches a seeded roster name links that name to the account at first sign-in, so the seed's players need no manual link. Gathering IDs is manual work for Will, and the setup page explains how to copy one. The first admin is the ID entered by the seed.

## 24. Features cut from v1 after the stories review

- **Date:** 2026-11-26
- **Context:** Will asked for the stories to be reviewed and fluff cut. Several plan features no longer earn their place once the bot token, the repo export and the separate pairing run are gone.
- **Decision:** Cut from v1: the `/result` and `/mypairings` slash commands and the channel posts (supersedes [11](#11-discord-app-http-slash-commands-and-channel-posts-in-v1-built-last)); the season archive page and season switcher (supersedes the UI half of [8](#8-seasons-are-in-the-data-model-the-ui-shows-the-current-one); the data model keeps `season_id`); the stale-draft guard (supersedes the last sentence of [9](#9-faction-lists-lock-at-a-fixed-deadline-enforced-automatically)); the Export page for `preferences.json`, `pairings.md` and `roster.md`, replaced by CSV in [23](#23-the-admin-fix-it-screen-and-csv-replace-the-repo-export); the Discord role gate; the separate Player page; the recent-results block on Home; the pairings filters by player and map, replaced by Mine, All, Completed and Upcoming; Copy roster when creating a season.
- **Consequence:** Less to build and keep in step. A dispute alert is a banner on the admin pages, not a Discord post. Anything cut can return as its own ticket.

## 23. The admin fix-it screen and CSV replace the repo export

- **Date:** 2026-11-26
- **Context:** Will wants one place where the admin can edit any data on the fly, and wants CSV rather than repo-format files for moving data in and out. [Decision 2](#2-the-database-is-live-the-repo-gets-exported-snapshots) had the admin export three repo files for committing.
- **Decision:** A Fix it screen lets the admin edit any table's data, with a warning where an edit breaks a pairing rule and the change always allowed. Every edit is written to the append-only log with who made it. CSV export covers faction picks and the whole league state, and the whole league state can be imported back after a preview of what will change. Pairings are not imported; the seat layouts are hardcoded ([21](#21-seat-layouts-are-hardcoded-and-factions-are-assigned-in-the-app)). The database stays the source of truth and the sync direction in decision 2 stays one way. The repo files are a one-time seed.
- **Consequence:** Anything wrong can be mended in the browser. Anyone wanting the old repo files builds them from the CSV. The Python tool's input format is no longer produced by the site.

## 22. Faction info and league info come from the repo

- **Date:** 2026-11-26
- **Context:** Players need a short reference when ranking factions and a place to read the league rules. The plan's Rules page only linked out to GitHub.
- **Decision:** Each faction on the list screen shows its name, type and reach from the faction data file, plus a link to its page on the Root Database or the Law of Root. No summary text is written. The League info section renders `league/format.md`, `league/pairing-rules.md` and `league/how-pairing-works.md` into the site at build time, so the repo stays the only copy.
- **Consequence:** No text lives in the database or is kept in step by hand. A rule change is a repo commit and a redeploy. Faction links are checked when the faction data file is built.

## 21. Seat layouts are hardcoded and factions are assigned in the app

- **Date:** 2026-11-26
- **Context:** The expensive part of the pairing tool is tables, seats and maps, and it does not depend on factions. Planning [pairing approach](../pairing-approach.md#suggested-approach) already suggests a fixed, checked template with players shuffled into its slots. Will asked for it, for counts of 8, 10 and 12 players and 2, 3 and 4 games each. This supersedes the plan's single pairing run, the table-and-map part of [3](#3-the-python-pairing-tool-is-ported-to-typescript-and-kept-as-the-reference), and the planning decision that 8 players are not planned for, for the site only.
- **Decision:** The site ships one precomputed layout for each valid pair: 8 players with 2, 3 or 4 games, 10 with 2 or 4, 12 with 2, 3 or 4. A layout holds numbered player slots, the table for each game, the turn-order seat of each slot and the map index, and it is made once by the Python tool or an agent and checked by tests against the pairing rules for meetings, seats and maps. The admin picks capacity and games each from the valid pairs; 10 with 3 is not offered. When the admin starts the season, the site assigns player numbers to the league list at random from a stored seed, then runs the faction step in the browser against the fixed layout. Only that step is ported to TypeScript. Before the season starts, players can see the layout with slot numbers and no names.
- **Consequence:** No layout search runs on the site, and nothing is imported. A fixed layout gives the faction step less room than choosing among several layouts. If the faction step cannot satisfy the hard rules, the report names the blocking players and tables, and the admin re-rolls the player numbers with a new seed, changes a list, or both. The 8 players with 3 games layout is not even; the setup screen shows the layout's meeting spread so the admin chooses knowing that.

## 20. One lists lock date, then the admin starts the season

- **Date:** 2026-11-26
- **Context:** Will wanted a date by which pairings and lists must be locked, and pairings generated immediately after. The pairing step needs review and a browser; a server function cannot run it reliably on the free plan.
- **Decision:** The season has one date, the lists lock. The database refuses player list edits after it; the admin can move it. Once it passes, the admin starts the season in one flow: assign player numbers, assign factions, review the report, publish. Publishing starts the season: the league list becomes league players and joining closes. This reaffirms decision 9 for the lock and supersedes its warning about stale pairings, which cannot occur because lists lock before the faction step runs.
- **Consequence:** There is no pairings deadline and no scheduling. The admin dashboard shows "lists locked, season not started" as the prompt to act.

## 19. Anyone signed in can pick winners on games they are not in

- **Date:** 2026-11-26
- **Context:** Will wants a pick'em game, like an NFL pick'em league, open to spectators who sign in with Discord as well as players. It is new and has no earlier decision.
- **Decision:** For each game a person is not seated in, they can pick a first and a second winner. A first pick that is a winner scores 3, a second pick that is a winner scores 1, and the two must be different players. Picks can be made or changed until a result is recorded for the game, which is the lock. Other people's picks stay hidden until the result is recorded. A season pick'em leaderboard ranks everyone who has made picks. There is no money and no stake.
- **Consequence:** Picks made after a game was played but before its result was entered cannot be told from picks made before; the admin can delete a pick on the Fix it screen. A game with several winners scores each pick separately, so one person can score 4. Disputed and void games score nothing until resolved.

## 18. Every seated player submits a result and conflicts go to the admin

- **Date:** 2026-11-26
- **Context:** [Decision 4](#4-players-enter-results-the-admin-can-fix-no-confirmation-step) had one shared result that anyone at the table could overwrite, with no confirmation. Will now wants players to submit and conflicting answers flagged to the admin.
- **Decision:** Each seated player has their own submission, which they can change until the game is settled. The first submission records the result at once, so pick'ems close and standings count it. A later submission with the same winners confirms it. A submission with different winners marks the game Disputed: it counts for nothing, both answers are shown, and the admin is alerted. A player changing their submission to match clears the dispute. The admin can settle a game with a final answer at any time, which stops further player edits until the admin reopens it. Winners are still one or more players seated at the game ([decision 7](#7-results-record-winners-only-and-each-winner-gets-a-full-win)).
- **Consequence:** A mistaken first entry counts until someone disagrees. No game waits on all four players. The append-only log and the admin's edit stay as in decision 4.

## 17. Permissions come from four app roles

- **Date:** 2026-11-26
- **Context:** The plan had a visitor, player and admin permission table enforced in policies. Will wants roles the app tracks itself, so that actions map to permissions and the admin assigns roles.
- **Decision:** Four roles, held in a roles table, each a fixed bundle of permissions defined in code. Viewer: anyone who has signed in. Prospect: anyone who has clicked Join league, on the league list or the waitlist before the season starts. League player: anyone on the league list when the admin starts the season. Admin: Will only for now, and more can be assigned later. An unauthenticated visitor holds no role and can read. The admin assigns and removes roles and moves people between the lists; roles are not editable in the app in v1. This supersedes the plan's permission table and the join step in [6](#6-anyone-in-the-discord-server-can-join-the-admin-curates).
- **Consequence:** Permissions are one table in the stories and one set of checks in the database. Adding a role later is a new bundle, not a rewrite.

## 16. The roster is a league list and a waitlist with a capacity

- **Date:** 2026-11-26
- **Context:** The plan's roster had Confirmed, Possible and Withdrawn. Will describes a league list, a waitlist as protection against too many joiners, and a seat-number setting. In the interview he agreed that "seat numbers" means the league's capacity. The turn-order seats at a table stay pairing output.
- **Decision:** A season has a capacity of 8, 10 or 12 (see [21](#21-seat-layouts-are-hardcoded-and-factions-are-assigned-in-the-app)). The roster has two ordered lists, the league list, which can hold at most the capacity, and the waitlist. Only the admin moves people between them, by dragging. Before the season starts, a prospect sees no difference between the two lists and can set a ranked list on either; only the admin sees which one they are on. The statuses Confirmed, Possible and Withdrawn are dropped. The seed maps Confirmed to the league list and Possible to the waitlist.
- **Consequence:** The league list must hold exactly the capacity before the season can start. A withdrawn player is removed or moved to the waitlist.

## 15. Joining is a button that lands on the waitlist

- **Date:** 2026-11-26
- **Context:** The plan gated self-join on Discord server membership and an optional role. Will first described a season invite link, then personal single-use links, then dropped links: the admin can move people around before the season starts, and that already keeps non-players out of league actions.
- **Decision:** No invite links, codes or approval queue. A signed-in viewer clicks Join league, becomes a prospect and lands at the end of the waitlist. The admin drags them onto the league list. This supersedes the joining part of decision 6; sign-in is gated by [14](#14-sign-in-needs-discord-server-membership-and-no-bot-token).
- **Consequence:** A stranger who is in the Discord server could join the waitlist; they hold no place until the admin moves them. Joining closes when the season starts.

## 14. Sign-in needs Discord server membership and no bot token

- **Date:** 2026-11-26
- **Context:** Will wants only members of his Discord server to sign in, and no bot token. The plan checked membership at join with a bot token ([6](#6-anyone-in-the-discord-server-can-join-the-admin-curates)), and listed the `guilds.members.read` check with the user's own token as its fallback.
- **Decision:** Sign-in asks Discord for the `identify` and `guilds.members.read` scopes. Straight after sign-in an Edge Function receives the provider token, asks Discord for the person's member record in the league's server with that token, and records that they are verified. An account that is not verified holds no role and can only read. The check runs on every sign-in. The server ID is public configuration; there is no bot token and no role check. This supersedes decision 6's membership check and the bot parts of [11](#11-discord-app-http-slash-commands-and-channel-posts-in-v1-built-last).
- **Consequence:** There is no bot to invite and nothing secret to store for sign-in. Leaving the server takes effect at the next sign-in, or when the admin removes the person. The provider token is only available at sign-in, so the check cannot be repeated later without it. The first build commit for it records one run against the real server.

## 13. Reading is open to everyone and writing needs a Discord sign-in

- **Date:** 2026-11-26
- **Context:** The plan made everything public ([5](#5-everything-is-public-including-ranked-lists)). Will first said only authenticated users should see the tool, then said spectators and friends should be able to look at matchups, with writing gated on login.
- **Decision:** Every page reads without login: roster, ranked lists, schedule, pairings, results, standings and the pick'em leaderboard. Everything that writes needs a verified Discord sign-in. This reaffirms decision 5, including public ranked lists, and adds the sign-in requirement for the new pick'em writes.
- **Consequence:** Simple read rules. Spectators see everything players see. Pick'em picks are the exception: they stay hidden until the game's result is recorded ([19](#19-anyone-signed-in-can-pick-winners-on-games-they-are-not-in)).

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
