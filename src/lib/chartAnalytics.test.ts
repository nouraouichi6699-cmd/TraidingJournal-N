// Run: npx tsx src/lib/chartAnalytics.test.ts
import { barsCsv, histogram, maxDrawdownWindow, monteCarlo, rollingSeries, seriesCsv } from "./chartAnalytics";
let pass = 0, fail = 0;
const near = (a: number | null | undefined, b: number | null, tol = 0.01) => (a == null || b == null ? a === b : Math.abs(a - b) <= tol);
const t = (name: string, got: number | null | undefined, exp: number | null, tol = 0.01) => { const ok = near(got, exp, tol); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${got}, expected ${exp}`}`); };
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };

console.log("-- Max drawdown window");
{ // 10000 -> 11000 -> 9900 -> 10500 -> 11200: peak 11000 (t=1), trough 9900 (t=2), back above 11000 at t=4
  const w = maxDrawdownWindow([0, 1, 2, 3, 4], [10000, 11000, 9900, 10500, 11200])!;
  is("peak and trough", w.peakT === 1 && w.troughT === 2 && w.peakV === 11000 && w.troughV === 9900);
  t("depth % = 1100 / 11000", w.pct, 10); t("amount", w.amount, 1100); is("recovered at t=4", w.recoverT === 4);
}
{ const w = maxDrawdownWindow([0, 1, 2], [10000, 11000, 10000])!; is("still under water: recoverT null", w.recoverT === null); }
is("no drawdown -> null", maxDrawdownWindow([0, 1, 2], [1, 2, 3]) === null);
{ // withdrawal of 5000 at t=2 is not a drawdown; the later 100 loss is (100 / 6000 of the index)
  const w = maxDrawdownWindow([0, 1, 2, 3], [10000, 11000, 6000, 5900], [0, 0, -5000, 0])!;
  t("withdrawal ignored: 1.67%", w.pct, (100 / 6000) * 100); t("amount 100", w.amount, 100); is("peak is the withdrawal point (index level)", w.peakT === 2 && w.troughT === 3);
}
{ // deposit 10000 then lose 1000: 5% of the 20000 traded
  const w = maxDrawdownWindow([0, 1, 2], [10000, 20000, 19000], [0, 10000, 0])!;
  t("deposit then loss: 5%", w.pct, 5); t("amount 1000", w.amount, 1000);
}
{ // no starting balance: cumulative P&L from 0, money window only
  const w = maxDrawdownWindow([0, 1, 2, 3], [0, 300, -100, 50])!;
  is("non-positive levels: pct null", w.pct === null); t("money drop 400", w.amount, 400); is("window 1 -> 2", w.peakT === 1 && w.troughT === 2);
}

console.log("-- Rolling metrics");
{ const tr = [10, -5, 0, 20, -10, 5].map((pnl, i) => ({ t: i, pnl }));
  const w = rollingSeries(tr, 3, "win");
  is("one point per trade after the first window", w.length === 4 && w[0].t === 2);
  t("win rate of [10,-5,0] = 1/3", w[0].v, 100 / 3); t("win rate of [20,-10,5] = 2/3", w[3].v, 200 / 3);
  const pf = rollingSeries(tr, 3, "pf");
  t("PF of [10,-5,0] = 2", pf[0].v, 2); t("PF of [0,20,-10] = 2", pf[2].v, 2);
  const e = rollingSeries(tr, 3, "exp");
  t("expectancy of [-5,0,20] = 5", e[1].v, 5);
  is("window without losses: PF point skipped", rollingSeries([1, 2, 3].map((pnl, i) => ({ t: i, pnl })), 2, "pf").length === 0);
  is("fewer trades than the window: empty", rollingSeries(tr, 10, "win").length === 0);
}

console.log("-- Histogram");
{ const h = histogram([-30, -10, -10, 5, 5, 5, 25], 5);
  is("0 is a bin edge (no bin mixes winners and losers)", h.every((b) => b.lo >= 0 || b.hi <= 0), JSON.stringify(h));
  is("every value counted once", h.reduce((s, b) => s + b.count, 0) === 7);
  const b5 = h.find((b) => b.lo <= 5 && 5 < b.hi); is("the three +5 trades share a bin", (b5?.count ?? 0) === 3, JSON.stringify(h));
}
{ const vals = Array.from({ length: 200 }, (_, i) => (i % 2 ? 1 : -1) * (i % 20)); vals.push(5000, -4000);
  const h = histogram(vals, 10);
  is("outliers go to end bins", h[0].edge === "under" && h[h.length - 1].edge === "over" && h[0].count === 1 && h[h.length - 1].count === 1, JSON.stringify(h.map((b) => [b.lo, b.hi, b.count, b.edge])));
  is("all 202 counted", h.reduce((s, b) => s + b.count, 0) === 202);
}
is("same value everywhere: one bin", histogram([7, 7, 7]).length === 1);
is("empty: no bins", histogram([]).length === 0);

console.log("-- Monte Carlo");
{ const a = monteCarlo([10, -5, 3, -2, 8], { paths: 300, seed: 7 })!, b = monteCarlo([10, -5, 3, -2, 8], { paths: 300, seed: 7 })!;
  is("seeded: identical results", JSON.stringify(a) === JSON.stringify(b));
  is("bands are ordered p5 <= p50 <= p95", a.p5.every((x, i) => x <= a.p50[i] + 1e-9 && a.p50[i] <= a.p95[i] + 1e-9));
  is("last step = horizon", a.steps[a.steps.length - 1] === a.horizon && a.horizon === 5);
}
{ const c = monteCarlo([2, 2, 2], { paths: 50, horizon: 10 })!;
  t("constant +2: every percentile ends at 20", c.finalP5, 20); t("p95 too", c.finalP95, 20); t("probability of profit 100%", c.probProfit, 100); t("no drawdown", c.ddP95, 0);
}
{ const s = monteCarlo([1, -1], { paths: 4000, horizon: 100, seed: 3 })!;
  t("fair coin: median near 0", s.finalP50, 0, 2.01); t("fair coin: ~half the paths profit", s.probProfit, 46, 6);
  t("fair coin: 95% band ~ +/- 1.645*sqrt(100)", s.finalP95, 16.45, 2.5);
}
is("fewer than 2 trades: null", monteCarlo([5]) === null);

console.log("-- CSV");
{ const csv = seriesCsv([{ name: "All", pts: [{ t: Date.UTC(2026, 0, 1, 10), v: 1.234 }, { t: Date.UTC(2026, 0, 2, 10), v: 2 }] }, { name: 'EUR,"USD"', pts: [{ t: Date.UTC(2026, 0, 2, 10), v: 5 }] }]);
  is("header with escaped name", csv.split("\n")[0] === 'date,All,"EUR,""USD"""', csv.split("\n")[0]);
  is("rows: carried forward, empty before first value", csv.split("\n")[1] === "2026-01-01 10:00,1.23," && csv.split("\n")[2] === "2026-01-02 10:00,2,5", csv);
  is("bars csv", barsCsv([{ label: "Mon", v: 12.5, n: 3 }], ["period", "pnl", "trades"]) === "period,pnl,trades\nMon,12.5,3");
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
