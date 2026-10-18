import { useMemo, useState } from "react";
import { BarChart3, Flame, Layers, Target } from "lucide-react";
import { toT } from "../i18n";
import { fmt } from "../lib/stats";
import { GROUPS, type OutcomeKey, type RecentTrade, type TradeOutcomes } from "../lib/tradeOutcomes";
import { usePrivacy } from "../usePrivacy";
import { GREEN, RED } from "./dashWidgets";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import type { Lang } from "../types";

type Kind = "int" | "money" | "pct" | "ratio" | "z" | "pts";
const kindOf = (k: OutcomeKey): Kind => {
  if (["tradeExpectancy", "averageTradePnl", "medianTradePnl", "averageWinningTrade", "medianWinningTrade", "averageLosingTrade", "medianLosingTrade", "largestWinningTrade", "largestLosingTrade", "avgPnlAfterWin", "avgPnlAfterLoss", "maxConsecutiveProfit", "maxConsecutiveLoss"].includes(k)) return "money";
  if (["winRate", "lossRate", "breakevenRate", "dailyWinRate", "expectancyPct", "breakevenWinRate", "winRateAfterWin", "winRateAfterLoss", "alternationRate", "topTradeProfitConc", "topFiveProfitConc", "worstTradeLossConc", "worstFiveLossConc"].includes(k)) return "pct";
  if (["profitFactor", "payoffRatio", "avgWinStreak", "avgLossStreak"].includes(k)) return "ratio";
  if (k === "runsZScore") return "z";
  if (k === "winRateEdge") return "pts";
  return "int";
};
const BAR = new Set<OutcomeKey>(["winRate", "lossRate", "breakevenRate", "dailyWinRate", "breakevenWinRate", "winRateAfterWin", "winRateAfterLoss", "alternationRate", "topTradeProfitConc", "topFiveProfitConc", "worstTradeLossConc", "worstFiveLossConc"]);
const REASON: Partial<Record<OutcomeKey, string>> = {
  profitFactor: "rNoLosses", payoffRatio: "rBoth", breakevenWinRate: "rBoth", winRateEdge: "rBoth", expectancyPct: "rStart", dailyWinRate: "rDays",
  winRate: "rNoTrades", lossRate: "rNoTrades", breakevenRate: "rNoTrades", tradeExpectancy: "rNoTrades", averageTradePnl: "rNoTrades", medianTradePnl: "rNoTrades",
  averageWinningTrade: "rNoWins", medianWinningTrade: "rNoWins", largestWinningTrade: "rNoWins", topTradeProfitConc: "rNoWins", topFiveProfitConc: "rNoWins", maxConsecutiveProfit: "rNoWins", avgWinStreak: "rNoWins",
  averageLosingTrade: "rNoLosses", medianLosingTrade: "rNoLosses", largestLosingTrade: "rNoLosses", worstTradeLossConc: "rNoLosses", worstFiveLossConc: "rNoLosses", maxConsecutiveLoss: "rNoLosses", avgLossStreak: "rNoLosses",
  winRateAfterWin: "rAfterWin", avgPnlAfterWin: "rAfterWin", winRateAfterLoss: "rAfterLoss", avgPnlAfterLoss: "rAfterLoss", alternationRate: "rOutcomes", runsZScore: "rZ",
};
const SECTION_META: { g: keyof typeof GROUPS; id: string; icon: JSX.Element }[] = [
  { g: "tradeResults", id: "s1", icon: <Target size={18} /> }, { g: "edge", id: "s2", icon: <BarChart3 size={18} /> },
  { g: "dependence", id: "s3", icon: <Layers size={18} /> }, { g: "streaks", id: "s4", icon: <Flame size={18} /> },
];

export default function TradeOutcomesTab({ lang, o, recent, onImport }: { lang: Lang; o: TradeOutcomes; recent: RecentTrade[]; onImport?: () => void }) {
  const T = toT(lang);
  const { hidden } = usePrivacy();
  const [view, setView] = useState<View>("grid");
  const [active, setActive] = useState<number | null>(null);

  const items = useMemo(() => {
    const money = (v: number) => (hidden ? "••••" : `${v > 0 ? "+" : ""}${fmt(v)}`);
    const one = (k: OutcomeKey): Item => {
      const v = o[k], kind = kindOf(k);
      let value = "-", color: string | undefined, bar: number | null = null;
      if (v != null) {
        switch (kind) {
          case "money": value = money(v); color = !hidden && v !== 0 ? (v > 0 ? GREEN : RED) : undefined; break;
          case "pct": value = `${fmt(v)}%`; if (BAR.has(k)) bar = v; break;
          case "ratio": value = fmt(v); break;
          case "z": value = `${v > 0 ? "+" : ""}${fmt(v)}`; break;
          case "pts": value = `${v > 0 ? "+" : ""}${fmt(v)} ${T("pts")}`; break;
          default: value = String(Math.round(v));
        }
      }
      return { id: k, label: T(k), tip: T(k + "T"), value, color, bar, reason: v == null && REASON[k] ? T(REASON[k] as string) : undefined };
    };
    return Object.fromEntries(SECTION_META.map((s) => [s.g, GROUPS[s.g].map(one)])) as Record<keyof typeof GROUPS, Item[]>;
  }, [o, hidden, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = <ViewHeader title={T("title")} sub={T("sub")} badge={T("metrics")} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />;
  if (!o.totalTrades) return (
    <div className="space-y-5">{header}
      <div className="rounded-2xl border border-border bg-surface p-10 text-center text-muted">
        <div>{T("empty")}</div>
        {onImport && <button type="button" onClick={onImport} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">{T("import")}</button>}
      </div>
    </div>
  );

  // Wins / losses / breakevens proportion bar
  const total = o.totalTrades as number, seg = [["wins", o.winningTrades, GREEN], ["losses", o.losingTrades, RED], ["be", o.breakevenTrades, "var(--muted)"]] as const;
  const proportion = (
    <div>
      <div dir="ltr" className="flex h-3 overflow-hidden rounded-full" style={{ background: "var(--gauge-track)" }} role="img" aria-label={seg.map(([k, n]) => `${T(k)} ${n}`).join(", ")}>
        {seg.map(([k, n, c]) => (n ?? 0) > 0 && <div key={k} title={`${T(k)}: ${n}`} style={{ width: `${((n as number) / total) * 100}%`, background: c }} />)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {seg.map(([k, n, c]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{T(k)} <b className="tnum text-text">{n}</b> <span className="tnum">({fmt(((n as number) / total) * 100, 1)}%)</span></span>)}
      </div>
    </div>
  );

  // Last-60 strip with arrow-key navigation
  const cur = active != null ? recent[active] : null;
  const dotColor = (k: RecentTrade["kind"]) => (k === "win" ? GREEN : k === "loss" ? RED : "var(--muted)");
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    setActive((a) => e.key === "Home" ? 0 : e.key === "End" ? recent.length - 1 : Math.max(0, Math.min(recent.length - 1, (a ?? recent.length) + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const strip = (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold text-muted">{T("strip")}</div>
      <div dir="ltr" role="group" tabIndex={0} aria-label={T("strip")} onKeyDown={onKey} onBlur={() => setActive(null)} className="flex flex-wrap gap-1 rounded-lg p-1 outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]">
        {recent.map((r, i) => (
          <span key={r.key + i} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} aria-hidden="true" title={`${r.date} · ${r.symbol} · ${hidden ? "••••" : fmt(r.pnl)}`}
            className="h-3 w-3 rounded-full transition" style={{ background: dotColor(r.kind), transform: active === i ? "scale(1.5)" : undefined, outline: active === i ? "2px solid var(--text)" : undefined }} />
        ))}
      </div>
      <div className="tnum mt-1 h-4 text-[11px] text-muted" aria-live="polite" dir="ltr">{cur ? `${cur.date} · ${cur.symbol} · ${hidden ? "••••" : `${cur.pnl > 0 ? "+" : ""}${fmt(cur.pnl)}`}` : ""}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {header}
      <div className="grid grid-cols-1 gap-4">
        {SECTION_META.map((s) => (
          <MetricSection key={s.id} icon={s.icon} title={T(s.id)} subtitle={T(s.id + "d")} view={view} items={items[s.g]} top={s.g === "tradeResults" ? proportion : s.g === "streaks" ? strip : undefined} />
        ))}
      </div>
    </div>
  );
}
