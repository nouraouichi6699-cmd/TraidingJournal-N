// Supabase Edge Function "calendar": real economic-calendar events (this week + next week).
// Source: public weekly JSON feed. Fields available: title, currency, time, impact, forecast, previous.
// (No "actual" value in this feed: plug a provider that has it later and fill `actual`.)

export interface Ev {
  id: string;
  ts: number; // UTC milliseconds
  cur: string;
  title: string;
  impact: "high" | "medium" | "low" | "none" | "holiday";
  prev: string;
  fc: string;
  actual?: string;
}

const SOURCES = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
];

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const IMPACT: Record<string, Ev["impact"]> = { high: "high", medium: "medium", low: "low", holiday: "holiday", "non-economic": "none", none: "none" };

export function normalize(raw: unknown): Ev[] {
  if (!Array.isArray(raw)) return [];
  const out: Ev[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const title = String(r.title ?? "").trim();
    const cur = String(r.country ?? "").trim().toUpperCase();
    const ts = Date.parse(String(r.date ?? ""));
    if (!title || !cur || isNaN(ts)) continue;
    const impact = IMPACT[String(r.impact ?? "").toLowerCase()] ?? "none";
    out.push({
      id: `${ts}-${cur}-${title}`,
      ts, cur, title, impact,
      prev: String(r.previous ?? ""),
      fc: String(r.forecast ?? ""),
      ...(r.actual ? { actual: String(r.actual) } : {}),
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

let cache: { at: number; events: Ev[]; failed: number } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < 15 * 60_000) return cache;
  let failed = 0;
  const parts = await Promise.all(
    SOURCES.map(async (u) => {
      try {
        const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MizanCalendar/1.0)" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(String(r.status));
        return normalize(await r.json());
      } catch {
        failed++;
        return [];
      }
    }),
  );
  const events = parts.flat();
  // If every source failed, keep serving the previous cache instead of an empty list.
  if (events.length === 0 && cache) return cache;
  cache = { at: Date.now(), events, failed };
  return cache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const { events, at } = await load();
  return new Response(JSON.stringify({ events, updated: new Date(at).toISOString() }), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
});
