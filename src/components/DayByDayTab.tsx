import { useEffect, useMemo, useRef, useState } from "react";
import { dayList, dayStats, dayTrades, type DayStats } from "../lib/dayByDay";
import { fmt, fmtHold } from "../lib/stats";
import { fmtMoney } from "../lib/money";
import { usePrivacy } from "../usePrivacy";
import { setSettings, useSettings } from "../useSettings";
import { GREEN, RED } from "./dashWidgets";
import { cardBg } from "./metricUi";
import Private from "./Private";
import { CalendarDayCell } from "./CalendarDayCell";
import { supabase } from "../lib/supabase";
import { econEventsByDay, selectDots, econTooltipLine, mt5CoverageRange, mergeEconByDay, filterEconEvents, dayTradedCurrencies, filterByMySymbols, type StoredEconEvent } from "../lib/econEvents";
import { classifyZone, eventCounts, zoneDayStats, type NewsZone, type ZoneSettings } from "../lib/newsZones";
import { EconFilterChips } from "./EconFilterChips";
import { tradeOutcomeOf } from "../lib/outcome";
import { stT, makeT } from "../i18n";
import type { Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);
export const DAY_TAB: L = ["Day by Day", "يوماً بيوم", "Jour par jour"];
const X = {
  overview: ["Overview", "نظرة عامة", "Aperçu"] as L, notes: ["Notes", "ملاحظات", "Notes"] as L, trades: ["Trades", "الصفقات", "Trades"] as L,
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

export default function DayByDayTab({ lang, trades, onImport, currency = null, focusDay }: { lang: Lang; trades: Trade[]; onImport?: () => void; currency?: string | null; focusDay?: string }) {
  const k = i(lang), T = (x: L) => x[k];
  const { hidden } = usePrivacy();
  const settings = useSettings();
  const days = useMemo(() => dayList(trades), [trades]);
  const [sel, setSel] = useState<string | null>(focusDay ?? null);
  const [tab, setTab] = useState<"overview" | "notes" | "trades">("overview");
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
  const econFiltered = useMemo(() => filterEconEvents(econRaw, settings.econImpacts, settings.econCurrencies), [econRaw, settings.econImpacts, settings.econCurrencies]);
  const econMt5Filtered = useMemo(() => filterEconEvents(econMt5Raw, settings.econImpacts, settings.econCurrencies), [econMt5Raw, settings.econImpacts, settings.econCurrencies]);
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
  const zoneSettings: ZoneSettings = useMemo(() => ({ windowMin: settings.newsWindowMin, countMedium: settings.newsCountMedium }), [settings.newsWindowMin, settings.newsCountMedium]);

  // ---- that day's news + trades timeline, and the trades' news zones ----
  // The trades' news zones always use every event in range: whether a trade sat in a news window doesn't
  // depend on the timeline's own display filters below.
  const dayEvents = useMemo((): StoredEconEvent[] => (day ? allEventsByDay.get(day)?.events ?? [] : []), [allEventsByDay, day]);
  const tradeZones = useMemo(
    () => rows.map((t) => ({ trade: t, ...classifyZone(t.symbol, t.entryTime, t.exitTime, dayEvents, zoneSettings) })),
    [rows, dayEvents, zoneSettings],
  );
  const zStats = useMemo(() => zoneDayStats(tradeZones.map((z) => ({ trade: z.trade, zone: z.zone }))), [tradeZones]);

  // That day's traded symbols' currencies, for the "My symbols only" chip. Empty on days without trades, so the
  // chip has no effect then.
  const dayCurrencies = useMemo(() => dayTradedCurrencies(rows.map((t) => t.symbol)), [rows]);
  // The timeline's own display filters: the same impact/currency chips as the dashboard calendar, plus
  // (when on) restricting to the currencies of that day's traded symbols.
  const timelineEvents = useMemo(
    () => filterByMySymbols(filterEconEvents(dayEvents, settings.econImpacts, settings.econCurrencies), settings.myNewsSymbolsOnly, dayCurrencies),
    [dayEvents, settings.econImpacts, settings.econCurrencies, settings.myNewsSymbolsOnly, dayCurrencies],
  );
  type TimelineItem = { at: number } & ({ kind: "news"; event: StoredEconEvent } | { kind: "trade"; trade: Trade; zone: NewsZone | null });
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const e of timelineEvents) { const at = asDate(e.time)?.getTime(); if (at != null) items.push({ at, kind: "news", event: e }); }
    for (const z of tradeZones) { const at = asDate(z.trade.entryTime)?.getTime(); if (at != null) items.push({ at, kind: "trade", trade: z.trade, zone: z.zone }); }
    return items.sort((a, b) => a.at - b.at);
  }, [timelineEvents, tradeZones]);
  const zoneLabel = (z: NewsZone): string => ({ before: L("zoneBefore"), atRelease: L("zoneAtRelease"), after: L("zoneAfter"), held: L("zoneHeld"), normal: L("zoneNormal") }[z]);
  const zoneColor = (z: NewsZone): string => (z === "held" || z === "atRelease" ? "var(--impact-high)" : z === "before" || z === "after" ? "var(--impact-medium)" : "var(--muted)");
  const impactLabel = (imp: "high" | "medium" | "low"): string => (imp === "high" ? tt("impHigh") : imp === "medium" ? tt("impMed") : tt("impLow"));

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
  const TABS = [["overview", X.overview], ["notes", X.notes], ["trades", X.trades]] as const;
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
                  onSelect={() => setSel(d.day)}
                  hideValues={hidden}
                  variant="full"
                  monthMax={monthMax}
                  econDots={(() => { const evs = econByDay.get(d.day)?.events ?? []; const { dots } = selectDots(evs); return dots.length ? dots : undefined; })()}
                  econExtra={(() => { const evs = econByDay.get(d.day)?.events ?? []; return selectDots(evs).extra; })()}
                  econTooltipLines={(() => { const evs = econByDay.get(d.day)?.events ?? []; return evs.length ? evs.map((e) => econTooltipLine(e)) : undefined; })()}
                  econSourceLabel={(() => { const src = econByDay.get(d.day)?.source; return src === "mt5" ? L("econSourceMt5") : src === "ff" ? L("econSourceFf") : undefined; })()}
                />
              </div>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1 space-y-4">
          <div role="tablist" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border p-1" style={cardBg}>
            {TABS.map(([id, l]) => (
              <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className="shrink-0 whitespace-nowrap rounded-lg px-5 py-1.5 text-sm font-medium transition"
                style={tab === id ? { background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)" } : { color: "var(--muted)" }}>{T(l)}</button>
            ))}
          </div>
          {tab === "notes" ? (
            <div className="rounded-2xl border border-border p-10 text-center text-muted" style={cardBg}>{T(X.soon)}</div>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-border" style={cardBg}>
              <div className="border-b border-border px-5 py-3 font-heading text-sm font-semibold">{tab === "trades" ? T(X.history) : day && dt.format(new Date(day + "T00:00:00Z"))}</div>
              <div className="p-4">{strip(st)}</div>
              {tab === "overview" && (
                <div className="space-y-5 p-4 pt-0">
                  <div>
                    <h3 className="mb-2 font-heading text-sm font-semibold">{L("timeline")}</h3>
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
                    {timeline.length === 0 ? (
                      <div className="rounded-xl border border-border p-6 text-center text-sm text-muted">{L("timelineEmpty")}</div>
                    ) : (
                      <ol className="flex flex-col gap-2" aria-label={L("timeline")}>
                        {timeline.map((item) => {
                          if (item.kind === "news") {
                            const e = item.event;
                            const counted = eventCounts(e.impact, zoneSettings);
                            const d = asDate(e.time);
                            const actualDiffers = !!e.actual && e.actual !== e.forecast;
                            const hasValues = !!e.actual || !!e.forecast || !!e.previous;
                            return (
                              <li key={`n-${e.id}`} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2" style={{ ...cardBg, opacity: counted ? 1 : 0.55 }}>
                                <div className="tnum w-14 shrink-0 text-xs text-muted" dir="ltr">{d ? tm.format(d) : "—"}</div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: `var(--impact-${e.impact})`, background: `color-mix(in srgb, var(--impact-${e.impact}) 20%, transparent)` }}>{impactLabel(e.impact)}</span>
                                    <span className="text-xs font-semibold text-muted">{e.currency}</span>
                                    <span className="truncate text-sm font-medium">{e.title}</span>
                                    {!counted && <span className="text-[11px] italic text-muted">({L("notCounted")})</span>}
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
                          }
                          const t = item.trade, long = t.side === "long";
                          const outcome = tradeOutcomeOf(t);
                          const pnlColor = outcome === "win" ? GREEN : outcome === "loss" ? RED : "var(--breakeven)";
                          const d1 = asDate(t.entryTime), d2 = asDate(t.exitTime);
                          return (
                            <li key={`t-${t.key}`} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2" style={cardBg}>
                              <div className="tnum w-14 shrink-0 text-xs text-muted" dir="ltr">{d1 ? tm.format(d1) : "—"}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full px-3 py-0.5 text-xs font-bold" style={{ color: long ? "var(--primary)" : RED, background: `color-mix(in srgb, ${long ? "var(--primary)" : RED} 14%, transparent)` }}>{T(long ? X.buy : X.sell)}</span>
                                  <span className="text-sm font-semibold">{t.symbol}</span>
                                  <span className="tnum text-xs text-muted" dir="ltr">{fmt(t.qty)}</span>
                                  <span className="tnum text-xs text-muted" dir="ltr">{d1 ? tm.format(d1) : "—"} → {d2 ? tm.format(d2) : "—"}</span>
                                  <span className="tnum text-sm font-semibold" style={{ color: pnlColor }}>
                                    <Private hint={`${t.symbol} P&L`}>{money(t.pnl, false, true)}</Private>
                                  </span>
                                </div>
                                {item.zone == null ? (
                                  <div className="mt-1 text-[11px] text-muted">{L("newsUnavailable")}</div>
                                ) : (
                                  <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: zoneColor(item.zone), background: `color-mix(in srgb, ${zoneColor(item.zone)} 16%, transparent)` }}>
                                    {zoneLabel(item.zone)}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 font-heading text-sm font-semibold">{L("zoneStats")}</h3>
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border sm:grid-cols-3 xl:grid-cols-5" style={{ background: "var(--border)" }}>
                      {zStats.map((z) => (
                        <div key={z.zone} className="p-3" style={cardBg}>
                          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: zoneColor(z.zone) }}>{zoneLabel(z.zone)}</div>
                          <div className="tnum mt-1 text-lg font-bold">{z.trades}</div>
                          <div className="tnum text-[11px] text-muted" dir="ltr">{z.winRate == null ? "—" : `${fmt(z.winRate)}%`} · {money(z.net, true)}</div>
                        </div>
                      ))}
                    </div>
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
