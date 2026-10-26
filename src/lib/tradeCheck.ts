// "Should I take this trade?": a trade the trader is about to open (market, side, hour and day on the broker's clock),
// checked against the rules they adopted (breaking one says stop), the plan's other rules and their own history for
// the same market, side, hour and weekday (warnings, or good signs), and how today went so far.
import type { Trade } from "../types";
import type { Rules } from "./whatif";

export interface Planned { day: string; hour: number; weekday: number; symbol: string; side: "long" | "short" } // weekday 0 = Monday
export interface RuleRef { id: string; rules: Partial<Rules> }
export interface Stat { n: number; net: number; wr: number }
export type Sign = Stat & { kind: "symbol" | "side" | "hour" | "day"; good: boolean };
export interface Today { n: number; closed: number; net: number; run: number } // opened today, closed today, their result, losses in a row
export interface Check<R extends RuleRef = RuleRef> {
  verdict: "go" | "careful" | "stop";
  broken: R[]; // adopted rules this trade breaks
  plan: R[]; // the plan's rules it breaks (those not adopted)
  signs: Sign[]; // the history of the same market, side, hour, weekday (5 trades at least)
  today: Today;
  noStop: number; // share of closed trades without a stop loss, 0..1
}

export const MIN_SIGN = 5;
const isClosed = (t: Trade) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl);
const at = (t: Trade) => t.entryTime ?? t.exitTime ?? "";
export const weekdayOf = (d: string) => (new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7;
const stat = (ts: Trade[]): Stat => {
  const p = ts.map((t) => t.pnl as number);
  return { n: ts.length, net: p.reduce((s, x) => s + x, 0), wr: ts.length ? (p.filter((x) => x > 0).length / ts.length) * 100 : 0 };
};
const keyOf = (r: RuleRef) => `${r.id}|${JSON.stringify(r.rules)}`;

/** Whether a trade planned at `x`, after today's trades so far, breaks `r` (the What-if filters and daily rules; exit
 *  rules, a stop or a target, are about how a trade ends, not whether to take it). */
export function breaks(r: Partial<Rules>, x: Planned, today: Today): boolean {
  if (r.skipSymbols?.includes(x.symbol)) return true;
  if (r.side && r.side !== "both" && r.side !== x.side) return true;
  if (r.skipDays?.includes(x.weekday)) return true;
  if (r.hours) {
    const [a, b] = r.hours;
    if (a !== b && !(a < b ? x.hour >= a && x.hour < b : x.hour >= a || x.hour < b)) return true;
  }
  if (r.maxDay != null && today.n >= r.maxDay) return true;
  if (r.streak != null && today.run >= r.streak) return true;
  if (r.dayLoss != null && today.net <= -r.dayLoss + 1e-9) return true;
  if (r.dayGain != null && today.net >= r.dayGain - 1e-9) return true;
  return false;
}

/** Today so far, from the trades on the planned day: trades opened, closed, their result, losses in a row at the end. */
export function todayOf(trades: Trade[], day: string): Today {
  const done = trades.filter((t) => isClosed(t) && (t.exitTime ?? "").slice(0, 10) === day).sort((a, b) => (a.exitTime ?? "").localeCompare(b.exitTime ?? "") || a.no - b.no);
  let run = 0;
  for (let i = done.length - 1; i >= 0 && (done[i].pnl as number) < 0; i--) run++;
  return { n: trades.filter((t) => (t.entryTime ?? "").slice(0, 10) === day).length, closed: done.length, net: done.reduce((s, t) => s + (t.pnl as number), 0), run };
}

export function checkTrade<R extends RuleRef>(x: Planned, trades: Trade[], adopted: R[], plan: R[]): Check<R> {
  const done = trades.filter(isClosed);
  const today = todayOf(trades, x.day);
  const broken = adopted.filter((r) => breaks(r.rules, x, today));
  const mine = new Set(adopted.map(keyOf));
  const planHit = plan.filter((r) => !mine.has(keyOf(r)) && breaks(r.rules, x, today));
  const sym = done.filter((t) => t.symbol === x.symbol), side = sym.filter((t) => t.side === x.side);
  const groups: [Sign["kind"], Trade[]][] = [
    ["symbol", sym],
    ...(side.length < sym.length ? [["side", side] as [Sign["kind"], Trade[]]] : []), // the side only when it differs from the market as a whole
    ["hour", done.filter((t) => Number(at(t).slice(11, 13)) === x.hour)],
    ["day", done.filter((t) => at(t) && weekdayOf(at(t)) === x.weekday)],
  ];
  const signs = groups.map(([kind, ts]) => ({ kind, ...stat(ts) }))
    .filter((s) => s.n >= MIN_SIGN && (s.net < 0 || s.wr >= 50))
    .map((s) => ({ ...s, good: s.net > 0 && s.wr >= 50 }))
    .filter((s) => s.good || s.net < 0);
  const noStop = done.length ? done.filter((t) => !(t.sl != null && t.sl > 0)).length / done.length : 0;
  const warn = planHit.length > 0 || today.run >= 2 || signs.some((s) => !s.good);
  return { verdict: broken.length ? "stop" : warn ? "careful" : "go", broken, plan: planHit, signs, today, noStop };
}
