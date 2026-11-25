"""Cut simulation for the Root league ("Swiss triangle" view).

Every qualifying game is a 4-player table with exactly one winner. Games run
one at a time. Players are equal skill unless a stronger player is modelled.
The top 4 by qualifying record play a single final game.

Schedules are generated so pairs meet as evenly as possible: every pair meets
n or n+1 times (spread of one at most).

Ranking for the cut: wins, then strength of schedule (SoS: for each of your
qualifying games, add the qualifying wins of the other three players), then a
last-resort tiebreak. The script also reports how often a second deterministic
level, opponents' SoS (the same sum using SoS instead of wins), would settle
what SoS leaves tied, and how often finishing places (sum of places across
qualifying games, lower is better) would settle the cut, either after SoS or
instead of it. Places are modelled only as a possible tiebreak, never as score.

Usage: python3 tools/cut_sim.py [--runs N] [--seed S] [--json out.json]
"""

import argparse
import itertools
import json
import math
import random
from collections import Counter, defaultdict

TABLE = 4
CUT = 4
HOURS_PER_GAME = 2

OPTIONS = [
    ("10 players, 4 games each", 10, 4),
    ("12 players, 3 games each", 12, 3),
    ("12 players, 4 games each", 12, 4),
]


# ---------------------------------------------------------------- schedules

def pair_counts(n, games):
    c = Counter()
    for t in games:
        for a, b in itertools.combinations(sorted(t), 2):
            c[(a, b)] += 1
    return [c[p] for p in itertools.combinations(range(n), 2)]


def make_schedule(rng, n, g, iters=20000):
    """A list of 4-player games, each player in exactly g of them, with pair
    meetings as even as possible. Annealing swaps one player in one game with
    a player from another game, which keeps everyone's game count fixed."""
    while True:
        seats = [p for p in range(n) for _ in range(g)]
        rng.shuffle(seats)
        games = [seats[i:i + TABLE] for i in range(0, len(seats), TABLE)]
        if all(len(set(t)) == TABLE for t in games):
            break

    def score():
        v = pair_counts(n, games)
        return (max(v) - min(v)) * 50 + sum(x * x for x in v)

    cur = score()
    temp = 3.0
    for _ in range(iters):
        i, j = rng.sample(range(len(games)), 2)
        a, b = rng.randrange(TABLE), rng.randrange(TABLE)
        x, y = games[i][a], games[j][b]
        if x in games[j] or y in games[i]:
            continue
        games[i][a], games[j][b] = y, x
        new = score()
        if new <= cur or rng.random() < math.exp((cur - new) / temp):
            cur = new
        else:
            games[i][a], games[j][b] = x, y
        temp = max(0.05, temp * 0.9997)
    return games


def schedule_pool(rng, n, g, size=12):
    pool = []
    while len(pool) < size:
        s = make_schedule(rng, n, g)
        v = pair_counts(n, s)
        if max(v) - min(v) <= 1:
            pool.append(s)
    return pool


# ---------------------------------------------------------------- one league

def evaluate(n, wins, games, places):
    sos = [0] * n
    for t in games:
        for p in t:
            sos[p] += sum(wins[q] for q in t if q != p)
    sos2 = [0] * n
    for t in games:
        for p in t:
            sos2[p] += sum(sos[q] for q in t if q != p)

    def tied(key):
        ranked = sorted(range(n), key=key, reverse=True)
        return key(ranked[CUT - 1]) == key(ranked[CUT])

    if not tied(lambda p: wins[p]):
        level = "wins"
    elif not tied(lambda p: (wins[p], sos[p])):
        level = "sos"
    else:
        level = "last"
    sos2_settles = level == "last" and not tied(lambda p: (wins[p], sos[p], sos2[p]))
    place_after_sos = level == "last" and not tied(lambda p: (wins[p], sos[p], -places[p]))
    place_only = not tied(lambda p: (wins[p], -places[p]))

    # Chance each player makes the final, with a random draw after SoS.
    key = lambda p: (wins[p], sos[p])
    cut_key = sorted(map(key, range(n)), reverse=True)[CUT - 1]
    above = [p for p in range(n) if key(p) > cut_key]
    at = [p for p in range(n) if key(p) == cut_key]
    chance = [0.0] * n
    for p in above:
        chance[p] = 1.0
    for p in at:
        chance[p] = (CUT - len(above)) / len(at)
    group = (CUT - len(above), len(at)) if level == "last" else None
    return level, chance, group, sos2_settles, place_after_sos, place_only


def simulate(rng, n, g, pool, runs, strong=1.0):
    levels = Counter()
    groups = Counter()
    rec_players = Counter()
    rec_made = defaultdict(float)
    sos2 = 0
    place_after = 0
    place_only = 0
    strong_final = 0.0
    strength = [strong] + [1.0] * (n - 1)
    for _ in range(runs):
        perm = list(range(n))
        rng.shuffle(perm)
        games = [[perm[p] for p in t] for t in rng.choice(pool)]
        wins = [0] * n
        places = [0] * n
        for t in games:
            # Full finishing order: draw winner, then 2nd, 3rd, by strength.
            left = list(t)
            for place in range(1, TABLE + 1):
                p = rng.choices(left, weights=[strength[q] for q in left])[0]
                left.remove(p)
                places[p] += place
                if place == 1:
                    wins[p] += 1
        level, chance, group, s2, pa, po = evaluate(n, wins, games, places)
        levels[level] += 1
        sos2 += s2
        place_after += pa
        place_only += po
        if group:
            groups[group] += 1
        for p in range(n):
            rec_players[wins[p]] += 1
            rec_made[wins[p]] += chance[p]
        strong_final += chance[0]
    return dict(
        levels={k: levels[k] / runs for k in ("wins", "sos", "last")},
        sos2_settles=sos2 / runs,
        place_after_sos=place_after / runs,
        place_only_clean=place_only / runs,
        records={w: dict(expected=rec_players[w] / runs,
                         make_final=rec_made[w] / rec_players[w])
                 for w in sorted(rec_players, reverse=True)},
        last_groups={f"{s} seat(s) for {k} players": c / runs
                     for (s, k), c in groups.most_common(5)},
        strong_final=strong_final / runs,
    )


# ---------------------------------------------------------------- driver

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=50000)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--json")
    args = ap.parse_args()
    rng = random.Random(args.seed)
    out = []
    for name, n, g in OPTIONS:
        pool = schedule_pool(rng, n, g)
        meet = Counter(pair_counts(n, pool[0]))
        qual = n * g // TABLE
        r = simulate(rng, n, g, pool, args.runs)
        r.update(name=name, players=n, games_each=g, runs=args.runs,
                 qualifying_games=qual, total_games=qual + 1,
                 hours=(qual + 1) * HOURS_PER_GAME,
                 schedule={f"pairs meeting {k}x": v for k, v in sorted(meet.items())})
        r["skill"] = {s: simulate(rng, n, g, pool, args.runs // 5, strong=s)["strong_final"]
                      for s in (1.5, 2.0, 3.0)}
        out.append(r)

        lv = r["levels"]
        print(f"\n=== {name}: {qual} qualifying games + final = {qual + 1} games, "
              f"about {r['hours']} hours ({args.runs} runs)", flush=True)
        print("schedule:", r["schedule"])
        print(f"cut settled by wins alone {lv['wins']:.0%}, by SoS {lv['sos']:.0%}, "
              f"needs last resort {lv['last']:.0%}")
        print(f"opponents' SoS as a third level would settle {r['sos2_settles']:.0%} "
              f"of all runs, leaving {lv['last'] - r['sos2_settles']:.0%} for the last resort")
        print(f"places after SoS would settle {r['place_after_sos']:.0%}, leaving "
              f"{lv['last'] - r['place_after_sos']:.1%}; wins then places (no SoS) "
              f"leaves {1 - r['place_only_clean']:.1%}")
        print(f"{'wins':>4} {'expected players':>17} {'chance to make final':>21}")
        for w, d in r["records"].items():
            if d["expected"] >= 0.005:
                print(f"{w:>4} {d['expected']:>17.2f} {d['make_final']:>21.1%}")
        print("last-resort groups:", {k: f"{v:.1%}" for k, v in r["last_groups"].items()})
        print(f"one stronger player makes the final: average {CUT / n:.0%}, "
              + ", ".join(f"strength {s} -> {v:.0%}" for s, v in r["skill"].items()),
              flush=True)
    print("\nstrength 1.5 wins 33% against three average players, 2.0 wins 40%, 3.0 wins 50%")
    if args.json:
        with open(args.json, "w") as f:
            json.dump(out, f, indent=1)


if __name__ == "__main__":
    main()
