// The deeper results of one strategy, from the closed trades linked to it: the dashboard's own numbers (lib/stats
// tradeCore, lib/dashAnalytics streaks, lib/tradeLab R), plus its drawdown, holding time, long vs short and P&L curve.
import type { Trade } from "../types";
import { ticketOf, tradeCore } from "./stats";
import { streakBreakdown } from "./dashAnalytics";
import { entryMs, heatmap, isClosed, rMultiple, sessionOf, type HeatCell } from "./tradeLab";
import { netOutcome } from "./outcome";

export interface SideStats { n: number; wins: number; net: number; winRate: number | null }
export interface StrategyStats {
  n: number; pf: number | null; avgTrade: number | null; avgWin: number | null; avgLoss: number | null;
  best: number | null; worst: number | null; maxDD: number; winStreak: number; lossStreak: number;
  avgR: number | null; rN: number; holdMin: number | null; long: SideStats; short: SideStats;
  curve: number[]; // cumulative P&L after each closed trade, in close order
}

const ms = (s: string | null) => { const v = s ? Date.parse(s) : NaN; return Number.isFinite(v) ? v : null; };
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export function strategyStats(trades: Trade[]): StrategyStats {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null)
    .sort((a, b) => (a.exitTime || a.entryTime || "").localeCompare(b.exitTime || b.entryTime || "") || ticketOf(a) - ticketOf(b));
  const c = tradeCore(closed), s = streakBreakdown(closed).trades;
  let cum = 0, peak = 0, maxDD = 0; // drawdown from the running peak, starting at 0
  const curve = closed.map((t) => { cum += t.pnl as number; peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); return cum; });
  const rs = closed.map((t) => rMultiple(t)).filter((r): r is number => r != null);
  const holds = closed.map((t) => { const a = ms(t.entryTime), b = ms(t.exitTime); return a != null && b != null && b >= a ? (b - a) / 60000 : null; }).filter((x): x is number => x != null);
  const side = (d: Trade["side"]): SideStats => { const k = tradeCore(closed.filter((t) => t.side === d)); return { n: k.n, wins: k.wins.length, net: k.net, winRate: k.winRate }; };
  return {
    n: c.n, pf: c.pf, avgTrade: c.avgTrade, avgWin: c.avgWin, avgLoss: c.avgLoss, best: c.best, worst: c.worst,
    maxDD, winStreak: s.bestWin, lossStreak: s.worstLoss, avgR: mean(rs), rN: rs.length, holdMin: mean(holds),
    long: side("long"), short: side("short"), curve,
  };
}

// ---------- When it works ----------

export type SessionKey = "sessTK" | "sessLN" | "sessNY" | "sessSY"; // lib/tradeLab sessionOf
export const SESSIONS: SessionKey[] = ["sessTK", "sessLN", "sessNY", "sessSY"];
export type Group = { kind: "session"; s: SessionKey } | { kind: "day"; d: number } | { kind: "symbol"; sym: string } | { kind: "symbolSession"; sym: string; s: SessionKey };
export interface Conditions {
  n: number; heat: HeatCell[][]; hours: number[]; days: number[]; // entry hours / weekdays (0 = Monday) that have trades
  sessions: { s: SessionKey; p: SideStats }[]; byDay: { d: number; p: SideStats }[]; symbols: { sym: string; p: SideStats }[];
  best: { g: Group; p: SideStats } | null; worst: { g: Group; p: SideStats } | null;
}
const partOf = (list: Trade[]): SideStats => { const k = tradeCore(list); return { n: k.n, wins: k.wins.length, net: k.net, winRate: k.winRate }; };

/**
 * When a strategy works, from its closed trades: weekday x hour (the Charts heatmap), by session, weekday and symbol (top 3),
 * and the best and worst group (also symbol x session) among those of `min` trades or more that are not all the trades.
 * Ties go to the more specific group. Entry times read as UTC, like the Charts.
 */
export function conditionsOf(trades: Trade[], min = 3): Conditions {
  const closed = trades.filter(isClosed);
  const hourOf = (t: Trade) => new Date(entryMs(t)).getUTCHours(), dayOf = (t: Trade) => (new Date(entryMs(t)).getUTCDay() + 6) % 7;
  const group = <K,>(key: (t: Trade) => K) => { const m = new Map<K, Trade[]>(); for (const t of closed) { const k = key(t); m.set(k, [...(m.get(k) ?? []), t]); } return m; };
  const bySess = group((t) => sessionOf(hourOf(t)) as SessionKey), byDay = group(dayOf), bySym = group((t) => t.symbol), byCombo = group((t) => `${t.symbol}\u0000${sessionOf(hourOf(t))}`);
  const sessions: Conditions["sessions"] = SESSIONS.filter((s) => bySess.has(s)).map((s) => ({ s, p: partOf(bySess.get(s) as Trade[]) }));
  const days = [...byDay.keys()].sort((a, b) => a - b), byDayP = days.map((d) => ({ d, p: partOf(byDay.get(d) as Trade[]) }));
  const symbols = [...bySym].map(([sym, l]) => ({ sym, p: partOf(l) }));
  const all: { g: Group; p: SideStats }[] = [
    ...[...byCombo].map(([k, l]) => { const [sym, s] = k.split("\u0000"); return { g: { kind: "symbolSession", sym, s: s as SessionKey } as Group, p: partOf(l) }; }),
    ...symbols.map(({ sym, p }) => ({ g: { kind: "symbol", sym } as Group, p })),
    ...sessions.map(({ s, p }) => ({ g: { kind: "session", s } as Group, p })),
    ...byDayP.map(({ d, p }) => ({ g: { kind: "day", d } as Group, p })),
  ].filter((x) => x.p.n >= min && x.p.n < closed.length);
  return {
    n: closed.length, heat: heatmap(closed), hours: [...new Set(closed.map(hourOf))].sort((a, b) => a - b), days, sessions, byDay: byDayP,
    symbols: symbols.sort((a, b) => b.p.net - a.p.net || b.p.n - a.p.n).slice(0, 3),
    best: all.filter((x) => netOutcome(x.p.net) === "win").sort((a, b) => b.p.net - a.p.net || b.p.n - a.p.n)[0] ?? null,
    worst: all.filter((x) => netOutcome(x.p.net) === "loss").sort((a, b) => a.p.net - b.p.net || b.p.n - a.p.n)[0] ?? null,
  };
}
