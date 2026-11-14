// GLORIA_RPG: the challenge verification engine. Reads gloria_challenges' condition_type + condition_value,
// checks it against real trade data (never fabricated), advances gloria_quest_progress, awards XP on completion,
// and unlocks the next challenges / zone boss / zone. See supabase/migrations/20261114_gloria_rpg.sql for the
// seeded condition types; a few extra aliases are resolved too so new challenges can reuse the same evaluators
// without a code change (the "one function per type" goal).
//
// Honesty over completeness: a few condition types describe usage this app does not log anywhere yet
// (calculator_usage, advisor_usage, no_trade_high_impact_news). Rather than invent that data, those evaluators
// always report zero progress until real usage tracking exists -- never a random pass, never a silent guess.
import { supabase } from "../lib/supabase";
import type { Account, Trade } from "../types";
import type {
  GloriaChallenge,
  GloriaChallengeRow,
  GloriaQuestProgress,
  GloriaQuestProgressRow,
  GloriaQuestStatus,
  GloriaXpSourceType,
  GloriaZone,
  GloriaZoneRow,
} from "../types/gloria";
import { tradeCore } from "../lib/stats";
import { dayKey, dayList } from "../lib/dayByDay";
import { rMultiple, tiltSplit } from "../lib/tradeLab";
import { tradeOutcomeOf } from "../lib/outcome";
import { readAnswers, type RuleAnswer } from "../lib/tradeRules";
import { readNotes } from "../lib/tradeNotes";
import { readSettings } from "../useSettings";
import { getOrCreatePlayerStats, updatePlayerStats } from "./gloriaPlayerService";

// ---------------------------------------------------------------------------
// Row <-> model
// ---------------------------------------------------------------------------

const challengeFromRow = (r: GloriaChallengeRow): GloriaChallenge => ({
  id: r.id,
  zoneId: r.zone_id,
  name: r.name,
  nameAr: r.name_ar,
  description: r.description,
  descriptionAr: r.description_ar,
  category: r.category,
  conditionType: r.condition_type,
  conditionValue: r.condition_value,
  xpReward: r.xp_reward,
  difficulty: r.difficulty,
  isBossChallenge: r.is_boss_challenge,
});

const zoneFromRow = (r: GloriaZoneRow): GloriaZone => ({
  id: r.id,
  name: r.name,
  nameAr: r.name_ar,
  difficulty: r.difficulty,
  orderIndex: r.order_index,
  bossName: r.boss_name,
  bossNameAr: r.boss_name_ar,
  unlockCondition: r.unlock_condition,
  reward: r.reward,
});

// current_value / target_value are SQL `numeric`, which postgrest can return as a string; always coerce.
const progressFromRow = (r: GloriaQuestProgressRow): GloriaQuestProgress => ({
  id: r.id,
  userId: r.user_id,
  challengeId: r.challenge_id,
  status: r.status,
  startedAt: r.started_at,
  completedAt: r.completed_at,
  currentValue: Number(r.current_value) || 0,
  targetValue: Number(r.target_value) || 0,
  updatedAt: r.updated_at,
});

export async function getChallenges(): Promise<GloriaChallenge[]> {
  const { data, error } = await supabase.from("gloria_challenges").select("*");
  if (error) throw error;
  return (data as GloriaChallengeRow[]).map(challengeFromRow);
}

export async function getZones(): Promise<GloriaZone[]> {
  const { data, error } = await supabase.from("gloria_zones").select("*");
  if (error) throw error;
  return (data as GloriaZoneRow[]).map(zoneFromRow);
}

export async function getQuestProgress(userId: string): Promise<GloriaQuestProgress[]> {
  const { data, error } = await supabase.from("gloria_quest_progress").select("*").eq("user_id", userId);
  if (error) throw error;
  return (data as GloriaQuestProgressRow[]).map(progressFromRow);
}

// ---------------------------------------------------------------------------
// Manual flags (for condition types that are a deliberate user action, not something derivable from trades --
// e.g. "shared a strategy with the community"). A future UI action calls recordManualProgress; until then these
// stay at zero, same as any other not-yet-wired condition.
// ---------------------------------------------------------------------------

const MANUAL_KEY = "mizan-gloria-manual";

function readManualFlags(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(MANUAL_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Bumps a manual flag's counter (e.g. "share_strategy"). Call this from wherever that action actually happens. */
export function recordManualProgress(flagId: string, amount = 1) {
  const all = readManualFlags();
  all[flagId] = (all[flagId] ?? 0) + amount;
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: the flag just stays at its last saved value */
  }
}

// ---------------------------------------------------------------------------
// Condition evaluation -- pure, deterministic, no I/O
// ---------------------------------------------------------------------------

export interface ConditionResult {
  completed: boolean;
  currentValue: number;
  targetValue: number;
  /** 0-100, granular: climbs with partial progress, not just 0 then 100. */
  progress: number;
}

interface EvalContext {
  answers: Record<string, RuleAnswer>;
  /** The user's own configured risk-per-trade setting (Settings > riskPct), as a percent. */
  riskPct: number;
  manualFlags: Record<string, number>;
  /** challengeId -> status, needed by boss_clear. Empty when not relevant. */
  questStatus: Record<string, GloriaQuestStatus>;
}

const closedOf = (trades: Trade[]) => trades.filter((t) => t.status === "closed" && t.pnl != null);
const closeKeyOf = (t: Trade) => t.exitTime || t.entryTime || "";
const orderedClosed = (trades: Trade[]) => [...closedOf(trades)].sort((a, b) => closeKeyOf(a).localeCompare(closeKeyOf(b)));

const num = (v: Record<string, unknown>, key: string, fallback = 0): number => {
  const x = v[key];
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
};
const strList = (v: Record<string, unknown>, key: string): string[] => {
  const x = v[key];
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const addDaysISO = (day: string, delta: number): string => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
};

/** Every known account's start balance, before any trade. */
const baseEquity = (accounts: Account[]) => accounts.reduce((s, a) => s + a.startBalance, 0);

/** Running equity just before each trade in `ordered` (same order, same length). */
function equityBeforeEachTrade(ordered: Trade[], accounts: Account[]): number[] {
  let eq = baseEquity(accounts);
  const out: number[] = [];
  for (const t of ordered) {
    out.push(eq);
    eq += t.pnl as number;
  }
  return out;
}

// ---------- shared progress shapes ----------

/** A plain cumulative count against a target count (e.g. "log 5 trades with notes"). */
function milestone(current: number, target: number): ConditionResult {
  const t = Math.max(1, target);
  const completed = current >= t;
  return { completed, currentValue: current, targetValue: t, progress: completed ? 100 : Math.round(clamp01(current / t) * 100) };
}

/**
 * A rate (hits / window) over the most recent `windowSize` qualifying trades, required to reach `requiredPct`.
 * Fewer than `windowSize` trades yet: progress blends how full the window is with how good the rate looks so
 * far, so it climbs smoothly instead of jumping from 0 to 100 on the last trade.
 */
function rollingRateAtLeast(qualifyingHits: boolean[], windowSize: number, requiredPct: number): ConditionResult {
  const n = Math.max(1, windowSize);
  const window = qualifyingHits.slice(-n);
  const rate = window.length ? (window.filter(Boolean).length / window.length) * 100 : 0;
  const completed = window.length >= n && rate >= requiredPct;
  const countFactor = clamp01(window.length / n);
  const qualityFactor = clamp01(rate / Math.max(1e-9, requiredPct));
  return { completed, currentValue: Math.round(rate * 10) / 10, targetValue: requiredPct, progress: completed ? 100 : Math.round(countFactor * qualityFactor * 100) };
}

/** Same shape as rollingRateAtLeast, for an average value (not a hit rate) that must reach a minimum. */
function rollingAverageAtLeast(values: number[], windowSize: number, requiredMin: number): ConditionResult {
  const n = Math.max(1, windowSize);
  const window = values.slice(-n);
  const avg = window.length ? window.reduce((a, x) => a + x, 0) / window.length : 0;
  const completed = window.length >= n && avg >= requiredMin;
  const countFactor = clamp01(window.length / n);
  const qualityFactor = clamp01(avg / Math.max(1e-9, requiredMin));
  return { completed, currentValue: Math.round(avg * 100) / 100, targetValue: requiredMin, progress: completed ? 100 : Math.round(countFactor * qualityFactor * 100) };
}

/** A single computed value that must stay at or below a cap (drawdown, average loss). */
function valueAtMost(value: number | null, threshold: number, haveEnough: boolean, countFactor = 1): ConditionResult {
  if (value == null) return { completed: false, currentValue: 0, targetValue: threshold, progress: 0 };
  const completed = haveEnough && value <= threshold;
  const qualityFactor = clamp01(threshold / Math.max(1e-9, value));
  return { completed, currentValue: Math.round(value * 10) / 10, targetValue: threshold, progress: completed ? 100 : Math.round(clamp01(countFactor) * qualityFactor * 100) };
}

/** A single computed value that must reach at least a minimum (a profit target). */
function valueAtLeast(value: number, threshold: number, haveEnough: boolean): ConditionResult {
  const completed = haveEnough && value >= threshold;
  const qualityFactor = clamp01(value / Math.max(1e-9, threshold));
  return { completed, currentValue: Math.round(value * 10) / 10, targetValue: threshold, progress: completed ? 100 : Math.round(qualityFactor * 100) };
}

/**
 * A streak of consecutive TRADING days (only days that actually had a trade; a day with no trades neither helps
 * nor hurts) that must never be "bad". Used for discipline conditions: no revenge trade, no broken rule, no
 * over-trading. Walks backward from the most recent trading day.
 */
function tradingDayStreak(tradingDaysAsc: string[], isBadDay: (day: string) => boolean, target: number): ConditionResult {
  let streak = 0;
  for (let i = tradingDaysAsc.length - 1; i >= 0 && streak < target; i--) {
    if (isBadDay(tradingDaysAsc[i])) break;
    streak++;
  }
  const completed = streak >= target;
  return { completed, currentValue: streak, targetValue: target, progress: completed ? 100 : Math.round(clamp01(streak / target) * 100) };
}

/**
 * A streak of consecutive CALENDAR days that must each show activity (unlike tradingDayStreak, a gap day breaks
 * it). Anchored at the most recent active day, not literally "today", so a streak in progress is not punished
 * just because today hasn't happened yet.
 */
function calendarDayStreak(activityDays: Set<string>, target: number): ConditionResult {
  if (!activityDays.size) return { completed: false, currentValue: 0, targetValue: target, progress: 0 };
  let cursor = [...activityDays].sort().pop() as string;
  let streak = 0;
  while (streak < target && activityDays.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  const completed = streak >= target;
  return { completed, currentValue: streak, targetValue: target, progress: completed ? 100 : Math.round(clamp01(streak / target) * 100) };
}

/** A streak of consecutive weeks (Monday-keyed) that must each net positive; missing weeks count as flat (fail). */
function calendarWeekStreak(netByWeek: Map<string, number>, target: number): ConditionResult {
  if (!netByWeek.size) return { completed: false, currentValue: 0, targetValue: target, progress: 0 };
  let cursor = [...netByWeek.keys()].sort().pop() as string;
  let streak = 0;
  while (streak < target && (netByWeek.get(cursor) ?? 0) > 0) {
    streak++;
    cursor = addDaysISO(cursor, -7);
  }
  const completed = streak >= target;
  return { completed, currentValue: streak, targetValue: target, progress: completed ? 100 : Math.round(clamp01(streak / target) * 100) };
}

/** A streak of consecutive trades (closed, most recent first) that must each pass `isGood`. */
function tradeStreakFromEnd(orderedClosedTrades: Trade[], isGood: (t: Trade) => boolean, target: number): ConditionResult {
  let streak = 0;
  for (let i = orderedClosedTrades.length - 1; i >= 0 && streak < target; i--) {
    if (!isGood(orderedClosedTrades[i])) break;
    streak++;
  }
  const completed = streak >= target;
  return { completed, currentValue: streak, targetValue: target, progress: completed ? 100 : Math.round(clamp01(streak / target) * 100) };
}

const mondayOfDay = (day: string): string => {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
};

/** Peak-to-trough decline (% of the peak) within `ordered`, starting from `startEquity`. Null without trades. */
function drawdownPct(ordered: Trade[], startEquity: number): number | null {
  if (!ordered.length) return null;
  let cum = startEquity, peak = startEquity, worst = 0;
  for (const t of ordered) {
    cum += t.pnl as number;
    if (cum > peak) peak = cum;
    else if (peak > 0) worst = Math.max(worst, peak - cum);
  }
  return peak > 0 ? (worst / peak) * 100 : cum < 0 ? 100 : 0;
}

// ---------- per-trade risk % (money at risk / equity before the trade), reused by a few evaluators ----------

/** `[risk% per trade]`, one entry per closed trade that has a usable stop (skips trades with no measurable risk). */
function riskPctSeries(ordered: Trade[], accounts: Account[]): number[] {
  const eqBefore = equityBeforeEachTrade(ordered, accounts);
  const out: number[] = [];
  ordered.forEach((t, i) => {
    const r = rMultiple(t);
    if (r == null || Math.abs(r) < 1e-9) return;
    const eq = eqBefore[i];
    if (!(eq > 0)) return;
    out.push((Math.abs((t.pnl as number) / r) / eq) * 100);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Evaluators, one per condition_type (plus aliases for the task's conceptual names)
// ---------------------------------------------------------------------------

type Evaluator = (trades: Trade[], accounts: Account[], value: Record<string, unknown>, ctx: EvalContext) => ConditionResult;

const notTrackedYet: Evaluator = (_t, _a, value) => milestone(0, num(value, "count", 1));

const loginStreak: Evaluator = (trades, _a, value) => {
  const days = new Set(trades.map((t) => (t.entryTime || t.exitTime || "").slice(0, 10)).filter(Boolean));
  return calendarDayStreak(days, num(value, "days", 1));
};

const journalEntries: Evaluator = (trades, _a, value) => {
  const notes = readNotes();
  const n = trades.filter((t) => (notes[t.key] ?? "").trim().length > 0).length;
  return milestone(n, num(value, "count", 1));
};

const journalStreak: Evaluator = (trades, _a, value) => {
  const notes = readNotes();
  const days = new Set(trades.filter((t) => (notes[t.key] ?? "").trim().length > 0).map((t) => dayKey(t)).filter(Boolean));
  return calendarDayStreak(days, num(value, "days", 1));
};

const maxRiskPerTrade: Evaluator = (trades, accounts, value) => {
  const ordered = orderedClosed(trades);
  const eqBefore = equityBeforeEachTrade(ordered, accounts);
  const hits: boolean[] = [];
  ordered.forEach((t, i) => {
    const r = rMultiple(t);
    if (r == null || Math.abs(r) < 1e-9) return;
    const eq = eqBefore[i];
    if (!(eq > 0)) return;
    hits.push((Math.abs((t.pnl as number) / r) / eq) * 100 <= num(value, "percent", 2));
  });
  return rollingRateAtLeast(hits, num(value, "trades", 1), 100);
};

const winRateMin: Evaluator = (trades, _a, value) => {
  const ordered = orderedClosed(trades);
  const hits = ordered.map((t) => tradeOutcomeOf(t) === "win");
  return rollingRateAtLeast(hits, num(value, "trades", 1), num(value, "percent", 50));
};

const bossClear: Evaluator = (_t, _a, value, ctx) => {
  const requires = strList(value, "requires");
  const done = requires.filter((id) => ctx.questStatus[id] === "completed").length;
  return milestone(done, requires.length || 1);
};

const tradingDaysStreak: Evaluator = (trades, _a, value) => {
  const days = new Set(closedOf(trades).map((t) => dayKey(t)).filter(Boolean));
  return calendarDayStreak(days, num(value, "days", 1));
};

const entryWithinPlan: Evaluator = (trades, _a, value, ctx) => {
  const n = closedOf(trades).filter((t) => ctx.answers[t.key]?.done && ctx.answers[t.key].b.length === 0).length;
  return milestone(n, num(value, "count", 1));
};

const slSetRate: Evaluator = (trades, _a, value) => {
  const ordered = orderedClosed(trades);
  const hits = ordered.map((t) => t.sl != null && Number.isFinite(t.sl));
  return rollingRateAtLeast(hits, num(value, "trades", 1), num(value, "percent", 100));
};

const avgLossBelow: Evaluator = (trades, accounts, value) => {
  const ordered = orderedClosed(trades);
  const window = ordered.slice(-30);
  const core = tradeCore(window);
  const equityNow = baseEquity(accounts) + ordered.reduce((s, t) => s + (t.pnl as number), 0);
  const pctOfEquity = core.avgLoss != null && equityNow > 0 ? (Math.abs(core.avgLoss) / equityNow) * 100 : null;
  return valueAtMost(pctOfEquity, num(value, "percent", 2), window.length >= 5, window.length / 30);
};

const planBeforeEntry: Evaluator = (trades, _a, value, ctx) => {
  const n = closedOf(trades).filter((t) => !!ctx.answers[t.key]).length;
  return milestone(n, num(value, "count", 1));
};

const riskRewardMin: Evaluator = (trades, _a, value) => {
  const ordered = orderedClosed(trades);
  const ratios: number[] = [];
  for (const t of ordered) {
    if (t.sl == null || t.tp == null) continue;
    const riskDist = Math.abs(t.entryPrice - t.sl);
    if (!(riskDist > 0)) continue;
    ratios.push(Math.abs(t.tp - t.entryPrice) / riskDist);
  }
  return rollingAverageAtLeast(ratios, num(value, "trades", 1), num(value, "ratio", num(value, "min", 1)));
};

const noRevengeTrade: Evaluator = (trades, _a, value) => {
  const revengeKeys = new Set(tiltSplit(trades).afterLossBigger.map((t) => t.key));
  const closed = closedOf(trades);
  const tradingDays = [...new Set(closed.map((t) => dayKey(t)))].sort();
  const badDays = new Set(closed.filter((t) => revengeKeys.has(t.key)).map((t) => dayKey(t)));
  return tradingDayStreak(tradingDays, (d) => badDays.has(d), num(value, "days", 1));
};

const maxDrawdownBelow: Evaluator = (trades, accounts, value) => {
  const ordered = orderedClosed(trades);
  const windowDays = num(value, "days", 30);
  if (!ordered.length) return valueAtMost(null, num(value, "percent", 15), false);
  const cutoff = addDaysISO(closeKeyOf(ordered[ordered.length - 1]).slice(0, 10), -windowDays + 1);
  const cutIdx = ordered.findIndex((t) => closeKeyOf(t).slice(0, 10) >= cutoff);
  const inWindow = ordered.slice(cutIdx < 0 ? ordered.length : cutIdx);
  const startEquity = baseEquity(accounts) + ordered.slice(0, cutIdx < 0 ? ordered.length : cutIdx).reduce((s, t) => s + (t.pnl as number), 0);
  const dd = drawdownPct(inWindow, startEquity);
  return valueAtMost(dd, num(value, "percent", 15), inWindow.length > 0);
};

const positionSizeRule: Evaluator = (trades, accounts, value, ctx) => {
  const ordered = orderedClosed(trades);
  const eqBefore = equityBeforeEachTrade(ordered, accounts);
  let n = 0;
  ordered.forEach((t, i) => {
    const r = rMultiple(t);
    if (r == null || Math.abs(r) < 1e-9) return;
    const eq = eqBefore[i];
    if (eq > 0 && (Math.abs((t.pnl as number) / r) / eq) * 100 <= ctx.riskPct) n++;
  });
  return milestone(n, num(value, "count", 1));
};

const winStreak: Evaluator = (trades, _a, value) => tradeStreakFromEnd(orderedClosed(trades), (t) => tradeOutcomeOf(t) === "win", num(value, "count", 1));

const equityCurveStability: Evaluator = (trades, _a, value) => {
  const netByWeek = new Map<string, number>();
  for (const t of closedOf(trades)) {
    const week = mondayOfDay(dayKey(t) || closeKeyOf(t).slice(0, 10));
    if (!week) continue;
    netByWeek.set(week, (netByWeek.get(week) ?? 0) + (t.pnl as number));
  }
  return calendarWeekStreak(netByWeek, num(value, "weeks", 1));
};

const tpRespectedRate: Evaluator = (trades, _a, value) => {
  const ordered = orderedClosed(trades);
  const hits: boolean[] = [];
  for (const t of ordered) {
    if (t.tp == null || t.exitPrice == null) continue;
    hits.push(t.side === "long" ? t.exitPrice >= t.tp : t.exitPrice <= t.tp);
  }
  return rollingRateAtLeast(hits, num(value, "trades", 1), num(value, "percent", 100));
};

const maxTradesPerDay: Evaluator = (trades, _a, value) => {
  const counts = new Map(dayList(trades).map((r) => [r.day, r.n]));
  const tradingDays = [...counts.keys()].sort();
  return tradingDayStreak(tradingDays, (d) => (counts.get(d) ?? 0) > num(value, "max", 1e9), num(value, "days", 1));
};

const monthlyProfitTarget: Evaluator = (trades, accounts, value) => {
  const closed = closedOf(trades);
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const before = closed.filter((t) => closeKeyOf(t).slice(0, 7) < month);
  const inMonth = closed.filter((t) => closeKeyOf(t).slice(0, 7) === month);
  const startEquity = baseEquity(accounts) + before.reduce((s, t) => s + (t.pnl as number), 0);
  const net = inMonth.reduce((s, t) => s + (t.pnl as number), 0);
  const achievedPct = startEquity > 0 ? (net / startEquity) * 100 : net > 0 ? 100 : 0;
  return valueAtLeast(achievedPct, num(value, "percent", 5), true);
};

const noRuleBreak: Evaluator = (trades, _a, value, ctx) => {
  const closed = closedOf(trades);
  const tradingDays = [...new Set(closed.map((t) => dayKey(t)))].sort();
  const badDays = new Set(closed.filter((t) => (ctx.answers[t.key]?.b.length ?? 0) > 0).map((t) => dayKey(t)));
  return tradingDayStreak(tradingDays, (d) => badDays.has(d), num(value, "days", 1));
};

const shareStrategy: Evaluator = (_t, _a, value, ctx) => milestone(ctx.manualFlags.share_strategy ?? 0, num(value, "count", 1));

const totalTrades: Evaluator = (trades, _a, value) => milestone(closedOf(trades).length, num(value, "count", 1));

const profitFactorMin: Evaluator = (trades, _a, value) => {
  const n = num(value, "trades", 30);
  const window = orderedClosed(trades).slice(-n);
  const core = tradeCore(window);
  return valueAtLeast(core.pf ?? 0, num(value, "min", num(value, "ratio", 2)), window.length >= n);
};

const rrMinStreak: Evaluator = (trades, _a, value) => {
  const ratio = num(value, "ratio", num(value, "min", 1));
  return tradeStreakFromEnd(orderedClosed(trades), (t) => {
    const r = rMultiple(t);
    return r != null && r >= ratio;
  }, num(value, "count", 1));
};

const recovery: Evaluator = (trades, accounts, value) => {
  const ordered = orderedClosed(trades);
  const threshold = num(value, "percent", 10);
  let eq = baseEquity(accounts), peak = eq, inDrawdown = false, triggerPeak = 0, recovered = false;
  for (const t of ordered) {
    eq += t.pnl as number;
    if (eq >= peak) {
      if (inDrawdown && peak >= triggerPeak) recovered = true;
      peak = eq;
      inDrawdown = false;
    } else if (peak > 0 && ((peak - eq) / peak) * 100 >= threshold) {
      inDrawdown = true;
      triggerPeak = peak;
    }
  }
  return milestone(recovered ? 1 : 0, 1);
};

const pairDiversity: Evaluator = (trades, _a, value) => milestone(new Set(closedOf(trades).map((t) => t.symbol)).size, num(value, "count", 1));

const greenDays: Evaluator = (trades, _a, value) => {
  const goodDays = new Set(dayList(trades).filter((r) => r.net > 0).map((r) => r.day));
  return calendarDayStreak(goodDays, num(value, "days", 1));
};

const zeroLossDay: Evaluator = (trades, _a, value) => {
  const byDay = new Map<string, Trade[]>();
  for (const t of closedOf(trades)) {
    const d = dayKey(t);
    if (!d) continue;
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(t);
  }
  let n = 0;
  for (const list of byDay.values()) if (list.length > 0 && list.every((t) => tradeOutcomeOf(t) !== "loss")) n++;
  return milestone(n, num(value, "count", 1));
};

const RESOLVERS: Record<string, Evaluator> = {
  // Real condition types from the seeded migration.
  login_streak: loginStreak,
  journal_entries: journalEntries,
  max_risk_per_trade: maxRiskPerTrade,
  win_rate_min: winRateMin,
  boss_clear: bossClear,
  trading_days_streak: tradingDaysStreak,
  entry_within_plan: entryWithinPlan,
  sl_set_rate: slSetRate,
  avg_loss_below: avgLossBelow,
  plan_before_entry: planBeforeEntry,
  risk_reward_min: riskRewardMin,
  no_revenge_trade: noRevengeTrade,
  calculator_usage: notTrackedYet,
  max_drawdown_below: maxDrawdownBelow,
  position_size_rule: positionSizeRule,
  win_streak: winStreak,
  no_trade_high_impact_news: notTrackedYet,
  equity_curve_stability: equityCurveStability,
  advisor_usage: notTrackedYet,
  tp_respected_rate: tpRespectedRate,
  max_trades_per_day: maxTradesPerDay,
  monthly_profit_target: monthlyProfitTarget,
  no_rule_break: noRuleBreak,
  share_strategy: shareStrategy,

  // Aliases for the conceptual type names a future design pass may use -- same evaluators, no new code needed.
  streak_login: loginStreak,
  streak_journal: journalStreak,
  total_trades: totalTrades,
  profit_factor_min: profitFactorMin,
  rr_min_streak: rrMinStreak,
  recovery,
  pair_diversity: pairDiversity,
  green_days: greenDays,
  zero_loss_day: zeroLossDay,
  monthly_target: monthlyProfitTarget,
};

/** Pure dispatch, exported for the "seed a brand-new quest row" case and for tests. An unknown condition_type
 *  never auto-completes -- it just reports no progress, so a typo in a future migration fails safe. */
export function evaluateCondition(conditionType: string, conditionValue: Record<string, unknown>, trades: Trade[], accounts: Account[], ctx: EvalContext): ConditionResult {
  const fn = RESOLVERS[conditionType];
  return fn ? fn(trades, accounts, conditionValue, ctx) : { completed: false, currentValue: 0, targetValue: 1, progress: 0 };
}

const emptyCtx = (questStatus: Record<string, GloriaQuestStatus> = {}): EvalContext => ({ answers: {}, riskPct: 1, manualFlags: {}, questStatus });

// ---------------------------------------------------------------------------
// Public engine
// ---------------------------------------------------------------------------

/** One challenge's live progress against real trade data (does not touch the database). */
export async function checkChallengeProgress(userId: string, challengeId: string, trades: Trade[], accounts: Account[]): Promise<ConditionResult> {
  const { data, error } = await supabase.from("gloria_challenges").select("*").eq("id", challengeId).single();
  if (error) throw error;
  const challenge = challengeFromRow(data as GloriaChallengeRow);

  let questStatus: Record<string, GloriaQuestStatus> = {};
  if (challenge.conditionType === "boss_clear") {
    const progress = await getQuestProgress(userId);
    questStatus = Object.fromEntries(progress.map((p) => [p.challengeId, p.status]));
  }
  const ctx: EvalContext = { answers: readAnswers(), riskPct: Number(readSettings().riskPct) || 1, manualFlags: readManualFlags(), questStatus };
  return evaluateCondition(challenge.conditionType, challenge.conditionValue, trades, accounts, ctx);
}

/**
 * First-time setup: makes sure the player stats row exists and every challenge has a quest_progress row -- Zone
 * 1's non-boss challenges "active", everything else "locked". A no-op (returns created: false) once quest rows
 * already exist, so it is safe to call on every app load.
 */
export async function initializePlayerQuests(userId: string): Promise<{ created: boolean }> {
  await getOrCreatePlayerStats(userId);
  const existing = await getQuestProgress(userId);
  if (existing.length) return { created: false };

  const [challenges, zones] = await Promise.all([getChallenges(), getZones()]);
  const firstZone = [...zones].sort((a, b) => a.orderIndex - b.orderIndex)[0];
  if (!firstZone || !challenges.length) return { created: false };

  const now = new Date().toISOString();
  const rows = challenges.map((c) => {
    const active = c.zoneId === firstZone.id && !c.isBossChallenge;
    const seed = evaluateCondition(c.conditionType, c.conditionValue, [], [], emptyCtx());
    return {
      user_id: userId,
      challenge_id: c.id,
      status: (active ? "active" : "locked") as GloriaQuestStatus,
      started_at: active ? now : null,
      completed_at: null,
      current_value: seed.currentValue,
      target_value: seed.targetValue,
      updated_at: now,
    };
  });

  const { error } = await supabase.from("gloria_quest_progress").insert(rows);
  if (error) throw error;
  await supabase.from("gloria_player_stats").update({ current_zone_id: firstZone.id }).eq("user_id", userId);
  return { created: true };
}

/**
 * Unlocks: a zone's boss challenge once every non-boss challenge in that zone is completed, and the next zone's
 * non-boss challenges once that zone's boss is cleared. Reads only quest_progress / challenges / zones -- no
 * trade data needed, since it is purely about what has already been recorded as completed.
 */
export async function unlockNextChallenges(userId: string): Promise<{ unlocked: GloriaChallenge[] }> {
  const [challenges, zones, progress] = await Promise.all([getChallenges(), getZones(), getQuestProgress(userId)]);
  const statusOf = new Map(progress.map((p) => [p.challengeId, p.status]));
  const byZone = new Map<string, GloriaChallenge[]>();
  for (const c of challenges) (byZone.get(c.zoneId) ?? byZone.set(c.zoneId, []).get(c.zoneId)!).push(c);
  const zonesSorted = [...zones].sort((a, b) => a.orderIndex - b.orderIndex);

  const unlocked: GloriaChallenge[] = [];
  const toActivate: string[] = [];
  let nextCurrentZoneId: string | null = null;

  for (const zone of zonesSorted) {
    const inZone = byZone.get(zone.id) ?? [];
    const nonBoss = inZone.filter((c) => !c.isBossChallenge);
    const boss = inZone.find((c) => c.isBossChallenge);
    const nonBossDone = nonBoss.length > 0 && nonBoss.every((c) => statusOf.get(c.id) === "completed");

    if (boss && nonBossDone && statusOf.get(boss.id) === "locked") {
      toActivate.push(boss.id);
      unlocked.push(boss);
    }

    const zoneCleared = boss ? statusOf.get(boss.id) === "completed" : nonBossDone;
    if (zoneCleared) {
      const next = zonesSorted.find((z) => z.orderIndex === zone.orderIndex + 1);
      if (next) {
        const nextNonBoss = (byZone.get(next.id) ?? []).filter((c) => !c.isBossChallenge);
        const newlyUnlocked = nextNonBoss.filter((c) => statusOf.get(c.id) === "locked");
        if (newlyUnlocked.length) {
          toActivate.push(...newlyUnlocked.map((c) => c.id));
          unlocked.push(...newlyUnlocked);
          nextCurrentZoneId = next.id;
        }
      }
    }
  }

  if (toActivate.length) {
    const now = new Date().toISOString();
    await Promise.all(
      toActivate.map((challengeId) =>
        supabase.from("gloria_quest_progress").update({ status: "active", started_at: now, updated_at: now }).eq("user_id", userId).eq("challenge_id", challengeId),
      ),
    );
  }
  if (nextCurrentZoneId) await supabase.from("gloria_player_stats").update({ current_zone_id: nextCurrentZoneId }).eq("user_id", userId);

  return { unlocked };
}

export interface EvaluateAllResult {
  evaluated: number;
  completed: GloriaChallenge[];
  xpAwarded: number;
  unlocked: GloriaChallenge[];
}

const boolNum = (b: boolean | undefined) => (b ? 1 : 0);

/**
 * Checks every active challenge against the given trades/accounts, persists progress, completes and awards XP
 * for anything that newly qualifies, then unlocks whatever that completion opens up -- cascading (a finished
 * zone boss can unlock the next zone's challenges in the same call) up to a small, safely-bounded number of
 * passes. Call this whenever trades change; it is a no-op pass once nothing is left to complete or unlock.
 */
export async function evaluateAllChallenges(userId: string, trades: Trade[], accounts: Account[]): Promise<EvaluateAllResult> {
  await initializePlayerQuests(userId);

  const challenges = await getChallenges();
  const challengesById = new Map(challenges.map((c) => [c.id, c]));
  const ctxBase = { answers: readAnswers(), riskPct: Number(readSettings().riskPct) || 1, manualFlags: readManualFlags() };

  const completed: GloriaChallenge[] = [];
  const unlockedAll: GloriaChallenge[] = [];
  let xpAwarded = 0;
  let evaluated = 0;

  for (let pass = 0; pass < 8; pass++) {
    const progress = await getQuestProgress(userId);
    const questStatus: Record<string, GloriaQuestStatus> = {};
    for (const p of progress) questStatus[p.challengeId] = p.status;

    const active = progress
      .filter((p) => p.status === "active")
      .sort((a, b) => boolNum(challengesById.get(a.challengeId)?.isBossChallenge) - boolNum(challengesById.get(b.challengeId)?.isBossChallenge));
    if (pass === 0) evaluated = active.length;
    if (!active.length) break;

    const updates: { id: string; current_value: number; target_value: number; status?: GloriaQuestStatus; completed_at?: string }[] = [];
    const xpRows: { user_id: string; xp_amount: number; source_type: GloriaXpSourceType; source_id: string }[] = [];
    const passCompleted: GloriaChallenge[] = [];

    for (const p of active) {
      const challenge = challengesById.get(p.challengeId);
      if (!challenge) continue;
      const ctx: EvalContext = { ...ctxBase, questStatus };
      const result = evaluateCondition(challenge.conditionType, challenge.conditionValue, trades, accounts, ctx);
      const justCompleted = result.completed;
      if (justCompleted || result.currentValue !== p.currentValue || result.targetValue !== p.targetValue) {
        updates.push({
          id: p.id,
          current_value: result.currentValue,
          target_value: result.targetValue,
          ...(justCompleted ? { status: "completed" as GloriaQuestStatus, completed_at: new Date().toISOString() } : {}),
        });
      }
      if (justCompleted) {
        passCompleted.push(challenge);
        questStatus[challenge.id] = "completed";
        xpAwarded += challenge.xpReward;
        xpRows.push({ user_id: userId, xp_amount: challenge.xpReward, source_type: challenge.isBossChallenge ? "boss" : "challenge", source_id: challenge.id });
      }
    }

    const now = new Date().toISOString();
    await Promise.all([
      ...updates.map((u) =>
        supabase
          .from("gloria_quest_progress")
          .update({ current_value: u.current_value, target_value: u.target_value, updated_at: now, ...(u.status ? { status: u.status, completed_at: u.completed_at } : {}) })
          .eq("id", u.id),
      ),
      ...(xpRows.length ? [supabase.from("gloria_xp_log").insert(xpRows)] : []),
    ]);

    completed.push(...passCompleted);
    if (!passCompleted.length) break;

    const { unlocked } = await unlockNextChallenges(userId);
    unlockedAll.push(...unlocked);
    if (!unlocked.length) break;
  }

  if (completed.length || unlockedAll.length) await updatePlayerStats(userId, trades, accounts);
  return { evaluated, completed, xpAwarded, unlocked: unlockedAll };
}
