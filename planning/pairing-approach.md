# Pairing Approach

Working notes on how to build pairings that meet the [pairing rules](../league/pairing-rules.md), and what each player count allows. The tool as built is described for players on [how pairing works](../league/how-pairing-works.md).

## Suggested approach

Two steps, in order:

1. **Tables and seats first.** Pick who plays at each table and in which seat, using meeting evenness, seats and maps only. This step knows nothing about factions. For a given player count it can be a fixed template, checked once, with players shuffled into its slots.
2. **Factions second, table by table.** With the tables fixed, choose each table's factions from the players' lists. The only links between tables are that a player never repeats a faction. Seat order can serve as a tiebreak between equally good choices (rule not yet picked; see [open questions](open-questions.md#still-open-every-season)).

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
