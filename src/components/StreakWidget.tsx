import { useMemo } from "react";
import { Flame, TrendingDown } from "lucide-react";
import { streakBreakdown, type Streak } from "../lib/dashAnalytics";
import { symL } from "../i18n";
import { GREEN, RED, type Ctx } from "./dashWidgets";

export default function StreakWidget({ c }: { c: Ctx }) {
  const s = useMemo(() => streakBreakdown(c.closed), [c.closed]);
  const L = (k: string) => symL(k)[c.lang];
  if (!c.closed.length) return <div className="grid h-full place-items-center text-center text-xs text-muted">{({ en: "No data yet", ar: "لا توجد بيانات بعد", fr: "Pas encore de données" })[c.lang]}</div>;

  const pill = (label: string, n: number, col: string) => (
    <span className="tnum inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold" style={{ color: col, borderColor: `color-mix(in srgb, ${col} 45%, transparent)`, background: `color-mix(in srgb, ${col} 14%, transparent)` }}><span className="opacity-80">{label}</span>{n}</span>
  );
  const block = (title: string, x: Streak) => {
    const col = x.current.kind === "win" ? GREEN : x.current.kind === "loss" ? RED : "var(--muted)";
    const Icon = x.current.kind === "loss" ? TrendingDown : Flame;
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-2" style={{ color: col }}>
          <span className="tnum font-heading font-bold" style={{ fontSize: "clamp(1.6rem,min(26cqh,11cqw),3.2rem)", lineHeight: 1 }}>{x.current.n}</span>
          <Icon style={{ width: "clamp(1.1rem,min(14cqh,6cqw),2rem)", height: "clamp(1.1rem,min(14cqh,6cqw),2rem)" }} />
          <span className="text-xs font-semibold text-muted">{title}</span>
        </div>
        <div className="flex items-center justify-center gap-1">{pill(L("best"), x.bestWin, GREEN)}{pill(L("be"), x.bestBE, "var(--muted)")}{pill(L("worst"), x.worstLoss, RED)}</div>
      </div>
    );
  };
  return <div className="flex h-full items-center gap-3">{block(L("sDays"), s.days)}{block(L("sTrades"), s.trades)}</div>;
}
