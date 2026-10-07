import { ArrowUp, ArrowDown } from "lucide-react";
import { trades, instruments } from "../data";
import type { Trade } from "../data";
import type { Lang } from "../types";
import { useState, useMemo } from "react";

interface Props {
  lang: Lang;
}

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

function TradeCard({ trade, lang }: { trade: Trade; lang: Lang }) {
  const isProfit = trade.status === "win";
  const instrLabel = lang === "ar" ? trade.instrumentAr : trade.instrument;
  const sideLabel = lang === "ar" ? trade.sideAr : trade.side === "buy" ? "Buy" : "Sell";
  const dateLabel = lang === "ar" ? trade.dateAr : trade.date;
  const entryLabel = lang === "ar" ? "دخول" : "Entry";
  const exitLabel = lang === "ar" ? "خروج" : "Exit";
  const pnlLabel = lang === "ar" ? "الربح" : "P&L";

  return (
    <div className="rounded-xl border border-border bg-surface p-4" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-heading font-semibold" style={{ fontSize: "16px" }}>
            {instrLabel}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              trade.side === "buy"
                ? "bg-primary-tint text-primary"
                : "bg-loss/10 text-loss"
            }`}
          >
            {sideLabel}
          </span>
        </div>
        <span className="text-small text-muted" style={{ fontSize: "12px" }}>
          {dateLabel}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <p className="text-xs text-muted">{entryLabel}</p>
          <p className="tnum text-small font-medium">{trade.entry.toLocaleString("en-US")}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{exitLabel}</p>
          <p className="tnum text-small font-medium">{trade.exit.toLocaleString("en-US")}</p>
        </div>
        <div>
          <p className="text-xs text-muted">R</p>
          <p className={`tnum text-small font-medium ${isProfit ? "text-profit" : "text-loss"}`}>
            {formatR(trade.rMultiple)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">{pnlLabel}</p>
          <PnLCell pnl={trade.pnl} />
        </div>
      </div>
    </div>
  );
}

export default function TradesTable({ lang }: Props) {
  const [instrument, setInstrument] = useState("all");

  const filteredTrades = useMemo(
    () => (instrument === "all" ? trades : trades.filter((t) => t.instrument === instrument)),
    [instrument]
  );

  const headerText = lang === "ar" ? "سجل الصفقات" : "Trade History";
  const countText = lang === "ar" ? "صفقة" : "trades";
  const filterLabel = lang === "ar" ? "الأداة:" : "Instrument:";
  const filterAria = lang === "ar" ? "تصفية حسب الأداة" : "Filter by instrument";
  const colInstrument = lang === "ar" ? "الأداة" : "Instrument";
  const colSide = lang === "ar" ? "النوع" : "Side";
  const colEntry = lang === "ar" ? "دخول" : "Entry";
  const colExit = lang === "ar" ? "خروج" : "Exit";
  const colDate = lang === "ar" ? "التاريخ" : "Date";
  const colPnl = lang === "ar" ? "الربح/الخسارة" : "P&L";

  return (
    <div
      className="rounded-card border border-border bg-surface"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex flex-col gap-3 p-5 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-heading" style={{ fontSize: "19px", fontWeight: "600" }}>
            {headerText}
          </h3>
          <p className="mt-1 text-small text-muted" style={{ fontSize: "13px" }}>
            {filteredTrades.length} {countText}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="instrument-filter" className="text-small text-muted whitespace-nowrap">
            {filterLabel}
          </label>
          <select
            id="instrument-filter"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            aria-label={filterAria}
          >
            {instruments.map((inst) => (
              <option key={inst.value} value={inst.value}>
                {lang === "ar" ? inst.labelAr : inst.label}
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
                {colInstrument}
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted" style={{ fontSize: "13px" }}>
                {colSide}
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted tnum" style={{ fontSize: "13px" }}>
                {colEntry}
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted tnum" style={{ fontSize: "13px" }}>
                {colExit}
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted tnum" style={{ fontSize: "13px" }}>
                R
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted" style={{ fontSize: "13px" }}>
                {colDate}
              </th>
              <th scope="col" className="px-5 py-3 text-start text-small font-semibold text-muted tnum" style={{ fontSize: "13px" }}>
                {colPnl}
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
                  <span className="font-medium">{lang === "ar" ? trade.instrumentAr : trade.instrument}</span>
                  {lang === "ar" && (
                    <span className="text-muted text-small mr-2" style={{ fontSize: "12px" }}>
                      {trade.instrument}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      trade.side === "buy"
                        ? "bg-primary-tint text-primary"
                        : "bg-loss/10 text-loss"
                    }`}
                  >
                    {lang === "ar" ? trade.sideAr : trade.side === "buy" ? "Buy" : "Sell"}
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
                  {lang === "ar" ? trade.dateAr : trade.date}
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
          <TradeCard key={trade.id} trade={trade} lang={lang} />
        ))}
      </div>
    </div>
  );
}
