// Percent-position geometry for the Day by day "Hot spot" tab's release-window ruler: a horizontal
// strip from -windowMin to +windowMin minutes around a counted event, with coloured before/at-release/after
// zones and each trade drawn as a bar from entry to exit. Pure and covered by newsRuler.test.ts; the
// component turns the percents into CSS left/width.

const MIN = 60_000;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export type RulerZone = "before" | "atRelease" | "after";

export interface RulerZoneSpan {
  zone: RulerZone;
  startPct: number;
  endPct: number;
}

/**
 * Percent positions (0-100) of the ruler's three background zones for a window of `windowMin`
 * minutes either side of the release (which always sits at the exact centre, 50%). Degenerates
 * gracefully when the window leaves no room for a zone -- e.g. a 15-minute window leaves no "after"
 * zone, since release+15min is already the window's end -- by collapsing it to zero width rather
 * than overlapping or running past the ruler's ends.
 */
export function rulerZoneSpans(windowMin: number): RulerZoneSpan[] {
  const span = windowMin * 2;
  const pct = (minFromStart: number) => clamp((minFromStart / span) * 100, 0, 100);
  const atStart = pct(windowMin - 5);
  const atEnd = pct(windowMin + 15);
  return [
    { zone: "before", startPct: 0, endPct: atStart },
    { zone: "atRelease", startPct: atStart, endPct: atEnd },
    { zone: "after", startPct: atEnd, endPct: 100 },
  ];
}

/** Minimum visible width (percent of the ruler) for a trade bar, so a zero-length -- or exit-less --
 *  trade still shows as a sliver instead of disappearing. */
export const MIN_BAR_PCT = 1.5;

export interface RulerBar {
  startPct: number;
  endPct: number;
  /** The trade's real entry (or exit) fell before the ruler's start / after its end -- the bar was clipped. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/**
 * A trade's bar on the ruler: entry -> exit clipped to the [-windowMin, +windowMin] window, with a
 * floor width so a zero-length or still-open (exit-less) trade stays visible, and flags for whether
 * either end spilled past the ruler.
 */
export function rulerBar(entryMs: number, exitMs: number | null, releaseMs: number, windowMin: number): RulerBar {
  const span = windowMin * 2 * MIN;
  const rangeStart = releaseMs - windowMin * MIN;
  const pct = (t: number) => ((t - rangeStart) / span) * 100;
  const rawStart = pct(entryMs);
  const rawEnd = exitMs != null ? pct(exitMs) : rawStart;
  const lo = Math.min(rawStart, rawEnd), hi = Math.max(rawStart, rawEnd);
  let startPct = clamp(lo, 0, 100), endPct = clamp(hi, 0, 100);
  if (endPct - startPct < MIN_BAR_PCT) {
    const mid = (startPct + endPct) / 2;
    startPct = clamp(mid - MIN_BAR_PCT / 2, 0, 100 - MIN_BAR_PCT);
    endPct = startPct + MIN_BAR_PCT;
  }
  return { startPct, endPct, clippedStart: lo < 0, clippedEnd: hi > 100 };
}
