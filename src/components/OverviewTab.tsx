import { useState } from "react";
import { BarChart3, ShieldAlert, Target, TrendingUp, Wallet } from "lucide-react";
import { MetricSection, ViewHeader, cardBg, type Item } from "./metricUi";
import { ovT } from "../i18n";
import { fmt, fmtHold } from "../lib/stats";
import { fmtMoney } from "../lib/money";
import type { Overview } from "../lib/stats";
import { usePrivacy } from "../usePrivacy";
import { Donut, GREEN, HalfGauge, RED } from "./dashWidgets";
import type { Lang } from "../types";

type M = { id: string; v: number | null; kind: "money" | "pct" | "num" | "int" | "time" | "days" | "lots"; sign?: boolean; bar?: number; hide?: boolean; tone?: boolean };

const WHY: Record<string, string> = { equity: "wEquity", cashflow: "wCashflow", days: "wDays", start: "wStart", balance: "wBalance", stored: "wStored" };

export default function OverviewTab({ lang, o, currency = null, twr = null }: { lang: Lang; o: Overview; currency?: string | null; twr?: number | null }) {
  const T = ovT(lang);
  const { hidden } = usePrivacy();
  const [view, setView] = useState<"grid" | "list">("grid");
  const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

  const show = (m: M) => {
    if (!ok(m.v)) return "-";
    if (m.hide && hidden) return "••••";
    switch (m.kind) {
      case "money": return fmtMoney(m.v, { sign: m.sign, currency }); // summary: whole units
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
      { id: "twr", v: twr, kind: "pct", sign: true }, // same engine as Returns & capital (needs a deposit/withdrawal ledger)
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

  const toItem = (m: M): Item => ({
    id: m.id, label: T(m.id), tip: T(m.id + "T"), value: show(m), color: colour(m),
    reason: !ok(m.v) && o.why[m.id] ? T(WHY[o.why[m.id] as string]) : undefined, bar: m.bar != null && ok(m.v) ? m.bar : null,
  });

  const hero = (v: number | null, kind: M["kind"], sign = false) => show({ id: "", v, kind, sign, hide: true });
  const heroCard = "flex min-h-[8.5rem] items-center justify-between gap-3 rounded-2xl border border-border p-5 transition hover:-translate-y-0.5";
  const bg = cardBg;
  const wr = o.winRate ?? 0, pf = o.pf;

  return (
    <div className="space-y-5">
      <ViewHeader title={T("title")} sub={T("sub")} badge={T("metrics")} view={view} onView={setView} gridLabel={T("grid")} listLabel={T("list")} />

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
          {SECTIONS.map((x) => <MetricSection key={x.id} icon={x.icon} title={T(x.id)} subtitle={T(x.id + "d")} view={view} items={x.items.map(toItem)} />)}
        </div>
      </>)}
    </div>
  );
}
