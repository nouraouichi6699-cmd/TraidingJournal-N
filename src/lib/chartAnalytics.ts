// Pure helpers for the Charts window (no React). Covered by chartAnalytics.test.ts.

export interface Pt { t: number; v: number }

// ---------- max drawdown window ----------

export interface DdWindow { peakT: number; peakV: number; troughT: number; troughV: number; recoverT: number | null; amount: number; pct: number | null }

/**
 * Deepest drawdown of a balance-like series. `flow[i]` is external money that came in between point i-1 and i
 * (deposit > 0, withdrawal < 0): it is neither a gain nor a loss.
 *  - All levels positive: depth % from a time-weighted index (each step's return excludes the flow); amount = drop of
 *    level minus cumulative flows over that same window.
 *  - Otherwise (e.g. no starting balance): the window with the largest money drop, pct = null.
 * peakV / troughV are the plotted levels at those points. recoverT = first point back at the peak (null = still under water).
 */
export function maxDrawdownWindow(t: number[], level: number[], flow: number[] = []): DdWindow | null {
  const n = Math.min(t.length, level.length);
  if (n < 2) return null;
  const perf: number[] = [];
  let cum = 0;
  for (let i = 0; i < n; i++) { if (i > 0) cum += flow[i] ?? 0; perf.push(level[i] - cum); }
  const usePct = level.slice(0, n).every((v) => v > 0);
  const idx: number[] = [1];
  if (usePct) for (let i = 1; i < n; i++) idx.push(idx[i - 1] * (1 + (level[i] - level[i - 1] - (flow[i] ?? 0)) / level[i - 1]));
  const val = usePct ? idx : perf; // what "peak" and "depth" are measured on
  let pk = 0, best = 0, bp = -1, bt = -1;
  for (let i = 1; i < n; i++) {
    if (val[i] >= val[pk]) { pk = i; continue; }
    const d = usePct ? (val[pk] - val[i]) / val[pk] : val[pk] - val[i];
    if (d > best + 1e-12) { best = d; bp = pk; bt = i; }
  }
  if (bp < 0) return null;
  let rec: number | null = null;
  for (let i = bt + 1; i < n; i++) if (val[i] >= val[bp] - 1e-12) { rec = t[i]; break; }
  return { peakT: t[bp], peakV: level[bp], troughT: t[bt], troughV: level[bt], recoverT: rec, amount: perf[bp] - perf[bt], pct: usePct ? best * 100 : null };
}

// ---------- rolling metrics ----------

export type RollKind = "win" | "pf" | "exp";
const cents = (x: number) => Math.round(x * 100) / 100;

/**
 * Rolling win rate (%), profit factor or expectancy over the last `n` closed trades, one point per trade once `n` trades exist.
 * Win / loss use cent-rounded P&L (breakevens count in the window but are neither). A window without losses has no
 * profit factor: that point is skipped rather than drawn as infinity.
 */
export function rollingSeries(trades: { t: number; pnl: number }[], n: number, kind: RollKind): Pt[] {
  if (n < 1 || trades.length < n) return [];
  const out: Pt[] = [];
  let wins = 0, gp = 0, gl = 0, sum = 0;
  const add = (p: number, s: 1 | -1) => { const c = cents(p); if (c > 0) { wins += s; gp += s * p; } else if (c < 0) gl += s * -p; sum += s * p; };
  for (let i = 0; i < trades.length; i++) {
    add(trades[i].pnl, 1);
    if (i >= n) add(trades[i - n].pnl, -1);
    if (i < n - 1) continue;
    const v = kind === "win" ? (wins / n) * 100 : kind === "exp" ? sum / n : gl > 1e-9 ? gp / gl : null;
    if (v != null && Number.isFinite(v)) out.push({ t: trades[i].t, v });
  }
  return out;
}

// ---------- histogram ----------

export interface Bin { lo: number; hi: number; count: number; edge?: "under" | "over" }

const pctile = (sorted: number[], p: number) => {
  if (!sorted.length) return NaN;
  const k = (sorted.length - 1) * p, f = Math.floor(k), c = Math.ceil(k);
  return f === c ? sorted[f] : sorted[f] + (sorted[c] - sorted[f]) * (k - f);
};
const niceStep = (raw: number) => {
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw);
};

/**
 * Distribution of trade results: about `target` bins of a "nice" width, aligned so 0 is always a bin edge
 * (a bin is entirely winners or losers). The 1%..99% range is binned; rarer outliers go into an "under"/"over" end bin.
 */
export function histogram(values: number[], target = 20): Bin[] {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return [];
  const lo = v.length >= 50 ? pctile(v, 0.01) : v[0], hi = v.length >= 50 ? pctile(v, 0.99) : v[v.length - 1];
  if (hi - lo < 1e-9) return [{ lo: v[0], hi: v[v.length - 1], count: v.length }];
  const step = niceStep((hi - lo) / target);
  const first = Math.floor(lo / step) * step, last = Math.ceil(hi / step) * step;
  const bins: Bin[] = [];
  for (let x = first; x < last - 1e-9; x += step) bins.push({ lo: Math.round(x * 1e6) / 1e6, hi: Math.round((x + step) * 1e6) / 1e6, count: 0 });
  const under: Bin = { lo: v[0], hi: first, count: 0, edge: "under" }, over: Bin = { lo: last, hi: v[v.length - 1], count: 0, edge: "over" };
  for (const x of v) {
    if (x < first) under.count++;
    else if (x >= last) { if (x === last && bins.length) bins[bins.length - 1].count++; else over.count++; }
    else bins[Math.min(bins.length - 1, Math.floor((x - first) / step + 1e-9))].count++;
  }
  return [...(under.count ? [under] : []), ...bins, ...(over.count ? [over] : [])];
}

// ---------- Monte Carlo ----------

export interface McResult {
  paths: number; horizon: number; steps: number[]; p5: number[]; p50: number[]; p95: number[];
  probProfit: number; finalP5: number; finalP50: number; finalP95: number; ddMedian: number; ddP95: number;
}

/** Small seeded PRNG (mulberry32): the same trades always give the same simulation. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Bootstrap simulation of the next `horizon` trades: each path draws past trade results at random (with replacement).
 * Returns the 5th / 50th / 95th percentile of cumulative P&L at `points` evenly spaced trade counts, the share of paths
 * that end in profit, and the median / 95th percentile of each path's maximum drawdown (money, from the start of the path).
 */
export function monteCarlo(pnls: number[], o: { paths?: number; horizon?: number; seed?: number; points?: number } = {}): McResult | null {
  const pool = pnls.filter(Number.isFinite);
  if (pool.length < 2) return null;
  const paths = o.paths ?? 1000, horizon = Math.max(1, o.horizon ?? pool.length), r = rng(o.seed ?? 42);
  const points = Math.max(2, Math.min(o.points ?? 120, horizon));
  const steps = Array.from({ length: points }, (_, i) => Math.max(1, Math.round(((i + 1) * horizon) / points)));
  const at: number[][] = steps.map(() => []), finals: number[] = [], dds: number[] = [];
  for (let p = 0; p < paths; p++) {
    let cum = 0, peak = 0, dd = 0, s = 0;
    for (let k = 1; k <= horizon; k++) {
      cum += pool[Math.floor(r() * pool.length)];
      if (cum > peak) peak = cum; else if (peak - cum > dd) dd = peak - cum;
      while (s < steps.length && steps[s] === k) at[s++].push(cum);
    }
    finals.push(cum); dds.push(dd);
  }
  const q = (a: number[], p: number) => pctile([...a].sort((x, y) => x - y), p);
  return {
    paths, horizon, steps,
    p5: at.map((a) => q(a, 0.05)), p50: at.map((a) => q(a, 0.5)), p95: at.map((a) => q(a, 0.95)),
    probProfit: (finals.filter((x) => x > 0).length / paths) * 100,
    finalP5: q(finals, 0.05), finalP50: q(finals, 0.5), finalP95: q(finals, 0.95),
    ddMedian: q(dds, 0.5), ddP95: q(dds, 0.95),
  };
}

// ---------- CSV export ----------

const cell = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const num = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "");
const valueAt = (pts: Pt[], t: number) => { let v: number | null = null; for (const p of pts) { if (p.t <= t) v = p.v; else break; } return v; };

/** Line series as CSV: one row per timestamp (UTC), one column per series, each value carried forward. */
export function seriesCsv(series: { name: string; pts: Pt[] }[], xHeader = "date", xFmt: (t: number) => string = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ")): string {
  const times = [...new Set(series.flatMap((s) => s.pts.map((p) => p.t)))].sort((a, b) => a - b);
  const rows = [[xHeader, ...series.map((s) => s.name)].map(cell).join(",")];
  for (const t of times) rows.push([cell(xFmt(t)), ...series.map((s) => { const v = valueAt(s.pts, t); return v == null ? "" : num(v); })].join(","));
  return rows.join("\n");
}

/** Bars (periods, distribution) as CSV. */
export function barsCsv(bars: { label: string; v: number; n: number }[], headers: [string, string, string]): string {
  return [headers.map(cell).join(","), ...bars.map((b) => [cell(b.label), num(b.v), String(b.n)].join(","))].join("\n");
}
