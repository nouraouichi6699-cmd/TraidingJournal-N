// Run: npx tsx src/lib/tradeLab.test.ts
import { applyWhatIf, cumCurve, currentRisk, edgeAlerts, findRules, heatmap, labStats, logGrowth, propCheck, propOdds, rMultiple, sizing, tiltSplit, weeklyReport } from "./tradeLab";
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
{ // the daily limit is checked during the day: -600 then +500 (day total -100) still breaks a 500 limit
  const x = [T("2026-01-08T08:00", "2026-01-08T09:00", -600), T("2026-01-08T10:00", "2026-01-08T11:00", 500)];
  const r = propCheck([{ t: 0, v: 10000 }, { t: Date.parse("2026-01-08T11:00Z"), v: 9900 }], x, 10000, { dailyLossPct: 5, maxDDPct: 0, targetPct: 0, trailing: false })!;
  is("intraday breach found", r.dailyBreaches.length === 1 && r.dailyBreaches[0].day === "2026-01-08", JSON.stringify(r.dailyBreaches));
  t("breach shows the day's low (-600)", r.dailyBreaches[0]?.pnl, -600);
  is("breach time = close of the trade that broke it", r.dailyBreaches[0]?.t === Date.parse("2026-01-08T09:00Z"));
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

console.log("-- Golden rules");
{ // 4 weeks: Mon-Thu +50, Fri -100 (all London, long, EURUSD)
  const x: Trade[] = [];
  for (const mon of ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]) for (let d = 0; d < 5; d++) {
    const day = new Date(Date.parse(`${mon}T00:00Z`) + d * 86400e3).toISOString().slice(0, 10);
    x.push(T(`${day}T09:00`, `${day}T10:00`, d === 4 ? -100 : 50));
  }
  const r = findRules(x, { minRemoved: 2 });
  is("one rule: skip Friday", r.length === 1 && r[0].kind === "weekday" && r[0].value === 4, JSON.stringify(r.map((i) => [i.kind, i.value, i.gain])));
  t("gain +400 (four -100 Fridays)", r[0]?.gain, 400);
  t("4 trades removed", r[0]?.removed, 4);
  t("max drawdown 100 -> 0", r[0]?.ddChange, -100);
  is("helps in both halves", r[0]?.both === true);
  is("default minimum (5 trades) rejects removing only 4", findRules(x).length === 0);
}
{ // XAUUSD lost in the first half only: still a gain overall, but not in both halves
  const days = ["05", "06", "07", "08", "09", "12", "13", "14", "15", "16", "19", "20"].map((d) => `2026-01-${d}`);
  const pn = [50, -100, 50, -100, 50, -100, 50, 20, 50, 20, 50, 20];
  const x = days.map((d, i) => T(`${d}T09:00`, `${d}T10:00`, pn[i], { symbol: i % 2 ? "XAUUSD" : "EURUSD" }));
  const r = findRules(x);
  const xau = r.find((i) => i.kind === "symbol" && i.value === "XAUUSD");
  t("skip XAUUSD gains +240", xau?.gain, 240);
  is("but only in the first half", xau?.both === false);
  is("skipping EURUSD (the winner) is not suggested", !r.some((i) => i.kind === "symbol" && i.value === "EURUSD"));
  is("fewer than 10 trades: nothing", findRules(x.slice(0, 9)).length === 0);
}

console.log("-- Challenge odds (start 10,000)");
{ const mk = (p: number[]) => p.map((v, i) => { const d = new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10); return T(`${d}T09:00`, `${d}T10:00`, v); });
  const up = propOdds(mk(Array(10).fill(600)), 10000, { dailyLossPct: 5, maxDDPct: 10, targetPct: 10, trailing: false })!;
  t("+600 every day: always passes", up.pass, 100); t("on day 2 (11,200)", up.medianDays, 2);
  const down = propOdds(mk(Array(10).fill(-600)), 10000, { dailyLossPct: 5, maxDDPct: 10, targetPct: 10, trailing: false })!;
  t("-600 every day breaks the 500 daily limit: always fails", down.fail, 100); t("never passes", down.medianDays, null);
  const flat = propOdds(mk(Array(10).fill(300)), 10000, { dailyLossPct: 5, maxDDPct: 10, targetPct: 0, trailing: false })!;
  t("no target, no breach: always open", flat.open, 100);
  // +-1000 days (fair coin): pass at +1 step, fail below the 9,000 floor (2 steps down) -> gambler's ruin 2/3
  const coin = propOdds(mk([...Array(10).fill(1000), ...Array(10).fill(-1000)]), 10000, { dailyLossPct: 0, maxDDPct: 10, targetPct: 10, trailing: false })!;
  t("fair coin: pass ~66.7% (Monte Carlo, +-3 points)", coin.pass, 200 / 3, 3);
  t("pass + fail + open = 100", coin.pass + coin.fail + coin.open, 100);
  t("fewer than 10 trading days: null", propOdds(mk([1, 2, 3]), 10000, { dailyLossPct: 5, maxDDPct: 10, targetPct: 10, trailing: false }) as null, null);
}

console.log("-- Position size");
{ const rep = (a: number[], n: number) => Array.from({ length: n }, () => a).flat();
  t("log growth at 25% on +2R / -1R = 0.5 ln 1.125", logGrowth([2, -1], 0.25), 0.5 * Math.log(1.125), 1e-9);
  const a = sizing(rep([2, -1], 10))!;
  t("Kelly of +2R/-1R at 50% = 0.25", a.kelly, 0.25, 0.001);
  t("half Kelly 0.125", a.half.f, 0.125, 0.001); t("quarter Kelly 0.0625", a.quarter.f, 0.0625, 0.001);
  const top = a.curve.reduce((m, p) => (p.v > m.v ? p : m), a.curve[0]);
  t("growth curve peaks at 25% risk", top.t, 25, 0.9);
  is("more risk, deeper drawdowns (quarter < half < full)", a.quarter.ddMed < a.half.ddMed && a.half.ddMed < a.full.ddMed);
  t("Kelly of -1R,-1R,+3R = 1/9", sizing(rep([-1, -1, 3], 7))!.kelly, 1 / 9, 0.001);
  const z = sizing(rep([1, -1], 10))!;
  t("no edge (mean R = 0): Kelly 0", z.kelly, 0); t("and no growth at half Kelly", z.half.growth, 0);
  is("fewer than 20 R values: null", sizing(rep([2, -1], 9)) === null);
  is("no losing trade: Kelly hits the 50% cap", sizing(rep([1, 2], 10))!.capped === true);
}
{ // each trade risks exactly 1% of the balance (stop 1 point below a 100 entry, P&L = R x risk)
  let bal = 10000, k = 0;
  const x = [2, -1, 1, -1, 1.5].map((r) => { const risk = bal * 0.01, p = r * risk; bal += p; k++; const d = `2026-02-0${k}`; return T(`${d}T09:00`, `${d}T10:00`, p, { entryPrice: 100, sl: 99, exitPrice: 100 + r }); });
  t("current risk = 1% of the balance", currentRisk(x, 10000), 0.01, 1e-9);
  t("no starting balance: null", currentRisk(x, 0), null);
}

console.log("-- Weekly report (now: Wed 2026-01-21 -> week of Mon 2026-01-12)");
{ const x = [
    T("2026-01-07T09:00", "2026-01-07T10:00", 70),                       // previous week
    T("2026-01-12T09:00", "2026-01-12T10:00", -100),                     // Mon London
    T("2026-01-12T10:10", "2026-01-12T10:30", -80),                      // 10 min after a loss
    T("2026-01-13T14:00", "2026-01-13T15:00", 300, { symbol: "XAUUSD" }), // Tue NY
    T("2026-01-14T14:30", "2026-01-14T15:00", 100, { symbol: "XAUUSD" }),
    T("2026-01-15T03:00", "2026-01-15T04:00", -50, { symbol: "GBPUSD" }), // Thu Tokyo
    T("2026-01-15T04:10", "2026-01-15T04:40", -90, { symbol: "GBPUSD" }), // 10 min after a loss
    T("2026-01-16T09:00", "2026-01-16T09:30", 40),
    T("2026-01-19T09:00", "2026-01-19T10:00", 500),                      // this week: not in the report
  ];
  const w = weeklyReport(x, Date.parse("2026-01-21T10:00Z"))!;
  is("week of Monday 2026-01-12", w.week === "2026-01-12" && w.end === Date.parse("2026-01-18T23:59Z"), `${w.week} ${new Date(w.end).toISOString()}`);
  t("7 trades", w.n, 7); t("net +120", w.net, 120); t("win rate 3/7", w.winRate, 300 / 7);
  is("best hour 14h +400", w.best?.h === 14 && near(w.best.net, 400), JSON.stringify(w.best));
  is("worst hour 04h -90", w.worst?.h === 4 && near(w.worst.net, -90), JSON.stringify(w.worst));
  is("costliest habit: trades soon after a loss (-170, 2 trades)", w.habit?.kind === "tilt" && near(w.habit.net, -170) && w.habit.n === 2, JSON.stringify(w.habit));
  t("previous week +70", w.prevNet, 70);
  is("a week without trades: null", weeklyReport(x, Date.parse("2026-03-04T10:00Z")) === null);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
