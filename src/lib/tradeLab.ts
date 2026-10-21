// "Trade lab": what-if rules, weekday x hour heatmap, R multiples, revenge-trading split, prop-firm rules, edge alerts.
// Pure functions (no React), covered by tradeLab.test.ts. Times follow the Charts convention: stored wall times read as UTC.
import type { Trade } from "../types";

export interface Pt { t: number; v: number }
const ms = (s: string | null | undefined) => (s ? Date.parse(s.length <= 16 ? `${s}Z` : s) : NaN);
const isClosed = (t: Trade) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && !Number.isNaN(ms(t.exitTime));
const c2 = (x: number) => Math.round(x * 100) / 100;
const pnl = (t: Trade) => t.pnl as number;
const entryMs = (t: Trade) => { const e = ms(t.entryTime); return Number.isNaN(e) ? ms(t.exitTime) : e; };
const dayOf = (tm: number) => new Date(tm).toISOString().slice(0, 10);
const byClose = (a: Trade, b: Trade) => ms(a.exitTime) - ms(b.exitTime) || a.no - b.no;
const byEntry = (a: Trade, b: Trade) => entryMs(a) - entryMs(b) || a.no - b.no;
/** Trading session of an hour (UTC), same split as the Periods chart. */
export const sessionOf = (h: number) => (h < 7 ? "sessTK" : h < 13 ? "sessLN" : h < 21 ? "sessNY" : "sessSY");

// ---------- What-if ----------

export interface WhatIfRules {
  weekdays?: number[]; // excluded entry weekdays, 0 = Monday ... 6 = Sunday
  sessions?: string[]; // excluded entry sessions (sessTK / sessLN / sessNY / sessSY)
  symbols?: string[]; // excluded symbols
  side?: "long" | "short" | null; // keep only this direction
  maxPerDay?: number; // keep only the first N trades opened each day (0 = off)
  stopAfterLosses?: number; // after N losing trades closed that day, open nothing more that day (0 = off)
  maxLoss?: number; // no trade loses more than this amount, like a hard stop (0 = off)
}

/**
 * Closed trades as they would have been under the rules. Day rules apply per account and use the entry day; "stop after N losses" only counts
 * losses already closed when the next trade is opened (what you would have known at that moment). Order: filters, day caps, loss cap.
 */
export function applyWhatIf(trades: Trade[], r: WhatIfRules): Trade[] {
  const wd = new Set(r.weekdays ?? []), ss = new Set(r.sessions ?? []), sy = new Set(r.symbols ?? []);
  let list = trades.filter(isClosed).filter((t) => {
    const e = new Date(entryMs(t));
    if (wd.has((e.getUTCDay() + 6) % 7) || ss.has(sessionOf(e.getUTCHours())) || sy.has(t.symbol)) return false;
    return !r.side || t.side === r.side;
  }).sort(byEntry);
  if ((r.maxPerDay ?? 0) > 0 || (r.stopAfterLosses ?? 0) > 0) {
    const kept: Trade[] = [], perDay = new Map<string, Trade[]>();
    for (const t of list) {
      const day = `${t.accountId}|${dayOf(entryMs(t))}`, mine = perDay.get(day) ?? [];
      if ((r.maxPerDay ?? 0) > 0 && mine.length >= (r.maxPerDay as number)) continue;
      if ((r.stopAfterLosses ?? 0) > 0) {
        const losses = mine.filter((x) => c2(pnl(x)) < 0 && ms(x.exitTime) <= entryMs(t)).length;
        if (losses >= (r.stopAfterLosses as number)) continue;
      }
      mine.push(t); perDay.set(day, mine); kept.push(t);
    }
    list = kept;
  }
  const cap = r.maxLoss ?? 0;
  if (cap > 0) list = list.map((t) => (pnl(t) < -cap ? { ...t, pnl: -cap } : t));
  return list.sort(byClose);
}

export interface LabStats { n: number; net: number; winRate: number | null; pf: number | null; maxDD: number }
/** Net, win rate, profit factor and the largest drop of cumulative P&L (money) of closed trades. */
export function labStats(trades: Trade[]): LabStats {
  const l = trades.filter(isClosed).sort(byClose);
  let net = 0, peak = 0, dd = 0, gp = 0, gl = 0, w = 0;
  for (const t of l) { const p = pnl(t); net += p; if (c2(p) > 0) { w++; gp += p; } else if (c2(p) < 0) gl -= p; peak = Math.max(peak, net); dd = Math.max(dd, peak - net); }
  return { n: l.length, net, winRate: l.length ? (w / l.length) * 100 : null, pf: gl > 1e-9 ? gp / gl : null, maxDD: dd };
}

/** Cumulative P&L curve (close order), starting at 0 just before the first trade. */
export function cumCurve(trades: Trade[]): Pt[] {
  const l = trades.filter(isClosed).sort(byClose);
  if (!l.length) return [];
  let run = 0;
  return [{ t: entryMs(l[0]) <= ms(l[0].exitTime) ? entryMs(l[0]) : ms(l[0].exitTime), v: 0 }, ...l.map((t) => ({ t: ms(t.exitTime), v: (run += pnl(t)) }))];
}

// ---------- Heatmap ----------

export interface HeatCell { n: number; net: number; wins: number }
/** Closed trades by entry weekday (0 = Monday) and entry hour (0-23). */
export function heatmap(trades: Trade[]): HeatCell[][] {
  const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, net: 0, wins: 0 })));
  for (const t of trades.filter(isClosed)) {
    const e = new Date(entryMs(t)), c = g[(e.getUTCDay() + 6) % 7][e.getUTCHours()];
    c.n++; c.net += pnl(t); if (c2(pnl(t)) > 0) c.wins++;
  }
  return g;
}

// ---------- R multiples ----------

/**
 * Result in R: price move / initial stop distance (contract size and commission do not matter).
 * Null without a stop loss, or when the stop is at / beyond the entry (moved to breakeven or into profit: no risk to measure).
 * Uses the stop recorded with the trade (for MT5 reports: the stop at close).
 */
export function rMultiple(t: Trade): number | null {
  if (!isClosed(t) || t.sl == null || !Number.isFinite(t.sl) || t.exitPrice == null || !Number.isFinite(t.exitPrice)) return null;
  const risk = t.side === "long" ? t.entryPrice - t.sl : t.sl - t.entryPrice;
  if (!(risk > 0)) return null;
  return (t.side === "long" ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice) / risk;
}

// ---------- Revenge trading ----------

export interface TiltGroups { normal: Trade[]; afterLoss: Trade[]; afterLossBigger: Trade[] }
/**
 * A trade is "after a loss" when, on the same account, the last trade closed before it was opened was a loss that closed
 * at most `minutes` earlier; "bigger" when its size is also larger than that losing trade. The three groups do not overlap.
 */
export function tiltSplit(trades: Trade[], minutes = 30): TiltGroups {
  const out: TiltGroups = { normal: [], afterLoss: [], afterLossBigger: [] };
  const all = trades.filter(isClosed);
  const byAcc = new Map<string, Trade[]>();
  for (const t of all) (byAcc.get(t.accountId) ?? byAcc.set(t.accountId, []).get(t.accountId)!).push(t);
  for (const list of byAcc.values()) {
    const closes = [...list].sort(byClose);
    for (const t of list) {
      const e = entryMs(t);
      let lo = 0, hi = closes.length - 1, k = -1; // last trade closed at or before the entry
      while (lo <= hi) { const m = (lo + hi) >> 1; if (ms(closes[m].exitTime) <= e) { k = m; lo = m + 1; } else hi = m - 1; }
      while (k >= 0 && closes[k] === t) k--;
      const p = k >= 0 ? closes[k] : null;
      if (p && c2(pnl(p)) < 0 && e - ms(p.exitTime) <= minutes * 60e3) (t.qty > p.qty ? out.afterLossBigger : out.afterLoss).push(t);
      else out.normal.push(t);
    }
  }
  return out;
}

// ---------- Prop-firm rules ----------

export interface PropRules { dailyLossPct: number; maxDDPct: number; targetPct: number; trailing: boolean }
export interface PropResult {
  floor: Pt[]; target: number; limitDaily: number;
  dailyBreaches: { day: string; pnl: number; t: number }[];
  floorBreachT: number | null; targetT: number | null;
  status: "passed" | "failed" | "active"; failT: number | null; toFloor: number; toTarget: number;
}
/**
 * Checks a balance curve against prop-firm style rules, all as % of the starting balance:
 *  - daily loss: realised P&L of a calendar day (close date) must not fall below -limit;
 *  - max loss: the balance must stay above the floor (start - limit, or peak - limit when trailing);
 *  - target: first time the balance reaches start + target.
 * Failed = any breach before the target; passed = target reached first. Realised P&L only (no open-position equity).
 */
export function propCheck(curve: Pt[], trades: Trade[], start: number, r: PropRules): PropResult | null {
  if (!(start > 0) || curve.length < 2) return null;
  const limitDD = (start * r.maxDDPct) / 100, limitDaily = (start * r.dailyLossPct) / 100, target = start * (1 + r.targetPct / 100);
  let peak = start, floorBreachT: number | null = null, targetT: number | null = null;
  const floor: Pt[] = [];
  for (const p of curve) {
    peak = Math.max(peak, p.v);
    const f = r.trailing ? peak - limitDD : start - limitDD;
    floor.push({ t: p.t, v: f });
    if (floorBreachT == null && r.maxDDPct > 0 && p.v < f - 1e-9) floorBreachT = p.t;
    if (targetT == null && r.targetPct > 0 && p.v >= target - 1e-9) targetT = p.t;
  }
  const days = new Map<string, { pnl: number; t: number }>();
  for (const t of trades.filter(isClosed)) { const tm = ms(t.exitTime), d = dayOf(tm), x = days.get(d) ?? { pnl: 0, t: tm }; x.pnl += pnl(t); x.t = Math.max(x.t, tm); days.set(d, x); }
  const dailyBreaches = r.dailyLossPct > 0 ? [...days].filter(([, x]) => x.pnl < -limitDaily - 1e-9).map(([day, x]) => ({ day, pnl: x.pnl, t: x.t })).sort((a, b) => a.t - b.t) : [];
  const failT = [floorBreachT, dailyBreaches[0]?.t ?? null].filter((x): x is number => x != null).sort((a, b) => a - b)[0] ?? null;
  const status = targetT != null && (failT == null || targetT < failT) ? "passed" : failT != null ? "failed" : "active";
  const last = curve[curve.length - 1].v;
  return { floor, target, limitDaily, dailyBreaches, floorBreachT, targetT, status, failT, toFloor: last - floor[floor.length - 1].v, toTarget: target - last };
}

// ---------- Edge alerts ----------

export interface EdgeAlert { accountId: string; key: string; t: number; exp: number; winRate: number; n: number }
/**
 * Accounts whose expectancy over their last `n` closed trades is negative right now. `key` is the trade where the current
 * negative run began, so the alert stays the same notification until the edge recovers and is lost again.
 */
export function edgeAlerts(trades: Trade[], n = 20): EdgeAlert[] {
  const out: EdgeAlert[] = [];
  const byAcc = new Map<string, Trade[]>();
  for (const t of trades.filter(isClosed)) (byAcc.get(t.accountId) ?? byAcc.set(t.accountId, []).get(t.accountId)!).push(t);
  for (const [accountId, list] of byAcc) {
    const l = list.sort(byClose);
    if (l.length < n) continue;
    const exp: number[] = [];
    let sum = 0;
    for (let i = 0; i < l.length; i++) { sum += pnl(l[i]); if (i >= n) sum -= pnl(l[i - n]); if (i >= n - 1) exp.push(sum / n); }
    if (!(exp[exp.length - 1] < 0)) continue;
    let s = exp.length - 1;
    while (s > 0 && exp[s - 1] < 0) s--;
    const at = l[s + n - 1], last = l.slice(-n);
    out.push({ accountId, key: at.key, t: ms(at.exitTime), exp: exp[exp.length - 1], winRate: (last.filter((x) => c2(pnl(x)) > 0).length / n) * 100, n });
  }
  return out;
}
