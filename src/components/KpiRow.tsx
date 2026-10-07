import {
  DollarSign,
  Target,
  Scale,
  Activity,
  TrendingDown,
  Receipt,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { kpiData } from "../data";

interface KpiCardProps {
  icon: typeof DollarSign;
  label: string;
  value: number;
  sub: string;
  isProfit?: boolean;
  isLoss?: boolean;
  suffix?: string;
  prefix?: string;
}

function KpiCard({ icon: Icon, label, value, sub, isProfit, isLoss, suffix, prefix }: KpiCardProps) {
  const colorClass = isProfit
    ? "text-profit"
    : isLoss
    ? "text-loss"
    : "text-text";

  return (
    <div
      className="animate-fade-up rounded-card border border-border bg-surface p-5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-small text-muted" style={{ fontSize: "13px" }}>
            {label}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            {isProfit && <ArrowUp size={18} className="text-profit directional-icon shrink-0" />}
            {isLoss && <ArrowDown size={18} className="text-loss directional-icon shrink-0" />}
            <span
              className={`tnum font-heading font-bold ${colorClass}`}
              style={{ fontSize: "30px", lineHeight: "1.2" }}
            >
              {prefix}
              {value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              {suffix}
            </span>
          </div>
          <p className="mt-1.5 text-small text-muted" style={{ fontSize: "12px" }}>
            {sub}
          </p>
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--primary-tint)" }}
        >
          <Icon size={22} className="text-primary" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

export default function KpiRow() {
  return (
    <section aria-label="المؤشرات الرئيسية">
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}
      >
        <KpiCard
          icon={DollarSign}
          label="صافي الربح"
          value={kpiData.netProfit.value}
          sub={kpiData.netProfit.sub}
          isProfit
          prefix="$"
        />
        <KpiCard
          icon={Target}
          label="نسبة الفوز"
          value={kpiData.winRate.value}
          sub={kpiData.winRate.sub}
          suffix="%"
        />
        <KpiCard
          icon={Scale}
          label="معامل الربحية"
          value={kpiData.profitFactor.value}
          sub={kpiData.profitFactor.sub}
        />
        <KpiCard
          icon={Activity}
          label="متوسط R"
          value={kpiData.avgR.value}
          sub={kpiData.avgR.sub}
          prefix="R"
        />
        <KpiCard
          icon={TrendingDown}
          label="أقصى تراجع"
          value={kpiData.maxDrawdown.value}
          sub={kpiData.maxDrawdown.sub}
          isLoss
          suffix="%"
        />
        <KpiCard
          icon={Receipt}
          label="إجمالي الصفقات"
          value={kpiData.totalTrades.value}
          sub={kpiData.totalTrades.sub}
        />
      </div>
    </section>
  );
}
