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
