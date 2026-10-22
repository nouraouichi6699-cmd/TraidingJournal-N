// Measured trade paths for Reports > Trade path: downloads intraday bars, finds each account's broker clock, measures every
// closed trade once and keeps the result (a few numbers per trade) in local storage. Intraday bars themselves are not kept.
import type { Trade } from "../types";
import { atrPct, tickerFor, type Bar, type Ticker } from "./benchmark";
import { addDays, importCsv, INTERVAL_MIN, INTRADAY_DAYS, intradayChunks, loadDaily, loadIntraday, type Interval, type LoadError } from "./marketData";
import { detectModel, MIN_BARS, modelId, parseIntradayCsv, parseModel, tradePath, wallToUtc, type Entry, type IBar, type Path, type TimeModel } from "./path";

const STORE = "mizan-path:v1", CLOCK = "mizan-path-clock:v1", DAY = 864e5;
export type NoPath = "noTicker" | "noData" | "tiny" | "coarse" | "short" | "gap" | "clock" | "old"; // "short": stored before tiny / coarse were told apart
/** Why a trade could not be measured from bars of `minutes`: under 3 one-minute bars, shorter than 3 coarser bars, or prices missing for part of it. */
const why = (s: number, e: number, minutes: number): NoPath => (e - s >= MIN_BARS * minutes * 6e4 ? "gap" : minutes <= 1 ? "tiny" : "coarse");
export type PathSrc = "yahoo" | "csv";
type Packed = { s: PathSrc; m: string; r: number; p: (number | null)[] } | { s: "none"; r: NoPath; at: number };
export type Stored = { src: PathSrc; model: string; res: number; path: Path } | { none: NoPath; at: number };
const FIELDS = ["res", "dur", "final", "mfe", "mae", "tMfe", "tMae", "eFav", "eAdv", "sd", "below", "fav", "near", "stag", "tBe", "recMae", "cross", "area"] as const;
const pack = (p: Path) => FIELDS.map((f) => { const v = p[f]; return v == null ? null : Number(v.toPrecision(10)); });
const unpack = (a: (number | null)[]): Path => Object.fromEntries(FIELDS.map((f, i) => [f, a[i]])) as unknown as Path;
const readJson = <T,>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(k) ?? "null") as T) ?? d; } catch { return d; } };
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full: kept for this session only */ } };

/** Measured paths by trade key. */
export function readPaths(): Map<string, Stored> {
  const raw = readJson<Record<string, Packed>>(STORE, {}), out = new Map<string, Stored>();
  for (const [k, v] of Object.entries(raw)) out.set(k, v.s === "none" ? { none: v.r, at: v.at } : { src: v.s, model: v.m, res: v.r, path: unpack(v.p) });
  return out;
}
function writePaths(m: Map<string, Stored>) {
  const o: Record<string, Packed> = {};
  for (const [k, v] of m) o[k] = "none" in v ? { s: "none", r: v.none, at: v.at } : { s: v.src, m: v.model, r: v.res, p: pack(v.path) };
  writeJson(STORE, o);
}
/** Forget downloaded paths (keeps paths measured from imported CSV bars). */
export function clearDownloadedPaths() { const m = readPaths(); for (const [k, v] of m) if (!("src" in v && v.src === "csv")) m.delete(k); writePaths(m); }

/** Broker clock: chosen by the user (applies to every account) or detected per account. */
export interface ClockStore { override: string; auto: Record<string, { m: string; n: number; at: number }> }
export const readClock = (): ClockStore => ({ override: "", auto: {}, ...readJson<Partial<ClockStore>>(CLOCK, {}) });
export const saveClockOverride = (m: TimeModel | null) => { const c = readClock(); c.override = m ? modelId(m) : ""; writeJson(CLOCK, c); };

export const wall = (s: string | null | undefined) => { if (!s) return NaN; let x = s.trim().replace(" ", "T").slice(0, 16); if (x.length === 10) x += "T00:00"; return Date.parse(`${x}Z`); };
const dayOfMs = (u: number) => new Date(u).toISOString().slice(0, 10);
const closedOk = (t: Trade) => t.status === "closed" && t.pnl != null && Number.isFinite(wall(t.entryTime)) && Number.isFinite(wall(t.exitTime)) && t.exitPrice != null;
export const tickerOfSymbol = (symbol: string, map: Record<string, string>): Ticker | null => (map[symbol] ? { yahoo: map[symbol], stooq: null } : tickerFor(symbol));
const fromDaily = (b: Bar[]): IBar[] => b.map((x) => ({ t: Date.parse(`${x.d}T00:00:00Z`), o: x.o, h: x.h, l: x.l, c: x.c }));

export interface Clock { accountId: string; model: TimeModel | null; how: "override" | "detected" | "saved" | "none"; n: number }
export interface MeasureResult { clocks: Clock[]; error: LoadError | null; measured: number }

/**
 * Measures the closed trades that have no stored path yet (or all of them with `force`; with a clock override, those
 * measured with another clock). Bar size by age: 1-minute for trades of the last 28 days, 5-minute up to 58 days, hourly
 * up to 728 days, daily before (only trades lasting several days can be measured from daily bars). The clock of each
 * account comes from the override, else from its entries (detectModel), else from the last clock found for it.
 */
export async function measurePaths(o: { trades: Trade[]; now: number; map: Record<string, string>; force?: boolean; onProgress?: (done: number, total: number) => void }): Promise<MeasureResult> {
  const store = readPaths(), clock = readClock(), override = clock.override ? parseModel(clock.override) : null;
  const todo = o.trades.filter(closedOk).filter((t) => {
    const x = store.get(t.key);
    if (!x) return true;
    if ("none" in x) return o.force || o.now - x.at > DAY;
    if (x.src === "csv") return false;
    return !!o.force || (override != null && x.res < 1440 && x.model !== modelId(override));
  });
  const groups = new Map<string, { ticker: string; symbol: string; iv: Interval | "1d"; trades: Trade[] }>();
  for (const t of todo) {
    const tk = tickerOfSymbol(t.symbol, o.map)?.yahoo;
    if (!tk) { store.set(t.key, { none: "noTicker", at: o.now }); continue; }
    const age = (o.now - wall(t.entryTime)) / DAY, iv: Interval | "1d" = age <= INTRADAY_DAYS["1m"] ? "1m" : age <= INTRADAY_DAYS["5m"] ? "5m" : age <= INTRADAY_DAYS["60m"] ? "60m" : "1d";
    const g = `${tk}|${iv}`;
    (groups.get(g) ?? groups.set(g, { ticker: tk, symbol: t.symbol, iv, trades: [] }).get(g)!).trades.push(t);
  }
  const today = dayOfMs(o.now), span = (g: { iv: Interval | "1d"; trades: Trade[] }) => {
    let a = dayOfMs(Math.min(...g.trades.map((t) => wall(t.entryTime))) - DAY), z = dayOfMs(Math.max(...g.trades.map((t) => wall(t.exitTime))) + DAY);
    if (g.iv !== "1d") { const lim = dayOfMs(o.now - INTRADAY_DAYS[g.iv] * DAY); if (a < lim) a = lim; } else { a = addDays(a, -5); }
    if (z > today) z = today;
    return [a, z] as const;
  };
  let total = 0, done = 0;
  for (const g of groups.values()) { const [a, z] = span(g); total += g.iv === "1d" ? 1 : intradayChunks(g.iv, a, z); }
  o.onProgress?.(0, total);
  const bars = new Map<string, { bars: IBar[]; minutes: number }>();
  let error: LoadError | null = null;
  for (const [k, g] of groups) {
    const [a, z] = span(g);
    if (a > z) continue;
    if (g.iv === "1d") {
      const r = await loadDaily(`sym:${g.symbol}`, { yahoo: g.ticker, stooq: null }, a, z);
      o.onProgress?.(++done, total);
      if ("error" in r) { if (r.error === "notDeployed" || r.error === "unreachable") { error = r.error; break; } continue; }
      bars.set(k, { bars: fromDaily(r.bars), minutes: 1440 });
    } else {
      const r = await loadIntraday(g.ticker, g.iv, a, z, () => o.onProgress?.(++done, total));
      if (typeof r === "string") { if (r === "notDeployed" || r === "unreachable") { error = r; break; } continue; }
      if (r.length) bars.set(k, { bars: r, minutes: INTERVAL_MIN[g.iv] });
    }
  }
  // broker clock per account, from its entries matched against intraday bars
  const groupOf = new Map<string, string>();
  for (const [k, g] of groups) for (const t of g.trades) groupOf.set(t.key, k);
  const accounts = [...new Set(todo.map((t) => t.accountId))], clocks: Clock[] = [];
  for (const acc of accounts) {
    const entries: Entry[] = todo.filter((t) => t.accountId === acc && groupOf.has(t.key) && !groupOf.get(t.key)!.endsWith("|1d") && bars.has(groupOf.get(t.key)!))
      .map((t) => ({ wall: wall(t.entryTime), price: t.entryPrice, symbol: t.symbol, g: groupOf.get(t.key) }));
    let model: TimeModel | null = null, how: Clock["how"] = "none", n = 0;
    if (override) { model = override; how = "override"; }
    else {
      const d = entries.length ? detectModel(entries, (e) => bars.get(e.g as string) ?? null) : null;
      if (d?.confident) { model = d.model; how = "detected"; n = d.n; clock.auto[acc] = { m: modelId(d.model), n: d.n, at: o.now }; }
      else if (clock.auto[acc]) { model = parseModel(clock.auto[acc].m); how = "saved"; n = clock.auto[acc].n; }
    }
    if (entries.length || override) clocks.push({ accountId: acc, model, how, n });
  }
  writeJson(CLOCK, clock);
  // measure
  let measured = 0;
  for (const t of todo) {
    const k = groupOf.get(t.key);
    if (!k) continue; // no ticker: already marked
    const b = bars.get(k);
    if (!b) { if (!error) store.set(t.key, { none: "noData", at: o.now }); continue; }
    const s = wall(t.entryTime), e = wall(t.exitTime);
    if (b.minutes >= 1440) {
      const p = tradePath(t, s, e, b.bars, b.minutes);
      store.set(t.key, p ? { src: "yahoo", model: "", res: b.minutes, path: p } : { none: "old", at: o.now });
      if (p) measured++;
      continue;
    }
    const c = clocks.find((x) => x.accountId === t.accountId)?.model;
    if (!c) { store.set(t.key, { none: "clock", at: o.now }); continue; }
    const p = tradePath(t, wallToUtc(c, s), wallToUtc(c, e), b.bars, b.minutes);
    store.set(t.key, p ? { src: "yahoo", model: modelId(c), res: b.minutes, path: p } : { none: why(s, e, b.minutes), at: o.now });
    if (p) measured++;
  }
  writePaths(store);
  return { clocks, error, measured };
}

/**
 * Intraday bars exported from MT5 for one symbol (the broker's own clock and prices): measures every closed trade of that
 * symbol inside the file's time span, and keeps the file's daily bars for Benchmark & Market. Null when the file has no bars.
 */
export function importPathCsv(symbol: string, text: string, trades: Trade[], now: number): { measured: number; inSpan: number; minutes: number } | null {
  const { bars, minutes } = parseIntradayCsv(text);
  if (bars.length < 10) return null;
  importCsv(`sym:${symbol}`, text);
  const store = readPaths(), a = bars[0].t, z = bars[bars.length - 1].t + minutes * 6e4;
  let measured = 0, inSpan = 0;
  for (const t of trades.filter((x) => x.symbol === symbol && closedOk(x))) {
    const s = wall(t.entryTime), e = wall(t.exitTime);
    if (s < a || e > z) continue;
    inSpan++;
    const p = tradePath(t, s, e, bars, minutes);
    if (p) { store.set(t.key, { src: "csv", model: "0|none", res: minutes, path: p }); measured++; } else store.set(t.key, { none: why(s, e, minutes), at: now });
  }
  writePaths(store);
  return { measured, inSpan, minutes };
}
/** Forget the paths measured from an imported CSV for one symbol. */
export function removePathCsv(symbol: string, trades: Trade[]) {
  const store = readPaths(), keys = new Set(trades.filter((t) => t.symbol === symbol).map((t) => t.key));
  for (const [k, v] of store) if (keys.has(k) && "src" in v && v.src === "csv") store.delete(k);
  writePaths(store);
}

/** Daily ATR(14) in price units on the day before each entry, from daily bars of the symbol. */
export function atrBefore(daily: Bar[], entryDay: string): number | null {
  const a = atrPct(daily);
  let k = -1;
  for (let i = 0; i < daily.length && daily[i].d < entryDay; i++) k = i;
  return k >= 0 && a[k] != null ? ((a[k] as number) / 100) * daily[k].c : null;
}
