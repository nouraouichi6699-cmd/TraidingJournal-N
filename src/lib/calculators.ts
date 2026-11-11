// The Calculators page's maths. Pure functions, covered by calculators.test.ts; the components only read inputs and
// show what comes back. Prices are in the symbol's quote currency, money in the account's, percents in percent units
// (0.5 means 0.5%). Anything missing or impossible comes back as NaN / null with a reason, never as a number to show.
import { contrastRatio, mixHex, relLuminance } from "./lighting";
import { classifyOutcome } from "./outcome";
import { lotsFor, needsRate, pipsToDistance, quoteToAccountRate, type SymbolSpec } from "./calcCore";
import { monteCarlo, rng, type McResult } from "./chartAnalytics";
import type { Challenge } from "./challenge";
import type { Trade } from "../types";

export type { McResult } from "./chartAnalytics";

export {
  defaultPipSize, lotsFor, lotsFromBalanceRule, needsPrice, needsRate, parseNum, pipSizeFor, pipsToDistance, positionSize, quoteToAccountRate, rateKey, symbolSpec,
  type DistUnit, type SizeInput, type SymbolSpec,
} from "./calcCore";

// ---------- the catalogue ----------

export type CalcKey = "size" | "rr" | "pl" | "pip" | "margin" | "atr" | "dd" | "ruin" | "streak" | "port" | "exp" | "wr" | "kelly" | "mc" | "prop" | "comp" | "std" | "fx" | "pct" | "units" | "cost" | "swap";
export type GroupKey = "setup" | "risk" | "system" | "prop" | "general";

/** The five groups in page order, with their colour and calculators. `journal`: fills itself from the journal;
 *  `ready`: built (the others say "coming soon"). */
export const CALC_GROUPS: { key: GroupKey; color: string; items: CalcKey[] }[] = [
  { key: "setup", color: "#22c55e", items: ["size", "rr", "pl", "pip", "margin", "atr", "units", "cost", "swap"] },
  { key: "risk", color: "#ef4444", items: ["dd", "ruin", "streak", "port"] },
  { key: "system", color: "#d946ef", items: ["exp", "wr", "kelly", "mc"] },
  { key: "prop", color: "#f97316", items: ["prop", "comp"] },
  { key: "general", color: "#94a3b8", items: ["std", "fx", "pct"] },
];
export const CALC_JOURNAL: ReadonlySet<CalcKey> = new Set<CalcKey>(["size", "atr", "dd", "ruin", "streak", "port", "exp", "kelly", "mc", "prop", "comp", "cost"]);
export const CALC_KEYS: CalcKey[] = CALC_GROUPS.flatMap((g) => g.items);
export const CALC_READY: ReadonlySet<CalcKey> = new Set<CalcKey>(CALC_KEYS);
export const isCalcKey = (k: unknown): k is CalcKey => typeof k === "string" && (CALC_KEYS as string[]).includes(k);
export const groupOf = (k: CalcKey) => CALC_GROUPS.find((g) => g.items.includes(k)) ?? CALC_GROUPS[0];

/** Lower case, accents and Arabic marks off, so "Remplies" finds "remplies" and "الربح" ignores tashkeel. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ًͯ-ٰٟ]/g, "").toLowerCase().trim();
/** True when every word of the query is in one of the texts (a name or a description, in the page's language). */
export function matchesQuery(q: string, ...texts: string[]): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(texts.join(" "));
  return words.every((w) => hay.includes(w));
}

/** The recently used list with this calculator first: no repeats, at most `max`, unknown keys dropped. */
export function pushRecentCalc(list: unknown, key: CalcKey, max = 3): CalcKey[] {
  const prev = Array.isArray(list) ? list.filter(isCalcKey) : [];
  return [key, ...prev.filter((k) => k !== key)].slice(0, max);
}
export const DEFAULT_RECENT: CalcKey[] = ["prop", "size", "rr"];

// ---------- readability ----------

/**
 * A colour to write text in on `bg`: the colour itself when it already reaches `min` contrast, else the closest shade
 * that does, darker on a light background and lighter on a dark one. Uses the same contrast maths as the theme guard.
 */
export function readableTone(color: string, bg: string, min = 3): string {
  if (contrastRatio(color, bg) >= min) return color;
  const toward = relLuminance(bg) > 0.18 ? "#000000" : "#ffffff";
  for (let t = 0.04; t <= 1 + 1e-9; t += 0.04) {
    const c = mixHex(color, toward, Math.min(1, t));
    if (contrastRatio(c, bg) >= min) return c;
  }
  return toward;
}

// ---------- Risk / Reward ----------

export type RrError = "missing" | "stopAtEntry" | "targetAtEntry" | "sameSide";
export interface RrResult { ok: boolean; error: RrError | null; side: "buy" | "sell" | null; risk: number; reward: number; rr: number; beWinRate: number }

const rrBad = (error: RrError, side: RrResult["side"] = null): RrResult => ({ ok: false, error, side, risk: NaN, reward: NaN, rr: NaN, beWinRate: NaN });
const rrOk = (side: RrResult["side"], risk: number, reward: number): RrResult => {
  const rr = reward / risk;
  return { ok: true, error: null, side, risk, reward, rr, beWinRate: (1 / (1 + rr)) * 100 };
};

/** Reward-to-risk from an entry, a stop and a target. A stop below the entry is a buy (the target must be above it). */
export function riskReward(entry: number, stop: number, target: number): RrResult {
  if (![entry, stop, target].every(Number.isFinite)) return rrBad("missing");
  if (stop === entry) return rrBad("stopAtEntry");
  const side = stop < entry ? "buy" : "sell";
  if (target === entry) return rrBad("targetAtEntry", side);
  if ((side === "buy" && target < entry) || (side === "sell" && target > entry)) return rrBad("sameSide", side);
  return rrOk(side, Math.abs(entry - stop), Math.abs(target - entry));
}

/** Reward-to-risk from a stop and a target typed in pips (distances from the entry, so no direction): target / stop.
 *  `risk` and `reward` come back in pips. */
export function riskRewardPips(stopPips: number, targetPips: number): RrResult {
  if (![stopPips, targetPips].every(Number.isFinite)) return rrBad("missing");
  if (stopPips === 0) return rrBad("stopAtEntry");
  if (targetPips === 0) return rrBad("targetAtEntry");
  return rrOk(null, Math.abs(stopPips), Math.abs(targetPips));
}

/** Money for a price distance on some lots: distance x contract x lots x quote-to-account rate. */
export const moneyFor = (dist: number, contract: number, lots: number, rate: number): number => dist * contract * lots * rate;

// ---------- Profit and loss ----------

/** The result of a trade from its entry to its exit, in the account currency. `move` is the price move in the trade's favour. */
export function profitLoss(side: "buy" | "sell", lots: number, entry: number, exit: number, contract: number, rate: number) {
  const move = side === "buy" ? exit - entry : entry - exit;
  return { move, money: move * contract * lots * rate };
}

/** The same from a result typed in pips (negative: a loss). `move` is that result as a price distance. */
export function profitLossPips(pips: number, pip: number, lots: number, contract: number, rate: number) {
  const move = pipsToDistance(pips, pip);
  return { move, money: move * contract * lots * rate };
}

// ---------- Pip value ----------

/** What one price step (a pip for forex) is worth for 1 lot and for `lots`, in the account currency. */
export function pipValue(step: number, contract: number, rate: number, lots: number) {
  const perLot = step * contract * rate;
  return { perLot, total: perLot * lots };
}

// ---------- Unit conversion ----------

export type UnitKind = "lot" | "units" | "oz";
/**
 * Lots, units and ounces / contract units of one position, from whichever one was typed. 1 lot = `contract` units
 * (forex 100,000 of the base currency, gold 100 oz, silver 5,000 oz), so "units" and "oz / contract" are the same
 * quantity: ounces for a metal, base-currency units for a pair. NaN for anything not positive.
 */
export function convertUnits(kind: UnitKind, value: number, contract: number) {
  const ok = Number.isFinite(value) && value > 0 && Number.isFinite(contract) && contract > 0;
  if (!ok) return { lots: NaN, units: NaN, oz: NaN };
  const lots = kind === "lot" ? value : value / contract;
  const units = lots * contract;
  return { lots, units, oz: units };
}

// ---------- Trade cost ----------

/**
 * What opening and closing a trade costs before it moves: the spread (lots x pip value x spread in pips) plus the
 * round-turn commission (lots x rate per lot), in the account currency, and that total as pips of price move
 * (total / the position's pip value). `pip` is the pip size, `rate` the quote-to-account rate. NaN when an input is
 * missing, lots or pip value is not positive, or the spread or commission is negative.
 */
export function tradeCost(i: { lots: number; spreadPips: number; pip: number; contract: number; rate: number; commissionPerLot: number }) {
  const pv = pipValue(i.pip, i.contract, i.rate, 1).perLot; // one pip, one lot
  const ok = [i.lots, i.spreadPips, i.commissionPerLot].every(Number.isFinite) && i.lots > 0 && i.spreadPips >= 0 && i.commissionPerLot >= 0 && Number.isFinite(pv) && pv > 0;
  if (!ok) return { pipValuePerLot: pv, spread: NaN, commission: NaN, total: NaN, breakevenPips: NaN };
  const spread = i.lots * pv * i.spreadPips, commission = i.lots * i.commissionPerLot, total = spread + commission;
  return { pipValuePerLot: pv, spread, commission, total, breakevenPips: total / (i.lots * pv) };
}

/** The account's average round-turn commission per lot over its closed trades (null when none has lots). A trade's
 *  commission is its whole round-turn charge; the sign it is stored with does not matter. */
export function avgCommissionPerLot(trades: Trade[], accountId: string | undefined): number | null {
  let comm = 0, lots = 0;
  for (const t of trades) {
    if (t.accountId !== accountId || t.status !== "closed" || !(t.qty > 0)) continue;
    const c = t.commissionOwn ?? t.commission;
    if (!Number.isFinite(c)) continue;
    comm += Math.abs(c);
    lots += t.qty;
  }
  return lots > 0 ? comm / lots : null;
}

// ---------- Swap ----------

/**
 * The swap over a holding period: lots x swap per lot per night x the nights. Negative is a cost, positive a credit.
 * Assumption: the triple-swap day (Wednesday for FX) charges two extra nights once, when at least one night is held.
 * Brokers differ (some triple on Friday, metals on another day); this takes the standard FX convention.
 * NaN for lots not positive, a negative night count, or a missing swap.
 */
export function swapCost(lots: number, swapPerLot: number, nights: number, triple: boolean) {
  const ok = Number.isFinite(lots) && lots > 0 && Number.isFinite(swapPerLot) && Number.isFinite(nights) && nights >= 0;
  if (!ok) return { perNight: NaN, nightsEq: NaN, total: NaN };
  const nightsEq = nights >= 1 && triple ? nights + 2 : nights;
  const perNight = lots * swapPerLot;
  return { perNight, nightsEq, total: perNight * nightsEq };
}

// ---------- Margin ----------

/**
 * The margin a position locks, in the account currency: the position's value over the leverage. When the account
 * currency is the pair's base the value is just lots x contract (no price needed); otherwise it is lots x contract x
 * price in the quote currency, turned into the account's (x1 when they match, else the typed rate).
 */
export function marginFor(sp: SymbolSpec, cur: string, lots: number, contract: number, price: number, leverage: number, typedRate: number) {
  const units = lots * contract;
  const notional = sp.base && sp.base === cur ? units : units * price * quoteToAccountRate(sp, cur, price, typedRate);
  return { notional, margin: leverage > 0 ? notional / leverage : NaN, needRate: needsRate(sp, cur), needPrice: !(sp.base && sp.base === cur) };
}

// ---------- ATR size ----------

/**
 * Lots for a stop set at `mult` x ATR (in price units), risking `riskPct` of the balance, the same way the position
 * size is found. The price is only needed when the account currency is the pair's base (to convert the quote).
 */
export function atrSize(i: { balance: number; riskPct: number; atr: number; mult: number; spec: SymbolSpec; contract: number; cur: string; price: number; rate: number }) {
  const dist = Number.isFinite(i.atr) && i.atr > 0 && Number.isFinite(i.mult) && i.mult > 0 ? i.atr * i.mult : NaN;
  const rate = quoteToAccountRate(i.spec, i.cur, i.price, i.rate);
  const riskMoney = (i.balance * i.riskPct) / 100;
  const perLot = dist * i.contract * rate;
  const lots = lotsFor(riskMoney, perLot);
  return {
    dist, pips: i.spec.pip && dist > 0 ? dist / i.spec.pip : null, rate, riskMoney, perLot, lots,
    real: Number.isFinite(lots) ? lots * perLot : NaN, needRate: needsRate(i.spec, i.cur), needPrice: !!i.spec.base && i.spec.base === i.cur,
  };
}

// ---------- Challenge plan ----------

/** A challenge's profit target and loss limits as % of its size. Own-rule challenges keep theirs in `own`, possibly in money. */
export function challengeRulesPct(c: Challenge): { target: number | null; daily: number | null; max: number | null } {
  if (c.kind === "own" && c.own) {
    const pct = (l?: { v: number; unit: "money" | "pct" }) => (!l || !Number.isFinite(l.v) ? null : l.unit === "pct" ? l.v : c.size > 0 ? (l.v / c.size) * 100 : null);
    return { target: pct(c.own.goal), daily: pct(c.own.daily), max: pct(c.own.overall) };
  }
  return { target: c.target, daily: c.daily, max: c.max };
}

/** Win rate (% of closed trades won, the way Reports counts it) and average win over average loss, from closed trades. */
export function tradeEdge(trades: Trade[], breakEven = 0): { n: number; winRate: number | null; payoff: number | null } {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl));
  const pnl = (t: Trade) => (t.pnlOwn !== undefined && t.pnlOwn != null ? t.pnlOwn : t.pnl) as number;
  const wins = closed.filter((t) => classifyOutcome(pnl(t), { breakEven, decimals: 2 }) === "win");
  const losses = closed.filter((t) => classifyOutcome(pnl(t), { breakEven, decimals: 2 }) === "loss");
  const avgWin = wins.length ? wins.reduce((a, t) => a + pnl(t), 0) / wins.length : null;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, t) => a + pnl(t), 0)) / losses.length : null;
  return { n: closed.length, winRate: closed.length ? (wins.length / closed.length) * 100 : null, payoff: avgWin != null && avgLoss ? avgWin / avgLoss : null };
}

/**
 * P(the longest run of losses in n trades is at most k), each trade lost with probability q, by dynamic programming
 * over the length of the current run.
 */
export function longestRunAtMost(n: number, q: number, k: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  let cur = new Float64Array(k + 1), nxt = new Float64Array(k + 1);
  cur[0] = 1;
  for (let i = 0; i < n; i++) {
    nxt.fill(0);
    for (let r = 0; r <= k; r++) {
      const p = cur[r];
      if (!p) continue;
      nxt[0] += p * (1 - q);
      if (r < k) nxt[r + 1] += p * q;
    }
    [cur, nxt] = [nxt, cur];
  }
  let s = 0;
  for (let r = 0; r <= k; r++) s += cur[r];
  return s;
}

/** The exact distribution of the longest losing run over n trades: dist[k] = P(longest run = k). Stops once the rest is negligible. */
export function longestRunDist(n: number, q: number): number[] {
  const N = Math.max(0, Math.floor(n));
  if (!(q > 0)) return [1];
  if (q >= 1) return [...Array(N).fill(0), 1];
  const out: number[] = [];
  let prev = 0;
  for (let k = 0; k <= N; k++) {
    const F = longestRunAtMost(N, q, k);
    out.push(Math.max(0, F - prev));
    prev = F;
    if (F >= 1 - 1e-12) break;
  }
  return out;
}

/**
 * The single most likely longest losing run over n trades (the mode of the distribution above). It stops as soon as
 * the probability left over is smaller than the best one found, since no later length can beat it then.
 */
export function likelyLongestRun(n: number, q: number): number {
  const N = Math.max(0, Math.floor(n));
  if (!(q > 0)) return 0;
  if (q >= 1) return N;
  let best = 0, bestP = -1, prev = 0;
  for (let k = 0; k <= N; k++) {
    const F = longestRunAtMost(N, q, k), d = F - prev;
    if (d > bestP) { best = k; bestP = d; }
    prev = F;
    if (1 - F < bestP) break;
  }
  return best;
}

export interface PlanInput {
  target: number; // profit target, %
  daily: number; // daily loss limit, %
  max: number; // max loss limit, %
  risk: number; // risk per trade, %
  rr: number; // reward / risk
  winRate: number; // %
  /** The live room left before a rule breaks, as % of the balance (journal mode with an active challenge). */
  roomPct?: number | null;
}

/** The longest losing run horizon the streak is worked out over: beyond it the exact count is too slow to be worth it. */
export const STREAK_HORIZON = 5000;

/**
 * A challenge plan: the expectancy per trade (% of the balance), how many trades reach the target at that pace, how
 * many losses in a row each limit allows, the safe risk (a third of the daily limit, or of the live room left), and
 * the most likely longest losing streak on the way with what it costs.
 */
export function challengePlan(i: PlanInput) {
  const p = i.winRate / 100;
  const pos = (v: number) => Number.isFinite(v) && v > 0;
  const raw = Number.isFinite(p) && Number.isFinite(i.rr) && pos(i.risk) ? (p * i.rr - (1 - p)) * i.risk : NaN;
  const edge = Math.abs(raw) < 1e-9 ? 0 : raw; // an exact break-even edge, whatever the float rounding left
  const trades = pos(edge) && pos(i.target) ? Math.max(1, Math.ceil(i.target / edge - 1e-9)) : null;
  const lossesDaily = pos(i.daily) && pos(i.risk) ? Math.floor(i.daily / i.risk + 1e-9) : null;
  const lossesMax = pos(i.max) && pos(i.risk) ? Math.floor(i.max / i.risk + 1e-9) : null;
  const limit = [i.daily, i.max].filter(pos);
  const safe = i.roomPct != null && Number.isFinite(i.roomPct) ? Math.max(0, i.roomPct) / 3 : limit.length ? Math.min(...limit) / 3 : null;
  const overSafe = safe != null && pos(i.risk) ? i.risk > safe + 1e-9 : null;
  let streak: { n: number; k: number; cost: number; level: "ok" | "daily" | "max" } | null = null;
  if (trades != null && p > 0 && p <= 1) {
    const n = Math.min(trades, STREAK_HORIZON), k = likelyLongestRun(n, 1 - p), cost = k * i.risk;
    streak = { n, k, cost, level: pos(i.max) && cost >= i.max - 1e-9 ? "max" : pos(i.daily) && cost >= i.daily - 1e-9 ? "daily" : "ok" };
  }
  return { edge, trades, lossesDaily, lossesMax, safe, overSafe, streak };
}

// ---------- Compound growth ----------

export interface CompoundRow { i: number; balance: number; gain: number }

/**
 * A balance growing by `rate` % each period, with `deposit` added at the end of each one. `gain` is what the
 * period earned (the deposit apart). At most 1,200 periods.
 */
export function compound(start: number, rate: number, periods: number, deposit = 0) {
  const n = Math.floor(periods);
  const dep = Number.isFinite(deposit) ? deposit : 0;
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(rate) || rate <= -100 || !Number.isFinite(n) || n < 1 || n > 1200) return null;
  const rows: CompoundRow[] = [];
  let bal = start;
  for (let i = 1; i <= n; i++) {
    const gain = (bal * rate) / 100;
    bal = bal + gain + dep;
    rows.push({ i, balance: bal, gain });
  }
  const deposits = dep * n;
  return { rows, final: bal, deposits, gain: bal - start - deposits };
}

/** The average return per month (% of the balance at the start of each month), months with no balance left out. */
export function avgReturn(months: { start: number; pnl: number }[]): number | null {
  const r = months.filter((m) => Number.isFinite(m.start) && m.start > 0 && Number.isFinite(m.pnl)).map((m) => (m.pnl / m.start) * 100);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

/** Closed trades' results by the month they closed in ("YYYY-MM"), oldest first. */
export function pnlByMonth(trades: Trade[]): { month: string; pnl: number }[] {
  const m = new Map<string, number>();
  for (const t of trades) {
    if (t.status !== "closed" || t.pnl == null || !Number.isFinite(t.pnl)) continue;
    const at = (t.exitTime || t.entryTime || "").trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(at)) continue;
    m.set(at, (m.get(at) ?? 0) + t.pnl);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, pnl]) => ({ month, pnl }));
}

// ---------- Drawdown recovery ----------

/** Gain needed (%) to recover from a drawdown of `loss` % of the balance: loss / (100 - loss) × 100. */
export function drawdownRecovery(loss: number): number {
  if (!Number.isFinite(loss) || loss <= 0 || loss >= 100) return NaN;
  return (loss / (100 - loss)) * 100;
}

/** Current drawdown and maximum drawdown of a balance series, as % of the running peak. */
export function accountDrawdown(pts: { v: number }[]): { current: number; max: number } {
  if (pts.length < 2) return { current: NaN, max: NaN };
  let peak = pts[0].v, maxDd = 0;
  for (const p of pts) {
    if (p.v > peak) peak = p.v;
    if (peak > 0) maxDd = Math.max(maxDd, (peak - p.v) / peak * 100);
  }
  const last = pts[pts.length - 1].v;
  const cur = peak > 0 ? Math.max(0, (peak - last) / peak * 100) : 0;
  return { current: cur, max: maxDd };
}

// ---------- Risk of ruin ----------

export interface RuinInput {
  winRate: number; // %
  rr: number; // average reward / risk
  riskPct: number; // risk per trade %
  ruinLevel: number; // % of balance lost = ruin (default 50)
  nTrades: number; // horizon
}

/**
 * Fraction of `paths` that touch the ruin floor (1 - ruinLevel / 100) in `nTrades`, with fixed-fractional compounding:
 * win multiplies equity by (1 + rr × risk / 100), loss by (1 - risk / 100). Deterministic (seeded).
 */
export function riskOfRuin(i: RuinInput, paths = 10000, seed = 42): number {
  const p = i.winRate / 100;
  if (!Number.isFinite(p) || p < 0 || p > 1 || !Number.isFinite(i.rr) || i.rr <= 0 || !Number.isFinite(i.riskPct) || i.riskPct <= 0 || !Number.isFinite(i.ruinLevel) || i.ruinLevel <= 0 || i.ruinLevel >= 100 || !Number.isFinite(i.nTrades) || i.nTrades < 1) return NaN;
  const r = rng(seed);
  const floor = 1 - i.ruinLevel / 100;
  const winM = 1 + i.rr * i.riskPct / 100;
  const lossM = 1 - i.riskPct / 100;
  let ruined = 0;
  for (let path = 0; path < paths; path++) {
    let eq = 1;
    for (let k = 0; k < i.nTrades; k++) {
      eq = r() < p ? eq * winM : eq * lossM;
      if (eq <= floor) { ruined++; break; }
    }
  }
  return (ruined / paths) * 100;
}

/**
 * Highest risk % that keeps ruin under 1%, by binary search with 2,000 paths and a capped horizon of min(nTrades, 200).
 * Returns null when even 0.05% risks ruin ≥ 1%, or the system has no edge. Result rounded to 0.01%.
 */
export function safeRiskForRuin(i: Omit<RuinInput, "riskPct">, seed = 42): number | null {
  if (!Number.isFinite(i.winRate) || !Number.isFinite(i.rr) || !Number.isFinite(i.ruinLevel) || !Number.isFinite(i.nTrades)) return null;
  const short = { ...i, nTrades: Math.min(i.nTrades, 200) };
  const run = (r: number) => riskOfRuin({ ...short, riskPct: r }, 2000, seed);
  if (run(0.05) >= 1) return null;
  let lo = 0.05, hi = 25;
  if (run(hi) < 1) return hi;
  for (let n = 0; n < 20; n++) {
    const mid = (lo + hi) / 2;
    if (run(mid) < 1) lo = mid; else hi = mid;
  }
  return Math.round(lo * 100) / 100;
}

// ---------- Expectancy ----------

/** Expected P&L per trade and per 100 trades, in money and in R, plus the break-even win rate. */
export function expectancy(winRate: number, avgWin: number, avgLoss: number): { e: number; eR: number; beWinRate: number; per100: number } {
  const p = winRate / 100;
  const ok = Number.isFinite(p) && p >= 0 && p <= 1 && Number.isFinite(avgWin) && avgWin > 0 && Number.isFinite(avgLoss) && avgLoss > 0;
  if (!ok) return { e: NaN, eR: NaN, beWinRate: NaN, per100: NaN };
  const e = p * avgWin - (1 - p) * avgLoss;
  const eR = p * (avgWin / avgLoss) - (1 - p);
  const beWinRate = (avgLoss / (avgWin + avgLoss)) * 100;
  return { e, eR, beWinRate, per100: e * 100 };
}

// ---------- Required win rate ----------

/** Win rate % needed for an expectancy of `targetE` R per trade (default 0 = break-even): (E + 1) / (RR + 1). */
export function requiredWinRate(rr: number, targetE = 0): number {
  if (!Number.isFinite(rr) || rr <= 0) return NaN;
  return ((targetE + 1) / (rr + 1)) * 100;
}

// ---------- Kelly ----------

export interface KellyResult { f: number; half: number; quarter: number; ok: boolean }

/** Full Kelly fraction (p − (1−p)/b) and its half and quarter, where b = payoff (average win / average loss).
 *  `ok` is false when f* ≤ 0, meaning no edge. */
export function kellyFull(winRate: number, payoff: number): KellyResult {
  const p = winRate / 100;
  if (!Number.isFinite(p) || p < 0 || p > 1 || !Number.isFinite(payoff) || payoff <= 0) return { f: NaN, half: NaN, quarter: NaN, ok: false };
  const f = p - (1 - p) / payoff;
  if (f <= 0) return { f: 0, half: 0, quarter: 0, ok: false };
  return { f, half: f / 2, quarter: f / 4, ok: true };
}

// ---------- Monte Carlo (calculator) ----------

/**
 * A synthetic P&L sample of `n` trades built from win rate, average win and average loss using a seeded PRNG.
 * Used by the Monte Carlo calculator's manual mode to build a pool for the bootstrap simulation.
 */
export function buildPnlSample(winRate: number, avgWin: number, avgLoss: number, n: number, seed = 1): number[] {
  if (!Number.isFinite(winRate) || !Number.isFinite(avgWin) || avgWin <= 0 || !Number.isFinite(avgLoss) || avgLoss <= 0 || n < 2) return [];
  const p = winRate / 100;
  if (p < 0 || p > 1) return [];
  const r = rng(seed);
  return Array.from({ length: n }, () => r() < p ? avgWin : -avgLoss);
}

/**
 * Monte Carlo bootstrap on the given P&L pool (closed-trade results for journal mode, or a synthetic sample).
 * Settings match Charts > Monte Carlo: 1,000 paths, horizon = min(500, max(n, 20)), seed 42.
 */
export function runMonteCarlo(pnls: number[]): McResult | null {
  const pool = pnls.filter(Number.isFinite);
  if (pool.length < 2) return null;
  return monteCarlo(pool, { paths: 1000, horizon: Math.min(500, Math.max(pool.length, 20)), seed: 42 });
}

// ---------- Standard calculator ----------

export type StdOp = "+" | "-" | "*" | "/";
export type StdKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | StdOp | "%" | "neg" | "C" | "back" | "=";
/** `entry` is what the display shows, `acc` the number waiting for `op`, `fresh` that the next digit starts a new entry. */
export interface StdState { entry: string; acc: number | null; op: StdOp | null; fresh: boolean; error: boolean }
export const STD_START: StdState = { entry: "0", acc: null, op: null, fresh: false, error: false };
const STD_MAX_DIGITS = 15;

/** Rounds to 10 significant digits, which also clears float noise (0.1 + 0.2 shows 0.3). */
export const roundSig = (n: number, digits = 10): number => (Number.isFinite(n) ? Number(n.toPrecision(digits)) : n);
const stdFmt = (n: number): string => String(roundSig(n));

function stdApply(a: number, op: StdOp, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? NaN : a / b;
  }
}

/** One key press of a basic calculator: operations are done left to right as they are typed (2 + 3 x 4 = 20). */
export function stdPress(s: StdState, key: StdKey): StdState {
  if (key === "C") return STD_START;
  if (s.error) return s;
  const cur = Number(s.entry);
  const fail = (): StdState => ({ ...STD_START, entry: "Error", error: true });
  switch (key) {
    case "+": case "-": case "*": case "/": {
      if (s.op && !s.fresh && s.acc != null) {
        const r = stdApply(s.acc, s.op, cur);
        if (!Number.isFinite(r)) return fail();
        return { entry: stdFmt(r), acc: roundSig(r), op: key, fresh: true, error: false };
      }
      return { ...s, acc: s.op && s.acc != null ? s.acc : cur, op: key, fresh: true };
    }
    case "=": {
      if (!s.op || s.acc == null) return { ...s, fresh: true };
      const r = stdApply(s.acc, s.op, cur);
      if (!Number.isFinite(r)) return fail();
      return { entry: stdFmt(r), acc: null, op: null, fresh: true, error: false };
    }
    case "%": {
      const v = s.op && s.acc != null ? (s.acc * cur) / 100 : cur / 100;
      return { ...s, entry: stdFmt(v), fresh: false };
    }
    case "neg": return s.entry === "0" ? s : { ...s, entry: s.entry.startsWith("-") ? s.entry.slice(1) : `-${s.entry}` };
    case "back": {
      if (s.fresh) return s;
      const e = s.entry.slice(0, -1);
      return { ...s, entry: e === "" || e === "-" ? "0" : e };
    }
    case ".": {
      if (s.fresh) return { ...s, entry: "0.", fresh: false };
      return s.entry.includes(".") ? s : { ...s, entry: `${s.entry}.` };
    }
    default: {
      if (s.fresh) return { ...s, entry: key, fresh: false };
      if (s.entry.replace(/[-.]/g, "").length >= STD_MAX_DIGITS) return s;
      return { ...s, entry: s.entry === "0" ? key : s.entry === "-0" ? `-${key}` : s.entry + key };
    }
  }
}

/** The calculator key a keyboard key stands for, or null. */
export function stdKeyFromEvent(k: string): StdKey | null {
  if (/^[0-9]$/.test(k)) return k as StdKey;
  switch (k) {
    case ".": case ",": return ".";
    case "+": case "-": case "/": case "%": return k;
    case "*": case "x": case "X": return "*";
    case "Enter": case "=": return "=";
    case "Backspace": return "back";
    case "Escape": return "C";
    default: return null;
  }
}

// ---------- Currency converter ----------

/** The converter's currencies, in the order they are listed. */
export const FX_CURRENCIES = ["TND", "USD", "EUR", "GBP", "JPY", "CAD", "CHF", "AED", "SAR", "TRY", "BTC"] as const;
export type FxCode = (typeof FX_CURRENCIES)[number];
/** Fiat codes Frankfurter (ECB) does not publish; they come from open.er-api.com. */
export const FX_FROM_ERAPI: FxCode[] = ["TND", "AED", "SAR"];

/** What was fetched: units of each currency per 1 USD, and where each came from. */
export interface FxStore {
  at: number;
  live: Record<string, { rate: number; src: string }>;
  /** Hand-typed rates (units per 1 USD): kept across refreshes until reset. */
  manual: Record<string, number>;
}
export interface FxEffective { rate: number; src: string; manual: boolean }

const goodRate = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Frankfurter's response to `base=USD` as units per USD. */
export function parseFrankfurterUsd(j: unknown): Record<string, number> {
  const r = (j as { rates?: Record<string, unknown> } | null)?.rates ?? {};
  const out: Record<string, number> = {};
  for (const [c, v] of Object.entries(r)) if (goodRate(v)) out[c] = v;
  return out;
}
/** open.er-api.com's response for USD, as units per USD. */
export const parseErApiUsd = (j: unknown): Record<string, number> => {
  const o = j as { result?: string; rates?: Record<string, unknown> } | null;
  return o?.result === "success" ? parseFrankfurterUsd(o) : {};
};
/** CoinGecko's bitcoin price in USD as BTC per USD. */
export function parseCoingeckoBtc(j: unknown): number | null {
  const p = (j as { bitcoin?: { usd?: unknown } } | null)?.bitcoin?.usd;
  return goodRate(p) ? 1 / p : null;
}

/** A fresh fetch folded into what was saved: new live values win, a currency the fetch missed keeps its saved one, manual rates stay. */
export function mergeFx(prev: FxStore | null, live: Record<string, { rate: number; src: string }>, at: number): FxStore {
  return { at, live: { ...(prev?.live ?? {}), ...live }, manual: { ...(prev?.manual ?? {}) } };
}

/** The rates in use: USD is 1, a typed rate beats a fetched one. A currency with no rate is left out. */
export function effectiveFx(store: FxStore | null): Record<string, FxEffective> {
  const out: Record<string, FxEffective> = { USD: { rate: 1, src: "base", manual: false } };
  if (!store) return out;
  for (const c of FX_CURRENCIES) {
    if (c === "USD") continue;
    const m = store.manual[c], l = store.live[c];
    if (goodRate(m)) out[c] = { rate: m, src: "manual", manual: true };
    else if (l && goodRate(l.rate)) out[c] = { rate: l.rate, src: l.src, manual: false };
  }
  return out;
}

/** `amount` of `from` in `to`, through USD (rates are units per USD). NaN when a rate is missing. */
export function convertFx(amount: number, from: string, to: string, rates: Record<string, { rate: number }>): number {
  const a = rates[from]?.rate, b = rates[to]?.rate;
  if (!Number.isFinite(amount) || !goodRate(a) || !goodRate(b)) return NaN;
  return (amount / a) * b;
}

/** "live" right after a successful fetch, "saved" when the cached rates are used instead, "none" when there are none. */
export const fxStatus = (store: FxStore | null, fetched: boolean): "live" | "saved" | "none" => (!store ? "none" : fetched ? "live" : "saved");

// ---------- Percentage ----------

export type PctMode = "of" | "is" | "change";
/** The three percentage questions. `value` is null with a reason when it cannot be worked out (never Infinity or NaN). */
export function percentCalc(mode: PctMode, x: number, y: number): { value: number | null; reason: "missing" | "zero" | null } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { value: null, reason: "missing" };
  if (mode === "of") return { value: (y * x) / 100, reason: null };
  if (mode === "is") return y === 0 ? { value: null, reason: "zero" } : { value: (x / y) * 100, reason: null };
  return x === 0 ? { value: null, reason: "zero" } : { value: ((y - x) / x) * 100, reason: null };
}

// ---------- Losing streak table ----------

/** Table row: probability of at least one losing streak of exactly `k` or more in `n` trades with win-loss probability `q`. */
export function streakTableRow(n: number, q: number, k: number, risk: number): { k: number; pAtLeast: number; cost: number } {
  const pAtLeast = 1 - longestRunAtMost(n, q, k - 1);
  return { k, pAtLeast, cost: k * risk };
}

/** Table for k = 3..12 (or up to `maxK`). */
export function streakTable(n: number, q: number, risk: number, maxK = 12): { k: number; pAtLeast: number; cost: number }[] {
  const rows = [];
  for (let k = 3; k <= maxK; k++) rows.push(streakTableRow(n, q, k, risk));
  return rows;
}
