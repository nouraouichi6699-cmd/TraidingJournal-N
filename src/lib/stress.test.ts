// Run: npx tsx src/lib/stress.test.ts
// Data-driven check against test-data/stress/expected_stress.json (computed by an independent Python implementation).
// The CSV goes through the app's own importer path: parseTradingViewCsv (generic column detection), then the
// same de-duplication the journal applies (one trade per ticket); open trades never reach the analytics.
import { existsSync, readFileSync } from "node:fs";
import { parseTradingViewCsv } from "./tradingview";
import { symbolBreakdown } from "./dashAnalytics";
import { ALL_KEYS, computeTradeOutcomes } from "./tradeOutcomes";
import type { Trade } from "../types";

const dir = "test-data/stress", csv = `${dir}/mizan_stress_2025.csv`, js = `${dir}/expected_stress.json`;
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + info}`); };
const eq = (a: number | null | undefined, b: number | null | undefined, tol = 0.01) => (a == null || b == null ? a == null && b == null : Math.abs(a - b) <= tol);

if (!existsSync(csv) || !existsSync(js)) { console.log("FAIL  stress files missing in", dir); process.exit(1); }
const E = JSON.parse(readFileSync(js, "utf8"));
const r = parseTradingViewCsv(readFileSync(csv, "utf8"));
if (r.kind !== "trades") { console.log("FAIL  importer did not return trades, kind =", r.kind); process.exit(1); }

// One trade per ticket (first occurrence wins), as the journal keys trades by ticket.
const seen = new Set<string>();
const all = r.trades.filter((t) => { const k = t.orderId ?? `${t.symbol}-${t.no}-${t.entryTime}`; if (seen.has(k)) return false; seen.add(k); return true; });
const trades = all.map((t) => ({ ...t, key: `a:${t.orderId}`, accountId: "a" } as Trade)); // key = account:ticket, as the journal stores it
const closed = trades.filter((t) => t.status === "closed");
console.log(`importer: ${r.trades.length} parsed, ${all.length} unique, ${closed.length} closed, ${all.length - closed.length} open`);
check("meta: unique tickets", all.length === E.meta.uniqueTickets, `got ${all.length}, expected ${E.meta.uniqueTickets}`);
check("meta: closed trades", closed.length === E.meta.closedTrades, `got ${closed.length}, expected ${E.meta.closedTrades}`);
check("meta: open positions", all.length - closed.length === E.meta.openPositions, `got ${all.length - closed.length}, expected ${E.meta.openPositions}`);

console.log("-- symbols");
const sb = symbolBreakdown(trades), es = E.symbols;
check("symbols: total", sb.total === es.total, `got ${sb.total}, expected ${es.total}`);
check("symbols: distinct", sb.distinct === es.distinct, `got ${sb.distinct}, expected ${es.distinct}`);
check("symbols: same length", sb.symbols.length === es.list.length, `got ${sb.symbols.length}, expected ${es.list.length}`);
es.list.forEach((e: { symbol: string; count: number; pct: number }, i: number) => {
  const a = sb.symbols[i];
  check(`symbols #${i + 1} ${e.symbol}`, !!a && a.symbol === e.symbol && a.count === e.count && eq(a.pct, e.pct), `got ${a?.symbol} ${a?.count} ${a?.pct?.toFixed(4)}, expected ${e.symbol} ${e.count} ${e.pct.toFixed(4)}`);
});

console.log("-- outcomes (50 keys)");
const oc = computeTradeOutcomes(trades, E.startBalance), eo = E.outcomes as Record<string, number | null>;
const missing = ALL_KEYS.filter((k) => !(k in eo)), extra = Object.keys(eo).filter((k) => !(ALL_KEYS as string[]).includes(k));
check("outcomes: expected JSON has exactly the 50 keys", missing.length === 0 && extra.length === 0, `missing: ${missing.join(",")} extra: ${extra.join(",")}`);
for (const k of ALL_KEYS) check(`outcomes: ${k}`, eq(oc[k], eo[k]), `expected ${eo[k]}, actual ${oc[k]}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
