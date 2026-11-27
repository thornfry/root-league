# Website Decisions

Decisions for the league website, newest first, in a short ADR form. All were made in the planning interview on 2026-11-26. The plan they shape is [plan.md](plan.md). League-wide decisions are on [planning decisions](../decisions.md).

Entries 13 to 25 come from the user stories review on 2026-11-26, and entry 26 from the design review the same day. Each names the decision it supersedes or reaffirms; the old entries and the [plan](plan.md) are left as they were. The stories are in [user-stories.md](user-stories.md).

## 26. The approved design amends the story screens

- **Date:** 2026-11-26
- **Context:** Will reviewed the design canvas ([design.md](design.md)) with comments and approved it. Several screens differ from the stories: they are simpler than the stories describe.
- **Decision:** The canvas is the source of truth for screens. It drops the Join page and the queue place (Join league goes straight to faction picking), the per-player answer list and confirmation counts on a game, the badge reading guide, role tags for players, and the large lock countdown card. It adds a Submit list button, a Your games block on Home, and a phone menu. The Players page shows only who has a list in until lists lock. The rules in the stories are unchanged: disputes, submissions and their log, pool-change flags and the lock date all stay. The full list is on [design.md](design.md#changed-from-the-stories). This supersedes the story text it names, for the screens only.
- **Consequence:** The stories are not edited. A builder reads the design for what to show and the stories for what must be true. Three points wait for Will: whether disputes stay, whether ranked lists stay hidden until lock, and the countdown line.

Entries 26 to 28 come from the review of the first clickable prototype. They are added above the older entries, which are left as they were.

## 28. A result is ticked winners and Submit, with no confirmation counts

- **Date:** 2026-11-26
- **Context:** Story 9 and [18](#18-every-seated-player-submits-a-result-and-conflicts-go-to-the-admin) had each seated player's answer listed on the game page and a count of how many players had confirmed. Will does not want that on the page.
- **Decision:** The game page shows the winners to tick and a Submit button. After submitting, the same place shows the recorded winners and an Edit result button, until the admin settles the game. The page has no list of what each player answered and no confirmation count. A dispute still exists, and only when another seated player submits different winners. The page then says the game is disputed and the admin will decide. The admin sees both answers and resolves it on the Disputes page, and the admin dashboard shows a banner while any dispute is open. This supersedes the parts of story 9 and decision 18 that show per-player answers and confirmation counts. The rest of 18 stands: the first submission records the result, a matching submission changes nothing, a different one disputes, and the admin can settle at any time.
- **Consequence:** A player cannot see who has answered or how, so there is nothing to compare or argue about at the table. The history of submissions stays in the append-only log and on the admin's Disputes page.

## 27. The badge guide is removed from the league info pages

- **Date:** 2026-11-26
- **Context:** Story 4 listed a badge reading guide for type and reach beside the league info pages, as in the first prototype. The badges are already labelled in words, such as Militant, Insurgent and Reach 8.
- **Decision:** No badge guide appears on any league info page. The pages show only the rendered repo text ([22](#22-faction-info-and-league-info-come-from-the-repo)). This supersedes the badge-guide line in story 4.
- **Consequence:** One less block to keep in step with the badge styles. If players turn out to need it, it returns as its own ticket.

## 26. Joining lands on the faction-list screen with no queue place

- **Date:** 2026-11-26
- **Context:** Story 2 and [16](#16-the-roster-is-a-league-list-and-a-waitlist-with-a-capacity) have a joiner learn their place on the waitlist. A prospect is not supposed to see a difference between the league list and the waitlist ([15](#15-joining-is-a-button-that-lands-on-the-waitlist)), and a place number says otherwise.
- **Decision:** Join league goes straight to the faction-list screen, titled "You're on the list!". No queue place, waitlist position or league-list/waitlist label appears anywhere a prospect or league player can see, including Home, My list and Players. Only the admin sees which list a person is on, on the Roster page. This supersedes the queue-place part of story 2 and the place shown after joining. Decisions 15 and 16 otherwise stand: joining adds the person to the end of the waitlist, and only the admin moves people.
- **Consequence:** A prospect cannot tell whether they are in or waiting until the admin starts the season. Anyone asking is told to ask the admin.

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
