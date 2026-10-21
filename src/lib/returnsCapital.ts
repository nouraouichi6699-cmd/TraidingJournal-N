import type { Trade } from "../types";
import { cents, tradeCore } from "./stats";

/**
 * Returns & Capital metrics. Conventions (all documented in the UI tooltips):
 *  - Realised P&L only: closed trades, `pnl` is NET (costs already included, never subtracted twice).
 *  - A trade belongs to the day / ISO week (Mon-Sun) / month of its CLOSE date (entry date as a fallback).
 *  - Only periods that contain at least one closed trade are "eligible"; empty periods are excluded from every average.
 *  - A day/week/month is profitable when its cent-rounded net P&L is > 0 (zero = neither profit nor loss).
 *  - Period returns are balance-based: P&L / balance at the start of that day/week/month (period start balance + earlier P&L).
 *    No deposit/withdrawal records exist, so external cash flows are not modelled: TWR, equity and cash-flow metrics are unavailable.
 *  - Standard deviation is the sample deviation (n - 1).
 */
export type RcWhy = "noTrades" | "noStart" | "noCash" | "noEquity" | "fewDays" | "noWins" | "noLosses";
export interface ReturnsCapital {
  n: number; days: number; weeks: number; months: number;
  net: number | null; gross: number | null; loss: number | null; totalReturn: number | null;
  avgDailyRet: number | null; avgWeeklyRet: number | null; avgMonthlyRet: number | null;
  avgDailyPnl: number | null; medDailyPnl: number | null; sdDailyPnl: number | null; avgWeeklyPnl: number | null; avgMonthlyPnl: number | null;
  bestDay: number | null; worstDay: number | null; bestWeek: number | null; worstWeek: number | null; bestMonth: number | null; worstMonth: number | null;
  initial: number | null; startBal: number | null; currentBal: number | null; endBal: number | null; highBal: number | null;
  profitDays: number | null; profitDayPct: number | null; tradeWinRate: number | null; profitWeeks: number | null; profitMonths: number | null; posRetDays: number | null;
  avgWinDay: number | null; avgLossDay: number | null; bigWinShare: number | null; bigLossShare: number | null;
  why: Partial<Record<string, RcWhy>>;
}

const closedOnly = (t: Trade) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl);
const closeKey = (t: Trade) => t.exitTime || t.entryTime || "";
const dayOf = (t: Trade) => closeKey(t).slice(0, 10);
const weekOf = (day: string) => { const d = new Date(day + "T00:00:00Z"); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); };
const monthOf = (day: string) => day.slice(0, 7);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : null);
const fin = (v: number | null) => (v != null && Number.isFinite(v) ? v : null);
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Net P&L per bucket (cent-rounded), keyed and sorted chronologically. */
function bucket(closed: Trade[], key: (t: Trade) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const t of closed) { const k = key(t); if (k) m.set(k, (m.get(k) ?? 0) + (t.pnl as number)); }
  return [...m].map(([k, v]) => [k, cents(v)] as [string, number]).sort((a, b) => a[0].localeCompare(b[0]));
}
/** Return of each bucket = P&L / balance at the start of the bucket; buckets with a non-positive balance are skipped. */
function returns(b: [string, number][], start: number): number[] {
  const r: number[] = []; let bal = start;
  for (const [, pl] of b) { if (bal > 0) r.push((pl / bal) * 100); bal += pl; }
  return r;
}

/**
 * @param period  closed/open trades inside the selected period (already filtered by account + period)
 * @param before  trades of the same accounts that fall BEFORE the period (for the starting balance)
 * @param initial sum of the accounts' initial balances
 */
export function computeReturnsCapital(period: Trade[], before: Trade[], initial: number): ReturnsCapital {
  const closed = period.filter(closedOnly), prior = before.filter(closedOnly);
  const n = closed.length, why: ReturnsCapital["why"] = { twr: "noCash", ann: "noCash", sEq: "noEquity", cEq: "noEquity", eEq: "noEquity", hiEq: "noEquity" };
  for (const id of ["netDep", "totDep", "totWd", "netFlow", "credits", "depN", "wdN", "credN", "avgDep", "avgWd"]) why[id] = "noCash";
  const hasInit = initial > 0;
  const startBal = hasInit ? initial + cents(sum(prior.map((t) => t.pnl as number))) : null;
  const core = tradeCore(closed);
  const days = bucket(closed, dayOf), weeks = bucket(closed, (t) => weekOf(dayOf(t)).slice(0, 10)), months = bucket(closed, (t) => monthOf(dayOf(t)));
  const dv = days.map((d) => d[1]), wv = weeks.map((d) => d[1]), mv = months.map((d) => d[1]);
  const net = n ? cents(core.net) : null;

  // Balance curve from the ledger: start balance, then each closed trade in close order.
  let high: number | null = null;
  if (startBal != null && n) { let b = startBal; high = b; for (const t of [...closed].sort((a, c) => closeKey(a).localeCompare(closeKey(c)))) { b += t.pnl as number; if (b > high) high = b; } }
  const allNet = hasInit ? initial + cents(sum([...prior, ...closed].map((t) => t.pnl as number))) : null;

  const winD = dv.filter((v) => v > 0), lossD = dv.filter((v) => v < 0);
  const posSum = sum(winD), negSum = Math.abs(sum(lossD));
  const rDay = startBal != null ? returns(days, startBal) : [], rWeek = startBal != null ? returns(weeks, startBal) : [], rMonth = startBal != null ? returns(months, startBal) : [];
  const m = mean(dv);
  const sd = dv.length >= 2 && m != null ? Math.sqrt(dv.reduce((s, x) => s + (x - m) ** 2, 0) / (dv.length - 1)) : null;

  if (!n) for (const k of ["net", "gross", "loss", "avgDailyPnl", "medDailyPnl", "bestDay", "profitDays", "avgWinDay"]) why[k] = "noTrades";
  if (n && !hasInit) for (const k of ["totalReturn", "avgDailyRet", "avgWeeklyRet", "avgMonthlyRet", "initial", "startBal", "currentBal", "endBal", "highBal", "posRetDays"]) why[k] = "noStart";
  if (n && dv.length < 2) why.sdDailyPnl = "fewDays";
  if (n && !winD.length) { why.avgWinDay = "noWins"; why.bigWinShare = "noWins"; }
  if (n && !lossD.length) { why.avgLossDay = "noLosses"; why.bigLossShare = "noLosses"; }

  return {
    n, days: days.length, weeks: weeks.length, months: months.length,
    net, gross: n ? cents(core.gp) : null, loss: n ? -cents(core.gl) : null,
    totalReturn: n && startBal != null && startBal > 0 ? fin((cents(core.net) / startBal) * 100) : null,
    avgDailyRet: fin(mean(rDay)), avgWeeklyRet: fin(mean(rWeek)), avgMonthlyRet: fin(mean(rMonth)),
    avgDailyPnl: fin(m), medDailyPnl: median(dv), sdDailyPnl: fin(sd), avgWeeklyPnl: fin(mean(wv)), avgMonthlyPnl: fin(mean(mv)),
    bestDay: dv.length ? Math.max(...dv) : null, worstDay: dv.length ? Math.min(...dv) : null,
    bestWeek: wv.length ? Math.max(...wv) : null, worstWeek: wv.length ? Math.min(...wv) : null,
    bestMonth: mv.length ? Math.max(...mv) : null, worstMonth: mv.length ? Math.min(...mv) : null,
    initial: hasInit ? initial : null, startBal, currentBal: allNet, endBal: startBal != null && n ? startBal + cents(core.net) : startBal,
    highBal: high,
    profitDays: n ? winD.length : null, profitDayPct: dv.length ? (winD.length / dv.length) * 100 : null, tradeWinRate: core.winRate,
    profitWeeks: n ? wv.filter((v) => v > 0).length : null, profitMonths: n ? mv.filter((v) => v > 0).length : null,
    posRetDays: n && startBal != null ? rDay.filter((v) => v > 0).length : null,
    avgWinDay: fin(mean(winD)), avgLossDay: fin(mean(lossD)),
    bigWinShare: winD.length && posSum > 0 ? (Math.max(...winD) / posSum) * 100 : null,
    bigLossShare: lossD.length && negSum > 0 ? (Math.abs(Math.min(...lossD)) / negSum) * 100 : null,
    why,
  };
}
