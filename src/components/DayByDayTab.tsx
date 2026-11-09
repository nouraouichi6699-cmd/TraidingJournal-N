import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { dayList, dayStats, dayTrades, dayKey, type DayStats } from "../lib/dayByDay";
import { fmt, fmtHold } from "../lib/stats";
import { fmtMoney } from "../lib/money";
import { usePrivacy } from "../usePrivacy";
import { setSettings, useSettings } from "../useSettings";
import { GREEN, RED } from "./dashWidgets";
import { cardBg } from "./metricUi";
import Private from "./Private";
import { CalendarDayCell } from "./CalendarDayCell";
import { supabase } from "../lib/supabase";
import { econEventsByDay, selectDots, econTooltipLine, mt5CoverageRange, mergeEconByDay, filterEconEventsForDisplay, dayTradedCurrencies, filterByMySymbols, type StoredEconEvent } from "../lib/econEvents";
import { classifyZone, isCountedEvent, keyEventWindowTradeCount, type NewsZone, type ZoneSettings } from "../lib/newsZones";
import { keyEventKind, keyEventDayLabel } from "../lib/keyEvents";
import { rulerZoneSpans, rulerBar } from "../lib/newsRuler";
import { EconFilterChips } from "./EconFilterChips";
import { tradeOutcomeOf } from "../lib/outcome";
import { stT, makeT } from "../i18n";
import type { Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);
export const DAY_TAB: L = ["Day by Day", "يوماً بيوم", "Jour par jour"];
const X = {
  overview: ["Overview", "نظرة عامة", "Aperçu"] as L, hotspot: ["Hot spot", "منطقة ساخنة", "Zone chaude"] as L, notes: ["Notes", "ملاحظات", "Notes"] as L, trades: ["Trades", "الصفقات", "Trades"] as L,
  history: ["Trade history", "سجل الصفقات", "Historique des trades"] as L,
  net: ["Net P&L", "صافي الربح", "P&L net"] as L, win: ["Winrate", "نسبة الربح", "Taux de gain"] as L, pf: ["Profit factor", "عامل الربح", "Profit factor"] as L,
  hold: ["Avg hold", "متوسط المدة", "Durée moy."] as L, n: ["Trades", "الصفقات", "Trades"] as L, exp: ["Expectancy", "التوقع", "Espérance"] as L,
  sym: ["Symbol", "الرمز", "Symbole"] as L, type: ["Type", "النوع", "Type"] as L, entry: ["Entry", "الدخول", "Entrée"] as L, exit: ["Exit", "الخروج", "Sortie"] as L,
  et: ["Entry time", "وقت الدخول", "Heure d'entrée"] as L, xt: ["Exit time", "وقت الخروج", "Heure de sortie"] as L, vol: ["Volume", "الحجم", "Volume"] as L, pnl: ["Net profit", "صافي الربح", "Profit net"] as L,
  buy: ["Buy", "شراء", "Achat"] as L, sell: ["Sell", "بيع", "Vente"] as L,
  split: ["wins · losses · breakeven", "رابحة · خاسرة · تعادل", "gains · pertes · neutres"] as L,
  soon: ["Notes are coming soon.", "الملاحظات قريباً.", "Les notes arrivent bientôt."] as L,
  empty: ["No closed trades yet.", "لا توجد صفقات مغلقة بعد.", "Aucun trade clôturé."] as L,
  days: ["Trading days", "أيام التداول", "Jours de trading"] as L, import: ["Import trades", "استيراد الصفقات", "Importer"] as L,
};
const asDate = (s: string | null) => { if (!s) return null; const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z"); return Number.isNaN(d.getTime()) ? null : d; };

export default function DayByDayTab({ lang, trades, onImport, currency = null, focusDay, focusTab }: { lang: Lang; trades: Trade[]; onImport?: () => void; currency?: string | null; focusDay?: string; focusTab?: "hotspot" }) {
  const k = i(lang), T = (x: L) => x[k];
  const { hidden } = usePrivacy();
  const settings = useSettings();
  const days = useMemo(() => dayList(trades), [trades]);
  const [sel, setSel] = useState<string | null>(focusDay ?? null);
  const [tab, setTab] = useState<"overview" | "hotspot" | "notes" | "trades">(focusTab ?? "overview");
  const day = days.find((d) => d.day === sel)?.day ?? days[0]?.day ?? null; // falls back to the newest day when the filter hides the selection
  const rows = useMemo(() => (day ? dayTrades(trades, day) : []), [trades, day]);
  const st = useMemo(() => dayStats(rows), [rows]);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [day]);

  const L = stT(lang);
  const tt = makeT(lang);
  const [econRaw, setEconRaw] = useState<StoredEconEvent[]>([]);
  const [econMt5Raw, setEconMt5Raw] = useState<StoredEconEvent[]>([]);
  const [econMt5Times, setEconMt5Times] = useState<{ time: string }[]>([]);
  const oldestDay = days.length ? days[days.length - 1].day : null, newestDay = days.length ? days[0].day : null;

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
    // needed. The calendar-dot view below still honours the impact/currency filters, applied client-side.
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

  // The nav list's dots still honour the calendar's own impact/currency filters (applied client-side now).
  const econFiltered = useMemo(
    () => filterEconEventsForDisplay(econRaw, settings.econImpacts, settings.econCurrencies, settings.keyEventsOnly),
    [econRaw, settings.econImpacts, settings.econCurrencies, settings.keyEventsOnly],
  );
  const econMt5Filtered = useMemo(
    () => filterEconEventsForDisplay(econMt5Raw, settings.econImpacts, settings.econCurrencies, settings.keyEventsOnly),
    [econMt5Raw, settings.econImpacts, settings.econCurrencies, settings.keyEventsOnly],
  );
  const econMt5Range = useMemo(() => mt5CoverageRange(econMt5Times), [econMt5Times]);
  const econByDay = useMemo(
    () => mergeEconByDay(econEventsByDay(econMt5Filtered), econEventsByDay(econFiltered), econMt5Range),
    [econMt5Filtered, econFiltered, econMt5Range],
  );
  // The timeline and its news zones use every event in range, regardless of the calendar's dot filters.
  const allEventsByDay = useMemo(
    () => mergeEconByDay(econEventsByDay(econMt5Raw), econEventsByDay(econRaw), econMt5Range),
    [econMt5Raw, econRaw, econMt5Range],
  );
  const zoneSettings: ZoneSettings = useMemo(
    () => ({ windowMin: settings.newsWindowMin, countMedium: settings.newsCountMedium, keyEventsOnly: settings.keyEventsOnly }),
    [settings.newsWindowMin, settings.newsCountMedium, settings.keyEventsOnly],
  );

  // ---- that day's news + trades timeline, and the trades' news zones ----
  // The trades' news zones always use every event in range: whether a trade sat in a news window doesn't
  // depend on the timeline's own display filters below.
  const dayEvents = useMemo((): StoredEconEvent[] => (day ? allEventsByDay.get(day)?.events ?? [] : []), [allEventsByDay, day]);
  const tradeZones = useMemo(
    () => rows.map((t) => ({ trade: t, ...classifyZone(t.symbol, t.entryTime, t.exitTime, dayEvents, zoneSettings) })),
    [rows, dayEvents, zoneSettings],
  );
  // That day's traded symbols' currencies, for the "My symbols only" chip. Empty on days without trades, so the
  // chip has no effect then.
  const dayCurrencies = useMemo(() => dayTradedCurrencies(rows.map((t) => t.symbol)), [rows]);
  // The timeline's own display filters: the same impact/currency chips as the dashboard calendar, plus
  // (when on) restricting to the currencies of that day's traded symbols.
  const timelineEvents = useMemo(
    () => filterByMySymbols(filterEconEventsForDisplay(dayEvents, settings.econImpacts, settings.econCurrencies, settings.keyEventsOnly), settings.myNewsSymbolsOnly, dayCurrencies),
    [dayEvents, settings.econImpacts, settings.econCurrencies, settings.keyEventsOnly, settings.myNewsSymbolsOnly, dayCurrencies],
  );
  const zoneLabel = (z: NewsZone): string => ({ before: L("zoneBefore"), atRelease: L("zoneAtRelease"), after: L("zoneAfter"), held: L("zoneHeld"), normal: L("zoneNormal") }[z]);
  const zoneColor = (z: NewsZone): string => (z === "held" || z === "atRelease" ? "var(--impact-high)" : z === "before" || z === "after" ? "var(--impact-medium)" : "var(--muted)");
  const impactLabel = (imp: "high" | "medium" | "low"): string => (imp === "high" ? tt("impHigh") : imp === "medium" ? tt("impMed") : tt("impLow"));

  // ---- Hot spot tab: one card per counted event, that event's trades (ruler + list), and the rest under
  // "Other news today" ----
  const countedEvents = useMemo(
    () => timelineEvents.filter((e) => isCountedEvent(e, zoneSettings)).sort((a, b) => a.time.localeCompare(b.time)),
    [timelineEvents, zoneSettings],
  );
  const otherEvents = useMemo(() => timelineEvents.filter((e) => !isCountedEvent(e, zoneSettings)), [timelineEvents, zoneSettings]);
  const eventTrades = useMemo(() => {
    const m = new Map<string, typeof tradeZones>();
    for (const tz of tradeZones) {
      const ev = tz.event as StoredEconEvent | null;
      if (!ev) continue;
      const list = m.get(ev.id);
      if (list) list.push(tz); else m.set(ev.id, [tz]);
    }
    return m;
  }, [tradeZones]);
  const insideTrades = useMemo(() => tradeZones.filter((z) => z.zone != null && z.zone !== "normal"), [tradeZones]);
  const insideNet = useMemo(() => Math.round(insideTrades.reduce((s, z) => s + (z.trade.pnl ?? 0), 0)), [insideTrades]);
  const normalNet = useMemo(() => Math.round(tradeZones.filter((z) => z.zone === "normal").reduce((s, z) => s + (z.trade.pnl ?? 0), 0)), [tradeZones]);
  const hotspotRed = useMemo(() => tradeZones.some((z) => z.zone === "atRelease" || z.zone === "held"), [tradeZones]);
  const [otherOpen, setOtherOpen] = useState(false);

  // ---- calendar flame markers for the day-nav list: a key-event day (outline) matching the currency
  // filter, upgraded to a danger day (filled flame + glow) when a trade that day sat inside that key
  // event's window -- always a real key event, regardless of the keyEventsOnly display toggle ----
  const tradesByDay = useMemo(() => {
    const m = new Map<string, Trade[]>();
    for (const t of trades) {
      if (t.status !== "closed" || t.pnl == null) continue;
      const d = dayKey(t);
      if (!d) continue;
      const list = m.get(d);
      if (list) list.push(t); else m.set(d, [t]);
    }
    return m;
  }, [trades]);
  const dayMarkers = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const d of days) {
      const evs = allEventsByDay.get(d.day)?.events ?? [];
      const label = keyEventDayLabel(evs.filter((e) => settings.econCurrencies.includes(e.currency)));
      if (!label) continue;
      const count = keyEventWindowTradeCount(tradesByDay.get(d.day) ?? [], evs, settings.newsWindowMin);
      m.set(d.day, { label, count });
    }
    return m;
  }, [days, allEventsByDay, tradesByDay, settings.econCurrencies, settings.newsWindowMin]);
  const flameAria = (m?: { label: string; count: number }): string | undefined =>
    !m ? undefined : m.count > 0 ? L("tradedDuringKey").replace("{k}", m.label).replace("{n}", String(m.count)) : L("keyEventDayLabel").replace("{k}", m.label);

  const money = (v: number | null, sign = true, cents = false) => (v == null ? "—" : hidden ? "••••" : fmtMoney(v, { sign, cents, currency })); // summaries whole, trade rows with cents
  const tone = (v: number | null) => (hidden || v == null || v === 0 ? undefined : v > 0 ? GREEN : RED);
  const monthFmt = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" });
  const dt = new Intl.DateTimeFormat(lang === "ar" ? "ar" : lang, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const tm = new Intl.DateTimeFormat(lang === "ar" ? "ar" : lang, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const when = (s: string | null) => { const d = asDate(s); return d ? <><div>{dt.format(d)}</div><div className="text-[11px] text-muted">{tm.format(d)}</div></> : "—"; };

  if (!days.length) return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center text-muted">
      <div>{T(X.empty)}</div>
      {onImport && <button type="button" onClick={onImport} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">{T(X.import)}</button>}
    </div>
  );

  // Bidi-isolate (U+2066/U+2069) data runs inserted into a translated sentence, so they stay readable LTR
  // fragments inside an RTL (Arabic) sentence without forcing the whole line's direction.
  const isolate = (s: string) => `⁦${s}⁩`;
  const summaryLine = L("hotspotSummary")
    .replace("{n}", isolate(String(countedEvents.length)))
    .replace("{k}", isolate(String(insideTrades.length)))
    .replace("{inside}", isolate(money(insideNet)))
    .replace("{normal}", isolate(money(normalNet)));
  const RULER_ZONE_BG: Record<"before" | "atRelease" | "after", string> = {
    before: "color-mix(in srgb, var(--impact-medium) 32%, transparent)",
    atRelease: "color-mix(in srgb, var(--impact-high) 32%, transparent)",
    after: "color-mix(in srgb, #8b5cf6 32%, transparent)",
  };

  const stats: [L, string, string | undefined][] = [
    [X.net, money(st.net), tone(st.net)], [X.win, st.winRate == null ? "—" : `${fmt(st.winRate)}%`, undefined], [X.pf, st.pf == null ? "—" : fmt(st.pf), undefined],
    [X.hold, st.avgHoldMin == null ? "—" : fmtHold(st.avgHoldMin), undefined], [X.n, String(st.trades), undefined], [X.exp, money(st.expectancy), tone(st.expectancy)],
  ];
  const strip = (s: DayStats) => (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border sm:grid-cols-3 xl:grid-cols-6" style={{ background: "var(--border)" }} aria-label={`${s.wins}/${s.losses}/${s.be} ${T(X.split)}`}>
      {stats.map(([l, v, c]) => (
        <div key={l[0]} className="p-3" style={cardBg}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{T(l)}</div>
          <div className="tnum mt-1 text-lg font-bold" style={{ color: c }}><span dir="ltr">{v}</span></div>
        </div>
      ))}
    </div>
  );
  const TABS = [["overview", X.overview], ["hotspot", X.hotspot], ["notes", X.notes], ["trades", X.trades]] as const;
  let lastMonth = "";

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold text-primary">{T(DAY_TAB)}</h2>
      <div className="flex flex-col gap-4 md:flex-row">
        <nav aria-label={T(X.days)} className="flex shrink-0 gap-2 overflow-auto md:max-h-[560px] md:w-32 md:flex-col" dir="ltr">
          {days.map((d) => {
            const month = d.day.slice(0, 7), head = month !== lastMonth; lastMonth = month;
            const on = d.day === day;
            const dayNum = Number(d.day.slice(8));
            let monthMax = 0;
            for (const x of days) {
              if (x.day.slice(0, 7) === month) monthMax = Math.max(monthMax, Math.abs(x.net ?? 0));
            }
            const absNet = Math.abs(d.net ?? 0);
            const opacity = monthMax > 0 ? Math.min(0.25, 0.08 + (absNet / monthMax) * 0.17) : 0.08;
            const color = hidden || d.net === 0 ? "var(--muted)" : d.net > 0 ? "var(--primary)" : RED;
            const tintColor = hidden || d.net === 0 ? "var(--muted)" : d.net > 0 ? "var(--profit)" : "var(--loss)";
            return (
              <div key={d.day} className="contents">
                {head && <div className="hidden px-1 pt-1 text-center text-[9px] font-semibold uppercase leading-tight text-muted md:block" title={monthFmt.format(new Date(d.day + "T00:00:00Z"))}>{new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" }).format(new Date(d.day + "T00:00:00Z"))}</div>}
                <CalendarDayCell
                  ref={on ? activeRef : null}
                  dayData={{ day: d.day, net: d.net }}
                  isSelected={on}
                  onSelect={() => { setSel(d.day); setTab((dayMarkers.get(d.day)?.count ?? 0) > 0 ? "hotspot" : "overview"); }}
                  hideValues={hidden}
                  variant="full"
                  monthMax={monthMax}
                  econDots={(() => { const evs = econByDay.get(d.day)?.events ?? []; const { dots } = selectDots(evs); return dots.length ? dots : undefined; })()}
                  econExtra={(() => { const evs = econByDay.get(d.day)?.events ?? []; return selectDots(evs).extra; })()}
                  econTooltipLines={(() => { const evs = econByDay.get(d.day)?.events ?? []; return evs.length ? evs.map((e) => econTooltipLine(e)) : undefined; })()}
                  econSourceLabel={(() => { const src = econByDay.get(d.day)?.source; return src === "mt5" ? L("econSourceMt5") : src === "ff" ? L("econSourceFf") : undefined; })()}
                  flameLabel={dayMarkers.get(d.day)?.label ?? null}
                  flameDanger={(dayMarkers.get(d.day)?.count ?? 0) > 0}
                  flameAriaLabel={flameAria(dayMarkers.get(d.day))}
                />
              </div>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1 space-y-4">
          <div role="tablist" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border p-1" style={cardBg}>
            {TABS.map(([id, l]) => (
              <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className="shrink-0 whitespace-nowrap rounded-lg px-5 py-1.5 text-sm font-medium transition flex items-center gap-1.5"
                style={tab === id ? { background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)" } : { color: "var(--muted)" }}>
                {T(l)}
                {id === "hotspot" && countedEvents.length > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                    style={{ color: hotspotRed ? "#fff" : "var(--muted)", background: hotspotRed ? "var(--impact-high)" : "var(--border)" }}
                  >
                    {countedEvents.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          {tab === "notes" ? (
            <div className="rounded-2xl border border-border p-10 text-center text-muted" style={cardBg}>{T(X.soon)}</div>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-border" style={cardBg}>
              <div className="border-b border-border px-5 py-3 font-heading text-sm font-semibold">{tab === "trades" ? T(X.history) : day && dt.format(new Date(day + "T00:00:00Z"))}</div>
              <div className="p-4">{strip(st)}</div>
              {tab === "hotspot" && (
                <div className="space-y-4 p-4 pt-0">
                  <EconFilterChips
                    lang={lang}
                    extra={
                      <button
                        type="button"
                        onClick={() => setSettings({ myNewsSymbolsOnly: !settings.myNewsSymbolsOnly })}
                        aria-pressed={settings.myNewsSymbolsOnly}
                        className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold transition"
                        style={{
                          borderColor: settings.myNewsSymbolsOnly ? "var(--icon)" : "var(--border)",
                          color: settings.myNewsSymbolsOnly ? "var(--icon)" : "var(--muted)",
                          background: settings.myNewsSymbolsOnly ? "var(--primary-tint)" : "transparent",
                        }}
                      >
                        {L("mySymbolsOnly")}
                      </button>
                    }
                  />
                  {countedEvents.length === 0 ? (
                    <div className="rounded-xl border border-border p-6 text-center text-sm text-muted">{L("hotspotEmpty")}</div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-border p-3 text-sm font-medium" style={cardBg}>{summaryLine}</div>
                      <ol className="flex flex-col gap-3" aria-label={T(X.hotspot)}>
                        {countedEvents.map((e) => {
                          const evTrades = eventTrades.get(e.id) ?? [];
                          const key = keyEventKind(e.title);
                          const d = asDate(e.time);
                          const releaseMs = d?.getTime();
                          const actualDiffers = !!e.actual && e.actual !== e.forecast;
                          const hasValues = !!e.actual || !!e.forecast || !!e.previous;
                          return (
                            <li key={e.id} className="rounded-xl border border-border p-3" style={cardBg}>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="tnum w-14 shrink-0 text-xs text-muted" dir="ltr">{d ? tm.format(d) : "—"}</div>
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: `var(--impact-${e.impact})`, background: `color-mix(in srgb, var(--impact-${e.impact}) 20%, transparent)` }}>{impactLabel(e.impact)}</span>
                                {key && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: "#0a1a3f", background: "var(--c-gold)" }}>{key}</span>}
                                <span className="text-xs font-semibold text-muted">{e.currency}</span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                              </div>
                              {hasValues && (
                                <div className="tnum ms-[68px] mt-1 font-mono text-[11px] text-muted" dir="ltr">
                                  {tt("colActual")} <span className={actualDiffers ? "font-bold text-text" : undefined}>{e.actual || "—"}</span>
                                  {" · "}{L("forecast")} {e.forecast || "—"}
                                  {" · "}{tt("colPrev")} {e.previous || "—"}
                                </div>
                              )}
                              {evTrades.length > 0 && releaseMs != null && (
                                <div className="mt-3">
                                  <div
                                    className="relative h-3 w-full overflow-hidden rounded-full"
                                    style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
                                    role="img"
                                    aria-label={L("rulerLabel").replace("{w}", isolate(String(settings.newsWindowMin)))}
                                  >
                                    {rulerZoneSpans(settings.newsWindowMin).map((s) => (
                                      <div key={s.zone} className="absolute inset-y-0" style={{ left: `${s.startPct}%`, width: `${Math.max(0, s.endPct - s.startPct)}%`, background: RULER_ZONE_BG[s.zone] }} />
                                    ))}
                                    <div className="absolute inset-y-0" style={{ left: "50%", width: "1px", background: "var(--text)" }} />
                                  </div>
                                  <div className="mt-1 flex flex-col gap-1">
                                    {evTrades.map((tz) => {
                                      const entryMs = asDate(tz.trade.entryTime)?.getTime();
                                      if (entryMs == null) return null;
                                      const exitMs = asDate(tz.trade.exitTime)?.getTime() ?? null;
                                      const bar = rulerBar(entryMs, exitMs, releaseMs, settings.newsWindowMin);
                                      const outcome = tradeOutcomeOf(tz.trade);
                                      const barColor = outcome === "win" ? GREEN : outcome === "loss" ? RED : "var(--breakeven)";
                                      return (
                                        <div
                                          key={tz.trade.key}
                                          className="relative h-2 w-full rounded-full"
                                          style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }}
                                          role="img"
                                          aria-label={`${tz.trade.symbol} ${tz.zone ? zoneLabel(tz.zone) : ""}: ${money(tz.trade.pnl, false, true)}`}
                                        >
                                          <div className="absolute inset-y-0 rounded-full" style={{ left: `${bar.startPct}%`, width: `${bar.endPct - bar.startPct}%`, background: barColor }} />
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <ul className="mt-2 flex flex-col gap-1">
                                    {evTrades.map((tz) => {
                                      const outcome = tradeOutcomeOf(tz.trade);
                                      const pnlColor = outcome === "win" ? GREEN : outcome === "loss" ? RED : "var(--breakeven)";
                                      return (
                                        <li key={tz.trade.key} className="flex flex-wrap items-center gap-2 text-xs">
                                          <span className="font-semibold">{tz.trade.symbol}</span>
                                          {tz.zone && (
                                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: zoneColor(tz.zone), background: `color-mix(in srgb, ${zoneColor(tz.zone)} 16%, transparent)` }}>
                                              {zoneLabel(tz.zone)}
                                            </span>
                                          )}
                                          <span className="tnum font-semibold" style={{ color: pnlColor }}>
                                            <Private hint={`${tz.trade.symbol} P&L`}>{money(tz.trade.pnl, false, true)}</Private>
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  )}
                  <div>
                    <button
                      type="button"
                      aria-expanded={otherOpen}
                      onClick={() => setOtherOpen(!otherOpen)}
                      className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-start text-sm font-semibold"
                      style={cardBg}
                    >
                      <span className="flex-1">{L("otherNews").replace("{n}", isolate(String(otherEvents.length)))}</span>
                      <ChevronDown size={16} className={`transition-transform ${otherOpen ? "rotate-180" : ""}`} />
                    </button>
                    {otherOpen && (
                      otherEvents.length === 0 ? (
                        <div className="mt-2 rounded-xl border border-border p-4 text-center text-xs text-muted">{L("otherNewsEmpty")}</div>
                      ) : (
                        <ol className="mt-2 flex flex-col gap-2">
                          {otherEvents.map((e) => {
                            const key = keyEventKind(e.title);
                            const d = asDate(e.time);
                            const actualDiffers = !!e.actual && e.actual !== e.forecast;
                            const hasValues = !!e.actual || !!e.forecast || !!e.previous;
                            return (
                              <li key={e.id} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2" style={{ ...cardBg, opacity: 0.6 }}>
                                <div className="tnum w-14 shrink-0 text-xs text-muted" dir="ltr">{d ? tm.format(d) : "—"}</div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: `var(--impact-${e.impact})`, background: `color-mix(in srgb, var(--impact-${e.impact}) 20%, transparent)` }}>{impactLabel(e.impact)}</span>
                                    {key && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: "#0a1a3f", background: "var(--c-gold)" }}>{key}</span>}
                                    <span className="text-xs font-semibold text-muted">{e.currency}</span>
                                    <span className="truncate text-sm font-medium">{e.title}</span>
                                  </div>
                                  {hasValues && (
                                    <div className="tnum mt-1 font-mono text-[11px] text-muted" dir="ltr">
                                      {tt("colActual")} <span className={actualDiffers ? "font-bold text-text" : undefined}>{e.actual || "—"}</span>
                                      {" · "}{L("forecast")} {e.forecast || "—"}
                                      {" · "}{tt("colPrev")} {e.previous || "—"}
                                    </div>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )
                    )}
                  </div>
                </div>
              )}
              {tab === "trades" && (
                <div className="overflow-x-auto" dir="ltr">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="border-y border-border text-start text-xs text-muted">
                      {[X.sym, X.type, X.entry, X.exit, X.et, X.xt, X.vol, X.pnl].map((h) => <th key={h[0]} className="px-4 py-3 text-start font-semibold">{T(h)}</th>)}
                    </tr></thead>
                    <tbody>
                      {rows.map((r) => {
                        const long = r.side === "long";
                        return (
                          <tr key={r.key} className="border-b border-border last:border-0 hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]">
                            <td className="px-4 py-3 font-semibold">{r.symbol}</td>
                            <td className="px-4 py-3"><span className="rounded-full px-3 py-0.5 text-xs font-bold" style={{ color: long ? "var(--primary)" : RED, background: `color-mix(in srgb, ${long ? "var(--primary)" : RED} 14%, transparent)` }}>{T(long ? X.buy : X.sell)}</span></td>
                            <td className="tnum px-4 py-3">{r.entryPrice}</td>
                            <td className="tnum px-4 py-3">{r.exitPrice ?? "—"}</td>
                            <td className="px-4 py-3 text-xs">{when(r.entryTime)}</td>
                            <td className="px-4 py-3 text-xs">{when(r.exitTime)}</td>
                            <td className="tnum px-4 py-3">{fmt(r.qty)}</td>
                            <td className="tnum px-4 py-3 font-semibold" style={{ color: tone(r.pnl) }}>{money(r.pnl as number, false, true)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
