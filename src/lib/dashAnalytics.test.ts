// Run: npx tsx src/lib/dashAnalytics.test.ts
import { existsSync, readFileSync } from "node:fs";
import { symbolBreakdown, yearlyBreakdown, streakBreakdown } from "./dashAnalytics";
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

// yearly breakdown
{ const mk = (pnl: number, d: string, st: "closed" | "open" = "closed") => ({ ...T("A", st, pnl), exitTime: d + "T10:00", entryTime: d + "T09:00" });
  const y = yearlyBreakdown([mk(100, "2026-01-05"), mk(-40, "2026-01-20"), mk(10, "2026-03-01"), mk(-5, "2025-12-31"), mk(99, "2026-02-02", "open")]);
  check("yearly: years newest first", y.length === 2 && y[0].year === 2026 && y[1].year === 2025);
  check("yearly: Jan 2026 = +60 over 2 trades", y[0].months[0]?.net === 60 && y[0].months[0]?.n === 2);
  check("yearly: empty month null, open ignored", y[0].months[1] === null && y[0].months[2]?.net === 10);
  check("yearly: YTD = 70 / 3 trades", y[0].ytd.net === 70 && y[0].ytd.n === 3);
  check("yearly: empty input -> []", yearlyBreakdown([]).length === 0);
  const p = yearlyBreakdown([mk(100, "2026-01-05"), mk(-40, "2026-01-20"), mk(10, "2026-03-01"), mk(-5, "2025-12-31")], 1000);
  check("yearly %: Dec 2025 = -5/1000 = -0.5%", Math.abs((p[1].months[11]?.pct ?? 9) + 0.5) < 1e-9);
  check("yearly %: Jan 2026 = 60/995 (balance at month start)", Math.abs((p[0].months[0]?.pct ?? 0) - (60 / 995) * 100) < 1e-9);
  check("yearly %: Mar 2026 = 10/1055", Math.abs((p[0].months[2]?.pct ?? 0) - (10 / 1055) * 100) < 1e-9);
  check("yearly %: YTD 2026 = 70/995", Math.abs((p[0].ytd.pct ?? 0) - (70 / 995) * 100) < 1e-9);
  check("yearly %: no start balance -> null", yearlyBreakdown([mk(5, "2026-01-05")], 0)[0].ytd.pct === null); }

// streaks
{ const mk = (pnl: number, d: string, h = "10", st: "closed" | "open" = "closed") => ({ ...T("A", st, pnl), exitTime: `${d}T${h}:00`, entryTime: `${d}T09:00` });
  const e = streakBreakdown([]); check("streak: empty -> zeros", e.trades.current.n === 0 && e.trades.bestWin === 0 && e.days.worstLoss === 0);
  const s1 = streakBreakdown([mk(1, "2026-01-05"), mk(2, "2026-01-05", "11"), mk(3, "2026-01-06"), mk(-1, "2026-01-07"), mk(-1, "2026-01-08"), mk(5, "2026-01-09"), mk(6, "2026-01-12"), mk(7, "2026-01-12", "12")]);
  check("streak trades: best win 3, worst loss 2", s1.trades.bestWin === 3 && s1.trades.worstLoss === 2);
  check("streak trades: current = 3 wins", s1.trades.current.kind === "win" && s1.trades.current.n === 3);
  check("streak days: best 2, worst 2, current 2 wins", s1.days.bestWin === 2 && s1.days.worstLoss === 2 && s1.days.current.kind === "win" && s1.days.current.n === 2);
  const s2 = streakBreakdown([mk(1, "2026-02-02"), mk(0, "2026-02-03"), mk(1, "2026-02-04")]); check("streak: breakeven does not break a win streak (1,0,1 -> 2)", s2.trades.bestWin === 2 && s2.trades.current.n === 2 && s2.trades.bestBE === 1);
  const s5 = streakBreakdown([mk(-1, "2026-04-01"), mk(0, "2026-04-02"), mk(0, "2026-04-03"), mk(-1, "2026-04-06"), mk(1, "2026-04-07"), mk(0, "2026-04-08")]); check("streak: losses 2 across breakevens, best BE run 2, current win 1", s5.trades.worstLoss === 2 && s5.trades.bestBE === 2 && s5.trades.current.kind === "win" && s5.trades.current.n === 1);
  const s6 = streakBreakdown([mk(0, "2026-04-01")]); check("streak: only breakeven -> no win/loss streak, BE 1", s6.trades.current.n === 0 && s6.trades.bestBE === 1);
  const s3 = streakBreakdown([mk(-1, "2026-02-02"), mk(-2, "2026-02-03"), mk(9, "2026-02-04", "10", "open")]); check("streak: open ignored, current = 2 losses", s3.trades.current.kind === "loss" && s3.trades.current.n === 2);
  const s4 = streakBreakdown([mk(5, "2026-03-02"), mk(-5, "2026-03-02", "11"), mk(1, "2026-03-03")]); check("streak days: net-zero day is skipped", s4.days.bestWin === 1 && s4.days.current.n === 1); }

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
