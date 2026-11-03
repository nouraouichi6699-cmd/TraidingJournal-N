import { useRef, type CSSProperties, forwardRef } from "react";
import Private from "./Private";
import { RED, GREEN } from "./dashWidgets";
import type { Lang } from "../types";

interface DayData {
  day: string; // YYYY-MM-DD format
  net: number | null;
  wins?: number;
  losses?: number;
  be?: number;
}

export interface CalendarDayCellProps {
  dayData: DayData;
  isSelected?: boolean;
  onSelect?: () => void;
  lang?: Lang;
  hideValues?: boolean;
  variant?: "full" | "compact"; // "full" for DayByDayTab, "compact" for dashboard
  monthMax?: number; // Max absolute net for the month (for opacity scaling in "full" variant)
}

export const CalendarDayCell = forwardRef<HTMLButtonElement, CalendarDayCellProps>(
  ({
    dayData,
    isSelected = false,
    onSelect,
    lang = "en",
    hideValues = false,
    variant = "full",
    monthMax = 0,
  }, ref) => {
    const dayNum = Number(dayData.day.slice(8));

  const absNet = Math.abs(dayData.net ?? 0);
  const net = dayData.net ?? 0;
  const netColor = hideValues || net === 0 ? "var(--muted)" : net > 0 ? "var(--primary)" : RED;
  const tintColor = hideValues || net === 0 ? "var(--muted)" : net > 0 ? "var(--profit)" : "var(--loss)";

  // Calculate opacity for full variant based on monthMax
  const opacity = monthMax > 0 ? Math.min(0.25, 0.08 + (absNet / monthMax) * 0.17) : 0.08;

  if (variant === "compact") {
    // Dashboard calendar cell
    const title = dayData.wins != null || dayData.losses != null || dayData.be != null
      ? `${dayData.day} · ${dayData.wins ?? 0}/${dayData.losses ?? 0}/${dayData.be ?? 0}`
      : dayData.day;
    return (
      <div
        title={title}
        className="flex min-h-0 flex-col justify-between overflow-hidden rounded-md p-1 transition hover:ring-1 hover:ring-primary"
        style={{
          background: net !== 0 ? `color-mix(in srgb, ${net >= 0 ? GREEN : RED} ${Math.min(0.28 + (absNet * 0.5), 0.78) * 100}%, transparent)` : "transparent",
        }}
      >
        <span className="text-[9px] leading-none text-muted">{dayNum}</span>
        {net !== 0 && (
          <span className="tnum truncate text-center text-[10px] font-semibold leading-none" style={{ color: netColor }}>
            {hideValues ? "•••" : (net > 0 ? "+" : "")}{hideValues ? "" : Math.round(net)}
          </span>
        )}
      </div>
    );
  }

    // Full variant (DayByDayTab)
    return (
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={`${dayData.day} · $${hideValues ? "•••" : Math.round(net)}`}
        className="relative shrink-0 rounded-xl border transition hover:border-[var(--primary)] flex flex-col items-start justify-between w-14 h-16 sm:w-16 sm:h-16 md:w-20 md:h-16 p-1 sm:p-1 md:p-1.5"
        style={{
          background: `color-mix(in srgb, ${tintColor} ${opacity * 100}%, var(--surface))`,
          borderColor: isSelected ? "var(--primary)" : "var(--border)",
          borderWidth: "1px",
        }}
      >
        {/* Agenda paper day number */}
        <div className="flex flex-col items-center" style={{ width: "14px", height: "18px", gap: "2px" }}>
          <div
            className="w-full rounded-sm shadow-sm"
            style={{
              height: "3px",
              background: "var(--primary)",
            }}
          />
          <div
            className="w-full rounded-sm flex flex-col items-center justify-center flex-1 text-[5.5px] sm:text-[6px] md:text-[7px] font-bold"
            style={{
              background: "#f6f1e6",
              color: "#0a1a3f",
            }}
          >
            {dayNum}
            {/* Binding rings */}
            <div className="flex gap-0.5 mt-0.5">
              <div className="w-0.5 h-0.5 rounded-full border border-gray-400" />
              <div className="w-0.5 h-0.5 rounded-full border border-gray-400" />
            </div>
          </div>
        </div>
        {/* P&L amount */}
        {net !== 0 && (
          <div
            className="flex items-baseline justify-end gap-0.5 leading-none text-right w-full"
            style={{ fontWeight: "bold", color: netColor, fontSize: "clamp(10px, 2.5vw, 16px)" }}
          >
            <Private hint={`${dayData.day} P&L`}>
              <span dir="ltr" className="tnum">
                {hideValues ? "•••" : (net > 0 ? "+" : "")}
                {hideValues ? "" : Math.round(net)}
              </span>
            </Private>
            <span style={{ fontSize: "0.65em", fontWeight: "500" }}>$</span>
          </div>
        )}
      </button>
    );
  }
);
CalendarDayCell.displayName = "CalendarDayCell";
