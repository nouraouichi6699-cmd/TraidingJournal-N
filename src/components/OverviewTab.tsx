import { useState } from "react";
import { AlertTriangle, BarChart3, Info, LayoutGrid, List, ShieldAlert, Target, TrendingUp, Wallet } from "lucide-react";
import { ovT } from "../i18n";
import { fmt, fmtHold } from "../lib/stats";
import type { Overview } from "../lib/stats";
import { usePrivacy } from "../usePrivacy";
import { Donut, GREEN, HalfGauge, RED } from "./dashWidgets";
import type { Lang } from "../types";

type M = { id: string; v: number | null; kind: "money" | "pct" | "num" | "int" | "time" | "days" | "lots"; sign?: boolean; bar?: number; hide?: boolean; tone?: boolean };

const WHY: Record<string, string> = { equity: "wEquity", cashflow: "wCashflow", days: "wDays", start: "wStart", balance: "wBalance", stored: "wStored" };

export default function OverviewTab({ lang, o }: { lang: Lang; o: Overview }) {
  const T = ovT(lang);
  const { hidden } = usePrivacy();
  const [view, setView] = useState<"grid" | "list">("grid");
  const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

  const show = (m: M) => {
    if (!ok(m.v)) return "-";
    if (m.hide && hidden) return "••••";
    switch (m.kind) {
      case "money": return `${m.sign && m.v > 0 ? "+" : ""}${fmt(m.v)}`;
      case "pct": return `${m.sign && m.v > 0 ? "+" : ""}${fmt(m.v)}%`;
      case "int": return String(Math.round(m.v));
      case "lots": return `${fmt(m.v)} ${T("lots")}`;
      case "days": return `${Math.round(m.v)}${T("d")}`;
      case "time": return fmtHold(m.v);
      default: return fmt(m.v);
    }
  };
  const colour = (m: M) => (m.tone && ok(m.v) && m.v !== 0 && !(m.hide && hidden) ? (m.v > 0 ? GREEN : RED) : undefined);

  const SECTIONS: { id: string; icon: React.ReactNode; items: M[] }[] = [
    { id: "s1", icon: <Wallet size={18} />, items: [
      { id: "net", v: o.net, kind: "money", sign: true, hide: true, tone: true },
      { id: "totalReturn", v: o.totalReturn, kind: "pct", sign: true, tone: true },
      { id: "twr", v: null, kind: "pct" },
      { id: "avgDaily", v: o.avgDaily, kind: "money", sign: true, hide: true, tone: true },
      { id: "avgTrade", v: o.avgTrade, kind: "money", sign: true, hide: true, tone: true },
      { id: "best", v: o.best, kind: "money", sign: true, hide: true, tone: true },
      { id: "worst", v: o.worst, kind: "money", sign: true, hide: true, tone: true },
      { id: "costDrag", v: o.costDrag, kind: "pct" } ] },
    { id: "s2", icon: <Target size={18} />, items: [
      { id: "trades", v: o.n, kind: "int" },
      { id: "winRate", v: o.winRate, kind: "pct", bar: o.winRate ?? 0 },
      { id: "beRate", v: o.beRate, kind: "pct", bar: o.beRate ?? 0 },
      { id: "pf", v: o.pf, kind: "num" },
      { id: "expectancy", v: o.avgTrade, kind: "money", sign: true, hide: true, tone: true },
      { id: "payoff", v: o.payoff, kind: "num" },
      { id: "avgWin", v: o.avgWin, kind: "money", sign: true, hide: true, tone: true },
      { id: "avgLoss", v: o.avgLoss, kind: "money", sign: true, hide: true, tone: true } ] },
    { id: "s3", icon: <ShieldAlert size={18} />, items: [
      { id: "maxBalDD", v: o.maxBalDD, kind: "pct", bar: o.maxBalDD ?? 0 },
      { id: "maxEqDD", v: null, kind: "pct" },
      { id: "curEqDD", v: null, kind: "pct" },
      { id: "underwater", v: o.underwaterDays, kind: "days" },
      { id: "sharpe", v: o.sharpe, kind: "num", tone: true },
      { id: "sortino", v: o.sortino, kind: "num", tone: true },
      { id: "calmar", v: o.calmar, kind: "num", tone: true },
      { id: "recovery", v: o.recovery, kind: "num", tone: true } ] },
    { id: "s4", icon: <BarChart3 size={18} />, items: [
      { id: "days", v: o.tradingDays, kind: "int" },
      { id: "activeFreq", v: o.activeFreq, kind: "pct", bar: o.activeFreq ?? 0 },
      { id: "perDay", v: o.perDay, kind: "num" },
      { id: "hold", v: o.holdMin, kind: "time" },
      { id: "volume", v: o.volume, kind: "lots" },
      { id: "commissions", v: -Math.abs(o.commissions), kind: "money", hide: true, tone: true },
      { id: "fees", v: null, kind: "money" },
      { id: "swaps", v: null, kind: "money" } ] },
  ];

  const Tip = ({ m }: { m: M }) => {
    const reason = !ok(m.v) && o.why[m.id] ? T(WHY[o.why[m.id] as string]) : "";
    const id = `tip-${m.id}`;
    return (
      <span className="group relative inline-flex rounded outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]" tabIndex={0} role="note" aria-label={`${T(m.id)}: ${T(m.id + "T")}${reason ? " " + reason : ""}`}>
        <button type="button" aria-label={T(m.id)} aria-describedby={id} className="inline-flex rounded outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]">
          {reason ? <AlertTriangle size={12} className="text-primary" /> : <Info size={12} className="text-muted" />}
        </button>
        <span id={id} role="tooltip" className="pointer-events-none absolute start-0 top-full z-20 mt-1 hidden w-56 rounded-lg border border-border bg-surface p-2 text-[11px] font-normal leading-snug text-text shadow-xl group-focus-within:block group-hover:block">
          {T(m.id + "T")}{reason && <span className="mt-1 block text-primary">{reason}</span>}
        </span>
      </span>
    );
  };

  const hero = (v: number | null, kind: M["kind"], sign = false) => show({ id: "", v, kind, sign, hide: true });
  const heroCard = "flex min-h-[8.5rem] items-center justify-between gap-3 rounded-2xl border border-border p-5 transition hover:-translate-y-0.5";
  const bg = { background: "var(--gauge-bg)" };
  const wr = o.winRate ?? 0, pf = o.pf;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold text-primary">{T("title")}</h2>
          <p className="text-sm text-muted">{T("sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-primary-tint px-3 py-1 text-xs font-semibold text-primary">{T("metrics")}</span>
          <div className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1">
            {([["grid", <LayoutGrid size={15} key="g" />], ["list", <List size={15} key="l" />]] as const).map(([k, ic]) => (
              <button key={k} title={T(k)} aria-label={T(k)} onClick={() => setView(k)} className={`rounded-lg p-1.5 transition ${view === k ? "bg-primary text-on-primary" : "text-muted hover:text-text"}`}>{ic}</button>
            ))}
          </div>
        </div>
      </div>

      {o.n === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-muted">{T("empty")}</div>
      ) : (<>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={heroCard} style={bg}>
            <div><div className="text-xs font-semibold text-primary">{T("net")}</div>
              <div className="tnum mt-2 text-3xl font-bold" style={{ color: !hidden && o.net !== 0 ? (o.net > 0 ? GREEN : RED) : undefined }}><span dir="ltr">{hero(o.net, "money", true)}</span></div></div>
            <TrendingUp size={34} className="text-primary opacity-70" />
          </div>
          <div className={heroCard} style={bg}>
            <div><div className="text-xs font-semibold text-primary">{T("winRate")}</div>
              <div className="tnum mt-2 text-3xl font-bold">{ok(o.winRate) ? `${fmt(wr, 1)}%` : "-"}</div></div>
            <div className="h-24 w-24 shrink-0"><Donut pct={wr} label="" /></div>
          </div>
          <div className={heroCard} style={bg}>
            <div><div className="text-xs font-semibold text-primary">{T("pf")}</div>
              <div className="tnum mt-2 text-3xl font-bold">{ok(pf) ? fmt(pf) : "-"}</div></div>
            <div className="h-20 w-28 shrink-0"><HalfGauge v={ok(pf) ? pf : 0} max={3} /></div>
          </div>
          <div className={heroCard} style={bg}>
            <div><div className="text-xs font-semibold text-primary">{T("expectancy")}</div>
              <div className="tnum mt-2 text-3xl font-bold" style={{ color: !hidden && ok(o.avgTrade) && o.avgTrade !== 0 ? (o.avgTrade > 0 ? GREEN : RED) : undefined }}><span dir="ltr">{hero(o.avgTrade, "money", true)}</span></div></div>
            <Target size={34} className="text-primary opacity-70" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {SECTIONS.map((s) => (
            <section key={s.id} className="rounded-2xl border border-border p-5" style={bg}>
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-tint text-primary">{s.icon}</span>
                <div><div className="font-heading text-sm font-semibold text-primary">{T(s.id)}</div><div className="text-xs text-muted">{T(s.id + "d")}</div></div>
              </div>
              {view === "grid" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {s.items.map((m) => (
                    <div key={m.id} className="rounded-xl border border-border p-3 transition hover:-translate-y-0.5 hover:border-[var(--primary)]" style={{ background: "color-mix(in srgb, var(--text) 4%, transparent)" }}>
                      <div className="flex items-center gap-1.5 text-xs text-muted"><span className="truncate">{T(m.id)}</span><Tip m={m} /></div>
                      <div className="tnum mt-1.5 text-xl font-bold" style={{ color: colour(m) }}><span dir="ltr">{show(m)}</span></div>
                      {m.bar != null && ok(m.v) && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--gauge-track)" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, m.bar))}%`, background: "var(--gauge-arc)" }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {s.items.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="flex items-center gap-1.5 text-muted">{T(m.id)}<Tip m={m} /></span>
                      <span dir="ltr" className="tnum font-semibold" style={{ color: colour(m) }}>{show(m)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </>)}
    </div>
  );
}
