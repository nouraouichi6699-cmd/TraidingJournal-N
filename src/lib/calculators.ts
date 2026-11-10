// The Calculators page's maths. Pure functions, covered by calculators.test.ts; the components only read inputs and
// show what comes back. Prices are in the symbol's quote currency, money in the account's, percents in percent units
// (0.5 means 0.5%). Anything missing or impossible comes back as NaN / null with a reason, never as a number to show.
import { contrastRatio, mixHex, relLuminance } from "./lighting";
import { classifyOutcome } from "./outcome";
import { lotsFor, needsRate, pipsToDistance, quoteToAccountRate, type SymbolSpec } from "./calcCore";
import type { Challenge } from "./challenge";
import type { Trade } from "../types";

export {
  defaultPipSize, lotsFor, needsPrice, needsRate, parseNum, pipSizeFor, pipsToDistance, positionSize, quoteToAccountRate, rateKey, symbolSpec,
  type DistUnit, type SizeInput, type SymbolSpec,
} from "./calcCore";

// ---------- the catalogue ----------

export type CalcKey = "size" | "rr" | "pl" | "pip" | "margin" | "atr" | "dd" | "ruin" | "streak" | "port" | "exp" | "wr" | "kelly" | "mc" | "prop" | "comp";
export type GroupKey = "setup" | "risk" | "system" | "prop";

/** The four groups in page order, with their colour and calculators. `journal`: fills itself from the journal;
 *  `ready`: built (the others say "coming soon"). */
export const CALC_GROUPS: { key: GroupKey; color: string; items: CalcKey[] }[] = [
  { key: "setup", color: "#22c55e", items: ["size", "rr", "pl", "pip", "margin", "atr"] },
  { key: "risk", color: "#ef4444", items: ["dd", "ruin", "streak", "port"] },
  { key: "system", color: "#d946ef", items: ["exp", "wr", "kelly", "mc"] },
  { key: "prop", color: "#f97316", items: ["prop", "comp"] },
];
export const CALC_JOURNAL: ReadonlySet<CalcKey> = new Set<CalcKey>(["size", "atr", "dd", "ruin", "streak", "port", "exp", "kelly", "mc", "prop", "comp"]);
export const CALC_READY: ReadonlySet<CalcKey> = new Set<CalcKey>(["size", "rr", "pl", "pip", "margin", "atr", "prop", "comp"]);
export const CALC_KEYS: CalcKey[] = CALC_GROUPS.flatMap((g) => g.items);
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
