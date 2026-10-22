// Benchmark & market context (Reports > Benchmark & Market). Pure functions, covered by benchmark.test.ts.
// Market prices are DAILY bars. Trade and flow times follow the app convention: stored wall times are read as UTC,
// and a day is the date part of that time.
import type { Trade } from "../types";
import { signed, type CashFlow } from "./cashflow";

export interface Bar { d: string; o: number; h: number; l: number; c: number } // one daily bar, d = YYYY-MM-DD

const DAY = 864e5;
const dayOf = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const isClosed = (t: Trade) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && !!dayOf(t.exitTime);
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const c2 = (x: number) => Math.round(x * 100) / 100;
const fin = (x: number) => (Number.isFinite(x) ? x : null);
const isExternal = (f: CashFlow) => f.type !== "adjustment"; // deposits, withdrawals and credits are external money; adjustments are performance

/** Bars sorted by date, one per day (the last one wins), with valid prices only. */
export function cleanBars(bars: Bar[]): Bar[] {
  const m = new Map<string, Bar>();
  for (const b of bars) if (/^\d{4}-\d{2}-\d{2}$/.test(b.d) && [b.o, b.h, b.l, b.c].every((x) => Number.isFinite(x) && x > 0) && b.h >= b.l) m.set(b.d, b);
  return [...m.values()].sort((a, b) => a.d.localeCompare(b.d));
}

// ---------- account daily returns ----------

/**
 * Daily return of the account (fraction) for every calendar day from `from` to `to`: realised P&L of the day (close date,
 * adjustments included) ÷ balance at the start of the day. Deposits, withdrawals and credits land at the start of their
 * day, so they are never counted as performance (same rule as Returns & capital). Days without trades return 0.
 * Null when the balance is not positive at the start of a day.
 */
export function accountDays(trades: Trade[], start: number, flows: CashFlow[], from: string, to: string): Map<string, number> | null {
  if (!(start > 0) || from > to) return null;
  const pnl = new Map<string, number>(), ext = new Map<string, number>();
  for (const t of trades) if (isClosed(t)) { const d = dayOf(t.exitTime)!; pnl.set(d, (pnl.get(d) ?? 0) + (t.pnl as number)); }
  for (const f of flows) {
    const d = dayOf(f.t);
    if (!d || !Number.isFinite(f.amount) || f.amount === 0) continue;
    if (isExternal(f)) ext.set(d, (ext.get(d) ?? 0) + signed(f)); else pnl.set(d, (pnl.get(d) ?? 0) + signed(f));
  }
  let bal = start;
  for (const [d, v] of ext) if (d < from) bal += v; // flows before the window are part of the starting balance
  for (const [d, v] of pnl) if (d < from) bal += v;
  const out = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    bal += ext.get(d) ?? 0;
    if (!(bal > 0)) return null;
    const p = pnl.get(d) ?? 0;
    out.set(d, p / bal);
    bal += p;
  }
  return out;
}

// ---------- alignment ----------

export interface Pair { d: string; rp: number; rb: number }
/**
 * Account and benchmark returns on the benchmark's trading days. Each benchmark day i compares the benchmark move from the
 * previous close (day i-1) to day i with the account's compounded daily returns over the same calendar days, so weekend or
 * holiday trades count on the next benchmark day. Starts at the first benchmark day on or after `from` that has a previous
 * close, ends at the first benchmark day on or after `to` (or the last one available).
 */
export function alignWithBenchmark(acct: Map<string, number>, bench: Bar[], from: string, to: string): Pair[] {
  const b = cleanBars(bench);
  let i0 = b.findIndex((x) => x.d >= from);
  if (i0 < 0) return [];
  if (i0 === 0) i0 = 1;
  let i1 = b.findIndex((x) => x.d >= to);
  if (i1 < 0) i1 = b.length - 1;
  const out: Pair[] = [];
  for (let i = i0; i <= i1; i++) {
    let g = 1;
    for (let d = addDays(b[i - 1].d, 1); d <= b[i].d; d = addDays(d, 1)) g *= 1 + (acct.get(d) ?? 0);
    out.push({ d: b[i].d, rp: g - 1, rb: b[i].c / b[i - 1].c - 1 });
  }
  return out;
}

// ---------- benchmark-relative statistics ----------

export interface BenchStats {
  n: number; upDays: number; downDays: number;
  you: number; bench: number; excess: number; // % over the window; excess in percentage points
  beta: number | null; alpha: number | null; corr: number | null; r2: number | null;
  upCapture: number | null; downCapture: number | null; relStrength: number | null;
  active: number | null; trackingError: number | null; infoRatio: number | null; treynor: number | null;
}

/**
 * Standard benchmark statistics on daily pairs (needs 20): sample covariance / variance, annualised with `perYear` days.
 *  beta = cov(rp, rb) / var(rb); corr = Pearson; R² = corr²
 *  alpha (Jensen, % a year) = [(mean rp - rf) - beta x (mean rb - rf)] x perYear, rf = daily risk-free rate
 *  up / down capture (%) = geometric mean of rp ÷ geometric mean of rb on days the benchmark rose / fell
 *  relative strength = (1 + your return) / (1 + benchmark return)
 *  active return (% a year) = mean(rp - rb) x perYear; tracking error (% a year) = stdev(rp - rb) x √perYear
 *  information ratio = active / tracking error; Treynor = (annualised return - rf) / beta
 */
export function benchStats(pairs: Pair[], o: { rf?: number; perYear?: number } = {}): BenchStats | null {
  const n = pairs.length, perYear = o.perYear ?? 252, rfYear = (o.rf ?? 0) / 100;
  if (n < 20) return null;
  const rp = pairs.map((p) => p.rp), rb = pairs.map((p) => p.rb);
  const comp = (a: number[]) => a.reduce((g, r) => g * (1 + r), 1) - 1;
  const you = comp(rp), bench = comp(rb);
  const mp = mean(rp), mb = mean(rb);
  let cov = 0, vp = 0, vb = 0;
  for (let i = 0; i < n; i++) { cov += (rp[i] - mp) * (rb[i] - mb); vp += (rp[i] - mp) ** 2; vb += (rb[i] - mb) ** 2; }
  cov /= n - 1; vp /= n - 1; vb /= n - 1;
  const beta = vb > 1e-18 ? cov / vb : null;
  const corr = vb > 1e-18 && vp > 1e-18 ? cov / Math.sqrt(vp * vb) : null;
  const rfd = Math.pow(1 + rfYear, 1 / perYear) - 1;
  const geo = (a: number[]) => (a.length ? Math.pow(a.reduce((g, r) => g * (1 + r), 1), 1 / a.length) - 1 : NaN);
  const capture = (sel: (r: number) => boolean) => {
    const idx = rb.map((r, i) => (sel(r) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return null;
    const gb = geo(idx.map((i) => rb[i]));
    return Math.abs(gb) > 1e-15 ? fin((geo(idx.map((i) => rp[i])) / gb) * 100) : null;
  };
  const diff = rp.map((r, i) => r - rb[i]), md = mean(diff);
  const sd = Math.sqrt(diff.reduce((s, x) => s + (x - md) ** 2, 0) / (n - 1));
  const active = md * perYear * 100, te = sd * Math.sqrt(perYear) * 100;
  const annYou = (Math.pow(1 + you, perYear / n) - 1) * 100;
  return {
    n, upDays: rb.filter((r) => r > 0).length, downDays: rb.filter((r) => r < 0).length,
    you: you * 100, bench: bench * 100, excess: (you - bench) * 100,
    beta, alpha: beta == null ? null : ((mp - rfd) - beta * (mb - rfd)) * perYear * 100,
    corr, r2: corr == null ? null : corr * corr,
    upCapture: capture((r) => r > 0), downCapture: capture((r) => r < 0),
    relStrength: 1 + bench > 0 ? (1 + you) / (1 + bench) : null,
    active, trackingError: te, infoRatio: te > 1e-12 ? active / te : null,
    treynor: beta != null && Math.abs(beta) > 1e-6 ? fin((annYou - rfYear * 100) / beta) : null,
  };
}

// ---------- market context ----------

export type RegimeKey = "low" | "normal" | "high";
export interface Regime { n: number; net: number; avg: number | null; winRate: number | null }
export interface MarketContext {
  trades: number; // closed trades considered
  covered: number; // trades whose symbol has daily bars around the entry
  location: { n: number; long: number | null; short: number | null }; // % of the day's range: 0 = day low, 100 = day high
  offScale: string[]; // symbols whose trade prices do not match the market data (excluded from the location)
  trend: { n: number; aligned: number; share: number | null; alignedWin: number | null; counterWin: number | null };
  regimes: Record<RegimeKey, Regime>; best: RegimeKey | null;
  bars: { n: number; avg: number | null; minutes: number };
  relTrade: { n: number; avg: number | null }; // average (trade return % - benchmark move % over the trade)
}

const sma = (c: number[], end: number, len: number) => { if (end + 1 < len) return null; let s = 0; for (let i = end - len + 1; i <= end; i++) s += c[i]; return s / len; };
/** ATR(len) as % of the close for every bar (null until enough history): true range averaged over `len` bars. */
export function atrPct(b: Bar[], len = 14): (number | null)[] {
  const tr = b.map((x, i) => (i ? Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)) : x.h - x.l));
  return b.map((x, i) => { if (i + 1 < len) return null; let s = 0; for (let k = i - len + 1; k <= i; k++) s += tr[k]; return (s / len / x.c) * 100; });
}
const pct = (sorted: number[], p: number) => { const k = (sorted.length - 1) * p, f = Math.floor(k), c = Math.ceil(k); return sorted[f] + (sorted[c] - sorted[f]) * (k - f); };
/** Index of the last bar strictly before day d (binary search), -1 if none. */
const before = (b: Bar[], d: string) => { let lo = 0, hi = b.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m].d < d) { k = m; lo = m + 1; } else hi = m - 1; } return k; };

/**
 * What the market was doing around each trade, from DAILY bars of the traded symbol (`bars[trade.symbol]`):
 *  - location: entry price inside the entry day's low-high range, 0% = low, 100% = high, buys and sells apart. A symbol is
 *    left out (offScale) when fewer than 80% of its entries fall inside the day's range: the data is another instrument
 *    (for example futures prices against a spot CFD), so its position in the range would be meaningless.
 *  - trend: the previous close above (up) or below (down) the 50-day average of closes up to that day (`smaLen`); with the trend =
 *    a buy in an uptrend or a sell in a downtrend. Win = P&L above 0 after rounding to cents.
 *  - volatility regime: ATR(14) in % of price on the day before the entry, against the symbol's own history (at least
 *    `minHistory` ATR values): low up to the 33rd percentile, high above the 67th. Each regime: trades, net P&L, average per trade, win rate. best = highest
 *    average per trade among regimes with at least 3 trades.
 *  - bars: holding time ÷ `barMinutes` (no market data needed).
 *  - relTrade: trade return (P&L ÷ balance before the trade, %) minus the benchmark move between the last daily close before
 *    the entry and the last daily close before the exit (trades that open and close between two closes get 0).
 */
export function marketContext(trades: Trade[], bars: Record<string, Bar[]>, o: { barMinutes: number; start: number; bench?: Bar[]; smaLen?: number; atrLen?: number; minHistory?: number }): MarketContext {
  const smaLen = o.smaLen ?? 50, atrLen = o.atrLen ?? 14, minHistory = o.minHistory ?? 30;
  const list = trades.filter(isClosed).sort((a, b) => (a.exitTime as string).localeCompare(b.exitTime as string) || a.no - b.no);
  const clean: Record<string, Bar[]> = {};
  for (const [s, b] of Object.entries(bars)) clean[s] = cleanBars(b);
  const win = (t: Trade) => c2(t.pnl as number) > 0;
  const rate = (a: Trade[]) => (a.length ? (a.filter(win).length / a.length) * 100 : null);

  // location (per symbol scale check first)
  const loc: { t: Trade; v: number; inside: boolean }[] = [];
  for (const t of list) {
    const b = clean[t.symbol], d = dayOf(t.entryTime);
    if (!b || !d) continue;
    const bar = b.find((x) => x.d === d);
    if (!bar || !(bar.h > bar.l)) continue;
    const r = bar.h - bar.l, inside = t.entryPrice >= bar.l - 0.05 * r && t.entryPrice <= bar.h + 0.05 * r;
    loc.push({ t, v: Math.min(100, Math.max(0, ((t.entryPrice - bar.l) / r) * 100)), inside });
  }
  const offScale = [...new Set(loc.map((x) => x.t.symbol))].filter((s) => { const a = loc.filter((x) => x.t.symbol === s); return a.filter((x) => x.inside).length < 0.8 * a.length; }).sort();
  const okLoc = loc.filter((x) => !offScale.includes(x.t.symbol));
  const avgOf = (a: number[]) => (a.length ? mean(a) : null);

  // trend and volatility regime at entry (bars up to the day before the entry)
  const closes: Record<string, number[]> = {}, atr: Record<string, (number | null)[]> = {}, cut: Record<string, [number, number]> = {};
  for (const [s, b] of Object.entries(clean)) {
    closes[s] = b.map((x) => x.c); atr[s] = atrPct(b, atrLen);
    const v = atr[s].filter((x): x is number => x != null).sort((x, y) => x - y);
    if (v.length >= minHistory) cut[s] = [pct(v, 1 / 3), pct(v, 2 / 3)];
  }
  const withTrend: { t: Trade; aligned: boolean }[] = [];
  const reg: Record<RegimeKey, Trade[]> = { low: [], normal: [], high: [] };
  let covered = 0;
  for (const t of list) {
    const b = clean[t.symbol], d = dayOf(t.entryTime) ?? dayOf(t.exitTime);
    if (!b || !d) continue;
    const k = before(b, d);
    if (k < 0) continue;
    covered++;
    const m = sma(closes[t.symbol], k, smaLen);
    if (m != null && b[k].c !== m) withTrend.push({ t, aligned: (b[k].c > m) === (t.side === "long") });
    const a = atr[t.symbol][k], q = cut[t.symbol];
    if (a != null && q) reg[a <= q[0] ? "low" : a <= q[1] ? "normal" : "high"].push(t);
  }
  const regime = (a: Trade[]): Regime => { const net = a.reduce((s, t) => s + (t.pnl as number), 0); return { n: a.length, net, avg: a.length ? net / a.length : null, winRate: rate(a) }; };
  const regimes = { low: regime(reg.low), normal: regime(reg.normal), high: regime(reg.high) };
  const best = (["low", "normal", "high"] as RegimeKey[]).filter((k) => regimes[k].n >= 3).sort((x, y) => (regimes[y].avg as number) - (regimes[x].avg as number))[0] ?? null;

  // duration in bars
  const mins = list.map((t) => (Date.parse(`${t.exitTime}Z`) - Date.parse(`${t.entryTime}Z`)) / 6e4).filter((x) => Number.isFinite(x) && x >= 0);

  // benchmark-relative trade return
  const rel: number[] = [];
  const bb = o.bench ? cleanBars(o.bench) : [];
  if (bb.length && o.start > 0) {
    let bal = o.start;
    for (const t of list) {
      const e = dayOf(t.entryTime), x = dayOf(t.exitTime), ki = e ? before(bb, e) : -1, kx = x ? before(bb, x) : -1;
      if (bal > 0 && ki >= 0 && kx >= 0) rel.push(((t.pnl as number) / bal) * 100 - (bb[kx].c / bb[ki].c - 1) * 100);
      bal += t.pnl as number;
    }
  }

  const aligned = withTrend.filter((x) => x.aligned).map((x) => x.t), counter = withTrend.filter((x) => !x.aligned).map((x) => x.t);
  return {
    trades: list.length, covered,
    location: { n: okLoc.length, long: avgOf(okLoc.filter((x) => x.t.side === "long").map((x) => x.v)), short: avgOf(okLoc.filter((x) => x.t.side === "short").map((x) => x.v)) },
    offScale,
    trend: { n: withTrend.length, aligned: aligned.length, share: withTrend.length ? (aligned.length / withTrend.length) * 100 : null, alignedWin: rate(aligned), counterWin: rate(counter) },
    regimes, best,
    bars: { n: mins.length, avg: mins.length ? mean(mins) / o.barMinutes : null, minutes: o.barMinutes },
    relTrade: { n: rel.length, avg: rel.length ? mean(rel) : null },
  };
}

// ---------- parsers ----------

/**
 * Yahoo Finance chart API (v8) → daily bars. Each bar keeps its trading date in the exchange's own time zone
 * (exchangeTimezoneName, so daylight saving is right for every bar: FX bars are stamped at midnight London time);
 * without a valid zone, the single gmtoffset of the response is used.
 */
export function parseYahooChart(raw: string): Bar[] {
  try {
    const r = JSON.parse(raw)?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [], q = r?.indicators?.quote?.[0] ?? {}, off = Number(r?.meta?.gmtoffset) || 0;
    let fmt: Intl.DateTimeFormat | null = null;
    try { if (r?.meta?.exchangeTimezoneName) fmt = new Intl.DateTimeFormat("en-CA", { timeZone: r.meta.exchangeTimezoneName, year: "numeric", month: "2-digit", day: "2-digit" }); } catch { fmt = null; }
    const date = (s: number) => (fmt ? fmt.format(new Date(s * 1000)) : new Date((s + off) * 1000).toISOString().slice(0, 10));
    return cleanBars(ts.map((s, i) => ({ d: date(s), o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i] })));
  } catch { return []; }
}

const num = (s: string | undefined) => {
  if (s == null) return NaN;
  let t = s.trim().replace(/^"|"$/g, "").replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, "").replace(",", "."); // 1.234,56
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", "."); // 1234,56
  else t = t.replace(/,/g, ""); // 1,234.56
  return t === "" ? NaN : Number(t);
};
/** A date (and optional time) cell → UTC ms: ISO, 2024.01.02, 20240102, unix seconds / ms. NaN if not a date. */
export function cellTime(s: string, time?: string): number {
  const t = s.trim().replace(/^"|"$/g, "");
  if (/^\d{9,10}$/.test(t)) return Number(t) * 1000;
  if (/^\d{12,13}$/.test(t)) return Number(t);
  const m = t.match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return NaN;
  let hh = m[4], mm = m[5];
  if (!hh && time) { const tm = time.trim().match(/^(\d{1,2}):(\d{2})/); if (tm) { hh = tm[1]; mm = tm[2]; } }
  const z = /[zZ]|[+-]\d{2}:?\d{2}$/.test(t) && m[4] ? Date.parse(t) : NaN; // explicit offset: let the engine apply it
  return Number.isFinite(z) ? z : Date.UTC(+m[1], +m[2] - 1, +m[3], +(hh ?? 0), +(mm ?? 0));
}

/**
 * Price CSV → daily bars: Stooq / Yahoo downloads (Date,Open,High,Low,Close), TradingView exports (time,open,high,low,close)
 * and MT5 exports (<DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE>, tab separated). Comma, semicolon or tab separators;
 * intraday rows are merged into one bar per day (first open, highest high, lowest low, last close).
 */
export function parseOhlcCsv(text: string): Bar[] {
  const days = new Map<string, Bar & { first: number; last: number }>();
  for (const { tm, o, h, l, c: cl } of csvRows(text)) {
    const d = new Date(tm).toISOString().slice(0, 10), x = days.get(d);
    if (!x) days.set(d, { d, o, h, l, c: cl, first: tm, last: tm });
    else {
      x.h = Math.max(x.h, h); x.l = Math.min(x.l, l);
      if (tm < x.first) { x.first = tm; x.o = o; }
      if (tm >= x.last) { x.last = tm; x.c = cl; }
    }
  }
  return cleanBars([...days.values()].map(({ d, o, h, l, c }) => ({ d, o, h, l, c })));
}

/** Rows of a price CSV (same formats as parseOhlcCsv): time in ms (wall time read as UTC) and prices; bad rows skipped. */
export function csvRows(text: string): { tm: number; o: number; h: number; l: number; c: number }[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = [",", ";", "\t"].map((s) => [s, lines[0].split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const head = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, "").replace(/[<>]/g, "").toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iD = col("date", "time", "datetime", "timestamp", "date time", "day"), iT = col("time") !== iD ? col("time") : -1;
  const iO = col("open", "o"), iH = col("high", "h"), iL = col("low", "l"), iC = col("close", "c", "last", "price", "adj close");
  if (iD < 0 || iO < 0 || iH < 0 || iL < 0 || iC < 0) return [];
  const out: { tm: number; o: number; h: number; l: number; c: number }[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(sep);
    const tm = cellTime(c[iD] ?? "", iT >= 0 && iT !== iD ? c[iT] : undefined);
    const o = num(c[iO]), h = num(c[iH]), l = num(c[iL]), cl = num(c[iC]);
    if (Number.isFinite(tm) && [o, h, l, cl].every((x) => Number.isFinite(x) && x > 0)) out.push({ tm, o, h, l, c: cl });
  }
  return out;
}

// ---------- tickers ----------

export interface Ticker { yahoo: string | null; stooq: string | null }
const CCY = new Set("USD EUR GBP JPY CHF CAD AUD NZD SEK NOK DKK PLN HUF CZK TRY ZAR MXN SGD HKD CNH CNY ILS RUB INR THB".split(" "));
// Short futures-style codes (ES, NQ, YM, CL) only when nothing but digits / a dot follows, so ESTX50 or CLPUSD do not match.
const INDEX: [RegExp, Ticker][] = [
  [/^(NAS100|US100|USTEC|USTECH|NDX|NASDAQ|NQ(?![A-Z]))/, { yahoo: "^NDX", stooq: "^ndx" }],
  [/^(US30|DJ30|DJI|WS30|DOW|YM(?![A-Z]))/, { yahoo: "^DJI", stooq: "^dji" }],
  [/^(US500|SPX500|SP500|SPX|US\.500|ES(?![A-Z]))/, { yahoo: "^GSPC", stooq: "^spx" }],
  [/^(GER40|GER30|DE40|DE30|DAX)/, { yahoo: "^GDAXI", stooq: "^dax" }],
  [/^(UK100|FTSE)/, { yahoo: "^FTSE", stooq: "^ukx" }],
  [/^(JP225|JPN225|NIKKEI|NI225)/, { yahoo: "^N225", stooq: "^nkx" }],
  [/^(FRA40|CAC)/, { yahoo: "^FCHI", stooq: "^cac" }],
  [/^(HK50|HSI)/, { yahoo: "^HSI", stooq: "^hsi" }],
  [/^(USOIL|WTI|XTIUSD|CL(?![A-Z]))/, { yahoo: "CL=F", stooq: "cl.f" }],
  [/^(UKOIL|BRENT|XBRUSD)/, { yahoo: "BZ=F", stooq: "cb.f" }],
  [/^(XAUUSD|GOLD)/, { yahoo: "GC=F", stooq: "xauusd" }],
  [/^(XAGUSD|SILVER)/, { yahoo: "SI=F", stooq: "xagusd" }],
];
/** Market data tickers for a broker symbol (prefix, suffixes such as .m / -pro / micro removed). Null when unknown. */
export function tickerFor(symbol: string): Ticker | null {
  const s = symbol.replace(/^[^:]+:/, "").toUpperCase().replace(/[^A-Z0-9.]/g, "");
  for (const [re, t] of INDEX) if (re.test(s)) return t;
  const crypto = s.match(/^(BTC|XBT|ETH|SOL|XRP|LTC|ADA|DOGE|BNB|DOT|AVAX|LINK)(USDT|USD|USDC)/);
  if (crypto) return { yahoo: `${crypto[1] === "XBT" ? "BTC" : crypto[1]}-USD`, stooq: null };
  const fx = s.match(/^([A-Z]{3})([A-Z]{3})/);
  if (fx && CCY.has(fx[1]) && CCY.has(fx[2])) return { yahoo: `${fx[1]}${fx[2]}=X`, stooq: `${fx[1]}${fx[2]}`.toLowerCase() };
  return null;
}

export type BenchId = "spx" | "ndx" | "dji" | "dax" | "gold" | "dxy" | "btc" | "eurusd";
export const BENCHMARKS: { id: BenchId; label: string; t: Ticker }[] = [
  { id: "spx", label: "S&P 500", t: { yahoo: "^GSPC", stooq: "^spx" } },
  { id: "ndx", label: "Nasdaq 100", t: { yahoo: "^NDX", stooq: "^ndx" } },
  { id: "dji", label: "Dow Jones", t: { yahoo: "^DJI", stooq: "^dji" } },
  { id: "dax", label: "DAX", t: { yahoo: "^GDAXI", stooq: "^dax" } },
  { id: "gold", label: "Gold", t: { yahoo: "GC=F", stooq: "xauusd" } },
  { id: "dxy", label: "US Dollar Index", t: { yahoo: "DX-Y.NYB", stooq: null } },
  { id: "btc", label: "Bitcoin", t: { yahoo: "BTC-USD", stooq: null } },
  { id: "eurusd", label: "EUR/USD", t: { yahoo: "EURUSD=X", stooq: "eurusd" } },
];
