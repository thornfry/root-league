# Root League: Variables

**Earlier eight-player analysis.** The current tentative plan has ten players; see the [verified five-slot schedule](standings.md#tentative-matchups) for its matchup spread. The eight-player calculations below are retained as background, not recalculated ten-player claims.

[Document index](README.md) · [Player guide](player-guide.md)

Internal planning reference: the adjustable parts of the league, how they relate, and what the options look like. Current choices are marked in bold; the reasoning is in [decisions](league-decisions.md). See [implementation](league-implementation.md) for operational details.

## Core variables

| Variable | Symbol | Current value | Notes |
|---|---|---|---|
| Players per game (table size) | T | **4** | Fixed for now. 3-player Root exists but is a different game |
| Players in the league | N | **8** | Originally 6-8 |
| Games per player | g | **4** | |
| Tables running at once | c | **2** | Limited by components and attention |
| Qualifying rounds | Rq | **3** | |
| Final rounds | Rf | **1** | Final plus consolation in the same round |
| Cut size for the final | k | **4** | One full table |
| Score per game | | **Win only** | No points for second, third or fourth place |
| Tiebreakers | | **Strength of schedule**, then last resort (TBD) | |

## Relationships between the variables

- Total games = N x g / T. With N = 8, g = 4, T = 4 that is 8 games.
- Opponent slots per player = g x (T - 1). Here 4 x 3 = 12, against 7 other players, so on average each pair meets 12 / 7, about 1.7 times.
- Average meetings per pair = g x (T - 1) / (N - 1). For every pair to meet the same number of times, this must be a whole number and a suitable schedule must exist.
- Rounds needed = g, when every player plays every round. Rounds are only the same as games per player when there are no byes.
- Table time = total games / c, in slots of one game length. Here 8 / 2 = 4 slots.
- In 3 qualifying rounds, each player has 9 opponent slots but only 7 other players, so every player must repeat at least two opponents. Perfect evenness is impossible at this size.

## Pairing evenness (how often people meet)

Options that make every pair meet exactly the same number of times, with 4-player tables. All were checked by computer except the 16-player one, which is a standard design.

| Players | Games each | Total games | Pair meetings | Notes |
|---|---|---|---|---|
| 7 | 4 | 7 | exactly 2 | Games cannot run at the same time (any two share 2 players) |
| 8 | 7 | 14 | exactly 3 | Two tables per round, 7 rounds. Too long |
| 13 | 4 | 13 | exactly 1 | Games cannot run at the same time |
| 16 | 5 | 20 | exactly 1 | 4 tables per round |
| **8** | **4** | **8** | **uneven** | Best possible: 12 pairs meet once, 12 twice, 4 three times |

For the chosen size, the 4-round schedule searched exhaustively has 12 pairs meeting once, 12 meeting twice and 4 meeting three times, with nobody missing anyone. The 3-round qualifying part is what we use, plus a final stage seeded by results. A 4-round fixed schedule was dropped in favor of the final table.

Pairing-quality knobs for rounds 1-3 (proposals, to confirm when the schedule is generated):

- Minimize how unevenly pairs meet (sum of squared meeting counts).
- Avoid any pair meeting three times.
- Balance seats so players do not repeat a seat where possible.

## Cut and tiebreak behavior

Simulated with equal-skill players and random winners over the 3 qualifying rounds (so only 6 wins are handed out):

- Cut is clean on wins alone: about 36%.
- Cut is clean after the strength-of-schedule tiebreaker: about 64%.
- Most common outcome after 3 rounds is one player on 2 wins and four tied on 1 win, competing for three seats.

Variables that would change this:

- More qualifying rounds (more wins to separate players, but more games per person).
- A smaller or larger cut (for example only the top record).
- A stronger tiebreaker (strength of schedule, then a second-level measure, then a game or draw).

## Table setup variables

| Variable | Options |
|---|---|
| Faction selection | Advanced Setup (AdSet), proposed for every game |
| Faction pool | Base game only, or with expansions (reach minimums apply) |
| Map | Assigned per table in advance, or chosen |
| Deck | Standard or Exiles and Partisans |
| Seat order | Random, rotated, or by standings in the final |
| Faction repeat rule | **No restriction** (confirmed). Players may repeat factions |
| Cross-table bans | Parked for a later iteration. A faction one table does not want to face goes into the other table's pool |
| Time cap per game | About 2 hours, or longer. Rule for hitting the cap |

## Faction and seat balance (why they matter)

From [Root Con 2023](research-notes.md#root-tournaments) (49 games, 5 rounds):

- Faction win rates ranged from 48% (Eyrie Dynasties) down to 10% (Lord of the Hundreds).
- Seats one and four were favored, and only one fifth-seat game win occurred in fourteen five-player games.

With only 4 games per player, faction and seat luck can matter as much as skill, so draft method and seat rotation are the highest-leverage setup variables.

## Logistics variables

- Resource split: two tables at once means two sets of components.
- Session spread: how many sessions the 4 rounds are split across.
- Drop-outs: what happens if someone cannot finish.
- Prizes and recognition: champion, consolation winner.
