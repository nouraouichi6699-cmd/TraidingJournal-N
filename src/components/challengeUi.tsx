// Pieces shared by the challenge cards (prop firm, personal, own rules): the account's clock, labels, a progress bar and
// the balance chart.
import { useLayoutEffect, useRef, useState } from "react";
import type { Account, Lang } from "../types";
import { offsetMs, parseModel, type TimeModel } from "../lib/path";
import { readClock } from "../lib/pathData";

const GUESS: TimeModel = { base: 2, dst: "us" };
/** Now on the account's clock ("YYYY-MM-DDTHH:MM"): the broker's (Trade path's clock, else UTC+2/+3) for MT5, the device's for others. */
export function nowFor(a: Account | undefined, now = Date.now()) {
  if (a?.platform !== "mt5") return new Date(now - new Date(now).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  const c = readClock(), m = (c.override && parseModel(c.override)) || (c.auto[a.id] && parseModel(c.auto[a.id].m)) || GUESS;
  return new Date(now + offsetMs(m, now)).toISOString().slice(0, 16);
}
/** Today in the account's clock (YYYY-MM-DD). */
export const todayFor = (a: Account | undefined, now = Date.now()) => nowFor(a, now).slice(0, 10);
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
export const loc = (lang: Lang) => (lang === "ar" ? "ar-u-nu-latn" : lang === "en" ? "en-GB" : lang); // day before month in every language
export const dayLabel = (d: string, lang: Lang) => new Intl.DateTimeFormat(loc(lang), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
export const dangerColor = (u: number) => (u >= 0.8 ? "#f87171" : u >= 0.5 ? "#f59e0b" : "var(--icon)");

function useWidth() {
  const ref = useRef<HTMLDivElement>(null), [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-skeleton">
      <div className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}

export interface ChartRow { day: string; pnl: number; end: number; floor: number | null; bad: boolean }
/** The closing balance of each day from the size, with the target level and the loss floor (a red dot: a broken rule). */
export function BalanceChart({ size, goal, floor, start, rows, money, lang, label }: { size: number; goal: number | null; floor: number | null; start: string; rows: ChartRow[]; money: (v: number) => string; lang: Lang; label: string }) {
  const [ref, W] = useWidth();
  const H = 150, L = 8, R = 70, TOP = 10, B = 20;
  if (rows.length < 1) return null;
  const vals = [size, ...rows.map((r) => r.end), ...rows.flatMap((r) => (r.floor != null ? [r.floor] : [])), ...(goal != null ? [goal] : [])];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || size * 0.01) * 0.08; lo -= pad; hi += pad;
  const pw = Math.max(10, W - L - R), ph = H - TOP - B, n = rows.length;
  const x = (i: number) => L + ((i + 1) / n) * pw, y = (v: number) => TOP + ((hi - v) / (hi - lo)) * ph; // x(-1): the start
  const line = [`M${L},${y(size)}`, ...rows.map((r, i) => `L${x(i)},${y(r.end)}`)].join(" ");
  const floors = rows.map((r) => r.floor);
  const floorPath = floors.some((f) => f != null) ? [`M${L},${y(floors.find((f) => f != null) as number)}`, ...rows.map((r, i) => (r.floor == null ? "" : `L${x(i - 1) + (x(i) - x(i - 1)) / 2},${y(r.floor)} L${x(i)},${y(r.floor)}`))].join(" ") : null;
  const tag = (v: number, color: string, text: string) => (
    <g>
      <rect x={L + pw + 4} y={y(v) - 9} width={R - 6} height={18} rx={5} fill="var(--surface)" stroke={color} strokeWidth={1} />
      <text x={L + pw + 8} y={y(v) + 3.5} fontSize={9.5} fontWeight={700} fill={color}>{text}</text>
    </g>
  );
  return (
    <div ref={ref} dir="ltr" className="mt-4 w-full">
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label={label}>
          <line x1={L} x2={L + pw} y1={y(size)} y2={y(size)} stroke="var(--border)" strokeDasharray="2 3" />
          {goal != null && <line x1={L} x2={L + pw} y1={y(goal)} y2={y(goal)} stroke="var(--profit)" strokeDasharray="5 4" />}
          {floorPath && <path d={floorPath} fill="none" stroke="#f87171" strokeWidth={1.2} strokeDasharray="5 4" />}
          <path d={line} fill="none" stroke="var(--icon)" strokeWidth={2} strokeLinejoin="round" />
          {rows.map((r, i) => <circle key={r.day} cx={x(i)} cy={y(r.end)} r={r.bad ? 4.5 : 2.5} fill={r.bad ? "#f87171" : "var(--icon)"} stroke="var(--surface)" strokeWidth={r.bad ? 1.5 : 0}><title>{`${r.day} · ${money(r.pnl)}`}</title></circle>)}
          {goal != null && tag(goal, "var(--profit)", money(goal).replace(/^\+/, ""))}
          {floor != null && tag(floor, "#f87171", money(floor).replace(/^\+/, ""))}
          <circle cx={L} cy={y(size)} r={2.5} fill="var(--muted)" />
          <text x={L} y={H - 5} fontSize={10} fill="var(--muted)">{dayLabel(start, lang)}</text>
          {n > 1 && <text x={L + pw} y={H - 5} fontSize={10} fill="var(--muted)" textAnchor="end">{dayLabel(rows[n - 1].day, lang)}</text>}
        </svg>
      )}
    </div>
  );
}
