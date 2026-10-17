import { Fragment, useMemo, useState } from "react";
import { yearlyBreakdown, type Cell } from "../lib/dashAnalytics";
import { fmt } from "../lib/stats";
import { symL } from "../i18n";
import { GREEN, RED, type Ctx } from "./dashWidgets";

export default function YearlyWidget({ c }: { c: Ctx }) {
  const rows = useMemo(() => yearlyBreakdown(c.closed, c.start), [c.closed, c.start]);
  const [mode, setMode] = useState<"usd" | "pct">(() => { try { return localStorage.getItem("mizan-yearly-mode") === "pct" ? "pct" : "usd"; } catch { return "usd"; } });
  const pick = (m: "usd" | "pct") => { setMode(m); try { localStorage.setItem("mizan-yearly-mode", m); } catch {} };
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(c.lang, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, i, 1)))), [c.lang]);
  if (!rows.length) return <div className="grid h-full place-items-center text-center text-xs text-muted">{({ en: "No data yet", ar: "لا توجد بيانات بعد", fr: "Pas encore de données" })[c.lang]}</div>;
  const trades = ({ en: "trades", ar: "صفقة", fr: "trades" })[c.lang];
  const pct = mode === "pct";
  const num = (x: Cell) => pct ? (x.pct == null ? "-" : `${x.pct > 0 ? "+" : ""}${fmt(x.pct, 1)}%`) : c.hide ? "••••" : `${x.net > 0 ? "+" : ""}${fmt(x.net, 0)}`;

  const cell = (x: Cell | null, key: string) => {
    if (!x) return <div key={key} className="grid place-items-center rounded-lg border border-border/60 text-muted" style={{ minHeight: "2.6rem", background: "color-mix(in srgb, var(--surface) 60%, transparent)" }}>-</div>;
    const col = x.net > 0 ? GREEN : x.net < 0 ? RED : null;
    return (
      <div key={key} className="flex flex-col items-center justify-center rounded-lg border px-1 py-1 text-center transition hover:-translate-y-0.5" style={{ minHeight: "2.6rem", borderColor: col ? `color-mix(in srgb, ${col} 55%, transparent)` : "var(--border)", background: col ? `color-mix(in srgb, ${col} 12%, var(--surface))` : "var(--surface)" }}>
        <div className="tnum text-[13px] font-bold leading-tight" style={{ color: col ?? "var(--text)" }}>{num(x)}</div>
        <div className="tnum text-[10px] leading-tight text-muted">{x.n} {trades}</div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-auto">
      <div className="flex justify-end">
        <div role="group" title={symL("pctTip")[c.lang]} className="inline-flex gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-[11px] font-bold">
          {(["usd", "pct"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)} className={`tnum rounded-md px-2 py-0.5 transition ${mode === m ? "bg-primary text-on-primary" : "text-muted hover:text-text"}`}>{m === "usd" ? "$" : "%"}</button>)}
        </div>
      </div>
      <div className="grid min-h-0 min-w-[44rem] items-stretch gap-1.5" style={{ gridTemplateColumns: "2.8rem repeat(12, minmax(0,1fr)) minmax(0,1.1fr)" }}>
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
