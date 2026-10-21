import { parseMt5Rows } from "./mt5";
import { parseTradingViewCsv } from "./tradingview";
import { planLedger } from "./importLedger";
import { newFlows, type CashFlow } from "./cashflow";
import { computeReturnsCapital } from "./returnsCapital";
import { currentBalance, ledgerReconciles } from "./balance";
import type { Account, Trade } from "../types";
let pass = 0, fail = 0;
const near = (a: number | null | undefined, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) <= 0.01);
const t = (name: string, got: number | null | undefined, exp: number | null) => { const ok = near(got, exp); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${got}, expected ${exp}`}`); };
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };

// MT5 report rows. Positions: open | id | symbol | type | volume | price | SL | TP | close | price | commission | swap | profit
// Deals: time | deal | symbol | type | direction | volume | price | order | commission | fee | swap | profit | balance
const P = (o: string, id: string, sym: string, type: string, c: string, comm: number, swap: number, profit: number) => [o, id, sym, type, 1, 1.1, "", "", c, 1.2, comm, swap, profit];
const D = (tm: string, deal: string, sym: string, type: string, comm: number, swap: number, profit: number, bal: number) => [tm, deal, sym, type, sym ? "in" : "", sym ? 1 : "", sym ? 1.1 : "", "", comm, 0, swap, profit, bal];
const rows = (bal: string, cred: string, comm: string) => [
  ["Trade History Report"], ["Account:", "111419341 (USD, MetaQuotes-Demo, demo, Hedge)"],
  P("2026.01.03 10:00", "101", "EURUSD", "buy", "2026.01.03 12:00", -10, -2, 500),
  P("2026.01.22 10:00", "102", "GBPUSD", "buy", "2026.01.22 15:00", -6, 0, -100),
  D("2026.01.02 09:00", "1", "", bal, 0, 0, 10000, 10000),        // initial deposit (before the first trade)
  D("2026.01.03 10:00", "2", "EURUSD", "buy", -5, 0, 0, 9995),
  D("2026.01.03 12:00", "3", "EURUSD", "sell", -5, -2, 500, 10488),
  D("2026.01.10 09:00", "4", "", bal, 0, 0, 2000, 12488),          // deposit
  D("2026.01.15 09:00", "5", "", cred, 0, 0, 300, 12488),          // credit: balance column unchanged -> no flow
  D("2026.01.20 09:00", "6", "", bal, 0, 0, -1000, 11488),         // withdrawal
  D("2026.01.21 09:00", "7", "", comm, 0, 0, -10, 11478),          // account fee -> adjustment
  D("2026.01.22 10:00", "8", "GBPUSD", "buy", -3, 0, 0, 11475),
  D("2026.01.22 15:00", "9", "GBPUSD", "sell", -3, 0, -100, 11372),
];
console.log("-- MT5 report (English)");
const r = parseMt5Rows(rows("balance", "credit", "commission"))!;
t("start balance = balance just before the first trade", r.startBalance, 10000);
is("first trade time", r.firstTrade === "2026-01-03T10:00", String(r.firstTrade));
is("deposit before the first trade is not a cash flow (it is the start balance)", r.preFlows.length === 1 && r.preFlows[0].type === "deposit" && r.preFlows[0].amount === 10000);
is("later operations: deposit 2000, withdrawal 1000, fee adjustment -10", JSON.stringify(r.flows.map((f) => [f.type, f.amount])) === JSON.stringify([["deposit", 2000], ["withdrawal", 1000], ["adjustment", -10]]), JSON.stringify(r.flows));
is("credit that does not move the balance adds nothing", !r.flows.some((f) => f.type === "credit"));
t("trades: net P&L includes commission and swap (488 - 106)", r.trades.reduce((s, x) => s + (x.pnl as number), 0), 382);

console.log("-- Same report in French / Arabic (shape based)");
const fr = parseMt5Rows(rows("solde", "crédit", "commission"))!, ar = parseMt5Rows(rows("الرصيد", "ائتمان", "عمولة"))!;
is("French report gives the same ledger", fr.startBalance === 10000 && JSON.stringify(fr.flows) === JSON.stringify(r.flows));
is("Arabic report gives the same ledger", ar.startBalance === 10000 && JSON.stringify(ar.flows) === JSON.stringify(r.flows));

console.log("-- Reconciliation: ending balance = start + realised P&L + cash flows = the report's last balance");
const A: Account = { id: "m", platform: "mt5", name: "MT5", currency: "USD", startBalance: r.startBalance as number } as Account;
const trades = r.trades.map((x, i) => ({ ...x, key: `m:${x.orderId ?? i}`, accountId: "m" }) as Trade);
const flows = newFlows([], "m", planLedger(0, null, r).flows, () => "id");
const rc = computeReturnsCapital(trades, [], A.startBalance, { before: [], period: flows, known: true });
t("ledger ending balance", rc.endBal, 11372);
t("current balance from the imported history", currentBalance(A, trades, r.points, flows), 11372);
t("current balance from the ledger alone (no history)", currentBalance(A, trades, [], flows), 11372);
t("net profit is trading only", rc.net, 382);
t("net deposits 2000 - 1000", rc.netDep, 1000);
t("credits and adjustments (fee)", rc.credits, -10);
is("imported ledger reconciles with the report's balance history (zeros are real)", ledgerReconciles(A, trades, r.points, flows) === true);
is("the old import (start = first deposit, no flows) does not reconcile", ledgerReconciles(A, trades, r.points, []) === false);

console.log("-- Import plan");
const p1 = planLedger(5000, null, r);
is("new / empty account: start replaced by the file (manual 5000 -> 10000)", p1.start === 10000 && p1.reaches && p1.flows.length === 3);
is("same start: nothing to change", planLedger(10000, null, r).start === null);
const later = { startBalance: 12000, firstTrade: "2026-03-01T10:00", preFlows: [{ t: "2026-02-20T09:00", type: "deposit" as const, amount: 500 }, { t: "2025-12-01T09:00", type: "deposit" as const, amount: 99 }], flows: [{ t: "2026-03-05T09:00", type: "withdrawal" as const, amount: 100 }] };
const p2 = planLedger(10000, "2026-01-03T10:00", later);
is("a later file keeps the start balance", p2.start === null && !p2.reaches);
is("a later file brings its own pre-trade deposit, not operations older than the account's first trade", JSON.stringify(p2.flows.map((f) => f.amount)) === "[500,100]", JSON.stringify(p2.flows));
is("an older file (reaches back) replaces the start", planLedger(7000, "2026-02-01T10:00", r).start === 10000);

console.log("-- Duplicates");
const once = newFlows([], "m", r.flows, () => "x");
is("importing the same report twice adds nothing the second time", newFlows(once, "m", r.flows).length === 0);
const manual: CashFlow[] = [{ id: "h", accountId: "m", t: "2026-01-10T00:00", type: "deposit", amount: 2000 }];
is("a deposit typed by hand on the same day is not duplicated", newFlows(manual, "m", r.flows).length === 2);
is("same deposit on another account is kept", newFlows(manual, "other", r.flows).length === 3);

console.log("-- TradingView balance history (newest first, as exported)");
const csv = ["Time,Balance Before,Balance After,Realized P&L (value),Currency,Action",
  "2026-02-03 10:00:00,103000,102500,0,USD,Withdrawal",
  "2026-02-02 10:00:00,100500,103000,0,USD,Deposit",
  "2026-02-01 12:00:00,99980,100500,520,USD,Close long position for symbol NASDAQ:AAPL",
  "2026-02-01 10:00:00,100000,99980,0,USD,Commission for: Enter position for symbol NASDAQ:AAPL",
  "2026-01-31 09:00:00,0,100000,0,USD,Deposit"].join("\n");
const tv = parseTradingViewCsv(csv);
is("balance history detected", tv.kind === "balance");
if (tv.kind === "balance") {
  t("start = balance before the first trading row", tv.startBalance, 100000);
  is("initial deposit stays inside the start balance", tv.preFlows.length === 1 && tv.preFlows[0].amount === 100000);
  is("later deposit and withdrawal are cash flows", JSON.stringify(tv.flows.map((f) => [f.type, f.amount])) === JSON.stringify([["deposit", 2500], ["withdrawal", 500]]), JSON.stringify(tv.flows));
  is("commission and closed positions are not cash flows", tv.flows.length === 2);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
