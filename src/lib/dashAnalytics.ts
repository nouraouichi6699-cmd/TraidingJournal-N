// Pure dashboard analytics (no React, no storage).
import type { Trade } from "../types";

export interface SymbolRow { symbol: string; count: number; pct: number }
export interface SymbolBreakdown { total: number; distinct: number; symbols: SymbolRow[] }

/** "OANDA:eurusd " -> "EURUSD". Broker suffixes (".m") are kept. Blank -> "UNKNOWN". */
export const symbolKey = (s: string | null | undefined): string => {
  const raw = String(s ?? "");
  const k = raw.slice(raw.indexOf(":") + 1).trim().toUpperCase();
  return k || "UNKNOWN";
};

/**
 * Closed trades per symbol, sorted by count desc then symbol A-Z.
 * pct = count / total of the selected set * 100 (full precision).
 * selected: undefined/empty = all; unknown names are ignored (if none match, the result is empty).
 */
export function symbolBreakdown(trades: Trade[], selected?: string[]): SymbolBreakdown {
  const counts = new Map<string, number>();
  for (const t of trades) if (t.status === "closed") { const k = symbolKey(t.symbol); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const want = selected && selected.length ? new Set(selected.map(symbolKey)) : null;
  const rows = [...counts].filter(([k]) => !want || want.has(k));
  const total = rows.reduce((a, [, n]) => a + n, 0);
  const symbols = rows
    .map(([symbol, count]) => ({ symbol, count, pct: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return { total, distinct: symbols.length, symbols };
}

export interface Cell { net: number; n: number; pct: number | null }
export interface YearRow { year: number; months: (Cell | null)[]; ytd: Cell }

/**
 * Net P&L, trade count and return % per month for each year (newest year first). Closed trades only; month = close date.
 * Month % = month net / balance at the start of that month (start + prior P&L); YTD % = year net / balance at the start of the year.
 * pct is null when that balance is not positive.
 */
export function yearlyBreakdown(trades: Trade[], start = 0): YearRow[] {
  const ys = new Map<number, YearRow>();
  for (const t of trades) {
    if (t.status !== "closed" || t.pnl == null) continue;
    const d = (t.exitTime || t.entryTime || "").slice(0, 7), y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1;
    if (!Number.isInteger(y) || !(m >= 0 && m < 12) || y < 1970) continue;
    const row = ys.get(y) ?? { year: y, months: Array(12).fill(null), ytd: { net: 0, n: 0, pct: null } };
    const c = row.months[m] ?? (row.months[m] = { net: 0, n: 0, pct: null });
    c.net += t.pnl; c.n++; row.ytd.net += t.pnl; row.ytd.n++;
    ys.set(y, row);
  }
  const asc = [...ys.values()].sort((a, b) => a.year - b.year);
  let run = start;
  for (const r of asc) {
    const yStart = run;
    r.months.forEach((c) => { if (c) { c.pct = run > 0 ? (c.net / run) * 100 : null; run += c.net; } });
    r.ytd.pct = yStart > 0 ? (r.ytd.net / yStart) * 100 : null;
  }
  return asc.reverse();
}
