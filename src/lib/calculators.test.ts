import {
  atrSize, avgReturn, CALC_GROUPS, CALC_JOURNAL, CALC_KEYS, CALC_READY, challengePlan, challengeRulesPct, compound, isCalcKey, likelyLongestRun,
  longestRunAtMost, longestRunDist, lotsFor, lotsFromBalanceRule, marginFor, matchesQuery, moneyFor, needsRate, parseNum, pipValue, pnlByMonth, positionSize,
  profitLoss, pushRecentCalc, quoteToAccountRate, rateKey, readableTone, riskReward, symbolSpec, tradeEdge,
  defaultPipSize, needsPrice, pipSizeFor, pipsToDistance, profitLossPips, riskRewardPips,
  convertFx, effectiveFx, fxStatus, mergeFx, parseCoingeckoBtc, parseErApiUsd, parseFrankfurterUsd, percentCalc, STD_START, stdKeyFromEvent, stdPress,
  avgCommissionPerLot, convertUnits, swapCost, tradeCost,
  addRiskPreset, antiMartingaleRisk, currentLossStreak, deleteRiskPreset, parseRiskPresets, readRiskPresets, riskRuleResult, RISK_BUILTINS, RISK_PRESET_CAP, RISK_PRESETS_KEY,
  sizeStatePatch, SIZE_STATE_KEY, updateRiskPreset, validRiskRule, writeRiskPresets, writeSizeState, type CustomRiskPreset, type RiskRule,
  type FxStore, type StdKey, type StdState,
} from "./calculators";
import { BALANCE_PRESETS, balancePresetOf } from "./calcCore";
import { calcExample, EX, type Fv } from "./calcExamples";
import { HOW } from "../components/calculators/text";
import { contrastRatio } from "./lighting";
import type { Challenge } from "./challenge";
import type { Trade } from "../types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${info}`}`); };
const eq = (name: string, got: unknown, exp: unknown) => ok(name, JSON.stringify(got) === JSON.stringify(exp), `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`);
const near = (name: string, got: number, exp: number, tol = 0.01) => ok(name, Number.isFinite(got) && Math.abs(got - exp) <= tol, `got ${got}, expected ${exp}`);
const nan = (name: string, got: number) => ok(name, Number.isNaN(got), `got ${got}, expected NaN`);

console.log("-- catalogue");
eq("23 calculators", CALC_KEYS.length, 23);
eq("5 groups of 9, 5, 4, 2, 3", CALC_GROUPS.map((g) => g.items.length), [9, 5, 4, 2, 3]);
eq("group colours", CALC_GROUPS.map((g) => g.color), ["#22c55e", "#ef4444", "#d946ef", "#f97316", "#94a3b8"]);
eq("all 23 calculators ready", [...CALC_READY].sort(), [...CALC_KEYS].sort());
eq("journal-filled", [...CALC_JOURNAL].sort(), ["atr", "comp", "cost", "dd", "exp", "kelly", "mc", "port", "prop", "riskmgmt", "ruin", "size", "streak"]);
eq("isCalcKey", [isCalcKey("prop"), isCalcKey("nope"), isCalcKey(3)], [true, false, false]);

console.log("-- search and recent");
ok("name prefix", matchesQuery("pos", "Position size", "lots from your risk and stop"));
ok("empty query matches", matchesQuery("  ", "anything"));
ok("words across name and description", matchesQuery("size lots", "Position size", "lots from your risk and stop"));
ok("no match", !matchesQuery("xyz", "Position size", "lots"));
ok("case and accents ignored (FR)", matchesQuery("REUSSITE", "Taux de réussite requis"));
ok("Arabic marks ignored", matchesQuery("الربح", "الرِّبح والخسارة"));
eq("recent: new one first, kept to 3", pushRecentCalc(["prop", "size", "rr"], "pip"), ["pip", "prop", "size"]);
eq("recent: an old one moves to the front", pushRecentCalc(["prop", "size", "rr"], "size"), ["size", "prop", "rr"]);
eq("recent: garbage stored", pushRecentCalc("bad", "rr"), ["rr"]);
eq("recent: unknown keys dropped", pushRecentCalc(["x", "prop"], "rr"), ["rr", "prop"]);

console.log("-- symbolSpec");
eq("EURUSD", symbolSpec("EURUSD"), { base: "EUR", quote: "USD", contract: 100000, pip: 0.0001 });
eq("USDJPY pip 0.01", symbolSpec("usdjpy").pip, 0.01);
eq("broker suffix", symbolSpec("GBPJPY.m"), { base: "GBP", quote: "JPY", contract: 100000, pip: 0.01 });
eq("gold 100 oz", symbolSpec("XAUUSD"), { base: "XAU", quote: "USD", contract: 100, pip: null });
eq("silver 5000 oz", symbolSpec("XAGUSD").contract, 5000);
eq("unknown symbol", symbolSpec("NAS100"), { base: "", quote: "", contract: null, pip: null });
eq("empty symbol", symbolSpec(""), { base: "", quote: "", contract: null, pip: null });

console.log("-- parseNum");
eq("comma decimal", parseNum("1,5"), 1.5);
eq("dot decimal with spaces", parseNum(" 2.25 "), 2.25);
nan("empty", parseNum(""));
nan("letters", parseNum("abc"));
eq("negative", parseNum("-3"), -3);

console.log("-- quote to account rate");
const EU = symbolSpec("EURUSD"), UJ = symbolSpec("USDJPY"), EJ = symbolSpec("EURJPY"), GJ = symbolSpec("GBPJPY"), XAU = symbolSpec("XAUUSD"), NAS = symbolSpec("NAS100");
eq("quote = account: 1", quoteToAccountRate(EU, "USD", 1.1, NaN), 1);
near("base = account (USDJPY on USD): 1 / price", quoteToAccountRate(UJ, "USD", 150, NaN), 1 / 150, 1e-9);
near("base = account (EURUSD on EUR): 1 / price", quoteToAccountRate(EU, "EUR", 1.1, NaN), 1 / 1.1, 1e-9);
eq("neither: the typed rate", quoteToAccountRate(EJ, "USD", 160, 0.0067), 0.0067);
nan("neither, nothing typed: NaN", quoteToAccountRate(EJ, "USD", 160, NaN));
eq("unknown symbol: 1", quoteToAccountRate(NAS, "USD", 18000, NaN), 1);
eq("needsRate", [needsRate(EJ, "USD"), needsRate(UJ, "USD"), needsRate(EU, "EUR"), needsRate(NAS, "EUR"), needsRate(EU, "USD")], [true, false, false, false, false]);
eq("rateKey", rateKey(EJ, "USD"), "JPYUSD");

console.log("-- lotsFor / positionSize");
near("lotsFor rounds down", lotsFor(100, 333.333), 0.3);
nan("lotsFor zero risk", lotsFor(0, 10));
nan("lotsFor zero per lot", lotsFor(10, 0));
nan("lotsFor negative per lot", lotsFor(10, -5));
const base = { balance: 10000, mode: "pct" as const, pct: 1, amt: NaN, cur: "USD", rate: NaN };
let ps = positionSize({ ...base, spec: EU, contract: 100000, entry: 1.1, stop: 1.095 });
near("EURUSD 1% of 10,000, 50 pips: 0.20 lot", ps.lots, 0.2);
near("EURUSD stop in pips", ps.pips as number, 50);
near("EURUSD risk at this size", ps.real, 100);
ps = positionSize({ ...base, spec: UJ, contract: 100000, entry: 150, stop: 149.5 });
near("USDJPY on USD (JPY pair, base = account): 0.30 lot", ps.lots, 0.3);
near("USDJPY 50 pips", ps.pips as number, 50);
ps = positionSize({ ...base, cur: "EUR", spec: GJ, contract: 100000, entry: 190, stop: 189, rate: 0.0062 });
near("GBPJPY on EUR with typed rate: 0.16 lot", ps.lots, 0.16);
ok("GBPJPY on EUR needs a rate", ps.needRate);
ps = positionSize({ ...base, cur: "EUR", spec: GJ, contract: 100000, entry: 190, stop: 189 });
ok("rate missing: no result", !ps.ok && Number.isNaN(ps.lots));
ps = positionSize({ ...base, cur: "EUR", spec: EU, contract: 100000, entry: 1.1, stop: 1.095 });
near("EURUSD on EUR (account = base): 0.22 lot", ps.lots, 0.22);
ps = positionSize({ ...base, spec: XAU, contract: 100, entry: 2000, stop: 1990 });
near("gold $10 stop: 0.10 lot", ps.lots, 0.1);
eq("gold has no pips", ps.pips, null);
ps = positionSize({ ...base, spec: NAS, contract: 1, entry: 18000, stop: 17950 });
near("unknown symbol with typed contract 1: 2.00 lots", ps.lots, 2);
ps = positionSize({ ...base, spec: NAS, contract: NaN, entry: 18000, stop: 17950 });
ok("unknown symbol without contract: no result", !ps.ok);
ps = positionSize({ ...base, spec: EU, contract: 100000, entry: 1.1, stop: 1.1 });
ok("stop at entry: no result", !ps.ok && ps.dist === 0);
ps = positionSize({ ...base, pct: -1, spec: EU, contract: 100000, entry: 1.1, stop: 1.095 });
ok("negative risk: no result", !ps.ok);
ps = positionSize({ ...base, balance: 0, spec: EU, contract: 100000, entry: 1.1, stop: 1.095 });
ok("zero balance: no result", !ps.ok);
ps = positionSize({ ...base, mode: "amt", amt: 50, spec: EU, contract: 100000, entry: 1.1, stop: 1.095 });
near("risk as an amount: 50$ over 50 pips = 0.10 lot", ps.lots, 0.1);
ps = positionSize({ ...base, mode: "amt", amt: 1, spec: EU, contract: 100000, entry: 1.1, stop: 1.095 });
ok("risk below 0.01 lot: rounds to 0", ps.ok && ps.lots < 0.01);

console.log("-- lots / balance rule");
near("TraderWaves example: 100 / 1000 x 0.01 rounds down to 0.00", lotsFromBalanceRule(100, 1000, 0.01), 0, 1e-9);
near("15000 / 1000 x 0.01 = 0.15 lot", lotsFromBalanceRule(15000, 1000, 0.01), 0.15, 1e-9);
near("rounds down, never up: 2999 / 1000 x 0.01 = 0.02", lotsFromBalanceRule(2999, 1000, 0.01), 0.02, 1e-9);
near("unit 500, 0.05 lot per unit, balance 2000 = 0.20", lotsFromBalanceRule(2000, 500, 0.05), 0.2, 1e-9);
nan("zero unit", lotsFromBalanceRule(15000, 0, 0.01));
nan("negative unit", lotsFromBalanceRule(15000, -1000, 0.01));
nan("balance not finite", lotsFromBalanceRule(NaN, 1000, 0.01));
nan("lots per unit not finite", lotsFromBalanceRule(15000, 1000, Infinity));
{
  // the saved state: one object, so switching mode only changes `mode` and each mode keeps its own fields
  const st = { mode: "pct", pct: "1", amt: "50", unitAmt: "2000", lotsPerUnit: "0.05" };
  const back = (m: string) => ({ ...st, mode: m });
  eq("switching mode keeps every mode's own fields", [back("balance"), back("amt"), back("pct")].map((x) => [x.pct, x.amt, x.unitAmt, x.lotsPerUnit]), Array(3).fill(["1", "50", "2000", "0.05"]));
  const old = { ...{ mode: "amt", pct: "2", amt: "30", unitAmt: "1000", lotsPerUnit: "0.01" }, ...JSON.parse('{"mode":"amt","amt":"75"}') };
  eq("old saved state without the new fields keeps the defaults", [old.amt, old.unitAmt, old.lotsPerUnit], ["75", "1000", "0.01"]);
}

console.log("-- risk / reward");
let rr = riskReward(1.1, 1.095, 1.1125);
eq("buy (stop below entry)", rr.side, "buy");
near("R:R 2.5", rr.rr, 2.5);
near("risk distance", rr.risk, 0.005, 1e-9);
near("reward distance", rr.reward, 0.0125, 1e-9);
near("break-even win rate 1/(1+RR) = 28.57%", rr.beWinRate, 28.57);
near("money risked on 0.20 lot", moneyFor(rr.risk, 100000, 0.2, 1), 100);
near("money to make on 0.20 lot", moneyFor(rr.reward, 100000, 0.2, 1), 250);
rr = riskReward(1.1, 1.105, 1.09);
eq("sell (stop above entry)", [rr.side, rr.ok], ["sell", true]);
near("sell R:R 2", rr.rr, 2);
near("sell break-even 33.33%", rr.beWinRate, 33.33);
rr = riskReward(150, 149.5, 151.5);
near("USDJPY risk in pips", rr.risk / (UJ.pip as number), 50);
near("USDJPY R:R 3", rr.rr, 3);
eq("stop and target on the same side", riskReward(1.1, 1.095, 1.09).error, "sameSide");
eq("same side, sell", riskReward(1.1, 1.105, 1.11).error, "sameSide");
eq("stop at entry", riskReward(1.1, 1.1, 1.2).error, "stopAtEntry");
eq("target at entry", riskReward(1.1, 1.09, 1.1).error, "targetAtEntry");
eq("missing input", riskReward(NaN, 1.09, 1.2).error, "missing");
ok("no NaN shown on error: ok is false", !riskReward(1.1, 1.095, 1.09).ok);

console.log("-- profit and loss");
let pl = profitLoss("buy", 1, 1.085, 1.09, 100000, 1);
near("buy 1 lot EURUSD +50 pips: +500", pl.money, 500);
pl = profitLoss("sell", 0.5, 2000, 2010, 100, 1);
near("sell 0.5 gold against 10$: -500", pl.money, -500);
near("move against is negative", pl.move, -10);
pl = profitLoss("buy", 1, 150, 151, 100000, 1 / 151);
near("USDJPY on USD +100 pips: 662.25", pl.money, 662.25);
pl = profitLoss("sell", 1, 150, 149, 100000, 1 / 149);
near("USDJPY sell +100 pips", pl.money, 671.14);
eq("zero lots: 0", profitLoss("buy", 0, 1.1, 1.2, 100000, 1).money, 0);

console.log("-- pip value");
let pv = pipValue(0.0001, 100000, 1, 0.5);
near("EURUSD on USD: 10 per lot", pv.perLot, 10);
near("EURUSD on USD: 5 for 0.5 lot", pv.total, 5);
pv = pipValue(0.01, 100000, 1 / 150, 1);
near("USDJPY on USD at 150: 6.67 per lot", pv.perLot, 6.67);
pv = pipValue(0.0001, 100000, 1 / 1.1, 2);
near("EURUSD on EUR (account = base) at 1.10: 9.09 per lot", pv.perLot, 9.09);
near("... and 18.18 for 2 lots", pv.total, 18.18);
pv = pipValue(0.01, 100, 1, 1);
near("gold step 0.01: 1 per lot", pv.perLot, 1);
pv = pipValue(1, 1, 1, 3);
near("unknown symbol step 1 contract 1: 3 for 3 lots", pv.total, 3);
nan("rate missing: NaN", pipValue(0.01, 100000, NaN, 1).perLot);

console.log("-- margin");
let mg = marginFor(EU, "USD", 1, 100000, 1.1, 100, NaN);
near("EURUSD on USD, 1 lot at 1.10, 1:100: 1,100", mg.margin, 1100);
ok("quote = account needs the price", mg.needPrice && !mg.needRate);
mg = marginFor(UJ, "USD", 1, 100000, NaN, 100, NaN);
near("USDJPY on USD (base = account): 1,000 with no price", mg.margin, 1000);
ok("base = account needs no price", !mg.needPrice);
mg = marginFor(EU, "EUR", 1, 100000, NaN, 30, NaN);
near("EURUSD on EUR 1:30: 3,333.33", mg.margin, 3333.33);
mg = marginFor(EJ, "USD", 1, 100000, 160, 100, 0.0067);
near("EURJPY on USD with rate: 1,072", mg.margin, 1072);
ok("EURJPY on USD needs a rate", mg.needRate);
nan("rate missing: NaN", marginFor(EJ, "USD", 1, 100000, 160, 100, NaN).margin);
mg = marginFor(XAU, "USD", 0.5, 100, 2000, 200, NaN);
near("gold 0.5 lot at 2000, 1:200: 500", mg.margin, 500);
nan("zero leverage: NaN", marginFor(EU, "USD", 1, 100000, 1.1, 0, NaN).margin);
nan("negative leverage: NaN", marginFor(EU, "USD", 1, 100000, 1.1, -100, NaN).margin);

console.log("-- ATR size (stop = ATR x multiplier, then position size)");
const atrDist = 0.0040 * 1.5;
ps = positionSize({ ...base, spec: EU, contract: 100000, entry: 1.1, stop: 1.1 - atrDist });
near("ATR 40 pips x 1.5 = 60 pips", ps.pips as number, 60);
near("1% of 10,000 over 60 pips: 0.16 lot", ps.lots, 0.16);
const atrBase = { balance: 10000, riskPct: 1, cur: "USD", price: NaN, rate: NaN };
let at = atrSize({ ...atrBase, atr: 0.004, mult: 1.5, spec: EU, contract: 100000 });
near("atrSize: stop distance 0.006", at.dist, 0.006, 1e-9);
near("atrSize: 60 pips", at.pips as number, 60);
near("atrSize: 0.16 lot, same as the position size", at.lots, 0.16);
near("atrSize: money at risk 100", at.riskMoney, 100);
near("atrSize: risk at this size 96", at.real, 96);
at = atrSize({ ...atrBase, atr: 0.6, mult: 1.5, spec: UJ, contract: 100000, price: 150 });
ok("atrSize USDJPY on USD needs the price", at.needPrice && !at.needRate);
near("atrSize USDJPY 90 pips at 150: 0.16 lot", at.lots, 0.16);
nan("atrSize USDJPY without the price: NaN", atrSize({ ...atrBase, atr: 0.6, mult: 1.5, spec: UJ, contract: 100000 }).lots);
at = atrSize({ ...atrBase, atr: 12, mult: 2, spec: XAU, contract: 100 });
near("atrSize gold ATR 12 x 2 = 24$: 0.04 lot", at.lots, 0.04);
eq("atrSize gold: no pips", at.pips, null);
nan("atrSize zero ATR: NaN", atrSize({ ...atrBase, atr: 0, mult: 1.5, spec: EU, contract: 100000 }).lots);
nan("atrSize negative multiplier: NaN", atrSize({ ...atrBase, atr: 0.004, mult: -1, spec: EU, contract: 100000 }).lots);
nan("atrSize unknown symbol, no contract: NaN", atrSize({ ...atrBase, atr: 50, mult: 1.5, spec: NAS, contract: NaN }).lots);
ok("atrSize GBPJPY on EUR needs a rate", atrSize({ ...atrBase, cur: "EUR", atr: 1, mult: 1, spec: GJ, contract: 100000 }).needRate);

console.log("-- challenge rules and trade edge");
const ch = { id: "c", accountId: "a", name: "P1", start: "2025-01-01", size: 10000, target: 8, daily: 5, dailyBase: "size", max: 10, trailing: false, trailLock: true, minDays: 0, limitDays: null, consistency: null } as Challenge;
eq("prop rules as they are", challengeRulesPct(ch), { target: 8, daily: 5, max: 10 });
eq("own rules: pct kept, money turned into % of size", challengeRulesPct({ ...ch, kind: "own", own: { onBreak: "warn", goal: { v: 10, unit: "pct" }, daily: { v: 500, unit: "money" } } }), { target: 10, daily: 5, max: null });
const tr = (pnl: number | null, status: "open" | "closed" = "closed", exitTime: string | null = "2025-01-10T10:00"): Trade => ({ key: String(Math.random()), accountId: "a", no: 1, symbol: "EURUSD", side: "long", qty: 1, entryTime: "2025-01-10T09:00", entryPrice: 1, exitTime, exitPrice: 1, pnl, returnPct: null, commission: 0, status });
let te = tradeEdge([tr(100), tr(-50), tr(200), tr(-50), tr(0), tr(null, "open")]);
eq("win rate counts every closed trade (2 of 5)", te.winRate, 40);
near("payoff 150 / 50 = 3", te.payoff as number, 3);
eq("closed count", te.n, 5);
te = tradeEdge([tr(100), tr(-50), tr(200), tr(-50)], 60);
eq("break-even range turns -50 into neither: no payoff", te.payoff, null);
eq("no trades", tradeEdge([]), { n: 0, winRate: null, payoff: null });

console.log("-- longest losing run (exact)");
near("n=3 q=.5: P(longest <= 0) = 1/8", longestRunAtMost(3, 0.5, 0), 0.125, 1e-12);
near("n=3 q=.5: P(longest <= 1) = 5/8", longestRunAtMost(3, 0.5, 1), 0.625, 1e-12);
near("n=3 q=.5: P(longest <= 2) = 7/8", longestRunAtMost(3, 0.5, 2), 0.875, 1e-12);
const d3 = longestRunDist(3, 0.5);
eq("n=3 q=.5 distribution", d3.map((x) => Math.round(x * 1000) / 1000), [0.125, 0.5, 0.25, 0.125]);
eq("n=3 q=.5 most likely: 1", likelyLongestRun(3, 0.5), 1);
const d26 = longestRunDist(26, 0.46);
near("n=26 q=.46: probabilities add up to 1", d26.reduce((a, b) => a + b, 0), 1, 1e-9);
const mode26 = d26.indexOf(Math.max(...d26));
eq("n=26 q=.46: early-exit mode = full mode", likelyLongestRun(26, 0.46), mode26);
console.log(`      (most likely longest losing run over 26 trades at 46% losses: ${mode26})`);
eq("never losing: 0", likelyLongestRun(10, 0), 0);
eq("always losing: n", likelyLongestRun(10, 1), 10);
eq("zero trades: 0", likelyLongestRun(0, 0.5), 0);
const big = likelyLongestRun(5000, 0.9), dBig = longestRunDist(5000, 0.9);
eq("n=5000 q=.9 (bounded work): early exit agrees with the full mode", big, dBig.indexOf(Math.max(...dBig)));

console.log("-- challenge plan (the approved preview)");
let plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 0.5, rr: 2, winRate: 54 });
near("expectancy 0.31% per trade", plan.edge, 0.31);
eq("26 trades to the 8% target", plan.trades, 26);
eq("10 losses in a row to the 5% daily limit", plan.lossesDaily, 10);
eq("20 losses in a row to the 10% max limit", plan.lossesMax, 20);
near("safe risk 1.67%", plan.safe as number, 1.67);
eq("0.5% is safe", plan.overSafe, false);
eq("streak over the 26 trades", plan.streak?.n, 26);
eq("streak is the most likely one", plan.streak?.k, mode26);
near("streak cost = streak x risk", plan.streak?.cost as number, mode26 * 0.5);
eq("streak level", plan.streak?.level, mode26 * 0.5 >= 10 ? "max" : mode26 * 0.5 >= 5 ? "daily" : "ok");
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 2, rr: 2, winRate: 54 });
eq("2% is above the safe risk", plan.overSafe, true);
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 0.5, rr: 2, winRate: 54, roomPct: 3 });
near("live room left 3% -> safe 1%", plan.safe as number, 1);
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 0.5, rr: 2, winRate: 54, roomPct: -1 });
eq("no room left: safe 0", plan.safe, 0);
plan = challengePlan({ target: 8, daily: NaN, max: 10, risk: 0.5, rr: 2, winRate: 54 });
near("no daily limit: a third of the max", plan.safe as number, 3.33);
eq("no daily limit: no daily count", plan.lossesDaily, null);
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 0.5, rr: 2, winRate: 30 });
ok("E <= 0: negative edge", plan.edge < 0);
eq("E <= 0: no trade count, no streak", [plan.trades, plan.streak], [null, null]);
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 0.5, rr: 2, winRate: 100 / 3 });
near("E = 0 exactly", plan.edge, 0, 1e-12);
eq("E = 0: no trade count", plan.trades, null);
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 0, rr: 2, winRate: 54 });
ok("zero risk: nothing", Number.isNaN(plan.edge) && plan.trades == null && plan.lossesDaily == null);
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: -1, rr: 2, winRate: 54 });
ok("negative risk: nothing", Number.isNaN(plan.edge) && plan.trades == null && plan.overSafe == null);
plan = challengePlan({ target: 0, daily: 5, max: 10, risk: 0.5, rr: 2, winRate: 54 });
eq("no target: no trade count", plan.trades, null);
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 5, rr: 2, winRate: 54 });
eq("5% risk: 1 loss to the daily limit", plan.lossesDaily, 1);
ok("5% risk: a streak of 2 or more reaches the max limit", (plan.streak?.k ?? 0) < 2 || plan.streak?.level === "max");
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 2.5, rr: 2, winRate: 54 });
eq("2.5% risk: level follows the cost", plan.streak?.level, (plan.streak?.cost ?? 0) >= 10 ? "max" : (plan.streak?.cost ?? 0) >= 5 ? "daily" : "ok");
plan = challengePlan({ target: 8, daily: 5, max: 10, risk: 0.3, rr: 1, winRate: 50.1 });
eq("tiny edge: streak counted over the capped horizon", plan.streak?.n, 5000);
ok("tiny edge: trade count still exact", (plan.trades ?? 0) > 5000);

console.log("-- compound growth");
let cg = compound(10000, 5, 12);
near("10,000 at 5% for 12 months: 17,958.56", cg?.final as number, 17958.56);
near("total gain 7,958.56", cg?.gain as number, 7958.56);
eq("one row per period", cg?.rows.length, 12);
near("first period gain 500", cg?.rows[0].gain as number, 500);
cg = compound(10000, 10, 2, 100);
near("with deposits: 12,310", cg?.final as number, 12310);
near("deposits 200", cg?.deposits as number, 200);
near("gain apart from deposits 2,110", cg?.gain as number, 2110);
cg = compound(1000, 0, 3, 50);
near("0% rate: start + deposits", cg?.final as number, 1150);
cg = compound(1000, -10, 2);
near("negative rate: 810", cg?.final as number, 810);
eq("zero periods: nothing", compound(1000, 5, 0), null);
eq("rate -100% or below: nothing", compound(1000, -100, 5), null);
eq("negative start: nothing", compound(-1, 5, 5), null);
eq("too many periods: nothing", compound(1000, 5, 1201), null);
eq("missing rate: nothing", compound(1000, NaN, 5), null);
near("missing deposit counts as 0", compound(1000, 10, 1, NaN)?.final as number, 1100);

console.log("-- average monthly return");
near("(5% + -2%) / 2 = 1.5%", avgReturn([{ start: 10000, pnl: 500 }, { start: 10500, pnl: -210 }]) as number, 1.5);
near("months with no balance left out", avgReturn([{ start: 0, pnl: 100 }, { start: 1000, pnl: 10 }]) as number, 1);
eq("no months", avgReturn([]), null);
eq("by month, oldest first, open trades ignored", pnlByMonth([tr(100, "closed", "2025-02-03T10:00"), tr(-40, "closed", "2025-01-20 09:00:00"), tr(60, "closed", "2025-01-21T10:00"), tr(null, "open", null)]), [{ month: "2025-01", pnl: 20 }, { month: "2025-02", pnl: 100 }]);

console.log("-- readable tone (group colours as text)");
const navyGlass = "#121c30";
eq("green on navy glass: unchanged", readableTone("#22c55e", navyGlass), "#22c55e");
const gw = readableTone("#22c55e", "#ffffff");
ok("green on white: darkened to at least 3:1", gw !== "#22c55e" && contrastRatio(gw, "#ffffff") >= 3, `${gw} ${contrastRatio(gw, "#ffffff")}`);
const ow = readableTone("#f97316", "#ffffff");
ok("orange on white: at least 3:1", contrastRatio(ow, "#ffffff") >= 3, `${ow}`);
eq("red on white already 3:1: unchanged", readableTone("#ef4444", "#ffffff"), "#ef4444");
for (const c of CALC_GROUPS.map((g) => g.color)) for (const bg of ["#ffffff", "#fbfcfd", navyGlass, "#0d0d0d"]) ok(`${c} on ${bg} reads at 3:1`, contrastRatio(readableTone(c, bg), bg) >= 3);
const dk = readableTone("#1e293b", "#0d0d0d");
ok("too dark on black: lightened", contrastRatio(dk, "#0d0d0d") >= 3, dk);

console.log("-- pips mode: pip size and pips to distance");
const XAG = symbolSpec("XAGUSD");
eq("pip size EURUSD from the spec", pipSizeFor(EU), 0.0001);
eq("pip size USDJPY (JPY pair)", pipSizeFor(UJ), 0.01);
eq("pip size XAUUSD default 0.1", pipSizeFor(XAU), 0.1);
eq("pip size XAGUSD default 0.01", pipSizeFor(XAG), 0.01);
eq("defaults: forex, gold, silver, others none", [defaultPipSize(EU), defaultPipSize(UJ), defaultPipSize(XAU), defaultPipSize(XAG), defaultPipSize(NAS)], [0.0001, 0.01, 0.1, 0.01, null]);
nan("pip size NAS100: none until typed", pipSizeFor(NAS));
eq("custom pip size NAS100 typed 1", pipSizeFor(NAS, "1"), 1);
eq("custom gold pip size 0.01 (comma typed)", pipSizeFor(XAU, "0,01"), 0.01);
eq("forex keeps its spec's pip size", pipSizeFor(EU, "0.01"), 0.0001);
nan("typed field emptied: no pip size", pipSizeFor(XAU, ""));
near("EURUSD 20 pips = 0.0020", pipsToDistance(20, pipSizeFor(EU)), 0.002, 1e-12);
near("USDJPY 20 pips = 0.20", pipsToDistance(20, pipSizeFor(UJ)), 0.2, 1e-12);
near("XAUUSD 30 pips at the default 0.1 = 3.0", pipsToDistance(30, pipSizeFor(XAU)), 3, 1e-12);
near("custom pip size: NAS100 50 pips at 1 = 50", pipsToDistance(50, pipSizeFor(NAS, "1")), 50, 1e-12);
near("custom gold pip size 0.01: 30 pips = 0.30", pipsToDistance(30, pipSizeFor(XAU, "0.01")), 0.3, 1e-12);
near("negative pips: negative distance", pipsToDistance(-15, 0.0001), -0.0015, 1e-12);
nan("no pip size: NaN", pipsToDistance(20, NaN));
nan("zero pip size: NaN", pipsToDistance(20, 0));
nan("no pips typed: NaN", pipsToDistance(NaN, 0.0001));

console.log("-- pips mode: position size");
const inPips = (spec: ReturnType<typeof symbolSpec>, contract: number, pips: number, pip: number, extra: Partial<Parameters<typeof positionSize>[0]> = {}) =>
  positionSize({ ...base, spec, contract, entry: NaN, stop: NaN, dist: pipsToDistance(pips, pip), pip, ...extra });
const byPrice = positionSize({ ...base, spec: EU, contract: 100000, entry: 1.1, stop: 1.098 });
let byPips = inPips(EU, 100000, 20, pipSizeFor(EU));
near("EURUSD 20 pips = entry 1.1000 / stop 1.0980: same distance", byPips.dist, byPrice.dist, 1e-12);
near("... and the same lots in both modes", byPips.lots, byPrice.lots);
near("10,000 USD, 1%, EURUSD, 20 pips: 0.50 lot", byPips.lots, 0.5);
near("... risk at this size 100", byPips.real, 100);
near("... stop shown as 20 pips", byPips.pips as number, 20);
byPips = inPips(XAU, 100, 30, pipSizeFor(XAU));
near("10,000 USD, 1%, XAUUSD (100 oz, pip 0.1), 30 pips: 0.33 lot", byPips.lots, 0.33);
near("... gold stop shown as 30 pips", byPips.pips as number, 30);
const goldPrice = positionSize({ ...base, spec: XAU, contract: 100, entry: 2000, stop: 1997 });
near("gold 30 pips = entry 2000 / stop 1997: same lots", byPips.lots, goldPrice.lots);
eq("gold in price mode still has no pips", goldPrice.pips, null);
near("custom pip size: NAS100 contract 1, pip 1, 50 pips: 2.00 lots", inPips(NAS, 1, 50, pipSizeFor(NAS, "1")).lots, 2);
ok("NAS100 with no pip size: no result", !inPips(NAS, 1, 50, pipSizeFor(NAS)).ok);
ok("0 pips: no result, distance 0", !inPips(EU, 100000, 0, 0.0001).ok && inPips(EU, 100000, 0, 0.0001).dist === 0);
near("a stop typed negative counts as its distance", inPips(EU, 100000, -20, 0.0001).lots, 0.5);
near("EURUSD on EUR (account = base): pips mode with the price = price mode", inPips(EU, 100000, 50, 0.0001, { cur: "EUR", price: 1.1 }).lots, 0.22);

console.log("-- pips mode: the current price only when the conversion needs it");
eq("needsPrice: USDJPY on USD, EURUSD on EUR", [needsPrice(UJ, "USD"), needsPrice(EU, "EUR")], [true, true]);
eq("needsPrice: EURUSD on USD, EURJPY on USD (a rate), gold on USD, unknown", [needsPrice(EU, "USD"), needsPrice(EJ, "USD"), needsPrice(XAU, "USD"), needsPrice(NAS, "USD")], [false, false, false, false]);
let uj = inPips(UJ, 100000, 20, pipSizeFor(UJ));
ok("USDJPY on USD in pips mode requires the current price", uj.needPrice);
ok("... without it: no result", !uj.ok && Number.isNaN(uj.lots));
uj = inPips(UJ, 100000, 20, pipSizeFor(UJ), { price: 150 });
near("... with 150: 20 pips = 0.75 lot", uj.lots, 0.75);
near("... same as entry 150 / stop 149.80", uj.lots, positionSize({ ...base, spec: UJ, contract: 100000, entry: 150, stop: 149.8 }).lots);
ok("price mode never asks for it (the entry serves)", !positionSize({ ...base, spec: UJ, contract: 100000, entry: 150, stop: 149.8 }).needPrice);
ok("EURUSD on USD in pips mode: no price needed", !inPips(EU, 100000, 20, 0.0001).needPrice);
ok("GBPJPY on EUR in pips mode: a rate, no price", (() => { const r = inPips(GJ, 100000, 100, 0.01, { cur: "EUR", rate: 0.0062 }); return !r.needPrice && r.needRate && Math.abs(r.lots - 0.16) <= 0.01; })());

console.log("-- pips mode: risk / reward");
let rp = riskRewardPips(20, 50);
near("stop 20, target 50: R:R 2.5", rp.rr, 2.5);
near("break-even win rate 28.57%", rp.beWinRate, 28.57);
eq("no direction", rp.side, null);
eq("risk and reward in pips", [rp.risk, rp.reward], [20, 50]);
near("same R:R as entry 1.1000 / stop 1.0980 / target 1.1050", rp.rr, riskReward(1.1, 1.098, 1.105).rr);
near("money at risk from pips (0.20 lot EURUSD): 40", moneyFor(pipsToDistance(rp.risk, 0.0001), 100000, 0.2, 1), 40);
rp = riskRewardPips(-20, 50);
near("signs ignored (distances): 2.5", rp.rr, 2.5);
eq("stop 0 pips", riskRewardPips(0, 50).error, "stopAtEntry");
eq("target 0 pips", riskRewardPips(20, 0).error, "targetAtEntry");
eq("missing", riskRewardPips(NaN, 50).error, "missing");
ok("error: not ok", !riskRewardPips(0, 50).ok);

console.log("-- pips mode: profit and loss");
let pp = profitLossPips(50, 0.0001, 1, 100000, 1);
near("1 lot EURUSD +50 pips: +500 (as entry 1.0850 / exit 1.0900)", pp.money, profitLoss("buy", 1, 1.085, 1.09, 100000, 1).money);
pp = profitLossPips(-20, 0.0001, 1, 100000, 1);
near("negative pips = a loss: -200", pp.money, -200);
near("move against is negative", pp.move, -0.002, 1e-12);
near("gold 0.5 lot, 30 pips at 0.1: +150", profitLossPips(30, pipSizeFor(XAU), 0.5, 100, 1).money, 150);
near("USDJPY on USD +100 pips at 151: 662.25", profitLossPips(100, 0.01, 1, 100000, quoteToAccountRate(UJ, "USD", 151, NaN)).money, 662.25);
nan("USDJPY on USD without the current price: NaN", profitLossPips(100, 0.01, 1, 100000, quoteToAccountRate(UJ, "USD", NaN, NaN)).money);
nan("no pip size: NaN", profitLossPips(30, pipSizeFor(NAS), 1, 1, 1).money);
eq("0 pips: 0", profitLossPips(0, 0.0001, 1, 100000, 1).money, 0);

// ---- phase 2: Risk planning and System analysis ----
import {
  drawdownRecovery, accountDrawdown,
  riskOfRuin, safeRiskForRuin,
  expectancy, requiredWinRate, kellyFull,
  buildPnlSample, runMonteCarlo,
  streakTableRow, streakTable,
} from "./calculators";

console.log("-- CALC_READY covers all 16");
ok("CALC_READY.size === CALC_KEYS.length", CALC_READY.size === CALC_KEYS.length);
ok("all keys ready", CALC_KEYS.every((k) => CALC_READY.has(k)));

console.log("-- drawdownRecovery");
near("20% → 25%", drawdownRecovery(20), 25);
near("50% → 100%", drawdownRecovery(50), 100);
near("10% → 11.11%", drawdownRecovery(10), 11.11);
nan("0% → NaN", drawdownRecovery(0));
nan("100% → NaN", drawdownRecovery(100));
nan("negative → NaN", drawdownRecovery(-5));

console.log("-- accountDrawdown");
const pts = [{ v: 100 }, { v: 110 }, { v: 90 }, { v: 95 }, { v: 80 }];
const { current: curDd, max: maxDd } = accountDrawdown(pts);
near("max drawdown: 110 → 80 = 27.27%", maxDd, 27.27, 0.1);
near("current drawdown: 110 → 80 = 27.27%", curDd, 27.27, 0.1);
const { current: curDd2 } = accountDrawdown([{ v: 100 }, { v: 120 }, { v: 130 }]);
near("at all-time high: current = 0", curDd2, 0);
eq("empty series: NaN current", isNaN(accountDrawdown([]).current), true);

console.log("-- riskOfRuin");
const ruinAll = riskOfRuin({ winRate: 0, rr: 2, riskPct: 2, ruinLevel: 50, nTrades: 500 });
near("0% win rate → 100% ruin", ruinAll, 100, 1);
const ruinNone = riskOfRuin({ winRate: 100, rr: 2, riskPct: 1, ruinLevel: 50, nTrades: 500 });
near("100% win rate → 0% ruin", ruinNone, 0, 1);
const ruin50 = riskOfRuin({ winRate: 55, rr: 1.5, riskPct: 1, ruinLevel: 50, nTrades: 500 });
ok("edge + small risk → low ruin (<10%)", ruin50 < 10);
const ruinHigh = riskOfRuin({ winRate: 40, rr: 1.1, riskPct: 10, ruinLevel: 50, nTrades: 300 });
ok("no edge + big risk → high ruin (>50%)", ruinHigh > 50);

console.log("-- safeRiskForRuin");
const safe = safeRiskForRuin({ winRate: 55, rr: 1.5, ruinLevel: 50, nTrades: 500 });
ok("good edge: safe risk exists", safe != null && safe > 0);
const noEdge = safeRiskForRuin({ winRate: 0, rr: 1, ruinLevel: 0.5, nTrades: 200 });
ok("pathological system (0% wins, ruinLevel=0.5%): null", noEdge == null);

console.log("-- expectancy");
const exp1 = expectancy(54, 182, 121);
near("54%/182/121: e per trade ~42.62", exp1.e, 42.62, 0.1);
near("54%/182/121: beWinRate = 121/(182+121)*100", exp1.beWinRate, (121 / 303) * 100, 0.1);
near("eR > 0 with edge", exp1.eR, 54 / 100 * (182 / 121) - 46 / 100, 0.01);
near("per100 = e × 100", exp1.per100, exp1.e * 100, 0.01);
const expBe = expectancy(50, 100, 100);
near("50%/100/100: e = 0 (break-even)", expBe.e, 0, 0.001);
const expNaN = expectancy(50, -10, 100);
nan("negative avgWin → NaN", expNaN.e);

console.log("-- requiredWinRate");
near("RR=2 → 33.33%", requiredWinRate(2), 33.33, 0.01);
near("RR=1 → 50%", requiredWinRate(1), 50);
near("RR=3 → 25%", requiredWinRate(3), 25);
nan("RR=0 → NaN", requiredWinRate(0));

console.log("-- kellyFull");
const k1 = kellyFull(54, 1.504);
ok("54%/1.504: edge > 0, ok=true", k1.ok);
near("full Kelly ≈ 0.182", k1.f, 0.54 - 0.46 / 1.504, 0.001);
near("half Kelly = f/2", k1.half, k1.f / 2, 1e-9);
near("quarter Kelly = f/4", k1.quarter, k1.f / 4, 1e-9);
const kNo = kellyFull(40, 1);
ok("40%/1: no edge, ok=false", !kNo.ok);
eq("no edge: f=0", kNo.f, 0);

console.log("-- buildPnlSample");
const sample = buildPnlSample(60, 100, 50, 200, 7);
eq("sample length 200", sample.length, 200);
ok("all wins or losses", sample.every((x) => x === 100 || x === -50));
const wins = sample.filter((x) => x > 0).length;
ok("win rate near 60% (±10%)", wins >= 100 && wins <= 140);
eq("empty for n<2", buildPnlSample(60, 100, 50, 1).length, 0);

console.log("-- runMonteCarlo");
const mcPnls = buildPnlSample(55, 150, 100, 100, 1);
const mc = runMonteCarlo(mcPnls);
ok("mc result not null for valid pool", mc != null);
if (mc) {
  ok("paths = 1000", mc.paths === 1000);
  ok("horizon >= 20", mc.horizon >= 20);
  ok("probProfit 0..100", mc.probProfit >= 0 && mc.probProfit <= 100);
  ok("p5/p50/p95 arrays present", mc.p5.length > 0 && mc.p50.length > 0 && mc.p95.length > 0);
}
eq("too few pnls: null", runMonteCarlo([1]), null);

console.log("-- streakTable");
const st = streakTable(100, 0.4, 2);
ok("table has rows", st.length > 0);
ok("rows from k=3", st[0].k === 3);
ok("probabilities descend with k", st[0].pAtLeast >= st[1].pAtLeast);
near("cost = k * risk", st[0].cost, st[0].k * 2, 1e-9);
ok("5-in-a-row in 100 at 40% loss rate: >30% chance", streakTableRow(100, 0.4, 5, 2).pAtLeast > 0.3);

console.log("-- likelyLongestRun");
ok("n=100 q=0.4: likelyK >= 4", likelyLongestRun(100, 0.4) >= 4);
eq("q=0: likelyK = 0", likelyLongestRun(100, 0), 0);
eq("q=1: likelyK = n", likelyLongestRun(100, 1), 100);

console.log("-- standard calculator");
const keys = (seq: string[], from: StdState = STD_START) => seq.reduce((st, k) => stdPress(st, k as StdKey), from);
eq("2 + 3 x 4 = 20 (left to right)", keys(["2", "+", "3", "*", "4", "="]).entry, "20");
eq("an operator after an operator shows the running result", keys(["2", "+", "3", "*"]).entry, "5");
eq("10 - 4 / 2 = 3", keys(["1", "0", "-", "4", "/", "2", "="]).entry, "3");
eq("0.1 + 0.2 = 0.3 (10 significant digits)", keys(["0", ".", "1", "+", "0", ".", "2", "="]).entry, "0.3");
eq("1 / 3 rounds to 10 significant digits", keys(["1", "/", "3", "="]).entry, "0.3333333333");
const dz = keys(["5", "/", "0", "="]);
ok("division by zero: Error", dz.error && dz.entry === "Error");
ok("Error ignores keys until C", keys(["7", "+"], dz).error);
eq("C clears the error", keys(["C"], dz), STD_START);
ok("division by zero in a chain: Error", keys(["8", "/", "0", "+"]).error);
eq("backspace", keys(["1", "2", "3", "back"]).entry, "12");
eq("backspace on the last digit gives 0", keys(["7", "back"]).entry, "0");
eq("sign", keys(["5", "neg"]).entry, "-5");
eq("sign twice", keys(["5", "neg", "neg"]).entry, "5");
eq("decimal point once", keys(["1", ".", "5", ".", "2"]).entry, "1.52");
eq("leading decimal point", keys([".", "5"]).entry, "0.5");
eq("200 + 10 % = 220", keys(["2", "0", "0", "+", "1", "0", "%", "="]).entry, "220");
eq("50 % alone = 0.5", keys(["5", "0", "%"]).entry, "0.5");
eq("a new digit after = starts over", keys(["2", "+", "3", "=", "4"]).entry, "4");
eq("keyboard map", [stdKeyFromEvent("7"), stdKeyFromEvent("Enter"), stdKeyFromEvent("Backspace"), stdKeyFromEvent("Escape"), stdKeyFromEvent("*"), stdKeyFromEvent("x"), stdKeyFromEvent("a")], ["7", "=", "back", "C", "*", "*", null]);

console.log("-- percentage");
near("15% of 200 = 30", percentCalc("of", 15, 200).value as number, 30);
near("50 is 25% of 200", percentCalc("is", 50, 200).value as number, 25);
near("100 to 150 = +50%", percentCalc("change", 100, 150).value as number, 50);
near("150 to 100 = -33.33%", percentCalc("change", 150, 100).value as number, -33.33);
eq("change to the same value is 0", percentCalc("change", 80, 80).value, 0);
eq("X is what % of 0: no value, zero", percentCalc("is", 5, 0), { value: null, reason: "zero" });
eq("change from 0: no value, zero", percentCalc("change", 0, 5), { value: null, reason: "zero" });
eq("X% of 0 is fine", percentCalc("of", 15, 0).value, 0);
eq("an empty input: missing", percentCalc("of", NaN, 5), { value: null, reason: "missing" });

console.log("-- currency converter");
const store = (live: Record<string, number>, manual: Record<string, number> = {}, at = 1000): FxStore =>
  ({ at, live: Object.fromEntries(Object.entries(live).map(([c, rate]) => [c, { rate, src: "test" }])), manual });
const fx1 = effectiveFx(store({ TND: 1 / 0.32 }));
near("1000 TND at 0.32 USD = 320 USD", convertFx(1000, "TND", "USD", fx1), 320);
near("USD to TND goes back", convertFx(320, "USD", "TND", fx1), 1000);
const fx2 = effectiveFx(store({ TND: 3, EUR: 0.9 }));
near("cross rate through USD: 90 EUR = 100 USD = 300 TND", convertFx(90, "EUR", "TND", fx2), 300);
eq("same currency keeps the amount", convertFx(5, "TND", "TND", fx2), 5);
nan("a currency with no rate: NaN, never a number", convertFx(5, "TND", "GBP", fx2));
nan("no store at all: NaN", convertFx(5, "TND", "USD", effectiveFx(null)));
nan("empty amount: NaN", convertFx(NaN, "USD", "EUR", fx2));
eq("status: just fetched", fxStatus(store({ TND: 3 }), true), "live");
eq("status: offline with a cache is Saved rates", fxStatus(store({ TND: 3 }), false), "saved");
eq("status: nothing", fxStatus(null, false), "none");
const typed = store({ TND: 3, EUR: 0.9 }, { TND: 3.2 });
eq("a typed rate wins and is marked manual", [effectiveFx(typed).TND.rate, effectiveFx(typed).TND.manual], [3.2, true]);
const refreshed = mergeFx(typed, { TND: { rate: 3.05, src: "open.er-api.com" }, EUR: { rate: 0.91, src: "Frankfurter (ECB)" } }, 2000);
eq("a refresh keeps the manual rate", [effectiveFx(refreshed).TND.rate, effectiveFx(refreshed).TND.manual], [3.2, true]);
eq("a refresh updates the live ones and the time", [effectiveFx(refreshed).EUR.rate, refreshed.at], [0.91, 2000]);
const reset = { ...refreshed, manual: {} };
eq("Reset to live shows the fetched rate", [effectiveFx(reset).TND.rate, effectiveFx(reset).TND.manual], [3.05, false]);
eq("a partial refresh keeps the saved rate of what it missed", effectiveFx(mergeFx(typed, { EUR: { rate: 0.92, src: "x" } }, 3000)).TND.rate, 3.2);
eq("source is kept per rate", effectiveFx(refreshed).EUR.src, "Frankfurter (ECB)");
eq("a bad manual rate is ignored", effectiveFx(store({ TND: 3 }, { TND: -1 })).TND.rate, 3);
eq("Frankfurter parser drops junk", parseFrankfurterUsd({ rates: { EUR: 0.9, GBP: "x", JPY: 0 } }), { EUR: 0.9 });
eq("open.er-api parser needs success", [parseErApiUsd({ result: "success", rates: { TND: 3 } }), parseErApiUsd({ result: "error", rates: { TND: 3 } })], [{ TND: 3 }, {}]);
near("CoinGecko: BTC per USD", parseCoingeckoBtc({ bitcoin: { usd: 50000 } }) as number, 0.00002, 1e-12);
eq("CoinGecko junk", parseCoingeckoBtc({}), null);

console.log("-- unit conversion");
{
  const eur = symbolSpec("EURUSD").contract as number, xau = symbolSpec("XAUUSD").contract as number;
  eq("EURUSD: 1 lot = 100,000 units", convertUnits("lot", 1, eur).units, 100000);
  eq("EURUSD: 0.35 lot = 35,000 units", convertUnits("lot", 0.35, eur).units, 35000);
  near("EURUSD round trip lot -> units -> lot", convertUnits("units", convertUnits("lot", 0.37, eur).units, eur).lots, 0.37, 1e-12);
  eq("XAUUSD: 1 lot = 100 oz", convertUnits("lot", 1, xau).oz, 100);
  eq("XAUUSD: 250 oz = 2.5 lots", convertUnits("oz", 250, xau).lots, 2.5);
  near("XAUUSD round trip oz -> lot -> oz", convertUnits("oz", convertUnits("lot", 0.07, xau).oz, xau).lots, 0.07, 1e-12);
  eq("XAGUSD: 1 lot = 5,000 oz", convertUnits("lot", 1, symbolSpec("XAGUSD").contract as number).oz, 5000);
  nan("zero value: NaN", convertUnits("lot", 0, eur).lots);
  nan("negative value: NaN", convertUnits("units", -5, eur).units);
  nan("empty value: NaN", convertUnits("lot", NaN, eur).lots);
  eq("unknown symbol has no contract size (the page asks for it)", symbolSpec("US30").contract, null);
  nan("unknown symbol, contract not typed yet: NaN", convertUnits("lot", 1, NaN).units);
  eq("unknown symbol, contract typed: 1 lot = 10 units", convertUnits("lot", 1, 10).units, 10);
}

console.log("-- trade cost");
{
  // EURUSD, 1 lot, 1.2 pip spread, 7 $ commission per lot round-turn, USD account
  const sp = symbolSpec("EURUSD"), rate = quoteToAccountRate(sp, "USD", NaN, NaN);
  const pv = 0.0001 * 100000 * 1; // pip value for 1 lot = 10 $
  const spread = 1 * pv * 1.2;    // 12 $
  const commission = 1 * 7;       // 7 $
  const total = spread + commission; // 19 $
  const c = tradeCost({ lots: 1, spreadPips: 1.2, pip: sp.pip as number, contract: sp.contract as number, rate, commissionPerLot: 7 });
  near("pip value of 1 lot", c.pipValuePerLot, pv);
  near("spread cost 12 $", c.spread, spread);
  near("commission 7 $", c.commission, commission);
  near("total 19 $", c.total, total);
  near("breakeven 19 / 10 = 1.9 pips", c.breakevenPips, total / pv);
  const half = tradeCost({ lots: 0.5, spreadPips: 1.2, pip: 0.0001, contract: 100000, rate: 1, commissionPerLot: 7 });
  near("0.5 lot halves the money", half.total, 9.5);
  near("0.5 lot: same breakeven pips", half.breakevenPips, 1.9);
  near("no commission: breakeven is the spread", tradeCost({ lots: 2, spreadPips: 0.8, pip: 0.0001, contract: 100000, rate: 1, commissionPerLot: 0 }).breakevenPips, 0.8);
  nan("zero lots: NaN", tradeCost({ lots: 0, spreadPips: 1, pip: 0.0001, contract: 100000, rate: 1, commissionPerLot: 7 }).total);
  nan("negative lots: NaN", tradeCost({ lots: -1, spreadPips: 1, pip: 0.0001, contract: 100000, rate: 1, commissionPerLot: 7 }).total);
  nan("negative spread: NaN", tradeCost({ lots: 1, spreadPips: -1, pip: 0.0001, contract: 100000, rate: 1, commissionPerLot: 7 }).total);
  nan("negative commission: NaN", tradeCost({ lots: 1, spreadPips: 1, pip: 0.0001, contract: 100000, rate: 1, commissionPerLot: -7 }).total);
  nan("missing pip size: NaN", tradeCost({ lots: 1, spreadPips: 1, pip: NaN, contract: 100000, rate: 1, commissionPerLot: 7 }).breakevenPips);
  near("zero spread and commission: costs nothing", tradeCost({ lots: 1, spreadPips: 0, pip: 0.0001, contract: 100000, rate: 1, commissionPerLot: 0 }).total, 0);
  const tr = (accountId: string, qty: number, commission: number, status: "open" | "closed" = "closed"): Trade => ({ key: String(Math.random()), accountId, no: 1, symbol: "EURUSD", side: "long", qty, entryTime: null, entryPrice: 1, exitTime: null, exitPrice: 1, pnl: 0, returnPct: null, commission, status });
  near("average commission per lot: (7 + 3.5 + 7) / 2.5", avgCommissionPerLot([tr("a", 1, -7), tr("a", 0.5, -3.5), tr("a", 1, 7), tr("b", 9, 99), tr("a", 5, 50, "open")], "a") as number, 7);
  eq("no closed trade with lots: null", avgCommissionPerLot([tr("a", 0, 5)], "a"), null);
}

console.log("-- swap");
{
  // 1 lot short at -6.5 $ per lot per night, 3 nights holding one Wednesday: 3 + 2 = 5 nights-equivalent
  const s = swapCost(1, -6.5, 3, true);
  eq("5 nights-equivalent", s.nightsEq, 5);
  near("per night -6.5", s.perNight, -6.5);
  near("total -6.5 x 5 = -32.5", s.total, -32.5);
  near("without the triple: -19.5", swapCost(1, -6.5, 3, false).total, -19.5);
  near("a credit is positive: 2 lots at +1.25 for 2 nights", swapCost(2, 1.25, 2, false).total, 5);
  near("lots scale it", swapCost(0.5, -6.5, 3, true).total, -16.25);
  near("triple adds 2 once: 10 nights = 12", swapCost(1, -1, 10, true).total, -12);
  near("0 nights: nothing, even with the triple ticked", swapCost(1, -6.5, 0, true).total, 0);
  nan("zero lots: NaN", swapCost(0, -6.5, 3, true).total);
  nan("negative lots: NaN", swapCost(-1, -6.5, 3, true).total);
  nan("negative nights: NaN", swapCost(1, -6.5, -1, false).total);
  nan("missing swap: NaN", swapCost(1, NaN, 3, false).total);
}

console.log("-- Lots / balance presets");
{
  const want = { low: ["10000", "1", 1], medium: ["5000", "1", 2], high: ["3000", "1", 3.33] } as const;
  eq("three presets, low to high", BALANCE_PRESETS.map((x) => x.key), ["low", "medium", "high"]);
  for (const x of BALANCE_PRESETS) {
    const w = want[x.key];
    eq(`${x.key}: fields ${w[0]} / ${w[1]}`, [x.unitAmt, x.lotsPerUnit], [w[0], w[1]]);
    near(`${x.key}: 10,000 balance = ${w[2]} lots`, lotsFromBalanceRule(10000, parseNum(x.unitAmt), parseNum(x.lotsPerUnit)), w[2], 1e-9);
    eq(`${x.key}: the chip is selected by its values`, balancePresetOf(x.unitAmt, x.lotsPerUnit), x.key);
  }
  eq("editing a field deselects the chip", balancePresetOf("5000", "1.5"), null);
  eq("a decimal comma still matches", balancePresetOf("10000", "1,0"), "low");
  eq("the default 1000 / 0.01 matches none", balancePresetOf("1000", "0.01"), null);
}

console.log("-- Risk management");
{
  // anti-martingale: base / 2^floor(streak / haveAfter)
  near("2% base, 2 losses, halve every 2 = 1%", antiMartingaleRisk(2, 2, 2), 1, 1e-12);
  near("2% base, 4 losses, halve every 2 = 0.5%", antiMartingaleRisk(2, 4, 2), 0.5, 1e-12);
  near("no losses: the base", antiMartingaleRisk(2, 0, 2), 2, 1e-12);
  near("1 loss (below the threshold): the base", antiMartingaleRisk(2, 1, 2), 2, 1e-12);
  near("3 losses: still one halving", antiMartingaleRisk(2, 3, 2), 1, 1e-12);
  near("halve after every loss: 3 losses = base / 8", antiMartingaleRisk(4, 3, 1), 0.5, 1e-12);
  nan("a base of 0", antiMartingaleRisk(0, 2, 2));
  nan("a negative streak", antiMartingaleRisk(2, -1, 2));
  nan("halving after 0 losses", antiMartingaleRisk(2, 2, 0));
  nan("a missing number", antiMartingaleRisk(NaN, 2, 2));

  // the account's current losing streak, from the end of its closed trades
  const at = (pnl: number | null, day: number, status: "open" | "closed" = "closed"): Trade => ({ ...tr(pnl, status), exitTime: `2025-02-${String(day).padStart(2, "0")}T10:00` });
  eq("streak: 3 losses after a win", currentLossStreak([at(50, 1), at(-10, 2), at(-10, 3), at(-10, 4)]), 3);
  eq("streak: a win last = 0", currentLossStreak([at(-10, 1), at(-10, 2), at(50, 3)]), 0);
  eq("streak: input order does not matter", currentLossStreak([at(-10, 4), at(50, 1), at(-10, 3), at(-10, 2)]), 3);
  eq("streak: open trades and missing results are ignored", currentLossStreak([at(50, 1), at(-10, 2), at(-99, 3, "open"), at(null, 4)]), 1);
  eq("streak: a break-even neither adds nor ends it", currentLossStreak([at(50, 1), at(-10, 2), at(0, 3), at(-10, 4)], 1), 2);
  eq("streak: no trades", currentLossStreak([]), 0);

  // rules: the same maths as Position size
  const bal = 10000;
  const r1 = riskRuleResult({ method: "pct", pct: 1 }, bal);
  near("Fixed 1% on 10,000 = 100 risk", r1.riskMoney, 100, 1e-9);
  near("Fixed 1%: riskPct 1", r1.riskPct, 1, 1e-9);
  near("Fixed 2% on 10,000 = 200", riskRuleResult({ method: "pct", pct: 2 }, bal).riskMoney, 200, 1e-9);
  near("same as positionSize's risk (pct)", r1.riskMoney, positionSize({ balance: bal, mode: "pct", pct: 1, amt: 0, spec: symbolSpec("EURUSD"), contract: 100000, entry: 1.1, stop: 1.09, cur: "USD", rate: 1 }).riskMoney, 1e-9);
  const ra = riskRuleResult({ method: "amt", amt: 50 }, bal);
  near("fixed money: 50 is 0.5%", ra.riskPct, 0.5, 1e-9);
  near("same as positionSize's risk (amt)", ra.riskMoney, positionSize({ balance: bal, mode: "amt", pct: 0, amt: 50, spec: symbolSpec("EURUSD"), contract: 100000, entry: 1.1, stop: 1.09, cur: "USD", rate: 1 }).riskMoney, 1e-9);
  near("lot per balance 10000/1 on 25,000 = 2.5 lots", riskRuleResult({ method: "balance", unitAmt: 10000, lotsPerUnit: 1 }, 25000).lots, lotsFromBalanceRule(25000, 10000, 1), 1e-12);
  near("... = 2.50", riskRuleResult({ method: "balance", unitAmt: 10000, lotsPerUnit: 1 }, 25000).lots, 2.5, 1e-9);
  ok("a bad balance or bad values are not ok", !riskRuleResult({ method: "pct", pct: 1 }, 0).ok && !riskRuleResult({ method: "pct", pct: 0 }, bal).ok && !riskRuleResult({ method: "pct", pct: 101 }, bal).ok && !riskRuleResult({ method: "balance", unitAmt: 0, lotsPerUnit: 1 }, bal).ok);
  eq("the catalogue: 4 worked out here, 3 links, 1 warning", [RISK_BUILTINS.filter((b) => b.kind === "calc").length, RISK_BUILTINS.filter((b) => b.kind === "link").map((b) => b.link), RISK_BUILTINS.filter((b) => b.kind === "warn").map((b) => b.key)], [4, ["kelly", "atr", "port"], ["martingale"]]);

  // custom presets: add, compute, delete, through a storage like localStorage
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, raw: m }; };
  const st = mem();
  eq("nothing saved reads as none", readRiskPresets(st), []);
  let list: CustomRiskPreset[] = [];
  const a1 = addRiskPreset(list, "  My 1.5%  ", { method: "pct", pct: 1.5 }, "id1");
  eq("add: no error, the id comes back", [a1.error, a1.id], [null, "id1"]);
  list = a1.list;
  list = addRiskPreset(list, "Fifty flat", { method: "amt", amt: 50 }, "id2").list;
  list = addRiskPreset(list, "Per 5k", { method: "balance", unitAmt: 5000, lotsPerUnit: 0.5 }, "id3").list;
  eq("the name is trimmed, 3 saved", list.map((p) => p.name), ["My 1.5%", "Fifty flat", "Per 5k"]);
  ok("saved under mizan-calc-risk-presets", writeRiskPresets(st, list) && st.raw.has(RISK_PRESETS_KEY) && RISK_PRESETS_KEY === "mizan-calc-risk-presets");
  eq("round-trip through storage", readRiskPresets(st), list);
  near("a custom % computes like its method", riskRuleResult(readRiskPresets(st)[0].rule, bal).riskMoney, 150, 1e-9);
  near("a custom amount computes like its method", riskRuleResult(readRiskPresets(st)[1].rule, bal).riskMoney, 50, 1e-9);
  near("a custom lot/balance computes like lotsFromBalanceRule", riskRuleResult(readRiskPresets(st)[2].rule, bal).lots, lotsFromBalanceRule(bal, 5000, 0.5), 1e-12);
  const up = updateRiskPreset(list, "id2", "Sixty flat", { method: "amt", amt: 60 });
  eq("edit replaces in place, same position", [up.error, up.list.map((p) => p.name), (up.list[1].rule as { amt: number }).amt], [null, ["My 1.5%", "Sixty flat", "Per 5k"], 60]);
  eq("edit with bad values is refused, list unchanged", updateRiskPreset(list, "id2", "x", { method: "amt", amt: -1 }).list, list);
  list = deleteRiskPreset(list, "id2");
  writeRiskPresets(st, list);
  eq("delete removes only that one, and it stays removed", readRiskPresets(st).map((p) => p.id), ["id1", "id3"]);
  eq("deleting an unknown id changes nothing", deleteRiskPreset(list, "nope"), list);
  eq("an empty name is refused", addRiskPreset(list, "   ", { method: "pct", pct: 1 }).error, "name");
  eq("a bad value is refused", addRiskPreset(list, "x", { method: "pct", pct: 0 }).error, "values");
  eq("garbage in storage reads as none", readRiskPresets({ getItem: () => "{not json" }), []);
  eq("malformed entries are dropped on read", parseRiskPresets([{ id: "a", name: "ok", rule: { method: "pct", pct: 2 } }, { id: "b", name: "", rule: { method: "pct", pct: 2 } }, { id: "c", name: "bad", rule: { method: "pct", pct: -2 } }, { id: "a", name: "dup", rule: { method: "pct", pct: 3 } }, 7, null]).map((p) => p.id), ["a"]);

  // the cap: 20, never dropping the oldest
  let full: CustomRiskPreset[] = [];
  for (let i = 0; i < RISK_PRESET_CAP; i++) full = addRiskPreset(full, `P${i}`, { method: "pct", pct: 1 }, `i${i}`).list;
  eq("20 presets fit", full.length, 20);
  const over = addRiskPreset(full, "one too many", { method: "pct", pct: 1 }, "x");
  eq("the 21st is refused with the cap error", [over.error, over.id], ["cap", null]);
  eq("the list is untouched: the oldest is still there", [over.list.length, over.list[0].id, over.list[19].id], [20, "i0", "i19"]);
  eq("after a delete there is room again", addRiskPreset(deleteRiskPreset(full, "i5"), "again", { method: "pct", pct: 1 }, "y").error, null);
  eq("a stored list over the cap is cut to 20 on read", parseRiskPresets([...full, { id: "z", name: "z", rule: { method: "pct", pct: 1 } }]).length, 20);

  // "Use in Position size": the shape Position size reads from mizan-size-calc
  eq("the shared key", SIZE_STATE_KEY, "mizan-size-calc");
  const sized = (rule: RiskRule, acc: string | undefined, before?: object) => {
    const s = mem();
    if (before) s.setItem(SIZE_STATE_KEY, JSON.stringify(before));
    const wrote = writeSizeState(s, sizeStatePatch(rule, acc));
    return { wrote, saved: JSON.parse(s.getItem(SIZE_STATE_KEY) ?? "null") };
  };
  eq("pct: mode, pct and the account", sized({ method: "pct", pct: 1.5 }, "acc1").saved, { acc: "acc1", mode: "pct", pct: "1.5" });
  eq("amt: mode and amt", sized({ method: "amt", amt: 250 }, "acc1").saved, { acc: "acc1", mode: "amt", amt: "250" });
  eq("balance: mode, unitAmt and lotsPerUnit", sized({ method: "balance", unitAmt: 10000, lotsPerUnit: 1 }, "acc1").saved, { acc: "acc1", mode: "balance", unitAmt: "10000", lotsPerUnit: "1" });
  eq("no account: the saved one is left alone", sized({ method: "pct", pct: 1 }, undefined, { acc: "keep", sym: "XAUUSD", pct: "3" }).saved, { acc: "keep", sym: "XAUUSD", pct: "1", mode: "pct" });
  eq("other saved fields (symbol, pip sizes) stay", sized({ method: "amt", amt: 40 }, "a", { sym: "EURUSD", pipSizes: { XAUUSD: "0.1" }, unit: "price" }).saved, { sym: "EURUSD", pipSizes: { XAUUSD: "0.1" }, unit: "price", acc: "a", mode: "amt", amt: "40" });
  eq("unreadable saved state is started over", (() => { const s = mem(); s.setItem(SIZE_STATE_KEY, "{oops"); writeSizeState(s, sizeStatePatch({ method: "pct", pct: 2 }, "a")); return JSON.parse(s.getItem(SIZE_STATE_KEY) ?? "null"); })(), { acc: "a", mode: "pct", pct: "2" });
  ok("a storage that refuses reports false", !writeSizeState({ getItem: () => null, setItem: () => { throw new Error("blocked"); } }, { mode: "pct" }));
  // what Position size then computes from that state equals what Risk management showed
  const back = sized({ method: "balance", unitAmt: 5000, lotsPerUnit: 1 }, "a").saved;
  near("Position size's lots from the saved state = this calculator's", lotsFromBalanceRule(bal, parseNum(back.unitAmt), parseNum(back.lotsPerUnit)), riskRuleResult({ method: "balance", unitAmt: 5000, lotsPerUnit: 1 }, bal).lots, 1e-12);
  ok("a rule's validity", validRiskRule({ method: "pct", pct: 100 }) && !validRiskRule({ method: "amt", amt: NaN }));
  near("the example: Fixed 1% on 10,000 = 100", (calcExample("riskmgmt").out.risk as { v: number }).v, 100, 1e-9);
}

console.log("-- How to use examples");
{
  const val = (k: Parameters<typeof calcExample>[0], key: string) => (calcExample(k).out[key] as Exclude<Fv, string>).v;
  const spec = symbolSpec("EURUSD"), C = 100000;
  const sz = positionSize({ balance: EX.size.balance, mode: "pct", pct: EX.size.riskPct, amt: 0, spec, contract: C, entry: 0, stop: 0, cur: "USD", rate: 1, dist: EX.size.stopPips * EX.size.pip, price: EX.size.price, pip: EX.size.pip });
  near("size: lots match positionSize", val("size", "lots"), sz.lots);
  near("size: 20 pips / 10,000 / 1% = 0.50 lot", val("size", "lots"), 0.5);
  near("dd: matches drawdownRecovery(20)", val("dd", "gain"), drawdownRecovery(20));
  near("dd: 20% needs 25%", val("dd", "gain"), 25);
  near("wr: matches requiredWinRate(2)", val("wr", "wr"), requiredWinRate(2));
  near("wr: RR 2 needs 33.3%", val("wr", "wr"), 33.3, 0.05);
  near("exp: matches expectancy(54, 182, 121)", val("exp", "e"), expectancy(54, 182, 121).e);
  near("exp: 42.62", val("exp", "e"), 42.62);
  near("kelly: matches kellyFull(54, 1.504)", val("kelly", "f"), kellyFull(54, 1.504).f * 100);
  near("kelly: 0.2341", val("kelly", "f") / 100, 0.2341, 0.0001);
  eq("prop: matches challengePlan", val("prop", "trades"), challengePlan({ target: 8, daily: 5, max: 10, risk: 0.5, rr: 2, winRate: 54 }).trades);
  eq("prop: 54% / RR 2 / 0.5% / 8% target = 26 trades", val("prop", "trades"), 26);
  eq("streak: matches likelyLongestRun(26, 0.46)", val("streak", "k"), likelyLongestRun(26, 0.46));
  near("comp: matches compound()", val("comp", "final"), (compound(1000, 5, 12) as { final: number }).final);
  near("cost: matches tradeCost", val("cost", "total"), tradeCost({ lots: 1, spreadPips: 1.2, pip: 0.0001, contract: C, rate: 1, commissionPerLot: 7 }).total);
  near("swap: matches swapCost", val("swap", "total"), swapCost(1, -6.5, 3, true).total);
  near("margin: matches marginFor", val("margin", "margin"), marginFor(spec, "USD", 1, C, 1.1, 100, 1).margin);
  near("pl: matches profitLoss", val("pl", "money"), profitLoss("buy", 0.5, 1.1, 1.104, C, 1).money);
  near("pct: matches percentCalc", val("pct", "r"), percentCalc("change", 10000, 11200).value as number);
  near("rr: matches riskReward", val("rr", "rr"), riskReward(1.1, 1.098, 1.104).rr);
  near("ruin: matches riskOfRuin", val("ruin", "ruin"), riskOfRuin(EX.ruin));
  near("fx: matches convertFx", val("fx", "r"), convertFx(100, "USD", "EUR", { USD: { rate: 1 }, EUR: { rate: 0.92 } }));
  near("std: 12.5 x 4 = 50 through the keypad", val("std", "r"), 50);
  const keysOf = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  for (const k of CALC_KEYS) {
    const ex = calcExample(k), h = HOW[k];
    eq(`${k}: one label per example input`, h.labels.length, ex.inputs.length);
    const sets = (["en", "ar", "fr"] as const).map((lg) => [...new Set(keysOf(h.result[lg]))].sort().join());
    ok(`${k}: AR / EN / FR use the same {keys}`, sets[0] === sets[1] && sets[1] === sets[2], sets.join(" | "));
    const missing = keysOf(h.result.en).filter((x) => !(x in ex.out));
    ok(`${k}: every {key} of the result text has a computed value`, missing.length === 0, missing.join(","));
    ok(`${k}: the example values are finite`, Object.values(ex.out).every((x) => typeof x === "string" || Number.isFinite(x.v)));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
