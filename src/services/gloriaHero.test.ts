// Run: npx tsx src/services/gloriaHero.test.ts
// Checks the pure parts of the scheduled-hero system (no Supabase, no DOM):
//  1. gloriaHeroSchedule: weekly (Saturday 00:00 UTC) / monthly / initial due-checks and the next-date helpers.
//  2. gloriaCharacterRules: the refactored pickCharacter/determineCharacters behaves exactly like the original
//     hard-coded implementation (kept below as legacyDetermine) over a large randomized sweep -- the refactor moved
//     the thresholds into a data table, and this guards against any drift.
//  3. characterProgress: 100% only when a path is fully met, always < 100 otherwise, monotone toward the target.
import assert from "node:assert/strict";
import type { GloriaRadarStats } from "../types/gloria";
import type { GloriaCharacterId, GloriaMonthlyStats } from "./gloriaCharacterService";
import { calculateElfMeter, calculateRadarStats, characterProgress, determineCharacters, pickCharacter, CHARACTER_PATHS } from "./gloriaCharacterRules";
import { dueUpdate, nextMonthStart, nextSaturdayAfter, nextUpdateAt, nextWeeklyAt } from "./gloriaHeroSchedule";

let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; assert.ok(cond, msg); };
const eq = <T,>(a: T, b: T, msg: string) => { checks++; assert.deepEqual(a, b, msg); };

// -- 1. schedule ------------------------------------------------------------------------------------------------
const at = (s: string) => new Date(s);
eq(dueUpdate(null, at("2026-11-18T10:00:00Z")), "initial", "no stored update -> initial");
eq(dueUpdate("garbage", at("2026-11-18T10:00:00Z")), "initial", "unparseable stored time -> initial");
eq(dueUpdate("2026-11-18T10:00:00Z", at("2026-11-18T10:00:00Z")), null, "same instant -> not due");
// 2026-11-18 is a Wednesday; the next Saturday 00:00 UTC is 2026-11-21
eq(dueUpdate("2026-11-18T10:00:00Z", at("2026-11-20T23:59:59Z")), null, "Wed check, still Friday -> not due");
eq(dueUpdate("2026-11-18T10:00:00Z", at("2026-11-21T00:00:00Z")), "weekly", "Wed check, Saturday 00:00 UTC -> weekly");
eq(dueUpdate("2026-11-18T10:00:00Z", at("2026-11-25T10:00:00Z")), "weekly", "Wed check, a full week later (past Saturday) -> weekly");
eq(dueUpdate("2026-11-20T23:00:00Z", at("2026-11-21T00:30:00Z")), "weekly", "Friday-night check, 90 minutes later but across Saturday -> weekly");
eq(dueUpdate("2026-11-14T10:00:00Z", at("2026-11-20T23:00:00Z")), null, "Saturday check: next boundary is the FOLLOWING Saturday, 6 days is not enough");
eq(dueUpdate("2026-11-14T10:00:00Z", at("2026-11-21T00:00:00Z")), "weekly", "Saturday check -> due the next Saturday");
eq(dueUpdate("2026-11-15T10:00:00Z", at("2026-11-20T10:00:00Z")), null, "Sunday check, Friday of the same week -> not due");
eq(dueUpdate("2026-11-15T10:00:00Z", at("2026-11-21T00:00:00Z")), "weekly", "Sunday check -> due that Saturday (6 days, not 7)");
eq(dueUpdate("2026-11-10T10:00:00Z", at("2026-11-29T10:00:00Z")), "weekly", "long gap in one month -> weekly");
eq(dueUpdate("2026-11-30T23:00:00Z", at("2026-12-01T00:30:00Z")), "monthly", "crossing a month boundary after 90 minutes -> monthly");
eq(dueUpdate("2026-11-25T10:00:00Z", at("2026-12-04T10:00:00Z")), "monthly", "both weekly and monthly due -> monthly wins");
eq(dueUpdate("2025-12-31T10:00:00Z", at("2026-12-31T10:00:00Z")), "monthly", "same month number, different year -> monthly");
eq(dueUpdate("2026-11-20T10:00:00Z", at("2026-11-18T10:00:00Z")), null, "stored time in the future (clock skew) -> not due");
eq(nextSaturdayAfter(at("2026-11-18T10:00:00Z")).toISOString(), "2026-11-21T00:00:00.000Z", "Wednesday -> that Saturday");
eq(nextSaturdayAfter(at("2026-11-21T00:00:00Z")).toISOString(), "2026-11-28T00:00:00.000Z", "exactly Saturday 00:00 -> the following one");
eq(nextSaturdayAfter(at("2026-11-20T23:59:59Z")).toISOString(), "2026-11-21T00:00:00.000Z", "Friday 23:59:59 -> next second's Saturday");
eq(nextSaturdayAfter(at("2026-11-22T12:00:00Z")).toISOString(), "2026-11-28T00:00:00.000Z", "Sunday -> next Saturday");
eq(nextSaturdayAfter(at("2026-12-30T12:00:00Z")).toISOString(), "2027-01-02T00:00:00.000Z", "rolls the year");
for (let d = 0; d < 7; d++) {
  const day = at(`2026-11-${15 + d}T08:00:00Z`);
  ok(nextSaturdayAfter(day).getUTCDay() === 6 && nextSaturdayAfter(day).getUTCHours() === 0, `every weekday lands on a Saturday midnight (from ${day.toISOString()})`);
}
eq(nextWeeklyAt("2026-11-18T10:00:00Z", at("2026-11-19T00:00:00Z")).toISOString(), "2026-11-21T00:00:00.000Z", "next weekly = upcoming Saturday, not +7 days");
eq(nextWeeklyAt(null, at("2026-11-18T10:00:00Z")).toISOString(), "2026-11-21T00:00:00.000Z", "no update yet -> upcoming Saturday");
eq(nextWeeklyAt("2026-11-01T10:00:00Z", at("2026-11-18T10:00:00Z")).toISOString(), "2026-11-21T00:00:00.000Z", "stale stored time never shows a past date");
eq(nextMonthStart(at("2026-11-18T10:00:00Z")).toISOString(), "2026-12-01T00:00:00.000Z", "next month start");
eq(nextMonthStart(at("2026-12-31T23:59:59Z")).toISOString(), "2027-01-01T00:00:00.000Z", "next month start rolls the year");
eq(nextUpdateAt("2026-11-18T10:00:00Z", at("2026-11-19T00:00:00Z")).toISOString(), "2026-11-21T00:00:00.000Z", "Saturday comes first");
eq(nextUpdateAt("2026-11-29T10:00:00Z", at("2026-11-29T12:00:00Z")).toISOString(), "2026-12-01T00:00:00.000Z", "month start comes first (Dec 1 is before Saturday Dec 5)");
eq(nextUpdateAt("2026-11-26T10:00:00Z", at("2026-11-27T00:00:00Z")).toISOString(), "2026-11-28T00:00:00.000Z", "Saturday Nov 28 comes before Dec 1");

// -- 2. legacy equivalence --------------------------------------------------------------------------------------
// Verbatim copy of determineCharacters + scorePositives as they were before the rules table existed.
function legacyDetermine(s: GloriaMonthlyStats, radar: GloriaRadarStats) {
  if (s.totalTrades === 0) return null;
  if (s.totalTrades < 5) return { primary: "rogue" as GloriaCharacterId, secondary: null };
  const allAbove70 = Object.values(radar).every((v) => v > 70);
  if (allAbove70 && s.winRate != null && s.winRate > 60 && s.maxDrawdown != null && s.maxDrawdown < 5 && s.avgRR != null && s.avgRR > 2.0) return { primary: "elf" as GloriaCharacterId, secondary: null };
  if (s.winRate != null && s.winRate < 35 && s.maxDrawdown != null && s.maxDrawdown > 20 && s.avgRR != null && s.avgRR < 0.5) return { primary: "savage" as GloriaCharacterId, secondary: null };
  if (s.winRate != null && s.winRate >= 40 && s.winRate <= 50 && s.maxDrawdown != null && s.maxDrawdown >= 10 && s.maxDrawdown <= 15 && s.avgRR != null && s.avgRR >= 0.8 && s.avgRR <= 1.2) return { primary: "rogue" as GloriaCharacterId, secondary: null };
  const wr = s.winRate ?? 0, dd = s.maxDrawdown ?? 0, rr = s.avgRR ?? 0, pf = s.profitFactor ?? 0;
  const hasRR = s.avgRR != null;
  const pairBonus = Math.min(100, s.uniquePairsCount * 20);
  const fewTradesBonus = Math.max(0, 15 - s.totalTrades) * 2;
  const base = [
    { id: "warrior", qualifies: s.totalTrades >= 20 && wr > 50 && hasRR && rr > 1.0 && dd < 15, score: radar.speed * 0.4 + radar.precision * 0.3 + radar.defense * 0.3 },
    { id: "sniper", qualifies: s.totalTrades <= 15 && wr > 55 && hasRR && rr > 2.0 && dd < 10, score: radar.precision * 0.4 + radar.power * 0.4 + radar.defense * 0.2 + fewTradesBonus },
    { id: "tank", qualifies: wr > 50 && dd < 5 && hasRR && rr > 1.0, score: radar.defense * 0.6 + radar.precision * 0.4 },
    { id: "healer", qualifies: s.previousMonthWasLoss && wr > 55 && hasRR && rr > 1.5, score: radar.recovery * 0.6 + radar.precision * 0.4 },
    { id: "mage", qualifies: pf > 2.5 && s.uniquePairsCount >= 4 && wr > 50 && hasRR && rr > 2.0, score: radar.intelligence * 0.4 + radar.wisdom * 0.3 + pairBonus * 0.3 },
    { id: "assassin", qualifies: wr > 60 && hasRR && rr > 2.5 && dd < 8, score: radar.speed * 0.3 + radar.precision * 0.4 + radar.power * 0.3 },
  ].map((c) => ({ ...c, score: c.score + (c.qualifies ? 1000 : 0) }));
  const ranked = base.sort((a, b) => b.score - a.score);
  return { primary: ranked[0].id as GloriaCharacterId, secondary: ranked[1].id as GloriaCharacterId };
}

// deterministic PRNG so a failure is reproducible
let seed = 20261118;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
// bias toward the exact threshold values, where an off-by-one (> vs >=) would show
const near = (vals: number[], lo: number, hi: number) => (rnd() < 0.5 ? pick(vals) : lo + rnd() * (hi - lo));

const counts: Partial<Record<GloriaCharacterId, number>> = {};
for (let i = 0; i < 60000; i++) {
  const totalTrades = rnd() < 0.5 ? pick([0, 1, 4, 5, 6, 14, 15, 16, 19, 20, 21]) : Math.floor(rnd() * 45);
  // win rate / drawdown are only ever null for a month with no closed trades (see the rules header); avgRR and
  // profit factor can be null with trades (no wins or no losses yet)
  const s: GloriaMonthlyStats = {
    month: "2026-11",
    totalTrades,
    winRate: totalTrades === 0 ? null : near([34.9, 35, 40, 50, 50.01, 55, 60, 60.01], 0, 100),
    maxDrawdown: totalTrades === 0 ? null : near([4.99, 5, 7.99, 8, 9.99, 10, 14.99, 15, 20, 20.01], 0, 40),
    avgRR: rnd() < 0.1 ? null : near([0.49, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 2.01, 2.5, 2.51], 0, 4),
    profitFactor: rnd() < 0.05 ? null : near([2.5, 2.51], 0, 6),
    uniquePairsCount: Math.floor(rnd() * 8),
    hadRevengeTrades: rnd() < 0.5,
    followedPlanRate: rnd() < 0.5 ? null : rnd() * 100,
    previousMonthWasLoss: rnd() < 0.4,
    netPnl: (rnd() - 0.4) * 1000,
  };
  const radar = calculateRadarStats(s);
  const expected = legacyDetermine(s, radar);
  const got = determineCharacters(s, radar, calculateElfMeter(radar));
  checks++;
  assert.deepEqual(got, expected, `determineCharacters drifted from the original at i=${i}: ${JSON.stringify({ s, radar })}`);
  if (got) counts[got.primary] = (counts[got.primary] ?? 0) + 1;
}
// every character is actually reachable in the sweep (otherwise the sweep would prove little)
for (const id of Object.keys(CHARACTER_PATHS) as GloriaCharacterId[]) ok((counts[id] ?? 0) > 0, `sweep reaches ${id}: ${JSON.stringify(counts)}`);

// -- 3. progress ------------------------------------------------------------------------------------------------
const base: GloriaMonthlyStats = { month: "2026-11", totalTrades: 12, winRate: 62, maxDrawdown: 4, avgRR: 2.2, profitFactor: 2.8, uniquePairsCount: 3, hadRevengeTrades: false, followedPlanRate: 80, previousMonthWasLoss: false, netPnl: 500 };
const r0 = calculateRadarStats(base);
const sniper = characterProgress("sniper", base, r0);
ok(sniper.qualifies && sniper.percent === 100, "sniper profile -> 100%");

const weak = { ...base, winRate: 30, maxDrawdown: 25, avgRR: 0.3 };
const p = characterProgress("tank", weak, calculateRadarStats(weak));
ok(!p.qualifies && p.percent < 100, "tank not reached with a weak month, percent < 100");
const better = { ...weak, winRate: 45 };
ok(characterProgress("tank", better, calculateRadarStats(better)).best.progress > p.best.progress, "improving win rate raises tank progress");
const noRR = { ...base, avgRR: null };
ok(characterProgress("sniper", noRR, calculateRadarStats(noRR)).best.results.find((r) => r.criterion.metric === "rr")?.progress === 0, "no payoff ratio yet -> RR criterion at 0");
ok(characterProgress("warrior", { ...base, totalTrades: 25, winRate: 50 }, r0).percent < 100, "a strict bound exactly on the line is not 100%");
// rogue has two paths: 3 trades satisfies the newcomer path
const few = { ...base, totalTrades: 3 };
ok(characterProgress("rogue", few, calculateRadarStats(few)).qualifies, "rogue newcomer path (1-4 trades) qualifies");
ok(pickCharacter(few, calculateRadarStats(few))?.reason === "newcomer", "reason: newcomer");
ok(pickCharacter({ ...base, totalTrades: 0 }, r0) === null, "no trades -> no pick (the service falls back to the starter)");

console.log(`gloriaHero.test: ${checks} checks passed`);
