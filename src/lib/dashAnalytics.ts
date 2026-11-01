// Pure dashboard analytics (no React, no storage).
import type { Trade } from "../types";
import { ticketOf } from "./stats";
import { signed, type CashFlow } from "./cashflow";
import { netOutcome } from "./outcome";

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
 * Month % = month net / balance at the start of that month; YTD % = year net / balance at the start of the year (or of `from`).
 * The base balance = start + P&L of ALL earlier trades (`all`, not just the shown ones) + recorded cash flows up to the end
 * of the period (flows are assumed to land at the start of the period, as in Returns & capital). pct is null when it is not positive.
 */
export function yearlyBreakdown(trades: Trade[], start = 0, opts: { all?: Trade[]; flows?: CashFlow[]; from?: string } = {}): YearRow[] {
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
  const all = (opts.all ?? trades).filter((t) => t.status === "closed" && t.pnl != null).map((t) => ({ d: (t.exitTime || t.entryTime || "").slice(0, 10), v: t.pnl as number }));
  const fl = (opts.flows ?? []).map((f) => ({ d: f.t.slice(0, 10), v: signed(f) }));
  const from = opts.from ?? "";
  // Balance at the start of [ps, pe]: start + P&L closed before ps + flows dated up to pe.
  const base = (ps: string, pe: string) => start + all.reduce((s, x) => (x.d < ps ? s + x.v : s), 0) + fl.reduce((s, x) => (x.d <= pe ? s + x.v : s), 0);
  const pctOf = (net: number, b: number) => (b > 0 ? (net / b) * 100 : null);
  for (const r of asc) {
    r.months.forEach((c, m) => {
      if (!c) return;
      const mm = `${r.year}-${String(m + 1).padStart(2, "0")}`;
      c.pct = pctOf(c.net, base(from > `${mm}-01` ? from : `${mm}-01`, `${mm}-31`));
    });
    r.ytd.pct = pctOf(r.ytd.net, base(from > `${r.year}-01-01` ? from : `${r.year}-01-01`, `${r.year}-12-31`));
  }
  return asc.reverse();
}

export interface Streak { current: { kind: "win" | "loss" | "none"; n: number }; bestWin: number; worstLoss: number; bestBE: number }
export interface Streaks { trades: Streak; days: Streak }

const runs = (vals: number[]): Streak => {
  let kind: "win" | "loss" | "none" = "none", n = 0, bestWin = 0, worstLoss = 0, be = 0, bestBE = 0;
  for (const v of vals) {
    if (v === 0) { be++; bestBE = Math.max(bestBE, be); continue; } // breakeven: neither counts nor breaks a win/loss streak
    be = 0;
    const k = netOutcome(v) === "win" ? "win" : "loss";
    if (k === kind) n++; else { kind = k; n = 1; }
    if (k === "win") bestWin = Math.max(bestWin, n); else worstLoss = Math.max(worstLoss, n);
  }
  return { current: { kind, n }, bestWin, worstLoss, bestBE };
};

/**
 * Win/loss streaks over closed trades (ordered by close time, then trade no.) and over trading days (day = close date, net P&L > 0 win, < 0 loss).
 * Breakeven trades/days are skipped (they neither count nor break a win/loss streak); bestBE = longest run of consecutive breakevens. "Worst" = longest losing streak.
 */
export function streakBreakdown(trades: Trade[]): Streaks {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null)
    .sort((a, b) => (a.exitTime || a.entryTime || "").localeCompare(b.exitTime || b.entryTime || "") || ticketOf(a) - ticketOf(b));
  const day = new Map<string, number>();
  for (const t of closed) { const d = (t.exitTime || t.entryTime || "").slice(0, 10); if (d) day.set(d, (day.get(d) ?? 0) + (t.pnl as number)); }
  return { trades: runs(closed.map((t) => t.pnl as number)), days: runs([...day.keys()].sort().map((d) => day.get(d) as number)) };
}
