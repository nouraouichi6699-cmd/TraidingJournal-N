import type { Trade } from "../types";

export function computeStats(trades: Trade[]) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null);
  const wins = closed.filter((t) => (t.pnl as number) > 0);
  const losses = closed.filter((t) => (t.pnl as number) < 0);
  const gross = (a: Trade[]) => a.reduce((s, t) => s + (t.pnl as number), 0);
  const net = gross(closed);
  const lossSum = Math.abs(gross(losses));
  return {
    count: trades.length,
    closed: closed.length,
    open: trades.length - closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    net,
    profitFactor: lossSum ? gross(wins) / lossSum : null,
  };
}

export const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
