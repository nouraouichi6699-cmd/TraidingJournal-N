import type { Trade } from "../types";
import { cents, tradeCore, ticketOf } from "./stats";

const closedOnly = (t: Trade) => t.status === "closed" && t.pnl != null;
/** Calendar day (YYYY-MM-DD) a trade belongs to: its CLOSE date (entry date as a fallback). */
export const dayKey = (t: Trade): string => (t.exitTime || t.entryTime || "").slice(0, 10);
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
