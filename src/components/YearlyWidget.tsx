import { Fragment, useMemo } from "react";
import { yearlyBreakdown, type Cell } from "../lib/dashAnalytics";
import { fmt } from "../lib/stats";
import { symL } from "../i18n";
import { GREEN, RED, type Ctx } from "./dashWidgets";

export default function YearlyWidget({ c }: { c: Ctx }) {
  const rows = useMemo(() => yearlyBreakdown(c.closed), [c.closed]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(c.lang, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, i, 1)))), [c.lang]);
  if (!rows.length) return <div className="grid h-full place-items-center text-center text-xs text-muted">{({ en: "No data yet", ar: "لا توجد بيانات بعد", fr: "Pas encore de données" })[c.lang]}</div>;
  const trades = ({ en: "trades", ar: "صفقة", fr: "trades" })[c.lang];
  const num = (n: number) => (c.hide ? "••••" : `${n > 0 ? "+" : ""}${fmt(n, 0)}`);

  const cell = (x: Cell | null, key: string) => {
    if (!x) return <div key={key} className="grid place-items-center rounded-lg border border-border/60 text-muted" style={{ minHeight: "2.6rem", background: "color-mix(in srgb, var(--surface) 60%, transparent)" }}>-</div>;
    const col = x.net > 0 ? GREEN : x.net < 0 ? RED : null;
    return (
      <div key={key} className="flex flex-col items-center justify-center rounded-lg border px-1 py-1 text-center transition hover:-translate-y-0.5" style={{ minHeight: "2.6rem", borderColor: col ? `color-mix(in srgb, ${col} 55%, transparent)` : "var(--border)", background: col ? `color-mix(in srgb, ${col} 12%, var(--surface))` : "var(--surface)" }}>
        <div className="tnum text-[13px] font-bold leading-tight" style={{ color: col ?? "var(--text)" }}>{num(x.net)}</div>
        <div className="tnum text-[10px] leading-tight text-muted">{x.n} {trades}</div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid min-w-[44rem] items-stretch gap-1.5" style={{ gridTemplateColumns: "2.8rem repeat(12, minmax(0,1fr)) minmax(0,1.1fr)" }}>
        <div />
        {months.map((m) => <div key={m} className="pb-0.5 text-center text-[11px] font-semibold text-muted">{m}</div>)}
        <div className="pb-0.5 text-center text-[11px] font-semibold text-primary">{symL("ytd")[c.lang]}</div>
        {rows.map((r) => (<Fragment key={r.year}>
          <div className="tnum grid place-items-center text-xs font-bold text-muted">{r.year}</div>
          {r.months.map((x, i) => cell(x, `${r.year}-${i}`))}
          {cell(r.ytd, `${r.year}-ytd`)}
        </Fragment>))}
      </div>
    </div>
  );
}
