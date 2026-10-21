import { computeReturnsCapital } from "./returnsCapital";
import type { Trade } from "../types";
let pass = 0, fail = 0;
const near = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) <= 0.01);
const t = (name: string, got: number | null, exp: number | null) => { const ok = near(got, exp); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${got}, expected ${exp}`}`); };
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
let id = 0;
const T = (entry: string, exit: string | null, pnl: number | null, commission = 0): Trade => ({ key: `a:${++id}`, accountId: "a", no: id, symbol: "X", side: "long", qty: 1, entryTime: entry, entryPrice: 1, exitTime: exit, exitPrice: 1, pnl, returnPct: null, commission, status: exit && pnl != null ? "closed" : "open" } as Trade);

// Known dataset: initial 10 000, +500 realised BEFORE the period -> period start balance 10 500.
const before = [T("2025-02-28 09:00", "2025-02-28 10:00", 500)];
const period = [
  T("2025-03-03 09:00", "2025-03-03 10:00", 100, -2), T("2025-03-03 11:00", "2025-03-03 12:00", -40),   // Mon: +60 (two trades, same day)
  T("2025-03-04 09:00", "2025-03-04 09:30", -25.5),                                                      // Tue: -25.5
  T("2025-03-05 09:00", "2025-03-05 09:10", 0),                                                          // Wed: zero-profit trade (a trading day, neither win nor loss)
  T("2025-03-05 23:50", "2025-03-06 00:10", 10),                                                         // crosses midnight -> belongs to Thu 6th
  T("2025-03-12 09:00", "2025-03-12 10:00", 200),                                                        // next week
  T("2025-04-02 09:00", "2025-04-02 10:00", 50),                                                         // next month
  T("2025-04-03 09:00", null, null),                                                                     // open: excluded
];
const r = computeReturnsCapital(period, before, 10000);
console.log("-- Returns");
t("net profit", r.net, 294.5); t("gross profit", r.gross, 360); t("gross loss", r.loss, -65.5);
t("total return % (294.5 / 10 500)", r.totalReturn, 2.8048);
t("avg daily return % (balance-based)", r.avgDailyRet, 0.4645); t("avg weekly return %", r.avgWeeklyRet, 0.9286); t("avg monthly return %", r.avgMonthlyRet, 1.397);
t("avg daily P&L (6 trading days)", r.avgDailyPnl, 49.0833); t("median daily P&L", r.medDailyPnl, 30); t("daily P&L std dev (sample)", r.sdDailyPnl, 80.4925);
t("avg weekly P&L (3 weeks)", r.avgWeeklyPnl, 98.1667); t("avg monthly P&L (2 months)", r.avgMonthlyPnl, 147.25);
t("best day", r.bestDay, 200); t("worst day", r.worstDay, -25.5); t("best week", r.bestWeek, 200); t("worst week", r.worstWeek, 44.5); t("best month", r.bestMonth, 244.5); t("worst month", r.worstMonth, 50);
is("days / weeks / months", r.days === 6 && r.weeks === 3 && r.months === 2, `${r.days}/${r.weeks}/${r.months}`);
is("TWR and annualised are unavailable (no cash-flow records)", r.why.twr === "noCash" && r.why.ann === "noCash");
console.log("-- Capital");
t("initial balance", r.initial, 10000); t("starting balance of the period", r.startBal, 10500); t("ending balance", r.endBal, 10794.5); t("current balance", r.currentBal, 10794.5); t("highest balance", r.highBal, 10794.5);
is("equity + cash-flow metrics unavailable with a reason", ["sEq", "cEq", "eEq", "hiEq", "netDep", "totDep", "totWd", "netFlow", "credits", "depN", "wdN", "credN", "avgDep", "avgWd"].every((k) => r.why[k] != null));
console.log("-- Period consistency");
t("profitable days", r.profitDays, 4); t("profitable-day % (4 of 6)", r.profitDayPct, 66.6667); t("trade win rate (4 of 7)", r.tradeWinRate, 57.1429);
t("profitable weeks", r.profitWeeks, 3); t("profitable months", r.profitMonths, 2); t("positive-return days", r.posRetDays, 4);
t("average winning day", r.avgWinDay, 80); t("average losing day", r.avgLossDay, -25.5); t("largest winning day share", r.bigWinShare, 62.5); t("largest losing day share", r.bigLossShare, 100);

console.log("-- Edge cases");
const e = computeReturnsCapital([], [], 10000);
is("empty period: nothing fabricated", e.net === null && e.avgDailyPnl === null && e.profitDays === null && e.bestDay === null && e.why.net === "noTrades");
t("empty period still shows the starting balance", e.startBal, 10000);
const ns = computeReturnsCapital(period, before, 0);
t("no initial balance: P&L metrics still work", ns.net, 294.5);
is("no initial balance: % and balances unavailable", ns.totalReturn === null && ns.startBal === null && ns.avgDailyRet === null && ns.posRetDays === null && ns.why.totalReturn === "noStart");
const win = computeReturnsCapital([T("2025-05-05 09:00", "2025-05-05 10:00", 30)], [], 1000);
is("only winners: losing-day metrics are unavailable, not 0", win.avgLossDay === null && win.bigLossShare === null && win.why.avgLossDay === "noLosses");
is("single day: std dev unavailable", win.sdDailyPnl === null && win.why.sdDailyPnl === "fewDays");
const zero = computeReturnsCapital([T("2025-05-05 09:00", "2025-05-05 10:00", 0)], [], 1000);
is("zero-profit day is a trading day but not profitable", zero.days === 1 && zero.profitDays === 0 && zero.profitDayPct === 0 && zero.bigWinShare === null);
const dd = computeReturnsCapital([T("2025-05-05 09:00", "2025-05-05 10:00", 300), T("2025-05-06 09:00", "2025-05-06 10:00", -500)], [], 1000);
t("highest balance is a peak, not the final balance", dd.highBal, 1300); t("ending balance after drawdown", dd.endBal, 800);
const neg = computeReturnsCapital([T("2025-05-05 09:00", "2025-05-05 10:00", -1000), T("2025-05-06 09:00", "2025-05-06 10:00", 50)], [], 1000);
is("non-positive balance never divides: returns skip that day", neg.avgDailyRet !== null && Number.isFinite(neg.avgDailyRet as number) && Math.abs((neg.avgDailyRet as number) + 100) < 0.01, String(neg.avgDailyRet));
t("current balance from the accounts' history overrides the ledger", computeReturnsCapital(period, before, 10000, undefined, 99927.97).currentBal, 99927.97);
is("unknown current balance stays unknown (no fallback)", (() => { const x = computeReturnsCapital(period, before, 10000, undefined, null); return x.currentBal === null && x.why.cur === "noStart"; })());
const fee = computeReturnsCapital([T("2025-05-05 09:00", "2025-05-05 10:00", 98, -2)], [], 1000);
t("net P&L is not reduced again by the commission field", fee.net, 98);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
