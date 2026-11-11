import type { Trade } from "../types";
import { cents, tradeCore, ticketOf } from "./stats";
import { tradeDay } from "./tradingTime";

const closedOnly = (t: Trade) => t.status === "closed" && t.pnl != null;
/** Calendar day (YYYY-MM-DD) a trade belongs to: its CLOSE date (entry date as a fallback). */
export const dayKey = (t: Trade): string => tradeDay(t, t.exitTime || t.entryTime || "");
const closeKey = (t: Trade) => t.exitTime || t.entryTime || "";
const mins = (s: string | null) => { const v = s ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z") : NaN; return Number.isNaN(v) ? null : v / 60000; };

export interface DayRow { day: string; net: number; n: number }
/** Trading days (closed trades only), newest first. A day is "profit" when its cent-rounded net is > 0. */
export function dayList(trades: Trade[]): DayRow[] {
  const m = new Map<string, { net: number; n: number }>();
  for (const t of trades.filter(closedOnly)) { const k = dayKey(t); if (!k) continue; const r = m.get(k) ?? { net: 0, n: 0 }; r.net += t.pnl as number; r.n++; m.set(k, r); }
  return [...m].map(([day, r]) => ({ day, net: cents(r.net), n: r.n })).sort((a, b) => b.day.localeCompare(a.day));
}

/** The day's closed trades, in close order (ties by ticket). */
export function dayTrades(trades: Trade[], day: string): Trade[] {
  return trades.filter((t) => closedOnly(t) && dayKey(t) === day).sort((a, b) => closeKey(a).localeCompare(closeKey(b)) || ticketOf(a) - ticketOf(b));
}

export interface DayStats { net: number; winRate: number | null; pf: number | null; avgHoldMin: number | null; trades: number; expectancy: number | null; wins: number; losses: number; be: number }
export function dayStats(day: Trade[]): DayStats {
  const c = tradeCore(day);
  const holds = day.map((t) => { const a = mins(t.entryTime), b = mins(t.exitTime); return a != null && b != null && b >= a ? b - a : null; }).filter((x): x is number => x != null);
  return { net: c.net, winRate: c.winRate, pf: c.pf, avgHoldMin: holds.length ? holds.reduce((a, x) => a + x, 0) / holds.length : null, trades: c.n, expectancy: c.avgTrade, wins: c.wins.length, losses: c.losses.length, be: c.be };
}

/** A month as a week-aligned grid of 7-day rows: each in-month day as YYYY-MM-DD, null for the leading/trailing
 *  padding that belongs to the neighbouring months. `sunFirst` starts the week on Sunday, else on Monday. */
export function monthCells(month: string, sunFirst: boolean): (string | null)[] {
  const [y, mo] = month.split("-").map(Number);
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const dow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const lead = sunFirst ? dow : (dow + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** The month (YYYY-MM) `n` months after `month`. */
export const shiftMonth = (month: string, n: number): string => {
  const [y, mo] = month.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
};

export interface MonthSummary { net: number; winRate: number | null; tradingDays: number; greenDays: number; redDays: number }
/** Headline numbers for one month (YYYY-MM): net P&L and trade win rate over its closed trades (via dayStats, so it
 *  matches the per-day strip), plus how many trading days closed green / red. `days` is the dayList of the same trades. */
export function monthSummary(trades: Trade[], days: DayRow[], month: string): MonthSummary {
  const inMonth = days.filter((d) => d.day.startsWith(month));
  const st = dayStats(trades.filter((t) => closedOnly(t) && dayKey(t).startsWith(month)));
  return { net: st.net, winRate: st.winRate, tradingDays: inMonth.length, greenDays: inMonth.filter((d) => d.net > 0).length, redDays: inMonth.filter((d) => d.net < 0).length };
}

export interface WeekTotal { net: number; days: number }
/** One total per 7-cell row of `monthCells`: net P&L and trading-day count of that row's in-month days. Padding
 *  (null) cells and days without trades contribute nothing, so a row with no trades has days === 0. */
export function weekTotals(cells: (string | null)[], days: DayRow[]): WeekTotal[] {
  const byDay = new Map(days.map((d) => [d.day, d.net]));
  const out: WeekTotal[] = [];
  for (let r = 0; r < cells.length; r += 7) {
    let net = 0, n = 0;
    for (const c of cells.slice(r, r + 7)) { const v = c ? byDay.get(c) : undefined; if (v != null) { net += v; n++; } }
    out.push({ net: cents(net), days: n });
  }
  return out;
}
