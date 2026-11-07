import { forwardRef } from "react";
import Private from "./Private";
import type { Lang } from "../types";

/* ── Agenda-page icon literal map (mirrors src/index.css --calendar-* vars) ───
   dark  (Navy, Black): paper #f6f1e6  ring #5a4410
   light (Ivory):       paper #ffffff  ring #f2c14e
   ─────────────────────────────────────────────────────────────────────────── */

interface DayData {
  day: string; // YYYY-MM-DD
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
  monthMax?: number;
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
    const net = dayData.net ?? 0;
    const absNet = Math.abs(net);
    const netColor = hideValues || net === 0 ? "var(--muted)" : net > 0 ? "var(--profit)" : "var(--loss)";
    const tintVar = hideValues || net === 0 ? "var(--muted)" : net > 0 ? "var(--profit)" : "var(--loss)";
    const tintPct = monthMax > 0 ? Math.round(Math.min(25, 8 + (absNet / monthMax) * 17)) : 8;
    const borderPct = Math.round(40 + (tintPct - 8) / 17 * 20);

    // Agenda page icon — 18×20 narrow, 24×26 desktop; 6px strip; two 3×4 rings
    const AgendaIcon = (
      <div
        style={{
          width: "clamp(18px, calc(18px + 1.5vw), 24px)",
          height: "clamp(20px, calc(20px + 1.5vw), 26px)",
          borderRadius: "4px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          overflow: "hidden",
          flexShrink: 0,
          opacity: net === 0 ? 0.55 : 1,
        }}
      >
        {/* Top strip with binding rings */}
        <div style={{ height: "6px", background: "var(--primary)", position: "relative" }}>
          <div style={{
            position: "absolute", left: "6px", top: "2px",
            width: "3px", height: "4px", borderRadius: "2px",
            background: "var(--calendar-ring)",
          }} />
          <div style={{
            position: "absolute", right: "6px", top: "2px",
            width: "3px", height: "4px", borderRadius: "2px",
            background: "var(--calendar-ring)",
          }} />
        </div>
        {/* Paper body */}
        <div style={{
          height: "calc(100% - 6px)",
          background: "var(--calendar-paper)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "clamp(9px, 1.5vw, 13px)", fontWeight: 600, color: "#0a1a3f",
        }}>
          {dayNum}
        </div>
      </div>
    );

    if (variant === "compact") {
      const title = dayData.wins != null || dayData.losses != null || dayData.be != null
        ? `${dayData.day} · ${dayData.wins ?? 0}/${dayData.losses ?? 0}/${dayData.be ?? 0}`
        : dayData.day;
      return (
        <div
          title={title}
          className="flex min-h-0 flex-col justify-between overflow-hidden rounded-md p-1 transition hover:ring-1 hover:ring-primary"
          style={{
            background: `color-mix(in srgb, ${tintVar} ${tintPct}%, transparent)`,
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: net !== 0
              ? `color-mix(in srgb, ${tintVar} ${borderPct}%, transparent)`
              : "var(--border)",
          }}
        >
          {AgendaIcon}
          {net !== 0 && (
            <div
              className="flex items-baseline justify-end leading-none tnum"
              style={{ fontWeight: 600, color: netColor, fontSize: "clamp(10px, 2vw, 13px)" }}
            >
              {hideValues ? (
                <span>•••</span>
              ) : (
                <>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {net > 0 ? "+" : ""}{Math.round(net)}
                  </span>
                  <span style={{ fontSize: "0.75em", fontWeight: 500, flexShrink: 0 }}>$</span>
                </>
              )}
            </div>
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
          background: `color-mix(in srgb, ${tintVar} ${tintPct}%, transparent)`,
          borderColor: isSelected
            ? "var(--primary)"
            : `color-mix(in srgb, ${tintVar} ${borderPct}%, transparent)`,
          borderWidth: "1px",
        }}
      >
        {AgendaIcon}
        {/* P&L amount — bottom-right, ~20px desktop / ~13px narrow, currency after */}
        {net !== 0 && (
          <div
            className="flex items-baseline justify-end leading-none text-right w-full tnum"
            style={{ fontWeight: 600, color: netColor, fontSize: "clamp(13px, 3vw, 20px)" }}
          >
            <Private hint={`${dayData.day} P&L`}>
              {hideValues ? (
                <span>•••</span>
              ) : (
                <>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {net > 0 ? "+" : ""}{Math.round(net)}
                  </span>
                  <span style={{ fontSize: "0.75em", fontWeight: 500, flexShrink: 0 }}>$</span>
                </>
              )}
            </Private>
          </div>
        )}
      </button>
    );
  }
);
CalendarDayCell.displayName = "CalendarDayCell";
