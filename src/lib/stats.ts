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

/** Minutes -> "1h 24m" (rounds total minutes first so 119.6 -> "2h 0m"). */
export const fmtHold = (v: number) => { const t = Math.round(v), h = Math.floor(t / 60), m = t % 60; return h ? `${h}h ${m}m` : `${m}m`; };

export const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

// ---------- Overview report (32 metrics) ----------
import { computeActivity } from "./activity";
import type { Account, BalancePoint } from "../types";

export type Why = "equity" | "cashflow" | "days" | "start" | "balance" | "stored";
export interface Overview {
  n: number; net: number; totalReturn: number | null; avgDaily: number | null; avgTrade: number | null;
  best: number | null; worst: number | null; costDrag: number | null;
  winRate: number | null; beRate: number | null; pf: number | null; payoff: number | null; avgWin: number | null; avgLoss: number | null;
  maxBalDD: number | null; underwaterDays: number | null; sharpe: number | null; sortino: number | null; calmar: number | null; recovery: number | null;
  tradingDays: number; activeFreq: number | null; perDay: number | null; holdMin: number | null; volume: number; commissions: number;
  why: Partial<Record<string, Why>>; // metric id -> reason it is unavailable
}

const fin = (v: number | null): number | null => (v != null && Number.isFinite(v) ? v : null);
const ms = (s: string | null) => { const v = s ? Date.parse(s) : NaN; return Number.isFinite(v) ? v : null; };

/** Balance curve: real balance points when there are enough, otherwise start balance + cumulative closed P&L. */
function curve(closed: Trade[], ids: string[], accounts: Account[], balances: Record<string, BalancePoint[]>, from: string): { t: number; v: number }[] {
  const ev = ids.flatMap((id) => (balances[id] ?? []).filter((p) => !from || p.t >= from).map((p) => ({ id, t: ms(p.t), v: p.balance }))).filter((e): e is { id: string; t: number; v: number } => e.t != null).sort((a, b) => a.t - b.t);
  if (ev.length >= 2) {
    const last: Record<string, number> = {};
    return ev.map((e) => { last[e.id] = e.v; return { t: e.t, v: Object.values(last).reduce((s, x) => s + x, 0) }; });
  }
  let run = accounts.filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.startBalance, 0);
  const out = [] as { t: number; v: number }[];
  for (const x of [...closed].sort((a, b) => (a.exitTime ?? "").localeCompare(b.exitTime ?? ""))) { const t = ms(x.exitTime); if (t != null) out.push({ t, v: (run += x.pnl as number) }); }
  return out;
}

export function computeOverview(trades: Trade[], accounts: Account[], balances: Record<string, BalancePoint[]>, from = ""): Overview {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null);
  const s = computeStats(closed);
  const p = (t: Trade) => t.pnl as number;
  const wins = closed.filter((t) => p(t) > 0), losses = closed.filter((t) => p(t) < 0);
  const gp = wins.reduce((a, t) => a + p(t), 0), gl = Math.abs(losses.reduce((a, t) => a + p(t), 0));
  const n = closed.length;
  const act = computeActivity(closed);
  const ids = [...new Set(closed.map((t) => t.accountId))];
  const start = accounts.filter((a) => ids.includes(a.id)).reduce((x, a) => x + a.startBalance, 0);
  const why: Overview["why"] = { twr: "cashflow", maxEqDD: "equity", curEqDD: "equity", fees: "stored", swaps: "stored" };

  const commissions = closed.reduce((a, t) => a + (t.commission || 0), 0);
  const holds = closed.map((t) => { const a = ms(t.entryTime), b = ms(t.exitTime); return a != null && b != null && b >= a ? (b - a) / 60000 : null; }).filter((x): x is number => x != null);

  const totalReturn = n && start > 0 ? s.net / start : null; // fraction; exposed x100
  if (n && totalReturn == null) why.totalReturn = "start";

  // Drawdown family (balance based).
  const cv = n ? curve(closed, ids, accounts, balances, from) : [];
  let inDD = false;
  let peak = -Infinity, peakT = 0, maxAmt = 0, maxPct = 0, under = 0, lastT = 0;
  for (const pt of cv) {
    lastT = pt.t;
    if (pt.v >= peak) { if (peak > -Infinity && pt.t > peakT && pt.v >= peak && inDD) under = Math.max(under, pt.t - peakT); inDD = false; peak = pt.v; peakT = pt.t; }
    else { inDD = true; maxAmt = Math.max(maxAmt, peak - pt.v); if (peak > 0) maxPct = Math.max(maxPct, (peak - pt.v) / peak); }
  }
  if (inDD) under = Math.max(under, lastT - peakT); // drawdown still open: counts until the last trade
  const haveCurve = cv.length >= 2;
  const maxBalDD = haveCurve && (start > 0 || peak > 0) ? maxPct * 100 : null;
  if (n && maxBalDD == null) why.maxBalDD = "balance";
  const underwaterDays = haveCurve ? under / 864e5 : null;
  if (n && underwaterDays == null) why.underwater = "balance";
  const recovery = haveCurve && maxAmt > 0 ? fin(s.net / maxAmt) : null;
  if (n && recovery == null) why.recovery = haveCurve ? undefined : "balance";

  // Risk-adjusted ratios need start balance and >= 30 trading days.
  let sharpe: number | null = null, sortino: number | null = null, calmar: number | null = null;
  const days = act?.tradingDays ?? 0;
  const needDays = n > 0 && days < 30, needStart = n > 0 && start <= 0;
  if (n && days >= 30 && start > 0) {
    const byDay: Record<string, number> = {};
    for (const t of closed) { const d = (t.exitTime ?? t.entryTime ?? "").slice(0, 10); if (d) byDay[d] = (byDay[d] ?? 0) + p(t); }
    const keys = Object.keys(byDay).sort();
    let bal = start; const r: number[] = [];
    const u = (d: string) => Date.parse(d + "T00:00:00Z");
    for (let t = u(keys[0]); t <= u(keys[keys.length - 1]); t += 864e5) {
      const d = new Date(t).toISOString().slice(0, 10), wd = new Date(t).getUTCDay(), pl = byDay[d] ?? 0;
      if (wd === 0 || wd === 6) { if (pl === 0) continue; } // weekend: only if it has trades
      if (bal > 0) r.push(pl / bal);
      bal += pl;
    }
    if (r.length >= 2) {
      const m = r.reduce((a, x) => a + x, 0) / r.length;
      const sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1));
      const dd = Math.sqrt(r.reduce((a, x) => a + Math.min(x, 0) ** 2, 0) / r.length);
      sharpe = sd > 0 ? fin((m / sd) * Math.sqrt(252)) : null;
      sortino = dd > 0 ? fin((m / dd) * Math.sqrt(252)) : null;
      const span = act ? (Date.parse(act.last) - Date.parse(act.first)) / 864e5 + 1 : 0;
      calmar = totalReturn != null && maxPct > 0 && span > 0 ? fin(((totalReturn * 365) / span) / maxPct) : null;
    }
  }
  for (const id of ["sharpe", "sortino", "calmar"]) if (n && (id === "sharpe" ? sharpe : id === "sortino" ? sortino : calmar) == null) why[id] = needStart ? "start" : needDays ? "days" : undefined;

  return {
    n, net: s.net, totalReturn: totalReturn == null ? null : fin(totalReturn * 100), avgDaily: days ? s.net / days : null, avgTrade: n ? s.net / n : null,
    best: n ? Math.max(...closed.map(p)) : null, worst: n ? Math.min(...closed.map(p)) : null,
    costDrag: gp > 0 ? (commissions / gp) * 100 : null,
    winRate: s.winRate, beRate: n ? (closed.filter((t) => p(t) === 0).length / n) * 100 : null,
    pf: gl > 0 ? gp / gl : null, payoff: wins.length && losses.length ? fin(gp / wins.length / (gl / losses.length)) : null,
    avgWin: wins.length ? gp / wins.length : null, avgLoss: losses.length ? -gl / losses.length : null,
    maxBalDD, underwaterDays, sharpe, sortino, calmar, recovery,
    tradingDays: days, activeFreq: act ? act.freq * 100 : null, perDay: act ? act.perDay : null,
    holdMin: holds.length ? holds.reduce((a, x) => a + x, 0) / holds.length : null, volume: act ? act.vol.total : 0, commissions, why,
  };
}
