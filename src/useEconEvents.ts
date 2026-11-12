import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { econEventsByDay, mergeEconByDay, mt5CoverageRange, type StoredEconEvent } from "./lib/econEvents";

/**
 * Economic events (ForexFactory `econ_events` + MT5 `econ_events_mt5`) for an inclusive UTC day range
 * (YYYY-MM-DD strings; null/null = nothing to fetch). Shared by Day by day and the Activity & Behaviour tab.
 *
 * Returns the raw rows of both sources, the MT5 coverage range, and `allEventsByDay`: every event in range
 * (no impact/currency filtering) merged per day with the MT5-over-ForexFactory rule -- what news-zone
 * classification uses.
 */
export function useEconEvents(oldestDay: string | null, newestDay: string | null) {
  const [econRaw, setEconRaw] = useState<StoredEconEvent[]>([]);
  const [econMt5Raw, setEconMt5Raw] = useState<StoredEconEvent[]>([]);
  const [econMt5Times, setEconMt5Times] = useState<{ time: string }[]>([]);

  useEffect(() => {
    if (!oldestDay || !newestDay) { setEconRaw([]); setEconMt5Raw([]); setEconMt5Times([]); return; }
    const rangeStart = `${oldestDay}T00:00:00.000Z`, rangeEnd = `${newestDay}T23:59:59.999Z`;
    let cancelled = false;

    // Supabase/PostgREST caps a single response at 1000 rows: page with .range() rather than
    // trust one request, since a long trading history can hold many thousands of calendar rows.
    const pageAll = async <T,>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> => {
      const out: T[] = [];
      for (let from = 0; from < 50_000; from += 1000) {
        const { data } = await build(from, from + 999);
        if (!data || !data.length) break;
        out.push(...(data as T[]));
        if (data.length < 1000) break;
      }
      return out;
    };

    // Not filtered by impact/currency server-side: the day timeline (and its news zones) needs every event in
    // range, whatever the calendar's own dot filters say, plus the forecast/previous/actual fields the dots never
    // needed. Callers that show dots still honour the impact/currency filters, applied client-side.
    pageAll<StoredEconEvent>((from, to) => supabase.from("econ_events").select("id,time,currency,title,impact,previous,forecast,actual")
      .gte("time", rangeStart).lte("time", rangeEnd).range(from, to))
      .then((rows) => { if (!cancelled) setEconRaw(rows); });
    pageAll<StoredEconEvent>((from, to) => supabase.from("econ_events_mt5").select("id,time,currency,title,impact,previous,forecast,actual")
      .gte("time", rangeStart).lte("time", rangeEnd).range(from, to))
      .then((rows) => { if (!cancelled) setEconMt5Raw(rows); });
    // NOT filtered by impact/currency, and only the "time" column: mt5CoverageRange needs every
    // row this user has in range to tell "MT5 has no data for this day" apart from "MT5 has data
    // but it's filtered out" -- the latter must still suppress the ForexFactory fallback.
    pageAll<{ time: string }>((from, to) => supabase.from("econ_events_mt5").select("time")
      .gte("time", rangeStart).lte("time", rangeEnd).range(from, to))
      .then((rows) => { if (!cancelled) setEconMt5Times(rows); });

    return () => { cancelled = true; };
  }, [oldestDay, newestDay]);

  const mt5Range = useMemo(() => mt5CoverageRange(econMt5Times), [econMt5Times]);
  const allEventsByDay = useMemo(
    () => mergeEconByDay(econEventsByDay(econMt5Raw), econEventsByDay(econRaw), mt5Range),
    [econMt5Raw, econRaw, mt5Range],
  );
  return { econRaw, econMt5Raw, mt5Range, allEventsByDay };
}
