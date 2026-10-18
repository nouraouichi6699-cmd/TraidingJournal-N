import csv, json, math, statistics
from datetime import datetime
rows=list(csv.DictReader(open("test-data/MT5_test_dataset_650_trades_2025/MT5_synthetic_650_trades_2025.csv",encoding="utf-8-sig")))
rows.sort(key=lambda r:(datetime.strptime(r["Close Time"],"%Y.%m.%d %H:%M:%S"),int(r["Ticket"])))
p=[float(r["Net Profit"]) for r in rows]; n=len(p); start=10000.0
w=[x for x in p if round(x,2)>0]; l=[x for x in p if round(x,2)<0]
gp=sum(w); gl=-sum(l); net=sum(p)
out={"n":n,"net":net,"wins":len(w),"losses":len(l),"winRate":len(w)/n*100,"pf":gp/gl,"avgWin":gp/len(w),"avgLoss":-gl/len(l),"payoff":(gp/len(w))/(gl/len(l)),
"best":max(w),"worst":min(l),"avgTrade":net/n,"median":statistics.median(p),"totalReturn":net/start*100,
"commissions":-sum(abs(float(r["Commission"])) for r in rows)}
# balance curve incl. start
bal=[start]; 
for x in p: bal.append(bal[-1]+x)
peak=bal[0]; mdd=0; maxamt=0
for b in bal:
    peak=max(peak,b); mdd=max(mdd,(peak-b)/peak); maxamt=max(maxamt,peak-b)
out["maxBalDD"]=mdd*100; out["recovery"]=net/maxamt
# streaks (trades)
def runs(seq):
    r=[]
    for o in seq:
        if r and r[-1][0]==o: r[-1][1]+=1
        else: r.append([o,1])
    return r
S=["W" if round(x,2)>0 else "L" for x in p if round(x,2)!=0]
R=runs(S); out["maxWinStreak"]=max(c for o,c in R if o=="W"); out["maxLossStreak"]=max(c for o,c in R if o=="L"); out["outcomeRuns"]=len(R)
n1=S.count("W"); n2=S.count("L"); nn=n1+n2; mu=2*n1*n2/nn+1; var=2*n1*n2*(2*n1*n2-nn)/(nn*nn*(nn-1)); out["runsZScore"]=(len(R)-mu)/math.sqrt(var)
# days
days={}
for r,x in zip(rows,p): d=r["Close Time"][:10]; days[d]=days.get(d,0)+x
dv=[round(v,2) for k,v in sorted(days.items())]
out["tradingDays"]=len(dv); out["winningDays"]=sum(v>0 for v in dv); out["losingDays"]=sum(v<0 for v in dv); out["dailyWinRate"]=out["winningDays"]/len(dv)*100
DR=runs(["W" if v>0 else "L" for v in dv if v!=0]); out["maxWinDayStreak"]=max(c for o,c in DR if o=="W"); out["maxLossDayStreak"]=max(c for o,c in DR if o=="L")
# max consecutive profit/loss sums
sums={"W":[], "L":[]}; i=0; seqv=[x for x in p if round(x,2)!=0]; cur=None; s=0
for x in seqv:
    o="W" if x>0 else "L"
    if o!=cur:
        if cur: sums[cur].append(s)
        cur=o; s=0
    s+=x
sums[cur].append(s)
out["maxConsecutiveProfit"]=max(sums["W"]); out["maxConsecutiveLoss"]=min(sums["L"])
out["topTradeProfitConc"]=max(w)/gp*100; out["topFiveProfitConc"]=sum(sorted(w,reverse=True)[:5])/gp*100
out["worstTradeLossConc"]=abs(min(l))/gl*100; out["worstFiveLossConc"]=abs(sum(sorted(l)[:5]))/gl*100
out["avgHoldMin"]=sum((datetime.strptime(r["Close Time"],"%Y.%m.%d %H:%M:%S")-datetime.strptime(r["Open Time"],"%Y.%m.%d %H:%M:%S")).total_seconds()/60 for r in rows)/n
out["volume"]=sum(float(r["Size"]) for r in rows)
out["breakevenWinRate"]=100/(1+out["payoff"]); out["winRateEdge"]=out["winRate"]-out["breakevenWinRate"]
json.dump(out,open("test-data/MT5_test_dataset_650_trades_2025/expected_independent.json","w"),indent=1)
print(json.dumps({k:round(v,4) for k,v in out.items()}))
