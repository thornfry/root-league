# Pairing Rules

What the pairing tool must satisfy, what follows from those rules, and how the league ends. Related: [faction picks](faction-picks.md), [pairings](pairings.md).

## Baseline requirements

Will's rules, as given.

1. **Ranked faction picks.** Every player submits ranked picks (five requested, more accepted). Tables and factions are built so players play factions from their list as often as possible, preferring higher picks. Montreal's 2023 tournament also built tables from players' favourite factions.
2. **No faction repeats per player.** A player never plays the same faction twice. Different players may play the same faction. (Will confirmed this reading.)
3. **Every pair meets within one.** The most any pair meets minus the fewest is at most 1, and nobody meets the same opponent in every game.
4. **Different maps.** Will owns 4 maps. Each player plays each map once where possible.
5. **No seat twice.** Nobody holds the same seat (turn order) twice.
6. **One game at a time.** The schedule is a plain list of games. Nobody sits out a time slot, and there are no same-slot faction clashes to manage.
7. **Four-player tables.**
8. **Win-only scoring.** A win is the only score. Dominance and Vagabond coalition wins count as wins. Finishing places are recorded for the cut tiebreak only (see [finals format](#finals-format)).

## Derived requirements

Found while building and testing the tool.

- **Players x games must be divisible by 4.** Games = players x games each / 4. At 10 players, 2, 4, 6 or 8 games each work; at 12 players any count works. Ten players at 3 games each cannot fill the tables.
- **Meeting counts.** Each player has 3 x games opponent seats. At 12 players and 4 games that is 12 seats over 11 opponents: ten opponents once and one twice (60 pairs once, 6 twice). At 10 players and 4 games it is 12 seats over 9 opponents: six once and three twice (30 pairs once, 15 twice). Both are the best possible and spread one is achievable.
- **Perfect maps need players divisible by 4.** With 4 games and 4 maps, each map's games must seat every player once, so each map has players / 4 games: 3 games per map at 12 players. At 10 players the games split 3, 3, 2, 2 across the maps, so two maps have 12 seats for 10 players, forcing at least 4 repeat map plays. The search found 6 and the repeats were not evenly spread. Whether 4 or 5 is reachable is unproven.
- **At 12 players, perfect maps and spread one conflict.** An exhaustive search over every schedule where each map is a split of all 12 players into three tables found none with spread one. The best found has 12 pairs never meeting (spread two). Spread one with the fewest map repeats found has 9 repeat plays. This is a real trade-off ([still open](#still-open)). Not checked: 3 games each at 12 players.
- **Seats always work at 4 games or fewer.** A player-game graph where every player has at most 4 games edge-colours into 4 seats (König's theorem), so each seat once is exact, for any set of tables. More than 4 games cannot give a different seat every game.
- **One Vagabond per table.** Two Vagabonds at one table are not allowed. With one table at a time, owning two copies no longer matters.
- **Table reach of at least 17.** Reach per faction from the Law of Root (setup, section 5.2.2; 17 is the "adventurous" minimum): Marquise de Cat 10, Lord of the Hundreds 9, Keepers in Iron 8, Underground Duchy 8, Lilypad Diaspora 7, Eyrie Dynasties 7, Vagabond 5, Riverfolk Company 5, Knaves of the Deepwood 4, Twilight Council 4, Woodland Alliance 3, Corvid Conspiracy 3, Lizard Cult 2.
- **Off-list factions are a last resort.** If a player's picks cannot cover their games, the tool may assign an unlisted faction and reports it. Short lists (fewer picks than games) are the usual cause.
- **Conflicts are settled fairest first.** In order: fewest off-list plays, then the smallest gap for the worst-off player, then the smallest total gap, each measured against a player getting picks 1 to g.

## Finals format

Decided by Will, with the player count still open ([see below](#still-open)).

- **12 players, 4 qualifying games each, one game at a time.** That is 12 qualifying games, then a single final: 13 games, about 26 hours at about 2 hours a game. Ten players at 4 games (11 games) and twelve at 3 games (10 games) were compared and not chosen. Four games also line up with 4 maps and 4 seats.
- **The top 4 by qualifying record play one final game, with no consolation game.** The winner is the champion. The other 8 finish after their 4 games.
- **Cut tiebreaks, in order:** wins; then strength of schedule (the qualifying wins of everyone you sat with, counted once per shared game); then finishing places (the sum of a player's places across qualifying games, lower ranks higher); then a random draw.
- **Finishing places** (1st to 4th) are recorded for every qualifying game, for the tiebreak only. They never count as score.

### What records to expect

Equal-skill players with random results, 50,000 simulated leagues, 12 players and 4 games each ([`tools/cut_sim.py`](../tools/cut_sim.py)). The Swiss triangle: how many players end on each record, and whether that record makes the final.

| Wins | Expected players | Makes the final |
|---:|---:|---:|
| 4 | 0.05 | always |
| 3 | 0.56 | always |
| 2 | 2.53 | 98% |
| 1 | 5.07 | 18% |
| 0 | 3.80 | never |

Two wins is the practical target. One win reaches the final about one time in five, and only through tiebreaks.

How often each level is the first to settle all four final seats:

| Wins alone | Strength of schedule | Finishing places | Random draw |
|---:|---:|---:|---:|
| 28% | 34% | 27% | 10% |

When strength of schedule leaves a tie, it is mostly 2 players for 1 seat (16% of leagues) or 4 for 1 seat (8%). Strength of schedule separates little because pairings are so even: between two players on the same record, it only compares how well each one's single repeat opponent did. That is why finishing places carry most of the remaining tiebreak work. A sudden-death tiebreak game was rejected: it needs a full 4-player table and would add about 2 hours in 38% of leagues.

## Still open

Not resolved here.

- **Maps vs even meetings at 12 players.** Perfect maps with spread two (12 pairs never meet), or spread one with about 9 repeat map plays.
- **Player count.** Ten are confirmed and four are possible. Will leans towards a count divisible by 4 (8 or 12; 12 preferred, 8 is also clean) if that makes things much easier, but the decision is deferred. The finals format above assumes 12. At 10 players, maps cannot be perfect and the cut analysis differs ([`tools/cut_sim.py`](../tools/cut_sim.py) covers 10 players at 4 games).

Other items carried over from the earlier planning notes:

- Faction pool: which factions and expansions are owned. The tool allows the 13 in the reach table.
- Seat and faction for the final: proposed that finalists pick in standings order. Not decided.
- Deck (standard or Exiles and Partisans), game time cap and the rule when it is hit, drop-out policy, prizes, dates, and game order (nobody should play two games in a row; the tool does not model order).

## The tool

`python3 tools/pairing/league_pairing.py <preferences.json> --games 4`, tests with `python3 -m unittest` in `tools/pairing` (`SLOW=1` adds the 10- and 12-player solves). Standard library only.

It works in stages: build the games and maps by annealing, assign factions to the best few candidate schedules, then assign seats exactly. Known gaps: it is a heuristic, so results are checked against the hard rules but not proven optimal (only the two exhaustive checks above are); tables are fixed before factions, so a table of three players who all want one faction is not avoided up front; and a full run takes 30 to 40 seconds.

Other files in `tools/`: `cut_sim.py` is the finals simulation (`python3 tools/cut_sim.py --runs 50000 --json out.json`, about 10 minutes); `finals_results_50k.txt` and `.json` are its saved output, which the numbers above come from; `finals_chart.py` turns the JSON into a small chart (`python3 tools/finals_chart.py tools/finals_results_50k.json chart.html`); `two_table_exhaustive_check.py` proves that with two tables at once, 10 players at 4 games cannot have every pair meeting once or twice, and only matters if two tables come back. The simulation does not model maps, seats, factions or drop-outs.

`tools/pairing/mock_preferences_FAKE.json` and `mock12_preferences_FAKE.json` are fixtures for trying it. Alex, Will, Matt and David are real lists and Kira's first two picks are real; everything else in them is invented.
