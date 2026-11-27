# Website User Stories

The user stories for the league website, refined from Will's eleven flows and a review interview on 2026-11-26. Access follows [decision 25](decisions.md#25-access-is-a-whitelist-of-discord-user-ids), Will's last word on the subject. They sit on top of the approved [plan](plan.md), which is unchanged; where a story differs from the plan, the new decision is in [decisions](decisions.md) and listed under [Changed from the plan](#changed-from-the-plan). Nothing here is a league rule; the rules stay on the [league pages](../../league/).

## Roles and words used

**Roles.** Four app roles, held by the app and assigned by the admin ([decision 17](decisions.md#17-permissions-come-from-four-app-roles)).

| Role | Who | Gets |
|---|---|---|
| Visitor | Not signed in, or signed in with a Discord ID that is not on the whitelist | Nothing but the sign-in page and a "not invited" message |
| Viewer | Signed in with a whitelisted Discord ID | Read everything, pick'ems, Join league |
| Prospect | Clicked Join league; on the league list or the waitlist before the season starts | Viewer rights, plus their own ranked list |
| League player | On the league list when the admin started the season | Prospect rights while lists are open, plus entering results for their own games |
| Admin | Will only for now; more can be assigned later | Everything, including Fix it |

**Words.**

- **Whitelist:** the Discord user IDs the admin has entered, each with an optional name label. Only these accounts get past the gate ([25](decisions.md#25-access-is-a-whitelist-of-discord-user-ids)).
- **Capacity:** how many players the league holds, 8, 10 or 12. Will's "seat numbers" in flow 1.
- **League list and waitlist:** the two ordered roster lists. The league list holds at most the capacity.
- **Player number:** a slot in the season's seat layout, assigned at random when the season starts. Players do not see theirs before then.
- **Seat:** the turn-order position 1 to 4 at a table. Pairing output, not a setting.
- **Game:** one table playing once. Its number is the table number players see.
- **Lists lock:** the one date after which players cannot edit their ranked faction lists.
- **Start season:** the admin's action that assigns player numbers and factions and publishes the pairings.

**Season stages.** Open (joining, lists editable) then Locked (lists frozen, season not started) then Live (pairings published, results being entered). One season is current at a time.

## 1. Invite players

**Story.** As the admin, I whitelist the people I want, share one season link and set how many places the league has, so that the right people can sign up.

**Acceptance criteria**

- A Whitelist page lists each Discord user ID with an optional name label, who added it and when. The admin can add, edit the label of, and remove entries, singly or by pasting many at once.
- An ID must be a Discord user ID (digits only); a duplicate is refused; a bad one names the row.
- The page explains how to find an ID: turn on developer mode in Discord's settings, then right-click the person and choose Copy User ID.
- There is one shared season link, the site address ([25](decisions.md#25-access-is-a-whitelist-of-discord-user-ids)). It carries no code and is not secret; it only works for whitelisted accounts. There are no per-person links, codes or approval queue ([15](decisions.md#15-joining-is-a-button-that-lands-on-the-waitlist)). The Join page has its own address, so the admin can paste one link to it.
- Spectators who should read the site and make pick'ems are whitelisted the same way as players.
- The admin sets the season's name, capacity (8, 10 or 12) and games each on the season setup page.
- Only valid pairs are offered: 8 with 2, 3 or 4 games; 10 with 2 or 4; 12 with 2, 3 or 4. 10 with 3 is not offered and the page says why.
- The setup page shows the chosen layout's meeting spread, so the 8-with-3 case, which is uneven, is chosen knowingly.
- The admin also sets map names (at least as many as games each), the faction pool, the minimum list length and the lists lock date. The site holds no defaults for these.
- Capacity cannot be set below the number of people on the league list; the page asks the admin to move people first.

**States and edge cases**

- A season in Open stage accepts joiners; in Locked and Live it does not.
- Removing a whitelist entry removes access at once, even in an open session. Their roster entry, list and picks stay until the admin removes them.
- Whitelisting someone does not put them on a list; they click Join league. Someone already on the roster from the seed whose ID is whitelisted is linked to their name at first sign-in and is already a prospect.
- Changing capacity or games each after people have joined keeps the roster and changes the layout. After the season starts both are locked; changes go through Fix it.
- Creating a new season makes it current and leaves the old one stored but not shown.

## 2. Player signup

**Story.** As an invited player or spectator, I open the season link, sign in with Discord, and click Join league, so that I can take part.

**Acceptance criteria**

- Opening the site address while signed out shows only a sign-in page.
- Sign in with Discord asks for identity only. The site compares the account's Discord user ID with the whitelist on every request, not just at sign-in ([25](decisions.md#25-access-is-a-whitelist-of-discord-user-ids)).
- A whitelisted account becomes a viewer and sees the current season. Any other account sees only a "not invited" message with the signed-in Discord name, a sign-out button and no league data.
- A viewer sees a Join league button while the season is Open. Clicking it makes them a prospect at the end of the waitlist and shows their place in the queue.
- A prospect can leave before the season starts, which removes them from either list and clears their ranked list.

**States and edge cases**

- Not invited, then added to the whitelist: reloading the page lets them in; no new sign-in is needed.
- Clicking Join league twice does nothing the second time.
- Season Locked or Live: the button is replaced by a note that joining is closed.
- Someone already on the roster from the seed signs in for the first time: their account is linked to the existing name by their whitelisted ID and keeps their list.
- A whitelist entry removed after someone joined: they lose access at once and their roster entry stays until the admin removes it.

## 3. Faction selection

**Story.** As a prospect or league player, I rank factions from the season's pool, so that the pairings give me factions I want.

**Acceptance criteria**

- A prospect on either list, and a league player while lists are open, can add, remove and reorder factions on My list.
- Only factions in the season's pool can be added; each at most once; the list must reach the minimum length before it counts as Submitted.
- Each faction shows its name, type and reach, and a link out to its page on the Root Database or the Law of Root ([22](decisions.md#22-faction-info-and-league-info-come-from-the-repo)). There is no written summary.
- The lock date and a countdown are shown, with the time zone named.
- After the lock the list is read-only for everyone except the admin.
- Every whitelisted signed-in person can see ranked lists from the moment they are saved; the site is not open to anyone else ([25](decisions.md#25-access-is-a-whitelist-of-discord-user-ids)).

**States and edge cases**

- A prospect on the waitlist sees no difference from one on the league list; only the admin sees the placement ([16](decisions.md#16-the-roster-is-a-league-list-and-a-waitlist-with-a-capacity)).
- A pool change by the admin that removes a ranked faction flags that list as needing attention instead of deleting it silently.
- A league-list player with no valid list when the lock passes blocks Start season; the admin fixes it on Fix it.

## 4. League info

**Story.** As a viewer, I read the league's format, pairing rules and how pairing works inside the site.

**Acceptance criteria**

- A League info section has three pages rendered from `league/format.md`, `league/pairing-rules.md` and `league/how-pairing-works.md` at build time ([22](decisions.md#22-faction-info-and-league-info-come-from-the-repo)).
- Links between those files stay working, either inside the site or out to the repo.
- A badge reading guide for type and reach sits beside the pages, as in the prototype.
- No rule text is stored in the database, and no page is editable in the site.

**States and edge cases**

- A rule change is a repo commit and a redeploy. The site shows no version stamp.

## 5. Roster management

**Story.** As the admin, I drag players between the league list and the waitlist, so that too many joiners cannot overfill the league.

**Acceptance criteria**

- The Roster page shows two columns, League list with a count of its capacity (for example 10 of 12) and Waitlist, in join order.
- Dragging a person to the other column moves them; the order within the waitlist can be changed too. Moves are saved at once and written to the log.
- Dropping onto a full league list is refused with a message to move someone off first. A swap is allowed in one move.
- Each row shows the person's display name, whether their ranked list is valid, and their role.
- The admin can add a person by name and remove one; a person added by name needs a whitelisted ID to sign in. Removing a person with picks or a list asks for confirmation.
- Players see no difference between the two lists before the season starts ([16](decisions.md#16-the-roster-is-a-league-list-and-a-waitlist-with-a-capacity)).

**States and edge cases**

- When the season is Live, drag is disabled; replacing a player in a slot is done on Fix it.
- Waitlist empty: the column says so. League list below capacity: the page says how many places are open, and Start season stays off.
- A touch-screen alternative to drag (a move button on each row) is required.

## 6. League start dates

**Story.** As the admin, I set the date by which lists lock, so that pairings can be made from fixed lists.

**Acceptance criteria**

- One date and time is set on season setup, shown to everyone in their local time with the zone named, stored in UTC ([20](decisions.md#20-one-lists-lock-date-then-the-admin-starts-the-season)).
- At the lock time the database refuses player list edits. The admin can edit any list at any time and can move the date.
- After the lock the admin dashboard says "lists locked, season not started" and links to Start season.
- There is no pairings deadline, no signup close date and no scheduling.

**States and edge cases**

- Moving the date earlier than now locks lists at once; moving it later unlocks them while the season has not started.
- After the season starts the date can still be seen but no longer unlocks anything.

## 7. Pairing

**Story.** As the admin, I start the season, so that every player has a complete schedule with factions.

**Acceptance criteria**

- Start season is available once lists are locked, the league list has exactly the capacity, and every league-list player has a valid list. Otherwise it names what is missing.
- The seat layout for the capacity and games each is already fixed in the site ([21](decisions.md#21-seat-layouts-are-hardcoded-and-factions-are-assigned-in-the-app)). Start season assigns player numbers to the league list at random from a seed shown on screen, then assigns factions from the lists in the browser.
- The run keeps the page responsive and shows progress and a cancel.
- The result is a draft, shown with a report: factions given against each player's list, meetings, and any rule that blocked it. Nothing is visible to viewers until the admin publishes.
- If the hard rules cannot be met, the report names the blocking players and tables, and no draft is saved. The admin can re-roll with a new seed, edit a list, or both.
- Publishing makes the pairings visible to every viewer, turns the league-list prospects into league players, leaves the waitlist as prospects, closes joining and opens pick'ems.
- Before the season starts, the Pairings page shows the layout with player numbers and no names, which is all a player can see of it.

**States and edge cases**

- A draft that is discarded can be rerun with a new seed.
- Once any game has a recorded result, the published pairings cannot be replaced without voiding those games on Fix it.
- Same seed and same lists give the same draft, so published pairings can be checked.

## 8. View pairings

**Story.** As a viewer, I see every game with its table number, who sits where, the factions, the map and the result.

**Acceptance criteria**

- The Pairings page lists games with: table number, the four seats with player name and faction, the map, and the result.
- Filters are Mine, All, Completed and Upcoming. All is the default.
- Mine shows the signed-in league player's games; for everyone else it is hidden.
- Completed is games with a counted result; Upcoming is everything else, including Disputed games.
- Each game has a page with its detail, its submissions and pick'em action, and its history.
- Pairings are visible to every viewer, with or without a seat in the league.

**States and edge cases**

- Disputed games show a Disputed tag and both claims, not winners.
- Void games show Void and are in neither Completed nor Upcoming counts.
- Season not yet started: the page shows the layout without names or factions, and says when lists lock.
- A long name or four-faction row wraps cleanly at 375 pixels wide.

## 9. Enter results

**Story.** As a player at a table, I submit who won, so that the standings and pick'ems update; if we disagree, the admin decides.

**Acceptance criteria**

- Any league player seated at a game, and the admin, can submit winners: one or more of the four seated players ([18](decisions.md#18-every-seated-player-submits-a-result-and-conflicts-go-to-the-admin)).
- The first submission records the result at once. Standings count it and pick'ems for that game close.
- A later submission with the same winners adds a confirmation; the game shows how many seated players have confirmed.
- A submission with different winners marks the game Disputed. It counts for nothing, shows both answers, and appears on the admin dashboard and the admin's Disputes list.
- A player can change their own submission until the game is settled. If the submissions then all agree, the game stops being Disputed.
- The admin settles a disputed game by picking an answer or entering a different one. A settled game rejects player edits until the admin reopens it.
- Every submission and change is written to the log with who made it.

**States and edge cases**

- A submission for a winner not seated at the game is refused.
- Non-seated league players, prospects and viewers see the result and cannot change it.
- Pick'em scoring for a game is paused while it is Disputed and recalculated when it is settled.
- A settled or changed result updates standings and pick'em scores.

## 10. Admin fix-it

**Story.** As the admin, I edit any data on the fly, so that a mistake or a change of plans never needs a developer.

**Acceptance criteria**

- A Fix it screen lists the data by area: people and roles, roster and lists, season settings and dates, games with seats and factions, submissions and results, pick'ems.
- Any value can be edited, added or removed, including after the season starts.
- An edit that breaks a pairing rule shows a warning naming the rule; the admin can still save it.
- Every edit is written to the append-only log with who, when, the old value and the new value, and the log is visible on the screen.
- The admin can link a new sign-in to an existing seeded name, replace the person in a player slot, void or unvoid a game, and delete a pick'em pick.
- Only the admin role can open the screen or write any of this ([17](decisions.md#17-permissions-come-from-four-app-roles)).

**States and edge cases**

- Editing a recorded result recalculates standings and pick'em scores.
- Deleting a person removes their picks and submissions after a confirmation that names how many.
- The screen works at phone width, as the admin may fix things at a table.

## 11. Access control

**Story.** As the league, only invited people can see or change anything, and each role can only do its own actions.

**Acceptance criteria**

- Only whitelisted Discord accounts can read or write anything ([25](decisions.md#25-access-is-a-whitelist-of-discord-user-ids)). Anyone else sees only the sign-in page or the "not invited" message.
- Permissions are fixed in code per role and checked in the database on every request, not only in the interface.
- The admin edits the whitelist and assigns and removes the Admin role; the other roles follow from joining, the lists and starting the season.
- Will's ID is the first admin, entered by the seed.

| Action | Visitor | Viewer | Prospect | League player | Admin |
|---|---|---|---|---|---|
| Read everything | no | yes | yes | yes | yes |
| Join league | no | yes, while Open | n/a | n/a | n/a |
| Leave league | no | no | before the season starts | no | yes |
| Edit own ranked list | no | no | until lists lock | until lists lock | any list, any time |
| Make or change a pick'em pick | no | yes | yes | yes, not on own games | yes, not on own games |
| Submit a result | no | no | no | own games | any game |
| Settle a dispute | no | no | no | no | yes |
| Move people between lists | no | no | no | no | yes |
| Set capacity, dates, maps, pool | no | no | no | no | yes |
| Start season, publish pairings | no | no | no | no | yes |
| Edit any data (Fix it) | no | no | no | no | yes |
| Assign roles and edit the whitelist | no | no | no | no | yes |
| Export and import CSV | no | no | no | no | yes |

**States and edge cases**

- A waitlisted prospect who was not moved onto the league list by the season start stays a prospect: no results, but pick'ems and reading continue.
- An admin who also plays, as Will does, follows the same own-game pick'em rule.
- Roles are not editable in v1; a custom role would be a code change.

## 12. Pick'ems (new)

**Story.** As a viewer, prospect or league player, I pick who will win each game I am not in, so that I can follow the league and compete with friends.

**Acceptance criteria**

- Open to every whitelisted account from when pairings are published, on every game I am not seated in ([19](decisions.md#19-anyone-signed-in-can-pick-winners-on-games-they-are-not-in)). Spectators are whitelisted like players.
- I pick a first pick and may pick a second pick; the two must be different players at that table.
- A first pick that is a winner scores 3 and a second pick that is a winner scores 1. A game with several winners scores each pick separately.
- Picks can be made and changed until the game has a recorded result. Then they close.
- Other people's picks are hidden until the result is recorded, then shown on the game page.
- A season pick'em leaderboard shows points per person, with ties sharing a rank, and is visible to every viewer.
- My picks page shows my picks, open games and my score.

**States and edge cases**

- League players cannot pick in their own games; the control is absent, not disabled without a reason.
- Disputed and void games score nothing until a result is settled or the game is unvoided.
- A pick made after the table played but before the result was entered cannot be detected; the admin can delete it on Fix it.
- A person with no picks is not on the leaderboard.

## 13. Import and export

**Story.** As the admin, I export faction picks and the league's state as CSV, and import state back, so that I can inspect, share or edit the league in bulk.

**Acceptance criteria**

- Export faction picks: one CSV with one row per player and columns for each rank.
- Export league state: a set of CSV files, one per area (people, roster, lists, season settings, games, seats, submissions, results, pick'ems, log), downloaded together.
- Import league state: the admin chooses the files, the site shows a preview of what will change, and nothing is written until the admin confirms ([23](decisions.md#23-the-admin-fix-it-screen-and-csv-replace-the-repo-export)).
- An import that fails validation writes nothing and names the file, row and column.
- Exporting then importing unchanged data changes nothing.
- Pairings are not imported; they come from the fixed layouts.

**States and edge cases**

- Imports are written to the log as one entry with the file names.
- An import after the season starts is allowed and warns about the games and results it would change.

## Standings

Kept from the plan, outside Will's list. Every viewer sees wins, games played and games left per player for the current season, plus the pick'em leaderboard, on the Home page. Standings count recorded and settled results and ignore disputed and void games.

## Cut from v1

Each is in [decision 24](decisions.md#24-features-cut-from-v1-after-the-stories-review) unless noted.

- **Slash commands** `/result` and `/mypairings`, and the interactions endpoint.
- **Channel posts** for published pairings and entered results. A dispute alert is an admin banner.
- **Discord bot token**, the bot in the server, the server-membership check and the optional role gate. Access is the whitelist ([25](decisions.md#25-access-is-a-whitelist-of-discord-user-ids)).
- **Public read-only mode** for signed-out visitors.
- **Invite links, per-person codes and an approval queue.**
- **Season archive page and season switcher.** One current season shows; the database keeps `season_id`.
- **Stale-draft guard.** Lists lock before the faction step runs, so a draft cannot go stale.
- **Export of repo files** (`preferences.json`, `pairings.md`, `roster.md`), replaced by CSV.
- **The in-browser table and map search.** Seat layouts are hardcoded; only factions are assigned in the site ([21](decisions.md#21-seat-layouts-are-hardcoded-and-factions-are-assigned-in-the-app)).
- **Roster statuses** Confirmed, Possible and Withdrawn ([16](decisions.md#16-the-roster-is-a-league-list-and-a-waitlist-with-a-capacity)).
- **Separate Player page**, recent results on Home, and pairings filters by player and map. The Players page shows each list, and the Mine, Completed and Upcoming filters cover the rest.
- **Copy roster** when creating a season.
- **Written faction summaries.** Links only.

## Changed from the plan

The plan is not edited. Each item names the plan text it replaces and the new decision.

| Plan | Now | Decision |
|---|---|---|
| Everything public, no login; join gated on server membership and an optional role, checked with a bot token | A whitelist of Discord user IDs gates every read and write; one shared season link; no server check, no bot token, no public mode | [25](decisions.md#25-access-is-a-whitelist-of-discord-user-ids), superseding [13](decisions.md#13-reading-is-open-to-everyone-and-writing-needs-a-discord-sign-in) and [14](decisions.md#14-sign-in-needs-discord-server-membership-and-no-bot-token) |
| Joiners start as Possible; the admin confirms | Join league lands on the waitlist; the admin drags to the league list | [15](decisions.md#15-joining-is-a-button-that-lands-on-the-waitlist) |
| Roster statuses Confirmed, Possible, Withdrawn | League list and waitlist with a capacity | [16](decisions.md#16-the-roster-is-a-league-list-and-a-waitlist-with-a-capacity) |
| Visitor, player and admin permission table | Viewer, prospect, league player and admin roles | [17](decisions.md#17-permissions-come-from-four-app-roles) |
| Any player at a table can overwrite the result; no confirmation | Every seated player submits; first records; a differing entry flags a dispute | [18](decisions.md#18-every-seated-player-submits-a-result-and-conflicts-go-to-the-admin) |
| No pick'ems | Pick'ems with a leaderboard | [19](decisions.md#19-anyone-signed-in-can-pick-winners-on-games-they-are-not-in) |
| A lists deadline, a draft marked stale if lists change | One lock date; the admin starts the season; no stale guard | [20](decisions.md#20-one-lists-lock-date-then-the-admin-starts-the-season) |
| One pairing run in a worker covering tables, factions and seats; 8 players not planned for | Hardcoded layouts for 8, 10 and 12 players; player numbers random at start; factions assigned in the browser | [21](decisions.md#21-seat-layouts-are-hardcoded-and-factions-are-assigned-in-the-app) |
| Rules page linking to GitHub; no faction help | League info rendered from the repo; faction links out | [22](decisions.md#22-faction-info-and-league-info-come-from-the-repo) |
| Export page for three repo files; admin pages for roster, season, results | Fix it screen and CSV export and import | [23](decisions.md#23-the-admin-fix-it-screen-and-csv-replace-the-repo-export) |
| Slash commands, channel posts, season archive and switcher, Player page, Copy roster | Cut | [24](decisions.md#24-features-cut-from-v1-after-the-stories-review) |

The plan's build commits change as follows. This is a note for whoever rewrites the commit list; the plan stays as it is.

- **A3** (tables and maps) is replaced by the hardcoded layouts and the tests that check them.
- **A4** (factions) stays, running on the fixed layout, and is the only pairing code the site runs.
- **A5** (seats and report) is reduced to the check and the report; seats come with the layout.
- **A10** (join function) becomes the whitelist check, enforced in the database, the Whitelist page and the Join league action.
- **A16** (export) becomes CSV export and import.
- **Group B** (Discord app) is dropped except for the setup documentation.
- **New:** pick'ems, the dispute flow, role checks and the Fix it screen.

## Prototype changes

The rebuilt prototype is designed from the design canvas, not by editing the current file. This is what it must add, change and remove, so a later agent can rebuild it from the canvas.

**Add**

- Personas: signed-out visitor, Discord user not on the whitelist, whitelisted viewer, prospect on the league list, prospect on the waitlist, league player, admin.
- A Whitelist page for the admin, with add, paste many, edit label, remove, and a short how-to for copying a Discord ID.
- A "not invited" page for signed-in accounts that are not whitelisted, and a sign-in-only page for visitors.
- Join league button on Home and a Join page, with queue position after clicking and a Leave button.
- A pick'ems area: pick controls on each game page (first and second pick), My picks, and a Leaderboard page.
- Per-player result submissions on the game page, with confirmation counts, a Disputed state showing both answers, and the admin's Disputes list and dashboard banner.
- A Roster board with League list and Waitlist columns, drag and a move button, capacity count and a refused-drop message.
- Season setup with capacity, games each limited to valid pairs, the layout's meeting spread, maps, pool, minimum list length and the lists lock date.
- A Start season flow: preconditions checklist, seed and re-roll, progress, draft report, publish.
- A pre-start Pairings view showing the layout with player numbers and no names.
- Pairings filters Mine, All, Completed and Upcoming.
- A League info section with three rendered pages.
- Faction links on My list.
- A Fix it screen with an edit log and rule warnings.
- A CSV page for faction picks export and league state export and import with a change preview.
- Admin role assignment on the Whitelist page.

**Change**

- Sign-in: the mock Discord screen asks for identity only, and the site shows the whitelisted and not-invited outcomes.
- My list: open to prospects on either list and to league players until the lock, with the lock date and countdown.
- Game page: the single result form becomes each seated player's submission plus the admin's settle control.
- Home: standings and the pick'em leaderboard; Join league for viewers.
- Pairing: becomes one Start season flow; the stale chip is removed.
- Navigation: Home, Players, Pairings, Pick'ems, League info; the admin group becomes Whitelist, Roster, Season, Start season, Disputes, Fix it, CSV.

**Remove**

- Seasons page and season switcher.
- Export page for repo files.
- Roster statuses Confirmed, Possible and Withdrawn and their chips.
- Server-role-required toggle, the not-in-the-server and no-role personas, and any public read-only view for signed-out visitors.
- The mock Discord client panel with slash commands, and any channel-post preview.
- The in-page tables-and-maps run progress and the stale draft chip.
- The separate Player page, recent results block and Copy roster.
