import json, sys
r = json.load(open(sys.argv[1]))
out = sys.argv[2]

panels = []
for o in r:
    recs = {int(k): v for k, v in o["records"].items()}
    ws = list(range(0, max(recs) + 1))
    ymax = 6
    H, W, bw = 150, 44, 22
    bars = []
    for i, w in enumerate(ws):
        d = recs.get(w, {"expected": 0, "make_final": 0})
        e, m = d["expected"], d["make_final"]
        if e < 0.005:
            continue
        cls = "in" if m >= 0.99 else ("out" if m < 0.01 else "bubble")
        h = max(2, e / ymax * H)
        x = 30 + i * W + (W - bw) / 2
        y = 10 + H - h
        lab = "always" if m >= 0.995 else ("never" if m < 0.005 else f"{m:.0%}")
        tip = f"{w} wins: {e:.2f} players expected; {m:.1%} make the final"
        bars.append(
            f'<g class="hit"><title>{tip}</title>'
            f'<rect x="{x - 10}" y="10" width="{bw + 20}" height="{H}" fill="transparent"/>'
            f'<path class="{cls}" d="M{x},{10+H} V{y+4} q0,-4 4,-4 h{bw-8} q4,0 4,4 V{10+H} Z"/>'
            f'<text class="val" x="{x + bw/2}" y="{y - 5}">{lab}</text>'
            f'<text class="ax" x="{x + bw/2}" y="{H + 26}">{w}</text></g>')
    grid = "".join(
        f'<line class="grid" x1="30" x2="{30 + len(ws)*W}" y1="{10 + H - g/ymax*H}" y2="{10 + H - g/ymax*H}"/>'
        f'<text class="ax yl" x="24" y="{14 + H - g/ymax*H}">{g}</text>' for g in (0, 2, 4, 6))
    lv = dict(o["levels"]); pl = o["place_after_sos"]; lv["draw"] = lv["last"] - pl; lv["places"] = pl
    width = 30 + len(ws) * W + 4
    panels.append(f'''<div class="panel"><div class="ptitle">{o["name"]}{" (chosen)" if o["players"]==12 and o["games_each"]==4 else ""} &middot; {o["total_games"]} games, ~{o["hours"]}h</div>
<svg width="{width}" height="{H + 34}" role="img" aria-label="{o['name']}">{grid}{"".join(bars)}</svg>
<div class="levels"><span class="seg s1" style="flex:{lv['wins']}" title="Wins alone {lv['wins']:.0%}"></span><span class="seg s2" style="flex:{lv['sos']}" title="Strength of schedule {lv['sos']:.0%}"></span><span class="seg s3" style="flex:{lv['places']}" title="Finishing places {lv['places']:.0%}"></span><span class="seg s4" style="flex:{lv['draw']}" title="Random draw {lv['draw']:.0%}"></span></div>
<div class="lvtext">{lv['wins']:.0%} wins &middot; {lv['sos']:.0%} SoS &middot; {lv['places']:.0%} places &middot; <b>{lv['draw']:.0%} draw</b></div></div>''')

html = f'''<!doctype html><html><head><meta charset="utf-8"><style>
:root {{ --in: var(--chart-1); --bubble: var(--chart-2); --out: var(--muted-foreground); }}
body {{ font-family: var(--font-sans); color: var(--foreground); margin: 0; }}
h3 {{ font-size: 15px; margin: 0 0 2px; }}
.sub {{ color: var(--muted-foreground); font-size: 12px; margin-bottom: 10px; }}
.legend {{ display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--muted-foreground); margin-bottom: 8px; }}
.legend i {{ display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }}
.grid-wrap {{ display: flex; flex-wrap: wrap; gap: 18px 22px; }}
.panel {{ min-width: 0; }}
.ptitle {{ font-size: 12px; font-weight: 600; margin-bottom: 2px; }}
svg {{ display: block; overflow: visible; }}
.grid {{ stroke: var(--border); stroke-width: 1; }}
.ax {{ fill: var(--muted-foreground); font-size: 11px; text-anchor: middle; }}
.yl {{ text-anchor: end; }}
.val {{ fill: var(--foreground); font-size: 10.5px; text-anchor: middle; }}
path.in {{ fill: var(--in); }} path.bubble {{ fill: var(--bubble); }} path.out {{ fill: var(--out); opacity: .55; }}
.hit:hover path {{ opacity: .8; }}
.levels {{ display: flex; gap: 2px; height: 8px; margin-top: 4px; }}
.seg {{ border-radius: 2px; min-width: 2px; }}
.s1 {{ background: var(--chart-3); }} .s2 {{ background: var(--chart-4); }} .s3 {{ background: var(--chart-5); }} .s4 {{ background: var(--chart-6); }}
.lvtext {{ font-size: 11px; color: var(--muted-foreground); margin-top: 3px; }}
.lvtext b {{ color: var(--foreground); font-weight: 600; }}
</style></head><body>
<h3>Expected players on each win count, and the chance that record makes the final</h3>
<div class="sub">Top 4 make the final, equal skill, random winners, {r[0]['runs']:,} runs per option, one final game. X axis is qualifying wins, Y axis is expected players. The strip under each chart shows what settles the cut.</div>
<div class="legend"><span><i style="background:var(--in)"></i>always makes the final</span><span><i style="background:var(--bubble)"></i>bubble record (label = chance)</span><span><i style="background:var(--out);opacity:.55"></i>never makes it</span>
<span><i style="background:var(--chart-3)"></i>settled by wins</span><span><i style="background:var(--chart-4)"></i>by strength of schedule</span><span><i style="background:var(--chart-5)"></i>by finishing places</span><span><i style="background:var(--chart-6)"></i>random draw</span></div>
<div class="grid-wrap">{"".join(panels)}</div>
</body></html>'''
open(out, "w").write(html)
