// How times are read for analysis: the broker's clock, where a trading day begins, and which session an hour falls
// in. Trades themselves are never rewritten — this only changes what the analytics read out of them.
//
// The functions in the first half are pure and take everything they need, so tradingTime.test.ts can pin them. The
// wrappers in the second half read one module-level copy of the settings that the Settings page keeps up to date,
// which is what lets the analytics files use them without knowing anything about React. That copy starts at the
// values the app has always used, so every default path below returns exactly what the call sites computed for
// themselves before.

/** Where the broker stamps its times. "none" takes the stamps at face value, as the app always has. */
export type BrokerClock =
  | { kind: "none" }
  | { kind: "fixed"; hours: number }
  | { kind: "mt5" };

/** Midnight is the plain calendar day; "ny17" is the forex day that turns over at 17:00 in New York. */
export type DayStart = "midnight" | "ny17";

/** The UTC hours at which the analysis sessions change over. */
export interface SessionBounds {
  tokyo: number;
  london: number;
  newYork: number;
}

export type SessionKey = "sessTK" | "sessLN" | "sessNY" | "sessSY";

/** The split sessionOf has always used: Tokyo before 07:00, London before 13:00, New York before 21:00, then Sydney. */
export const DEFAULT_BOUNDS: SessionBounds = { tokyo: 7, london: 13, newYork: 21 };

const NY = "America/New_York";
const DAY = 864e5;

/** Stored wall times read as UTC, which is the convention every other reader in the app follows. */
export const parseWall = (s: string): number =>
  Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`);

let nyFmt: Intl.DateTimeFormat | null = null;
const nyParts = (atMs: number) => {
  nyFmt ??= new Intl.DateTimeFormat("en-US", { timeZone: NY, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const parts = nyFmt.formatToParts(new Date(atMs));
  const of = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: of("year"), m: of("month"), d: of("day"), h: of("hour") % 24, min: of("minute") };
};

/** New York's distance from UTC in whole hours at that moment: -5 in winter, -4 on daylight saving. */
export function nyOffsetHours(atMs: number): number {
  const n = nyParts(atMs);
  return Math.round((Date.UTC(n.y, n.m - 1, n.d, n.h, n.min) - atMs) / 3600e3);
}

/** True while New York is on daylight saving, which is what moves an MT5 server between GMT+2 and GMT+3. */
export const nyIsDst = (atMs: number): boolean => nyOffsetHours(atMs) === -4;

/** How far ahead of UTC the broker's clock runs at that moment. */
export function brokerAheadHours(clock: BrokerClock, atMs: number): number {
  if (clock.kind === "fixed") return Number.isFinite(clock.hours) ? clock.hours : 0;
  if (clock.kind === "mt5") return nyIsDst(atMs) ? 3 : 2;
  return 0;
}

/** Which session a UTC hour belongs to. Every hour belongs to exactly one, as it always has. */
export function sessionAt(hour: number, b: SessionBounds): SessionKey {
  return hour < b.tokyo ? "sessTK" : hour < b.london ? "sessLN" : hour < b.newYork ? "sessNY" : "sessSY";
}

export interface Parts {
  /** YYYY-MM-DD. */
  day: string;
  /** 0..23, or null when the stamp carries no clock. */
  hour: number | null;
  /** 0 = Monday, matching every weekday array in the app. Null when there is no day at all. */
  weekday: number | null;
}

const weekdayOfDay = (day: string): number | null => {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return null;
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};

/**
 * The day, hour and weekday a stamp should be analysed under.
 *
 * `stamp` is whichever of exitTime / entryTime the calling site has always anchored on: this function does not
 * choose for it. With no options it returns stamp.slice(0, 10), the hour from characters 11-12 and the weekday of
 * that date — the three expressions the call sites each wrote out by hand, so the defaults cannot move a number.
 *
 * A stamp with no clock in it ("2026-03-04") has no hour to measure against a boundary, so it is read as midnight
 * and keeps its own date whatever the settings say.
 */
export function analysisParts(stamp: string | null | undefined, o: { aheadHours?: number; dayStart?: DayStart } = {}): Parts {
  const s = stamp ?? "";
  if (!s) return { day: "", hour: null, weekday: null };
  const ahead = o.aheadHours ?? 0;
  const dayStart = o.dayStart ?? "midnight";
  const plain = { day: s.slice(0, 10), hour: s.length >= 13 ? Number(s.slice(11, 13)) : null, weekday: weekdayOfDay(s.slice(0, 10)) };
  if ((ahead === 0 && dayStart === "midnight") || s.length <= 10) return plain;

  const at = parseWall(s);
  if (!Number.isFinite(at)) return plain;
  const utc = at - ahead * 3600e3; // the broker's clock taken back to real UTC
  const d = new Date(utc);
  const hour = d.getUTCHours();
  if (dayStart === "midnight") {
    const day = d.toISOString().slice(0, 10);
    return { day, hour, weekday: weekdayOfDay(day) };
  }
  // 17:00 New York: the week runs from 17:00 Sunday, and each trading day is named after the date it ends on, so
  // anything from 17:00 onwards already belongs to tomorrow.
  const n = nyParts(utc);
  const day = new Date(Date.UTC(n.y, n.m - 1, n.d) + (n.h >= 17 ? DAY : 0)).toISOString().slice(0, 10);
  return { day, hour, weekday: weekdayOfDay(day) };
}

/** Just the trading day, for the many places that group trades by nothing else. */
export const tradingDayOf = (stamp: string | null | undefined, o: { aheadHours?: number; dayStart?: DayStart } = {}): string =>
  analysisParts(stamp, o).day;

// ---------- the settings the analytics read ----------

export interface AnalysisSettings {
  bounds: SessionBounds;
  dayStart: DayStart;
  /** Used by any account without one of its own. */
  clock: BrokerClock;
  byAccount: Record<string, BrokerClock>;
}

const NEUTRAL: AnalysisSettings = { bounds: DEFAULT_BOUNDS, dayStart: "midnight", clock: { kind: "none" }, byAccount: {} };
let current: AnalysisSettings = NEUTRAL;

export const setAnalysisSettings = (next: Partial<AnalysisSettings>) => { current = { ...current, ...next }; };
export const analysisSettings = (): AnalysisSettings => current;

/** An account's own broker clock, or the global default when it has none. */
export const clockFor = (accountId: string): BrokerClock => current.byAccount[accountId] ?? current.clock;

/** True while nothing is set that could move a reading, which keeps the untouched case on its original code path. */
const neutralFor = (accountId: string) => current.dayStart === "midnight" && clockFor(accountId).kind === "none";

const forTrade = (t: { accountId: string }, stamp: string) => {
  const at = parseWall(stamp);
  return { aheadHours: brokerAheadHours(clockFor(t.accountId), Number.isFinite(at) ? at : 0), dayStart: current.dayStart };
};

/** The day, hour and weekday of a trade, read through its own account's broker clock. */
export function tradeParts(t: { accountId: string }, stamp: string | null | undefined): Parts {
  const s = stamp ?? "";
  if (!s || neutralFor(t.accountId)) return analysisParts(s);
  return analysisParts(s, forTrade(t, s));
}

/** The trading day of a trade, from the stamp its caller anchors on. */
export function tradeDay(t: { accountId: string }, stamp: string | null | undefined): string {
  const s = stamp ?? "";
  if (!s || neutralFor(t.accountId)) return s.slice(0, 10);
  return analysisParts(s, forTrade(t, s)).day;
}

/** The session of a UTC hour, under the boundaries now in force. */
export const sessionOfHour = (hour: number): SessionKey => sessionAt(hour, current.bounds);
