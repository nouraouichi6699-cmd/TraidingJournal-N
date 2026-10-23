// Market data for a trade replay: the finest bars still served for the trade's age, and the broker's clock (the one Trade
// path chose or found for the account, else found now from the account's entries, else the most common MT5 clock).
import type { Trade } from "../types";
import { INTRADAY_DAYS, intradayChunks, loadDaily, loadIntraday, loadMap, type LoadError } from "./marketData";
import { detectModel, parseModel, type Entry, type IBar, type TimeModel } from "./path";
import { readClock, tickerOfSymbol, wall } from "./pathData";
import { buildReplay, SOURCE_MIN, sourceFor, windowOf, type Replay, type Source } from "./replay";

export type ClockHow = "saved" | "detected" | "guess" | "none"; // "none": daily bars need no clock
export type ReplayWhy = LoadError | "tooOld" | "open";
export type ReplayLoad = { ok: true; r: Replay; src: Source; ticker: string; clock: ClockHow; model: TimeModel | null } | { ok: false; why: ReplayWhy };

const DAY = 864e5, GUESS: TimeModel = { base: 2, dst: "us" }; // UTC+2, UTC+3 in summer: most MT5 servers
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const canReplay = (t: Trade) => t.status === "closed" && t.exitPrice != null && wall(t.exitTime) > wall(t.entryTime);

export async function loadReplay(t: Trade, trades: Trade[], now: number, onProgress?: (done: number, total: number) => void): Promise<ReplayLoad> {
  if (!canReplay(t)) return { ok: false, why: "open" };
  const s = wall(t.entryTime), e = wall(t.exitTime), src = sourceFor((now - s) / DAY, (e - s) / 6e4), minutes = SOURCE_MIN[src];
  if (src === "1d" && e - s < 3 * DAY) return { ok: false, why: "tooOld" };
  const ticker = tickerOfSymbol(t.symbol, loadMap())?.yahoo;
  if (!ticker) return { ok: false, why: "noTicker" };
  const [a, z] = windowOf(s, e, minutes), today = day(now);
  let from = day(a - DAY), to = day(z + DAY); // a day each side: the broker clock is up to 14 hours off UTC
  if (to > today) to = today;
  if (src !== "1d" && from < day(now - INTRADAY_DAYS[src] * DAY)) from = day(now - INTRADAY_DAYS[src] * DAY);
  let bars: IBar[];
  if (src === "1d") {
    onProgress?.(0, 1);
    const r = await loadDaily(`sym:${t.symbol}`, { yahoo: ticker, stooq: null }, from, to);
    onProgress?.(1, 1);
    if ("error" in r) return { ok: false, why: r.error };
    bars = r.bars.map((x) => ({ t: Date.parse(`${x.d}T00:00:00Z`), o: x.o, h: x.h, l: x.l, c: x.c }));
  } else {
    const total = intradayChunks(src, from, to);
    let done = 0;
    onProgress?.(0, total);
    const r = await loadIntraday(ticker, src, from, to, () => onProgress?.(++done, total));
    if (typeof r === "string") return { ok: false, why: r };
    bars = r;
  }
  if (!bars.length) return { ok: false, why: "noData" };

  let model: TimeModel | null = null, clock: ClockHow = "none";
  if (src !== "1d") {
    const c = readClock(), saved = c.override ? parseModel(c.override) : c.auto[t.accountId] ? parseModel(c.auto[t.accountId].m) : null;
    if (saved) { model = saved; clock = "saved"; }
    else {
      const lo = bars[0].t - DAY, hi = bars[bars.length - 1].t + DAY;
      const entries: Entry[] = trades.filter((x) => x.accountId === t.accountId && x.symbol === t.symbol)
        .map((x) => ({ wall: wall(x.entryTime), price: x.entryPrice, symbol: x.symbol })).filter((x) => x.wall >= lo && x.wall <= hi);
      const d = entries.length >= 3 ? detectModel(entries, () => ({ bars, minutes })) : null;
      if (d?.confident) { model = d.model; clock = "detected"; } else { model = GUESS; clock = "guess"; }
    }
  }
  const r = buildReplay({ trade: t, bars, minutes, model });
  return r ? { ok: true, r, src, ticker, clock, model } : { ok: false, why: "noData" };
}
