# Final Table

What a cut to a 4-player final table looks like at 12 players, for 3 games each ([sample](sample-pairings-3-games.md)) and 4 games each ([sample](sample-pairings-4-games.md)).

## Assumptions

- **Score is a win.** Other places earn nothing toward the cut, except as a tiebreak.
- **Everyone is equally likely to win.** Each player at a table has a 1 in 4 chance. Real skill gaps will change the numbers, but not the overall picture.
- **The cut is the top 4 by wins.** A tiebreak fills any seats a group of tied players is competing for.
- **The tiebreak ladder** carried over from earlier planning: wins, then strength of schedule (total wins of the opponents played), then sum of finishing places (lower is better), then a random draw.

The 3-game odds of wins alone come from every possible set of 9 winners on the sample layout (4^9 = 262,144 outcomes). Everything else comes from 200,000 simulated leagues with random finishing places.

## Side by side

| | 3 games | 4 games |
|---|---:|---:|
| Games, and so wins handed out | 9 | 12 |
| Different winners, usually | 6 to 8 | 7 to 9 |
| Wins alone decide the cut | 1% | 29% |
| Strength of schedule decides it | 37% | 34% |
| Finishing places decide it | 41% | 27% |
| Random draw decides it | 21% | 10% |
| Random draw, if strength of schedule is dropped | 47% | 28% |

With 4 games, a clean cut on wins is about 1 league in 3, and a random draw drops to 1 in 10.

## 3 games: wins alone almost never settle it

9 wins over 12 players. Only the players with 2 or more wins are clearly in. The rest of the seats go to a pile of 1-win players.

| How often | Win counts, highest first | Clearly in | Seats left | Tied for them, on 1 win |
|---:|---|---:|---:|---:|
| 38% | 2, 2, then five players on 1 | 2 | 2 | 5 |
| 23% | 2, then seven players on 1 | 1 | 3 | 7 |
| 16% | 2, 2, 2, then three players on 1 | 3 | 1 | 3 |
| 10% | 3, 2, then four players on 1 | 2 | 2 | 4 |
| 5% | 3, then six players on 1 | 1 | 3 | 6 |
| 3% | nine players on 1 | 0 | 4 | 9 |
| 3% | 3, 2, 2, then two players on 1 | 3 | 1 | 2 |
| 1% | 2, 2, 2, 2, then one player on 1 | 4 | 0 | — |

Every player meets 9 of the 11 others once, so strength of schedule only reflects the wins of the 2 opponents a player never met. That small difference still breaks over a third of the ties, because a big group tied on 1 win rarely has identical schedules.

## 4 games: often clean, otherwise one seat

12 wins over 12 players. Most leagues have 3 or 4 players on 2 or more wins, so the tiebreak usually picks one or two seats.

| How often | Win counts, highest first | Clearly in | Seats left | Tied for them |
|---:|---|---:|---:|---:|
| 20% | 2, 2, 2, then six players on 1 | 3 | 1 | 6 on 1 win |
| 19% | 3, 2, 2, then five players on 1 | 3 | 1 | 5 on 1 win |
| 16% | 2, 2, 2, 2, then four players on 1 | 4 | 0 | — |
| 11% | 3, 2, 2, 2, then three players on 1 | 4 | 0 | — |
| 9% | 3, 2, then seven players on 1 | 2 | 2 | 7 on 1 win |
| 7% | 2, 2, then eight players on 1 | 2 | 2 | 8 on 1 win |
| 4% | 3, 3, 2, then four players on 1 | 3 | 1 | 4 on 1 win |
| 3% | 2, 2, 2, 2, 2, then two players on 1 | 0 | 4 | 5 on 2 wins |

The other 11% are spread over rarer shapes. Every player meets everyone, one opponent twice, so strength of schedule reflects who that repeat opponent is. It settles about a third of leagues, about the same as finishing places.

## Ways to make the cut cleaner

- **Play 4 games.** The biggest single gain: wins alone decide the cut 29% of the time instead of 1%.
- **Record finishing places.** They stay a tiebreak only, never score, but without them a random draw decides far more often.
- **Keep strength of schedule.** Dropping it more than doubles the random draws: from 21% to 47% at 3 games, and from 10% to 28% at 4.

## Still to decide

- **Whether to hold a final,** and with 3 or 4 games.
- **The tiebreak ladder:** confirm wins, then strength of schedule, then finishing places, then a random draw.
- **Finalist seats:** how finalists choose seats, for example top seed picks first.
- **Finalist factions:** for example, each finalist gets their best pick not yet played.
- **The map** for the final.
