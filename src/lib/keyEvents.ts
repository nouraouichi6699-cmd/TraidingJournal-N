// The handful of recurring economic releases that move markets enough to be worth a dedicated filter,
// regardless of how ForexFactory or MT5 happen to word them that particular week. Matching is
// keyword/regex-based and case-insensitive on purpose: neither source's exact title wording is
// guaranteed, and both vary it slightly release to release (hyphens, "m/m" vs "y/y", "Core" prefixes).

export type KeyEventKind = "NFP" | "CPI" | "PPI" | "FOMC";

interface Rule {
  kind: KeyEventKind;
  match: RegExp;
  /** Matched but not this kind: a different release that happens to share a keyword. */
  exclude?: RegExp;
}

const RULES: Rule[] = [
  // Only the official payrolls report: "Non-Farm Employment Change", "Nonfarm Payrolls",
  // "Non-Farm Payrolls", "Non Farm Payrolls", ... Not "Nonfarm Productivity" (a different release that
  // happens to start with "nonfarm"), and not any ADP title ("ADP Non-Farm Employment Change" is ADP's
  // own early estimate, a different release from the official one).
  { kind: "NFP", match: /non[\s-]?farm\s*(payrolls?|employment\s*change)/i, exclude: /\badp\b|productivity/i },
  // "CPI m/m", "Core CPI y/y", "Consumer Price Index (CPI) y/y", ...
  { kind: "CPI", match: /\bcpi\b|consumer price index/i },
  // "PPI m/m", "Core PPI y/y", "Producer Price Index (PPI) m/m", ...
  { kind: "PPI", match: /\bppi\b|producer price index/i },
  // Only the statement, rate decision, press conference, minutes and projections: "FOMC Statement",
  // "FOMC Meeting Minutes", "FOMC Press Conference", "FOMC Economic Projections", "Federal Funds Rate",
  // "Fed Interest Rate Decision", ... Not an individual member's speech ("FOMC Member ... Speaks/Speech").
  { kind: "FOMC", match: /fomc|federal funds rate|fed interest rate decision/i, exclude: /member|speaks?|speech/i },
];

/** Which key-event category a calendar event's title belongs to, or null when it isn't one. */
export function keyEventKind(title: string): KeyEventKind | null {
  for (const r of RULES) if (r.match.test(title) && !(r.exclude?.test(title))) return r.kind;
  return null;
}

/** Whether a calendar event's title matches one of the key-event categories (NFP, CPI, PPI, FOMC). */
export function isKeyEvent(title: string): boolean {
  return keyEventKind(title) !== null;
}

// ---------- calendar day markers: the flame icon (key-event day / danger day) ----------

/**
 * The distinct key-event kinds present among the given events, earliest occurrence first (ties
 * broken by kind, alphabetically) -- duplicates of the same kind (e.g. two CPI releases) collapse
 * to one entry. Empty when none of the events is a key event. Callers pass events already narrowed
 * to the day and to whatever currency filter applies; impact never matters here, a key event counts
 * whatever its impact.
 */
export function keyEventDayKinds(events: { time: string; title: string }[]): KeyEventKind[] {
  const keyed = events
    .map((e) => ({ time: e.time, kind: keyEventKind(e.title) }))
    .filter((e): e is { time: string; kind: KeyEventKind } => e.kind != null)
    .sort((a, b) => a.time.localeCompare(b.time) || a.kind.localeCompare(b.kind));
  const kinds: KeyEventKind[] = [];
  for (const e of keyed) if (!kinds.includes(e.kind)) kinds.push(e.kind);
  return kinds;
}

/**
 * The flame marker's short display label: every distinct kind when there are at most two ("NFP",
 * "CPI · PPI"), or just the first kind plus an ellipsis when there are more ("CPI…") -- a variant
 * count never appears, since the marker has no room for one. Null when there's no key event. The
 * accessible label should use keyEventDayFullLabel instead, which never truncates.
 */
export function keyEventDayLabel(events: { time: string; title: string }[]): string | null {
  const kinds = keyEventDayKinds(events);
  if (!kinds.length) return null;
  if (kinds.length <= 2) return kinds.join(" · ");
  return `${kinds[0]}…`;
}

/** The full, untruncated list of the day's distinct key-event kinds, for accessible labels. Null when there's none. */
export function keyEventDayFullLabel(events: { time: string; title: string }[]): string | null {
  const kinds = keyEventDayKinds(events);
  return kinds.length ? kinds.join(" · ") : null;
}

const parseIso = (s: string): number | null => {
  const v = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
  return Number.isNaN(v) ? null : v;
};

/**
 * The soonest key event (NFP/CPI/PPI/FOMC) at or after `nowMs`, within `withinDays` days, among
 * events whose currency passes the filter -- or null when there is none. Ties (identical
 * timestamps) break by title then currency, so the pick is deterministic.
 */
export function nextKeyEvent<T extends { time: string; currency: string; title: string }>(
  events: T[],
  nowMs: number,
  currencies: string[],
  withinDays = 14,
): (T & { kind: KeyEventKind }) | null {
  const limit = nowMs + withinDays * 86_400_000;
  const candidates = events
    .filter((e) => currencies.includes(e.currency))
    .map((e) => ({ e, kind: keyEventKind(e.title), t: parseIso(e.time) }))
    .filter((x): x is { e: T; kind: KeyEventKind; t: number } => x.kind != null && x.t != null && x.t >= nowMs && x.t <= limit);
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.t - b.t || a.e.title.localeCompare(b.e.title) || a.e.currency.localeCompare(b.e.currency));
  return { ...candidates[0].e, kind: candidates[0].kind };
}
