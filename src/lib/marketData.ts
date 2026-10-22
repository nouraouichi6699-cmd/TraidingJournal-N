// Daily market prices for Reports > Benchmark & Market: the user's CSV imports first, then a local cache, then the
// "market" Supabase function (Yahoo Finance, then Stooq). Bars are stored compactly as [date, open, high, low, close].
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { cleanBars, parseOhlcCsv, parseYahooChart, type Bar, type Ticker } from "./benchmark";

export type Source = "stooq" | "yahoo" | "csv";
export interface Prices { bars: Bar[]; source: Source; updated: number }
export type LoadError = "notDeployed" | "unreachable" | "noData" | "noTicker";

const CACHE = "mizan-mkt:", CSV = "mizan-mkt-csv:", MAP = "mizan-mkt-map", PREFS = "mizan-bench";
type Packed = { b: [string, number, number, number, number][]; s: Source; u: number };
const pack = (p: Prices): Packed => ({ b: p.bars.map((x) => [x.d, x.o, x.h, x.l, x.c]), s: p.source, u: p.updated });
const unpack = (p: Packed): Prices => ({ bars: p.b.map(([d, o, h, l, c]) => ({ d, o, h, l, c })), source: p.s, updated: p.u });
const read = (k: string): Prices | null => { try { const v = JSON.parse(localStorage.getItem(k) ?? "null"); return v?.b ? unpack(v) : null; } catch { return null; } };
const write = (k: string, p: Prices) => { try { localStorage.setItem(k, JSON.stringify(pack(p))); } catch { /* storage full: keep it for this session only */ } };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

/** Saved choices of the tab (benchmark, custom ticker, risk-free rate, bar size). */
export interface BenchPrefs { bench: string; custom: string; rf: number; barMinutes: number }
export const loadPrefs = (): BenchPrefs => { try { return { bench: "spx", custom: "", rf: 0, barMinutes: 60, ...JSON.parse(localStorage.getItem(PREFS) ?? "{}") }; } catch { return { bench: "spx", custom: "", rf: 0, barMinutes: 60 }; } };
export const savePrefs = (p: BenchPrefs) => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch { /* ignore */ } };

/** Ticker overrides typed by the user for symbols the app cannot map ({ symbol: Yahoo ticker }). */
export const loadMap = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(MAP) ?? "{}") ?? {}; } catch { return {}; } };
export const saveMap = (m: Record<string, string>) => { try { localStorage.setItem(MAP, JSON.stringify(m)); } catch { /* ignore */ } };

/** A CSV the user imported for a target ("bench:spx", "sym:XAUUSD"); it wins over downloaded prices. */
export const readCsv = (target: string) => read(CSV + target);
export function importCsv(target: string, text: string): Prices | null {
  const bars = parseOhlcCsv(text);
  if (bars.length < 5) return null;
  const p: Prices = { bars, source: "csv", updated: Date.now() };
  write(CSV + target, p);
  return p;
}
export const clearCsv = (target: string) => { try { localStorage.removeItem(CSV + target); } catch { /* ignore */ } };

/** Bars cover the window when they start within a week of `from` and reach the last few days before `to` (or today). */
const covers = (bars: Bar[], from: string, to: string) => bars.length > 0 && bars[0].d <= addDays(from, 7) && bars[bars.length - 1].d >= addDays(to < today() ? to : today(), -4);

// One download at a time (Yahoo limits bursts), and the same request in flight is shared.
let queue: Promise<unknown> = Promise.resolve();
const inflight = new Map<string, Promise<Bar[] | LoadError>>();
function download(provider: "stooq" | "yahoo", ticker: string, from: string, to: string): Promise<Bar[] | LoadError> {
  const id = `${provider}|${ticker}|${from}|${to}`, running = inflight.get(id);
  if (running) return running;
  const run = async (): Promise<Bar[] | LoadError> => {
    try {
      const { data, error } = await supabase.functions.invoke("market", { body: { provider, ticker, from, to } });
      if (error) return error instanceof FunctionsHttpError && (error.context as Response | undefined)?.status === 404 ? "notDeployed" : "unreachable";
      if (!data?.ok || typeof data.raw !== "string" || !data.raw) return [];
      return provider === "yahoo" ? parseYahooChart(data.raw) : parseOhlcCsv(data.raw);
    } catch {
      return "unreachable";
    }
  };
  const p = queue.then(run, run);
  queue = p;
  inflight.set(id, p);
  void p.finally(() => inflight.delete(id));
  return p;
}

/**
 * Daily bars from `from` to `to` (the caller adds the look-back it needs). Order: imported CSV, cached download that covers
 * the window, then the market function (Yahoo Finance first; Stooq as a fallback). A cached download that does not cover
 * the window is still returned when the function cannot be reached.
 */
export async function loadDaily(target: string, t: Ticker | null, from: string, to: string): Promise<Prices | { error: LoadError }> {
  const csv = readCsv(target);
  if (csv) return csv;
  if (!t || (!t.stooq && !t.yahoo)) return { error: "noTicker" };
  const sources = (["yahoo", "stooq"] as const).flatMap((p) => (t[p] ? [{ provider: p, ticker: t[p] as string, key: `${CACHE}${p}:${t[p]}` }] : []));
  for (const s of sources) { const c = read(s.key); if (c && covers(c.bars, from, to)) return c; } // any cached provider first: no call at all
  let fallback: Prices | null = null, failure: LoadError = "noData";
  for (const { provider, ticker, key } of sources) {
    const cached = read(key);
    const got = await download(provider, ticker, from, to);
    if (typeof got === "string") { failure = got; fallback = fallback ?? cached; if (got === "notDeployed") break; continue; }
    if (got.length) {
      const bars = cleanBars([...(cached?.bars ?? []), ...got]); // new download wins on the same day
      const p: Prices = { bars, source: provider, updated: Date.now() };
      write(key, p);
      return p;
    }
    fallback = fallback ?? cached;
  }
  return fallback ?? { error: failure };
}

/** Forget downloaded prices (keeps CSV imports), e.g. to refresh. */
export function clearDownloads() {
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith(CACHE)) localStorage.removeItem(k); } } catch { /* ignore */ }
}
