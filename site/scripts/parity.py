#!/usr/bin/env python3
"""Cross-check Python and TypeScript pairing hard rules (ADR 3).

Run from any directory: python3 site/scripts/parity.py (requires npm ci in site).
The Vitest wrapper calls --generate and --check internally over JSON/stdin.
Own-list and mix are intentionally excluded from Python -> TypeScript checks:
the reference tool permits off-list plays and does not constrain the mix.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys

SITE = Path(__file__).resolve().parents[1]
ROOT = SITE.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "planning/tools/pairing"))
import league_pairing as lp  # noqa: E402

# The ten-player mock cannot fill tables at three games. Adam's three-pick
# list in both mocks cannot support four games without an off-list play.
CASES = [
    ("planning/tools/pairing/mock_preferences_FAKE.json", 2),
    ("planning/tools/pairing/mock12_preferences_FAKE.json", 3),
    ("season-1/preferences.json", 3),
    ("season-1/preferences.json", 4),
]


def generate():
    cases = []
    for path, games_each in CASES:
        prefs = json.loads((ROOT / path).read_text())["players"]
        # Parity needs valid schedules, not the reference's best soft score.
        # Keep its full per-plan search, with a bounded set of seeded candidates.
        result = lp.solve(list(prefs), prefs, g=games_each, n_maps=4, seed=0,
                          tries=4, finalists=2)
        failures = lp.check(result)
        if failures:
            raise ValueError(f"Python {path}, {games_each} games: {failures}")
        cases.append({
            "fixture": path,
            "input": {
                "gamesEach": games_each,
                "players": [
                    {"id": name, "name": name, "list": [lp.CODES[f] for f in fs]}
                    for name, fs in zip(result.players, result.prefs)
                ],
                "games": [
                    {"gameNo": gi + 1, "map": result.plan.maps[gi], "seats": [
                        {"player": result.players[p], "faction": lp.CODES[result.factions[gi, p]]}
                        for p in row
                    ]}
                    for gi, row in enumerate(result.seats)
                ],
            },
        })
    return cases


def check_input(data):
    """Adapt seat order, player ids and faction codes without changing the tool."""
    players = data["players"]
    indices = {p["id"]: i for i, p in enumerate(players)}
    games = data["games"]
    rows = [[indices[s["player"]] for s in g["seats"]] for g in games]
    result = lp.Result(
        players=[p["name"] for p in players],
        prefs=[[lp.canon(f) for f in p["list"]] for p in players],
        g=data["gamesEach"],
        n_maps=max(g["map"] for g in games) + 1,
        plan=lp.Plan(rows, [g["map"] for g in games]),
        factions={(gi, indices[s["player"]]): lp.canon(s["faction"])
                  for gi, g in enumerate(games) for s in g["seats"]},
        seats=rows,
    )
    return lp.check(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--generate", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.generate:
        print(json.dumps(generate()))
    elif args.check:
        failures = check_input(json.load(sys.stdin))
        print(json.dumps(failures))
        return int(bool(failures))
    else:
        return subprocess.run(
            ["npm", "test", "--", "src/pairing/parity.test.ts"], cwd=SITE,
            check=False,
        ).returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
