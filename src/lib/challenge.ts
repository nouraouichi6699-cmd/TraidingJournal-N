// Prop-firm challenge: the rules of a funded-account evaluation, checked on the account's trades as they happened, in the
// broker's day (trade times as written). Pure functions, covered by challenge.test.ts.
// Only closed results are known here: firms also count floating losses, so the real room can be smaller.
// A limit is broken when the loss goes past it (as in Charts › Prop rules): ending a day exactly at the limit is allowed.
import type { Trade } from "../types";

export interface Challenge {
  id: string;
  accountId: string;
  name: string; // "Phase 1"
  start: string; // YYYY-MM-DD (broker day): trades opened from this day count
  size: number; // account size (starting balance)
  target: number | null; // profit target, % of the size
  daily: number | null; // max daily loss, %
  dailyBase: "size" | "dayStart"; // the daily % is of the size, or of the balance at the start of the day
  max: number | null; // max overall loss, % of the size
  trailing: boolean; // the max-loss floor rises with the highest closed balance
  trailLock: boolean; // ... and stops rising once it reaches the size
  minDays: number; // trading days needed (days with a trade opened)
  limitDays: number | null; // calendar days allowed (null: no limit)
  consistency: number | null; // the best day may bring at most this % of the total profit
  kind?: "self"; // a personal account run on prop-firm rules (absent: a prop-firm evaluation)
  sizeAuto?: boolean; // personal: the size follows the balance at the start of the start day
  attempt?: number; // personal: the attempt number (absent: the first)
}

export type Rule = "daily" | "max" | "time";
/** daily: the day's loss and the allowed loss; max: the balance and the floor; time: the days used and allowed. */
export interface Breach { rule: Rule; day: string; value: number; limit: number }
export interface DayRow { day: string; pnl: number; low: number; end: number; floor: number | null; limit: number | null; breach: Rule[] } // low: the day's lowest running result
export interface ChallengeState {
  balance: number; pnl: number; peak: number;
  target: { amount: number; left: number; progress: number } | null; // progress 0..1 of the profit target
  today: { pnl: number; limit: number; room: number; used: number } | null; // daily rule today: result, allowed loss, room left, share used (0..1)
  maxLoss: { floor: number; room: number; used: number } | null; // overall rule: lowest allowed balance, room left, share used
  risk: { amount: number; rule: "daily" | "max" } | null; // the most that can still be lost before a rule breaks
  tradingDays: number; daysUsed: number; daysLeft: number | null;
  consistency: { best: number; share: number; ok: boolean } | null; // best day's profit and its share of the total
  breaches: Breach[]; // the first breach of each rule, in time order
  status: "active" | "passed" | "failed";
  passedOn: string | null;
  waiting: ("days" | "consistency")[]; // the target is reached but these are still missing
  avgDay: number | null; daysToTarget: number | null; // average result per trading day, trading days still needed at that pace
  days: DayRow[];
}

const DAY = 864e5;
const dayOf = (s: string | null | undefined) => (s ? s.trim().replace(" ", "T").slice(0, 10) : "");
const timeOf = (s: string | null | undefined) => (s ? s.trim().replace(" ", "T").slice(0, 16) : "");
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const between = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** The challenge on the account's trades up to `today` (the broker's current day, YYYY-MM-DD). */
export function challengeState(c: Challenge, trades: Trade[], today: string): ChallengeState {
  const mine = trades.filter((t) => t.accountId === c.accountId && dayOf(t.entryTime) >= c.start && dayOf(t.entryTime) <= today);
  type Ev = { at: string; open: boolean; pnl: number };
  const evs: Ev[] = [];
  for (const t of mine) {
    evs.push({ at: timeOf(t.entryTime), open: true, pnl: 0 });
    if (t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && t.exitTime && dayOf(t.exitTime) <= today) evs.push({ at: timeOf(t.exitTime), open: false, pnl: t.pnl });
  }
  evs.sort((a, b) => a.at.localeCompare(b.at) || Number(b.open) - Number(a.open)); // at the same minute, opens first
  const allowedMax = c.max != null ? (c.size * c.max) / 100 : null, goal = c.target != null ? (c.size * c.target) / 100 : null;
  const deadline = c.limitDays != null ? addDays(c.start, c.limitDays - 1) : null;
  const floorAt = (peak: number) => (allowedMax == null ? null : c.trailing ? (c.trailLock ? Math.min(c.size, peak - allowedMax) : peak - allowedMax) : c.size - allowedMax);

  let bal = c.size, peak = c.size, status = "active" as ChallengeState["status"], passedOn = null as string | null;
  const tdays = new Set<string>(), breaches: Breach[] = [], rows: DayRow[] = [], byDay = new Map<string, number>();
  let row: DayRow | null = null, dayStart = bal;
  const limitFor = (start: number) => (c.daily == null ? null : ((c.dailyBase === "size" ? c.size : start) * c.daily) / 100);
  const breach = (b: Breach) => { if (!breaches.some((x) => x.rule === b.rule)) breaches.push(b); if (status === "active") status = "failed"; };
  const consistencyOk = () => {
    if (c.consistency == null) return true;
    const total = bal - c.size, best = Math.max(0, ...byDay.values());
    return total > 0 && best <= (total * c.consistency) / 100 + 1e-9;
  };
  const check = (d: string) => {
    if (status !== "active" || goal == null) return;
    if (bal - c.size >= goal - 1e-9 && tdays.size >= c.minDays && consistencyOk()) { status = "passed"; passedOn = d; }
  };

  for (const e of evs) {
    const d = e.at.slice(0, 10);
    if (deadline && d > deadline && status === "active") breach({ rule: "time", day: addDays(deadline, 1), value: c.limitDays as number, limit: c.limitDays as number });
    if (!row || row.day !== d) {
      dayStart = bal;
      row = { day: d, pnl: 0, low: 0, end: bal, floor: floorAt(peak), limit: limitFor(dayStart), breach: [] };
      rows.push(row);
    }
    if (e.open) tdays.add(d);
    else {
      bal += e.pnl; row.pnl += e.pnl; row.low = Math.min(row.low, row.pnl); row.end = bal;
      byDay.set(d, (byDay.get(d) ?? 0) + e.pnl);
      peak = Math.max(peak, bal);
      row.floor = floorAt(peak);
      if (status === "active") {
        if (row.limit != null && row.pnl < -row.limit - 1e-9) { row.breach.push("daily"); breach({ rule: "daily", day: d, value: r2(-row.pnl), limit: r2(row.limit) }); }
        if (row.floor != null && bal < row.floor - 1e-9) { row.breach.push("max"); breach({ rule: "max", day: d, value: r2(bal), limit: r2(row.floor) }); }
      }
    }
    check(d);
  }
  if (deadline && today > deadline && status === "active") breach({ rule: "time", day: addDays(deadline, 1), value: c.limitDays as number, limit: c.limitDays as number });

  // today
  const tRow = rows.length && rows[rows.length - 1].day === today ? rows[rows.length - 1] : null;
  const tStart = tRow ? tRow.end - tRow.pnl : bal, tLimit = limitFor(tStart), tPnl = tRow ? tRow.pnl : 0;
  const todayS = tLimit != null ? { pnl: r2(tPnl), limit: r2(tLimit), room: r2(Math.max(0, tLimit + tPnl)), used: tLimit > 0 ? Math.max(0, -tPnl) / tLimit : 0 } : null;
  const floor = floorAt(peak);
  const maxS = floor != null && allowedMax != null ? { floor: r2(floor), room: r2(Math.max(0, bal - floor)), used: Math.max(0, Math.min(1, 1 - (bal - floor) / allowedMax)) } : null;
  let risk: ChallengeState["risk"] = null;
  if (status !== "failed") {
    if (todayS) risk = { amount: todayS.room, rule: "daily" };
    if (maxS && (!risk || maxS.room < risk.amount)) risk = { amount: maxS.room, rule: "max" };
  } else risk = todayS || maxS ? { amount: 0, rule: breaches[0]?.rule === "max" ? "max" : "daily" } : null;

  const pnl = r2(bal - c.size);
  const total = bal - c.size, best = byDay.size ? Math.max(...byDay.values()) : 0;
  const consistency = c.consistency != null ? { best: r2(Math.max(0, best)), share: total > 0 ? Math.max(0, best) / total : 0, ok: consistencyOk() } : null;
  const waiting: ChallengeState["waiting"] = [];
  if (status === "active" && goal != null && total >= goal - 1e-9) { if (tdays.size < c.minDays) waiting.push("days"); if (!consistencyOk()) waiting.push("consistency"); }
  const avgDay = tdays.size ? r2(total / tdays.size) : null;
  const daysToTarget = status === "active" && goal != null && avgDay != null && avgDay > 0 && total < goal ? Math.ceil((goal - total) / avgDay) : null;
  return {
    balance: r2(bal), pnl, peak: r2(peak),
    target: goal != null ? { amount: r2(goal), left: r2(Math.max(0, goal - total)), progress: goal > 0 ? Math.max(0, Math.min(1, total / goal)) : 0 } : null,
    today: todayS, maxLoss: maxS, risk: risk ? { amount: r2(risk.amount), rule: risk.rule } : null,
    tradingDays: tdays.size, daysUsed: Math.max(0, between(c.start, today) + 1), daysLeft: deadline ? Math.max(0, between(today, deadline) + 1) : null,
    consistency, breaches, status, passedOn, waiting, avgDay, daysToTarget,
    days: rows.map((x) => ({ ...x, pnl: r2(x.pnl), low: r2(x.low), end: r2(x.end), floor: x.floor == null ? null : r2(x.floor), limit: x.limit == null ? null : r2(x.limit) })),
  };
}

/** When a failed personal challenge can start again: tomorrow when a loss limit broke today (a firm would close the
 *  account for the day), else today. */
export function retryStart(s: ChallengeState, today: string): string {
  const b = s.breaches[0];
  return b && b.rule !== "time" && b.day >= today ? addDays(today, 1) : today;
}

/** Typical rule sets to start from (each firm has its own numbers: they are meant to be edited). */
export const TEMPLATES = {
  twoStep1: { target: 10, daily: 5, dailyBase: "size", max: 10, trailing: false, trailLock: true, minDays: 4, limitDays: null, consistency: null },
  twoStep2: { target: 5, daily: 5, dailyBase: "size", max: 10, trailing: false, trailLock: true, minDays: 4, limitDays: null, consistency: null },
  oneStep: { target: 10, daily: 3, dailyBase: "size", max: 6, trailing: true, trailLock: true, minDays: 0, limitDays: null, consistency: null },
  funded: { target: null, daily: 5, dailyBase: "size", max: 10, trailing: false, trailLock: true, minDays: 0, limitDays: null, consistency: null },
} satisfies Record<string, Omit<Challenge, "id" | "accountId" | "name" | "start" | "size">>;
