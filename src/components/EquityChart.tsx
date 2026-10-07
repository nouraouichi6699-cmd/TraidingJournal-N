import { useId } from "react";
import { equityCurveData } from "../data";

export default function EquityChart() {
  const gradientId = useId();

  const data = equityCurveData;
  const width = 800;
  const height = 320;
  const padding = { top: 30, right: 30, bottom: 45, left: 65 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const yMin = minVal - range * 0.1;
  const yMax = maxVal + range * 0.1;
  const yRange = yMax - yMin;

  const xStep = chartW / (data.length - 1);

  const points = data.map((d, i) => ({
    x: padding.left + i * xStep,
    y: padding.top + chartH - ((d.value - yMin) / yRange) * chartH,
    value: d.value,
    label: d.label,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    `${linePath} ` +
    `L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} ` +
    `L ${points[0].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;

  const gridLines = 5;
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const ratio = i / gridLines;
    const val = yMax - ratio * yRange;
    const y = padding.top + ratio * chartH;
    return { y, val: Math.round(val) };
  });

  const lastPoint = points[points.length - 1];
  const firstValue = data[0].value;
  const lastValue = data[data.length - 1].value;
  const totalReturn = (((lastValue - firstValue) / firstValue) * 100).toFixed(1);

  return (
    <div
      className="rounded-card border border-border bg-surface p-5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-h3" style={{ fontSize: "19px" }}>
            منحنى رأس المال
          </h3>
          <p className="mt-1 text-small text-muted" style={{ fontSize: "13px" }}>
            تطور رصيد الحساب خلال الفترة المحددة
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-primary-tint px-3 py-1.5">
          <span className="text-profit text-small font-semibold tnum">
            +{totalReturn}%
          </span>
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height="auto"
          style={{ minHeight: "220px", display: "block" }}
          role="img"
          aria-label={`منحنى رأس المال من ${data[0].label} إلى ${data[data.length - 1].label}. بدأ الرصيد بـ $${firstValue.toLocaleString("en-US")} وانتهى عند $${lastValue.toLocaleString("en-US")}. العائد الإجمالي ${totalReturn}%.`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--primary-2)" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={width - padding.right}
                y2={tick.y}
                stroke="var(--chart-grid)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 12}
                y={tick.y + 4}
                textAnchor="end"
                fill="var(--muted)"
                fontSize="12"
                className="tnum"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                ${tick.val.toLocaleString("en-US")}
              </text>
            </g>
          ))}

          {/* Area fill */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke={`url(#${gradientId}-line)`}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="chart-line-anim"
          />

          {/* Last point marker */}
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r="5"
            fill="var(--primary)"
            stroke="var(--surface)"
            strokeWidth="2.5"
          />
          <circle cx={lastPoint.x} cy={lastPoint.y} r="10" fill="var(--primary)" opacity="0.15" />

          {/* X-axis labels */}
          {points.map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={height - 12}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize="11"
            >
              {p.label}
            </text>
          ))}

          {/* Y-axis line */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + chartH}
            stroke="var(--chart-axis)"
            strokeWidth="1"
          />
        </svg>
      </div>

      <p
        className="sr-only"
        aria-label="ملخص منحنى رأس المال"
      >
        منحنى رأس المال يوضح نمو الرصيد من {data[0].label} إلى {data[data.length - 1].label}.
        بدأ الرصيد بمبلغ {firstValue.toLocaleString("en-US")} دولار وانتهى عند {lastValue.toLocaleString("en-US")} دولار،
        بعائد إجمالي قدره {totalReturn} بالمائة.
      </p>
    </div>
  );
}
