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
// Copy of determineCharacters + scorePositives as they were before the rules table existed (same structure and
// tie-break maths), with the avgRR thresholds re-tuned from the old payoff-ratio scale to average R per trade.
function legacyDetermine(s: GloriaMonthlyStats, radar: GloriaRadarStats) {
  if (s.totalTrades === 0) return null;
  if (s.totalTrades < 5) return { primary: "rogue" as GloriaCharacterId, secondary: null };
  const allAbove70 = Object.values(radar).every((v) => v > 70);
  if (allAbove70 && s.winRate != null && s.winRate > 60 && s.maxDrawdown != null && s.maxDrawdown < 5 && s.avgRR != null && s.avgRR > 0.7) return { primary: "elf" as GloriaCharacterId, secondary: null };
  if (s.winRate != null && s.winRate < 35 && s.maxDrawdown != null && s.maxDrawdown > 20 && s.avgRR != null && s.avgRR < -0.2) return { primary: "savage" as GloriaCharacterId, secondary: null };
  if (s.winRate != null && s.winRate >= 40 && s.winRate <= 50 && s.maxDrawdown != null && s.maxDrawdown >= 10 && s.maxDrawdown <= 15 && s.avgRR != null && s.avgRR >= -0.15 && s.avgRR <= 0.15) return { primary: "rogue" as GloriaCharacterId, secondary: null };
  const wr = s.winRate ?? 0, dd = s.maxDrawdown ?? 0, rr = s.avgRR ?? 0, pf = s.profitFactor ?? 0;
  const hasRR = s.avgRR != null;
  const pairBonus = Math.min(100, s.uniquePairsCount * 20);
  const fewTradesBonus = Math.max(0, 15 - s.totalTrades) * 2;
  const base = [
    { id: "warrior", qualifies: s.totalTrades >= 20 && wr > 50 && hasRR && rr > 0.1 && dd < 15, score: radar.speed * 0.4 + radar.precision * 0.3 + radar.defense * 0.3 },
    { id: "sniper", qualifies: s.totalTrades <= 15 && wr > 55 && hasRR && rr > 0.4 && dd < 10, score: radar.precision * 0.4 + radar.power * 0.4 + radar.defense * 0.2 + fewTradesBonus },
    { id: "tank", qualifies: wr > 50 && dd < 5 && hasRR && rr > 0.1, score: radar.defense * 0.6 + radar.precision * 0.4 },
    { id: "healer", qualifies: s.previousMonthWasLoss && wr > 55 && hasRR && rr > 0.2, score: radar.recovery * 0.6 + radar.precision * 0.4 },
    { id: "mage", qualifies: pf > 2.5 && s.uniquePairsCount >= 4 && wr > 50 && hasRR && rr > 0.3, score: radar.intelligence * 0.4 + radar.wisdom * 0.3 + pairBonus * 0.3 },
    { id: "assassin", qualifies: wr > 60 && hasRR && rr > 0.5 && dd < 8, score: radar.speed * 0.3 + radar.precision * 0.4 + radar.power * 0.3 },
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
    avgRR: rnd() < 0.1 ? null : near([-0.21, -0.2, -0.15, 0, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.51, 0.7, 0.71], -1, 1.2),
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
const base: GloriaMonthlyStats = { month: "2026-11", totalTrades: 12, winRate: 62, maxDrawdown: 4, avgRR: 0.55, profitFactor: 2.8, uniquePairsCount: 3, hadRevengeTrades: false, followedPlanRate: 80, previousMonthWasLoss: false, netPnl: 500 };
const r0 = calculateRadarStats(base);
const sniper = characterProgress("sniper", base, r0);
ok(sniper.qualifies && sniper.percent === 100, "sniper profile -> 100%");

const weak = { ...base, winRate: 30, maxDrawdown: 25, avgRR: -0.4 };
const p = characterProgress("tank", weak, calculateRadarStats(weak));
ok(!p.qualifies && p.percent < 100, "tank not reached with a weak month, percent < 100");
const better = { ...weak, winRate: 45 };
ok(characterProgress("tank", better, calculateRadarStats(better)).best.progress > p.best.progress, "improving win rate raises tank progress");
const noRR = { ...base, avgRR: null };
ok(characterProgress("sniper", noRR, calculateRadarStats(noRR)).best.results.find((r) => r.criterion.metric === "rr")?.progress === 0, "no average R yet (no stop-losses) -> RR criterion at 0");
ok(characterProgress("warrior", { ...base, totalTrades: 25, winRate: 50 }, r0).percent < 100, "a strict bound exactly on the line is not 100%");
// rogue has two paths: 3 trades satisfies the newcomer path
const few = { ...base, totalTrades: 3 };
ok(characterProgress("rogue", few, calculateRadarStats(few)).qualifies, "rogue newcomer path (1-4 trades) qualifies");
ok(pickCharacter(few, calculateRadarStats(few))?.reason === "newcomer", "reason: newcomer");
ok(pickCharacter({ ...base, totalTrades: 0 }, r0) === null, "no trades -> no pick (the service falls back to the starter)");

// signed progress for average R: a losing month climbs from -1R toward a gate, monotonically, and stays < 1 until met
{
  const prog = (avgRR: number) => characterProgress("warrior", { ...base, totalTrades: 25, winRate: 60, maxDrawdown: 4, avgRR }, calculateRadarStats({ ...base, avgRR })).best.results.find((r) => r.criterion.metric === "rr")!;
  const [a, b, c2, d] = [-0.8, -0.3, 0.05, 0.1].map(prog);
  ok(a.progress < b.progress && b.progress < c2.progress, "average-R progress rises as the month improves, through negative values");
  ok(!d.met && d.progress < 1, "avgR exactly on a strict '> 0.1' gate is not met");
  ok(prog(0.11).met, "just above the gate is met");
  ok(prog(-5).progress === 0, "a disastrous month reads 0 progress, never negative");
  const ceil = (avgRR: number) => characterProgress("savage", { ...base, totalTrades: 25, winRate: 30, maxDrawdown: 25, avgRR }, calculateRadarStats({ ...base, avgRR })).best.results.find((r) => r.criterion.metric === "rr")!;
  ok(ceil(-0.5).met && !ceil(-0.1).met && ceil(0.4).progress < ceil(-0.1).progress, "savage 'avgR < -0.2' ceiling: closer as the month worsens");
}

// calculateMonthlyStats: avgRR is the PRECISE mean R over closed trades with a valid R, outliers (R outside -3..10) left
// out, and null until 10 such trades exist
{
  const { calculateMonthlyStats } = await import("./gloriaCharacterService");
  let n = 0;
  // long trade entering at 100 with the stop at 99 (risk 1): exit price == entry + R
  const tr = (r: number, day = 10): import("../types").Trade => ({
    key: `k${n++}`, accountId: "a", no: n, symbol: "EURUSD", side: "long", qty: 1,
    entryTime: `2026-11-${String(day).padStart(2, "0")}T08:00:00Z`, entryPrice: 100,
    exitTime: `2026-11-${String(day).padStart(2, "0")}T09:00:00Z`, exitPrice: 100 + r,
    pnl: r * 10, returnPct: null, commission: 0, sl: 99, status: "closed",
  });
  const near2 = (x: number | null, y: number, msg = "") => ok(x != null && Math.abs(x - y) < 1e-9, `avgRR ${x} should be ${y} ${msg}`);
  const ten = (r: number) => Array.from({ length: 10 }, () => tr(r));
  near2(calculateMonthlyStats(ten(0.4), "2026-11").avgRR, 0.4, "(10 trades: precise, not rounded)");
  ok(calculateMonthlyStats(ten(0.4).slice(0, 9), "2026-11").avgRR === null, "9 valid trades -> null (not enough data)");
  // wins and losses pooled; precise mean kept unrounded
  near2(calculateMonthlyStats([...Array.from({ length: 6 }, () => tr(1.5)), ...Array.from({ length: 4 }, () => tr(-1))], "2026-11").avgRR, (9 - 4) / 10);
  // an outlier is excluded from the mean (and from the count of 10), not just damped
  const withOutlier = [...ten(1), tr(40)];
  near2(calculateMonthlyStats(withOutlier, "2026-11").avgRR, 1, "(+40R outlier ignored)");
  const st = calculateMonthlyStats(withOutlier, "2026-11");
  ok(st.rTradesUsed === 10 && st.rTradesFlagged === 1, "stats report used/flagged counts");
  ok(calculateMonthlyStats([...ten(1).slice(0, 9), tr(40)], "2026-11").avgRR === null, "9 valid + 1 outlier -> still not enough");
  near2(calculateMonthlyStats([...ten(1), tr(-4)], "2026-11").avgRR, 1, "(-4R is below -3: outlier)");
  near2(calculateMonthlyStats([...ten(1).slice(0, 9), tr(10), tr(-3)], "2026-11").avgRR, (9 + 10 - 3) / 11, "(exactly 10R and -3R are kept: bounds are inclusive)");
  ok(calculateMonthlyStats([...ten(1)].map((t) => ({ ...t, sl: null })), "2026-11").avgRR === null, "no stop-losses -> null");
  ok(calculateMonthlyStats(ten(1), "2026-10").avgRR === null, "other month's trades are not pooled in");
}

// shared R helpers (lib/tradeLab): Total R is a SUM over every trade; Avg is the outlier-filtered MEAN shown as the
// nearest clean "1:X" step; one colour rule
{
  const { OUTLIER_R_MAX, OUTLIER_R_MIN, MIN_R_TRADES, R_STEPS, avgRText, formatAvgRRatio, fmtTotalR, ratioTone, roundToNearestRatioStep, rStats, rTone, rValues } = await import("../lib/tradeLab");
  ok(OUTLIER_R_MAX === 10 && OUTLIER_R_MIN === -3 && MIN_R_TRADES === 10 && R_STEPS.join() === "0.5,1,1.5,2,2.5,3,4,5,7,10", "constants as specified");
  // rounding to the nearest step
  eq([2.2, 1.4, 1.8, 2.8, 3.4, 3.6, 6, 8.6, 9.9].map(roundToNearestRatioStep), [2, 1.5, 2, 3, 3, 4, 5, 10, 10], "nearest step, positives");
  eq([-0.8, -1.4, -2.2, -0.6].map(roundToNearestRatioStep), [-1, -1.5, -2, -0.5], "negatives mirror the positives");
  eq([0.26, 0.74].map(roundToNearestRatioStep), [0.5, 0.5], "just past the half-step of 0.5 rounds up to it; 0.74 is still nearer 0.5 than 1");
  eq([0, 0.05, 0.24, -0.1].map(roundToNearestRatioStep), [0, 0, 0, 0], "under 0.25 reads 0 (deliberate: never overstate a break-even edge as 1:0.5)");
  eq(formatAvgRRatio(2.2), "1:2", "2.2 -> 1:2");
  eq(formatAvgRRatio(1.4), "1:1.5", "1.4 -> 1:1.5");
  eq(formatAvgRRatio(-0.8), "1:1 (loss)", "-0.8 -> 1:1 (loss)");
  eq(formatAvgRRatio(0.04), "1:0", "break-even -> 1:0");
  eq(formatAvgRRatio(-0.04), "1:0", "tiny negative -> 1:0, no (loss)");
  eq(formatAvgRRatio(-2.2, "خسارة"), "1:2 (خسارة)", "loss word is localisable");
  eq(avgRText(null, "en"), "Not enough data yet", "null -> not enough data");
  eq(avgRText(1.4, "fr"), "1:1.5", "rounded ratio");
  eq(fmtTotalR(24), "+24.00R", "positive total"); eq(fmtTotalR(-3.5), "-3.50R", "negative total"); eq(fmtTotalR(0), "0.00R", "zero total");
  eq([ratioTone(2.2), ratioTone(-0.8), ratioTone(0.1), ratioTone(null)], ["pos", "neg", "zero", "zero"], "ratio colour follows the DISPLAYED step (1:0 is neutral)");
  eq([rTone(1.2), rTone(-0.8), rTone(0), rTone(0.04, 2)], ["pos", "neg", "zero", "pos"], "total colour by sign");

  let n = 0;
  const mk = (r: number, sl: number | null = 99, day = "2026-11-10"): import("../types").Trade => ({ key: "t" + n++, accountId: "a", no: n, symbol: "GBPUSD", side: "long", qty: 1, entryTime: `${day}T08:00:00Z`, entryPrice: 100, exitTime: `${day}T09:00:00Z`, exitPrice: 100 + r, pnl: r, returnPct: null, commission: 0, sl, status: "closed" });
  const base10 = Array.from({ length: 10 }, (_, i) => mk(i % 2 ? 2.4 : 1.6)); // mean exactly 2
  const clean = rStats(base10);
  ok(clean.enough && clean.avg === 2 && clean.ratioText === "1:2" && clean.usedN === 10 && clean.flagged.length === 0 && clean.totalText === "+20.00R", "10 clean trades: avg 2 -> 1:2, total +20.00R");
  // an outlier: excluded from Avg, flagged with id/date/symbol/R, but STILL in Total R
  const dirty = rStats([...base10, mk(25, 99, "2026-11-12"), mk(-8, 99, "2026-11-13")]);
  ok(dirty.avg === 2 && dirty.ratioText === "1:2" && dirty.usedN === 10 && dirty.validN === 12, "outliers do not move the average");
  ok(Math.abs(dirty.total - (20 + 25 - 8)) < 1e-9 && dirty.totalText === "+37.00R", "Total R keeps the outliers");
  eq(dirty.flagged.map((f) => [f.date, f.symbol, f.r]), [["2026-11-12", "GBPUSD", 25], ["2026-11-13", "GBPUSD", -8]], "flagged list: date, symbol and R value");
  ok(dirty.flagged.every((f) => typeof f.key === "string" && typeof f.no === "number"), "flagged trades carry id (key/no)");
  // under 10 valid trades: no average, text says so; total still shows
  const few = rStats(base10.slice(0, 9));
  ok(!few.enough && few.avg === null && few.ratioText === "Not enough data yet" && Math.abs((few.avgAny as number) - 17.6 / 9) < 1e-9 && few.totalText === "+17.60R", "9 trades: Not enough data yet, precise value kept for the tooltip");
  ok(rStats([...base10.slice(0, 9), mk(30)]).avg === null, "9 + one outlier: still not enough");
  ok(rStats([mk(1, null)]).validN === 0 && rValues([mk(1, null)]).length === 0, "no stop-loss -> no R");
  // thresholds use the precise value, not the display step
  const sig = rStats(Array.from({ length: 10 }, () => mk(0.28)));
  ok(Math.abs((sig.avg as number) - 0.28) < 1e-9 && sig.ratioText === "1:0.5", "precise 0.28 stays 0.28 for gates while it DISPLAYS 1:0.5");
}

console.log(`gloriaHero.test: ${checks} checks passed`);
