// "Trade lab": what-if rules, weekday x hour heatmap, R multiples, revenge-trading split, prop-firm rules, edge alerts.
// Pure functions (no React), covered by tradeLab.test.ts. Times follow the Charts convention: stored wall times read as UTC.
import type { Trade } from "../types";
import { rng } from "./chartAnalytics";

export interface Pt { t: number; v: number }
const ms = (s: string | null | undefined) => (s ? Date.parse(s.length <= 16 ? `${s}Z` : s) : NaN);
export const isClosed = (t: Trade) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && !Number.isNaN(ms(t.exitTime));
const c2 = (x: number) => Math.round(x * 100) / 100;
const pnl = (t: Trade) => t.pnl as number;
export const entryMs = (t: Trade) => { const e = ms(t.entryTime); return Number.isNaN(e) ? ms(t.exitTime) : e; };
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
  dailyBreaches: { day: string; pnl: number; t: number }[]; // pnl = the day's lowest running P&L, t = when it broke the limit
  floorBreachT: number | null; targetT: number | null;
  status: "passed" | "failed" | "active"; failT: number | null; toFloor: number; toTarget: number;
}
/**
 * Checks a balance curve against prop-firm style rules, all as % of the starting balance:
 *  - daily loss: the day's realised P&L (close date), counted trade by trade, must never fall below -limit, even if the
 *    day recovers later (prop firms check it during the day);
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
  const days = new Map<string, { run: number; low: number; t: number | null }>(); // running P&L, its low, time it first broke the limit
  for (const t of trades.filter(isClosed).sort(byClose)) {
    const tm = ms(t.exitTime), d = dayOf(tm), x = days.get(d) ?? { run: 0, low: 0, t: null };
    x.run += pnl(t); x.low = Math.min(x.low, x.run);
    if (x.t == null && x.run < -limitDaily - 1e-9) x.t = tm;
    days.set(d, x);
  }
  const dailyBreaches = r.dailyLossPct > 0 ? [...days].filter(([, x]) => x.t != null).map(([day, x]) => ({ day, pnl: x.low, t: x.t as number })).sort((a, b) => a.t - b.t) : [];
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

// ---------- Golden rules ----------

export type RuleKind = "weekday" | "session" | "symbol" | "side" | "maxPerDay" | "stopAfterLosses";
export interface RuleIdea { kind: RuleKind; value: number | string; rule: WhatIfRules; gain: number; ddChange: number; removed: number; both: boolean }

/**
 * Tries every single what-if rule (skip one weekday / session / symbol, keep one direction, cap trades per day, stop after
 * N losses) and returns those that would have raised net P&L, best first. A rule must remove at least `minRemoved` trades
 * (default 5% of the trades, at least 5) so that one lucky trade does not make a rule. `both` = the rule also raised P&L in
 * each half of the period on its own (first / second half of the trades by close time): less likely to be luck.
 * Hard loss caps are not tried: on past trades a cap always "helps", which says nothing about a habit.
 */
export function findRules(trades: Trade[], o: { minRemoved?: number; top?: number } = {}): RuleIdea[] {
  const l = trades.filter(isClosed).sort(byClose);
  if (l.length < 10) return [];
  const minRemoved = o.minRemoved ?? Math.max(5, Math.round(l.length * 0.05));
  const h1 = l.slice(0, Math.floor(l.length / 2)), h2 = l.slice(Math.floor(l.length / 2));
  const days = new Set<number>(), sess = new Set<string>(), syms = new Set<string>();
  for (const t of l) { const e = new Date(entryMs(t)); days.add((e.getUTCDay() + 6) % 7); sess.add(sessionOf(e.getUTCHours())); syms.add(t.symbol); }
  const cands: { kind: RuleKind; value: number | string; rule: WhatIfRules }[] = [
    ...[...days].sort((a, b) => a - b).map((d) => ({ kind: "weekday" as const, value: d, rule: { weekdays: [d] } })),
    ...["sessTK", "sessLN", "sessNY", "sessSY"].filter((x) => sess.has(x)).map((x) => ({ kind: "session" as const, value: x, rule: { sessions: [x] } })),
    ...(syms.size > 1 ? [...syms].sort().map((x) => ({ kind: "symbol" as const, value: x, rule: { symbols: [x] } })) : []),
    ...(["long", "short"] as const).map((x) => ({ kind: "side" as const, value: x, rule: { side: x } })),
    ...[1, 2, 3].map((k) => ({ kind: "maxPerDay" as const, value: k, rule: { maxPerDay: k } })),
    ...[1, 2, 3].map((k) => ({ kind: "stopAfterLosses" as const, value: k, rule: { stopAfterLosses: k } })),
  ];
  const base = labStats(l), net1 = labStats(h1).net, net2 = labStats(h2).net;
  const out: RuleIdea[] = [];
  for (const c of cands) {
    const s = labStats(applyWhatIf(l, c.rule)), removed = l.length - s.n, gain = s.net - base.net;
    if (removed < minRemoved || !(gain > 0.005)) continue;
    const both = labStats(applyWhatIf(h1, c.rule)).net - net1 > 0.005 && labStats(applyWhatIf(h2, c.rule)).net - net2 > 0.005;
    out.push({ ...c, gain, ddChange: s.maxDD - base.maxDD, removed, both });
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, o.top ?? 5);
}

// ---------- Prop challenge odds ----------

export interface PropOdds { pass: number; fail: number; open: number; medianDays: number | null; days: number; paths: number; horizon: number }
/**
 * Chance that a new challenge with these rules ends passed, failed, or still open after `horizon` trading days, if you trade
 * like in `trades`: each simulated path replays random past trading days (whole days drawn with replacement, so the trades
 * of a day stay together) from the starting balance. Rules as in propCheck, checked after every trade. Needs 10 trading days.
 */
export function propOdds(trades: Trade[], start: number, r: PropRules, o: { paths?: number; horizon?: number; seed?: number } = {}): PropOdds | null {
  if (!(start > 0)) return null;
  const byDay = new Map<string, number[]>();
  for (const t of trades.filter(isClosed).sort(byClose)) { const d = dayOf(ms(t.exitTime)); (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(pnl(t)); }
  const days = [...byDay.values()];
  if (days.length < 10) return null;
  const paths = o.paths ?? 2000, horizon = Math.max(1, o.horizon ?? 250), rand = rng(o.seed ?? 42);
  const limitDD = (start * r.maxDDPct) / 100, limitDaily = (start * r.dailyLossPct) / 100, target = start * (1 + r.targetPct / 100);
  let pass = 0, fail = 0;
  const passDays: number[] = [];
  for (let p = 0; p < paths; p++) {
    let bal = start, peak = start, res = 0;
    for (let d = 1; d <= horizon && !res; d++) {
      let run = 0;
      for (const x of days[Math.floor(rand() * days.length)]) {
        bal += x; run += x; peak = Math.max(peak, bal);
        if ((r.maxDDPct > 0 && bal < (r.trailing ? peak : start) - limitDD - 1e-9) || (r.dailyLossPct > 0 && run < -limitDaily - 1e-9)) { res = -1; break; }
        if (r.targetPct > 0 && bal >= target - 1e-9) { res = 1; passDays.push(d); break; }
      }
    }
    if (res > 0) pass++; else if (res < 0) fail++;
  }
  passDays.sort((a, b) => a - b);
  const pct = (k: number) => (k / paths) * 100;
  return { pass: pct(pass), fail: pct(fail), open: pct(paths - pass - fail), medianDays: passDays.length ? passDays[(passDays.length - 1) >> 1] : null, days: days.length, paths, horizon };
}

// ---------- Position size ----------

/** Mean log growth per trade when risking fraction f of the balance on every trade (R multiples). */
export const logGrowth = (rs: number[], f: number): number => {
  let s = 0;
  for (const r of rs) { const x = 1 + f * r; if (x <= 0) return -Infinity; s += Math.log(x); }
  return rs.length ? s / rs.length : 0;
};
export interface SizeLevel { f: number; growth: number; ddMed: number; dd95: number } // f = fraction risked per trade; % values
export interface Sizing { n: number; kelly: number; capped: boolean; quarter: SizeLevel; half: SizeLevel; full: SizeLevel; current: SizeLevel | null; curve: Pt[]; horizon: number }

/**
 * Position size from R multiples. Kelly = the risk per trade (fraction of the balance) that maximises long-run growth if
 * your results repeat, found numerically on your real R values (searched up to 50%, `capped` when it hits that). For
 * quarter, half and full Kelly (and your current risk when given) a bootstrap of `horizon` trades gives the median growth
 * and the median / 95th-percentile max drawdown, all in %. curve: x = risk % per trade, y = typical growth % over `horizon`
 * trades, exp(horizon x mean log growth) - 1. Needs 20 R values; no edge (mean R <= 0) gives Kelly 0.
 */
export function sizing(rs: number[], o: { horizon?: number; paths?: number; seed?: number; current?: number | null } = {}): Sizing | null {
  const v = rs.filter(Number.isFinite);
  if (v.length < 20) return null;
  const horizon = o.horizon ?? 100, paths = o.paths ?? 1000, minR = Math.min(...v);
  const fMax = Math.min(0.5, minR < 0 ? 0.999 / -minR : 0.5);
  let kelly = 0;
  if (v.reduce((a, b) => a + b, 0) / v.length > 0) { // concave in f: golden-section search
    let a = 0, b = fMax;
    const g = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 200; i++) { const c = b - g * (b - a), d = a + g * (b - a); if (logGrowth(v, c) < logGrowth(v, d)) a = c; else b = d; }
    kelly = (a + b) / 2;
  }
  const typical = (f: number) => (Math.exp(horizon * logGrowth(v, f)) - 1) * 100;
  const level = (f: number, seed: number): SizeLevel => {
    const rand = rng(seed), finals: number[] = [], dds: number[] = [];
    for (let p = 0; p < paths; p++) {
      let eq = 1, peak = 1, dd = 0;
      for (let k = 0; k < horizon; k++) { eq *= Math.max(0, 1 + f * v[Math.floor(rand() * v.length)]); if (eq > peak) peak = eq; else dd = Math.max(dd, 1 - eq / peak); }
      finals.push((eq - 1) * 100); dds.push(dd * 100);
    }
    const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y), k = (s.length - 1) * p, lo = Math.floor(k); return s[lo] + (s[Math.ceil(k)] - s[lo]) * (k - lo); };
    return { f, growth: q(finals, 0.5), ddMed: q(dds, 0.5), dd95: q(dds, 0.95) };
  };
  const seed = o.seed ?? 42, top = Math.min(fMax, Math.max(kelly * 2.2, 0.02, (o.current ?? 0) * 1.3));
  const curve = Array.from({ length: 61 }, (_, i) => { const f = (top * i) / 60; return { t: f * 100, v: typical(f) }; }).filter((p) => Number.isFinite(p.v));
  return {
    n: v.length, kelly, capped: kelly > fMax - 1e-4 && fMax >= 0.5 - 1e-9,
    quarter: level(kelly / 4, seed), half: level(kelly / 2, seed), full: level(kelly, seed),
    current: o.current != null && o.current > 0 ? level(o.current, seed) : null, curve, horizon,
  };
}

/**
 * Typical risk per trade actually taken, as a fraction of the balance: money at risk = P&L / R (trades with a stop and
 * |R| >= 0.2, so near-breakeven results do not blow up the ratio), divided by the balance before the trade (start + P&L so far).
 * Median over those trades; null without enough data or without a starting balance.
 */
export function currentRisk(trades: Trade[], start: number): number | null {
  if (!(start > 0)) return null;
  const l = trades.filter(isClosed).sort(byClose), out: number[] = [];
  let bal = start;
  for (const t of l) {
    const r = rMultiple(t);
    if (r != null && Math.abs(r) >= 0.2 && bal > 0) { const risk = pnl(t) / r; if (risk > 0) out.push(risk / bal); }
    bal += pnl(t);
  }
  if (out.length < 5) return null;
  out.sort((a, b) => a - b);
  return out.length % 2 ? out[out.length >> 1] : (out[out.length / 2 - 1] + out[out.length / 2]) / 2;
}

// ---------- Weekly report ----------

export interface WeekReport {
  week: string; end: number; // Monday (YYYY-MM-DD) and the last minute of that Sunday, wall time read as UTC
  n: number; net: number; winRate: number;
  best: { h: number; net: number } | null; worst: { h: number; net: number } | null; // entry hours that made / lost the most
  habit: { kind: "tilt" | "session" | "symbol"; key: string; net: number; n: number } | null; // what cost the most
  prevNet: number | null; // the week before (null without trades)
}
const mondayOf = (tm: number) => { const d = new Date(tm), day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); return day - ((d.getUTCDay() + 6) % 7) * 86400e3; };

/**
 * Summary of the last complete week (Monday to Sunday, by close time) before `nowWall` (now, as a wall time read as UTC,
 * like the trade times). habit = the costliest of: trades opened soon after a loss (`minutes`), one session, one symbol
 * (at least 2 trades and a negative total). Null when that week has no closed trade.
 */
export function weeklyReport(trades: Trade[], nowWall: number, minutes = 30): WeekReport | null {
  const end = mondayOf(nowWall), start = end - 7 * 86400e3, all = trades.filter(isClosed);
  const inWeek = (t: Trade, a: number, b: number) => { const x = ms(t.exitTime); return x >= a && x < b; };
  const w = all.filter((t) => inWeek(t, start, end));
  if (!w.length) return null;
  const prev = all.filter((t) => inWeek(t, start - 7 * 86400e3, start));
  const s = labStats(w), hours = new Map<number, number>();
  for (const t of w) { const h = new Date(entryMs(t)).getUTCHours(); hours.set(h, (hours.get(h) ?? 0) + pnl(t)); }
  const hs = [...hours].map(([h, net]) => ({ h, net })).sort((a, b) => b.net - a.net || a.h - b.h);
  const groups: NonNullable<WeekReport["habit"]>[] = [];
  const add = (kind: "tilt" | "session" | "symbol", key: string, list: Trade[]) => { if (list.length >= 2) groups.push({ kind, key, net: list.reduce((a, t) => a + pnl(t), 0), n: list.length }); };
  const tilt = tiltSplit(all, minutes), mine = new Set(w);
  add("tilt", "afterLoss", [...tilt.afterLoss, ...tilt.afterLossBigger].filter((t) => mine.has(t)));
  for (const k of ["sessTK", "sessLN", "sessNY", "sessSY"]) add("session", k, w.filter((t) => sessionOf(new Date(entryMs(t)).getUTCHours()) === k));
  for (const k of [...new Set(w.map((t) => t.symbol))].sort()) add("symbol", k, w.filter((t) => t.symbol === k));
  const habit = groups.filter((g) => c2(g.net) < 0).sort((a, b) => a.net - b.net)[0] ?? null;
  return {
    week: new Date(start).toISOString().slice(0, 10), end: end - 60e3, n: s.n, net: s.net, winRate: s.winRate ?? 0,
    best: hs.length && c2(hs[0].net) > 0 ? hs[0] : null, worst: hs.length && c2(hs[hs.length - 1].net) < 0 ? hs[hs.length - 1] : null,
    habit, prevNet: prev.length ? labStats(prev).net : null,
  };
}
