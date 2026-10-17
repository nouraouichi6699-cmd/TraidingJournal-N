// Run: npx tsx src/lib/overview.test.ts
import { existsSync, readFileSync } from "node:fs";
import { computeOverview, fmtHold } from "./stats";
import { parseTradingViewCsv } from "./tradingview";
import type { Account, Trade } from "../types";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + info}`); };
const near = (name: string, got: number | null, exp: number, tol = 0.01) => check(name, got != null && Math.abs(got - exp) <= tol, `got ${got}, expected ${exp}`);

const acc: Account[] = [{ id: "a", name: "A", startBalance: 1000 } as Account];
let k = 0;
const tr = (pnl: number | null, day: string, o: Partial<Trade> = {}): Trade => ({
  key: String(k++), accountId: "a", no: k, symbol: "X", side: "long", qty: 1, entryTime: `${day}T10:00`, entryPrice: 1, exitTime: `${day}T11:00`, exitPrice: 1,
  pnl, returnPct: null, commission: 0, sl: null, tp: null, status: pnl == null ? "open" : "closed", ...o,
} as Trade);
const ov = (t: Trade[], a = acc) => computeOverview(t, a, {});

// 1 empty
{ const o = ov([]); check("empty: n=0, net=0, no NaN", o.n === 0 && o.net === 0 && o.winRate == null && o.pf == null && o.avgTrade == null); }
// 2 single trade
{ const o = ov([tr(100, "2026-01-05")]); check("single: net 100, win 100%, pf null, days 1", o.net === 100 && o.winRate === 100 && o.pf == null && o.tradingDays === 1); near("single: total return 10%", o.totalReturn, 10); }
// 3 all wins -> pf null (not Infinity)
{ const o = ov([tr(100, "2026-01-05"), tr(50, "2026-01-06")]); check("all wins: pf null, payoff null", o.pf === null && o.payoff === null); near("all wins: avg win 75", o.avgWin, 75); check("all wins: avg loss null", o.avgLoss === null); }
// 4 all losses
{ const o = ov([tr(-100, "2026-01-05"), tr(-50, "2026-01-06")]); check("all losses: pf 0-win => pf=0/150 -> 0", o.pf === 0 && o.winRate === 0); near("all losses: avg loss -75", o.avgLoss, -75); near("all losses: net -150", o.net, -150); }
// 5 same-day trades
{ const o = ov([tr(100, "2026-01-05"), tr(-40, "2026-01-05"), tr(20, "2026-01-05")]); check("same day: 1 trading day, 3 per day", o.tradingDays === 1 && o.perDay === 3); near("same day: avg daily 80", o.avgDaily, 80); }
// 6 open trade ignored
{ const o = ov([tr(100, "2026-01-05"), tr(null, "2026-01-06")]); check("open trade ignored: n=1", o.n === 1 && o.net === 100); }
// 7 costs
{ const o = ov([tr(100, "2026-01-05", { commission: 5 }), tr(-50, "2026-01-06", { commission: 5 })]); near("costs: commissions 10", o.commissions, 10); near("costs: cost drag 10%", o.costDrag, 10); }
// 8 breakeven
{ const o = ov([tr(0, "2026-01-05"), tr(100, "2026-01-06"), tr(-100, "2026-01-07"), tr(0, "2026-01-08")]); near("breakeven rate 50%", o.beRate, 50); near("breakeven: win rate 25%", o.winRate, 25); near("breakeven: pf 1", o.pf, 1); }
// 9 payoff / expectancy
{ const o = ov([tr(300, "2026-01-05"), tr(-100, "2026-01-06"), tr(-100, "2026-01-07")]); near("payoff 3", o.payoff, 3); near("expectancy 33.33", o.avgTrade, 100 / 3); near("pf 1.5", o.pf, 1.5); }
// 10 formatter
check("fmtHold 119.6 -> 2h 0m", fmtHold(119.6) === "2h 0m", fmtHold(119.6));
check("fmtHold 83.9 -> 1h 24m", fmtHold(83.9) === "1h 24m", fmtHold(83.9));
check("fmtHold 45 -> 45m", fmtHold(45) === "45m");
// 11 hold time
{ const o = ov([tr(10, "2026-01-05"), tr(10, "2026-01-06", { exitTime: "2026-01-06T12:00" })]); near("avg hold 90 min", o.holdMin, 90); }
// 12 drawdown + underwater (peak -> new peak)
{ const t = [tr(100, "2026-01-05"), tr(-200, "2026-01-06"), tr(50, "2026-01-07"), tr(300, "2026-01-08")];
  const o = ov(t); near("maxDD % = 200/1100", o.maxBalDD, (200 / 1100) * 100); near("underwater = peak 01-05 11:00 -> new peak 01-08 11:00 = 3d", o.underwaterDays, 3, 0.001); near("recovery 250/200", o.recovery, 1.25); }
// 13 open drawdown counts until last trade
{ const o = ov([tr(100, "2026-01-05"), tr(-50, "2026-01-06"), tr(-10, "2026-01-09")]); near("open drawdown: 4d", o.underwaterDays, 4, 0.001); }
// 14 ratios need 30 trading days
{ const o = ov([tr(100, "2026-01-05"), tr(-50, "2026-01-06")]); check("ratios null with < 30 days + reason", o.sharpe == null && o.sortino == null && o.calmar == null && o.why.sharpe === "days"); }
// 15 start balance missing
{ const o = ov([tr(100, "2026-01-05")], [{ id: "a", name: "A", startBalance: 0 } as Account]); check("start 0: total return null", o.totalReturn == null && o.why.totalReturn === "start"); }
// 16 unavailable metrics
{ const o = ov([tr(100, "2026-01-05")]); check("equity/twr/fees/swaps flagged unavailable", o.why.maxEqDD === "equity" && o.why.curEqDD === "equity" && o.why.twr === "cashflow" && o.why.fees === "stored" && o.why.swaps === "stored"); }
// 17 Sharpe counts zero-return weekdays: 2 trading days among 5 weekdays
{ const t = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.UTC(2026, 0, 5 + i * 2)); return tr(i % 2 ? -10 : 20, d.toISOString().slice(0, 10)); });
  const o = ov(t); check("sharpe computed with 30+ days, finite", o.sharpe != null && Number.isFinite(o.sharpe)); }

// ---- Regression on the 650-trade file ----
const file = "test-data/mizan_test_650_trades.csv";
if (!existsSync(file)) { fail++; console.log(`FAIL  regression: ${file} not found`); }
else {
  const r = parseTradingViewCsv(readFileSync(file, "utf8"));
  if (r.kind !== "trades") { fail++; console.log("FAIL  regression: parser kind =", r.kind); }
  else {
    const trades = r.trades.map((x, i) => ({ ...x, key: String(i), accountId: "a" } as Trade));
    const o = computeOverview(trades, [{ id: "a", name: "A", startBalance: 10000 } as Account], {});
    near("net 6000.00", o.net, 6000); near("total return 60.00%", o.totalReturn, 60); check("trades 650", o.n === 650, String(o.n));
    near("win rate 36.46", o.winRate, 36.46); near("pf 1.06", o.pf, 1.06); near("expectancy 9.23", o.avgTrade, 9.23); near("payoff 1.84", o.payoff, 1.84);
    near("avg win 467.72", o.avgWin, 467.72); near("avg loss -253.87", o.avgLoss, -253.87); near("largest win 1004.77", o.best, 1004.77); near("largest loss -361.02", o.worst, -361.02);
    near("avg daily 25.97", o.avgDaily, 25.97); near("cost drag 1.42", o.costDrag, 1.42); near("max bal DD 20.66", o.maxBalDD, 20.66); near("recovery 1.87", o.recovery, 1.87);
    near("calmar 2.93", o.calmar, 2.93); near("sharpe 1.04", o.sharpe, 1.04); near("sortino 1.75", o.sortino, 1.75); near("underwater 96d", o.underwaterDays == null ? null : Math.round(o.underwaterDays), 96, 0);
    check("trading days 231", o.tradingDays === 231, String(o.tradingDays)); near("active freq 88.85", o.activeFreq, 88.85); near("per day 2.81", o.perDay, 2.81);
    near("avg hold 83.9", o.holdMin, 83.9); check("hold shown 1h 24m", o.holdMin != null && fmtHold(o.holdMin) === "1h 24m");
    near("volume 224.31", o.volume, 224.31); near("commissions -1571.07", -Math.abs(o.commissions), -1571.07);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
