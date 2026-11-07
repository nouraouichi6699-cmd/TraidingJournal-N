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
