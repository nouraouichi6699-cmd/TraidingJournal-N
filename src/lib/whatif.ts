// "What if": replays the closed trades under other rules.
//  - Exit rules (stop loss / take profit) use each trade's measured price path. They can only close a trade earlier than it
//    was closed: what the price did after the real exit is not known. When both levels were reached, the running records
//    of the path tell which came first; the same bar, or a path without records, counts as stopped out (the cautious side).
//  - Filters drop trades by weekday, entry hour, symbol or direction.
//  - Daily rules are causal: at each entry they only see the trades of that day already closed (with their what-if result
//    and close time). A trade that is skipped never happened, so it does not count for the trades after it.
import type { Trade } from "../types";
import { metrics, type Metrics } from "./dashStats";
import type { Path } from "./path";
import { tradeOutcome } from "./outcome";

export type Unit = "money" | "R";
export interface Level { v: number; unit: Unit }
export interface Rules {
  streak: number | null; // stop for the day after this many losing trades in a row
  dayLoss: number | null; // stop for the day once the day's closed result is at or below -dayLoss
  dayGain: number | null; // stop for the day once the day's closed result is at or above +dayGain
  maxDay: number | null; // at most this many trades opened per day
  skipDays: number[]; // weekdays not traded, 0 = Monday ... 6 = Sunday
  hours: [number, number] | null; // entry hour in [from, to); from > to runs past midnight
  skipSymbols: string[];
  side: "both" | "long" | "short";
  sl: Level | null; // stop loss: distance from the entry, in money of the position or in R (the trade's own stop distance)
  tp: Level | null; // take profit, same units
}
export const NO_RULES: Rules = { streak: null, dayLoss: null, dayGain: null, maxDay: null, skipDays: [], hours: null, skipSymbols: [], side: "both", sl: null, tp: null };
export type RuleKey = "streak" | "dayLoss" | "dayGain" | "maxDay" | "days" | "hours" | "symbols" | "side" | "sl" | "tp";

export interface SimInput { trade: Trade; path: Path | null; k: number | null } // k: money per 1.0 price move of the position
export type Skip = "streak" | "dayLoss" | "dayGain" | "maxDay" | "days" | "hours" | "symbols" | "side";
export interface SimRow { trade: Trade; skip: Skip | null; exit: "sl" | "tp" | null; pnl: number; exitTime: string | null }
export interface ExitInfo { applied: number; changed: number; noPath: number; noMoney: number; noStop: number; ties: number; unordered: number }
export interface Sim { rows: SimRow[]; actual: Metrics; sim: Metrics; taken: Trade[]; exits: ExitInfo }

const MIN = 6e4;
const ms = (w: string | null) => (w ? Date.parse(`${w.slice(0, 16)}Z`) : NaN); // wall times, read as UTC everywhere in the journal
const wall = (t: number) => new Date(t).toISOString().slice(0, 16);
const isClosed = (t: Trade) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl);
const reached = (x: number, level: number) => x >= level - 1e-9 * Math.max(1, Math.abs(level));
/** Minute at which a running-record list first reaches `level`, or null. */
const firstAt = (rec: number[], level: number) => { for (let i = 0; i + 1 < rec.length; i += 2) if (reached(rec[i + 1], level)) return rec[i]; return null; };

export const activeRules = (r: Rules): RuleKey[] => [
  ...(r.streak != null ? ["streak" as const] : []), ...(r.dayLoss != null ? ["dayLoss" as const] : []), ...(r.dayGain != null ? ["dayGain" as const] : []),
  ...(r.maxDay != null ? ["maxDay" as const] : []), ...(r.skipDays.length ? ["days" as const] : []), ...(r.hours ? ["hours" as const] : []),
  ...(r.skipSymbols.length ? ["symbols" as const] : []), ...(r.side !== "both" ? ["side" as const] : []), ...(r.sl ? ["sl" as const] : []), ...(r.tp ? ["tp" as const] : []),
];
/** The given rules with only `key` kept. */
export const only = (r: Rules, key: RuleKey): Rules => ({
  ...NO_RULES,
  ...(key === "streak" ? { streak: r.streak } : key === "dayLoss" ? { dayLoss: r.dayLoss } : key === "dayGain" ? { dayGain: r.dayGain } : key === "maxDay" ? { maxDay: r.maxDay }
    : key === "days" ? { skipDays: r.skipDays } : key === "hours" ? { hours: r.hours } : key === "symbols" ? { skipSymbols: r.skipSymbols } : key === "side" ? { side: r.side } : key === "sl" ? { sl: r.sl } : { tp: r.tp }),
});

type Exit = { pnl: number; exit: "sl" | "tp" | null; exitTime: string | null; note: keyof ExitInfo | null; tie?: boolean; unordered?: boolean };
function exitOf(x: SimInput, r: Rules): Exit {
  const t = x.trade, same: Exit = { pnl: t.pnl as number, exit: null, exitTime: t.exitTime, note: null };
  if (!r.sl && !r.tp) return same;
  const p = x.path;
  if (!p) return { ...same, note: "noPath" };
  if (!(x.k != null && x.k > 0)) return { ...same, note: "noMoney" };
  const stop = t.sl != null && t.sl > 0 ? Math.abs(t.entryPrice - t.sl) : 0;
  const dist = (l: Level | null) => (!l ? null : l.unit === "R" ? (stop > 0 ? l.v * stop : NaN) : l.v / (x.k as number));
  const S = dist(r.sl), T = dist(r.tp);
  if (Number.isNaN(S) || Number.isNaN(T)) return { ...same, note: "noStop" };
  const hitS = S != null && S > 0 && reached(p.mae, S), hitT = T != null && T > 0 && reached(p.mfe, T);
  if (!hitS && !hitT) return { ...same, note: "applied" };
  let which: "sl" | "tp" = hitS ? "sl" : "tp", tie = false, unordered = false;
  if (hitS && hitT) {
    if (p.fx && p.ax) { const a = firstAt(p.ax, S as number), b = firstAt(p.fx, T as number); tie = a != null && a === b; which = a != null && b != null && b < a ? "tp" : "sl"; }
    else unordered = true; // stopped out: the cautious reading
  }
  const move = which === "sl" ? -(S as number) : (T as number), rec = which === "sl" ? p.ax : p.fx, at = rec ? firstAt(rec, which === "sl" ? (S as number) : (T as number)) : null;
  const end = ms(t.exitTime), start = ms(t.entryTime);
  const exitTime = at != null && Number.isFinite(start) ? wall(Math.min(start + Math.round(at * MIN), Number.isFinite(end) ? end : Infinity)) : t.exitTime;
  return { pnl: move * (x.k as number) - (t.commission || 0), exit: which, exitTime, note: "changed", tie, unordered };
}

const weekday = (w: string) => (new Date(`${w.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
function filtered(t: Trade, r: Rules): Skip | null {
  const w = t.entryTime ?? t.exitTime ?? "";
  if (r.side !== "both" && t.side !== r.side) return "side";
  if (r.skipSymbols.includes(t.symbol)) return "symbols";
  if (r.skipDays.length && w && r.skipDays.includes(weekday(w))) return "days";
  if (r.hours && w) {
    const h = Number(w.slice(11, 13)), [a, b] = r.hours;
    if (a !== b && !(a < b ? h >= a && h < b : h >= a || h < b)) return "hours";
  }
  return null;
}

/** Replays `inputs` (closed trades with their paths) under `r`. */
export function simulate(inputs: SimInput[], r: Rules): Sim {
  const list = inputs.filter((x) => isClosed(x.trade)).sort((a, b) => (a.trade.entryTime ?? a.trade.exitTime ?? "").localeCompare(b.trade.entryTime ?? b.trade.exitTime ?? "") || a.trade.no - b.trade.no);
  const exits: ExitInfo = { applied: 0, changed: 0, noPath: 0, noMoney: 0, noStop: 0, ties: 0, unordered: 0 };
  const days = new Map<string, { n: number; done: { at: number; pnl: number }[] }>();
  const rows: SimRow[] = [];
  for (const x of list) {
    const t = x.trade;
    let skip = filtered(t, r);
    const ex = exitOf(x, r);
    if (!skip && (r.streak != null || r.dayLoss != null || r.dayGain != null || r.maxDay != null)) {
      const day = (t.entryTime ?? t.exitTime ?? "").slice(0, 10), at = ms(t.entryTime ?? t.exitTime);
      const d = days.get(day) ?? { n: 0, done: [] };
      const known = d.done.filter((c) => c.at <= at).sort((a, b) => a.at - b.at);
      const net = known.reduce((s, c) => s + c.pnl, 0);
      let run = 0;
      // A simulated exit, not a stored trade: its P&L is recomputed here from prices, so there is no
      // own-currency counterpart to read and the plain classifier is the right one.
      for (let i = known.length - 1; i >= 0 && tradeOutcome(known[i].pnl) === "loss"; i--) run++;
      skip = r.maxDay != null && d.n >= r.maxDay ? "maxDay" : r.streak != null && run >= r.streak ? "streak" : r.dayLoss != null && net <= -r.dayLoss + 1e-9 ? "dayLoss" : r.dayGain != null && net >= r.dayGain - 1e-9 ? "dayGain" : null;
      if (!skip) { d.n++; d.done.push({ at: ms(ex.exitTime), pnl: ex.pnl }); days.set(day, d); }
    }
    if (!skip && ex.note) { exits[ex.note]++; if (ex.note === "changed") exits.applied++; if (ex.tie) exits.ties++; if (ex.unordered) exits.unordered++; }
    rows.push({ trade: t, skip, exit: skip ? null : ex.exit, pnl: skip ? 0 : ex.pnl, exitTime: skip ? null : ex.exitTime });
  }
  const taken = rows.filter((x) => !x.skip).map((x) => ({ ...x.trade, pnl: x.pnl, exitTime: x.exitTime }));
  return { rows, actual: metrics(list.map((x) => x.trade)), sim: metrics(taken), taken, exits };
}

/** Both running totals over the real trade sequence (by close time), from 0: the what-if total stays flat where a trade is skipped. */
export function curves(s: Sim): { a: number[]; b: number[]; at: string[] } {
  const order = [...s.rows].sort((x, y) => (x.trade.exitTime ?? "").localeCompare(y.trade.exitTime ?? "") || x.trade.no - y.trade.no);
  const a = [0], b = [0], at = [""];
  for (const r of order) { a.push(a[a.length - 1] + (r.trade.pnl as number)); b.push(b[b.length - 1] + (r.skip ? 0 : r.pnl)); at.push(r.trade.exitTime ?? ""); }
  return { a, b, at };
}

/** Effect of each active rule on its own: change in net result, trades skipped, trades whose exit changed. */
export function impact(inputs: SimInput[], r: Rules): { key: RuleKey; net: number; skipped: number; changed: number }[] {
  return activeRules(r).map((key) => {
    const s = simulate(inputs, only(r, key));
    return { key, net: s.sim.net - s.actual.net, skipped: s.rows.filter((x) => x.skip).length, changed: s.exits.changed };
  });
}
