export type EconImpact = "high" | "medium" | "low";

export interface StoredEconEvent {
  id: string;
  time: string;
  currency: string;
  title: string;
  impact: EconImpact;
  previous: string;
  forecast: string;
  actual: string;
  updated_at: string;
}

const ORDER: Record<EconImpact, number> = { high: 0, medium: 1, low: 2 };

/** Keep only events whose impact and currency match the user's filters. */
export function filterEconEvents<T extends { impact: string; currency: string }>(
  events: T[],
  impacts: EconImpact[],
  currencies: string[],
): (T & { impact: EconImpact })[] {
  return events.filter(
    (e): e is T & { impact: EconImpact } =>
      (e.impact === "high" || e.impact === "medium" || e.impact === "low") &&
      impacts.includes(e.impact as EconImpact) &&
      currencies.includes(e.currency),
  );
}

/** Group events by their UTC calendar day (YYYY-MM-DD). */
export function econEventsByDay<T extends { time: string }>(events: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of events) {
    const k = e.time.slice(0, 10);
    const list = m.get(k);
    if (list) list.push(e);
    else m.set(k, [e]);
  }
  return m;
}

export interface EconDotResult {
  dots: { impact: EconImpact }[];
  extra: number;
}

/** Select at most 3 dots ordered high → medium → low; return overflow count. */
export function selectDots(events: { impact: EconImpact }[]): EconDotResult {
  const sorted = [...events].sort((a, b) => ORDER[a.impact] - ORDER[b.impact]);
  return {
    dots: sorted.slice(0, 3).map((e) => ({ impact: e.impact })),
    extra: Math.max(0, sorted.length - 3),
  };
}

/** One tooltip line for an event: "14:30 USD CPI (high)" */
export function econTooltipLine(e: {
  time: string;
  currency: string;
  title: string;
  impact: string;
}): string {
  return `${e.time.slice(11, 16)} ${e.currency} ${e.title} (${e.impact})`;
}

// ---------- MT5 economic calendar (MizanSync EA, mt5-sync function "calendar" action) ----------

export type EconSource = "mt5" | "ff";

/** MQL5's ENUM_CALENDAR_EVENT_IMPORTANCE values, mapped to our impact scale. NONE is skipped (not shown at all). */
export function mapMt5Importance(importance: string): EconImpact | null {
  switch (importance) {
    case "HIGH": return "high";
    case "MODERATE": return "medium";
    case "LOW": return "low";
    default: return null; // NONE, or anything unrecognised
  }
}

export interface Mt5CalendarEvent {
  id: string;
  time: string;
  currency: string;
  title: string;
  impact: EconImpact;
  previous: string;
  forecast: string;
  actual: string;
}

const CAL_WHEN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const CAL_CUR = /^[A-Z]{3,4}$/;

/** Validates one raw calendar event from the EA's payload; returns a clean event or null when any field is out of bounds. */
export function validateMt5CalendarEvent(raw: unknown): Mt5CalendarEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const time = typeof r.time === "string" ? r.time : "";
  const currency = typeof r.currency === "string" ? r.currency.toUpperCase() : "";
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const impact = typeof r.impact === "string" ? r.impact : "";
  const previous = typeof r.previous === "string" ? r.previous : "";
  const forecast = typeof r.forecast === "string" ? r.forecast : "";
  const actual = typeof r.actual === "string" ? r.actual : "";
  if (!id || id.length > 40) return null;
  if (!CAL_WHEN.test(time)) return null;
  if (!CAL_CUR.test(currency)) return null;
  if (!title || title.length > 200) return null;
  if (impact !== "high" && impact !== "medium" && impact !== "low") return null;
  if (previous.length > 40 || forecast.length > 40 || actual.length > 40) return null;
  return { id, time, currency, title, impact, previous, forecast, actual };
}

/** The UTC-day span the user's MT5 events cover (their earliest to their latest stored event), or null when empty. */
export function mt5CoverageRange<T extends { time: string }>(events: T[]): { min: string; max: string } | null {
  if (!events.length) return null;
  let min = events[0].time, max = events[0].time;
  for (const e of events) {
    if (e.time < min) min = e.time;
    if (e.time > max) max = e.time;
  }
  return { min: min.slice(0, 10), max: max.slice(0, 10) };
}

/** True when the MT5 coverage range (its earliest to its latest stored event) includes this UTC day. */
export function dayCoveredByMt5(day: string, range: { min: string; max: string } | null): boolean {
  return !!range && day >= range.min && day <= range.max;
}

/**
 * Merge rule: per UTC day, use the user's MT5 events when MT5's stored range covers that day,
 * otherwise fall back to the stored ForexFactory events for that day.
 */
export function mergeEconByDay<T extends { time: string }>(
  mt5ByDay: Map<string, T[]>,
  ffByDay: Map<string, T[]>,
  mt5Range: { min: string; max: string } | null,
): Map<string, { events: T[]; source: EconSource }> {
  const days = new Set([...mt5ByDay.keys(), ...ffByDay.keys()]);
  const out = new Map<string, { events: T[]; source: EconSource }>();
  for (const day of days) {
    out.set(day, dayCoveredByMt5(day, mt5Range)
      ? { events: mt5ByDay.get(day) ?? [], source: "mt5" }
      : { events: ffByDay.get(day) ?? [], source: "ff" });
  }
  return out;
}
