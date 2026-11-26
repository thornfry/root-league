#!/usr/bin/env python3
"""Root League pairing prototype (one game at a time).

The schedule is a plain list of games. Each game has a map, four seats in
turn order, and a faction per seat. Standard library only.

Hard rules (see league/pairing-rules.md):
  - Every game has exactly 4 players; each player plays the same number of games.
  - Pair meetings are even: max - min over all pairs <= MAX_SPREAD (default 1),
    and nobody meets the same opponent in every one of their games.
  - A player never plays the same faction twice.
  - At most one of each faction per table (so one Vagabond per table).
  - Every table's total reach is at least MIN_REACH (21).
  - Nobody holds the same seat twice (possible for up to 4 games each).
Soft goals:
  - Maps: each player plays each map once where possible. Where the player
    count forbids it, repeats are minimised and spread across players.
  - Factions, in strict priority: fewest off-list plays, then smallest
    worst-player regret, then smallest total regret. Regret of a play is
    rank - 1 for a listed faction, OFF_LIST_COST otherwise, measured against
    each player's best case (picks 1..g).

Approach, in stages:
  1. Games and maps: simulated annealing on pair-meeting counts and map repeats.
  2. Factions: simulated annealing on the chosen games, run for the few best
     schedules; the best result is kept.
  3. Seats: bipartite edge colouring (Konig), exact, no search.
This is a heuristic. Results are validated against the hard rules by check()
but are not proven optimal.
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import random
import sys
from dataclasses import dataclass, field

TABLE_SIZE = 4
MIN_REACH = 21  # Law of Root 5.2.1, 4 players
MAX_SPREAD = 1
OFF_LIST_COST = 8  # regret for an unlisted faction; worse than pick #5 (4)

# Law of Root 5.2.2 reach values (fetched 2026-11-25).
FACTIONS = {
    "cats": ("Marquise de Cat", 10),
    "hundreds": ("Lord of the Hundreds", 9),
    "keepers": ("Keepers in Iron", 8),
    "duchy": ("Underground Duchy", 8),
    "lilypad": ("Lilypad Diaspora", 7),
    "eyrie": ("Eyrie Dynasties", 7),
    "vagabond": ("Vagabond", 5),
    "riverfolk": ("Riverfolk Company", 5),
    "knaves": ("Knaves of the Deepwood", 4),
    "twilight": ("Twilight Council", 4),
    "alliance": ("Woodland Alliance", 3),
    "corvids": ("Corvid Conspiracy", 3),
    "lizards": ("Lizard Cult", 2),
}

# Short codes used in the docs (league/factions.md).
CODES = {
    "cats": "cats", "hundreds": "rats", "keepers": "badgers", "duchy": "moles",
    "lilypad": "frogs", "eyrie": "birds", "vagabond": "vagabond", "riverfolk": "otters",
    "knaves": "knaves", "twilight": "bats", "alliance": "WA", "corvids": "crows",
    "lizards": "lizards",
}

# Militant factions per the Root Database faction listing (checked 2026-11-25);
# the rest are insurgent.
MILITANT = {"cats", "eyrie", "duchy", "hundreds", "keepers", "lilypad"}

ALIASES = {name.lower(): key for key, (name, _) in FACTIONS.items()}
ALIASES.update({key: key for key in FACTIONS})
ALIASES.update({code.lower(): key for key, code in CODES.items()})
ALIASES.update({
    "marquise": "cats", "cat": "cats", "eyrie dynasties": "eyrie",
    "woodland alliance": "alliance", "wa": "alliance", "vb": "vagabond",
    "lizard": "lizards", "riverfolk company": "riverfolk", "otters": "riverfolk",
    "moles": "duchy", "corvid": "corvids", "lord of hundreds": "hundreds",
    "rats": "hundreds", "badgers": "keepers", "frogs": "lilypad",
    "bats": "twilight", "birds": "eyrie", "bird": "eyrie",
})


def canon(name: str) -> str:
    key = ALIASES.get(name.strip().lower())
    if key is None:
        raise ValueError(f"unknown faction {name!r}")
    return key


# ---------------------------------------------------------------- feasibility

def games_total(n: int, g: int) -> int | None:
    """Number of games, or None if n players x g games cannot fill 4-seat tables."""
    return n * g // TABLE_SIZE if (n * g) % TABLE_SIZE == 0 and n >= TABLE_SIZE else None


def feasible_game_counts(n: int, up_to: int = 8) -> list[int]:
    return [g for g in range(1, up_to + 1) if games_total(n, g)]


def games_per_map(total: int, n_maps: int) -> list[int]:
    return [total // n_maps + (1 if i < total % n_maps else 0) for i in range(n_maps)]


def min_map_repeats(n: int, g: int, n_maps: int) -> int:
    """Lower bound on forced repeat plays (a map with more seats than players)."""
    total = games_total(n, g)
    return sum(max(0, TABLE_SIZE * k - n) for k in games_per_map(total, n_maps)) if total else 0


# ------------------------------------------------------- stage 1: games, maps

@dataclass
class Plan:
    games: list[list[int]]   # player indices per game
    maps: list[int]          # map index per game

    def meetings(self, n: int):
        m = [[0] * n for _ in range(n)]
        for table in self.games:
            for a, b in itertools.combinations(table, 2):
                m[a][b] += 1
                m[b][a] += 1
        return m

    def map_counts(self, n: int, n_maps: int):
        c = [[0] * n_maps for _ in range(n)]
        for table, mp in zip(self.games, self.maps):
            for p in table:
                c[p][mp] += 1
        return c


def _deal(n, g, rng):
    total = n * g // TABLE_SIZE
    need = [g] * n
    games = []
    for _ in range(total):
        order = list(range(n))
        rng.shuffle(order)
        order.sort(key=lambda p: -need[p])
        table = order[:TABLE_SIZE]
        for p in table:
            need[p] -= 1
        games.append(table)
    return None if any(need) else games


def _plan_cost(games, maps, n, g, n_maps):
    m = {}
    for table in games:
        for a, b in itertools.combinations(sorted(table), 2):
            m[(a, b)] = m.get((a, b), 0) + 1
    counts = [m.get((a, b), 0) for a in range(n) for b in range(a + 1, n)]
    pair = sum(c * c for c in counts)
    if g >= 2:
        pair += 1000 * sum(1 for c in counts if c >= g)
    seen = [[0] * n_maps for _ in range(n)]
    for table, mp in zip(games, maps):
        for p in table:
            seen[p][mp] += 1
    rep = [sum(max(0, k - 1) for k in row) for row in seen]
    mapc = 3 * sum(rep) + sum(r * r for r in rep)  # squares spread repeats evenly
    return 20 * pair + mapc, max(counts) - min(counts), mapc


def build_plan(n: int, g: int, n_maps: int, rng, iters: int = 40000) -> Plan:
    total = games_total(n, g)
    if total is None:
        raise ValueError(f"{n} players x {g} games cannot fill 4-player tables")
    games = None
    while games is None:
        games = _deal(n, g, rng)
    maps = [mp for mp, k in enumerate(games_per_map(total, n_maps)) for _ in range(k)]
    rng.shuffle(maps)
    cost, _, _ = _plan_cost(games, maps, n, g, n_maps)
    temp = 30.0
    for _ in range(iters):
        i, j = rng.sample(range(total), 2)
        if rng.random() < 0.8:
            a, b = rng.randrange(TABLE_SIZE), rng.randrange(TABLE_SIZE)
            pa, pb = games[i][a], games[j][b]
            if pa in games[j] or pb in games[i]:
                continue
            games[i][a], games[j][b] = pb, pa
            c, _, _ = _plan_cost(games, maps, n, g, n_maps)
            if c <= cost or rng.random() < math.exp((cost - c) / temp):
                cost = c
            else:
                games[i][a], games[j][b] = pa, pb
        else:
            maps[i], maps[j] = maps[j], maps[i]
            c, _, _ = _plan_cost(games, maps, n, g, n_maps)
            if c <= cost or rng.random() < math.exp((cost - c) / temp):
                cost = c
            else:
                maps[i], maps[j] = maps[j], maps[i]
        temp = max(0.3, temp * 0.9998)
    return Plan([sorted(t) for t in games], list(maps))


# ---------------------------------------------------------- stage 2: factions

def _regret(prefs, player, faction):
    lst = prefs[player]
    return lst.index(faction) if faction in lst else OFF_LIST_COST


def faction_violations(plan: Plan, factions) -> list[str]:
    out = []
    played: dict[int, list[str]] = {}
    for gi, table in enumerate(plan.games):
        fs = [factions[(gi, p)] for p in table]
        if len(set(fs)) != len(fs):
            out.append(f"game {gi+1}: duplicate faction {fs}")
        reach = sum(FACTIONS[f][1] for f in set(fs))
        if reach < MIN_REACH:
            out.append(f"game {gi+1}: reach {reach} < {MIN_REACH}")
        for p in table:
            played.setdefault(p, []).append(factions[(gi, p)])
    for p, fs in played.items():
        if len(set(fs)) != len(fs):
            out.append(f"player {p}: repeats a faction {fs}")
    return out


def _penalty(plan, factions):
    bad = 0
    played: dict[int, list[str]] = {}
    for gi, table in enumerate(plan.games):
        fs = [factions[(gi, p)] for p in table]
        bad += len(fs) - len(set(fs))
        reach = sum(FACTIONS[f][1] for f in set(fs))
        if reach < MIN_REACH:
            bad += 1 + (MIN_REACH - reach) // 3
        for p in table:
            played.setdefault(p, []).append(factions[(gi, p)])
    for fs in played.values():
        bad += len(fs) - len(set(fs))
    return bad


def score(factions, prefs, games_each):
    """(off-list plays, worst player regret, total regret): lower is better."""
    per_player: dict[int, int] = {}
    off = 0
    for (gi, p), f in factions.items():
        r = _regret(prefs, p, f)
        off += r == OFF_LIST_COST
        per_player[p] = per_player.get(p, 0) + r
    base = sum(range(games_each))
    adj = {p: v - base for p, v in per_player.items()}
    return off, max(adj.values()), sum(adj.values())


def _energy(plan, factions, prefs, games_each):
    off, worst, total = score(factions, prefs, games_each)
    return _penalty(plan, factions) * 10**8 + off * 10**5 + worst * 10**3 + total


def assign_factions(plan: Plan, prefs, pool, g, rng, iters=40000):
    seats = [(gi, p) for gi, table in enumerate(plan.games) for p in table]
    by_player: dict[int, list] = {}
    for key in seats:
        by_player.setdefault(key[1], []).append(key)
    factions = {}
    for p, keys in by_player.items():
        picks = prefs[p][:len(keys)]
        picks += [f for f in pool if f not in picks][:len(keys) - len(picks)]
        rng.shuffle(picks)
        for key, f in zip(keys, picks):
            factions[key] = f
    energy = _energy(plan, factions, prefs, g)
    best, best_e = dict(factions), energy
    temp = 2000.0
    for _ in range(iters):
        new = dict(factions)
        r = rng.random()
        if r < 0.45:
            p = rng.choice(list(by_player))
            a, b = rng.sample(by_player[p], 2)
            new[a], new[b] = new[b], new[a]
        elif r < 0.9:
            key = rng.choice(seats)
            new[key] = rng.choice(prefs[key[1]] or pool)
        else:
            key = rng.choice(seats)
            new[key] = rng.choice(pool)
        e = _energy(plan, new, prefs, g)
        if e <= energy or rng.random() < math.exp((energy - e) / temp):
            factions, energy = new, e
            if e < best_e:
                best, best_e = dict(new), e
        temp = max(0.3, temp * 0.9997)
    return best


# ------------------------------------------------------------- stage 3: seats

def assign_seats(plan: Plan) -> list[list[int]]:
    """Seat order per game so no player holds a seat twice (Konig edge colouring).

    Edges join players to their games and the 4 colours are the seats. A
    bipartite graph with max degree 4 is 4-edge-colourable, so this always
    succeeds when every player has at most 4 games.
    """
    games = plan.games
    deg: dict[int, int] = {}
    for table in games:
        for p in table:
            deg[p] = deg.get(p, 0) + 1
    if max(deg.values()) > TABLE_SIZE:
        raise ValueError("a seat can only be held once while each player has at most 4 games")
    at: dict[tuple, dict[int, tuple]] = {}  # node -> {colour: neighbour}
    for gi, table in enumerate(games):
        for p in table:
            u, v = ("p", p), ("g", gi)
            at.setdefault(u, {})
            at.setdefault(v, {})
            a = next(c for c in range(TABLE_SIZE) if c not in at[u])
            b = next(c for c in range(TABLE_SIZE) if c not in at[v])
            if a != b and a in at[v]:
                # flip the a/b alternating path from v so that a becomes free at v
                path, cur, want = [v], v, a
                while want in at[cur]:
                    cur = at[cur][want]
                    path.append(cur)
                    want = b if want == a else a
                edges = list(zip(path, path[1:], itertools.cycle([a, b])))
                for x, y, c in edges:
                    del at[x][c]
                    del at[y][c]
                for x, y, c in edges:
                    nc = b if c == a else a
                    at[x][nc] = y
                    at[y][nc] = x
            at[u][a] = v
            at[v][a] = u
    seats = []
    for gi in range(len(games)):
        row = [None] * TABLE_SIZE
        for c, other in at[("g", gi)].items():
            row[c] = other[1]
        seats.append(row)
    return seats


# ------------------------------------------------------------------ validation

@dataclass
class Result:
    players: list[str]
    prefs: list[list[str]]
    g: int
    n_maps: int
    plan: Plan
    factions: dict
    seats: list[list[int]] = field(default_factory=list)


def check(r: Result, max_spread: int = MAX_SPREAD) -> list[str]:
    """Hard-rule failures (empty list means every hard rule holds)."""
    n = len(r.players)
    fails = []
    deg = [0] * n
    for gi, table in enumerate(r.plan.games):
        if len(set(table)) != TABLE_SIZE:
            fails.append(f"game {gi+1} does not have 4 distinct players")
        for p in table:
            deg[p] += 1
    if any(d != r.g for d in deg):
        fails.append(f"games per player not all {r.g}: {deg}")
    m = r.plan.meetings(n)
    counts = [m[a][b] for a in range(n) for b in range(a + 1, n)]
    if max(counts) - min(counts) > max_spread:
        fails.append(f"meeting spread {max(counts) - min(counts)} > {max_spread}")
    if r.g >= 2 and max(counts) >= r.g:
        fails.append("a pair meets in every game")
    fails += faction_violations(r.plan, r.factions)
    for p in range(n):
        seen = [row.index(p) for row in r.seats if p in row]
        if len(set(seen)) != len(seen):
            fails.append(f"{r.players[p]} repeats a seat {seen}")
    return fails


def map_repeats(r: Result) -> list[int]:
    return [sum(max(0, k - 1) for k in row) for row in r.plan.map_counts(len(r.players), r.n_maps)]


# --------------------------------------------------------------------- driver

def solve(players, prefs_by_name, g=4, n_maps=4, seed=0, tries=16, finalists=3,
          pool=None, max_spread=MAX_SPREAD) -> Result:
    pool = pool or list(FACTIONS)
    prefs = [[canon(f) for f in prefs_by_name[name]] for name in players]
    for name, lst in zip(players, prefs):
        if len(set(lst)) != len(lst):
            raise ValueError(f"{name} lists a faction twice")
    rng = random.Random(seed)
    n = len(players)
    cands = []
    for _ in range(tries):
        plan = build_plan(n, g, n_maps, rng)
        _, spread, mapc = _plan_cost(plan.games, plan.maps, n, g, n_maps)
        m = plan.meetings(n)
        counts = [m[a][b] for a in range(n) for b in range(a + 1, n)]
        bad = (max(counts) - min(counts) > max_spread) or (g >= 2 and max(counts) >= g)
        cands.append(((bad, mapc, spread), plan))
    cands.sort(key=lambda c: c[0])
    best = None
    for _, plan in cands[:finalists]:
        f = assign_factions(plan, prefs, pool, g, rng)
        key = (_penalty(plan, f), score(f, prefs, g))
        if best is None or key < best[0]:
            best = (key, plan, f)
    _, plan, f = best
    return Result(players, prefs, g, n_maps, plan, f, assign_seats(plan))


def report(r: Result, max_spread: int = MAX_SPREAD) -> str:
    n, g = len(r.players), r.g
    names, prefs, plan = r.players, r.prefs, r.plan
    lines = [f"# Pairing result: {n} players, {g} games each, {len(plan.games)} games, {r.n_maps} maps", ""]
    lines += ["| Game | Map | Seat 1 | Seat 2 | Seat 3 | Seat 4 | Reach |", "|---|---|---|---|---|---|---:|"]
    for gi, order in enumerate(r.seats):
        cells = []
        for p in order:
            f = r.factions[(gi, p)]
            rk = prefs[p].index(f) + 1 if f in prefs[p] else None
            cells.append(f"{names[p]}: {FACTIONS[f][0]} ({'#' + str(rk) if rk else 'OFF-LIST'})")
        reach = sum(FACTIONS[r.factions[(gi, p)]][1] for p in order)
        lines.append(f"| {gi+1} | Map {plan.maps[gi]+1} | " + " | ".join(cells) + f" | {reach} |")

    m = plan.meetings(n)
    counts = [m[x][y] for x in range(n) for y in range(x + 1, n)]
    hist = {c: counts.count(c) for c in sorted(set(counts))}
    lines += ["", "## Meetings", "",
              "Pair meeting counts: " + ", ".join(f"{k}x: {v} pairs" for k, v in hist.items())
              + f". Spread {max(counts) - min(counts)}.", "",
              "| Player | " + " | ".join(names) + " |", "|---|" + "---:|" * n]
    for x in range(n):
        lines.append(f"| {names[x]} | " + " | ".join("—" if x == y else str(m[x][y]) for y in range(n)) + " |")

    mc = plan.map_counts(n, r.n_maps)
    reps = map_repeats(r)
    lines += ["", "## Maps and seats", "",
              f"Total map repeats: {sum(reps)} (lower bound for this size: {min_map_repeats(n, g, r.n_maps)}).", "",
              "| Player | " + " | ".join(f"Map {i+1}" for i in range(r.n_maps)) + " | Seats held | Map repeats |",
              "|---|" + "---:|" * r.n_maps + "---|---:|"]
    for p in range(n):
        seats = [row.index(p) + 1 for row in r.seats if p in row]
        lines.append(f"| {names[p]} | " + " | ".join(str(c) for c in mc[p]) + f" | {sorted(seats)} | {reps[p]} |")

    rank_hist = [0] * (max([len(x) for x in prefs] + [5]) + 1)
    lines += ["", "## Factions", "", "| Player | Ranked list | Played | Regret |", "|---|---|---|---:|"]
    for p in range(n):
        played, reg = [], 0
        for (gi, q), f in sorted(r.factions.items()):
            if q != p:
                continue
            rk = prefs[p].index(f) + 1 if f in prefs[p] else 0
            rank_hist[rk] += 1
            reg += (rk - 1) if rk else OFF_LIST_COST
            played.append(f"G{gi+1}: {f} ({'#' + str(rk) if rk else 'OFF'})")
        reg -= sum(range(g))
        lines.append(f"| {names[p]} | {', '.join(prefs[p]) or '—'} | {'; '.join(played)} | {reg} |")
    off, worst, total = score(r.factions, prefs, g)
    lines += ["", "Plays by pick: " + ", ".join(f"#{i}: {rank_hist[i]}" for i in range(1, len(rank_hist)))
              + f", off-list: {rank_hist[0]}.",
              f"Score: off-list {off}, worst player regret {worst}, total regret {total} "
              "(regret 0 = played picks 1 to g).", ""]
    fails = check(r, max_spread)
    lines += ["## Hard rules", "",
              f"- Meeting spread <= {max_spread}, no pair in every game, 4 distinct players per game, "
              f"no faction repeats, reach >= {MIN_REACH}, no repeated seat: "
              + ("pass" if not fails else "FAIL: " + "; ".join(fails))]
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("prefs", nargs="?", help="JSON file: {players: {name: [ranked factions]}}")
    ap.add_argument("--games", type=int, default=4, help="games per player")
    ap.add_argument("--maps", type=int, default=4)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--tries", type=int, default=16, help="candidate schedules to anneal")
    ap.add_argument("--max-spread", type=int, default=MAX_SPREAD)
    ap.add_argument("--feasible", type=int, metavar="N",
                    help="print feasible games-per-player for N players and exit")
    args = ap.parse_args(argv)
    if args.feasible:
        print(feasible_game_counts(args.feasible))
        return 0
    if not args.prefs:
        ap.error("prefs file required")
    with open(args.prefs) as fh:
        data = json.load(fh)
    players = list(data["players"])
    pool = [canon(f) for f in data["pool"]] if data.get("pool") else None
    r = solve(players, data["players"], args.games, args.maps, args.seed, args.tries,
              pool=pool, max_spread=args.max_spread)
    sys.stdout.write(report(r, args.max_spread))
    return 0


if __name__ == "__main__":
    sys.exit(main())
