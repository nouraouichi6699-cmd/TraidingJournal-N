// GLORIA_RPG: assigns a trader one (negative/neutral) or two (positive) RPG characters for a given month,
// from their real trade history. See supabase/migrations/20261114_gloria_characters_reseed.sql for the roster.
import { supabase } from "../lib/supabase";
import type { Account, Trade } from "../types";
import type { GloriaRadarStats } from "../types/gloria";
import { tradeCore, ticketOf } from "../lib/stats";
import { rMultiple, tiltSplit } from "../lib/tradeLab";
import { readAnswers } from "../lib/tradeRules";

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

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** The 7-axis radar, each 0-100, derived from the month's stats. Thresholds are gamification tuning, not risk metrics. */
export function calculateRadarStats(s: GloriaMonthlyStats): GloriaRadarStats {
  const wr = s.winRate ?? 0, dd = s.maxDrawdown ?? 0, rr = s.avgRR ?? 0, pf = s.profitFactor ?? 0;
  return {
    precision: clamp(wr),
    speed: clamp((s.totalTrades / 30) * 100),
    defense: clamp(100 - dd),
    wisdom: s.followedPlanRate != null ? clamp(s.followedPlanRate) : clamp(wr * 0.6 + (100 - dd) * 0.4),
    recovery: clamp((s.previousMonthWasLoss && s.netPnl > 0 ? 50 : 0) + wr / 2),
    intelligence: clamp((pf / 3) * 100),
    power: clamp((rr / 3) * 100),
  };
}

/** Average of the 7 radar axes, rounded. Elf requires every axis above 70 (checked separately, not just the average). */
export function calculateElfMeter(radar: GloriaRadarStats): number {
  const vals = Object.values(radar);
  return Math.round(vals.reduce((a, x) => a + x, 0) / vals.length);
}

interface PositiveCandidate { id: Exclude<GloriaCharacterId, "savage" | "rogue" | "elf">; qualifies: boolean; score: number }

/**
 * A qualifying character (its hard gates from the design sheet all hold) always outranks a non-qualifying one
 * (the +1000 bonus). Within either group, ties break on a 0-100ish blend of the already-bounded radar axes,
 * so an outlier raw metric (e.g. a profit factor of 20 from one lucky trade) can't swamp the ranking.
 */
function scorePositives(s: GloriaMonthlyStats, radar: GloriaRadarStats): PositiveCandidate[] {
  const wr = s.winRate ?? 0, dd = s.maxDrawdown ?? 0, rr = s.avgRR ?? 0, pf = s.profitFactor ?? 0;
  const hasRR = s.avgRR != null;
  const pairBonus = Math.min(100, s.uniquePairsCount * 20);
  const fewTradesBonus = Math.max(0, 15 - s.totalTrades) * 2;
  const base: PositiveCandidate[] = [
    { id: "warrior", qualifies: s.totalTrades >= 20 && wr > 50 && hasRR && rr > 1.0 && dd < 15, score: radar.speed * 0.4 + radar.precision * 0.3 + radar.defense * 0.3 },
    { id: "sniper", qualifies: s.totalTrades <= 15 && wr > 55 && hasRR && rr > 2.0 && dd < 10, score: radar.precision * 0.4 + radar.power * 0.4 + radar.defense * 0.2 + fewTradesBonus },
    { id: "tank", qualifies: wr > 50 && dd < 5 && hasRR && rr > 1.0, score: radar.defense * 0.6 + radar.precision * 0.4 },
    { id: "healer", qualifies: s.previousMonthWasLoss && wr > 55 && hasRR && rr > 1.5, score: radar.recovery * 0.6 + radar.precision * 0.4 },
    { id: "mage", qualifies: pf > 2.5 && s.uniquePairsCount >= 4 && wr > 50 && hasRR && rr > 2.0, score: radar.intelligence * 0.4 + radar.wisdom * 0.3 + pairBonus * 0.3 },
    { id: "assassin", qualifies: wr > 60 && hasRR && rr > 2.5 && dd < 8, score: radar.speed * 0.3 + radar.precision * 0.4 + radar.power * 0.3 },
  ];
  return base.map((c) => ({ ...c, score: c.score + (c.qualifies ? 1000 : 0) }));
}

/** Pure matching logic: Elf -> Savage -> Rogue -> top 2 of the 6 positive characters. No I/O. */
export function determineCharacters(s: GloriaMonthlyStats, radar: GloriaRadarStats, elfMeter: number): { primary: GloriaCharacterId; secondary: GloriaCharacterId | null } | null {
  if (s.totalTrades === 0) return null;
  if (s.totalTrades < 5) return { primary: "rogue", secondary: null };

  const allAbove70 = Object.values(radar).every((v) => v > 70);
  if (allAbove70 && s.winRate != null && s.winRate > 60 && s.maxDrawdown != null && s.maxDrawdown < 5 && s.avgRR != null && s.avgRR > 2.0) {
    return { primary: "elf", secondary: null };
  }

  if (s.winRate != null && s.winRate < 35 && s.maxDrawdown != null && s.maxDrawdown > 20 && s.avgRR != null && s.avgRR < 0.5) {
    return { primary: "savage", secondary: null };
  }

  if (s.winRate != null && s.winRate >= 40 && s.winRate <= 50 && s.maxDrawdown != null && s.maxDrawdown >= 10 && s.maxDrawdown <= 15 && s.avgRR != null && s.avgRR >= 0.8 && s.avgRR <= 1.2) {
    return { primary: "rogue", secondary: null };
  }

  const ranked = scorePositives(s, radar).sort((a, b) => b.score - a.score);
  return { primary: ranked[0].id, secondary: ranked[1].id };
}

/** Computes and persists the month's character assignment(s) for a user. Returns null when the month has no trades. */
export async function assignCharacter(userId: string, month: string, allTrades: Trade[], accounts: Account[] = []): Promise<GloriaCharacterAssignmentResult | null> {
  const stats = calculateMonthlyStats(allTrades, month, accounts);
  const monthDate = `${month}-01`;

  if (stats.totalTrades === 0) {
    const { error } = await supabase.from("gloria_character_assignments").delete().eq("user_id", userId).eq("month", monthDate);
    if (error) throw error;
    return null;
  }

  const radar = calculateRadarStats(stats);
  const elfMeter = calculateElfMeter(radar);
  const picked = determineCharacters(stats, radar, elfMeter);
  if (!picked) return null;

  const snapshot = { ...stats, radar, elfMeter };
  const rows = [
    { user_id: userId, character_id: picked.primary, month: monthDate, is_primary: true, stats_snapshot: snapshot },
    ...(picked.secondary ? [{ user_id: userId, character_id: picked.secondary, month: monthDate, is_primary: false, stats_snapshot: snapshot }] : []),
  ];

  const { error: delErr } = await supabase.from("gloria_character_assignments").delete().eq("user_id", userId).eq("month", monthDate);
  if (delErr) throw delErr;
  const { error: insErr } = await supabase.from("gloria_character_assignments").insert(rows);
  if (insErr) throw insErr;

  return { ...picked, stats, radar, elfMeter };
}
