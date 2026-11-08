import type { StoredEconEvent } from "./econEvents";

/** At most this many distinct months are kept per user in the browser cache. */
export const ECON_CACHE_MAX_MONTHS = 14;

/** Cache key for one user's one month of economic-calendar rows. Always includes the user id, so
 *  one user's cached MT5/ForexFactory rows can never be read back under another user's key. */
export function econCacheKey(userId: string, month: string): string {
  return `${userId}:${month}`;
}

/** UTC start/end ISO bounds (inclusive) of a "YYYY-MM" month -- the same range the Supabase query filters on. */
export function econMonthRange(month: string): { start: string; end: string } {
  const [y, mo] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, mo - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999)).toISOString(),
  };
}

/** Given the months currently cached for one user, return the ones to drop so at most `max` remain
 *  (oldest first -- "YYYY-MM" strings sort chronologically). */
export function monthsToEvict(months: string[], max: number = ECON_CACHE_MAX_MONTHS): string[] {
  const sorted = [...new Set(months)].sort();
  const excess = sorted.length - max;
  return excess > 0 ? sorted.slice(0, excess) : [];
}

export interface EconCacheRows {
  ff: StoredEconEvent[];
  mt5: StoredEconEvent[];
}

/** Combine a cached month with a background refresh. A freshly-fetched source -- even an empty
 *  array, meaning the month genuinely has no rows -- replaces the cached one. A source that failed
 *  to fetch (null/undefined) falls back to whatever was cached, so a network error never blanks out
 *  data the user was already seeing. */
export function mergeEconCacheRows(
  cached: EconCacheRows | null,
  fresh: { ff?: StoredEconEvent[] | null; mt5?: StoredEconEvent[] | null },
): EconCacheRows {
  return {
    ff: fresh.ff ?? cached?.ff ?? [],
    mt5: fresh.mt5 ?? cached?.mt5 ?? [],
  };
}
