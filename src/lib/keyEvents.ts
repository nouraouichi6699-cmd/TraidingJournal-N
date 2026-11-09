// The handful of recurring economic releases that move markets enough to be worth a dedicated filter,
// regardless of how ForexFactory or MT5 happen to word them that particular week. Matching is
// keyword/regex-based and case-insensitive on purpose: neither source's exact title wording is
// guaranteed, and both vary it slightly release to release (hyphens, "m/m" vs "y/y", "Core" prefixes).

export type KeyEventKind = "NFP" | "CPI" | "PPI" | "FOMC";

const PATTERNS: [KeyEventKind, RegExp][] = [
  // "Non-Farm Employment Change", "Nonfarm Payrolls", "Non-Farm Payrolls", "Non Farm Payrolls", ...
  ["NFP", /non[\s-]?farm/i],
  // "CPI m/m", "Core CPI y/y", "Consumer Price Index (CPI) y/y", ...
  ["CPI", /\bcpi\b|consumer price index/i],
  // "PPI m/m", "Core PPI y/y", "Producer Price Index (PPI) m/m", ...
  ["PPI", /\bppi\b|producer price index/i],
  // "FOMC Statement", "FOMC Meeting Minutes", "FOMC Press Conference", "FOMC Economic Projections",
  // "Federal Funds Rate", "Fed Interest Rate Decision", ...
  ["FOMC", /fomc|federal funds rate|fed interest rate decision/i],
];

/** Which key-event category a calendar event's title belongs to, or null when it isn't one. */
export function keyEventKind(title: string): KeyEventKind | null {
  for (const [kind, re] of PATTERNS) if (re.test(title)) return kind;
  return null;
}

/** Whether a calendar event's title matches one of the key-event categories (NFP, CPI, PPI, FOMC). */
export function isKeyEvent(title: string): boolean {
  return keyEventKind(title) !== null;
}
