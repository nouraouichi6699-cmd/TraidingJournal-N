// Trade outcomes report (50 metrics). Pure TypeScript. Percentages are in percent units (36.46 = 36.46%).
import type { Trade } from "../types";
import { cents, tradeCore, ticketOf } from "./stats";

export const GROUPS = {
  tradeResults: ["totalTrades", "winningTrades", "losingTrades", "breakevenTrades", "winRate", "lossRate", "breakevenRate", "dailyWinRate", "winningDays", "losingDays", "breakevenDays"],
  edge: ["profitFactor", "tradeExpectancy", "expectancyPct", "payoffRatio", "breakevenWinRate", "winRateEdge", "averageTradePnl", "medianTradePnl", "averageWinningTrade", "medianWinningTrade", "averageLosingTrade", "medianLosingTrade", "largestWinningTrade", "largestLosingTrade"],
  dependence: ["winRateAfterWin", "winRateAfterLoss", "avgPnlAfterWin", "avgPnlAfterLoss", "alternationRate", "outcomeRuns", "runsZScore", "longestTradesWithoutWin", "longestTradesWithoutLoss"],
  streaks: ["currentWinStreak", "currentLossStreak", "maxWinStreak", "maxLossStreak", "avgWinStreak", "avgLossStreak", "currentWinDayStreak", "currentLossDayStreak", "maxWinDayStreak", "maxLossDayStreak", "maxConsecutiveProfit", "maxConsecutiveLoss", "topTradeProfitConc", "topFiveProfitConc", "worstTradeLossConc", "worstFiveLossConc"],
} as const;

export type OutcomeKey = (typeof GROUPS)[keyof typeof GROUPS][number];
export type TradeOutcomes = Record<OutcomeKey, number | null>;
export const ALL_KEYS: OutcomeKey[] = Object.values(GROUPS).flat() as OutcomeKey[];

/** Finite numbers only, never -0. */
const num = (x: number | null | undefined): number | null => (x == null || !Number.isFinite(x) ? null : x === 0 ? 0 : x);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : null);
const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

type O = "W" | "L";
/** Runs of equal outcomes in a W/L sequence: [{ o, len, sum }]. */
function runsOf(seq: { o: O; v: number }[]) {
  const out: { o: O; len: number; sum: number }[] = [];
  for (const x of seq) {
    const last = out[out.length - 1];
    if (last && last.o === x.o) { last.len++; last.sum += x.v; } else out.push({ o: x.o, len: 1, sum: x.v });
  }
  return out;
}
const maxLen = (r: { o: O; len: number }[], o: O) => Math.max(0, ...r.filter((x) => x.o === o).map((x) => x.len));
const curLen = (r: { o: O; len: number }[], o: O) => (r.length && r[r.length - 1].o === o ? r[r.length - 1].len : 0);

const closeKey = (t: Trade) => t.exitTime || t.entryTime || "";

export function computeTradeOutcomes(trades: Trade[], startBalance: number): TradeOutcomes {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null)
    .sort((a, b) => closeKey(a).localeCompare(closeKey(b)) || ticketOf(a) - ticketOf(b));
  const p = (t: Trade) => t.pnl as number;
  const core = tradeCore(closed);
  const n = core.n;

  // Days (close date), classified on the cent-rounded day sum.
  const dayMap = new Map<string, number>();
  for (const t of closed) { const d = closeKey(t).slice(0, 10); if (d) dayMap.set(d, (dayMap.get(d) ?? 0) + p(t)); }
  const days = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => cents(v));
  const winDays = days.filter((v) => v > 0).length, loseDays = days.filter((v) => v < 0).length;

  // Edge
  const winP = core.wins.map(p), lossP = core.losses.map(p);
  const bewr = core.payoff != null ? 100 / (1 + core.payoff) : null;
  let expPct: number | null = null;
  if (n && startBalance > 0) {
    let bal = startBalance, acc = 0, ok = true;
    for (const t of closed) { if (bal <= 0) { ok = false; break; } acc += (p(t) / bal) * 100; bal += p(t); }
    expPct = ok ? acc / n : null;
  }

  // Outcome sequence S (breakevens removed)
  const S = closed.filter((t) => cents(p(t)) !== 0).map((t) => ({ o: (cents(p(t)) > 0 ? "W" : "L") as O, v: p(t) }));
  const pairs = (o: O) => { let d = 0, same = 0; const next: number[] = []; for (let i = 0; i < S.length - 1; i++) if (S[i].o === o) { d++; if (S[i + 1].o === o) same++; next.push(S[i + 1].v); } return { d, same, next }; };
  const aw = pairs("W"), al = pairs("L");
  const runs = runsOf(S);
  let z: number | null = null;
  const n1 = S.filter((x) => x.o === "W").length, n2 = S.length - n1, nn = n1 + n2;
  if (n1 > 0 && n2 > 0 && nn >= 2) {
    const mu = (2 * n1 * n2) / nn + 1, v = (2 * n1 * n2 * (2 * n1 * n2 - nn)) / (nn * nn * (nn - 1));
    z = v > 0 ? (runs.length - mu) / Math.sqrt(v) : null;
  }
  let alt = 0; for (let i = 0; i < S.length - 1; i++) if (S[i].o !== S[i + 1].o) alt++;
  const longest = (bad: (v: number) => boolean) => { let best = 0, cur = 0; for (const t of closed) { if (bad(cents(p(t)))) { cur++; best = Math.max(best, cur); } else cur = 0; } return best; };

  // Day streaks (days with non-zero P&L)
  const dRuns = runsOf(days.filter((v) => v !== 0).map((v) => ({ o: (v > 0 ? "W" : "L") as O, v })));
  const wr = runs.filter((r) => r.o === "W"), lr = runs.filter((r) => r.o === "L");

  // Concentration
  const top = (a: number[], k: number) => sum([...a].sort((x, y) => y - x).slice(0, k));
  const worst = (a: number[], k: number) => Math.abs(sum([...a].sort((x, y) => x - y).slice(0, k)));

  const r: Record<OutcomeKey, number | null> = {
    totalTrades: n, winningTrades: core.wins.length, losingTrades: core.losses.length, breakevenTrades: core.be,
    winRate: core.winRate, lossRate: n ? (core.losses.length / n) * 100 : null, breakevenRate: core.beRate,
    dailyWinRate: ratio(winDays, days.length), winningDays: winDays, losingDays: loseDays, breakevenDays: days.length - winDays - loseDays,

    profitFactor: core.pf, tradeExpectancy: core.avgTrade, expectancyPct: expPct, payoffRatio: core.payoff,
    breakevenWinRate: bewr, winRateEdge: core.winRate != null && bewr != null ? core.winRate - bewr : null,
    averageTradePnl: core.avgTrade, medianTradePnl: median(closed.map(p)),
    averageWinningTrade: core.avgWin, medianWinningTrade: median(winP), averageLosingTrade: core.avgLoss, medianLosingTrade: median(lossP),
    largestWinningTrade: core.best, largestLosingTrade: core.worst,

    winRateAfterWin: ratio(aw.same, aw.d), winRateAfterLoss: ratio(al.d - al.same, al.d), avgPnlAfterWin: mean(aw.next), avgPnlAfterLoss: mean(al.next),
    alternationRate: S.length >= 2 ? (alt / (S.length - 1)) * 100 : null, outcomeRuns: runs.length, runsZScore: z,
    longestTradesWithoutWin: longest((v) => v <= 0), longestTradesWithoutLoss: longest((v) => v >= 0),

    currentWinStreak: curLen(runs, "W"), currentLossStreak: curLen(runs, "L"), maxWinStreak: maxLen(runs, "W"), maxLossStreak: maxLen(runs, "L"),
    avgWinStreak: mean(wr.map((x) => x.len)), avgLossStreak: mean(lr.map((x) => x.len)),
    currentWinDayStreak: curLen(dRuns, "W"), currentLossDayStreak: curLen(dRuns, "L"), maxWinDayStreak: maxLen(dRuns, "W"), maxLossDayStreak: maxLen(dRuns, "L"),
    maxConsecutiveProfit: wr.length ? Math.max(...wr.map((x) => x.sum)) : null, maxConsecutiveLoss: lr.length ? Math.min(...lr.map((x) => x.sum)) : null,
    topTradeProfitConc: ratio(top(winP, 1), core.gp), topFiveProfitConc: ratio(top(winP, 5), core.gp),
    worstTradeLossConc: ratio(worst(lossP, 1), core.gl), worstFiveLossConc: ratio(worst(lossP, 5), core.gl),
  };
  for (const k of ALL_KEYS) r[k] = num(r[k]);
  return r;
}

export interface RecentTrade { key: string; date: string; symbol: string; pnl: number; kind: "win" | "loss" | "be" }

/** The last `k` closed trades (close time, then ticket), oldest first. */
export function recentOutcomes(trades: Trade[], k = 60): RecentTrade[] {
  return trades.filter((t) => t.status === "closed" && t.pnl != null)
    .sort((a, b) => closeKey(a).localeCompare(closeKey(b)) || ticketOf(a) - ticketOf(b))
    .slice(-k)
    .map((t) => { const c = cents(t.pnl as number); return { key: t.key, date: closeKey(t).replace("T", " "), symbol: t.symbol, pnl: t.pnl as number, kind: c > 0 ? "win" : c < 0 ? "loss" : "be" }; });
}
