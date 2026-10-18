// Run: npx tsx src/lib/tradeOutcomes.test.ts
import { ALL_KEYS, computeTradeOutcomes, type TradeOutcomes } from "./tradeOutcomes";
import { computeOverview } from "./stats";
import type { Account, Trade } from "../types";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + info}`); };
const eq = (a: number | null | undefined, b: number | null, tol = 1e-6) => (a == null || b == null ? a === b : Math.abs(a - b) <= tol);
const expectKeys = (name: string, o: TradeOutcomes, exp: Partial<TradeOutcomes>, tol = 1e-6) => {
  const bad = (Object.keys(exp) as (keyof TradeOutcomes)[]).filter((k) => !eq(o[k], exp[k] as number | null, tol));
  check(name, bad.length === 0, bad.map((k) => `${k}: got ${o[k]}, expected ${exp[k]}`).join("; "));
};

let k = 0;
const mk = (pnl: number | null, date: string, time = "10:00", st: "closed" | "open" = "closed"): Trade => ({ key: String(k++), accountId: "a", no: k, symbol: "X", side: "long", qty: 1, entryTime: `${date}T09:00`, entryPrice: 1, exitTime: `${date}T${time}`, exitPrice: 1, pnl, returnPct: null, commission: 0, sl: null, tp: null, status: st } as Trade);
// sequence helper: one trade per day, consecutive days
const seq = (v: number[]) => v.map((x, i) => mk(x, `2026-01-${String(i + 1).padStart(2, "0")}`));
const run = (t: Trade[], start = 1000) => computeTradeOutcomes(t, start);

// 1 structure + empty
{ const o = run([]); check("empty: exactly 50 keys", Object.keys(o).length === 50 && ALL_KEYS.length === 50 && ALL_KEYS.every((x) => x in o));
  expectKeys("empty: counts 0, rates/ratios null, streaks 0", o, { totalTrades: 0, winningTrades: 0, winRate: null, dailyWinRate: null, profitFactor: null, tradeExpectancy: null, medianTradePnl: null, expectancyPct: null, outcomeRuns: 0, maxWinStreak: 0, currentWinStreak: 0, maxConsecutiveProfit: null, topTradeProfitConc: null, longestTradesWithoutWin: 0 });
  check("empty: no NaN/Infinity/-0", ALL_KEYS.every((x) => o[x] === null || (Number.isFinite(o[x] as number) && !Object.is(o[x], -0)))); }
// 2 one trade
{ expectKeys("1 win trade", run(seq([100])), { totalTrades: 1, winningTrades: 1, winRate: 100, lossRate: 0, breakevenRate: 0, dailyWinRate: 100, winningDays: 1, profitFactor: null, payoffRatio: null, breakevenWinRate: null, winRateEdge: null, medianTradePnl: 100, medianWinningTrade: 100, medianLosingTrade: null, largestWinningTrade: 100, largestLosingTrade: null, expectancyPct: 10, outcomeRuns: 1, alternationRate: null, runsZScore: null, currentWinStreak: 1, currentLossStreak: 0, maxLossStreak: 0, avgWinStreak: 1, avgLossStreak: null, topTradeProfitConc: 100, topFiveProfitConc: 100, worstTradeLossConc: null, winRateAfterWin: null }); }
// 3 all wins
{ expectKeys("all wins [10,20,30]", run(seq([10, 20, 30])), { profitFactor: null, payoffRatio: null, maxWinStreak: 3, avgWinStreak: 3, maxConsecutiveProfit: 60, maxConsecutiveLoss: null, winRateAfterWin: 100, winRateAfterLoss: null, topTradeProfitConc: 50, topFiveProfitConc: 100, longestTradesWithoutLoss: 3, longestTradesWithoutWin: 0, maxWinDayStreak: 3 }); }
// 4 all losses
{ expectKeys("all losses [-10,-20]", run(seq([-10, -20])), { profitFactor: 0, winRate: 0, lossRate: 100, maxLossStreak: 2, maxConsecutiveLoss: -30, worstTradeLossConc: (20 / 30) * 100, worstFiveLossConc: 100, avgPnlAfterLoss: -20, winRateAfterLoss: 100, alternationRate: 0, runsZScore: null, averageLosingTrade: -15, largestLosingTrade: -20, largestWinningTrade: null, currentLossStreak: 2, currentLossDayStreak: 2 }); }
// 5 breakeven in the middle
{ expectKeys("breakeven in the middle [10,0,-5]", run(seq([10, 0, -5])), { breakevenTrades: 1, winRate: 100 / 3, breakevenRate: 100 / 3, payoffRatio: 2, breakevenWinRate: 100 / 3, winRateEdge: 0, outcomeRuns: 2, alternationRate: 100, longestTradesWithoutWin: 2, longestTradesWithoutLoss: 2, runsZScore: null, breakevenDays: 1, maxWinStreak: 1, maxLossStreak: 1 }); }
// 6 medians
{ expectKeys("even-count median [1,2,3,10]", run(seq([1, 2, 3, 10])), { medianTradePnl: 2.5, medianWinningTrade: 2.5, averageTradePnl: 4, tradeExpectancy: 4 });
  expectKeys("odd-count median + loser median [5,-1,-7,-3]", run(seq([5, -1, -7, -3])), { medianTradePnl: -2, medianLosingTrade: -3, medianWinningTrade: 5 }); }
// 7 same-day trades
{ expectKeys("same-day trades [10,-4,2] -> one winning day", run([mk(10, "2026-02-02", "09:00"), mk(-4, "2026-02-02", "10:00"), mk(2, "2026-02-02", "11:00")]), { winningDays: 1, losingDays: 0, dailyWinRate: 100, maxWinDayStreak: 1, totalTrades: 3 }); }
// 8 day with net 0
{ expectKeys("net-0 day is breakeven and ignored in day streaks", run([mk(5, "2026-02-02", "09:00"), mk(-5, "2026-02-02", "10:00"), mk(3, "2026-02-03")]), { breakevenDays: 1, winningDays: 1, dailyWinRate: 50, maxWinDayStreak: 1, currentWinDayStreak: 1 }); }
// 9 fewer than 5 wins
{ expectKeys("fewer than 5 wins -> top-5 = 100%", run(seq([10, 10, 10, -5])), { topTradeProfitConc: (10 / 30) * 100, topFiveProfitConc: 100, worstTradeLossConc: 100 }); }
{ expectKeys("top-5 with 6 wins [1..6]", run(seq([1, 2, 3, 4, 5, 6])), { topFiveProfitConc: (20 / 21) * 100, topTradeProfitConc: (6 / 21) * 100 }); }
// 10 start balance
{ expectKeys("startBalance 0 -> expectancyPct null", run(seq([100]), 0), { expectancyPct: null });
  expectKeys("balance-before <= 0 -> expectancyPct null", run(seq([-150, 10]), 100), { expectancyPct: null });
  expectKeys("expectancyPct [100,-55] on 1000 = 2.5", run(seq([100, -55]), 1000), { expectancyPct: 2.5 });
  expectKeys("expectancyPct [100,-110] on 1000 = 0 (not -0)", run(seq([100, -110]), 1000), { expectancyPct: 0 }); }
// 11 Wald-Wolfowitz Z
{ expectKeys("alternating W L W L W L: runs 6, Z = 2/sqrt(1.2)", run(seq([1, -1, 1, -1, 1, -1])), { outcomeRuns: 6, runsZScore: 2 / Math.sqrt(1.2), alternationRate: 100 });
  expectKeys("W W L W L L: runs 4, Z = 0", run(seq([1, 1, -1, 1, -1, -1])), { outcomeRuns: 4, runsZScore: 0 }); }
// 12 dependence
{ expectKeys("after-win / after-loss [W W L W L L]", run(seq([2, 4, -1, 6, -3, -5])), { winRateAfterWin: (1 / 3) * 100, winRateAfterLoss: 50, avgPnlAfterWin: (4 + -1 + -3) / 3, avgPnlAfterLoss: (6 + -5) / 2 }); }
// 13 streaks
{ expectKeys("streaks [W W L] current/avg", run(seq([1, 2, -3])), { currentLossStreak: 1, currentWinStreak: 0, maxWinStreak: 2, avgWinStreak: 2, avgLossStreak: 1, maxConsecutiveProfit: 3, maxConsecutiveLoss: -3 });
  expectKeys("breakeven does not break a streak [W 0 W]", run(seq([1, 0, 2])), { maxWinStreak: 2, outcomeRuns: 1, maxConsecutiveProfit: 3 });
  expectKeys("longest run without a win [-1,0,-2,5,-1]", run(seq([-1, 0, -2, 5, -1])), { longestTradesWithoutWin: 3, longestTradesWithoutLoss: 1 }); }
// 14 ordering + open ignored
{ const t = [mk(-3, "2026-03-03"), mk(1, "2026-03-01"), mk(2, "2026-03-02"), mk(99, "2026-03-04", "10:00", "open")];
  expectKeys("sorted by close time, open ignored: [1,2,-3]", run(t), { totalTrades: 3, currentLossStreak: 1, maxWinStreak: 2 }); }
// 15 equal close time -> ticket order
{ const a = mk(5, "2026-04-01"), b = mk(-5, "2026-04-01"); expectKeys("same close time ordered by ticket (no)", run([b, a]), { currentLossStreak: 1, outcomeRuns: 2 }); }
// 16 single source of truth with Overview
{ const t = seq([30, -10, 0, 25, -40, 12, -7]); const o = run(t), ov = computeOverview(t, [{ id: "a", name: "A", startBalance: 1000 } as Account], {});
  const pairs: [number | null, number | null, string][] = [[o.totalTrades, ov.n, "totalTrades"], [o.winRate, ov.winRate, "winRate"], [o.breakevenRate, ov.beRate, "breakevenRate"], [o.profitFactor, ov.pf, "profitFactor"], [o.tradeExpectancy, ov.avgTrade, "expectancy"], [o.payoffRatio, ov.payoff, "payoff"], [o.averageWinningTrade, ov.avgWin, "avgWin"], [o.averageLosingTrade, ov.avgLoss, "avgLoss"], [o.largestWinningTrade, ov.best, "largestWin"], [o.largestLosingTrade, ov.worst, "largestLoss"], [o.averageTradePnl, ov.avgTrade, "avgTrade"]];
  check("Overview and Trade outcomes return identical shared values", pairs.every(([a, b]) => eq(a, b, 0)), pairs.filter(([a, b]) => !eq(a, b, 0)).map((x) => x[2]).join(",")); }

// (reference-dataset check removed; add a new one here when available)
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
