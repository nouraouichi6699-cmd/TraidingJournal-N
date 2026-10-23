// Trade replay: the bars around one closed trade, ready to play back candle by candle, with what price did inside the
// trade and after the exit. Pure functions, covered by replay.test.ts.
// Times: the broker's wall clock read as UTC (as everywhere in the app); market bars come in true UTC and are moved to the
// broker's clock. Prices: the candles are moved by the gap between the broker and the data at the entry (futures against a
// spot CFD, another feed), so they line up with the trade's prices; moves are measured in the data's own prices, like
// Trade path, and the result at the exit uses the broker's prices.
import type { Trade } from "../types";
import { barAt, offsetMs, priceIn, type IBar, type TimeModel } from "./path";

const MIN = 6e4;
export const LEAD_BARS = 40, TAIL_BARS = 60, MAX_CANDLES = 180, MAX_SOURCE_BARS = 3000;
const STEPS = [1, 2, 3, 5, 10, 15, 30, 60, 120, 240, 480, 1440];
const wall = (s: string | null | undefined) => { if (!s) return NaN; let x = s.trim().replace(" ", "T").slice(0, 16); if (x.length === 10) x += "T00:00"; return Date.parse(`${x}Z`); };

export type Source = "1m" | "5m" | "60m" | "1d";
export const SOURCE_MIN: Record<Source, number> = { "1m": 1, "5m": 5, "60m": 60, "1d": 1440 };
/** The finest bars the market data serves for a trade this old (days) and this long (minutes), within MAX_SOURCE_BARS. */
export function sourceFor(ageDays: number, durMin: number): Source {
  const fits = (m: number) => (2.5 * durMin + (LEAD_BARS + TAIL_BARS) * m) / m <= MAX_SOURCE_BARS;
  if (ageDays <= 28 && fits(1)) return "1m";
  if (ageDays <= 58 && fits(5)) return "5m";
  return ageDays <= 728 ? "60m" : "1d";
}
/** The window shown around a trade (wall ms): a lead before the entry, a longer tail after the exit. */
export const windowOf = (s: number, e: number, minutes: number): [number, number] => [s - Math.max(0.5 * (e - s), LEAD_BARS * minutes * MIN), e + Math.max(e - s, TAIL_BARS * minutes * MIN)];

/** Candle size (minutes): the smallest step, not finer than the data, that fits `spanMin` into `max` candles. */
export function candleMinutes(spanMin: number, srcMin: number, max = MAX_CANDLES): number {
  for (const m of STEPS) if (m >= srcMin && spanMin / m <= max) return m;
  return 1440 * Math.ceil(spanMin / 1440 / max);
}
/** Bars joined into candles of m minutes, aligned to multiples of m from midnight. Bars must be sorted. */
export function regroup(bars: IBar[], m: number): IBar[] {
  const D = m * MIN, out: IBar[] = [];
  for (const b of bars) {
    const t = Math.floor(b.t / D) * D, last = out[out.length - 1];
    if (last && last.t === t) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; }
    else out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c });
  }
  return out;
}

/** Price moves in the trade's direction (data prices): now, and the best and worst so far (both >= 0). */
export interface Frame { move: number; best: number; worst: number }
export interface Point { t: number; move: number } // wall ms, move in the trade's direction
export interface Replay {
  candles: IBar[]; minutes: number; // broker clock; prices moved by `basis`
  s: number; e: number; // entry and exit (wall ms)
  iIn: number; iOut: number; // candles holding the entry and the exit
  basis: number; // broker price minus data price at the entry
  /** Per candle while the trade is open, at the candle's end (the exit candle ends at the exit); null elsewhere. */
  frames: (Frame | null)[];
  /** Per candle after the exit: moves from the exit, in the trade's direction; null elsewhere. */
  after: (Frame | null)[];
  best: Point; worst: Point; // inside the trade (move 0 at the entry when price never went that way)
  afterBest: Point | null; afterWorst: Point | null; // after the exit, from the exit price
  closedBy: "tp" | "sl" | null; // the exit was at (or past) the target / the stop
  /** After the exit: the stop or the target, whichever price reached first, had the trade stayed open. After a stop: the target. */
  held: { level: "tp" | "sl"; t: number } | null;
  back: number | null; // after the exit, first time price was back at the entry (wall ms)
}

/**
 * Replay of one closed trade from market bars (sorted, `minutes` long) in true UTC, moved to the broker's clock with `model`
 * (null: the bars are already in the broker's clock, as daily bars and MT5 exports are). Null when no bar holds the entry.
 */
export function buildReplay(o: { trade: Pick<Trade, "side" | "entryPrice" | "exitPrice" | "sl" | "tp" | "entryTime" | "exitTime">; bars: IBar[]; minutes: number; model: TimeModel | null; max?: number }): Replay | null {
  const t = o.trade, s = wall(t.entryTime), e = wall(t.exitTime);
  if (!(e > s) || t.exitPrice == null) return null;
  const dir = t.side === "long" ? 1 : -1, D = o.minutes * MIN, model = o.model;
  const [a, z] = windowOf(s, e, o.minutes);
  const win = (model ? o.bars.map((b) => ({ ...b, t: b.t + offsetMs(model, b.t) })) : o.bars).filter((b) => b.t + D > a && b.t < z);
  const eb = barAt(win, o.minutes, s) ?? win.find((b) => b.t > s && b.t < s + 3 * D);
  if (!eb) return null;
  const ref = priceIn(eb, o.minutes, s), basis = t.entryPrice - ref, final = (t.exitPrice - t.entryPrice) * dir;
  const xb = barAt(win, o.minutes, e), lastIn = [...win].reverse().find((b) => b.t < e);
  const mExit = xb ? priceIn(xb, o.minutes, e) : lastIn ? lastIn.c : ref;

  const m = candleMinutes((z - a) / MIN, o.minutes, o.max), Dm = m * MIN, raw = regroup(win, m);
  const frames: (Frame | null)[] = [], after: (Frame | null)[] = [];
  let k = 0, rb = 0, rw = 0, last = ref, ab = 0, aw = 0, lastA = mExit, exited = false;
  let best: Point = { t: s, move: 0 }, worst: Point = { t: s, move: 0 }, afterBest: Point | null = null, afterWorst: Point | null = null;
  /** The exit: its result counts for the best / worst, and the candle holding it (else the last one before it) shows it. */
  const exit = (j: number) => {
    exited = true;
    if (final > rb) { rb = final; best = { t: e, move: final }; }
    if (-final > rw) { rw = -final; worst = { t: e, move: -final }; }
    if (j >= 0) frames[j] = { move: final, best: rb, worst: rw };
  };
  const lastFrame = () => { for (let j = frames.length - 1; j >= 0; j--) if (frames[j]) return j; return -1; };
  for (const c of raw) {
    const end = c.t + Dm;
    if (end <= s) { frames.push(null); after.push(null); continue; }
    if (c.t < e) {
      for (; k < win.length && win[k].t < Math.min(end, e); k++) {
        const b = win[k];
        if (b.t + D <= s) continue;
        const up = dir > 0 ? b.h - ref : ref - b.l, dn = dir > 0 ? ref - b.l : b.h - ref, mid = (Math.max(s, b.t) + Math.min(e, b.t + D)) / 2;
        if (up > rb) { rb = up; best = { t: mid, move: up }; }
        if (dn > rw) { rw = dn; worst = { t: mid, move: dn }; }
        last = b.c;
      }
      frames.push({ move: (last - ref) * dir, best: rb, worst: rw });
      after.push(null);
      if (end > e) exit(frames.length - 1);
      continue;
    }
    if (!exited) exit(lastFrame()); // no candle holds the exit (a gap in the data)
    frames.push(null);
    for (; k < win.length && win[k].t < end; k++) {
      const b = win[k];
      if (b.t < e) continue; // the bar holding the exit counts for the trade
      const up = dir > 0 ? b.h - mExit : mExit - b.l, dn = dir > 0 ? mExit - b.l : b.h - mExit, mid = b.t + D / 2;
      if (up > ab) { ab = up; afterBest = { t: mid, move: up }; }
      if (dn > aw) { aw = dn; afterWorst = { t: mid, move: dn }; }
      lastA = b.c;
    }
    after.push({ move: (lastA - mExit) * dir, best: ab, worst: aw });
  }
  if (!exited) exit(lastFrame()); // the data ends before the exit
  const iIn = frames.findIndex((f) => f != null), iOut = lastFrame();
  if (iIn < 0) return null;

  // how the trade ended, and what the levels did afterwards (levels in data prices: level - basis)
  const near = (lvl: number) => Math.max(0.02 * Math.abs(t.entryPrice - lvl), 1e-9 * Math.abs(t.entryPrice));
  const tp = t.tp != null && (t.tp - t.entryPrice) * dir > 0 ? t.tp : null, sl = t.sl != null && t.sl > 0 ? t.sl : null;
  const closedBy = tp != null && (t.exitPrice - tp) * dir >= -near(tp) ? "tp" : sl != null && (t.exitPrice - sl) * dir <= near(sl) ? "sl" : null;
  let held: Replay["held"] = null, back: number | null = null;
  for (const b of win) {
    if (b.t < e) continue;
    const hi = b.h + basis, lo = b.l + basis;
    if (!held && closedBy !== "tp") {
      const hitSl = closedBy == null && sl != null && (dir > 0 ? lo <= sl : hi >= sl), hitTp = tp != null && (dir > 0 ? hi >= tp : lo <= tp);
      if (hitSl || hitTp) held = { level: hitSl ? "sl" : "tp", t: b.t }; // both in one bar: the stop (the cautious reading)
    }
    if (back == null && final !== 0 && (final < 0 ? (dir > 0 ? b.h >= ref : b.l <= ref) : dir > 0 ? b.l <= ref : b.h >= ref)) back = b.t;
    if (held && back != null) break;
  }
  return { candles: raw.map((c) => ({ t: c.t, o: c.o + basis, h: c.h + basis, l: c.l + basis, c: c.c + basis })), minutes: m, s, e, iIn, iOut, basis, frames, after, best, worst, afterBest, afterWorst, closedBy, held, back };
}
