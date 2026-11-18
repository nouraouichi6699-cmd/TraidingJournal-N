// GLORIA_RPG: the single source of truth for WHAT each character requires -- pure, no I/O, no Supabase import, so it
// can be unit-tested under plain Node (src/services/gloriaHero.test.ts).
//
// determineCharacters() (who the analysis picks), the roster's locked-state hints, the per-character progress bars
// and the "why this is your hero" explanation all read the same CHARACTER_PATHS table below. Before this module the
// thresholds were hard-coded inside determineCharacters/scorePositives and could not be shown or measured.
//
// Types are imported type-only from gloriaCharacterService (erased at runtime, so no circular import).
import type { GloriaRadarStats } from "../types/gloria";
import type { GloriaCharacterId, GloriaMonthlyStats } from "./gloriaCharacterService";

// ── Radar / Elf meter (moved here from gloriaCharacterService, which re-exports them) ───────────────────────────

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

// ── Requirements ────────────────────────────────────────────────────────────────────────────────────────────────

/** Which number a criterion reads. A null reading (nothing measured yet) never satisfies a criterion. `radarMin` is the weakest of the 7 radar axes (Elf wants every axis above 70). */
export type CriterionMetric = "trades" | "winRate" | "drawdown" | "rr" | "profitFactor" | "pairs" | "prevLoss" | "radarMin";
/** gt/gte are floors ("more than"), lt/lte are ceilings, between is an inclusive band [value, hi], flag is a yes/no. */
export type CriterionOp = "gt" | "gte" | "lt" | "lte" | "between" | "flag";

export interface Criterion {
  metric: CriterionMetric;
  op: CriterionOp;
  value: number;
  /** Upper bound, `between` only. */
  hi?: number;
}

const c = (metric: CriterionMetric, op: CriterionOp, value: number, hi?: number): Criterion => ({ metric, op, value, hi });

/**
 * A character is reached when ONE of its paths has every criterion met. Most characters have a single path; Rogue
 * has two (a newcomer with 1-4 closed trades, or the break-even band). Every path but the newcomer one also needs
 * 5+ closed trades, because determineCharacters hands anyone under 5 trades the Rogue before looking at anything else.
 *
 * The gates are the ones the design sheet / the old hard-coded determineCharacters used. A null measurement fails
 * its gate. (The old positive-character code read a null drawdown as 0 and so passed "drawdown < N"; but win rate and
 * drawdown are only ever null for a month with no closed trades, which never reaches the gates, so nothing changes.)
 */
export const CHARACTER_PATHS: Record<GloriaCharacterId, Criterion[][]> = {
  elf: [[c("trades", "gte", 5), c("radarMin", "gt", 70), c("winRate", "gt", 60), c("drawdown", "lt", 5), c("rr", "gt", 2.0)]],
  savage: [[c("trades", "gte", 5), c("winRate", "lt", 35), c("drawdown", "gt", 20), c("rr", "lt", 0.5)]],
  rogue: [
    [c("trades", "between", 1, 4)],
    [c("trades", "gte", 5), c("winRate", "between", 40, 50), c("drawdown", "between", 10, 15), c("rr", "between", 0.8, 1.2)],
  ],
  warrior: [[c("trades", "gte", 20), c("winRate", "gt", 50), c("rr", "gt", 1.0), c("drawdown", "lt", 15)]],
  sniper: [[c("trades", "between", 5, 15), c("winRate", "gt", 55), c("rr", "gt", 2.0), c("drawdown", "lt", 10)]],
  tank: [[c("trades", "gte", 5), c("winRate", "gt", 50), c("drawdown", "lt", 5), c("rr", "gt", 1.0)]],
  healer: [[c("trades", "gte", 5), c("prevLoss", "flag", 1), c("winRate", "gt", 55), c("rr", "gt", 1.5)]],
  mage: [[c("trades", "gte", 5), c("profitFactor", "gt", 2.5), c("pairs", "gte", 4), c("winRate", "gt", 50), c("rr", "gt", 2.0)]],
  assassin: [[c("trades", "gte", 5), c("winRate", "gt", 60), c("rr", "gt", 2.5), c("drawdown", "lt", 8)]],
};

/** The 6 characters ranked by score (everything between Rogue and Elf). */
export const POSITIVE_IDS = ["warrior", "sniper", "tank", "healer", "mage", "assassin"] as const;
export type PositiveCharacterId = (typeof POSITIVE_IDS)[number];

/** Savage is the free starter every player owns from the first day; it is never "locked". */
export const STARTER_CHARACTER: GloriaCharacterId = "savage";

export function metricValue(m: CriterionMetric, s: GloriaMonthlyStats, radar: GloriaRadarStats): number | null {
  switch (m) {
    case "trades": return s.totalTrades;
    case "winRate": return s.winRate;
    case "drawdown": return s.maxDrawdown;
    case "profitFactor": return s.profitFactor;
    case "rr": return s.avgRR; // null stays null: no payoff ratio yet means no RR gate can pass
    case "pairs": return s.uniquePairsCount;
    case "prevLoss": return s.previousMonthWasLoss ? 1 : 0;
    case "radarMin": return Math.min(...Object.values(radar));
  }
}

export interface CriterionResult {
  criterion: Criterion;
  current: number | null;
  met: boolean;
  /** 0-1, how close `current` is to satisfying the criterion; always < 1 while not met. */
  progress: number;
}

export function evaluateCriterion(crit: Criterion, s: GloriaMonthlyStats, radar: GloriaRadarStats): CriterionResult {
  const cur = metricValue(crit.metric, s, radar);
  if (cur == null) return { criterion: crit, current: null, met: false, progress: 0 };
  const { op, value, hi } = crit;
  const met =
    op === "gt" ? cur > value
    : op === "gte" ? cur >= value
    : op === "lt" ? cur < value
    : op === "lte" ? cur <= value
    : op === "between" ? cur >= value && cur <= (hi ?? value)
    : cur >= value; // flag
  if (met) return { criterion: crit, current: cur, met, progress: 1 };
  // Not met: the ratio toward the line, capped just under 1 so a value sitting exactly on a strict bound
  // ("> 50" at exactly 50) never reads as done.
  let p: number;
  if (op === "gt" || op === "gte" || op === "flag") p = value > 0 ? cur / value : 0;
  else if (op === "lt" || op === "lte") p = cur > 0 ? value / cur : 0;
  else p = cur < value ? (value > 0 ? cur / value : 0) : (hi ?? value) / cur;
  return { criterion: crit, current: cur, met, progress: Math.max(0, Math.min(0.99, p)) };
}

export interface PathResult {
  results: CriterionResult[];
  met: boolean;
  /** Mean of the criteria's progress, 0-1. */
  progress: number;
}

export interface CharacterProgress {
  id: GloriaCharacterId;
  /** Every path evaluated (usually one). */
  paths: PathResult[];
  /** The path closest to done (the one to show / aim for). */
  best: PathResult;
  /** Some path has every criterion met. */
  qualifies: boolean;
  /** 0-100 for the progress bar. 100 only when `qualifies`. */
  percent: number;
}

export function characterProgress(id: GloriaCharacterId, s: GloriaMonthlyStats, radar: GloriaRadarStats): CharacterProgress {
  const paths: PathResult[] = CHARACTER_PATHS[id].map((path) => {
    const results = path.map((k) => evaluateCriterion(k, s, radar));
    return { results, met: results.every((r) => r.met), progress: results.reduce((a, r) => a + r.progress, 0) / results.length };
  });
  const best = paths.reduce((a, b) => (b.progress > a.progress ? b : a));
  const qualifies = paths.some((p) => p.met);
  return { id, paths, best, qualifies, percent: qualifies ? 100 : Math.min(99, Math.floor(best.progress * 100)) };
}

const qualifiesFor = (id: GloriaCharacterId, s: GloriaMonthlyStats, radar: GloriaRadarStats) =>
  CHARACTER_PATHS[id].some((path) => path.every((k) => evaluateCriterion(k, s, radar).met));

// ── Matching ────────────────────────────────────────────────────────────────────────────────────────────────────

interface PositiveCandidate { id: PositiveCharacterId; qualifies: boolean; score: number }

/**
 * A qualifying character (its hard gates from the design sheet all hold) always outranks a non-qualifying one
 * (the +1000 bonus). Within either group, ties break on a 0-100ish blend of the already-bounded radar axes,
 * so an outlier raw metric (e.g. a profit factor of 20 from one lucky trade) can't swamp the ranking.
 */
function scorePositives(s: GloriaMonthlyStats, radar: GloriaRadarStats): PositiveCandidate[] {
  const pairBonus = Math.min(100, s.uniquePairsCount * 20);
  const fewTradesBonus = Math.max(0, 15 - s.totalTrades) * 2;
  const score: Record<PositiveCharacterId, number> = {
    warrior: radar.speed * 0.4 + radar.precision * 0.3 + radar.defense * 0.3,
    sniper: radar.precision * 0.4 + radar.power * 0.4 + radar.defense * 0.2 + fewTradesBonus,
    tank: radar.defense * 0.6 + radar.precision * 0.4,
    healer: radar.recovery * 0.6 + radar.precision * 0.4,
    mage: radar.intelligence * 0.4 + radar.wisdom * 0.3 + pairBonus * 0.3,
    assassin: radar.speed * 0.3 + radar.precision * 0.4 + radar.power * 0.3,
  };
  return POSITIVE_IDS.map((id) => {
    const q = qualifiesFor(id, s, radar);
    return { id, qualifies: q, score: score[id] + (q ? 1000 : 0) };
  });
}

/** Why the analysis landed on this hero, so the guide can explain it in plain words. */
export type HeroReason =
  | "starter" // no closed trades yet: the free starter
  | "newcomer" // fewer than 5 closed trades: Rogue
  | "elf"
  | "savage"
  | "rogue" // the break-even band
  | "qualified" // a positive character whose gates all hold
  | "closest"; // no positive character qualified, so the best-scoring profile was chosen

export interface CharacterPick {
  primary: GloriaCharacterId;
  secondary: GloriaCharacterId | null;
  reason: HeroReason;
}

/** Pure matching logic: Elf -> Savage -> Rogue -> top 2 of the 6 positive characters. No I/O. */
export function pickCharacter(s: GloriaMonthlyStats, radar: GloriaRadarStats): CharacterPick | null {
  if (s.totalTrades === 0) return null;
  if (s.totalTrades < 5) return { primary: "rogue", secondary: null, reason: "newcomer" };
  if (qualifiesFor("elf", s, radar)) return { primary: "elf", secondary: null, reason: "elf" };
  if (qualifiesFor("savage", s, radar)) return { primary: "savage", secondary: null, reason: "savage" };
  if (qualifiesFor("rogue", s, radar)) return { primary: "rogue", secondary: null, reason: "rogue" };
  const ranked = scorePositives(s, radar).sort((a, b) => b.score - a.score);
  return { primary: ranked[0].id, secondary: ranked[1].id, reason: ranked[0].qualifies ? "qualified" : "closest" };
}

/** Same pick without the reason. `elfMeter` is accepted for call-site compatibility; the Elf gate reads the radar itself. */
export function determineCharacters(s: GloriaMonthlyStats, radar: GloriaRadarStats, _elfMeter?: number): { primary: GloriaCharacterId; secondary: GloriaCharacterId | null } | null {
  const p = pickCharacter(s, radar);
  return p ? { primary: p.primary, secondary: p.secondary } : null;
}
