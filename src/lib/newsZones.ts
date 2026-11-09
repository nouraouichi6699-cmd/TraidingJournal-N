// Where a trade sits relative to the day's economic news. Pure and covered by newsZones.test.ts; the Day by day
// panel feeds it that day's trades and events and renders the result.
import type { Trade } from "../types";
import { tradeCore } from "./stats";
import { symbolCurrencies } from "./symbolCurrencies";
import { isKeyEvent } from "./keyEvents";

export type NewsZone = "before" | "atRelease" | "after" | "held" | "normal";
export const NEWS_ZONES: NewsZone[] = ["before", "atRelease", "after", "held", "normal"];

export interface ZoneSettings {
  /** Minutes either side of a counted event that still count as "before" / "after" it. */
  windowMin: number;
  /** Off (the default) counts high-impact events only; on also counts medium. Low impact never counts. */
  countMedium: boolean;
  /** Off (the default): impact decides what counts (above). On: only key events (NFP/CPI/PPI/FOMC) count,
   *  whatever their impact -- the currency match above still applies either way. */
  keyEventsOnly: boolean;
}

export interface ZoneNewsEvent {
  time: string;
  currency: string;
  impact: "high" | "medium" | "low";
  title: string;
}

const MIN = 60_000;
const parseTime = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const v = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
  return Number.isNaN(v) ? null : v;
};

/** High impact always counts; medium only when the setting turns it on; low never counts. */
export const eventCounts = (impact: "high" | "medium" | "low", settings: ZoneSettings): boolean =>
  impact === "high" || (impact === "medium" && settings.countMedium);

/** Whether an event counts toward zone classification / the timeline's "counted" display: by impact normally,
 *  or by key-event title when keyEventsOnly is on. */
export const isCountedEvent = (e: { impact: "high" | "medium" | "low"; title: string }, settings: ZoneSettings): boolean =>
  settings.keyEventsOnly ? isKeyEvent(e.title) : eventCounts(e.impact, settings);

export interface ZoneResult {
  /** null when the symbol's currencies are not known: there is no zone to show for it at all. */
  zone: NewsZone | null;
  /** The event that decided the zone, when there is one. */
  event: ZoneNewsEvent | null;
}

/**
 * The trade's news zone: the most severe zone among the day's counted events whose currency belongs to the
 * symbol -- held through > at release > before/after, the closer event winning a tie between those two -- or
 * "normal" when none apply. Boundaries are inclusive on the side nearer the event (exactly 5 min before or 15 min
 * after is "at release"; exactly at the window is still "before"/"after").
 */
export function classifyZone(
  symbol: string,
  entryTime: string | null | undefined,
  exitTime: string | null | undefined,
  events: ZoneNewsEvent[],
  settings: ZoneSettings,
): ZoneResult {
  const currencies = symbolCurrencies(symbol);
  if (!currencies || !currencies.length) return { zone: null, event: null };
  const entry = parseTime(entryTime);
  if (entry == null) return { zone: null, event: null };
  const exit = parseTime(exitTime);
  const windowMs = settings.windowMin * MIN;
  const cur = new Set(currencies);

  let best: { rank: number; zone: NewsZone; event: ZoneNewsEvent; dist: number } | null = null;
  for (const e of events) {
    if (!isCountedEvent(e, settings) || !cur.has(e.currency)) continue;
    const t = parseTime(e.time);
    if (t == null) continue;

    let zone: NewsZone | null = null, rank = 0;
    if (exit != null && entry < t && t <= exit) { zone = "held"; rank = 3; }
    else if (entry >= t - 5 * MIN && entry <= t + 15 * MIN) { zone = "atRelease"; rank = 2; }
    else if (entry >= t - windowMs && entry < t - 5 * MIN) { zone = "before"; rank = 1; }
    else if (entry > t + 15 * MIN && entry <= t + windowMs) { zone = "after"; rank = 1; }
    if (!zone) continue;

    const dist = Math.abs(entry - t);
    if (!best || rank > best.rank || (rank === best.rank && dist < best.dist)) best = { rank, zone, event: e, dist };
  }
  return best ? { zone: best.zone, event: best.event } : { zone: "normal", event: null };
}

/**
 * Count of trades sitting inside the window of an actual key event (NFP/CPI/PPI/FOMC) -- any zone
 * other than normal, including held-through -- regardless of the keyEventsOnly display setting:
 * the calendar's danger-day marker is always about real key events specifically, never whatever
 * the user's current impact/key-event display filters happen to count.
 */
export function keyEventWindowTradeCount(
  trades: { symbol: string; entryTime: string | null | undefined; exitTime: string | null | undefined }[],
  events: ZoneNewsEvent[],
  windowMin: number,
): number {
  const settings: ZoneSettings = { windowMin, countMedium: false, keyEventsOnly: true };
  return trades.filter((t) => {
    const zone = classifyZone(t.symbol, t.entryTime, t.exitTime, events, settings).zone;
    return zone != null && zone !== "normal";
  }).length;
}

export interface ZoneDayStat { zone: NewsZone; trades: number; winRate: number | null; net: number }

/** Trade count, win rate and whole-unit net for each zone, in the fixed display order. */
export function zoneDayStats(rows: { trade: Trade; zone: NewsZone | null }[]): ZoneDayStat[] {
  return NEWS_ZONES.map((zone) => {
    const list = rows.filter((r) => r.zone === zone).map((r) => r.trade);
    const c = tradeCore(list);
    return { zone, trades: c.n, winRate: c.winRate, net: Math.round(c.net) };
  });
}
