// GLORIA_RPG: assigns a trader one (negative/neutral) or two (positive) RPG characters for a given month,
// from their real trade history. See supabase/migrations/20261114_gloria_characters_reseed.sql for the roster.
import { supabase } from "../lib/supabase";
import type { Account, Trade } from "../types";
import type { GloriaRadarStats } from "../types/gloria";
import { tradeCore, ticketOf } from "../lib/stats";
import { rMultiple, tiltSplit } from "../lib/tradeLab";
import { readAnswers } from "../lib/tradeRules";
import { calculateElfMeter, calculateRadarStats, pickCharacter, type HeroReason } from "./gloriaCharacterRules";

export type GloriaCharacterId = "savage" | "rogue" | "warrior" | "sniper" | "tank" | "healer" | "mage" | "assassin" | "elf";

export interface GloriaMonthlyStats {
  month: string; // "YYYY-MM"
  totalTrades: number;
  winRate: number | null; // percent, 0-100
  maxDrawdown: number | null; // percent of the month's peak equity, 0-100 (see monthlyDrawdownPct)
  avgRR: number | null;
  profitFactor: number | null;
  uniquePairsCount: number;
  hadRevengeTrades: boolean;
  followedPlanRate: number | null; // percent, 0-100; null when no rule-answer data exists for the month
  previousMonthWasLoss: boolean;
  netPnl: number;
}

export interface GloriaCharacterAssignmentResult {
  primary: GloriaCharacterId;
  secondary: GloriaCharacterId | null;
  stats: GloriaMonthlyStats;
  radar: GloriaRadarStats;
  elfMeter: number;
}

const closeKey = (t: Trade) => t.exitTime || t.entryTime || "";
const monthOf = (t: Trade) => closeKey(t).slice(0, 7);
const isClosedInMonth = (t: Trade, month: string) => t.status === "closed" && t.pnl != null && monthOf(t) === month;

/**
 * The calendar month to snapshot: "now" if it already has a closed trade, otherwise the most recent month that
 * does. Without this, a trader (or a demo/test account) whose closed trades are all dated before the current
 * calendar month would show no hero, a zero Elf Meter and a flat radar all month, even though real trade history
 * exists -- "now" is just an unlucky default, not a real gate. Exported so the HUD's live preview and
 * gloriaPlayerService's persisted snapshot resolve to the exact same month.
 */
export function mostRecentTradingMonth(allTrades: Trade[], now: string = new Date().toISOString().slice(0, 7)): string {
  const closedMonths = new Set(allTrades.filter((t) => t.status === "closed" && t.pnl != null).map(monthOf).filter(Boolean));
  if (!closedMonths.size || closedMonths.has(now)) return now;
  return [...closedMonths].sort().pop() as string;
}

const prevMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Max peak-to-trough decline within the month, as a percent of the peak equity reached. `baseline` is the equity
 * the month started from (account start balance(s) plus every closed trade before it); the curve is baseline + the
 * month's running P&L, so a give-back is sized against real equity rather than against the month's own tiny peak.
 * Without a baseline (no accounts known) the curve starts at 0, as a fallback.
 */
function monthlyDrawdownPct(closed: Trade[], baseline: number): number | null {
  if (!closed.length) return null;
  const ordered = [...closed].sort((a, b) => closeKey(a).localeCompare(closeKey(b)) || ticketOf(a) - ticketOf(b));
  let cum = baseline, peak = baseline, worst = 0;
  for (const t of ordered) {
    cum += t.pnl as number;
    if (cum > peak) peak = cum;
    else if (peak > 0) worst = Math.max(worst, peak - cum);
  }
  if (peak > 0) return (worst / peak) * 100;
  return cum < 0 ? 100 : 0;
}

/** Equity at the start of `month`: the known accounts' start balances plus every closed trade before it. */
function equityBeforeMonth(allTrades: Trade[], accounts: Account[], month: string): number {
  const base = accounts.reduce((s, a) => s + a.startBalance, 0);
  const prior = allTrades.filter((t) => t.status === "closed" && t.pnl != null && monthOf(t) !== "" && monthOf(t) < month);
  return base + prior.reduce((s, t) => s + (t.pnl as number), 0);
}

/** Payoff ratio in R terms: average winning R-multiple over the average losing one (both unsigned). A plain signed
 *  average would wash out near zero for a break-even system even when every trade individually risked well, so
 *  wins and losses are averaged separately first, matching how "RR" is meant in the design sheet's thresholds. */
function payoffR(closed: Trade[]): number | null {
  const rs = closed.map(rMultiple).filter((x): x is number => x != null);
  const wins = rs.filter((x) => x > 0), losses = rs.filter((x) => x < 0).map(Math.abs);
  if (!wins.length || !losses.length) return null;
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  return mean(wins) / mean(losses);
}

export function calculateMonthlyStats(allTrades: Trade[], month: string, accounts: Account[] = []): GloriaMonthlyStats {
  const closed = allTrades.filter((t) => isClosedInMonth(t, month));
  const core = tradeCore(closed);

  const revenge = tiltSplit(allTrades).afterLossBigger.some((t) => monthOf(t) === month);

  const answers = readAnswers();
  const answered = closed.filter((t) => answers[t.key]);
  const followedPlanRate = answered.length
    ? (answered.filter((t) => answers[t.key].done && answers[t.key].b.length === 0).length / answered.length) * 100
    : null;

  const prevClosed = allTrades.filter((t) => isClosedInMonth(t, prevMonth(month)));
  const previousMonthWasLoss = prevClosed.length > 0 && tradeCore(prevClosed).net < 0;

  return {
    month,
    totalTrades: core.n,
    winRate: core.winRate,
    maxDrawdown: monthlyDrawdownPct(closed, equityBeforeMonth(allTrades, accounts, month)),
    avgRR: payoffR(closed),
    profitFactor: core.pf,
    uniquePairsCount: new Set(closed.map((t) => t.symbol)).size,
    hadRevengeTrades: revenge,
    followedPlanRate,
    previousMonthWasLoss,
    netPnl: core.net,
  };
}

// Matching, radar and Elf meter live in gloriaCharacterRules (pure, shared with the roster / progress UI).
// Re-exported so existing imports keep working.
export { calculateElfMeter, calculateRadarStats, determineCharacters, pickCharacter } from "./gloriaCharacterRules";
export type { HeroReason } from "./gloriaCharacterRules";

/** Stats, radar and the pick for one month, or null when it has no closed trades. Pure: no I/O. */
export function analyzeMonth(allTrades: Trade[], month: string, accounts: Account[] = []): GloriaCharacterAssignmentResult & { reason: HeroReason } | null {
  const stats = calculateMonthlyStats(allTrades, month, accounts);
  if (stats.totalTrades === 0) return null;
  const radar = calculateRadarStats(stats);
  const picked = pickCharacter(stats, radar);
  if (!picked) return null;
  return { ...picked, stats, radar, elfMeter: calculateElfMeter(radar) };
}

/**
 * Persists a month's analysis into gloria_character_assignments (the per-month record), replacing whatever that
 * month held. A null analysis (no closed trades) just clears the month. Not called per page load any more: the
 * scheduled hero update (gloriaHeroService) is the only caller, so these rows move only on the weekly/monthly beat.
 */
export async function saveMonthAssignment(userId: string, month: string, a: GloriaCharacterAssignmentResult | null): Promise<void> {
  const monthDate = `${month}-01`;
  const { error: delErr } = await supabase.from("gloria_character_assignments").delete().eq("user_id", userId).eq("month", monthDate);
  if (delErr) throw delErr;
  if (!a) return;

  const snapshot = { ...a.stats, radar: a.radar, elfMeter: a.elfMeter };
  const rows = [
    { user_id: userId, character_id: a.primary, month: monthDate, is_primary: true, stats_snapshot: snapshot },
    ...(a.secondary ? [{ user_id: userId, character_id: a.secondary, month: monthDate, is_primary: false, stats_snapshot: snapshot }] : []),
  ];
  const { error: insErr } = await supabase.from("gloria_character_assignments").insert(rows);
  // 23505 = unique_violation on (user_id, month, character_id): an overlapping call for this same user (two
  // tabs, or two evaluation passes that raced) already assigned this month between our delete and our insert.
  // Whoever won assigned the same trade history to the same character, so there is nothing to reconcile.
  if (insErr && insErr.code !== "23505") throw insErr;
}

/** Computes and persists the month's character assignment(s) for a user. Returns null when the month has no trades. */
export async function assignCharacter(userId: string, month: string, allTrades: Trade[], accounts: Account[] = []): Promise<GloriaCharacterAssignmentResult | null> {
  const analysis = analyzeMonth(allTrades, month, accounts);
  await saveMonthAssignment(userId, month, analysis);
  return analysis;
}
