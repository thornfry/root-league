# League Planning

Working material for Will: design notes, spikes, samples and tools. Nothing here is a league rule. The official pages are linked from the [main README](../README.md).

## Every season

- [Decisions](decisions.md): what has been decided, and why.
- [Open questions](open-questions.md): what is still undecided, and findings to confirm.
- [Pairing approach](pairing-approach.md): how to build pairings, and what each player count allows.
- [tools/pairing/](tools/pairing/): the pairing tool and its tests. Built before the current rules, so it does not meet them yet; the gaps are on [how pairing works](../league/how-pairing-works.md#known-gaps). Run the tests with `python3 -m unittest` from that folder.

## Season 1

- [Faction popularity](season-1/faction-popularity.md): how often each faction is picked, at each rank.
- [Sample pairings: 3 games](season-1/sample-pairings-3-games.md): a sample 12-player layout, 3 games each, with seats, maps, factions and meetings. Leaves room for a final.
- [Sample pairings: 4 games](season-1/sample-pairings-4-games.md): the same for 4 games each. No final.
- [Final table](season-1/final-table.md): the math of a cut to a 4-player final at 12 players.

The season's faction lists live in [`season-1/preferences.json`](../season-1/preferences.json), which is the tool's input and the source for [faction picks](../season-1/faction-picks.md).
