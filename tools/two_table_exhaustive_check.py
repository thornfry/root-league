# Exhaustive: 10 players, 5 slots of 2 tables, each player sits out once.
# WLOG slot k's byes are {2k, 2k+1}. Is there a schedule where every pair meets 1 or 2 times?
import itertools
from collections import Counter
N=10
splits=[]
for k in range(5):
    pl=[p for p in range(N) if p//2!=k]
    s=[]
    for t in itertools.combinations(pl[1:],3):
        a=(pl[0],)+t; b=tuple(p for p in pl if p not in a)
        s.append((a,b))
    splits.append(s)
pairs=list(itertools.combinations(range(N),2))
cnt=Counter(); found=0; best_zero=99; dist=Counter()
def add(t,d):
    for p in itertools.combinations(t,2): cnt[p]+=d
def ok():
    return all(v<=2 for v in cnt.values())
def rec(k):
    global found,best_zero
    if k==5:
        z=sum(1 for p in pairs if cnt[p]==0)
        three=sum(1 for p in pairs if cnt[p]>=3)
        dist[(z,three)]+=1
        if z==0: found+=1
        return
    for a,b in splits[k]:
        add(a,1); add(b,1)
        if ok(): rec(k+1)
        add(a,-1); add(b,-1)
rec(0)
print("spread<=1 schedules:", found)
print("(pairs never meeting, pairs meeting 3+) with max<=2:", sorted(dist.items())[:5])
