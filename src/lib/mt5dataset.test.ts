// Run: npx tsx src/lib/mt5dataset.test.ts
// Checks the Overview, Trade outcomes and Yearly breakdown against test-data/MT5_test_dataset_650_trades_2025:
//  - expected_independent.json is produced by oracle.py (separate Python implementation, reads the raw CSV);
//  - the monthly summary CSV ships with the dataset (generator output) and is compared with yearlyBreakdown.
import { existsSync, readFileSync } from "node:fs";
import { parseCsv, parseDate, parseNum } from "./csv";
import { computeOverview } from "./stats";
import { computeTradeOutcomes } from "./tradeOutcomes";
import { yearlyBreakdown } from "./dashAnalytics";
import type { Account, Trade } from "../types";

const dir = "test-data/MT5_test_dataset_650_trades_2025";
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + info}`); };
const near = (name: string, got: number | null, exp: number, tol = 0.01) => check(name, got != null && Math.abs(got - exp) <= tol, `got ${got}, expected ${exp}`);

const csv = `${dir}/MT5_synthetic_650_trades_2025.csv`, ex = `${dir}/expected_independent.json`, ms = `${dir}/MT5_650_trades_monthly_summary_2025.csv`;
if (![csv, ex, ms].every(existsSync)) { console.log("FAIL  dataset files missing in", dir); process.exit(1); }
const rows = parseCsv(readFileSync(csv, "utf8").replace(/^﻿/, "")), h = rows[0], col = (n: string) => h.indexOf(n);
const trades: Trade[] = rows.slice(1).filter((r) => r.length > 10).map((r, i) => ({
  key: r[col("Ticket")], accountId: "a", no: Number(r[col("Ticket")]), symbol: r[col("Symbol")], side: r[col("Type")] === "buy" ? "long" : "short", qty: parseNum(r[col("Size")]) ?? 0,
  entryTime: parseDate(r[col("Open Time")]), entryPrice: parseNum(r[col("Open Price")]), exitTime: parseDate(r[col("Close Time")]), exitPrice: parseNum(r[col("Close Price")]),
  pnl: parseNum(r[col("Net Profit")]), returnPct: null, commission: Math.abs(parseNum(r[col("Commission")]) ?? 0), sl: null, tp: null, status: "closed",
} as unknown as Trade));
check("parsed 650 trades with valid dates", trades.length === 650 && trades.every((t) => t.entryTime && t.exitTime && t.pnl != null), `n=${trades.length}`);

const E = JSON.parse(readFileSync(ex, "utf8"));
const ov = computeOverview(trades, [{ id: "a", name: "A", startBalance: 10000 } as Account], {});
const oc = computeTradeOutcomes(trades, 10000);

console.log("-- Overview vs independent oracle");
near("net profit", ov.net, E.net); near("total return %", ov.totalReturn, E.totalReturn); check("trades", ov.n === E.n);
near("win rate", ov.winRate, E.winRate); near("profit factor", ov.pf, E.pf); near("payoff", ov.payoff, E.payoff);
near("avg win", ov.avgWin, E.avgWin); near("avg loss", ov.avgLoss, E.avgLoss); near("largest win", ov.best, E.best); near("largest loss", ov.worst, E.worst); near("avg trade", ov.avgTrade, E.avgTrade);
near("trading days", ov.tradingDays, E.tradingDays, 0); near("avg hold (min)", ov.holdMin, E.avgHoldMin); near("volume", ov.volume, E.volume); near("commissions (abs)", Math.abs(ov.commissions), Math.abs(E.commissions));
near("max balance drawdown % (incl. start balance as a peak)", ov.maxBalDD, E.maxBalDD); near("recovery factor", ov.recovery, E.recovery);

console.log("-- Trade outcomes vs independent oracle");
near("winning days", oc.winningDays, E.winningDays, 0); near("losing days", oc.losingDays, E.losingDays, 0); near("daily win rate", oc.dailyWinRate, E.dailyWinRate);
near("median trade P&L", oc.medianTradePnl, E.median); near("max win streak", oc.maxWinStreak, E.maxWinStreak, 0); near("max loss streak", oc.maxLossStreak, E.maxLossStreak, 0);
near("max win day streak", oc.maxWinDayStreak, E.maxWinDayStreak, 0); near("max loss day streak", oc.maxLossDayStreak, E.maxLossDayStreak, 0);
near("outcome runs", oc.outcomeRuns, E.outcomeRuns, 0); near("runs Z-score", oc.runsZScore, E.runsZScore);
near("max consecutive profit", oc.maxConsecutiveProfit, E.maxConsecutiveProfit); near("max consecutive loss", oc.maxConsecutiveLoss, E.maxConsecutiveLoss);
near("top trade profit conc %", oc.topTradeProfitConc, E.topTradeProfitConc); near("top five profit conc %", oc.topFiveProfitConc, E.topFiveProfitConc);
near("worst trade loss conc %", oc.worstTradeLossConc, E.worstTradeLossConc); near("worst five loss conc %", oc.worstFiveLossConc, E.worstFiveLossConc);
near("breakeven win rate", oc.breakevenWinRate, E.breakevenWinRate); near("win-rate edge", oc.winRateEdge, E.winRateEdge);

console.log("-- Yearly breakdown vs shipped monthly summary");
const y = yearlyBreakdown(trades, 10000)[0], lines = readFileSync(ms, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
lines.forEach((c, i) => { const cell = y.months[i]; near(`${c[0]}: net`, cell?.net ?? null, Number(c[5])); check(`${c[0]}: trades`, cell?.n === Number(c[1]), `got ${cell?.n}, expected ${c[1]}`); });
near("YTD net = sum of months", y.ytd.net, E.net);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
