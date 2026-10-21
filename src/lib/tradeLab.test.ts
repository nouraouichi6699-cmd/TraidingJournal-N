// Run: npx tsx src/lib/tradeLab.test.ts
import { applyWhatIf, cumCurve, edgeAlerts, heatmap, labStats, propCheck, rMultiple, tiltSplit } from "./tradeLab";
import type { Trade } from "../types";
let pass = 0, fail = 0;
const near = (a: number | null | undefined, b: number | null, tol = 0.01) => (a == null || b == null ? a === b : Math.abs(a - b) <= tol);
const t = (name: string, got: number | null | undefined, exp: number | null, tol = 0.01) => { const ok = near(got, exp, tol); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${got}, expected ${exp}`}`); };
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
let k = 0;
// 2026-01-05 is a Monday.
const T = (entry: string, exit: string, pnl: number, o: Partial<Trade> = {}): Trade => ({ key: `a:${++k}`, accountId: "a", no: k, symbol: "EURUSD", side: "long", qty: 1, entryTime: entry, entryPrice: 1.1, exitTime: exit, exitPrice: 1.2, pnl, returnPct: null, commission: 0, status: "closed", ...o } as Trade);

console.log("-- What-if");
const wk = [
  T("2026-01-05T08:00", "2026-01-05T09:00", -50),                     // Mon London, loss
  T("2026-01-05T09:30", "2026-01-05T10:00", -40),                     // Mon London, loss (2nd)
  T("2026-01-05T10:30", "2026-01-05T11:00", 100),                     // Mon: opened after 2 losses
  T("2026-01-09T15:00", "2026-01-09T16:00", -300, { symbol: "XAUUSD" }), // Fri NY gold, big loss
  T("2026-01-06T02:00", "2026-01-06T03:00", 30, { side: "short" }),   // Tue Tokyo short
];
t("actual net", labStats(wk).net, -260);
t("without Fridays", labStats(applyWhatIf(wk, { weekdays: [4] })).net, 40);
t("without the Tokyo session", labStats(applyWhatIf(wk, { sessions: ["sessTK"] })).net, -290);
t("without XAUUSD", labStats(applyWhatIf(wk, { symbols: ["XAUUSD"] })).net, 40);
t("long only", labStats(applyWhatIf(wk, { side: "long" })).net, -290);
t("stop after 2 losses: Monday's 3rd trade skipped", labStats(applyWhatIf(wk, { stopAfterLosses: 2 })).net, -360);
t("max 1 trade per day", labStats(applyWhatIf(wk, { maxPerDay: 1 })).net, -320);
t("cap each loss at 100", labStats(applyWhatIf(wk, { maxLoss: 100 })).net, -60);
{ // a loss still open when the next trade starts does not count yet
  const x = [T("2026-01-05T08:00", "2026-01-05T12:00", -50), T("2026-01-05T09:00", "2026-01-05T09:30", -10), T("2026-01-05T10:00", "2026-01-05T10:30", 20)];
  t("only losses already closed count", labStats(applyWhatIf(x, { stopAfterLosses: 2 })).n, 3);
}
{ // day rules are per account: the same trade copied to a second account is not blocked by the first one
  const x = [T("2026-01-05T08:00", "2026-01-05T09:00", -50), T("2026-01-05T08:00", "2026-01-05T09:00", -50, { accountId: "b" }), T("2026-01-05T09:30", "2026-01-05T10:00", 70), T("2026-01-05T09:30", "2026-01-05T10:00", 70, { accountId: "b" })];
  t("max 1 per day keeps the first trade of each account", labStats(applyWhatIf(x, { maxPerDay: 1 })).net, -100);
  t("stop after 1 loss: each account stops after its own loss", labStats(applyWhatIf(x, { stopAfterLosses: 1 })).net, -100);
}
{ const s = labStats(wk); t("max drawdown of cumulative P&L (peak +40 -> -260)", s.maxDD, 300); t("win rate 2/5", s.winRate, 40); t("PF 130/390", s.pf, 130 / 390); }
is("curve starts at 0 and ends at net", (() => { const c = cumCurve(wk); return c[0].v === 0 && c[c.length - 1].v === -260; })());

console.log("-- Heatmap");
{ const h = heatmap(wk);
  is("Monday 08h has one -50 trade", h[0][8].n === 1 && h[0][8].net === -50 && h[0][8].wins === 0);
  is("Friday 15h has the gold loss", h[4][15].n === 1 && h[4][15].net === -300);
  is("all trades placed", h.flat().reduce((s, c) => s + c.n, 0) === 5);
}

console.log("-- R multiples");
t("long: +2R (stop 1.0900, exit 1.1200)", rMultiple(T("", "2026-01-05T10:00", 1, { entryPrice: 1.1, sl: 1.09, exitPrice: 1.12 })), 2);
t("short: -1R (stop 1.1100, exit 1.1100)", rMultiple(T("", "2026-01-05T10:00", 1, { side: "short", entryPrice: 1.1, sl: 1.11, exitPrice: 1.11 })), -1);
is("no stop loss: null", rMultiple(T("", "2026-01-05T10:00", 1, { sl: null })) === null);
is("stop moved to breakeven: null", rMultiple(T("", "2026-01-05T10:00", 1, { entryPrice: 1.1, sl: 1.1 })) === null);

console.log("-- Revenge trading");
{ const x = [
    T("2026-01-05T08:00", "2026-01-05T09:00", -50, { qty: 1 }),
    T("2026-01-05T09:10", "2026-01-05T09:40", 20, { qty: 2 }),  // 10 min after a loss, bigger size
    T("2026-01-05T09:50", "2026-01-05T10:20", -30, { qty: 1 }), // previous trade (09:40) was a win -> normal
    T("2026-01-05T10:30", "2026-01-05T11:00", 10, { qty: 1 }),  // 10 min after the -30 loss, same size
    T("2026-01-05T13:00", "2026-01-05T13:30", 5, { qty: 3 }),   // 2h after a win -> normal
    T("2026-01-05T09:05", "2026-01-05T09:20", 7, { qty: 1, accountId: "b" }), // other account: its own history
  ];
  const g = tiltSplit(x, 30);
  is("after a loss, bigger size", g.afterLossBigger.length === 1 && g.afterLossBigger[0].pnl === 20);
  is("after a loss, same size", g.afterLoss.length === 1 && g.afterLoss[0].pnl === 10);
  is("everything else is normal (incl. the other account)", g.normal.length === 4);
  is("window: 5 minutes keeps them normal", tiltSplit(x, 5).normal.length === 6);
}

console.log("-- Prop-firm rules (start 10,000: daily 5%, max 10%, target 10%)");
{ const at = (x: string) => Date.parse(`${x}Z`);
  const curve = [{ t: at("2026-01-05T00:00"), v: 10000 }, { t: at("2026-01-05T09:00"), v: 10600 }, { t: at("2026-01-06T09:00"), v: 9500 }, { t: at("2026-01-07T09:00"), v: 11100 }];
  const day = (d: string, p: number) => T(`${d}T08:00`, `${d}T09:00`, p);
  const r = propCheck(curve, [day("2026-01-05", 600), day("2026-01-06", -1100), day("2026-01-07", 1600)], 10000, { dailyLossPct: 5, maxDDPct: 10, targetPct: 10, trailing: false })!;
  is("daily loss breach on the -1,100 day", r.dailyBreaches.length === 1 && r.dailyBreaches[0].day === "2026-01-06");
  is("static floor 9,000 not breached", r.floorBreachT === null && r.floor.every((p) => p.v === 9000));
  is("target reached at 11,100 but after the breach: failed", r.targetT === curve[3].t && r.status === "failed" && r.failT === curve[2].t);
  const tr = propCheck(curve, [], 10000, { dailyLossPct: 0, maxDDPct: 10, targetPct: 0, trailing: true })!;
  is("trailing floor follows the peak (10,600 - 1,000 = 9,600) and 9,500 breaks it", tr.floorBreachT === curve[2].t && tr.floor[2].v === 9600 && tr.status === "failed");
  const ok = propCheck([{ t: 0, v: 10000 }, { t: 1, v: 11000 }], [], 10000, { dailyLossPct: 5, maxDDPct: 10, targetPct: 10, trailing: false })!;
  is("target first: passed", ok.status === "passed" && ok.toTarget === 0);
  is("no start balance: null", propCheck(curve, [], 0, { dailyLossPct: 5, maxDDPct: 10, targetPct: 10, trailing: false }) === null);
}

console.log("-- Edge alerts (last 5 trades)");
{ const mk = (vals: number[], acc = "a") => vals.map((p, i) => T(`2026-02-${String(i + 1).padStart(2, "0")}T08:00`, `2026-02-${String(i + 1).padStart(2, "0")}T09:00`, p, { accountId: acc }));
  const base = mk([10, 10, 10, 10, 10, -20, -20, -20, -20]);
  const a = edgeAlerts(base, 5);
  is("negative expectancy -> one alert", a.length === 1 && a[0].accountId === "a");
  t("expectancy of the last 5 = (10-80)/5", a[0]?.exp, -14);
  t("win rate of the last 5 = 20%", a[0]?.winRate, 20);
  const longer = edgeAlerts([...base, T("2026-02-10T08:00", "2026-02-10T09:00", -5)], 5);
  is("same alert while the run continues (same key)", longer[0]?.key === a[0]?.key);
  is("positive edge -> no alert", edgeAlerts(mk([5, 5, 5, 5, 5, 5]), 5).length === 0);
  is("fewer trades than the window -> no alert", edgeAlerts(mk([-5, -5]), 5).length === 0);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
