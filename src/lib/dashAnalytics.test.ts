// Run: npx tsx src/lib/dashAnalytics.test.ts
import { existsSync, readFileSync } from "node:fs";
import { symbolBreakdown } from "./dashAnalytics";
import { parseTradingViewCsv } from "./tradingview";
import type { Trade } from "../types";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + info}`); };
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
let k = 0;
const T = (symbol: string, status: "closed" | "open" = "closed", pnl: number | null = 1): Trade => ({ key: String(k++), accountId: "a", no: k, symbol, side: "long", qty: 1, entryTime: "2026-01-05T10:00", entryPrice: 1, exitTime: "2026-01-05T11:00", exitPrice: 1, pnl, returnPct: null, commission: 0, sl: null, tp: null, status } as Trade);
const many = (s: string, n: number, st: "closed" | "open" = "closed") => Array.from({ length: n }, () => T(s, st));
const sig = (b: ReturnType<typeof symbolBreakdown>) => b.symbols.map((x) => `${x.symbol}:${x.count}`).join(",");

// a) unit cases
{ const b = symbolBreakdown([]); check("empty -> 0/0/[] no NaN", b.total === 0 && b.distinct === 0 && b.symbols.length === 0); }
{ const b = symbolBreakdown([T("EURUSD")]); check("one trade -> 100%", b.total === 1 && b.distinct === 1 && b.symbols[0].pct === 100); }
{ const b = symbolBreakdown([...many("B", 2), ...many("A", 2), ...many("C", 3)]); check("ties: count desc then A-Z", sig(b) === "C:3,A:2,B:2", sig(b)); }
{ const b = symbolBreakdown([...many("A", 3), ...many("B", 1)], ["B", "ZZZ"]); check("subset ignores unknown; pct of selected set", b.total === 1 && b.distinct === 1 && b.symbols[0].pct === 100, JSON.stringify(b)); }
{ const b = symbolBreakdown([T("OANDA:eurusd"), T(" EURUSD "), T("eurusd"), T("FX:EURUSD")]); check("prefix/case/space normalised", b.distinct === 1 && b.total === 4 && b.symbols[0].symbol === "EURUSD", JSON.stringify(b)); }
{ const b = symbolBreakdown([T("A"), T("A", "open"), T("B", "open")]); check("open trades ignored", b.total === 1 && b.distinct === 1, JSON.stringify(b)); }
{ const b = symbolBreakdown([T("A", "closed", 0), T("A", "closed", 5)]); check("breakeven closed counted", b.total === 2); }
{ const b = symbolBreakdown([T("XAUUSD"), T("XAUUSD.m")]); check("suffix not merged", b.distinct === 2, sig(b)); }
{ const b = symbolBreakdown([...many("A", 3), ...many("B", 1)]); check("pct 75 / 25", near(b.symbols[0].pct, 75, 1e-9) && near(b.symbols[1].pct, 25, 1e-9)); }
{ const b = symbolBreakdown([...many("A", 1), ...many("B", 1), ...many("C", 1)]); check("full precision pct (33.333...)", b.symbols[0].pct === (1 / 3) * 100); }
{ const syms = Array.from({ length: 50 }, (_, i) => `S${String(i).padStart(2, "0")}`); const t = syms.flatMap((s, i) => many(s, i + 1)); const b = symbolBreakdown(t); check("large input: 50 symbols, total 1275, sorted", b.distinct === 50 && b.total === 1275 && b.symbols[0].symbol === "S49" && b.symbols.every((x, i, a) => !i || a[i - 1].count >= x.count)); }
{ const b = symbolBreakdown(many("A", 5, "open")); check("only open trades -> empty", b.total === 0 && b.symbols.length === 0); }
{ const b = symbolBreakdown([...many("A", 2), ...many("B", 2)], []); check("empty selection = all", b.distinct === 2); }
{ const b = symbolBreakdown([T("")]); check("blank symbol -> UNKNOWN, no crash", b.symbols[0]?.symbol === "UNKNOWN"); }

// b) data-driven
const load = (csv: string, st?: string[]) => {
  const r = parseTradingViewCsv(readFileSync(csv, "utf8"));
  if (r.kind !== "trades") return null;
  return symbolBreakdown(r.trades.map((x, i) => ({ ...x, key: String(i), accountId: "a" } as Trade)), st);
};
const dir = "test-data/cases", jf = `${dir}/expected_symbols.json`;
if (!existsSync(jf)) { fail++; console.log(`FAIL  data-driven: ${jf} not found`); }
else {
  const raw = JSON.parse(readFileSync(jf, "utf8"));
  const cases: any[] = Array.isArray(raw) ? raw : Array.isArray(raw.cases) ? raw.cases : Object.entries(raw).map(([name, v]: any) => ({ name, ...v }));
  for (const c of cases) {
    const name = c.name ?? c.file, file = `${dir}/${c.file}`;
    if (!existsSync(file)) { fail++; console.log(`FAIL  case ${name}: ${file} not found`); continue; }
    const b = load(file, c.selected);
    if (!b) { fail++; console.log(`FAIL  case ${name}: parser did not return trades`); continue; }
    const exp: { symbol: string; count: number; pct: number }[] = c.symbols ?? c.expected?.symbols ?? [];
    const ok = b.total === (c.total ?? c.expected?.total) && b.distinct === (c.distinct ?? c.expected?.distinct) && b.symbols.length === exp.length && exp.every((e, i) => b.symbols[i].symbol === e.symbol && b.symbols[i].count === e.count && near(b.symbols[i].pct, e.pct));
    check(`case ${name}`, ok, `got ${b.total}/${b.distinct} ${sig(b)}`);
  }
}

// c) 650-trade regression
const f650 = "test-data/mizan_test_650_trades.csv";
if (!existsSync(f650)) { fail++; console.log(`FAIL  regression: ${f650} not found`); }
else {
  const b = load(f650);
  if (!b) { fail++; console.log("FAIL  regression: parser did not return trades"); }
  else {
    const exp: [string, number, number][] = [["XAUUSD", 189, 29.1], ["EURUSD", 95, 14.6], ["GBPUSD", 87, 13.4], ["USDJPY", 87, 13.4], ["AUDUSD", 72, 11.1], ["XAGUSD", 69, 10.6], ["USDCAD", 51, 7.8]];
    check("650: total 650, 7 symbols", b.total === 650 && b.distinct === 7, `${b.total}/${b.distinct}`);
    exp.forEach(([s, n, p], i) => check(`650: #${i + 1} ${s} ${n} (${p}%)`, b.symbols[i]?.symbol === s && b.symbols[i].count === n && near(b.symbols[i].pct, p, 0.05), JSON.stringify(b.symbols[i])));
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
