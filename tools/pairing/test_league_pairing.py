"""Tests for league_pairing. Run: python3 -m unittest -v   (SLOW=1 adds the 10/12-player solves)"""
import json
import os
import random
import unittest

import league_pairing as L

HERE = os.path.dirname(__file__)


def load(name):
    with open(os.path.join(HERE, name)) as fh:
        d = json.load(fh)["players"]
    return list(d), d


class Feasibility(unittest.TestCase):
    def test_game_counts(self):
        self.assertEqual(L.feasible_game_counts(10), [2, 4, 6, 8])
        self.assertEqual(L.feasible_game_counts(12), [1, 2, 3, 4, 5, 6, 7, 8])

    def test_map_repeat_lower_bound(self):
        self.assertEqual(L.min_map_repeats(12, 4, 4), 0)
        self.assertEqual(L.min_map_repeats(10, 4, 4), 4)


class Seats(unittest.TestCase):
    def test_edge_colouring_always_gives_each_seat_once(self):
        for seed in range(30):
            rng = random.Random(seed)
            n = rng.choice([8, 10, 12])
            games = L._deal(n, 4, rng)
            while games is None:
                games = L._deal(n, 4, rng)
            plan = L.Plan(games, [0] * len(games))
            seats = L.assign_seats(plan)
            for table, row in zip(games, seats):
                self.assertEqual(sorted(row), sorted(table))
            for p in range(n):
                held = [row.index(p) for row in seats if p in row]
                self.assertEqual(sorted(held), [0, 1, 2, 3])

    def test_too_many_games_rejected(self):
        plan = L.Plan([[0, 1, 2, 3]] * 5, [0] * 5)
        with self.assertRaises(ValueError):
            L.assign_seats(plan)


class Validator(unittest.TestCase):
    def make(self):
        players, prefs = load("mock_preferences_FAKE.json")
        return L.solve(players, prefs, g=4, tries=3, finalists=1, seed=5, max_spread=2)

    def test_solution_passes_its_own_rules(self):
        r = self.make()
        self.assertEqual(L.check(r, max_spread=2), [])

    def test_catches_repeated_faction(self):
        r = self.make()
        keys = [k for k in r.factions if k[1] == 0]
        r.factions[keys[0]] = r.factions[keys[1]]
        self.assertTrue(any("repeat" in f or "duplicate" in f for f in L.check(r, 2)))

    def test_catches_low_reach(self):
        r = self.make()
        for p, f in zip(r.plan.games[0], ["lizards", "alliance", "corvids", "twilight"]):
            r.factions[(0, p)] = f
        self.assertTrue(any("reach" in f for f in L.check(r, 2)))

    def test_catches_repeated_seat(self):
        r = self.make()
        p = r.seats[0][0]
        other = next(i for i, row in enumerate(r.seats) if p in row and i != 0)
        r.seats[other] = [p] + [q for q in r.seats[other] if q != p]
        self.assertTrue(any("seat" in f for f in L.check(r, 2)))


class ShortLists(unittest.TestCase):
    def test_short_list_goes_off_list_not_crash(self):
        players = list("ABCDEFGH")
        prefs = {p: ["cats"] for p in players}
        r = L.solve(players, prefs, g=4, n_maps=4, tries=2, finalists=1, max_spread=3)
        self.assertEqual(L.check(r, 3), [])
        off = sum(1 for (g, p), f in r.factions.items() if f not in r.prefs[p])
        self.assertGreaterEqual(off, 8 * 3)  # at most one cats play each


class SixPicks(unittest.TestCase):
    def test_list_longer_than_five_is_accepted(self):
        players, prefs = load("mock_preferences_FAKE.json")
        self.assertEqual(len(prefs["David"]), 6)
        r = L.solve(players, prefs, g=4, tries=2, finalists=1, seed=2, max_spread=2)
        self.assertEqual(L.check(r, 2), [])
        L.report(r, 2)  # must not crash on a sixth pick


DOCS = os.path.join(HERE, "..", "..", "docs")


def table_rows(doc, header):
    """Rows of the markdown table whose first cell is `header`, as cell lists."""
    with open(os.path.join(DOCS, doc)) as fh:
        lines = fh.read().splitlines()
    rows, inside = [], False
    for line in lines:
        if not line.startswith("|"):
            if inside:
                break
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[0] == header:
            inside = True
        elif inside and not set(cells[0]) <= set("-:"):
            rows.append(cells)
    return rows


class DocInStep(unittest.TestCase):
    """The docs must match preferences.json and the faction table in the tool."""

    def setUp(self):
        with open(os.path.join(HERE, "preferences.json")) as fh:
            self.real = json.load(fh)["players"]

    def test_faction_picks_doc_matches_json(self):
        in_doc = {}
        for cells in table_rows("faction-picks.md", "Player"):
            if cells[0] in self.real:
                in_doc[cells[0]] = [L.canon(c) for c in cells[2:] if c]
        self.assertEqual(set(in_doc), set(self.real))
        for name, picks in self.real.items():
            self.assertEqual(in_doc[name], [L.canon(f) for f in picks], name)

    def test_picks_per_faction_matches_json(self):
        rows = {L.canon(c[0]): c for c in table_rows("faction-popularity.md", "Code")}
        self.assertEqual(set(rows), set(L.FACTIONS))
        for key, cells in rows.items():
            counts = [0] * 6
            for picks in self.real.values():
                for i, f in enumerate(picks):
                    if L.canon(f) == key:
                        counts[i] += 1
            in_doc = [0 if c == "\u2014" else int(c) for c in cells[3:9]]
            self.assertEqual(in_doc, counts, cells[0])
            self.assertEqual(int(cells[9]), sum(counts), cells[0])

    def test_factions_doc_matches_tool(self):
        rows = table_rows("factions.md", "Code")
        self.assertEqual({c[0] for c in rows}, set(L.CODES.values()))
        for code, name, kind, reach in rows:
            key = L.canon(code)
            self.assertEqual(name, L.FACTIONS[key][0], code)
            self.assertEqual(int(reach), L.FACTIONS[key][1], code)
            self.assertEqual(kind, "Militant" if key in L.MILITANT else "Insurgent", code)


@unittest.skipUnless(os.environ.get("SLOW"), "set SLOW=1")
class FullSizes(unittest.TestCase):
    def test_ten_players_spread_one_few_repeats(self):
        players, prefs = load("mock_preferences_FAKE.json")
        r = L.solve(players, prefs, g=4, tries=8, seed=1)
        self.assertEqual(L.check(r), [])
        self.assertLessEqual(sum(L.map_repeats(r)), 8)

    def test_twelve_players_spread_one(self):
        players, prefs = load("mock12_preferences_FAKE.json")
        r = L.solve(players, prefs, g=4, tries=8, seed=1)
        self.assertEqual(L.check(r), [])


if __name__ == "__main__":
    unittest.main()
