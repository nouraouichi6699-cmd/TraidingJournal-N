import { ArrowUp, ArrowDown } from "lucide-react";
import { trades, instruments } from "../data";
import type { Trade } from "../data";
import { useState, useMemo } from "react";

function PnLCell({ pnl }: { pnl: number }) {
  const isProfit = pnl >= 0;
  return (
    <span className={`tnum font-semibold inline-flex items-center gap-1 ${isProfit ? "text-profit" : "text-loss"}`}>
      {isProfit ? (
        <ArrowUp size={14} className="directional-icon" />
      ) : (
        <ArrowDown size={14} className="directional-icon" />
      )}
      {isProfit ? "+" : ""}
      ${Math.abs(pnl).toLocaleString("en-US")}
    </span>
  );
}

function formatR(r: number) {
  const sign = r >= 0 ? "+" : "";
  return `${sign}${r.toFixed(1)}R`;
}

function TradeCard({ trade }: { trade: Trade }) {
  const isProfit = trade.status === "win";
  return (
    <div className="rounded-xl border border-border bg-surface p-4" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-heading font-semibold" style={{ fontSize: "16px" }}>
            {trade.instrumentAr}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              trade.side === "buy"
                ? "bg-primary-tint text-primary"
                : "bg-loss/10 text-loss"
            }`}
          >
            {trade.sideAr}
          </span>
        </div>
        <span className="text-small text-muted" style={{ fontSize: "12px" }}>
          {trade.dateAr}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <p className="text-xs text-muted">دخول</p>
          <p className="tnum text-small font-medium">{trade.entry.toLocaleString("en-US")}</p>
        </div>
        <div>
          <p className="text-xs text-muted">خروج</p>
          <p className="tnum text-small font-medium">{trade.exit.toLocaleString("en-US")}</p>
        </div>
        <div>
          <p className="text-xs text-muted">R</p>
          <p className={`tnum text-small font-medium ${isProfit ? "text-profit" : "text-loss"}`}>
            {formatR(trade.rMultiple)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">الربح</p>
          <PnLCell pnl={trade.pnl} />
        </div>
      </div>
    </div>
  );
}

export default function TradesTable() {
  const [instrument, setInstrument] = useState("all");

  const filteredTrades = useMemo(
    () => (instrument === "all" ? trades : trades.filter((t) => t.instrument === instrument)),
    [instrument]
  );

  return (
    <div
      className="rounded-card border border-border bg-surface"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex flex-col gap-3 p-5 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-heading" style={{ fontSize: "19px", fontWeight: "600" }}>
            سجل الصفقات
          </h3>
          <p className="mt-1 text-small text-muted" style={{ fontSize: "13px" }}>
            {filteredTrades.length} صفقة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="instrument-filter" className="text-small text-muted whitespace-nowrap">
            الأداة:
          </label>
          <select
            id="instrument-filter"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            aria-label="تصفية حسب الأداة"
          >
            {instruments.map((inst) => (
              <option key={inst.value} value={inst.value}>
                {inst.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="desktop-only overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="sticky top-0 bg-surface">
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted" style={{ fontSize: "13px" }}>
                الأداة
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted" style={{ fontSize: "13px" }}>
                النوع
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted tnum" style={{ fontSize: "13px" }}>
                دخول
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted tnum" style={{ fontSize: "13px" }}>
                خروج
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted tnum" style={{ fontSize: "13px" }}>
                R
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted" style={{ fontSize: "13px" }}>
                التاريخ
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted tnum" style={{ fontSize: "13px" }}>
                الربح/الخسارة
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredTrades.map((trade, i) => (
              <tr
                key={trade.id}
                className="transition-colors hover:bg-bg"
                style={{
                  backgroundColor: i % 2 === 1 ? "var(--skeleton)" : "transparent",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <td className="px-5 py-3.5" style={{ fontSize: "15px" }}>
                  <span className="font-medium">{trade.instrumentAr}</span>
                  <span className="text-muted text-small mr-2" style={{ fontSize: "12px" }}>
                    {trade.instrument}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      trade.side === "buy"
                        ? "bg-primary-tint text-primary"
                        : "bg-loss/10 text-loss"
                    }`}
                  >
                    {trade.sideAr}
                  </span>
                </td>
                <td className="px-5 py-3.5 tnum" style={{ fontSize: "15px" }}>
                  {trade.entry.toLocaleString("en-US")}
                </td>
                <td className="px-5 py-3.5 tnum" style={{ fontSize: "15px" }}>
                  {trade.exit.toLocaleString("en-US")}
                </td>
                <td className={`px-5 py-3.5 tnum font-medium ${trade.status === "win" ? "text-profit" : "text-loss"}`} style={{ fontSize: "15px" }}>
                  {formatR(trade.rMultiple)}
                </td>
                <td className="px-5 py-3.5 text-muted" style={{ fontSize: "14px" }}>
                  {trade.dateAr}
                </td>
                <td className="px-5 py-3.5">
                  <PnLCell pnl={trade.pnl} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-only flex flex-col gap-3 p-4">
        {filteredTrades.map((trade) => (
          <TradeCard key={trade.id} trade={trade} />
        ))}
      </div>
    </div>
  );
}
