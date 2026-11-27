#!/usr/bin/env python3
"""Generate site/src/data/layouts.json from the Python pairing tool.

The tool in planning/tools/pairing is imported unchanged: `build_plan` finds
the games and maps, `assign_seats` colours the seats. This script only picks,
for each valid (players, games each, map count), the best of a fixed number of
seeded plans and writes the result in a stable format.

    python3 scripts/gen-layouts.py            write src/data/layouts.json
    python3 scripts/gen-layouts.py --check    regenerate and fail on a difference

Decision 47: one layout per valid pair and per map count from games each up to 6.
Output depends only on the tool and the fixed seeds below.
"""
from __future__ import annotations

import argparse
import itertools
import json
import random
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
TOOL_DIR = SITE.parent / "planning" / "tools" / "pairing"
OUT = SITE / "src" / "data" / "layouts.json"

sys.dont_write_bytecode = True
sys.path.insert(0, str(TOOL_DIR))

import league_pairing as lp  # noqa: E402

# Valid (players, games each) pairs. 10 players with 3 games is left out: 30
# seats do not fill 4-seat tables.
PAIRS = [(8, 2), (8, 3), (8, 4), (10, 2), (10, 4), (12, 2), (12, 3), (12, 4)]
MAX_MAPS = 6
TRIES = 8  # seeded plans tried per layout, fewer if one is already best possible
POLISH_STEPS = 6000  # map swaps tried on each plan once its tables are fixed

# Meeting spread allowed in a layout. The tool's check allows 1. Two sizes cannot
# meet it, and the layout carries the smallest spread possible:
#  - 8 players with 3 games: 6 games make 36 meetings over 28 pairs (the page says
#    so and asks the admin to acknowledge it).
#  - 8 players with 2 games: each player is in 2 of 4 tables, so a player is an
#    edge between two tables and 8 players need 8 edges on the 6 table pairs of a
#    4-table graph. At least 2 pairs of tables share two players, so at least 2
#    pairs of players meet in both of their games and the spread cannot go below 2.
SPREAD_LIMIT = {(8, 2): 2, (8, 3): 2}
# Fewest pairs that meet in every game of a player (0 except where proved above).
ALWAYS_MEET_FLOOR = {(8, 2): 2}


def plan_stats(n: int, g: int, n_maps: int, plan: "lp.Plan") -> dict:
    m = plan.meetings(n)
    counts = [m[a][b] for a in range(n) for b in range(a + 1, n)]
    repeats = sum(
        max(0, k - 1) for row in plan.map_counts(n, n_maps) for k in row
    )
    return {
        "meetingSpread": max(counts) - min(counts),
        "mostMeetings": max(counts),
        "fewestMeetings": min(counts),
        "mapRepeats": repeats,
        "mapRepeatsLowerBound": lp.min_map_repeats(n, g, n_maps),
    }


def polish_maps(plan: "lp.Plan", n: int, n_maps: int, rng: random.Random) -> None:
    """Swap maps between games, tables fixed, to cut map repeats. Never worsens."""
    total = len(plan.games)

    def cost() -> tuple[int, int]:
        rep = [sum(max(0, k - 1) for k in row) for row in plan.map_counts(n, n_maps)]
        return sum(rep), sum(r * r for r in rep)  # total, then evenness

    cur = cost()
    for _ in range(POLISH_STEPS):
        i, j = rng.sample(range(total), 2)
        if plan.maps[i] == plan.maps[j]:
            continue
        plan.maps[i], plan.maps[j] = plan.maps[j], plan.maps[i]
        new = cost()
        if new <= cur:
            cur = new
        else:
            plan.maps[i], plan.maps[j] = plan.maps[j], plan.maps[i]


def always_meet(n: int, g: int, plan: "lp.Plan") -> int:
    """Pairs that meet in every game of a player (only meaningful for g >= 2)."""
    m = plan.meetings(n)
    return sum(1 for a in range(n) for b in range(a + 1, n) if m[a][b] >= g)


def build_layout(spec: tuple[int, int, int]) -> tuple[str, dict]:
    n, g, n_maps = spec
    best = None
    for attempt in range(TRIES):
        rng = random.Random(n * 1_000_000 + g * 10_000 + n_maps * 100 + attempt)
        plan = lp.build_plan(n, g, n_maps, rng)
        polish_maps(plan, n, n_maps, rng)
        stats = plan_stats(n, g, n_maps, plan)
        _, _, mapc = lp._plan_cost(plan.games, plan.maps, n, g, n_maps)
        meet = always_meet(n, g, plan) if g >= 2 else 0
        over_meet = max(0, meet - ALWAYS_MEET_FLOOR.get((n, g), 0))
        over_spread = max(0, stats["meetingSpread"] - SPREAD_LIMIT.get((n, g), 1))
        key = (over_meet, over_spread, stats["mapRepeats"], stats["meetingSpread"],
               mapc, attempt)
        if best is None or key < best[0]:
            best = (key, plan, stats)
        if key[:3] == (0, 0, stats["mapRepeatsLowerBound"]):
            break
    _, plan, stats = best
    seats = lp.assign_seats(plan)
    games = [
        {"map": mp, "slots": row}
        for mp, row in zip(plan.maps, seats)
    ]
    return f"{n}-{g}-{n_maps}", {
        "players": n,
        "gamesEach": g,
        "maps": n_maps,
        "stats": stats,
        "games": games,
    }


def specs() -> list[tuple[int, int, int]]:
    return [(n, g, m) for n, g in PAIRS for m in range(g, MAX_MAPS + 1)]


def render(layouts: dict) -> str:
    """Stable text: one line per game so diffs stay readable."""
    out = ["{"]
    keys = list(layouts)
    for i, key in enumerate(keys):
        lay = layouts[key]
        out.append(f'  "{key}": {{')
        out.append(f'    "players": {lay["players"]},')
        out.append(f'    "gamesEach": {lay["gamesEach"]},')
        out.append(f'    "maps": {lay["maps"]},')
        out.append(f'    "stats": {json.dumps(lay["stats"])},')
        out.append('    "games": [')
        rows = [json.dumps(g_, separators=(",", ":")) for g_ in lay["games"]]
        for j, row in enumerate(rows):
            out.append(f"      {row}{',' if j < len(rows) - 1 else ''}")
        out.append("    ]")
        out.append("  }" + ("," if i < len(keys) - 1 else ""))
    out.append("}")
    return "\n".join(out) + "\n"


def generate() -> str:
    with ProcessPoolExecutor() as pool:
        built = list(pool.map(build_layout, specs()))
    return render(dict(built))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true",
                    help="regenerate and fail if layouts.json differs")
    args = ap.parse_args()
    text = generate()
    if args.check:
        current = OUT.read_text() if OUT.exists() else ""
        if current != text:
            print(f"{OUT.relative_to(SITE)} is out of date; run npm run layouts",
                  file=sys.stderr)
            return 1
        print(f"{OUT.relative_to(SITE)} is up to date")
        return 0
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(SITE)} ({len(specs())} layouts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
