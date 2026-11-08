import { useEffect, useMemo, useRef, useState } from "react";
import { dayList, dayStats, dayTrades, type DayStats } from "../lib/dayByDay";
import { fmt, fmtHold } from "../lib/stats";
import { fmtMoney } from "../lib/money";
import { usePrivacy } from "../usePrivacy";
import { useSettings } from "../useSettings";
import { GREEN, RED } from "./dashWidgets";
import { cardBg } from "./metricUi";
import Private from "./Private";
import { CalendarDayCell } from "./CalendarDayCell";
import { supabase } from "../lib/supabase";
import { econEventsByDay, selectDots, econTooltipLine, mt5CoverageRange, mergeEconByDay, type StoredEconEvent } from "../lib/econEvents";
import { stT } from "../i18n";
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
  const [tab, setTab] = useState<"overview" | "notes" | "trades">("trades");
  const day = days.find((d) => d.day === sel)?.day ?? days[0]?.day ?? null; // falls back to the newest day when the filter hides the selection
  const rows = useMemo(() => (day ? dayTrades(trades, day) : []), [trades, day]);
  const st = useMemo(() => dayStats(rows), [rows]);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [day]);

  const L = stT(lang);
  const [econRaw, setEconRaw] = useState<StoredEconEvent[]>([]);
  const [econMt5Raw, setEconMt5Raw] = useState<StoredEconEvent[]>([]);
  const [econMt5Times, setEconMt5Times] = useState<{ time: string }[]>([]);
  const oldestDay = days.length ? days[days.length - 1].day : null, newestDay = days.length ? days[0].day : null;

  useEffect(() => {
    if (!oldestDay || !newestDay) { setEconRaw([]); setEconMt5Raw([]); setEconMt5Times([]); return; }
    const rangeStart = `${oldestDay}T00:00:00.000Z`, rangeEnd = `${newestDay}T23:59:59.999Z`;
    const impacts = settings.econImpacts, currencies = settings.econCurrencies;
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

    if (!impacts.length || !currencies.length) {
      setEconRaw([]); setEconMt5Raw([]);
    } else {
      // Filtered server-side by impact + currency: ForexFactory rows are shared/global, pure win.
      pageAll<StoredEconEvent>((from, to) => supabase.from("econ_events").select("id,time,currency,title,impact")
        .gte("time", rangeStart).lte("time", rangeEnd).in("impact", impacts).in("currency", currencies).range(from, to))
        .then((rows) => { if (!cancelled) setEconRaw(rows); });
      pageAll<StoredEconEvent>((from, to) => supabase.from("econ_events_mt5").select("id,time,currency,title,impact")
        .gte("time", rangeStart).lte("time", rangeEnd).in("impact", impacts).in("currency", currencies).range(from, to))
        .then((rows) => { if (!cancelled) setEconMt5Raw(rows); });
    }
    // NOT filtered by impact/currency, and only the "time" column: mt5CoverageRange needs every
    // row this user has in range to tell "MT5 has no data for this day" apart from "MT5 has data
    // but it's filtered out" -- the latter must still suppress the ForexFactory fallback.
    pageAll<{ time: string }>((from, to) => supabase.from("econ_events_mt5").select("time")
      .gte("time", rangeStart).lte("time", rangeEnd).range(from, to))
      .then((rows) => { if (!cancelled) setEconMt5Times(rows); });

    return () => { cancelled = true; };
  }, [oldestDay, newestDay, settings.econImpacts, settings.econCurrencies]);

  const econFiltered = econRaw; // already filtered server-side
  const econMt5Filtered = econMt5Raw; // already filtered server-side
  const econMt5Range = useMemo(() => mt5CoverageRange(econMt5Times), [econMt5Times]);
  const econByDay = useMemo(
    () => mergeEconByDay(econEventsByDay(econMt5Filtered), econEventsByDay(econFiltered), econMt5Range),
    [econMt5Filtered, econFiltered, econMt5Range],
  );

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
