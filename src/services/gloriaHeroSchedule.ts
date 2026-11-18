// GLORIA_RPG: WHEN the hero assignment is recomputed. Pure date logic, no I/O.
//
// There is no background job runner in this app (client + Supabase only; the one edge function is the MT5 sync), so
// "scheduled" is implemented as a due-check on open: gloriaHeroService stores the time of the last scheduled
// update (gloria_player_stats.character_checked_at) and, when Gloria is opened, asks dueUpdate() whether a
// boundary has been crossed since then. If so it recomputes and persists; if not it just reads the stored hero.
// Between updates the hero is therefore fixed no matter how the trades change.
//
// The boundaries:
//   - weekly: SATURDAY 00:00 UTC. The trading week is Monday-Friday (every weekly stat in the app is UTC with
//     Monday-first weeks, see lib/calendar.ts weekStart), so the first moment after Friday's close is Saturday. The
//     update is due once now has reached the first Saturday 00:00 UTC after the last update; it is NOT "7 days
//     after the last check", so it no longer drifts onto whatever weekday the player happened to open Gloria.
//   - monthly: the first moment of a new calendar month, UTC (unchanged).
// Everything is UTC, the same convention mostRecentTradingMonth() uses. Display these dates in UTC too, or a player
// west of Greenwich would be shown "Friday" for a Saturday boundary.

export type HeroUpdateKind = "initial" | "weekly" | "monthly";

const DAY_MS = 24 * 60 * 60 * 1000;
const SATURDAY = 6; // Date#getUTCDay()

/** "YYYY-MM" of a date, in UTC. */
export const utcMonth = (d: Date): string => d.toISOString().slice(0, 7);

/** The first Saturday 00:00 UTC strictly after `d` (a `d` that is itself on a Saturday gets the following one). */
export function nextSaturdayAfter(d: Date): Date {
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const daysAhead = (SATURDAY - d.getUTCDay() + 7) % 7 || 7;
  return new Date(midnight + daysAhead * DAY_MS);
}

/**
 * Is a scheduled update due? `checkedAt` is when the last one ran (null/unparseable: none yet -> "initial").
 * A new calendar month beats the weekly rule, so a Dec 1 update after a Nov 28 one reads as "monthly".
 * A checkedAt in the future (clock skew between devices) is never due.
 */
export function dueUpdate(checkedAt: string | null, now: Date): HeroUpdateKind | null {
  if (!checkedAt) return "initial";
  const last = new Date(checkedAt);
  if (Number.isNaN(last.getTime())) return "initial";
  if (last.getTime() > now.getTime()) return null;
  if (utcMonth(last) !== utcMonth(now)) return "monthly";
  if (now.getTime() >= nextSaturdayAfter(last).getTime()) return "weekly";
  return null;
}

/** The upcoming Saturday 00:00 UTC the weekly rule fires on: the first one after the last update that is still ahead. */
export function nextWeeklyAt(checkedAt: string | null, now: Date): Date {
  const last = checkedAt ? new Date(checkedAt) : now;
  const boundary = nextSaturdayAfter(Number.isNaN(last.getTime()) ? now : last);
  return boundary.getTime() > now.getTime() ? boundary : nextSaturdayAfter(now);
}

/** 00:00 UTC on the first day of the month after `now`'s. */
export function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** The earlier of the two, i.e. when the hero will actually next be re-evaluated. */
export function nextUpdateAt(checkedAt: string | null, now: Date): Date {
  const w = nextWeeklyAt(checkedAt, now), m = nextMonthStart(now);
  return w.getTime() <= m.getTime() ? w : m;
}
