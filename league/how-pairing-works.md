# How Pairing Works

How the pairing tool decides who plays whom, in which seat, on which map and with which faction. The goal is that you can see why you were placed where you were. The code is in [`league_pairing.py`](../planning/tools/pairing/league_pairing.py) if you want to check it.

The tool aims at the [pairing rules](pairing-rules.md). Your input is your ranked list on [faction picks](../season-1/faction-picks.md); nothing else about you, such as skill or past results, is used.

## The three steps

The tool works in three steps, in this order. Each step fixes its part before the next one starts.

1. **Tables and maps.** It deals every player into the right number of games, then keeps swapping players between tables and maps between games, keeping a swap when it makes things more even. It scores a layout on two things: every pair of players meeting about the same number of times, and each player seeing as many different maps as possible. Meetings count far more than maps. It builds several layouts this way and keeps the best few. See [`build_plan`](../planning/tools/pairing/league_pairing.py#L173).
2. **Factions.** For those few layouts, it starts each player on their top picks, then keeps trying changes: swapping two of a player's factions between their games, or trying another faction from their list. It first avoids anything that breaks a table rule (a faction twice at one table, a faction twice for one player, table reach below 21). Then it ranks results by, in order:
   - **Worst-off player:** how far the unluckiest player ended up below their own top picks.
   - **Everyone together:** how far all players ended up below their top picks, added up.

   So the tool would rather give two players their 2nd pick than give one player their 4th. The best result across the layouts wins. See [`assign_factions`](../planning/tools/pairing/league_pairing.py#L267).
3. **Seats.** Seats are set last, exactly rather than by search, so that nobody sits in the same seat twice. Seat 1 goes first. See [`assign_seats`](../planning/tools/pairing/league_pairing.py#L306).

At the end, a check confirms every hard rule holds. See [`check`](../planning/tools/pairing/league_pairing.py#L367).

## What it means for you

- **Who you play is random but fair.** Players are mixed so nobody faces the same opponent much more than anyone else. Which particular players you meet comes down to the shuffle.
- **Your factions come from your list.** Higher on your list means more likely to be played. If you got a lower pick, it is because giving you a higher one would have left someone else worse off, or your table needed more reach.
- **Your seat is just a rotation.** Seats carry no meaning beyond turn order, and you get a different one each game.
- **Anyone can rerun it.** The tool uses a numbered seed for its random choices. The same faction picks and seed give the same pairings, so the published pairings can be checked.

## Known gaps

The tool was built before the current rules and is still being brought in line. Until these are fixed, it does not fully meet the [pairing rules](pairing-rules.md):

- **Off-list factions.** If it cannot fit everyone from their own lists, it can fall back to a faction outside a player's list, as a last resort. The rules forbid this.
- **Militant and insurgent mix.** It does not check the mix at each table yet.
- **Games each.** It defaults to 4 games each; the number for this season is not set yet.

The 12-player samples in planning were laid out by hand from a fixed pattern, not by this tool.
