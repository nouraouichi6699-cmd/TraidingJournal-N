// The deeper results of one strategy, from the closed trades linked to it: the dashboard's own numbers (lib/stats
// tradeCore, lib/dashAnalytics streaks, lib/tradeLab R), plus its drawdown, holding time, long vs short and P&L curve.
import type { Trade } from "../types";
import { ticketOf, tradeCore } from "./stats";
import { streakBreakdown } from "./dashAnalytics";
import { rMultiple } from "./tradeLab";

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
