import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Crosshair, Download, X, Wallet, CandlestickChart } from "lucide-react";
import Dropdown from "./Dropdown";
import SymbolIcon from "./SymbolIcon";
import { usePrivacy } from "../usePrivacy";
import { fmt, computeStats } from "../lib/stats";
import { commonCurrency, currencySuffix, fmtMoney } from "../lib/money";
import { balanceSeries } from "../lib/balance";
import type { CashFlow } from "../lib/cashflow";
import type { Key } from "../i18n";
import type { Account, BalancePoint, Lang, Trade } from "../types";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  accounts: Account[];
  trades: Trade[];
  balances: Record<string, BalancePoint[]>;
  flows?: CashFlow[];
}

const STORE = "mizan-charts";
const ALL = "__all";
const GREEN = "#22c55e";
const RED = "#f87171";
const PALETTE = ["#f5b83d", "#22c55e", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];
const RANGES = ["all", "1M", "3M", "6M", "YTD", "1Y"] as const;
type Range = (typeof RANGES)[number];
type Metric = "profit" | "balance" | "drawdown" | "periods";
type Mode = "symbol" | "account";
type Bucket = "day" | "week" | "month" | "session";
type Pt = { t: number; v: number };
type Bar = { key: string; label: string; v: number; n: number };
type Stats = { net: number; n: number; winRate: number | null; pf: number | null };
type Series = { id: string; name: string; color: string; pts: Pt[]; bars: Bar[]; stats: Stats; base: number };

interface Saved {
  metric: Metric; selected: string[]; selectedAcc: string[]; colors: Record<string, string>;
  range: Range; split: boolean; smooth: boolean; bucket: Bucket; unit: "money" | "pct"; v?: number;
}
const defaults: Saved = { metric: "profit", selected: [ALL], selectedAcc: [ALL], colors: {}, range: "all", split: false, smooth: true, bucket: "day", unit: "money" };
const load = (): Saved => {
  try {
    const p = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    // v2: curves are smooth by default (older saves may hold the "exact" step style)
    return { ...defaults, ...p, ...(p.v === 2 ? {} : { smooth: true }), v: 2 } as Saved;
  } catch { return defaults; }
};

const inst = (s: string) => s.replace(/^[^:]+:/, "");
const ts = (s: string | null) => (s ? Date.parse(s.length <= 16 ? `${s}Z` : s) : NaN);
const DAY = 864e5;

function niceTicks(min: number, max: number, n = 5): { ticks: number[]; step: number } {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return { ticks: out, step };
}

const valueAt = (pts: Pt[], t: number) => {
  let v = pts[0]?.v ?? 0;
  for (const p of pts) { if (p.t <= t) v = p.v; else break; }
  return v;
};

/** Monotone cubic path: smooth, never overshoots the data. */
function smoothPath(xy: [number, number][]): string {
  const n = xy.length;
  if (n < 3) return xy.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(xy[i + 1][0] - xy[i][0] || 1e-6); m.push((xy[i + 1][1] - xy[i][1]) / dx[i]); }
  const tg: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) tg.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  tg.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; }
    const a = tg[i] / m[i], b = tg[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); tg[i] = k * a * m[i]; tg[i + 1] = k * b * m[i]; }
  }
  let d = `M${xy[0][0]} ${xy[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${xy[i][0] + h} ${xy[i][1] + tg[i] * h} ${xy[i + 1][0] - h} ${xy[i + 1][1] - tg[i + 1] * h} ${xy[i + 1][0]} ${xy[i + 1][1]}`;
  }
  return d;
}

function exportPng(svg: SVGSVGElement, title: string, value: string, file: string) {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  const src = new XMLSerializer().serializeToString(svg).replace(/var\((--[\w-]+)\)/g, (_, n) => v(n, "#888"));
  const w = svg.clientWidth, h = svg.clientHeight, head = 74, k = 2;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = (w + 40) * k; c.height = (h + head + 30) * k;
    const g = c.getContext("2d")!;
    g.scale(k, k);
    g.fillStyle = v("--bg", "#000"); g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = v("--muted", "#999"); g.font = "14px sans-serif"; g.fillText(title, 24, 34);
    g.fillStyle = v("--text", "#fff"); g.font = "bold 28px sans-serif"; g.fillText(value, 24, 66);
    g.drawImage(img, 20, head);
    g.fillStyle = v("--muted", "#999"); g.font = "11px sans-serif"; g.textAlign = "right";
    g.fillText("Mizan by Nour Aouichi", w + 20, h + head + 20);
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = `${file}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
}

interface ChartProps {
  series: Series[];
  lang: Lang;
  money: (n: number) => string;
  cur: string;
  pct?: boolean;
  height: number;
  label: string;
  title: string;
  smooth: boolean;
  kind: "line" | "dd" | "bars";
  t: (k: Key) => string;
}

// The data ends at this fraction of the width; the rest stays open so the chart reads as "still moving".
const END_AT = 0.6;

/** Even time grid + light [1,2,1] averaging: the soft, flowing curve of an equity chart. */
function soften(pts: Pt[], n: number): Pt[] {
  if (pts.length < 3) return pts;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  if (t1 <= t0) return pts;
  const grid: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const tt = t0 + ((t1 - t0) * i) / n;
    grid.push({ t: tt, v: valueAt(pts, tt) });
  }
  const out = grid.map((p, i) => (i === 0 || i === n ? p : { t: p.t, v: (grid[i - 1].v + 2 * p.v + grid[i + 1].v) / 4 }));
  out[n] = { t: t1, v: pts[pts.length - 1].v };
  return out;
}

const lerpAt = (pts: Pt[], t0: number) => {
  if (t0 <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t >= t0) {
      const a = pts[i - 1], b = pts[i];
      return a.v + ((b.v - a.v) * (t0 - a.t)) / (b.t - a.t || 1);
    }
  }
  return pts[pts.length - 1].v;
};

function Chart({ series, lang, money, cur, pct, height, label, title, smooth, kind, t }: ChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null); // hover details: one series alone, or all together
  const [pickOpen, setPickOpen] = useState(false);
  useEffect(() => {
    if (!pickOpen) return;
    const off = (e: MouseEvent) => !wrap.current?.querySelector("[data-pick]")?.contains(e.target as Node) && setPickOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [pickOpen]);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const { hidden: hide } = usePrivacy();
  const gid = useRef(`g${Math.random().toString(36).slice(2, 7)}`).current;

  const bars = kind === "bars";
  const padR = 18, padT = 16, padB = 32;
  const ih = height - padT - padB;

  // ----- scales -----
  const all = series.flatMap((s) => s.pts);
  const barList = series[0]?.bars ?? [];
  let xMin = 0, xLast = 1, xMax = 1, yMin = 0, yMax = 1;
  if (bars) {
    const vs = barList.map((b) => b.v);
    yMin = Math.min(0, ...vs); yMax = Math.max(0, ...vs);
  } else {
    xMin = Math.min(...all.map((p) => p.t)); xLast = Math.max(...all.map((p) => p.t));
    xMax = xMin + (xLast - xMin) / END_AT;
    yMin = Math.min(...all.map((p) => p.v)); yMax = Math.max(...all.map((p) => p.v));
    if (kind === "dd") yMax = Math.max(yMax, 0);
  }
  const span = yMax - yMin || 1;
  yMin -= span * (bars || kind === "dd" ? 0.06 : 0.12);
  yMax += span * (kind === "dd" ? 0.04 : 0.14);
  const { ticks, step: tickStep } = niceTicks(yMin, yMax);
  const dec = tickStep >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(tickStep)));
  const tickLabel = (v: number) => (pct ? `${fmt(Math.abs(v) < 1e-9 ? 0 : v, dec)}%` : hide ? "•••" : `${v < 0 ? "-" : ""}${fmt(Math.abs(v), dec)}${cur}`);
  // Left margin fits the longest Y label (large balances like "140,000$" were cut off at a fixed 62px).
  const padL = Math.max(62, Math.ceil(Math.max(...ticks.map((v) => tickLabel(v).length)) * 7.2) + 20);
  const iw = w - padL - padR;
  const xEnd = xMax;
  const X = (t0: number) => padL + ((t0 - xMin) / (xEnd - xMin || 1)) * iw;
  const Y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;

  const drawn = useMemo(
    () => series.map((s) => (smooth ? soften(s.pts, Math.max(40, Math.min(110, Math.floor(iw * END_AT / 9)))) : s.pts)),
    [series, smooth, iw],
  );
  const linePath = (pts: Pt[]) =>
    smooth ? smoothPath(pts.map((p) => [X(p.t), Y(p.v)])) : pts.map((p, i) => `${i ? "L" : "M"}${X(p.t)} ${Y(p.v)}`).join(" ");

  const spanMs = xEnd - xMin;
  const fmtTick = (t0: number) =>
    new Intl.DateTimeFormat(lang, spanMs < 2 * DAY ? { hour: "2-digit", minute: "2-digit", timeZone: "UTC" } : spanMs < 75 * DAY ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(t0));
  const fmtDate = (t0: number) =>
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(t0));
  const fmtBadge = (t0: number) =>
    spanMs >= 75 * DAY ? fmtTick(t0) : new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", ...(spanMs < 30 * DAY ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "UTC" }).format(new Date(t0));
  const xTicks = Array.from({ length: 7 }, (_, i) => ({ t: xMin + ((xMax - xMin) * i) / 6, i })).filter((tk, k, arr) => k === 0 || fmtTick(tk.t) !== fmtTick(arr[k - 1].t));
  const zeroY = Y(0);

  // ----- hover (snaps to the nearest real data point, only over the drawn data) -----
  const times = useMemo(() => [...new Set(all.map((p) => p.t))].sort((a, b) => a - b), [series]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = bars ? iw / Math.max(1, barList.length) : 0;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (bars) { setHover(Math.min(barList.length - 1, Math.max(0, Math.floor((px - padL) / step)))); return; }
    if (px > X(xLast) + 24 || px < padL - 8) { setHover(null); return; }
    const tt = xMin + ((px - padL) / iw) * (xEnd - xMin);
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < tt) lo = mid + 1; else hi = mid; }
    const a = times[Math.max(0, lo - 1)], b = times[lo];
    setHover(Math.abs(a - tt) < Math.abs(b - tt) ? a : b);
  };
  const active = pinned ?? hover;
  const ax = active == null ? 0 : bars ? padL + (active + 0.5) * step : X(active);
  const tipLeft = active != null && ax > w * 0.55;

  const cid = (s: Series) => `${gid}${s.id.replace(/\W/g, "")}`;
  const sig = `${kind}${smooth}${series.map((s) => s.id + s.pts.length).join()}`;
  const single = series.length === 1;
  const focusId = focus && series.some((x) => x.id === focus) ? focus : null;
  const hoverSeries = focusId ? series.filter((x) => x.id === focusId) : series;
  const dim = (id: string) => (focusId && id !== focusId ? 0.22 : 1);
  const multi = series.length > 2; // crowded: colour lines only (no fills, no end badges)

  return (
    <div ref={wrap} className="group relative select-none" dir="ltr">
      <button
        type="button"
        aria-label={t("chExport")}
        title={t("chExport")}
        onClick={(e) => { e.stopPropagation(); if (svgRef.current) exportPng(svgRef.current, title, money(bars ? barList.reduce((a, b) => a + b.v, 0) : series[0]?.pts[series[0].pts.length - 1]?.v ?? 0), `mizan-${title.toLowerCase().replace(/\W+/g, "-")}`); }}
        className="absolute end-1 top-0 z-10 grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface/80 opacity-0 backdrop-blur transition-opacity hover:border-icon focus:opacity-100 group-hover:opacity-100"
      >
        <Download size={15} className="text-icon" />
      </button>
      {!bars && series.length > 1 && (
        <div data-pick className="absolute end-11 top-0 z-20">
          <button
            type="button"
            aria-label={t("chHoverPick")}
            title={t("chHoverPick")}
            aria-expanded={pickOpen}
            onClick={(e) => { e.stopPropagation(); setPickOpen(!pickOpen); }}
            className={`grid h-8 w-8 place-items-center rounded-lg border bg-surface/80 backdrop-blur transition-opacity hover:border-icon focus:opacity-100 group-hover:opacity-100 ${focusId || pickOpen ? "border-icon opacity-100" : "border-border opacity-0"}`}
          >
            <Crosshair size={15} className="text-icon" />
          </button>
          {pickOpen && (
            <div role="menu" className="absolute end-0 top-full mt-1.5 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
              <p className="px-2 pb-1 pt-0.5 text-xs font-semibold text-muted">{t("chHoverPick")}</p>
              {[{ id: null as string | null, name: t("chHoverAll"), color: "" }, ...series.map((x) => ({ id: x.id as string | null, name: x.name, color: x.color }))].map((o) => (
                <button key={o.id ?? "all"} type="button" role="menuitemradio" aria-checked={focusId === o.id} onClick={(e) => { e.stopPropagation(); setFocus(o.id); setPickOpen(false); }} className="menu-item">
                  {o.color ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} /> : <span className="flex -space-x-1">{series.slice(0, 3).map((x) => <span key={x.id} className="h-2.5 w-2.5 rounded-full ring-2 ring-surface" style={{ background: x.color }} />)}</span>}
                  <span className="flex-1 truncate text-start">{o.name}</span>
                  {focusId === o.id && <span className="text-icon">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <svg ref={svgRef} width={w} height={height} onPointerMove={move} onPointerLeave={() => setHover(null)} onClick={() => setPinned(pinned == null ? hover : null)} className="block cursor-crosshair" style={{ fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif" }} role="img" aria-label={label}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={cid(s)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={single ? 0.5 : 0.2} />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeOpacity={v === 0 ? 0.9 : 0.35} />
            <text x={padL - 12} y={Y(v) + 4} fontSize="11.5" fill="var(--muted)" textAnchor="end" className="tnum">{tickLabel(v)}</text>
          </g>
        ))}

        {!bars && xTicks.map((tk) => (
          <text key={tk.i} x={X(tk.t)} y={height - 9} fontSize="11.5" fill="var(--muted)" textAnchor={tk.i === 0 ? "start" : tk.i === 6 ? "end" : "middle"}>{fmtTick(tk.t)}</text>
        ))}
        {bars && barList.map((b, i) => (i % Math.max(1, Math.ceil(barList.length / 8)) === 0 ? (
          <text key={b.key} x={padL + (i + 0.5) * step} y={height - 9} fontSize="11.5" fill="var(--muted)" textAnchor="middle">{b.label}</text>
        ) : null))}

        {bars ? (
          <g key={sig} className="ch-fade">
            {barList.map((b, i) => {
              const bw = Math.max(2, Math.min(34, step * 0.66));
              const y0 = Y(0), y1 = Y(b.v);
              const on = active === i;
              return (
                <rect key={b.key} x={padL + (i + 0.5) * step - bw / 2} y={Math.min(y0, y1)} width={bw} height={Math.max(1.5, Math.abs(y1 - y0))} rx={Math.min(4, bw / 2)}
                  fill={b.v >= 0 ? GREEN : RED} opacity={active == null || on ? 1 : 0.45} />
              );
            })}
          </g>
        ) : (
          <g key={sig} className="ch-fade">
            {!multi && series.map((s, k) => (
              <path key={`a${s.id}`} opacity={dim(s.id)} d={`${linePath(drawn[k])} V${kind === "dd" ? zeroY : height - padB} H${X(drawn[k][0].t)} Z`} fill={`url(#${cid(s)})`} />
            ))}
            {series.map((s, k) => (
              <path key={s.id} opacity={dim(s.id)} d={linePath(drawn[k])} fill="none" stroke={s.color} strokeWidth={multi ? 2 : 2.6} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {series.map((s, k) => {
              const last = drawn[k][drawn[k].length - 1];
              const lv = s.pts[s.pts.length - 1].v;
              const text = pct ? `${lv > 0 ? "+" : ""}${fmt(lv, 1)}%` : hide ? "•••" : `${lv < 0 ? "-" : ""}${fmt(Math.abs(lv), 0)}${cur}`;
              const bw = text.length * 7.2 + 16;
              return (
                <g key={`e${s.id}`}>
                  {multi ? <circle cx={X(last.t)} cy={Y(last.v)} r="3.5" fill={s.color} /> : <>
                  <line x1={X(last.t)} x2={w - padR} y1={Y(last.v)} y2={Y(last.v)} stroke={s.color} strokeOpacity="0.4" strokeDasharray="2 7" strokeLinecap="round" />
                  <circle cx={X(last.t)} cy={Y(last.v)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
                  <rect x={X(last.t) + 12} y={Y(last.v) - 11} width={bw} height="22" rx="7" fill={s.color} />
                  <text x={X(last.t) + 12 + bw / 2} y={Y(last.v) + 4} fontSize="11.5" fontWeight="700" textAnchor="middle" fill="#111" className="tnum">{text}</text>
                  </>}
                </g>
              );
            })}
          </g>
        )}

        {active != null && !bars && (
          <g>
            <line x1={ax} x2={ax} y1={padT} y2={height - padB} stroke="var(--icon)" strokeOpacity="0.55" strokeDasharray="3 5" />
            {series.map((s, k) => focusId && s.id !== focusId ? null : (
              <g key={s.id}>
                <circle cx={ax} cy={Y(lerpAt(drawn[k], active))} r="8" fill={s.color} opacity="0.2" />
                <circle cx={ax} cy={Y(lerpAt(drawn[k], active))} r="4.5" fill={s.color} stroke="var(--bg)" strokeWidth="2" />
              </g>
            ))}
            <rect x={Math.min(Math.max(ax - 52, padL), w - padR - 104)} y={height - padB + 4} width="104" height="20" rx="6" fill="var(--icon)" />
            <text x={Math.min(Math.max(ax, padL + 52), w - padR - 52)} y={height - padB + 18} fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--on-primary)">{fmtBadge(active)}</text>
          </g>
        )}
      </svg>

      {active != null && (
        <div className="pointer-events-none absolute top-3 z-10 min-w-[200px] rounded-xl border border-icon/40 bg-surface/80 px-3 py-2.5 text-xs shadow-2xl backdrop-blur-md" style={{ left: tipLeft ? undefined : ax + 14, right: tipLeft ? w - ax + 14 : undefined }}>
          {bars ? (
            <>
              <p className="mb-1 text-muted">{barList[active]?.label}{pinned != null ? " 📌" : ""}</p>
              <p className="flex items-center gap-2 py-0.5">
                <span className="flex-1 font-medium">{t("pnl")}</span>
                <span className="tnum text-sm font-bold" style={{ color: (barList[active]?.v ?? 0) >= 0 ? GREEN : RED }}>{money(barList[active]?.v ?? 0)}</span>
              </p>
              <p className="text-muted">{barList[active]?.n} {t("monthTrades")}</p>
            </>
          ) : (
            <>
              <p className="mb-1 text-muted">{fmtDate(active)} · UTC{pinned != null ? " 📌" : ""}</p>
              {hoverSeries.map((s) => {
                const v = valueAt(s.pts, active);
                return (
                  <p key={s.id} className="flex items-center gap-2 py-0.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1 font-medium">{s.name}</span>
                    <span className="tnum text-sm font-bold" style={{ color: s.color }}>{money(v)}</span>
                  </p>
                );
              })}
              {hoverSeries.length === 1 && kind === "line" && (() => {
                const d = valueAt(hoverSeries[0].pts, active) - hoverSeries[0].pts[0].v;
                return <p className="mt-1 flex justify-between border-t border-border pt-1 text-muted"><span>{t("chFromStart")}</span><span className="tnum font-semibold" style={{ color: d >= 0 ? GREEN : RED }}>{!pct && d > 0 ? "+" : ""}{money(d)}</span></p>;
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const weekStart = (t0: number) => { const d = new Date(t0); const wd = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd); };

export default function ChartsView({ t, lang, accounts, trades, balances, flows = [] }: Props) {
  const [st, setSt] = useState<Saved>(load);
  const [open, setOpen] = useState<Mode | null>(null); // only one analysis is ever open
  const [acc, setAcc] = useState("all");
  const [vh, setVh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open]);
  const save = (p: Partial<Saved>) => {
    const next = { ...st, ...p };
    setSt(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch {}
  };

  const mode: Mode = open ?? "symbol";
  const byAcc = mode === "account";
  const metric: Metric = !byAcc && st.metric === "balance" ? "profit" : st.metric; // balance only makes sense per account
  const closed = useMemo(() => trades.filter((x) => x.status === "closed" && x.pnl != null && !isNaN(ts(x.exitTime))), [trades]);
  const scope = useMemo(() => (byAcc || acc === "all" ? closed : closed.filter((x) => x.accountId === acc)), [closed, acc, byAcc]);
  const accsInView = byAcc || acc === "all" ? accounts : accounts.filter((a) => a.id === acc);
  const currency = commonCurrency(accsInView); // null when the accounts in view use different currencies
  const { hidden: hideMoney } = usePrivacy();
  const moneyBase = (n: number) => hideMoney ? "••••" : fmtMoney(n, { currency }); // summary: whole units, currency after the number

  const symbols = useMemo(() => [...new Set(scope.map((x) => x.symbol))].sort(), [scope]);
  const items = byAcc ? [ALL, ...accounts.map((a) => a.id)] : [ALL, ...symbols];
  const nameOf = (id: string) => (id === ALL ? t("chAll") : byAcc ? accounts.find((a) => a.id === id)?.name ?? id : inst(id));
  const colorOf = (id: string) => st.colors[id] ?? (id === ALL ? PALETTE[0] : PALETTE[(1 + Math.max(0, items.indexOf(id) - 1)) % PALETTE.length]);
  const stored = byAcc ? st.selectedAcc : st.selected;
  const valid = stored.filter((id) => items.includes(id));
  const chosen = valid.length ? valid : [ALL];
  const setChosen = (next: string[]) => save(byAcc ? { selectedAcc: next } : { selected: next });

  const cutoff = useMemo(() => {
    const d = new Date();
    if (st.range === "all") return null;
    if (st.range === "YTD") return Date.UTC(d.getUTCFullYear(), 0, 1);
    const m = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 }[st.range];
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m, d.getUTCDate());
  }, [st.range]);

  const bucketOf = (x: Trade): { key: string; label: string } => {
    const e = ts(x.exitTime);
    if (st.bucket === "session") {
      const h = new Date(ts(x.entryTime ?? x.exitTime) || e).getUTCHours();
      const k = h < 7 ? "sessTK" : h < 13 ? "sessLN" : h < 21 ? "sessNY" : "sessSY";
      return { key: k, label: t(k as Key) };
    }
    const d = new Date(st.bucket === "week" ? weekStart(e) : e);
    const key = st.bucket === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat(lang, st.bucket === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
    return { key, label };
  };

  // Balance curve of one account (same source as the account card): imported history + later trades/flows, else start balance + P&L + cash flows.
  const accountBalance = (a: Account): Pt[] => balanceSeries(a, closed, balances[a.id] ?? [], flows).map((p) => ({ t: ts(p.t), v: p.v })).filter((p) => !isNaN(p.t));

  const startSum = accsInView.reduce((a, x) => a + (x.startBalance || 0), 0);
  const rawSeries: Series[] = useMemo(() => {
    return chosen
      .map((id): Series => {
        const list = scope
          .filter((x) => id === ALL || (byAcc ? x.accountId === id : x.symbol === id))
          .sort((a, b) => ts(a.exitTime) - ts(b.exitTime));
        const color = colorOf(id);
        const name = nameOf(id);
        const cs = computeStats(list);
        const stats: Stats = { net: cs.net, n: list.length, winRate: cs.winRate, pf: cs.profitFactor };
        const base = id !== ALL && byAcc ? accounts.find((a) => a.id === id)?.startBalance ?? 0 : startSum;

        if (metric === "periods") {
          const m = new Map<string, Bar>();
          for (const x of list) {
            if (cutoff != null && ts(x.exitTime) < cutoff) continue;
            const b = bucketOf(x);
            const cur = m.get(b.key) ?? { key: b.key, label: b.label, v: 0, n: 0 };
            cur.v += x.pnl as number; cur.n++;
            m.set(b.key, cur);
          }
          const bars = [...m.values()].sort((a, b) => (st.bucket === "session" ? 0 : a.key.localeCompare(b.key)));
          return { id, name, color, pts: [], bars, stats, base };
        }

        let pts: Pt[] = [];
        if (metric === "balance") {
          if (id === ALL) {
            const curves = accounts.map(accountBalance).filter((c) => c.length);
            const times = [...new Set(curves.flatMap((c) => c.map((p) => p.t)))].sort((a, b) => a - b);
            pts = times.map((tm) => ({ t: tm, v: curves.reduce((sum, c) => sum + (tm < c[0].t ? c[0].v : valueAt(c, tm)), 0) }));
          } else {
            const a = accounts.find((x) => x.id === id);
            pts = a ? accountBalance(a) : [];
          }
        } else {
          let run = 0;
          pts = list.map((x) => ({ t: ts(x.exitTime), v: (run += x.pnl as number) }));
          if (pts.length) pts.unshift({ t: ts(list[0].entryTime ?? list[0].exitTime) || pts[0].t, v: 0 });
          if (metric === "drawdown") {
            let peak = 0, r = 0;
            pts = list.length ? [{ t: pts[0].t, v: 0 }, ...list.map((x) => { r += x.pnl as number; peak = Math.max(peak, r); return { t: ts(x.exitTime), v: r - peak }; })] : [];
          }
        }
        const dedup: Pt[] = [];
        for (const p of pts) { if (dedup.length && dedup[dedup.length - 1].t === p.t) dedup[dedup.length - 1] = p; else dedup.push(p); }
        pts = dedup;
        if (cutoff != null && pts.length) pts = [{ t: cutoff, v: valueAt(pts, cutoff) }, ...pts.filter((p) => p.t > cutoff)];
        return { id, name, color, pts, bars: [], stats, base };
      })
      .filter((s) => (metric === "periods" ? s.bars.length > 0 : s.pts.length > 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, chosen.join("|"), metric, st.colors, st.bucket, cutoff, balances, flows, acc, byAcc, lang, accounts, startSum]);

  // $ / % : percent is relative to the starting balance (balance view: change since the start)
  const canPct = rawSeries.length > 0 && rawSeries.every((x) => x.base > 0);
  const pctMode = st.unit === "pct" && canPct;
  const series: Series[] = useMemo(() => {
    if (!pctMode) return rawSeries;
    const f = (x: Series, v: number) => (metric === "balance" ? ((v - x.base) / x.base) * 100 : (v / x.base) * 100);
    return rawSeries.map((x) => ({ ...x, pts: x.pts.map((p) => ({ t: p.t, v: f(x, p.v) })), bars: x.bars.map((b) => ({ ...b, v: f(x, b.v) })) }));
  }, [rawSeries, pctMode, metric]);
  const money = pctMode ? (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}%` : moneyBase;

  // ----- headline -----
  const head = series[0];
  const startAll = startSum;
  let headVal = 0, pct: number | null = null, sub = "";
  if (head) {
    if (metric === "periods") {
      headVal = head.bars.reduce((a, b) => a + b.v, 0);
      const pos = head.bars.filter((b) => b.v > 0).length;
      sub = `${pos}/${head.bars.length} ${t("chPosPeriods")}`;
      pct = startAll ? (headVal / startAll) * 100 : null;
    } else if (metric === "drawdown") {
      headVal = Math.min(...head.pts.map((p) => p.v));
      pct = startAll ? (headVal / startAll) * 100 : null;
    } else {
      headVal = head.pts[head.pts.length - 1].v;
      const first = head.pts[0].v;
      pct = metric === "balance" ? (first ? ((headVal - first) / Math.abs(first)) * 100 : null) : startAll ? (headVal / startAll) * 100 : null;
    }
  }
  const label = (m: Metric) => t(({ profit: "chProfit", balance: "chBalance", drawdown: "chDrawdown", periods: "chPeriods" } as const)[m]);
  const lineKind = metric === "drawdown" ? "dd" : "line";
  const isBars = metric === "periods";
  const split = st.split || isBars;
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const value = (s: Series) => (isBars ? s.bars.reduce((a, b) => a + b.v, 0) : metric === "drawdown" ? Math.min(...s.pts.map((p) => p.v)) : s.pts[s.pts.length - 1].v);
  const metrics: Metric[] = byAcc ? ["profit", "balance", "drawdown", "periods"] : ["profit", "drawdown", "periods"];

  const seg = (on: boolean) => `px-3 py-1.5 transition-colors ${on ? "bg-primary text-on-primary" : "hover:text-icon"}`;
  const group = "flex overflow-hidden rounded-lg border border-border text-sm font-semibold";
  const pill = "flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold transition-colors hover:border-icon";
  const chartH = Math.max(320, vh - 400);
  const oneH = Math.max(320, vh - 440);
  const cardH = Math.max(240, Math.min(300, (vh - 360) / 2));

  const launch = (m: Mode, Icon: typeof Wallet, title: string, hint: string) => {
    const on = open === m;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setOpen(on ? null : m)}
        className={`flex items-center gap-3 rounded-2xl border px-5 py-3 text-start transition-colors ${on ? "border-icon bg-primary-tint" : "border-border bg-surface hover:border-icon"}`}
      >
        <Icon size={22} className="text-icon" strokeWidth={1.8} />
        <span>
          <span className="block font-heading text-base font-bold">{title}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
      </button>
    );
  };

  // Symbol analytics sits at the top-left, account analytics at the top-right (regardless of text direction).
  const switcher = (
    <div className="flex items-center justify-between gap-3" dir="ltr">
      {launch("symbol", CandlestickChart, t("chSymAnalytics"), t("chSymHint"))}
      {launch("account", Wallet, t("chAccAnalytics"), t("chAccHint"))}
    </div>
  );

  if (!open) {
    return (
      <section className="flex flex-col gap-4">
        {switcher}
        <p className="rounded-2xl border border-dashed border-border py-20 text-center text-sm text-muted">{t("chPick")}</p>
      </section>
    );
  }

  return (
    <>
      {/* placeholder keeps the page layout while the analysis covers the screen */}
      <section className="flex flex-col gap-4">{switcher}</section>
      <div className="fixed inset-0 z-[60] flex flex-col gap-4 overflow-auto bg-bg p-5" role="dialog" aria-label={t(byAcc ? "chAccAnalytics" : "chSymAnalytics")}>
        <div className="flex items-center gap-3" dir="ltr">
          <div className="flex flex-1 items-center justify-between gap-3">
            {launch("symbol", CandlestickChart, t("chSymAnalytics"), t("chSymHint"))}
            {launch("account", Wallet, t("chAccAnalytics"), t("chAccHint"))}
          </div>
          <button type="button" onClick={() => setOpen(null)} className="icon-btn" aria-label={t("chClose")} title={t("chClose")}><X size={20} className="text-icon" /></button>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="me-auto">
              <div className="flex items-center gap-2 text-sm text-muted">
                {label(metric)}
                {pct != null && head && !pctMode && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pct >= 0 ? "bg-primary-tint text-icon" : "bg-[#f87171]/15 text-[#f87171]"}`} dir="ltr">{pct >= 0 ? "+" : ""}{fmt(pct)}%</span>
                )}
              </div>
              <p className={`font-heading text-3xl font-bold tnum ${metric === "drawdown" && headVal < 0 ? "text-[#f87171]" : ""}`} dir="ltr">{money(headVal)}</p>
              {sub && <p className="text-xs text-muted">{sub}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {!byAcc && accounts.length > 1 && (
                <select className="field !w-auto" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label={t("pickAccount")}>
                  <option value="all">{t("allAccounts")}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <div className={group} role="group">
                {metrics.map((m) => (
                  <button key={m} type="button" aria-pressed={metric === m} onClick={() => save({ metric: m })} className={seg(metric === m)}>{label(m)}</button>
                ))}
              </div>
              {isBars ? (
                <select className="field !w-auto" value={st.bucket} onChange={(e) => save({ bucket: e.target.value as Bucket })} aria-label={t("chPeriods")}>
                  {(["day", "week", "month", "session"] as const).map((b) => <option key={b} value={b}>{t(({ day: "chBucketDay", week: "chBucketWeek", month: "chBucketMonth", session: "chBucketSession" } as const)[b])}</option>)}
                </select>
              ) : (
                <>
                  <div className={group} role="group">
                    {[false, true].map((sp) => (
                      <button key={String(sp)} type="button" aria-pressed={st.split === sp} onClick={() => save({ split: sp })} className={seg(st.split === sp)}>{t(sp ? "chSplit" : "chOverlay")}</button>
                    ))}
                  </div>
                  {metric !== "drawdown" && (
                    <div className={group} role="group">
                      {[true, false].map((sm) => (
                        <button key={String(sm)} type="button" aria-pressed={st.smooth === sm} onClick={() => save({ smooth: sm })} className={seg(st.smooth === sm)}>{t(sm ? "chSmooth" : "chStep")}</button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <Dropdown
                label={t(byAcc ? "chByAccount" : "chSymbols")}
                panelClass="w-72 max-h-80 overflow-auto"
                bare
                trigger={<span className={pill}><span className="flex -space-x-1">{chosen.slice(0, 4).map((id) => <span key={id} className="h-2.5 w-2.5 rounded-full ring-2 ring-surface" style={{ background: colorOf(id) }} />)}</span>{chosen.length}/{items.length}<ChevronDown size={14} /></span>}
              >
                {() => (
                  <div className="flex flex-col gap-0.5">
                    <button type="button" role="menuitemcheckbox" aria-checked={chosen.length === items.length} onClick={() => setChosen(chosen.length === items.length ? [ALL] : items)} className="menu-item border-b border-border pb-2 font-bold">
                      <input type="checkbox" readOnly checked={chosen.length === items.length} className="accent-[var(--primary)]" />
                      <span className="flex-1 text-start">{t("chSelectAll")}<span className="block text-xs font-normal text-muted">{chosen.length}/{items.length}</span></span>
                    </button>
                    {items.map((id) => (
                      <div key={id} className="menu-item">
                        <input type="checkbox" checked={chosen.includes(id)} onChange={() => toggle(id)} aria-label={nameOf(id)} className="accent-[var(--primary)]" />
                        <span className="flex flex-1 items-center gap-2 text-start" dir="ltr">{id === ALL ? <span className="font-bold">{t("chAll")}</span> : (<>{!byAcc && <SymbolIcon symbol={id} />}{nameOf(id)}</>)}</span>
                        <label title={t("chColor")} className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full ring-2 ring-border transition-transform hover:scale-110">
                          <span className="absolute inset-0" style={{ background: colorOf(id) }} />
                          <input type="color" value={colorOf(id)} onChange={(e) => save({ colors: { ...st.colors, [id]: e.target.value } })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={t("chColor")} />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </Dropdown>

              <div className={group} role="group" title={canPct ? undefined : t("chNeedStart")}>
                {(["money", "pct"] as const).map((u) => (
                  <button key={u} type="button" disabled={u === "pct" && !canPct} aria-pressed={(u === "pct") === pctMode} onClick={() => save({ unit: u })} className={`${seg((u === "pct") === pctMode)} disabled:cursor-not-allowed disabled:opacity-40`}>{u === "money" ? (currency === "USD" ? "$" : currency) : "%"}</button>
                ))}
              </div>
              <select className="field !w-auto" value={st.range} onChange={(e) => save({ range: e.target.value as Range })} aria-label={t("chRange")}>
                {RANGES.map((r) => <option key={r} value={r}>{r === "all" ? t("chRangeAll") : r}</option>)}
              </select>
            </div>
          </div>

          {series.length === 0 ? (
            <p className="py-24 text-center text-sm text-muted">{t("chNoData")}</p>
          ) : split ? (
            <div className={`mt-4 grid gap-4 ${series.length > 1 ? "lg:grid-cols-2" : ""}`}>
              {series.map((s) => (
                <div key={s.id} className="rounded-xl border border-border bg-bg/40 p-3">
                  <p className="mb-1 flex items-center gap-2 text-sm font-bold" dir="ltr"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}
                    <span className="ms-auto tnum" style={{ color: isBars ? (value(s) >= 0 ? GREEN : RED) : s.color }}>{money(value(s))}</span></p>
                  <Chart series={[s]} lang={lang} money={money} cur={currencySuffix(currency)} pct={pctMode} height={series.length > 1 ? cardH : oneH} label={label(metric)} title={`${label(metric)} ${s.name}`} smooth={st.smooth} kind={isBars ? "bars" : lineKind} t={t} />
                  <StatsRow s={s} money={moneyBase} t={t} />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <Chart series={series} lang={lang} money={money} cur={currencySuffix(currency)} pct={pctMode} height={chartH} label={label(metric)} title={`${label(metric)} · ${series.map((s) => s.name).join(", ")}`} smooth={st.smooth} kind={lineKind} t={t} />
              <div className="mt-3 flex flex-col gap-2">
                {series.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border px-3 py-2" dir="ltr">
                    <span className="flex min-w-[130px] items-center gap-2 text-sm font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>
                    <span className="tnum text-sm font-bold" style={{ color: s.color }}>{money(value(s))}</span>
                    <StatsRow s={s} money={moneyBase} t={t} inline />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatsRow({ s, money, t, inline }: { s: Series; money: (n: number) => string; t: (k: Key) => string; inline?: boolean }) {
  const chip = "flex items-baseline gap-1.5 text-xs";
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 ${inline ? "" : "mt-2 border-t border-border pt-2"}`} dir="ltr">
      <span className={chip}><span className="text-muted">{t("pnl")}</span><span className="tnum font-semibold" style={{ color: s.stats.net >= 0 ? GREEN : RED }}>{money(s.stats.net)}</span></span>
      <span className={chip}><span className="text-muted">{t("monthTrades")}</span><span className="tnum font-semibold">{s.stats.n}</span></span>
      <span className={chip}><span className="text-muted">{t("chWinRate")}</span><span className="tnum font-semibold">{s.stats.winRate == null ? "—" : `${fmt(s.stats.winRate, 1)}%`}</span></span>
      <span className={chip}><span className="text-muted">{t("chPF")}</span><span className="tnum font-semibold">{s.stats.pf == null ? "—" : fmt(s.stats.pf)}</span></span>
    </div>
  );
}
