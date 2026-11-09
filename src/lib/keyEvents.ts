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
