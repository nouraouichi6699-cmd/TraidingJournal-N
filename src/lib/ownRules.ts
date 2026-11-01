// "My own rules": a challenge whose every rule the trader sets — the most they may lose in a day, a week, a month and
// overall, the risk of one trade, discipline (trades a day, losses in a row, a profit lock, a pause after a loss), hours,
// days and markets — and what a broken rule means: a warning, the rest of the day off, or the end of the challenge.
// Trade times are the broker's ("YYYY-MM-DDTHH:MM"), and so are the times a rule set changed: each trade is judged by
// the rules in force when it happened. Pure functions, covered by ownRules.test.ts.
import type { Trade } from "../types";
import type { Rules } from "./whatif";
import { tradeOutcomeOf } from "./outcome";

export interface Limit { v: number; unit: "money" | "pct" } // pct: of the starting balance
export interface OwnRules {
  daily?: Limit; weekly?: Limit; monthly?: Limit; overall?: Limit; // the most you may lose
  perTrade?: Limit; // the most one trade may lose
  lots?: number; // the largest volume of one trade
  sl?: boolean; // every trade has a stop loss
  maxTrades?: number; // trades opened a day
  streak?: number; // stop for the day after this many losses in a row
  lock?: Limit; // stop for the day once up this much
  cool?: number; // minutes to wait after a losing trade
  hours?: [number, number]; // trade only from a to b (a > b runs past midnight)
  daysOff?: number[]; // 0 = Monday
  only?: string[]; // trade only these markets
  avoid?: string[]; // never these
  side?: "long" | "short";
  goal?: Limit; // a profit target (not a rule)
  onBreak: "warn" | "day" | "end";
}
export type OwnKey = "daily" | "weekly" | "monthly" | "overall" | "perTrade" | "lots" | "sl" | "maxTrades" | "streak" | "lock" | "cool" | "hours" | "daysOff" | "only" | "avoid" | "side";
export const OWN_KEYS: OwnKey[] = ["daily", "weekly", "monthly", "overall", "perTrade", "lots", "sl", "maxTrades", "streak", "lock", "cool", "hours", "daysOff", "only", "avoid", "side"];
export const NO_OWN: OwnRules = { onBreak: "warn" };

/** Trades opened today before this one, losses in a row today, the closed result today, this week (from Monday), this
 *  month and since the start, and the exit of the last losing trade. */
export interface Ctx { n: number; run: number; day: number; week: number; month: number; total: number; lastLoss: string | null }
export interface Entry { at: string; symbol: string; side: "long" | "short"; qty?: number | null }
export interface Violation { key: OwnKey | "afterStop"; day: string; at: string; trade: string | null; symbol: string | null; value: number | null; limit: number | null }

const EPS = 1e-9;
const r2 = (x: number) => Math.round(x * 100) / 100;
const norm = (s: string | null | undefined) => (s ? s.trim().replace(" ", "T").slice(0, 16) : "");
export const weekdayOf = (d: string) => (new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const weekOf = (d: string) => addDays(d.slice(0, 10), -weekdayOf(d)); // its Monday
const minutes = (a: string, b: string) => (Date.parse(`${b}Z`) - Date.parse(`${a}Z`)) / 6e4;
/** A limit in money, at a starting balance of `size`. */
export const amount = (l: Limit | undefined, size: number) => (l && Number.isFinite(l.v) && l.v > 0 ? (l.unit === "pct" ? (size * l.v) / 100 : l.v) : null);
const inHours = (h: number, [a, b]: [number, number]) => a === b || (a < b ? h >= a && h < b : h >= a || h < b);

/** The rules a trade breaks as it opens, after the day so far (`c`): its market, side, volume, day and hour, and the
 *  limits already reached (a loss limit, the trades of the day, losses in a row, the profit lock, the pause after a loss). */
export function entryBreaks(r: OwnRules, x: Entry, c: Ctx, size: number): OwnKey[] {
  const out: OwnKey[] = [];
  const hit = (l: Limit | undefined, v: number) => { const m = amount(l, size); return m != null && v <= -m + EPS; };
  if (r.only?.length && !r.only.includes(x.symbol)) out.push("only");
  if (r.avoid?.includes(x.symbol)) out.push("avoid");
  if (r.side && r.side !== x.side) out.push("side");
  if (r.lots != null && x.qty != null && x.qty > r.lots + EPS) out.push("lots");
  if (r.daysOff?.includes(weekdayOf(x.at))) out.push("daysOff");
  if (r.hours && !inHours(Number(x.at.slice(11, 13)), r.hours)) out.push("hours");
  if (r.maxTrades != null && c.n >= r.maxTrades) out.push("maxTrades");
  if (r.streak != null && r.streak > 0 && c.run >= r.streak) out.push("streak");
  if (hit(r.daily, c.day)) out.push("daily");
  if (hit(r.weekly, c.week)) out.push("weekly");
  if (hit(r.monthly, c.month)) out.push("monthly");
  if (hit(r.overall, c.total)) out.push("overall");
  const lk = amount(r.lock, size);
  if (lk != null && c.day >= lk - EPS) out.push("lock");
  if (r.cool && c.lastLoss && minutes(c.lastLoss, x.at) < r.cool) out.push("cool");
  return out;
}

export interface Room { key: "daily" | "weekly" | "monthly" | "overall"; net: number; limit: number; used: number; room: number } // net: the period's result; used: 0..1
export interface OwnState {
  status: "active" | "failed"; endedOn: string | null;
  balance: number; pnl: number;
  violations: Violation[]; // in time order
  activeDays: number; cleanDays: number; score: number | null; streak: number; best: number; // days without a broken rule: share (0..100), in a row now, best run
  cost: { broke: { n: number; net: number }; kept: { n: number; net: number } }; // closed trades that broke a rule, and the others
  today: { n: number; run: number; net: number; stopped: boolean; nextAt: string | null; lock: number | null }; // stopped: the rest of the day is off; nextAt: the end of the pause after a loss
  rooms: Room[];
  goal: { amount: number; left: number; progress: number; reached: boolean } | null;
  days: { day: string; pnl: number; end: number; bad: boolean }[];
}

/** The rules in force at `at` (broker clock): an earlier set until it was changed, then the current one, and a loosened
 *  set from its time on. */
export interface OwnSet { own?: OwnRules; ownNext?: { rules: OwnRules; from: string }; ownPast?: { until: string; rules: OwnRules }[] }
export function rulesAt(c: OwnSet, at: string): OwnRules {
  for (const p of c.ownPast ?? []) if (at < p.until) return p.rules;
  return (c.ownNext && c.ownNext.from <= at ? c.ownNext.rules : c.own) ?? NO_OWN;
}

/** The challenge replayed on the account's trades from `start` to `today` (the broker's day), each event under the rules
 *  in force then; today's rooms under those in force `now` (broker clock, default the end of today). */
export function ownState(set: OwnSet, o: { accountId: string; start: string; size: number }, trades: Trade[], today: string, now = `${today}T23:59`): OwnState {
  const size = o.size, r = rulesAt(set, now);
  const mine = trades.filter((t) => t.accountId === o.accountId && norm(t.entryTime).slice(0, 10) >= o.start && norm(t.entryTime).slice(0, 10) <= today);
  type Ev = { at: string; open: boolean; t: Trade };
  const evs: Ev[] = [];
  for (const t of mine) {
    evs.push({ at: norm(t.entryTime), open: true, t });
    if (t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && t.exitTime && norm(t.exitTime).slice(0, 10) <= today) evs.push({ at: norm(t.exitTime), open: false, t });
  }
  evs.sort((a, b) => a.at.localeCompare(b.at) || Number(b.open) - Number(a.open) || a.t.no - b.t.no);

  let bal = size, lastLoss: string | null = null, ended: string | null = null, endAt = ""; // the day and time of the breach that ended it
  const dayNet = new Map<string, number>(), weekNet = new Map<string, number>(), monthNet = new Map<string, number>();
  const opened = new Map<string, number>(), run = new Map<string, number>(), stopped = new Set<string>(), flagged = new Set<string>();
  const broke = new Set<string>(), violations: Violation[] = [], active: string[] = [], bad = new Set<string>(), ends = new Map<string, number>(), pnls = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  let er: OwnRules = r; // the rules in force at the event
  const record = (v: Violation) => {
    if (ended && v.at > endAt) return; // nothing counts after the end (all the rules one trade broke do)
    violations.push(v); bad.add(v.day);
    if (v.trade) broke.add(v.trade);
    if (er.onBreak !== "warn") stopped.add(v.day);
    if (er.onBreak === "end" && !ended) { ended = v.day; endAt = v.at; }
  };
  for (const e of evs) {
    const d = e.at.slice(0, 10), wk = weekOf(d), mo = d.slice(0, 7), t = e.t, r = (er = rulesAt(set, e.at));
    if (active[active.length - 1] !== d) active.push(d);
    if (e.open) {
      const c: Ctx = { n: opened.get(d) ?? 0, run: run.get(d) ?? 0, day: dayNet.get(d) ?? 0, week: weekNet.get(wk) ?? 0, month: monthNet.get(mo) ?? 0, total: bal - size, lastLoss };
      const keys: (OwnKey | "afterStop")[] = entryBreaks(r, { at: e.at, symbol: t.symbol, side: t.side, qty: t.qty }, c, size);
      if (r.onBreak === "day" && stopped.has(d)) keys.push("afterStop");
      const val: Partial<Record<OwnKey, [number | null, number | null]>> = {
        maxTrades: [c.n + 1, r.maxTrades ?? null], streak: [c.run, r.streak ?? null], lots: [t.qty, r.lots ?? null],
        daily: [r2(-c.day), amount(r.daily, size)], weekly: [r2(-c.week), amount(r.weekly, size)], monthly: [r2(-c.month), amount(r.monthly, size)], overall: [r2(-c.total), amount(r.overall, size)],
        lock: [r2(c.day), amount(r.lock, size)], cool: [c.lastLoss ? Math.floor(minutes(c.lastLoss, e.at)) : null, r.cool ?? null],
      };
      for (const k of keys) { const [value, limit] = (k !== "afterStop" && val[k]) || [null, null]; record({ key: k, day: d, at: e.at, trade: t.key, symbol: t.symbol, value, limit }); }
      add(opened, d, 1);
    } else {
      const p = t.pnl as number;
      bal += p; add(dayNet, d, p); add(weekNet, wk, p); add(monthNet, mo, p); add(pnls, d, p);
      if (p < 0) { run.set(d, (run.get(d) ?? 0) + 1); lastLoss = e.at; } else run.set(d, 0);
      const pt = amount(r.perTrade, size);
      if (pt != null && p < -pt - EPS) record({ key: "perTrade", day: d, at: e.at, trade: t.key, symbol: t.symbol, value: r2(-p), limit: pt });
      if (r.sl && !(t.sl != null && t.sl > 0)) record({ key: "sl", day: d, at: e.at, trade: t.key, symbol: t.symbol, value: null, limit: null });
      for (const [k, l, v, id] of [["daily", r.daily, dayNet.get(d) ?? 0, d], ["weekly", r.weekly, weekNet.get(wk) ?? 0, wk], ["monthly", r.monthly, monthNet.get(mo) ?? 0, mo], ["overall", r.overall, bal - size, "all"]] as [OwnKey, Limit | undefined, number, string][]) {
        const m = amount(l, size);
        if (m != null && v < -m - EPS && !flagged.has(`${k}:${id}`)) { flagged.add(`${k}:${id}`); record({ key: k, day: d, at: e.at, trade: t.key, symbol: t.symbol, value: r2(-v), limit: m }); }
      }
    }
    ends.set(d, bal);
  }

  const closed = mine.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && t.exitTime && norm(t.exitTime).slice(0, 10) <= today);
  const group = (ts: Trade[]) => ({ n: ts.length, net: r2(ts.reduce((s, t) => s + (t.pnl as number), 0)) });
  let streak = 0, best = 0;
  for (const d of active) { streak = bad.has(d) ? 0 : streak + 1; best = Math.max(best, streak); }
  const clean = active.filter((d) => !bad.has(d)).length;
  const tNet = dayNet.get(today) ?? 0, wNet = weekNet.get(weekOf(today)) ?? 0, mNet = monthNet.get(today.slice(0, 7)) ?? 0;
  const rooms: Room[] = ([["daily", r.daily, tNet], ["weekly", r.weekly, wNet], ["monthly", r.monthly, mNet], ["overall", r.overall, bal - size]] as [Room["key"], Limit | undefined, number][])
    .flatMap(([key, l, v]) => { const m = amount(l, size); return m == null ? [] : [{ key, net: r2(v), limit: r2(m), used: Math.max(0, Math.min(1, -v / m)), room: r2(Math.max(0, m + v)) }]; });
  const g = amount(r.goal, size), total = bal - size;
  const lastLossToday = lastLoss && (lastLoss as string).slice(0, 10) === today ? (lastLoss as string) : null;
  const next = r.cool && lastLossToday ? new Date(Date.parse(`${lastLossToday}Z`) + r.cool * 6e4).toISOString().slice(0, 16) : null;
  return {
    status: ended ? "failed" : "active", endedOn: ended,
    balance: r2(bal), pnl: r2(total), violations,
    activeDays: active.length, cleanDays: clean, score: active.length ? Math.round((clean / active.length) * 100) : null, streak, best,
    cost: { broke: group(closed.filter((t) => broke.has(t.key))), kept: group(closed.filter((t) => !broke.has(t.key))) },
    today: { n: opened.get(today) ?? 0, run: run.get(today) ?? 0, net: r2(tNet), stopped: stopped.has(today), nextAt: next, lock: amount(r.lock, size) },
    rooms,
    goal: g != null ? { amount: r2(g), left: r2(Math.max(0, g - total)), progress: Math.max(0, Math.min(1, total / g)), reached: total >= g - EPS } : null,
    days: active.map((d) => ({ day: d, pnl: r2(pnls.get(d) ?? 0), end: r2(ends.get(d) ?? bal), bad: bad.has(d) })),
  };
}

/** The day so far before a trade at `at` (what entryBreaks needs), from the account's trades since `start`. */
export function ctxAt(trades: Trade[], o: { accountId: string; start: string }, at: string): Ctx {
  const d = at.slice(0, 10), wk = weekOf(d), mo = d.slice(0, 7);
  const mine = trades.filter((t) => t.accountId === o.accountId && norm(t.entryTime).slice(0, 10) >= o.start);
  const shut = mine.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && t.exitTime && norm(t.exitTime) <= at)
    .sort((a, b) => norm(a.exitTime).localeCompare(norm(b.exitTime)) || a.no - b.no);
  const sum = (f: (day: string) => boolean) => r2(shut.filter((t) => f(norm(t.exitTime).slice(0, 10))).reduce((s, t) => s + (t.pnl as number), 0));
  const todays = shut.filter((t) => norm(t.exitTime).slice(0, 10) === d);
  let run = 0;
  for (let i = todays.length - 1; i >= 0 && tradeOutcomeOf(todays[i]) === "loss"; i--) run++;
  const loss = [...shut].reverse().find((t) => tradeOutcomeOf(t) === "loss");
  return {
    n: mine.filter((t) => norm(t.entryTime).slice(0, 10) === d && norm(t.entryTime) < at).length, run,
    day: sum((x) => x === d), week: sum((x) => x >= wk && x <= d), month: sum((x) => x.slice(0, 7) === mo), total: sum(() => true), lastLoss: loss ? norm(loss.exitTime) : null,
  };
}

// ---------- the rule lock: tightening now, loosening after a day ----------
const sorted = (a?: string[] | number[]) => (a && a.length ? [...a].sort() : undefined);
/** The rules in a fixed shape (no empty parts), to compare two sets. */
export function tidy(r: OwnRules): OwnRules {
  const out: Record<string, unknown> = {};
  for (const k of OWN_KEYS) {
    const v = (r as unknown as Record<string, unknown>)[k];
    if (v == null || v === false) continue;
    if (Array.isArray(v)) { if (k === "hours") out[k] = v; else if (v.length) out[k] = sorted(v as string[]); continue; }
    if (typeof v === "object" && !((v as Limit).v > 0)) continue;
    out[k] = v;
  }
  if (r.goal && r.goal.v > 0) out.goal = r.goal;
  out.onBreak = r.onBreak;
  return out as unknown as OwnRules;
}
const STRICT = { warn: 0, day: 1, end: 2 } as const;
/** Rule by rule, the stricter of `a` (in force) and `b` (asked for): the lower limit, the longer pause, both sets of days
 *  off and avoided markets; for hours, markets and side a change that is not a narrowing keeps `a`. Limits compare in
 *  money at `size`. The goal is not a rule: `b`'s. */
export function stricter(a: OwnRules, b: OwnRules, size: number): OwnRules {
  const lim = (x?: Limit, y?: Limit) => { const mx = amount(x, size), my = amount(y, size); return mx == null ? (my == null ? undefined : y) : my == null ? x : my < mx - EPS ? y : x; };
  const low = (x?: number, y?: number) => (x == null ? y : y == null ? x : Math.min(x, y));
  const subset = <T,>(x: T[], y: T[]) => x.every((v) => y.includes(v));
  const hrs = (w: [number, number]) => Array.from({ length: 24 }, (_, h) => h).filter((h) => inHours(h, w));
  const out: OwnRules = {
    daily: lim(a.daily, b.daily), weekly: lim(a.weekly, b.weekly), monthly: lim(a.monthly, b.monthly), overall: lim(a.overall, b.overall),
    perTrade: lim(a.perTrade, b.perTrade), lock: lim(a.lock, b.lock),
    lots: low(a.lots, b.lots), maxTrades: low(a.maxTrades, b.maxTrades), streak: low(a.streak, b.streak),
    cool: a.cool == null ? b.cool : b.cool == null ? a.cool : Math.max(a.cool, b.cool),
    sl: a.sl || b.sl || undefined,
    hours: !a.hours ? b.hours : !b.hours ? a.hours : subset(hrs(b.hours), hrs(a.hours)) ? b.hours : a.hours,
    daysOff: [...new Set([...(a.daysOff ?? []), ...(b.daysOff ?? [])])],
    only: !a.only?.length ? b.only : !b.only?.length ? a.only : subset(b.only, a.only) ? b.only : a.only,
    avoid: [...new Set([...(a.avoid ?? []), ...(b.avoid ?? [])])],
    side: !a.side ? b.side : !b.side ? a.side : a.side,
    goal: b.goal,
    onBreak: STRICT[b.onBreak] >= STRICT[a.onBreak] ? b.onBreak : a.onBreak,
  };
  return tidy(out);
}
/** Whether `b` loosens any rule in force (`a`): then it waits a day, and the stricter of both holds meanwhile. */
export const loosens = (a: OwnRules, b: OwnRules, size: number) => JSON.stringify(stricter(a, b, size)) !== JSON.stringify(tidy(b));

/** Rules adopted in the Advisor (What-if filters) added to `r`: both hold, so the stricter of each. */
export function fromAdvisor(list: { rules: Partial<Rules> }[], r: OwnRules, size: number): OwnRules {
  let out = r;
  for (const { rules: w } of list) {
    const x: OwnRules = { onBreak: r.onBreak };
    if (w.streak) x.streak = w.streak;
    if (w.dayLoss) x.daily = { v: w.dayLoss, unit: "money" };
    if (w.dayGain) x.lock = { v: w.dayGain, unit: "money" };
    if (w.maxDay) x.maxTrades = w.maxDay;
    if (w.skipDays?.length) x.daysOff = w.skipDays;
    if (w.hours) x.hours = w.hours;
    if (w.skipSymbols?.length) x.avoid = w.skipSymbols;
    if (w.side && w.side !== "both") x.side = w.side;
    if (w.sl && w.sl.unit === "money") x.perTrade = { v: w.sl.v, unit: "money" };
    out = stricter(out, x, size);
  }
  return out;
}
