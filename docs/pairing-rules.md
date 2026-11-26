# League Requirements

What the league format and the pairings must satisfy. This is the source of truth to settle before anything is built or reviewed again; earlier tool work was exploratory. Related: [roster](roster.md), [factions](factions.md), [faction picks](faction-picks.md), [faction popularity](faction-popularity.md), [pairings](pairings.md).

## League format

1. **Score is a win.** Other places earn nothing.
2. **Every table has 4 players.**
3. **Player count is ideally divisible by 4.** The [roster](roster.md) is at 12, with 2 of them still possible.
4. **Every player plays 3 or 4 games.** Not picked yet; there is a sample of each: [3 games](sample-pairings-3-games.md) and [4 games](sample-pairings-4-games.md).
5. **A final table is optional.** See [final table](final-table.md) for how a cut to 4 would go.
6. **No Advanced Setup (AdSet).** Factions come from each player's preferred list, through the pairings.
7. **Two games at once is allowed** but not something to optimize for. It is a scheduling detail, not a format rule.
8. **Rounds are a grouping, not a time slot.** Games may be described in rounds, but a round's games need not be played at the same time. So the one-per-table limits (one copy of each faction, one board) apply per table, never per round. Two games in a round can use the same faction or the same board.

## Pairing rules

Roughly in priority order.

1. **Hard rule: factions only from the player's own list.** A player only plays factions from their preferred-factions list.
2. **No repeats, high picks.** Ideally a player never repeats a faction, and gets factions as close to the top of their list as possible.
3. **Even meetings.** Every pair of players meets about the same number of times. No pair sits together every game while other pairs never meet.
4. **Different seat every game.** Each player sits in a different seat in each of their games.
5. **Different map every game.** Each player plays a different map in each of their games.
6. **Table reach at least 21.** This is the Law of Root's recommended sum for 4 players (5.2.1); see [reach](factions.md#reach). Flag any table below it.
7. **Militant and insurgent mix.** Each table has a sensible mix of militant ("red") and insurgent factions.

## Suggested approach

Two steps, in order:

1. **Tables and seats first.** Pick who plays at each table and in which seat, using meeting evenness, seats and maps only. This step knows nothing about factions. For a given player count it can be a fixed template, checked once, with players shuffled into its slots.
2. **Factions second, table by table.** With the tables fixed, choose each table's factions from the players' lists. The only links between tables are that a player never repeats a faction. Seat order can serve as a tiebreak between equally good choices (rule not yet picked).

Rank faction choices on:

- **Faction wants:** how well each player's wants are met, and whether that is roughly even across players.
- **Table reach.**
- **Militant and insurgent mix.**

Choosing one table at a time can do worse than solving all tables together, because early tables claim factions later tables wanted. In one 8-player trial, the worst player ended 2 ranks off their ideal (total 4) table by table, against 1 (total 3) solved together. Compare against a joint solve before trusting it.

## Player counts

Best layouts found for meeting evenness, at 4 players a table. "Most even layout, per player" counts how many opponents each player meets once, twice, and so on.

| Players | Games each | Most even layout, per player | Pairs never meeting | Most times a pair meets |
|---:|---:|---|---:|---:|
| 8 | 2 | 4 players: 6 once, miss 1. The other 4: 1 twice, 4 once, miss 2 | 6 | 2 |
| 8 | 3 | 6 players: 2 twice, 5 once. The other 2: 1 three times, 6 once | 0 | 3 |
| 8 | 3 | 6 players: 2 twice, 5 once. The other 2: 3 twice, 3 once, miss 1 | 1 | 2 |
| 8 | 4 | 5 twice, 2 once | 0 | 2 |
| 10 | 2 | 6 once, miss 3 | 15 | 1 |
| 10 | 3 | Not possible: 30 seats doesn't fill tables of 4 | — | — |
| 10 | 4 | 3 twice, 6 once | 0 | 2 |
| 12 | 2 | 6 once, miss 5 | 30 | 1 |
| 12 | 3 | 9 once, miss 2 | 12 | 1 |
| 12 | 4 | 1 twice, 10 once | 0 | 2 |

- **12 players, 3 games: the best case.** Nobody meets anyone twice, and a final table stays possible.
- **10 players: realistic.** Either 4 games each and no final, or 2 games each and a cut to a final. 3 games each is impossible.
- **8 players: dropped.** It is the most awkward count and not expected. With 3 games each, someone always gets a lopsided schedule.

The 8-player rows at 2 and 3 games come from a randomised search, so they are the best found, not proven best. The rest cannot be beaten.

**10 players, 2 games, cut to 4.** That is 5 tables and 5 wins. If every player at a table is equally likely to win:

| How often | What happened | Cut to 4 |
|---:|---|---|
| 51% | 4 different winners (one won both games) | Clean: all 4 winners go through |
| 43% | 5 different winners, each with 1 win | A tiebreak drops one winner |
| 6% | 3 different winners (two won both) | A tiebreak picks the 4th from 7 players with no wins |

So a tiebreak decides a final seat about half the time. In this format finishing places say more than strength of schedule, because each player meets only 6 opponents.

A repeat-free 2-game layout for 10 exists. Number the 5 tables, then give each of the 10 players a different pair of tables.

## Findings to confirm

Carried over from the earlier analysis. These are findings, not rules, until Will confirms them.

- **Players × games must be a multiple of 4.** With 3 games each, that means a player count divisible by 4, which matches format rule 3. 10 players works only with an even number of games each.
- **Cut ladder, if there is a final:** wins, then strength of schedule, then sum of finishing places, then a random draw. Finishing places would be recorded for tiebreaks only, never as score. Will picked this when the final was required. Check that it still stands now the final is optional.
- **Strength of schedule still earns its place.** At 12 players and 3 games it only reflects the wins of the 2 opponents a player never met, yet it settles over a third of cuts. Dropping it more than doubles the random draws; see [final table](final-table.md).

## Still open

- **Player count:** final roster size (see [roster](roster.md)). 12 for now, with Chuck and Corey still possible.
- **Games each:** 3 or 4.
- **Seat tiebreak for factions:** what seat order should favour when two faction choices are equally good.
- **Final table:** whether to hold one, and if so, the tiebreak order for the cut, how finalists choose seats and factions, and the map. See [final table](final-table.md).
- **Militant and insurgent mix:** what "sensible mix" means at a table. Each faction's type is on [factions](factions.md).
- **Faction pool:** which factions and expansions are owned.
- **Logistics:** deck (standard or Exiles and Partisans), game time cap and the rule when it is hit, drop-out policy, prizes, dates.
