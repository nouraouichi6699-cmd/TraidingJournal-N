// Advanced statistics for Reports > Advanced statistics. Daily returns follow the Overview's Sharpe exactly (weekdays from
// the first to the last trading day + weekend days with trades, cash flows at the start of their day, P&L ÷ balance at the
// start of the day), so the ratios here line up with the Overview. Ratios on returns follow QuantStats definitions; trade
// statistics follow the Overview / Trade outcomes (net P&L, cent-rounded win / loss).
import type { Account, Trade } from "../types";
import { signed, type CashFlow } from "./cashflow";
import { monteCarlo } from "./chartAnalytics";
import { ticketOf } from "./stats";
import { tradeDay } from "./tradingTime";
import { tradeOutcome } from "./outcome";
import { rMultiple, sizing } from "./tradeLab";

const DAY = 864e5;
const cents = (x: number) => Math.round(x * 100) / 100;
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => sum(a) / a.length;
const sdev = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const fin = (x: number) => (Number.isFinite(x) ? x : null);
/** Linear-interpolation quantile of a sorted array (same as pandas / numpy default). */
const quantile = (s: number[], p: number) => { const k = (s.length - 1) * p, f = Math.floor(k), c = Math.ceil(k); return s[f] + (s[c] - s[f]) * (k - f); };
const pearson = (x: number[], y: number[]) => {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
};
/** Bias-corrected sample skewness and excess kurtosis (as pandas .skew() / .kurt() and Excel SKEW / KURT). */
export function moments(a: number[]): { skew: number | null; kurt: number | null } {
  const n = a.length, m = mean(a);
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of a) { const d = x - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  if (!(m2 > 1e-30)) return { skew: null, kurt: null };
  const g1 = m3 / m2 ** 1.5, g2 = m4 / m2 ** 2 - 3;
  return {
    skew: n >= 3 ? fin((Math.sqrt(n * (n - 1)) / (n - 2)) * g1) : null,
    kurt: n >= 4 ? fin(((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6)) : null,
  };
}
/** Standard normal CDF (erf approximation, error < 1.5e-7). */
export const normCdf = (z: number) => {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const e = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e);
};
// Student t 97.5% quantiles for 1..30 degrees of freedom; beyond, a Cornish-Fisher expansion (error < 1e-4).
const T975 = [12.706205, 4.302653, 3.182446, 2.776445, 2.570582, 2.446912, 2.364624, 2.306004, 2.262157, 2.228139, 2.200985, 2.178813, 2.160369, 2.144787, 2.13145, 2.119905, 2.109816, 2.100922, 2.093024, 2.085963, 2.079614, 2.073873, 2.068658, 2.063899, 2.059539, 2.055529, 2.051831, 2.048407, 2.04523, 2.042272];
export const t975 = (df: number) => {
  if (df <= 30) return T975[Math.max(1, Math.round(df)) - 1];
  const z = 1.959963985, z3 = z ** 3, z5 = z ** 5, z7 = z ** 7;
  return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2) + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3);
};
/** Small seeded PRNG (mulberry32), as in chartAnalytics: the same trades always give the same bootstrap. */
const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };

export type Range = [number, number];
export interface Advanced {
  n: number; start: number; tradingDays: number; days: number; months: number; // closed trades, capital, entry days, daily / monthly returns
  // return distribution
  gmDaily: number | null; gmMonthly: number | null; sdDaily: number | null; sdMonthly: number | null; skew: number | null; kurt: number | null;
  tail: number | null; g2p: number | null; g2l: number | null; csr: number | null; cpc: number | null; outWin: number | null; outLoss: number | null;
  posOut: number | null; negOut: number | null; autoc: number | null; stab: number | null; r2: number | null; runsZ: number | null;
  // return to risk
  consist: number | null; sharpe: number | null; sortino: number | null; acSharpe: number | null; acSortino: number | null; psr: number | null;
  annRet: number | null; burke: number | null; mBurke: number | null; painIdx: number | null; painRatio: number | null; ulcer: number | null; upi: number | null;
  // confidence
  ciWin: Range | null; ciExp: Range | null; ciPf: Range | null; ciMed: Range | null; ciRet: Range | null; minTrl: number | null; srDaily: number | null;
  // simulation and sizing
  kelly: { full: number; half: number; capped: boolean } | null; rN: number;
  mc: { paths: number; horizon: number; probProfit: number; med: number; p5: number; ddMed: number; dd95: number; ruin: number | null; rec: number | null } | null;
}

export const MIN_DAYS = 20, SHARPE_DAYS = 30, MIN_TRADES = 10, RUIN = 0.5;

/** `trades`: trades of the period; `accounts`: selected accounts with their balance at the period start; `flows`: cash flows of the period. */
export function advancedStats(trades: Trade[], accounts: Account[], flows: CashFlow[]): Advanced {
  const closeKey = (t: Trade) => t.exitTime || t.entryTime || "";
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl)).sort((a, b) => closeKey(a).localeCompare(closeKey(b)) || ticketOf(a) - ticketOf(b));
  const p = (t: Trade) => t.pnl as number;
  const ids = [...new Set(closed.map((t) => t.accountId))];
  const start = accounts.filter((a) => ids.includes(a.id)).reduce((s, a) => s + (a.startBalance || 0), 0); // as the Overview
  const tradingDays = new Set(closed.filter((t) => t.entryTime && t.entryTime.length >= 13).map((t) => (t.entryTime as string).slice(0, 10))).size;

  // ----- daily returns (the Overview's Sharpe series) and monthly returns (daily returns compounded by calendar month)
  const byDay: Record<string, number> = {}, flowDay: Record<string, number> = {};
  for (const t of closed) { const d = tradeDay(t, closeKey(t)); if (d) byDay[d] = (byDay[d] ?? 0) + p(t); }
  for (const f of flows) if (ids.includes(f.accountId) && f.t) flowDay[f.t.slice(0, 10)] = (flowDay[f.t.slice(0, 10)] ?? 0) + signed(f);
  const keys = Object.keys(byDay).sort(), r: number[] = [], rDay: string[] = [];
  if (keys.length && start > 0) {
    let bal = start + Object.entries(flowDay).reduce((s, [d, v]) => (d < keys[0] ? s + v : s), 0);
    const u = (d: string) => Date.parse(`${d}T00:00:00Z`);
    for (let x = u(keys[0]); x <= u(keys[keys.length - 1]); x += DAY) {
      const d = new Date(x).toISOString().slice(0, 10), wd = new Date(x).getUTCDay(), pl = byDay[d] ?? 0;
      bal += flowDay[d] ?? 0;
      if ((wd === 0 || wd === 6) && pl === 0) continue; // weekend: only if it has trades
      if (bal > 0) { r.push(pl / bal); rDay.push(d); }
      bal += pl;
    }
  }
  const monthly: number[] = [];
  r.forEach((x, i) => { const m = rDay[i].slice(0, 7); if (i === 0 || m !== rDay[i - 1].slice(0, 7)) monthly.push(0); monthly[monthly.length - 1] = (1 + monthly[monthly.length - 1]) * (1 + x) - 1; });
  const n = r.length, enough = n >= MIN_DAYS, sorted = [...r].sort((a, b) => a - b);
  const pos = r.filter((x) => x > 0), neg = r.filter((x) => x < 0), sumPos = sum(r.filter((x) => x >= 0)), sumNeg = sum(neg);
  const geo = (a: number[]) => Math.pow(a.reduce((g, x) => g * (1 + x), 1), 1 / a.length) - 1;
  const { skew, kurt } = enough ? moments(r) : { skew: null, kurt: null };
  const q = (pp: number) => quantile(sorted, pp);
  const tail = enough && q(0.05) !== 0 ? fin(Math.abs(q(0.95) / q(0.05))) : null;
  const pfDaily = sumNeg !== 0 ? Math.abs(sumPos / sumNeg) : null;
  const payoff = pos.length && neg.length ? mean(pos) / Math.abs(mean(neg)) : null;
  const m = n ? mean(r) : 0, sd = n >= 2 ? sdev(r) : 0;
  const ac = n >= 3 ? pearson(r.slice(0, -1), r.slice(1)) : null; // lag-1 (pandas autocorr)
  let stab: number | null = null;
  if (enough) { // R² of cumulative log return against time
    let c = 0; const y = r.map((x) => (c += Math.log1p(x))), xs = y.map((_, i) => i), rho = pearson(xs, y);
    stab = rho == null ? null : rho * rho;
  }

  // ----- trades: equity-curve R², runs test, trade returns
  let r2: number | null = null;
  if (closed.length >= MIN_TRADES) { let c = 0; const y = [0, ...closed.map((t) => (c += p(t)))], rho = pearson(y.map((_, i) => i), y); r2 = rho == null ? null : rho * rho; }
  const wl = closed.map((t) => Math.sign(cents(p(t)))).filter((s) => s !== 0);
  let runsZ: number | null = null;
  const n1 = wl.filter((s) => s > 0).length, n2 = wl.length - n1;
  if (wl.length >= MIN_DAYS && n1 && n2) {
    const N = wl.length, runs = 1 + wl.slice(1).filter((s, i) => s !== wl[i]).length, mu = (2 * n1 * n2) / N + 1;
    const v = (2 * n1 * n2 * (2 * n1 * n2 - N)) / (N * N * (N - 1));
    runsZ = v > 0 ? (runs - mu) / Math.sqrt(v) : null;
  }
  const tr: number[] = []; // trade return %: P&L ÷ balance before the trade (as Trade outcomes)
  if (start > 0) { let bal = start; for (const t of closed) { if (bal <= 0) { tr.length = 0; break; } tr.push((p(t) / bal) * 100); bal += p(t); } }

  // ----- return to risk
  const sharpeOk = tradingDays >= SHARPE_DAYS && start > 0 && n >= 2;
  const dd = Math.sqrt(r.reduce((s, x) => s + Math.min(x, 0) ** 2, 0) / (n || 1));
  const sharpe = sharpeOk && sd > 0 ? fin((m / sd) * Math.sqrt(252)) : null, sortino = sharpeOk && dd > 0 ? fin((m / dd) * Math.sqrt(252)) : null;
  let penalty: number | null = null; // QuantStats autocorr_penalty: sqrt(1 + 2 Σ ((n - k) / n) |ρ|^k)
  if (ac != null) { const a = Math.abs(ac); let s = 0, pw = 1; for (let k = 1; k < n; k++) { pw *= a; if (pw < 1e-16) break; s += ((n - k) / n) * pw; } penalty = Math.sqrt(1 + 2 * s); }
  const srDaily = n >= 2 && sd > 0 ? m / sd : null;
  const srVar = srDaily != null && skew != null && kurt != null ? 1 - skew * srDaily + ((kurt + 2) / 4) * srDaily ** 2 : null; // (γ4 - 1) / 4 with γ4 = excess + 3
  const psr = sharpeOk && srDaily != null && srVar != null && srVar > 0 ? normCdf((srDaily * Math.sqrt(n - 1)) / Math.sqrt(srVar)) * 100 : null;
  const growth = r.reduce((g, x) => g * (1 + x), 1), annRet = enough ? Math.pow(growth, 252 / n) - 1 : null;
  // drawdowns of the daily index (start = first peak): depth per day, and each episode's deepest point
  const ddDay: number[] = [], episodes: number[] = [];
  { let idx = 1, peak = 1, cur = 0;
    for (const x of r) { idx *= 1 + x; if (idx >= peak) { peak = idx; if (cur > 0) episodes.push(cur); cur = 0; ddDay.push(0); } else { const d = 1 - idx / peak; ddDay.push(d); cur = Math.max(cur, d); } }
    if (cur > 0) episodes.push(cur); }
  const sq = Math.sqrt(sum(episodes.map((x) => x * x)));
  const burke = annRet != null && sq > 0 ? annRet / sq : null;
  const painIdx = enough ? mean(ddDay) : null, ulcer = enough ? Math.sqrt(mean(ddDay.map((x) => x * x))) : null;

  // ----- confidence intervals (95%)
  const N = closed.length, pl = closed.map(p), wins = closed.filter((t) => tradeOutcome(p(t), 2) === "win").length;
  let ciWin: Range | null = null, ciExp: Range | null = null, ciPf: Range | null = null, ciMed: Range | null = null;
  if (N >= MIN_TRADES) {
    const z = 1.959963985, ph = wins / N, c = ph + (z * z) / (2 * N), h = z * Math.sqrt((ph * (1 - ph)) / N + (z * z) / (4 * N * N)), d = 1 + (z * z) / N;
    ciWin = [((c - h) / d) * 100, ((c + h) / d) * 100]; // Wilson score interval
    const e = mean(pl), w = (t975(N - 1) * sdev(pl)) / Math.sqrt(N);
    ciExp = [e - w, e + w];
    const pf = (a: number[]) => { let gp = 0, gl = 0; for (const x of a) { const c2 = cents(x); if (c2 > 0) gp += x; else if (c2 < 0) gl -= x; } return gl > 0 ? gp / gl : Infinity; };
    const rand = rng(42), B = 2000, out = new Float64Array(B), pick = new Array<number>(N);
    for (let b = 0; b < B; b++) { for (let i = 0; i < N; i++) pick[i] = pl[Math.floor(rand() * N)]; out[b] = pf(pick); }
    out.sort();
    const qq = (pp: number) => { const k = (B - 1) * pp, f = Math.floor(k), c2 = Math.ceil(k); return out[f] === out[c2] ? out[f] : out[f] + (out[c2] - out[f]) * (k - f); };
    ciPf = [qq(0.025), qq(0.975)];
  }
  if (tr.length >= MIN_TRADES) { // distribution-free interval for the median: order statistics from Binomial(n, 1/2)
    const s = [...tr].sort((a, b) => a - b), L = s.length;
    let cdf = 0, j = 0, logC = 0; // log C(L, k), built up step by step
    for (let k = 0; k <= L; k++) { if (k) logC += Math.log((L - k + 1) / k); const pk = Math.exp(logC - L * Math.LN2); if (cdf + pk > 0.025) break; cdf += pk; j = k + 1; }
    if (j >= 1) ciMed = [s[j - 1], s[L - j]];
  }
  const ciRet: Range | null = enough ? [(m - (t975(n - 1) * sd) / Math.sqrt(n)) * 100, (m + (t975(n - 1) * sd) / Math.sqrt(n)) * 100] : null;
  const minTrl = sharpeOk && srDaily != null && srDaily > 0 && srVar != null && srVar > 0 ? 1 + srVar * (1.644853627 / srDaily) ** 2 : null;

  // ----- simulation and sizing (same settings as Charts > Monte Carlo / Size)
  const rs = closed.map(rMultiple).filter((x): x is number => x != null);
  const sz = sizing(rs);
  const sim = closed.length >= 2 ? monteCarlo(pl, { paths: 1000, horizon: Math.min(500, Math.max(closed.length, 20)), seed: 42, ruinAt: start > 0 ? start * RUIN : undefined }) : null;

  return {
    n: closed.length, start, tradingDays, days: n, months: monthly.length,
    gmDaily: enough ? geo(r) * 100 : null, gmMonthly: monthly.length >= 2 ? geo(monthly) * 100 : null,
    sdDaily: enough ? sd * 100 : null, sdMonthly: monthly.length >= 3 ? sdev(monthly) * 100 : null, skew, kurt,
    tail, g2p: enough && sumNeg !== 0 ? sum(r) / Math.abs(sumNeg) : null, g2l: enough ? payoff : null,
    csr: enough && pfDaily != null && tail != null ? pfDaily * tail : null,
    cpc: enough && pfDaily != null && payoff != null ? pfDaily * (pos.length / (pos.length + neg.length)) * payoff : null,
    outWin: enough && r.some((x) => x >= 0) && mean(r.filter((x) => x >= 0)) !== 0 ? q(0.99) / mean(r.filter((x) => x >= 0)) : null,
    outLoss: enough && neg.length ? q(0.01) / mean(neg) : null,
    posOut: enough && sd > 0 ? r.filter((x) => x > m + 3 * sd).length : null, negOut: enough && sd > 0 ? r.filter((x) => x < m - 3 * sd).length : null,
    autoc: enough ? ac : null, stab, r2, runsZ,
    consist: tr.length >= MIN_TRADES && sdev(tr) > 0 ? mean(tr) / sdev(tr) : null,
    sharpe, sortino, acSharpe: sharpe != null && penalty != null ? sharpe / penalty : null, acSortino: sortino != null && penalty != null ? sortino / penalty : null, psr,
    annRet: annRet != null ? annRet * 100 : null, burke, mBurke: burke != null ? burke * Math.sqrt(n) : null,
    painIdx: painIdx != null ? painIdx * 100 : null, painRatio: annRet != null && painIdx ? annRet / painIdx : null,
    ulcer: ulcer != null ? ulcer * 100 : null, upi: annRet != null && ulcer ? annRet / ulcer : null,
    ciWin, ciExp, ciPf, ciMed, ciRet, minTrl, srDaily,
    kelly: sz ? { full: sz.kelly * 100, half: sz.half.f * 100, capped: sz.capped } : null, rN: rs.length,
    mc: sim ? { paths: sim.paths, horizon: sim.horizon, probProfit: sim.probProfit, med: sim.finalP50, p5: sim.finalP5, ddMed: sim.ddMedian, dd95: sim.ddP95, ruin: sim.ruin, rec: sim.recMedian } : null,
  };
}
