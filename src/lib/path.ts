// Trade path analytics for Reports > Trade path: what price did while each trade was open, from intraday bars (Yahoo
// Finance via the "market" function, or bars exported from MT5). Pure functions, covered by path.test.ts.
//
// Times: trade times are the broker's wall clock read as UTC (as everywhere in the app). Yahoo bars are true UTC, so the
// broker's clock (UTC offset, with or without daylight saving) is found by matching entry prices to the bars
// (detectModel). MT5 bar exports use the broker's own clock (offset 0).
// Prices: moves are measured from the market data's own price at the entry moment, so a constant gap between the data
// and the broker (futures against a spot CFD, another feed) cancels out; the result at the exit uses the broker's prices.
import type { Trade } from "../types";
import { csvRows } from "./benchmark";
import { tradeOutcomeOf } from "./outcome";

export interface IBar { t: number; o: number; h: number; l: number; c: number } // t = bar start (ms)
export type Dst = "none" | "us" | "eu";
export interface TimeModel { base: number; dst: Dst } // broker clock = UTC + base hours (+1 while daylight saving is on)
export const modelId = (m: TimeModel) => `${m.base}|${m.dst}`;
export const parseModel = (s: string): TimeModel | null => { const [b, d] = s.split("|"); const base = Number(b); return Number.isInteger(base) && base >= -12 && base <= 14 && (d === "none" || d === "us" || d === "eu") ? { base, dst: d } : null; };

const H = 3600e3, MIN = 6e4;
const sundayOn = (y: number, m0: number, day: number) => { const d = new Date(Date.UTC(y, m0, day)); return Date.UTC(y, m0, day + ((7 - d.getUTCDay()) % 7)); }; // first Sunday on or after
const lastSunday = (y: number, m0: number) => { const d = new Date(Date.UTC(y, m0 + 1, 0)); return Date.UTC(y, m0, d.getUTCDate() - d.getUTCDay()); };
/** Daylight saving at a UTC instant: US (2nd Sunday of March to 1st Sunday of November, 2:00 New York) or EU (last Sunday of March to last Sunday of October, 1:00 UTC). */
export function dstOn(dst: Dst, u: number): boolean {
  if (dst === "none") return false;
  const y = new Date(u).getUTCFullYear();
  return dst === "us" ? u >= sundayOn(y, 2, 8) + 7 * H && u < sundayOn(y, 10, 1) + 6 * H : u >= lastSunday(y, 2) + H && u < lastSunday(y, 9) + H;
}
export const offsetMs = (m: TimeModel, u: number) => (m.base + (dstOn(m.dst, u) ? 1 : 0)) * H;
/** Broker wall time (read as UTC) → true UTC. */
export const wallToUtc = (m: TimeModel, w: number) => w - offsetMs(m, w - m.base * H);

/** The bar that contains instant u (bars sorted by start, all `minutes` long), or null. */
export function barAt(bars: IBar[], minutes: number, u: number): IBar | null {
  let lo = 0, hi = bars.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].t <= u) { k = m; lo = m + 1; } else hi = m - 1; }
  return k >= 0 && u < bars[k].t + minutes * MIN ? bars[k] : null;
}
/** Price at instant u inside its bar, between the bar's open and close. */
export const priceIn = (b: IBar, minutes: number, u: number) => b.o + (b.c - b.o) * Math.min(1, Math.max(0, (u - b.t) / (minutes * MIN)));
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ---------- broker clock ----------

export interface Entry { wall: number; price: number; symbol: string; g?: string } // g: which bar set the entry is matched against
export interface Detection { model: TimeModel; score: number; next: number; n: number; confident: boolean }
const DST_ORDER: Dst[] = ["us", "eu", "none"]; // on an exact tie, the most common broker setups first
export const MODELS: TimeModel[] = DST_ORDER.flatMap((dst) => Array.from({ length: 27 }, (_, i) => ({ base: i - 12, dst })));

/**
 * Finds the broker's clock: for each candidate (UTC-12..+14, without / with US / EU daylight saving), entry prices are
 * compared with the market price at the matching instant. With the right clock, entry price minus market price is nearly
 * constant (spread, or a futures / spot gap); with a wrong one it wanders by an hour's move. Score per bar set (3 entries
 * or more) = median absolute deviation of that difference ÷ median bar range; weighted by entries. Among scores within
 * 25% of the best, the clock with the smallest average (capped) deviation of all entries wins. Confident when the score
 * is small and clearly better than every candidate that maps at least half of the entries to another time.
 */
export function detectModel(entries: Entry[], data: (e: Entry) => { bars: IBar[]; minutes: number } | null, models: TimeModel[] = MODELS): Detection | null {
  const usable = entries.filter((e) => data(e));
  if (usable.length < 5) return null;
  const scored = models.map((m) => {
    // entries by bar set (symbol and bar size): price gap to the data and the matched bar's range
    const sets = new Map<string, { sym: string; d: number[]; r: number[] }>();
    for (const e of usable) {
      const d = data(e)!, u = wallToUtc(m, e.wall), b = barAt(d.bars, d.minutes, u);
      if (!b) continue;
      const key = e.g ?? e.symbol, x = sets.get(key) ?? sets.set(key, { sym: e.symbol, d: [], r: [] }).get(key)!;
      x.d.push(e.price - priceIn(b, d.minutes, u)); x.r.push(b.h - b.l);
    }
    // a set with 3 entries or more has its own price gap; smaller sets of one symbol share one (a futures gap can move
    // between periods, so sets keep their own when they can). Each entry's misfit is in units of its set's bar range.
    const groups: { d: number[]; scale: number[] }[] = [], pool = new Map<string, { d: number[]; scale: number[] }>();
    for (const x of sets.values()) {
      const scale = Math.max(median(x.r), 1e-12);
      if (x.d.length >= 3) groups.push({ d: x.d, scale: x.d.map(() => scale) });
      else { const p = pool.get(x.sym) ?? pool.set(x.sym, { d: [], scale: [] }).get(x.sym)!; for (const v of x.d) { p.d.push(v); p.scale.push(scale); } }
    }
    for (const p of pool.values()) if (p.d.length >= 3) groups.push(p);
    let sum = 0, n = 0, dev = 0;
    for (const g of groups) {
      const md = median(g.d), res = g.d.map((v, i) => Math.abs(v - md) / g.scale[i]);
      sum += median(res) * res.length; n += res.length;
      for (const v of res) dev += Math.min(v, 3); // every entry counts, capped
    }
    const ok = n >= Math.max(5, 0.6 * usable.length);
    return { m, n, score: ok ? sum / n : Infinity, dev: ok ? dev / n : Infinity };
  });
  let best = scored[0];
  for (const x of scored) if (x.score < best.score - 1e-12) best = x; // first in order wins ties
  if (!Number.isFinite(best.score)) return null;
  // The median ignores a few entries mapped an hour off (clocks that differ only around daylight-saving changes, or only
  // in one season): among near-equal scores, the clock whose every entry fits best wins.
  const near = scored.filter((x) => x.score <= best.score * 1.25 + 1e-12);
  for (const x of near) if (x.dev < best.dev - 1e-9) best = x;
  const off = (m: TimeModel) => usable.map((e) => offsetMs(m, e.wall - m.base * H));
  const mine = off(best.m);
  let next = Infinity;
  for (const x of scored) { const o = off(x.m); if (o.filter((v, i) => v !== mine[i]).length >= 0.5 * usable.length && x.score < next) next = x.score; }
  return { model: best.m, score: best.score, next, n: best.n, confident: best.score <= 2 && best.score <= 0.7 * next };
}

// ---------- one trade ----------

export interface Path {
  res: number; dur: number; // bar size, trade duration (minutes)
  final: number; mfe: number; mae: number; // price moves in the trade's direction: at exit, best, worst (both >= 0)
  tMfe: number; tMae: number; // minutes from entry
  eFav: number; eAdv: number; // best and worst move in the first quarter of the trade
  sd: number | null; // standard deviation of the floating move at bar closes
  below: number; fav: number; near: number; stag: number; // minutes below / above breakeven, near it, without a new best or worst
  tBe: number | null; recMae: number | null; // minutes to first reach breakeven; from the worst point back to breakeven
  cross: number; area: number; // breakeven crossings; depth below breakeven × minutes
  /** Running records, oldest first, as [minute, move, minute, move, ...]: each bar (or the exit) that set a new best (fx)
   *  or worst (ax) move. They tell which of two levels was reached first. Paths measured before they existed lack them. */
  fx?: number[]; ax?: number[];
}
export const MIN_BARS = 3, MIN_COVER = 0.8, EARLY = 0.25, NEAR = 0.1;

/**
 * Path of one closed trade from bars in the same clock as `s` / `e` (ms). Needs 3 bars or more overlapping the trade and
 * covering 80% of its time. The floating result at each bar close stands for that bar's part of the trade (the last bar
 * uses the exit price). Null when the path cannot be measured.
 */
export function tradePath(t: Pick<Trade, "side" | "entryPrice" | "exitPrice">, s: number, e: number, bars: IBar[], minutes: number): Path | null {
  const dur = e - s, D = minutes * MIN;
  if (!(dur > 0) || t.exitPrice == null) return null;
  let i0 = 0, hi = bars.length - 1;
  while (i0 <= hi) { const m = (i0 + hi) >> 1; if (bars[m].t + D > s) hi = m - 1; else i0 = m + 1; }
  const W: IBar[] = [];
  for (let i = i0; i < bars.length && bars[i].t < e; i++) W.push(bars[i]);
  if (W.length < MIN_BARS) return null;
  if (W.reduce((a, b) => a + (Math.min(e, b.t + D) - Math.max(s, b.t)), 0) < MIN_COVER * dur) return null;
  const dir = t.side === "long" ? 1 : -1, eb = W.find((b) => b.t <= s && s < b.t + D), ref = eb ? priceIn(eb, minutes, s) : W[0].o;
  const final = (t.exitPrice - t.entryPrice) * dir;
  let maxFav = -Infinity, maxAdv = -Infinity, favAt = s, advAt = s, advIdx = -1, runF = 0, runA = 0, eFav = 0, eAdv = 0;
  let below = 0, fav = 0, stag = 0, area = 0;
  const F: number[] = [], Z: number[] = [], OV: number[] = [], fx: number[] = [], ax: number[] = [];
  W.forEach((b, i) => {
    const a = Math.max(s, b.t), z = Math.min(e, b.t + D), ov = z - a, mid = (a + z) / 2;
    const up = dir > 0 ? b.h - ref : ref - b.l, dn = dir > 0 ? ref - b.l : b.h - ref;
    const f = i === W.length - 1 ? final : (b.c - ref) * dir;
    if (up > maxFav) { maxFav = up; favAt = mid; }
    if (dn > maxAdv) { maxAdv = dn; advAt = mid; advIdx = i; }
    if (up > 0 && up > (fx.length ? fx[fx.length - 1] : 0)) fx.push((mid - s) / MIN, up);
    if (dn > 0 && dn > (ax.length ? ax[ax.length - 1] : 0)) ax.push((mid - s) / MIN, dn);
    if (up > runF || dn > runA) { runF = Math.max(runF, up); runA = Math.max(runA, dn); } else stag += ov;
    if (a < s + EARLY * dur) { eFav = Math.max(eFav, up); eAdv = Math.max(eAdv, dn); }
    if (f < 0) { below += ov; area += ov * -f; } else if (f > 0) fav += ov;
    F.push(f); Z.push(z); OV.push(ov);
  });
  if (final > 0 && final > (fx.length ? fx[fx.length - 1] : 0)) fx.push(dur / MIN, final); // the exit itself set the record
  if (final < 0 && -final > (ax.length ? ax[ax.length - 1] : 0)) ax.push(dur / MIN, -final);
  const mfe = Math.max(0, maxFav, final), mae = Math.max(0, maxAdv, -final);
  const atExitBest = final > 0 && final >= maxFav, atExitWorst = final < 0 && -final >= maxAdv;
  const tMfe = mfe === 0 ? 0 : atExitBest ? dur : favAt - s, tMae = mae === 0 ? 0 : atExitWorst ? dur : advAt - s;
  const m = F.reduce((x, y) => x + y, 0) / F.length, sd = F.length >= 2 ? Math.sqrt(F.reduce((x, y) => x + (y - m) ** 2, 0) / (F.length - 1)) : null;
  const be = F.findIndex((x) => x >= 0);
  let recMae: number | null = null;
  if (mae > 0 && !atExitWorst && advIdx >= 0) { const k = F.findIndex((x, i) => i > advIdx && x >= 0); if (k >= 0) recMae = (Z[k] - Z[advIdx]) / MIN; }
  let cross = 0, last = 0;
  for (const x of F) { const sg = Math.sign(x); if (sg && last && sg !== last) cross++; if (sg) last = sg; }
  const band = NEAR * (mfe + mae);
  const near = F.reduce((acc, x, i) => (Math.abs(x) <= band ? acc + OV[i] : acc), 0);
  return {
    res: minutes, dur: dur / MIN, final, mfe, mae, tMfe: tMfe / MIN, tMae: tMae / MIN, eFav: Math.max(0, eFav), eAdv: Math.max(0, eAdv), sd,
    below: below / MIN, fav: fav / MIN, near: near / MIN, stag: stag / MIN, tBe: be >= 0 ? (Z[be] - s) / MIN : null, recMae, cross, area: area / MIN, fx, ax,
  };
}

// ---------- all trades ----------

export interface PathRow { trade: Trade; path: Path | null; k: number | null; bal: number | null; atr: number | null } // k: money per 1.0 move of this position
export interface PathStats {
  closed: number; covered: number; money: number; // closed trades, with a path, with a path and a money value
  avgMfe: number | null; medMfe: number | null; avgMae: number | null; medMae: number | null; mfePct: number | null; maePct: number | null;
  mfeAtr: number | null; maeAtr: number | null; atrN: number; eFav: number | null; eAdv: number | null; amp: number | null; vol: number | null; tMfe: number | null; tMae: number | null;
  avgCap: number | null; medCap: number | null; giveback: number | null; givebackPct: number | null; closeLoc: number | null; velocity: number | null; winCap: number | null; loseRec: number | null;
  tBelow: number | null; tBelowPct: number | null; tBe: number | null; tBePct: number | null; tPeak: number | null; tPeakClose: number | null; postPeak: number | null;
  tFav: number | null; recMae: number | null; cross: number | null; stag: number | null; nearBe: number | null; area: number | null;
}

/**
 * Averages over the trades whose path is known (money values also need k). Capture = result at exit ÷ best move (the
 * average one in money: total result ÷ total MFE of trades that were ever in profit; the median one per trade);
 * giveback = best move - result; close location = where the exit sits between the worst (0%) and best (100%) point;
 * velocity = net P&L ÷ hours in trades (all closed trades, no path needed); losing-trade recovery = share of the worst
 * floating loss won back before the exit.
 */
export function pathStats(rows: PathRow[], cents: (x: number) => number = (x) => Math.round(x * 100) / 100): PathStats {
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const med = (a: number[]) => (a.length ? median(a) : null);
  const closed = rows.filter((r) => r.trade.status === "closed" && r.trade.pnl != null);
  const P = closed.filter((r) => r.path) as (PathRow & { path: Path })[];
  const Mn = P.filter((r) => r.k != null && r.k > 0) as (PathRow & { path: Path; k: number })[];
  const pos = P.filter((r) => r.path.mfe > 0), win = pos.filter((r) => tradeOutcomeOf(r.trade, 2) === "win");
  const lose = P.filter((r) => tradeOutcomeOf(r.trade, 2) === "loss" && r.path.mae > 0);
  const withAtr = P.filter((r) => r.atr != null && r.atr > 0), withBal = Mn.filter((r) => r.bal != null && r.bal > 0);
  const hours = closed.reduce((a, r) => { const s = Date.parse(`${r.trade.entryTime}Z`), e = Date.parse(`${r.trade.exitTime}Z`); return Number.isFinite(s) && Number.isFinite(e) && e > s ? a + (e - s) / H : a; }, 0);
  const net = closed.reduce((a, r) => a + (r.trade.pnl as number), 0);
  const be = P.filter((r) => r.path.tBe != null);
  // capture and giveback in money over all trades that were ever in profit (a per-trade average would be dominated by
  // losers whose best point was tiny: -0.5 ÷ 0.001 = -50,000%)
  const posK = pos.filter((r) => r.k != null && r.k > 0) as (PathRow & { path: Path; k: number })[];
  const posMfe = posK.reduce((a, r) => a + r.path.mfe * r.k, 0), posFinal = posK.reduce((a, r) => a + r.path.final * r.k, 0);
  return {
    closed: closed.length, covered: P.length, money: Mn.length,
    avgMfe: avg(Mn.map((r) => r.path.mfe * r.k)), medMfe: med(Mn.map((r) => r.path.mfe * r.k)),
    avgMae: avg(Mn.map((r) => r.path.mae * r.k)), medMae: med(Mn.map((r) => r.path.mae * r.k)),
    mfePct: avg(withBal.map((r) => ((r.path.mfe * r.k) / (r.bal as number)) * 100)), maePct: avg(withBal.map((r) => ((r.path.mae * r.k) / (r.bal as number)) * 100)),
    mfeAtr: avg(withAtr.map((r) => r.path.mfe / (r.atr as number))), maeAtr: avg(withAtr.map((r) => r.path.mae / (r.atr as number))), atrN: withAtr.length,
    eFav: avg(Mn.map((r) => r.path.eFav * r.k)), eAdv: avg(Mn.map((r) => r.path.eAdv * r.k)),
    amp: avg(Mn.map((r) => (r.path.mfe + r.path.mae) * r.k)), vol: avg(Mn.filter((r) => r.path.sd != null).map((r) => (r.path.sd as number) * r.k)),
    tMfe: avg(P.map((r) => r.path.tMfe)), tMae: avg(P.map((r) => r.path.tMae)),
    avgCap: posMfe > 0 ? (posFinal / posMfe) * 100 : null, medCap: med(pos.map((r) => (r.path.final / r.path.mfe) * 100)),
    giveback: avg(posK.map((r) => (r.path.mfe - r.path.final) * r.k)),
    givebackPct: posMfe > 0 ? ((posMfe - posFinal) / posMfe) * 100 : null,
    closeLoc: avg(P.filter((r) => r.path.mfe + r.path.mae > 0).map((r) => ((r.path.final + r.path.mae) / (r.path.mfe + r.path.mae)) * 100)),
    velocity: hours > 0 ? net / hours : null,
    winCap: avg(win.map((r) => (r.path.final / r.path.mfe) * 100)),
    loseRec: avg(lose.map((r) => ((r.path.mae - Math.max(0, -r.path.final)) / r.path.mae) * 100)),
    tBelow: avg(P.map((r) => r.path.below)), tBelowPct: avg(P.map((r) => (r.path.below / r.path.dur) * 100)),
    tBe: avg(be.map((r) => r.path.tBe as number)), tBePct: avg(be.map((r) => ((r.path.tBe as number) / r.path.dur) * 100)),
    tPeak: avg(win.map((r) => r.path.tMfe)), tPeakClose: avg(pos.map((r) => r.path.dur - r.path.tMfe)), postPeak: avg(pos.map((r) => ((r.path.dur - r.path.tMfe) / r.path.dur) * 100)),
    tFav: avg(P.map((r) => r.path.fav)), recMae: avg(P.filter((r) => r.path.recMae != null).map((r) => r.path.recMae as number)),
    cross: avg(P.map((r) => r.path.cross)), stag: avg(P.map((r) => r.path.stag)), nearBe: avg(P.map((r) => r.path.near)),
    area: avg(Mn.map((r) => (r.path.area * r.k) / 60)),
  };
}

// ---------- parsers ----------

/** Yahoo Finance chart API (v8) → intraday bars, t = bar start in UTC ms. Bars with a missing price are dropped. */
export function parseYahooIntraday(raw: string): IBar[] {
  try {
    const r = JSON.parse(raw)?.chart?.result?.[0], ts: number[] = r?.timestamp ?? [], q = r?.indicators?.quote?.[0] ?? {};
    const out: IBar[] = [];
    ts.forEach((s, i) => { const b = { t: s * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i] }; if ([b.o, b.h, b.l, b.c].every((x) => Number.isFinite(x) && x > 0) && b.h >= b.l) out.push(b); });
    return sortBars(out);
  } catch { return []; }
}
/** Sorted by time, one bar per start time (the last one wins). */
export function sortBars(bars: IBar[]): IBar[] { const m = new Map<number, IBar>(); for (const b of bars) m.set(b.t, b); return [...m.values()].sort((a, b) => a.t - b.t); }
/** Bar size in minutes: the most common gap between consecutive bars. */
export function barMinutes(bars: IBar[]): number {
  const n = new Map<number, number>();
  for (let i = 1; i < bars.length; i++) { const g = Math.round((bars[i].t - bars[i - 1].t) / MIN); if (g > 0) n.set(g, (n.get(g) ?? 0) + 1); }
  let best = 0, cnt = 0;
  for (const [g, c] of n) if (c > cnt || (c === cnt && g < best)) { best = g; cnt = c; }
  return best || 1;
}

/** Intraday bars from a CSV (MT5 bar export: <DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE>, or date-time / open / high / low / close columns). */
export function parseIntradayCsv(text: string): { bars: IBar[]; minutes: number } {
  const bars = sortBars(csvRows(text).filter((r) => r.h >= r.l).map((r) => ({ t: r.tm, o: r.o, h: r.h, l: r.l, c: r.c })));
  return { bars, minutes: barMinutes(bars) };
}
