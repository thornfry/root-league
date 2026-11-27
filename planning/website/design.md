# Website Design

The visual and flow design for the league website, approved by Will on 2026-11-26. It is a design canvas, not code. The prototype and the site are built from it. It sits on top of the [user stories](user-stories.md) and the [plan](plan.md), which are unchanged; where the design differs from the stories, the difference is listed under [Changed from the stories](#changed-from-the-stories) and recorded as [decision 26](decisions.md#26-the-approved-design-amends-the-story-screens).

- **Canvas:** https://claude.ai/artifact/LPSGY8KzUZDpCWFzHNxNBz (owned by Will, three pages: Player flows, Admin flows, Foundations). Artboard names below are the canvas file names.
- **Look:** forest-green header band; Barlow Condensed for titles and numbers, Inter for text; a seal of initials and name for each of the 13 factions; shared status colours (green winner or valid, amber pending or disputed, clay void or militant, slate insurgent). Colour is never the only signal: every status has a word, and most have an icon. Text meets 4.5:1. The Foundations board has the tokens, controls, tags and navigation.
- **Data on the canvas:** roster names, ranked lists, factions and the 12-player, 4-game sample layout are real, from `season-1/` and `planning/season-1/`. Results, picks, points, dates, seeds and Discord IDs are placeholders, marked on the boards.

## Artboards by flow

**Player flows** (phone first)

| Flow | Artboards |
|---|---|
| Signup | `Landing` (signed-out gate), `DiscordConsent` (mock), `NotInvited`, `ViewerHome`, `JoinedQueue` (now "on the list, pick factions"), `MenuOpen` |
| My season | `ProspectHome`, `MyListPhone` (open), `MyListLocked`, `HomePhone` (league player), `PlayersPhone` (lists open), `PlayersLocked` |
| League info | `LeagueInfo` (desktop), `LeagueInfoPhone` |
| Pairings and results | `PairingsPre` (layout, no names), `PairingsPhone` (Mine), `GamePhone` (submit), `GameRecorded`, `GameDisputed` |
| Pick'ems | `PicksGameOpen`, `PicksGameRevealed`, `PicksPhone` (my picks and leaderboard) |
| Desktop | `Home`, `Pairings` (All) |

**Admin flows** (desktop, Fix it also on phone)

| Flow | Artboards |
|---|---|
| Invite and set up | `Whitelist`, `SeasonSetup`, `Roster` |
| Start season | `AdminDashboard`, `StartSeason` (draft ready), `StartSeasonFailed` (blocked, re-roll) |
| During the season | `Disputes`, `FixIt`, `FixItPhone`, `Csv` |

**Foundations:** `Main`.

The main player path is wired as a prototype: `Landing`, `DiscordConsent`, `ViewerHome`, `JoinedQueue`, `MyListPhone`, `PairingsPre`, `PairingsPhone`, `GamePhone`.

## Changed from the stories

Where a story and the design differ, the design is what Will approved for the screens. The rules behind the screens stay as the stories state them unless a row says otherwise.

| Story | Design |
|---|---|
| 2: Join league shows the place in the queue | No Join page and no queue place. Join league on Home goes straight to the faction-picking screen, headed "You're on the list". The waitlist is invisible to the player, as decision 16 already says |
| 9: the game shows how many seated players confirmed; each player's submission is listed | The game page shows the result and the history only. No confirmation counts and no per-player answer list. Submitting records the result; an Edit result button follows. Submissions are still stored and logged |
| 9: a differing submission marks the game Disputed | Kept. A game is disputed only when two seated players enter different winners. See open items |
| 3: every whitelisted person sees ranked lists from the moment they are saved | Players page, lists open: names only, with "List in" or "Waiting". Ranked lists show once lists lock. See open items |
| 3: a pool change flags the list as needing attention | The flagged row and banner are not drawn. The rule stands; the build still flags an affected list |
| 3 and 6: lock date and countdown on My list | One muted line under the title ("Locks in 9d 08h" and the date with the time zone). The large countdown card is gone |
| 3: a list must reach the minimum before it counts as Submitted | My list has a Submit list button at the top and in the bottom bar. Prospect Home warns "Not submitted yet" |
| 4: a badge reading guide sits beside the League info pages | Cut. League info is the three rendered pages only |
| 11: roles shown | Role tags are not shown to players. Only the admin sees an Admin tag |
| Home: next game, recent results | "Your games": the player's own tables, each with its result or an Enter result button |
| Navigation | Phone shows the brand and a menu button; the menu lists every page. Desktop keeps the top bar plus an admin bar. Admin group adds a Dashboard link |

## Open items for Will

- **Disputes.** Kept as the stories say. Dropping them would change story 9 and decision 18.
- **Lists hidden until lock.** The Players page hides ranked lists until lists lock, which differs from story 3 and decisions 5 and 25. Confirm this is intended, or the Players page shows lists as soon as they are saved.
- **Countdown line.** Story 3 requires the lock date; the design keeps it as one muted line.
- **Story 4.** The badge guide line should be struck when the stories are next edited.

## Build notes

- **Source of truth for screens:** this canvas. Rebuild the prototype and the site screens from it, not from the old prototype file.
- **Stub for Will's setup:** the Discord application and OAuth, the Supabase project and keys, the Railway service, and real Discord IDs. The build uses a local sign-in stand-in with the same whitelist check, and placeholder IDs, so every flow runs without them.
- **Real data:** the seed is `season-1/preferences.json` and `season-1/roster.md`; the seat layouts come from the pairing tool's samples and the hardcoded layouts in decision 21.
