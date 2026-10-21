import { useEffect, useMemo, useRef, useState } from "react";
import { dayList, dayStats, dayTrades, type DayStats } from "../lib/dayByDay";
import { fmt, fmtHold } from "../lib/stats";
import { fmtMoney } from "../lib/money";
import { usePrivacy } from "../usePrivacy";
import { GREEN, RED } from "./dashWidgets";
import { cardBg } from "./metricUi";
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
  const days = useMemo(() => dayList(trades), [trades]);
  const [sel, setSel] = useState<string | null>(focusDay ?? null);
  const [tab, setTab] = useState<"overview" | "notes" | "trades">("trades");
  const day = days.find((d) => d.day === sel)?.day ?? days[0]?.day ?? null; // falls back to the newest day when the filter hides the selection
  const rows = useMemo(() => (day ? dayTrades(trades, day) : []), [trades, day]);
  const st = useMemo(() => dayStats(rows), [rows]);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [day]);

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
        <nav aria-label={T(X.days)} className="flex shrink-0 gap-2 overflow-auto md:max-h-[560px] md:w-16 md:flex-col" dir="ltr">
          {days.map((d) => {
            const month = d.day.slice(0, 7), head = month !== lastMonth; lastMonth = month;
            const on = d.day === day;
            return (
              <div key={d.day} className="contents">
                {head && <div className="hidden px-1 pt-1 text-center text-[9px] font-semibold uppercase leading-tight text-muted md:block" title={monthFmt.format(new Date(d.day + "T00:00:00Z"))}>{new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" }).format(new Date(d.day + "T00:00:00Z"))}</div>}
                <button ref={on ? activeRef : undefined} type="button" onClick={() => setSel(d.day)} aria-pressed={on} aria-label={`${d.day} · ${money(d.net)}`}
                  className="relative grid h-11 min-w-11 shrink-0 place-items-center rounded-xl border text-xs font-bold transition hover:border-[var(--primary)]"
                  style={{ borderColor: on ? "var(--primary)" : "var(--border)", background: on ? "color-mix(in srgb, var(--primary) 14%, transparent)" : undefined, color: on ? "var(--primary)" : undefined }}>
                  {Number(d.day.slice(8))}
                  <span className="absolute bottom-1.5 h-0.5 w-3.5 rounded-full" style={{ background: hidden || d.net === 0 ? "var(--muted)" : d.net > 0 ? "var(--primary)" : RED }} />
                </button>
              </div>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1 space-y-4">
          <div role="tablist" className="inline-flex gap-1 rounded-xl border border-border p-1" style={cardBg}>
            {TABS.map(([id, l]) => (
              <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className="rounded-lg px-5 py-1.5 text-sm font-medium transition"
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
