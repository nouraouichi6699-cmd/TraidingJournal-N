import { forwardRef, useId } from "react";
import { Flame } from "lucide-react";
import Private from "./Private";
import type { Lang } from "../types";
import type { EconImpact } from "../lib/econEvents";

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
  /** Pre-filtered, ordered impact dots (at most 3). Hidden on a day that shows the flame marker instead. */
  econDots?: { impact: EconImpact }[];
  /** Count of events beyond the first 3. */
  econExtra?: number;
  /** One line per event for the hover/focus tooltip (time currency title impact). */
  econTooltipLines?: string[];
  /** Small label at the end of the tooltip naming the day's event source ("MetaTrader 5" or "ForexFactory"). */
  econSourceLabel?: string;
  /** Short flame label for a day with a key event (NFP/CPI/PPI/FOMC) matching the currency filter -- e.g.
   *  "NFP", or "NFP +1" when the day has several. Replaces the news dots at the top-right when present. */
  flameLabel?: string | null;
  /** This day also has a trade inside that key event's window (any zone, including held-through): a hot
   *  glow and a filled flame, instead of the plain outline shown for a key-event day with no trade in it. */
  flameDanger?: boolean;
  /** Accessible description for the flame marker, e.g. "Traded during NFP: 2 trades" or "Key event: NFP". */
  flameAriaLabel?: string;
}

export const CalendarDayCell = forwardRef<HTMLButtonElement, CalendarDayCellProps>(
  ({
    dayData,
    isSelected = false,
    onSelect,
    hideValues = false,
    variant = "full",
    monthMax = 0,
    econDots,
    econExtra = 0,
    econTooltipLines,
    econSourceLabel,
    flameLabel = null,
    flameDanger = false,
    flameAriaLabel,
  }, ref) => {
    const baseId = useId();
    const tooltipId = `econ-tt-${baseId}`;
    const hasDots = econDots && econDots.length > 0 && !flameLabel;
    const hasTooltip = econTooltipLines && econTooltipLines.length > 0;
    const danger = !!flameLabel && flameDanger;
    const dayNum = Number(dayData.day.slice(8));
    const net = dayData.net ?? 0;
    const absNet = Math.abs(net);
    const isBreakeven = !hideValues && net !== 0 && Math.round(net) === 0;
    const netColor = hideValues ? "var(--muted)" : isBreakeven ? "var(--breakeven)" : net > 0 ? "var(--profit)" : net < 0 ? "var(--loss)" : "var(--muted)";
    const tintVar = hideValues ? "var(--muted)" : isBreakeven ? "var(--breakeven)" : net > 0 ? "var(--profit)" : net < 0 ? "var(--loss)" : "var(--muted)";
    const tintPct = monthMax > 0 ? Math.round(Math.min(25, 8 + (absNet / monthMax) * 17)) : 8;
    const borderPct = Math.round(40 + (tintPct - 8) / 17 * 20);
    const borderColor = danger
      ? "color-mix(in srgb, var(--impact-medium) 65%, transparent)"
      : net !== 0
        ? `color-mix(in srgb, ${tintVar} ${borderPct}%, transparent)`
        : "var(--border)";

    // Agenda page icon — 12×14 narrow, 15×17 desktop; 4px strip; two 2×2 rings. Given an explicit z-index
    // (and so does the amount below) so the danger-day glow -- a plain z-index:auto absolute div -- always
    // paints underneath both, never over the amount or the agenda page.
    const AgendaIcon = (
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "clamp(12px, 1.2vw, 15px)",
          height: "clamp(14px, 1.4vw, 17px)",
          borderRadius: "3px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          overflow: "hidden",
          flexShrink: 0,
          opacity: dayData.net === null ? 0.5 : 1,
        }}
      >
        {/* Top strip with binding rings */}
        <div style={{ height: "4px", background: tintVar, position: "relative" }}>
          <div style={{
            position: "absolute", left: "3px", top: "1px",
            width: "2px", height: "2px", borderRadius: "2px",
            background: "var(--calendar-ring)",
          }} />
          <div style={{
            position: "absolute", right: "3px", top: "1px",
            width: "2px", height: "2px", borderRadius: "2px",
            background: "var(--calendar-ring)",
          }} />
        </div>
        {/* Paper body */}
        <div style={{
          height: "calc(100% - 4px)",
          background: "var(--calendar-paper)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "9.5px", fontWeight: 600, color: "#0a1a3f",
        }}>
          {dayNum}
        </div>
      </div>
    );

    const Glow = danger ? (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: "inherit",
          background: "radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--impact-medium) 45%, transparent), transparent 65%)",
          boxShadow: "inset 0 0 10px color-mix(in srgb, var(--impact-medium) 35%, transparent)",
        }}
      />
    ) : null;

    if (variant === "compact") {
      const title = dayData.wins != null || dayData.losses != null || dayData.be != null
        ? `${dayData.day} · ${dayData.wins ?? 0}/${dayData.losses ?? 0}/${dayData.be ?? 0}`
        : dayData.day;
      return (
        <div
          title={title}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          aria-describedby={hasTooltip ? tooltipId : undefined}
          onClick={onSelect}
          onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } } : undefined}
          className={`group relative flex min-h-0 flex-col justify-between overflow-visible rounded-[8px] p-1 transition hover:ring-1 hover:ring-primary ${onSelect ? "cursor-pointer" : ""}`}
          style={{
            background: `color-mix(in srgb, ${tintVar} ${tintPct}%, transparent)`,
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor,
          }}
        >
          {Glow}
          {AgendaIcon}
          {net !== 0 && (
            <div
              className="relative flex items-baseline justify-end leading-none tnum"
              style={{ zIndex: 1, fontWeight: 600, color: netColor, fontSize: "clamp(13px, 2.5vw, 19px)", letterSpacing: "-0.02em" }}
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
          {hasTooltip && <EconTooltip id={tooltipId} lines={econTooltipLines!} sourceLabel={econSourceLabel} />}
          {flameLabel ? (
            <FlameMarker label={flameLabel} danger={danger} ariaLabel={flameAriaLabel ?? flameLabel} />
          ) : (
            hasDots && <EconDots dots={econDots!} extra={econExtra} />
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
        aria-describedby={hasTooltip ? tooltipId : undefined}
        className="group relative shrink-0 rounded-[8px] border transition hover:border-[var(--primary)] flex flex-col items-start justify-between w-14 h-16 sm:w-16 sm:h-16 md:w-20 md:h-16 p-1 sm:p-1 md:p-1.5 overflow-visible"
        style={{
          background: `color-mix(in srgb, ${tintVar} ${tintPct}%, transparent)`,
          borderColor: isSelected ? "var(--primary)" : borderColor,
          borderWidth: "1px",
        }}
      >
        {Glow}
        {AgendaIcon}
        {/* P&L amount — bottom-right, ~20px desktop / ~13px narrow, currency after */}
        {net !== 0 && (
          <div
            className="relative flex items-baseline justify-end leading-none text-right w-full tnum"
            style={{ zIndex: 1, fontWeight: 600, color: netColor, fontSize: "clamp(13px, 2.5vw, 19px)", letterSpacing: "-0.02em" }}
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
        {hasTooltip && <EconTooltip id={tooltipId} lines={econTooltipLines!} sourceLabel={econSourceLabel} />}
        {flameLabel ? (
          <FlameMarker label={flameLabel} danger={danger} ariaLabel={flameAriaLabel ?? flameLabel} />
        ) : (
          hasDots && <EconDots dots={econDots!} extra={econExtra} />
        )}
      </button>
    );
  }
);
CalendarDayCell.displayName = "CalendarDayCell";

function FlameMarker({ label, danger, ariaLabel }: { label: string; danger: boolean; ariaLabel: string }) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      title={ariaLabel}
      className="absolute end-0.5 top-0.5 flex items-center gap-0.5"
      style={{ zIndex: 2 }}
    >
      <Flame size={10} strokeWidth={2.25} color="var(--impact-medium)" fill={danger ? "var(--impact-medium)" : "none"} />
      <span style={{ fontSize: "7px", lineHeight: 1, fontWeight: 700, color: "var(--impact-medium)", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function EconDots({ dots, extra }: { dots: { impact: EconImpact }[]; extra: number }) {
  return (
    <div aria-hidden="true" className="absolute end-0.5 top-0.5 flex items-center gap-px" style={{ zIndex: 2 }}>
      {dots.map((d, i) => (
        <span key={i} className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: `var(--impact-${d.impact})`, flexShrink: 0 }} />
      ))}
      {extra > 0 && <span style={{ fontSize: "7px", lineHeight: 1, color: "var(--muted)", flexShrink: 0 }}>+{extra}</span>}
    </div>
  );
}

/** Appears on hover / focus-within, independent of whether the dots or the flame marker is shown. */
function EconTooltip({ id, lines, sourceLabel }: { id: string; lines: string[]; sourceLabel?: string }) {
  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none absolute bottom-full start-0 z-50 mb-1 w-max max-w-[200px] rounded-lg border border-border bg-surface p-2 leading-relaxed opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      style={{ fontSize: "10px" }}
    >
      {lines.map((line, i) => <div key={i}>{line}</div>)}
      {sourceLabel && <div className="mt-1 text-[9px] text-muted">{sourceLabel}</div>}
    </div>
  );
}
