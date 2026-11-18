// GLORIA_RPG: WHEN the hero assignment is recomputed. Pure date logic, no I/O.
//
// There is no background job runner in this app (client + Supabase only; the one edge function is the MT5 sync), so
// "scheduled" is implemented as a due-check on open: gloriaHeroService stores the time of the last scheduled
// update (gloria_player_stats.character_checked_at) and, when Gloria is opened, asks dueUpdate() whether that
// stored time is >= 7 days old or belongs to an earlier calendar month. If so it recomputes and persists; if not
// it just reads the stored hero. Between updates the hero is therefore fixed no matter how the trades change.
//
// Calendar months are UTC, the same convention mostRecentTradingMonth() already uses for "now".

export type HeroUpdateKind = "initial" | "weekly" | "monthly";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "YYYY-MM" of a date, in UTC. */
export const utcMonth = (d: Date): string => d.toISOString().slice(0, 7);

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
  if (now.getTime() - last.getTime() >= WEEK_MS) return "weekly";
  return null;
}

/** When the weekly rule next fires: seven days after the last update. */
export function nextWeeklyAt(checkedAt: string | null, now: Date): Date {
  const last = checkedAt ? new Date(checkedAt) : now;
  return new Date((Number.isNaN(last.getTime()) ? now : last).getTime() + WEEK_MS);
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
