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
import { signed, type CashFlow } from "./cashflow";

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

/** Ticket used to order trades closed in the same minute: the numeric id after "account:" in the key, else the row/trade number. */
export const ticketOf = (t: Trade): number => {
  const id = t.key.slice(t.key.lastIndexOf(":") + 1);
  return /^\d+$/.test(id) ? Number(id) : t.no;
};

/** P&L rounded to cents: classification (win/loss/breakeven) is done on this value. */
export const cents = (x: number) => Math.round(x * 100) / 100;

/** Shared trade-outcome core: the single source of truth for Overview and Trade outcomes. Percent values are in percent units. */
export function tradeCore(closed: Trade[]) {
  const p = (t: Trade) => t.pnl as number;
  const wins = closed.filter((t) => cents(p(t)) > 0), losses = closed.filter((t) => cents(p(t)) < 0);
  const n = closed.length, be = n - wins.length - losses.length;
  const gp = wins.reduce((a, t) => a + p(t), 0), gl = Math.abs(losses.reduce((a, t) => a + p(t), 0));
  const net = closed.reduce((a, t) => a + p(t), 0);
  const avgWin = wins.length ? gp / wins.length : null, avgLoss = losses.length ? -gl / losses.length : null;
  return {
    n, net, wins, losses, gp, gl, be,
    winRate: n ? (wins.length / n) * 100 : null, beRate: n ? (be / n) * 100 : null,
    pf: gl > 0 ? fin(gp / gl) : null,
    payoff: avgWin != null && avgLoss != null && avgLoss !== 0 ? fin(avgWin / Math.abs(avgLoss)) : null,
    avgWin, avgLoss, avgTrade: n ? net / n : null,
    best: wins.length ? Math.max(...wins.map(p)) : null, worst: losses.length ? Math.min(...losses.map(p)) : null,
  };
}

/** Comparable timestamp ("YYYY-MM-DD 00:00:00" and "YYYY-MM-DDTHH:MM" -> "YYYY-MM-DDTHH:MM"). */
const norm = (s: string) => s.trim().replace(" ", "T").slice(0, 16);
type CPt = { t: number; v: number; f: number }; // time, balance, external cash flow that happened at this point

/**
 * Balance curve: real balance points when there are enough, otherwise start balance + cumulative closed P&L (+ recorded cash flows).
 * `f` carries the deposits/withdrawals inside each step so drawdowns can ignore them. In the snapshot curve a flow is attached to
 * the account's first snapshot at or after it (imported MT5 flows share the deal's timestamp).
 */
function curve(closed: Trade[], ids: string[], accounts: Account[], balances: Record<string, BalancePoint[]>, from: string, flows: CashFlow[] = []): CPt[] & { base?: number } {
  const fl = flows.filter((x) => ids.includes(x.accountId) && x.t && Number.isFinite(x.amount) && x.amount !== 0 && (!from || x.t >= from));
  const ev = ids.flatMap((id) => (balances[id] ?? []).filter((p) => !from || p.t >= from).map((p) => ({ id, s: norm(p.t), t: ms(p.t), v: p.balance }))).filter((e): e is { id: string; s: string; t: number; v: number } => e.t != null).sort((a, b) => a.t - b.t);
  if (ev.length >= 2) {
    const fAt = new Map<(typeof ev)[number], number>();
    for (const x of fl) { const k = norm(x.t), hit = ev.find((e) => e.id === x.accountId && e.s >= k); if (hit) fAt.set(hit, (fAt.get(hit) ?? 0) + signed(x)); }
    const last: Record<string, number> = {};
    return ev.map((e) => { last[e.id] = e.v; return { t: e.t, v: Object.values(last).reduce((s, x) => s + x, 0), f: fAt.get(e) ?? 0 }; });
  }
  let run = accounts.filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.startBalance, 0);
  const out = [] as (CPt[] & { base?: number });
  out.base = run; // start balance counts as the first peak for drawdown depth
  const steps = [
    ...closed.map((x) => ({ k: x.exitTime ?? "", t: ms(x.exitTime), d: x.pnl as number, f: 0, o: 1 })),
    ...fl.map((x) => ({ k: norm(x.t), t: ms(x.t), d: signed(x), f: signed(x), o: 0 })), // a flow comes before a trade at the same time
  ].sort((a, b) => a.k.localeCompare(b.k) || a.o - b.o);
  for (const x of steps) if (x.t != null) out.push({ t: x.t, v: (run += x.d), f: x.f });
  return out;
}

/**
 * Drawdown views of a curve that contains cash flows: `pct` is a time-weighted index (each step's return excludes the flow),
 * so a withdrawal is not a loss and a deposit is not a gain; `amt` is balance minus cumulative flows (money lost to trading).
 * Without flows both are the curve itself, so results are unchanged.
 */
function drawdownViews(cv: CPt[] & { base?: number }): { pct: { t: number; v: number }[]; pctBase?: number; amt: { t: number; v: number }[]; amtBase?: number } {
  if (!cv.some((p) => p.f !== 0)) return { pct: cv, pctBase: cv.base, amt: cv, amtBase: cv.base };
  const pct: { t: number; v: number }[] = [], amt: { t: number; v: number }[] = [];
  let prev = cv.base ?? cv[0]?.v ?? 0, idx = 1, cum = 0;
  cv.forEach((p, i) => {
    if (i === 0 && cv.base == null) { pct.push({ t: p.t, v: 1 }); amt.push({ t: p.t, v: p.v }); prev = p.v; return; }
    cum += p.f;
    if (prev > 0) idx *= 1 + (p.v - prev - p.f) / prev;
    prev = p.v;
    pct.push({ t: p.t, v: idx }); amt.push({ t: p.t, v: p.v - cum });
  });
  return { pct, pctBase: cv.base != null ? 1 : undefined, amt, amtBase: cv.base };
}

export function computeOverview(trades: Trade[], accounts: Account[], balances: Record<string, BalancePoint[]>, from = "", flows: CashFlow[] = []): Overview {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null);
  const core = tradeCore(closed);
  const s = { net: core.net, winRate: core.winRate };
  const p = (t: Trade) => t.pnl as number;
  const { wins, losses, gp, gl, n } = core;
  const act = computeActivity(closed);
  const ids = [...new Set(closed.map((t) => t.accountId))];
  const start = accounts.filter((a) => ids.includes(a.id)).reduce((x, a) => x + a.startBalance, 0);
  const why: Overview["why"] = { twr: "cashflow", maxEqDD: "equity", curEqDD: "equity", fees: "stored", swaps: "stored" };

  const commissions = closed.reduce((a, t) => a + (t.commission || 0), 0);
  const holds = closed.map((t) => { const a = ms(t.entryTime), b = ms(t.exitTime); return a != null && b != null && b >= a ? (b - a) / 60000 : null; }).filter((x): x is number => x != null);

  const totalReturn = n && start > 0 ? s.net / start : null; // fraction; exposed x100
  if (n && totalReturn == null) why.totalReturn = "start";

  // Drawdown family (balance based; recorded deposits/withdrawals are neither gains nor drawdowns).
  const cv = n ? curve(closed, ids, accounts, balances, from, flows) : [];
  const dv = drawdownViews(cv as CPt[] & { base?: number });
  let inDD = false;
  let peak = -Infinity, peakT = 0, under = 0, lastT = 0;
  for (const pt of dv.pct) {
    lastT = pt.t;
    if (pt.v >= peak) { if (peak > -Infinity && pt.t > peakT && inDD) under = Math.max(under, pt.t - peakT); inDD = false; peak = pt.v; peakT = pt.t; }
    else inDD = true;
  }
  if (inDD) under = Math.max(under, lastT - peakT); // drawdown still open: counts until the last trade
  // Drawdown depth: standard definition, the start balance is the first peak (when the curve is built from P&L).
  let dPeak = dv.pctBase != null && dv.pctBase > 0 ? dv.pctBase : -Infinity, maxAmt = 0, maxPct = 0;
  for (const pt of dv.pct) { if (pt.v >= dPeak) dPeak = pt.v; else if (dPeak > 0) maxPct = Math.max(maxPct, (dPeak - pt.v) / dPeak); }
  let aPeak = dv.amtBase != null && dv.amtBase > 0 ? dv.amtBase : -Infinity;
  for (const pt of dv.amt) { if (pt.v >= aPeak) aPeak = pt.v; else maxAmt = Math.max(maxAmt, aPeak - pt.v); }
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
    // Recorded cash flows land at the start of their day (as in Returns & capital); flows before the first trading day are added first.
    const flowDay: Record<string, number> = {};
    for (const x of flows) if (ids.includes(x.accountId) && x.t && (!from || x.t >= from)) flowDay[x.t.slice(0, 10)] = (flowDay[x.t.slice(0, 10)] ?? 0) + signed(x);
    let bal = start + Object.entries(flowDay).reduce((s, [d, v]) => (d < keys[0] ? s + v : s), 0); const r: number[] = [];
    const u = (d: string) => Date.parse(d + "T00:00:00Z");
    for (let t = u(keys[0]); t <= u(keys[keys.length - 1]); t += 864e5) {
      const d = new Date(t).toISOString().slice(0, 10), wd = new Date(t).getUTCDay(), pl = byDay[d] ?? 0;
      bal += flowDay[d] ?? 0;
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
    n, net: s.net, totalReturn: totalReturn == null ? null : fin(totalReturn * 100), avgDaily: days ? s.net / days : null, avgTrade: core.avgTrade,
    best: core.best, worst: core.worst,
    costDrag: gp > 0 ? (commissions / gp) * 100 : null,
    winRate: core.winRate, beRate: core.beRate,
    pf: core.pf, payoff: core.payoff, avgWin: core.avgWin, avgLoss: core.avgLoss,
    maxBalDD, underwaterDays, sharpe, sortino, calmar, recovery,
    tradingDays: days, activeFreq: act ? act.freq * 100 : null, perDay: act ? act.perDay : null,
    holdMin: holds.length ? holds.reduce((a, x) => a + x, 0) / holds.length : null, volume: act ? act.vol.total : 0, commissions, why,
  };
}
