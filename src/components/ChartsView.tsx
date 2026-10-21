import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Crosshair, Download, X, Wallet, CandlestickChart, FileSpreadsheet, CalendarRange, ArrowRight, SlidersHorizontal, Info, TrendingUp, TrendingDown, CalendarDays, Activity, BarChart3, Ruler, Grid3x3, Flame, FlaskConical, ShieldCheck, Dices, Scale, type LucideIcon } from "lucide-react";
import RangePicker from "./RangePicker";
import Dropdown from "./Dropdown";
import SymbolIcon from "./SymbolIcon";
import { GoldenRules, Heatmap, SizeTable, WhatIfPanel, oddsLine } from "./ChartLab";
import { usePrivacy } from "../usePrivacy";
import { fmt, computeStats } from "../lib/stats";
import { commonCurrency, currencySuffix, fmtMoney, ltrNumbers } from "../lib/money";
import { balanceSeries } from "../lib/balance";
import { signed, type CashFlow } from "../lib/cashflow";
import { barsCsv, histogram, maxDrawdownWindow, monteCarlo, rollingSeries, seriesCsv, type DdWindow, type McResult, type RollKind } from "../lib/chartAnalytics";
import { applyWhatIf, cumCurve, currentRisk, findRules, heatmap, labStats, propCheck, propOdds, rMultiple, sizing, tiltSplit, type HeatCell, type PropOdds, type PropResult, type PropRules, type RuleIdea, type Sizing, type WhatIfRules } from "../lib/tradeLab";
import type { Key } from "../i18n";
import type { Account, BalancePoint, Lang, Trade } from "../types";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  accounts: Account[];
  trades: Trade[];
  balances: Record<string, BalancePoint[]>;
  flows?: CashFlow[];
  /** Opens the Day by Day report on this day (YYYY-MM-DD), optionally for one account. */
  onOpenDay?: (day: string, accountId: string | null) => void;
}

const STORE = "mizan-charts";
const ALL = "__all";
const GREEN = "#22c55e";
const RED = "#f87171";
const PALETTE = ["#f5b83d", "#22c55e", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];
const RANGES = ["all", "1M", "3M", "6M", "YTD", "1Y", "custom"] as const;
type Range = (typeof RANGES)[number];
type Metric = "profit" | "balance" | "drawdown" | "periods" | "rolling" | "dist" | "mc" | "whatif" | "heat" | "rmult" | "tilt" | "size" | "prop";
type Fact = { label: string; value: string; tone?: "pos" | "neg" };
const LABEL: Record<Metric, Key> = { profit: "chProfit", balance: "chBalance", drawdown: "chDrawdown", periods: "chPeriods", rolling: "chRolling", dist: "chDist", mc: "chMC", whatif: "chWhatIf", heat: "chHeat", rmult: "chRmult", tilt: "chTilt", size: "chSize", prop: "chPropNav" };
const QUESTION: Record<Metric, Key> = { profit: "chQprofit", balance: "chQbalance", drawdown: "chQdrawdown", periods: "chQperiods", rolling: "chQrolling", dist: "chQdist", mc: "chQmc", whatif: "chQwhatif", heat: "chQheat", rmult: "chQrmult", tilt: "chQtilt", size: "chQsize", prop: "chQprop" };
const ICON: Record<Metric, LucideIcon> = { profit: TrendingUp, balance: Wallet, drawdown: TrendingDown, periods: CalendarDays, rolling: Activity, dist: BarChart3, rmult: Ruler, heat: Grid3x3, tilt: Flame, whatif: FlaskConical, prop: ShieldCheck, mc: Dices, size: Scale };
// Analyses grouped by the kind of question they answer.
const GROUPS: { key: Key; items: Metric[] }[] = [
  { key: "chGrpPerf", items: ["profit", "balance", "drawdown", "periods"] },
  { key: "chGrpStats", items: ["rolling", "dist", "rmult", "heat"] },
  { key: "chGrpBehavior", items: ["tilt", "whatif"] },
  { key: "chGrpRisk", items: ["prop", "mc", "size"] },
];
type Mode = "symbol" | "account";
type Bucket = "day" | "week" | "month" | "session" | "weekday" | "hour" | "side";
type Pt = { t: number; v: number };
type Bar = { key: string; label: string; v: number; n: number; color?: string; tip?: string; sub?: string };
type Mark = { t: number; kind: CashFlow["type"]; title: string };
type Stats = { net: number; n: number; winRate: number | null; pf: number | null; maxDD?: number };
type Series = { id: string; name: string; color: string; pts: Pt[]; bars: Bar[]; stats: Stats; base: number; dd?: DdWindow | null; ddText?: string; ddSub?: string; marks?: Mark[]; band?: { lo: Pt[]; hi: Pt[] }; mc?: McResult | null; median?: number; guides?: { pts: Pt[]; color: string; label: string }[]; prop?: PropResult | null; propNote?: { text: string; tone: "ok" | "bad" | "info" }; alerts?: { t: number; title: string }[];
  twin?: { pts: Pt[]; stats: Stats }; heat?: HeatCell[][]; rInfo?: { n: number; total: number; avg: number | null; avgWin: number | null; avgLoss: number | null }; tilt?: { normal: { n: number; net: number }; after: { n: number; net: number } };
  ideas?: RuleIdea[]; odds?: PropOdds | null; size?: Sizing; dInfo?: { avgWin: number | null; avgLoss: number | null } };

interface Saved {
  metric: Metric; selected: string[]; selectedAcc: string[]; colors: Record<string, string>;
  range: Range; split: boolean; smooth: boolean; bucket: Bucket; unit: "money" | "pct"; v?: number;
  roll: RollKind; rollN: number; showDD: boolean; from?: string; to?: string;
  whatIf: WhatIfRules; tiltMin: number; heatVal: "net" | "win" | "n"; prop: PropRules; propDays: number;
}
const defaults: Saved = { metric: "profit", selected: [ALL], selectedAcc: [ALL], colors: {}, range: "all", split: false, smooth: true, bucket: "day", unit: "money", roll: "win", rollN: 20, showDD: true,
  whatIf: {}, tiltMin: 30, heatVal: "net", prop: { dailyLossPct: 5, maxDDPct: 10, targetPct: 10, trailing: false }, propDays: 0 };
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
  axisFmt?: (v: number, dec: number) => string; // Y labels when the values are not money / % (counts, ratios)
  badgeFmt?: (v: number) => string; // end-of-line badge
  xFmt?: (x: number) => string; // x is not a time (trade number): ticks, badge and tooltip use this
  fill?: boolean; // data spans the full width (no open space on the right)
  refLine?: number; // dashed reference level (50% win rate, profit factor 1...)
  fromStart?: boolean; // "since start" line in the tooltip
  csvX?: [string, (x: number) => string]; // CSV x column (header, format) when x is not a time
  noEnd?: boolean; // no end-of-line badge (the last point means nothing special, e.g. a risk curve)
  showDD?: boolean; // max-drawdown annotation (series that carry `dd`)
  onOpenDay?: (t: number, seriesId: string | null, barKey?: string) => void;
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

function download(text: string, file: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" })); // BOM: Excel reads UTF-8 names
  a.download = file; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Chart({ series, lang, money, cur, pct, height, label, title, smooth, kind, t, axisFmt, badgeFmt, xFmt, fill, refLine, fromStart = true, showDD, onOpenDay, csvX, noEnd }: ChartProps) {
  const bidi = (s: string) => (lang === "ar" ? ltrNumbers(s) : s); // Arabic text with numbers: keep "59$" in reading order
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
  const endAt = fill ? 1 : END_AT;
  const all = series.flatMap((s) => s.pts);
  const allY = [...all, ...series.flatMap((s) => (s.band ? [...s.band.lo, ...s.band.hi] : [])), ...(series.length === 1 ? series[0].guides ?? [] : []).flatMap((g) => g.pts)];
  const barList = series[0]?.bars ?? [];
  let xMin = 0, xLast = 1, xMax = 1, yMin = 0, yMax = 1;
  if (bars) {
    const vs = barList.map((b) => b.v);
    yMin = Math.min(0, ...vs); yMax = Math.max(0, ...vs);
  } else {
    xMin = Math.min(...all.map((p) => p.t)); xLast = Math.max(...all.map((p) => p.t));
    xMax = xMin + (xLast - xMin) / endAt;
    yMin = Math.min(...allY.map((p) => p.v)); yMax = Math.max(...allY.map((p) => p.v));
    if (refLine != null) { yMin = Math.min(yMin, refLine); yMax = Math.max(yMax, refLine); }
    if (kind === "dd") yMax = Math.max(yMax, 0);
  }
  const span = yMax - yMin || 1;
  yMin -= span * (bars || kind === "dd" ? 0.06 : 0.12);
  yMax += span * (kind === "dd" ? 0.04 : 0.14);
  const { ticks, step: tickStep } = niceTicks(yMin, yMax);
  const dec = tickStep >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(tickStep)));
  const tickLabel = (v: number) => (axisFmt ? axisFmt(Math.abs(v) < 1e-9 ? 0 : v, dec) : pct ? `${fmt(Math.abs(v) < 1e-9 ? 0 : v, dec)}%` : hide ? "•••" : `${v < 0 ? "-" : ""}${fmt(Math.abs(v), dec)}${cur}`);
  // Left margin fits the longest Y label (large balances like "140,000$" were cut off at a fixed 62px).
  const padL = Math.max(62, Math.ceil(Math.max(...ticks.map((v) => tickLabel(v).length)) * 7.2) + 20);
  const iw = w - padL - padR;
  const xEnd = xMax;
  const X = (t0: number) => padL + ((t0 - xMin) / (xEnd - xMin || 1)) * iw;
  const Y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;

  const drawn = useMemo(
    () => series.map((s) => (smooth ? soften(s.pts, Math.max(40, Math.min(110, Math.floor(iw * endAt / 9)))) : s.pts)),
    [series, smooth, iw],
  );
  const linePath = (pts: Pt[]) =>
    smooth ? smoothPath(pts.map((p) => [X(p.t), Y(p.v)])) : pts.map((p, i) => `${i ? "L" : "M"}${X(p.t)} ${Y(p.v)}`).join(" ");

  const spanMs = xEnd - xMin;
  const fmtTick = (t0: number) => xFmt ? xFmt(t0) :
    new Intl.DateTimeFormat(lang, spanMs < 2 * DAY ? { hour: "2-digit", minute: "2-digit", timeZone: "UTC" } : spanMs < 75 * DAY ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(t0));
  const fmtDate = (t0: number) => xFmt ? xFmt(t0) :
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(t0));
  const fmtBadge = (t0: number) => xFmt ? xFmt(t0) :
    spanMs >= 75 * DAY ? fmtTick(t0) : new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", ...(spanMs < 30 * DAY ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "UTC" }).format(new Date(t0));
  const tickEnd = xFmt ? xMax : Math.min(xMax, xLast); // dates: labels stop at the last point, the open space on the right is not the future
  const nTicks = Math.max(2, Math.min(6, Math.floor((X(tickEnd) - X(xMin)) / 95) + 1)); // about one label per 95 px
  const xTicks = Array.from({ length: nTicks }, (_, i) => ({ t: xMin + ((tickEnd - xMin) * i) / (nTicks - 1), i })).filter((tk, k, arr) => k === 0 || fmtTick(tk.t) !== fmtTick(arr[k - 1].t));
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
      <button
        type="button"
        aria-label={t("chExportCsv")}
        title={t("chExportCsv")}
        onClick={(e) => {
          e.stopPropagation();
          const file = `mizan-${title.toLowerCase().replace(/\W+/g, "-").replace(/^-+|-+$/g, "")}.csv`;
          if (bars) return download(barsCsv(barList.map((b) => ({ label: b.tip ?? b.label, v: b.v, n: b.n })), [t("chPeriods"), label, t("monthTrades")]), file);
          const cols = series.flatMap((s) => [{ name: s.name, pts: s.pts }, ...(s.band ? [{ name: `${s.name} 5%`, pts: s.band.lo }, { name: `${s.name} 95%`, pts: s.band.hi }] : [])]);
          download(xFmt ? seriesCsv(cols, ...(csvX ?? ["trade", (x: number) => String(Math.round(x))])) : seriesCsv(cols), file);
        }}
        className="absolute end-10 top-0 z-10 grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface/80 opacity-0 backdrop-blur transition-opacity hover:border-icon focus:opacity-100 group-hover:opacity-100"
      >
        <FileSpreadsheet size={15} className="text-icon" />
      </button>
      {!bars && series.length > 1 && (
        <div data-pick className="absolute end-[4.75rem] top-0 z-20">
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
          <text key={tk.i} x={X(tk.t)} y={height - 9} fontSize="11.5" fill="var(--muted)" textAnchor={tk.i === 0 ? "start" : tk.i === nTicks - 1 ? "end" : "middle"}>{fmtTick(tk.t)}</text>
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
                  fill={b.color ?? (b.v >= 0 ? GREEN : RED)} opacity={active == null || on ? 1 : 0.45} />
              );
            })}
          </g>
        ) : (
          <g key={sig} className="ch-fade">
            {series.map((s) => s.band && s.band.lo.length > 1 ? (
              <g key={`b${s.id}`} opacity={dim(s.id)}>
                <path d={`${s.band.hi.map((p, i) => `${i ? "L" : "M"}${X(p.t)} ${Y(p.v)}`).join(" ")} ${[...s.band.lo].reverse().map((p) => `L${X(p.t)} ${Y(p.v)}`).join(" ")} Z`} fill={s.color} opacity="0.2" />
                {[s.band.lo, s.band.hi].map((b, j) => <path key={j} d={b.map((p, i) => `${i ? "L" : "M"}${X(p.t)} ${Y(p.v)}`).join(" ")} fill="none" stroke={s.color} strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="4 5" />)}
              </g>
            ) : null)}
            {refLine != null && <line x1={padL} x2={w - padR} y1={Y(refLine)} y2={Y(refLine)} stroke="var(--icon)" strokeOpacity="0.6" strokeDasharray="6 6" />}
            {!multi && series.map((s, k) => s.band ? null : (
              <path key={`a${s.id}`} opacity={dim(s.id)} d={`${linePath(drawn[k])} V${kind === "dd" ? zeroY : height - padB} H${X(drawn[k][0].t)} Z`} fill={`url(#${cid(s)})`} />
            ))}
            {series.map((s, k) => (
              <path key={s.id} opacity={dim(s.id)} d={linePath(drawn[k])} fill="none" stroke={s.color} strokeWidth={multi ? 2 : 2.6} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {!noEnd && series.map((s, k) => {
              const last = drawn[k][drawn[k].length - 1];
              const lv = s.pts[s.pts.length - 1].v;
              const text = badgeFmt ? badgeFmt(lv) : pct ? `${lv > 0 ? "+" : ""}${fmt(lv, 1)}%` : hide ? "•••" : `${lv < 0 ? "-" : ""}${fmt(Math.abs(lv), 0)}${cur}`;
              const bw = text.length * 7.2 + 16;
              const bx = X(last.t) + 12 + bw > w - 2 ? X(last.t) - 12 - bw : X(last.t) + 12; // full-width charts: badge on the left of the last point
              return (
                <g key={`e${s.id}`}>
                  {multi ? <circle cx={X(last.t)} cy={Y(last.v)} r="3.5" fill={s.color} /> : <>
                  <line x1={X(last.t)} x2={w - padR} y1={Y(last.v)} y2={Y(last.v)} stroke={s.color} strokeOpacity="0.4" strokeDasharray="2 7" strokeLinecap="round" />
                  <circle cx={X(last.t)} cy={Y(last.v)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
                  <rect x={bx} y={Y(last.v) - 11} width={bw} height="22" rx="7" fill={s.color} />
                  <text x={bx + bw / 2} y={Y(last.v) + 4} fontSize="11.5" fontWeight="700" textAnchor="middle" fill="#111" className="tnum">{text}</text>
                  </>}
                </g>
              );
            })}
            {/* Max drawdown: peak -> trough (shaded until recovery), measured without deposits/withdrawals */}
            {showDD && series.map((s, k) => {
              const d = s.dd;
              if (!d || !(single || focusId === s.id)) return null;
              const px = X(d.peakT), tx = X(d.troughT), rx = X(d.recoverT ?? xLast);
              const py = Y(lerpAt(drawn[k], d.peakT)), ty = Y(lerpAt(drawn[k], d.troughT));
              // Label on the side of the trough with more room; on a narrow chart only what fits (the answer above repeats it).
              const leftRoom = tx - padL, rightRoom = w - padR - tx, right = rightRoom < 230 && leftRoom > rightRoom, room = right ? leftRoom : rightRoom;
              const lx = right ? tx - 10 : tx + 10, ly = Math.min(ty + 20, height - padB - 38);
              // Words follow the page direction, numbers stay left-to-right; anchors keep the block on the chosen side of the trough.
              const rtl = lang === "ar", wordAnchor = right ? (rtl ? "start" : "end") : (rtl ? "end" : "start"), numAnchor = right ? "end" : "start";
              return (
                <g key={`dd${s.id}`} pointerEvents="none">
                  <rect x={px} y={padT} width={Math.max(1, rx - px)} height={ih} fill={RED} opacity="0.07" />
                  <line x1={px} x2={tx} y1={py} y2={py} stroke={RED} strokeOpacity="0.75" strokeDasharray="4 4" />
                  <line x1={tx} x2={tx} y1={py} y2={ty} stroke={RED} strokeOpacity="0.75" strokeDasharray="2 3" />
                  <circle cx={px} cy={py} r="3.5" fill={RED} />
                  <circle cx={tx} cy={ty} r="4.5" fill={RED} stroke="var(--surface)" strokeWidth="2" />
                  {room >= 130 && <text x={lx} y={ly} textAnchor={wordAnchor} direction={rtl ? "rtl" : "ltr"} fontSize="11" fontWeight="700" fill={RED}>{t("chMaxDD")}</text>}
                  {room >= 130 && <text x={lx} y={ly + 15} textAnchor={numAnchor} direction="ltr" fontSize="12" fontWeight="700" fill={RED} className="tnum">{s.ddText}</text>}
                  {s.ddSub && room >= 270 && <text x={lx} y={ly + 30} textAnchor={wordAnchor} direction={rtl ? "rtl" : "ltr"} fontSize="10.5" fill="var(--muted)">{s.ddSub}</text>}
                </g>
              );
            })}
            {/* Prop-firm rules: max-loss floor (step line when trailing), profit target, days that broke the daily loss limit */}
            {series.map((s, k) => (single || focusId === s.id) && s.guides ? (
              <g key={`gd${s.id}`} pointerEvents="none">
                {s.guides.map((g, j) => {
                  const d = g.pts.map((p, i) => (i ? `H${X(p.t)} V${Y(p.v)}` : `M${X(p.t)} ${Y(p.v)}`)).join(" ");
                  const end = g.pts[g.pts.length - 1];
                  return (
                    <g key={j}>
                      <path d={d} fill="none" stroke={g.color} strokeWidth="1.6" strokeDasharray="7 5" strokeOpacity="0.9" />
                      <text x={X(end.t) - 4} y={Y(end.v) - 6} textAnchor="end" fontSize="10.5" fontWeight="700" fill={g.color}>{g.label}</text>
                    </g>
                  );
                })}
                {(s.alerts ?? []).map((a, j) => {
                  const x = X(a.t), y = Y(lerpAt(drawn[k], a.t));
                  return <g key={`al${j}`} pointerEvents="all"><circle cx={x} cy={y} r="7" fill={RED} opacity="0.18" /><path d={`M${x - 4} ${y - 4} L${x + 4} ${y + 4} M${x + 4} ${y - 4} L${x - 4} ${y + 4}`} stroke={RED} strokeWidth="2.2" strokeLinecap="round"><title>{bidi(a.title)}</title></path></g>;
                })}
              </g>
            ) : null)}
            {/* Deposits / withdrawals on the balance curve */}
            {series.map((s, k) => (s.marks ?? []).map((m, j) => {
              const x = X(m.t), y = Y(lerpAt(drawn[k], m.t));
              const c = m.kind === "deposit" ? GREEN : m.kind === "withdrawal" ? RED : "var(--muted)";
              const shape = m.kind === "deposit" ? `M${x} ${y - 15} l6 9 h-12 Z` : m.kind === "withdrawal" ? `M${x} ${y + 15} l6 -9 h-12 Z` : `M${x} ${y - 16} l5 6 l-5 6 l-5 -6 Z`;
              return (
                <g key={`m${s.id}${j}`} opacity={dim(s.id)}>
                  <line x1={x} x2={x} y1={y} y2={m.kind === "withdrawal" ? y + 6 : y - 6} stroke={c} strokeWidth="1.5" />
                  <path d={shape} fill={c} stroke="var(--surface)" strokeWidth="1"><title>{bidi(m.title)}</title></path>
                </g>
              );
            }))}
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
        <div className={`${pinned != null ? "pointer-events-auto" : "pointer-events-none"} absolute top-3 z-10 min-w-[200px] rounded-xl border border-icon/40 bg-surface/80 px-3 py-2.5 text-xs shadow-2xl backdrop-blur-md`} style={{ left: tipLeft ? undefined : ax + 14, right: tipLeft ? w - ax + 14 : undefined }}>
          {bars ? (
            <>
              <p className="mb-1 text-muted">{bidi(barList[active]?.tip ?? barList[active]?.label ?? "")}{pinned != null ? " 📌" : ""}</p>
              {barList[active]?.sub ? (
                <p className="tnum text-sm font-bold" style={{ color: barList[active]?.color }}>{bidi(barList[active]?.sub ?? "")}</p>
              ) : (
                <>
                  <p className="flex items-center gap-2 py-0.5">
                    <span className="flex-1 font-medium">{t("pnl")}</span>
                    <span className="tnum text-sm font-bold" style={{ color: (barList[active]?.v ?? 0) >= 0 ? GREEN : RED }}>{money(barList[active]?.v ?? 0)}</span>
                  </p>
                  <p className="text-muted">{barList[active]?.n} {t("monthTrades")}</p>
                </>
              )}
              {pinned != null && onOpenDay && /^\d{4}-\d{2}-\d{2}$/.test(barList[active]?.key ?? "") && (
                <button type="button" onClick={() => onOpenDay(0, single ? series[0].id : null, barList[active]?.key)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-1.5 text-xs font-semibold text-on-primary">{t("chOpenDay")}<ArrowRight size={13} className="rtl:rotate-180" /></button>
              )}
            </>
          ) : (
            <>
              <p className="mb-1 text-muted">{fmtDate(active)}{xFmt ? "" : " · UTC"}{pinned != null ? " 📌" : ""}</p>
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
              {hoverSeries.map((s) => s.band ? <p key={`b${s.id}`} className="flex justify-between gap-3 text-muted"><span>{t("chMcBand")}</span><span className="tnum">{money(lerpAt(s.band.lo, active))} … {money(lerpAt(s.band.hi, active))}</span></p> : null)}
              {hoverSeries.length === 1 && kind === "line" && fromStart && (() => {
                const d = valueAt(hoverSeries[0].pts, active) - hoverSeries[0].pts[0].v;
                return <p className="mt-1 flex justify-between border-t border-border pt-1 text-muted"><span>{t("chFromStart")}</span><span className="tnum font-semibold" style={{ color: d >= 0 ? GREEN : RED }}>{!pct && d > 0 ? "+" : ""}{money(d)}</span></p>;
              })()}
              {pinned != null && onOpenDay && !xFmt && (
                <button type="button" onClick={() => onOpenDay(active, focusId ?? (single ? series[0].id : null))} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-1.5 text-xs font-semibold text-on-primary">{t("chOpenDay")}<ArrowRight size={13} className="rtl:rotate-180" /></button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const weekStart = (t0: number) => { const d = new Date(t0); const wd = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd); };

export default function ChartsView({ t, lang, accounts, trades, balances, flows = [], onOpenDay }: Props) {
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
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=dialog] [role=menu]") && setOpen(null); // Esc closes an open menu first
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
  const metric: Metric = !byAcc && (st.metric === "balance" || st.metric === "prop") ? "profit" : st.metric; // balance and prop rules only make sense per account
  const balanceLike = metric === "balance" || metric === "prop"; // both draw the balance curve
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

  // Visible window: preset ranges end now; a custom range has both ends (inclusive days, UTC like the rest of the chart).
  const { cutoff, until } = useMemo(() => {
    const d = new Date();
    if (st.range === "custom") return st.from && st.to ? { cutoff: Date.parse(`${st.from}T00:00Z`), until: Date.parse(`${st.to}T00:00Z`) + DAY - 1 } : { cutoff: null, until: null };
    if (st.range === "all") return { cutoff: null, until: null };
    if (st.range === "YTD") return { cutoff: Date.UTC(d.getUTCFullYear(), 0, 1), until: null };
    const m = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 }[st.range];
    return { cutoff: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m, d.getUTCDate()), until: null };
  }, [st.range, st.from, st.to]);
  const inRange = (tm: number) => (cutoff == null || tm >= cutoff) && (until == null || tm <= until);

  const WD = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i)))), [lang]);
  const bucketOf = (x: Trade): { key: string; label: string } => {
    const e = ts(x.exitTime);
    const open = ts(x.entryTime ?? x.exitTime) || e; // behaviour buckets (session, weekday, hour) use the entry time
    if (st.bucket === "session") {
      const h = new Date(open).getUTCHours();
      const k = h < 7 ? "sessTK" : h < 13 ? "sessLN" : h < 21 ? "sessNY" : "sessSY";
      return { key: k, label: t(k as Key) };
    }
    if (st.bucket === "weekday") { const wd = (new Date(open).getUTCDay() + 6) % 7; return { key: String(wd + 1), label: WD[wd] }; }
    if (st.bucket === "hour") { const h = String(new Date(open).getUTCHours()).padStart(2, "0"); return { key: h, label: `${h}h` }; }
    if (st.bucket === "side") return { key: x.side, label: t(x.side) };
    const d = new Date(st.bucket === "week" ? weekStart(e) : e);
    const key = st.bucket === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat(lang, st.bucket === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
    return { key, label };
  };

  // Balance curve of one account (same source as the account card): imported history + later trades/flows, else start balance + P&L + cash flows.
  const accountBalance = (a: Account): Pt[] => balanceSeries(a, closed, balances[a.id] ?? [], flows).map((p) => ({ t: ts(p.t), v: p.v })).filter((p) => !isNaN(p.t));
  const flowT = (f: CashFlow) => ts(f.t.trim().replace(" ", "T").slice(0, 16));
  const flowLabel = (k: CashFlow["type"]) => t(({ deposit: "chFlowDeposit", withdrawal: "chFlowWithdrawal", credit: "chFlowCredit", adjustment: "chFlowAdjustment" } as const)[k]);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }), [lang]);

  const startSum = accsInView.reduce((a, x) => a + (x.startBalance || 0), 0);
  const rawSeries: Series[] = useMemo(() => {
    return chosen
      .map((id): Series => {
        const list = scope
          .filter((x) => id === ALL || (byAcc ? x.accountId === id : x.symbol === id))
          .sort((a, b) => ts(a.exitTime) - ts(b.exitTime));
        const color = colorOf(id);
        const name = nameOf(id);
        const shown = list.filter((x) => inRange(ts(x.exitTime)));
        const cs = computeStats(shown);
        const stats: Stats = { net: cs.net, n: shown.length, winRate: cs.winRate, pf: cs.profitFactor };
        const base = id !== ALL && byAcc ? accounts.find((a) => a.id === id)?.startBalance ?? 0 : startSum;

        if (metric === "periods") {
          const m = new Map<string, Bar>();
          for (const x of shown) {
            const b = bucketOf(x);
            const cur = m.get(b.key) ?? { key: b.key, label: b.label, v: 0, n: 0 };
            cur.v += x.pnl as number; cur.n++;
            m.set(b.key, cur);
          }
          const bars = [...m.values()].sort((a, b) => (st.bucket === "session" ? 0 : a.key.localeCompare(b.key)));
          return { id, name, color, pts: [], bars, stats, base };
        }
        if (metric === "dist") {
          const bins = histogram(shown.map((x) => x.pnl as number));
          const bars: Bar[] = bins.map((b, i) => ({
            key: String(i), v: b.count, n: b.count,
            label: b.edge === "under" ? `<${fmt(b.hi, 0)}` : b.edge === "over" ? `≥${fmt(b.lo, 0)}` : fmt(b.lo, 0),
            color: b.hi <= 0 ? RED : b.lo >= 0 ? GREEN : "var(--muted)",
            tip: b.edge === "under" ? `< ${moneyBase(b.hi)}` : b.edge === "over" ? `≥ ${moneyBase(b.lo)}` : `${moneyBase(b.lo)} … ${moneyBase(b.hi)}`,
            sub: `${b.count} ${t("chInBin")}`,
          }));
          const sorted = shown.map((x) => x.pnl as number).sort((a, b) => a - b);
          const median = sorted.length ? (sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
          const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
          return { id, name, color, pts: [], bars, stats, base, median, dInfo: { avgWin: avg(sorted.filter((v) => Math.round(v * 100) > 0)), avgLoss: avg(sorted.filter((v) => Math.round(v * 100) < 0)) } };
        }
        if (metric === "mc") {
          const sim = monteCarlo(shown.map((x) => x.pnl as number), { paths: 1000, horizon: Math.min(500, Math.max(shown.length, 20)), seed: 42 });
          if (!sim) return { id, name, color, pts: [], bars: [], stats, base };
          const line = (vals: number[]) => [{ t: 0, v: 0 }, ...sim.steps.map((k, i) => ({ t: k, v: vals[i] }))];
          return { id, name, color, pts: line(sim.p50), bars: [], stats, base, band: { lo: line(sim.p5), hi: line(sim.p95) }, mc: sim };
        }
        if (metric === "whatif") {
          const wi = applyWhatIf(shown, st.whatIf), ws = labStats(wi), as = labStats(shown);
          return { id, name, color, pts: cumCurve(shown), bars: [], stats: { ...stats, maxDD: as.maxDD }, base, twin: { pts: cumCurve(wi), stats: { net: ws.net, n: ws.n, winRate: ws.winRate, pf: ws.pf, maxDD: ws.maxDD } }, ideas: findRules(shown) };
        }
        if (metric === "heat") return { id, name, color, pts: [], bars: [], stats, base, heat: heatmap(shown) };
        if (metric === "rmult") {
          const rs = shown.map(rMultiple).filter((x): x is number => x != null);
          const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
          const bars: Bar[] = histogram(rs).map((b, i) => ({
            key: String(i), v: b.count, n: b.count,
            label: b.edge === "under" ? `<${fmt(b.hi, 1)}R` : b.edge === "over" ? `≥${fmt(b.lo, 1)}R` : `${fmt(b.lo, 1)}R`,
            color: b.hi <= 0 ? RED : b.lo >= 0 ? GREEN : "var(--muted)",
            tip: b.edge === "under" ? `< ${fmt(b.hi, 2)}R` : b.edge === "over" ? `≥ ${fmt(b.lo, 2)}R` : `${fmt(b.lo, 2)}R … ${fmt(b.hi, 2)}R`,
            sub: `${b.count} ${t("chInBin")}`,
          }));
          return { id, name, color, pts: [], bars, stats, base, rInfo: { n: rs.length, total: shown.length, avg: mean(rs), avgWin: mean(rs.filter((r) => r > 0)), avgLoss: mean(rs.filter((r) => r < 0)) } };
        }
        if (metric === "size") {
          // "Your risk" needs one account's balance: the account of this curve, or the only account in view (whole history).
          const own = byAcc && id !== ALL ? accounts.find((a) => a.id === id) : accsInView.length === 1 ? accsInView[0] : undefined;
          const sz = sizing(shown.map(rMultiple).filter((x): x is number => x != null), { current: own ? currentRisk(closed.filter((x) => x.accountId === own.id), own.startBalance) : null });
          if (!sz) return { id, name, color, pts: [], bars: [], stats, base };
          const stem = (f: number, c: string, lbl: string) => ({ pts: [{ t: f * 100, v: 0 }, { t: f * 100, v: lerpAt(sz.curve, f * 100) }], color: c, label: lbl }); // from 0 growth up to the curve
          const guides = sz.kelly > 0 ? [stem(sz.quarter.f, "#60a5fa", t("chQuarterKelly")), stem(sz.half.f, GREEN, t("chHalfKelly")), stem(sz.kelly, RED, t("chKelly")), ...(sz.current ? [stem(sz.current.f, "var(--muted)", t("chYourRisk"))] : [])] : [];
          return { id, name, color, pts: sz.curve, bars: [], stats, base, size: sz, guides };
        }
        if (metric === "tilt") {
          const g = tiltSplit(shown, st.tiltMin);
          const grp = (key: string, lbl: string, list: Trade[], c: string): Bar => {
            const x = labStats(list);
            // average per trade: the groups differ a lot in size
            return { key, label: lbl, v: x.n ? x.net / x.n : 0, n: x.n, color: c, tip: lbl, sub: `${x.n} ${t("monthTrades")} · ${x.winRate == null ? "—" : `${fmt(x.winRate, 0)}%`} · ${t("chAvg")} ${x.n ? moneyBase(x.net / x.n) : "—"} · ${t("pnl")} ${moneyBase(x.net)}` };
          };
          const after = labStats([...g.afterLoss, ...g.afterLossBigger]), normal = labStats(g.normal);
          const bars = [grp("normal", t("chTiltNormal"), g.normal, "#60a5fa"), grp("after", `${t("chTiltAfter")} (≤${st.tiltMin} ${t("chMinutes")})`, g.afterLoss, "#fb923c"), grp("bigger", t("chTiltBigger"), g.afterLossBigger, RED)];
          return { id, name, color, pts: [], bars, stats, base, tilt: { normal: { n: normal.n, net: normal.net }, after: { n: after.n, net: after.net } } };
        }

        let pts: Pt[] = [];
        if (metric === "rolling") {
          pts = rollingSeries(list.map((x) => ({ t: ts(x.exitTime), pnl: x.pnl as number })), st.rollN, st.roll).filter((p) => inRange(p.t)); // windows reach back before the range start
        } else if (balanceLike) {
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
        if (metric !== "rolling" && cutoff != null && pts.length) pts = [{ t: cutoff, v: valueAt(pts, cutoff) }, ...pts.filter((p) => p.t > cutoff)];
        if (until != null) pts = pts.filter((p) => p.t <= until);

        // Deposits / withdrawals of the accounts behind this curve (balance view only).
        const sFlows = balanceLike ? flows.filter((f) => (byAcc && id !== ALL ? f.accountId === id : accsInView.some((a) => a.id === f.accountId)) && Number.isFinite(f.amount) && f.amount !== 0) : [];
        const marks: Mark[] = sFlows.map((f) => ({ t: flowT(f), kind: f.type, title: `${flowLabel(f.type)} ${hideMoney ? "••••" : fmtMoney(signed(f), { cents: true, sign: true, currency })} · ${dayFmt.format(new Date(flowT(f)))}` }))
          .filter((m) => !isNaN(m.t) && pts.length > 0 && m.t >= pts[0].t && m.t <= pts[pts.length - 1].t);

        // Max drawdown window (profit: start balance + cumulative P&L; balance: the curve, flows excluded).
        let dd: DdWindow | null = null, ddText: string | undefined, ddSub: string | undefined;
        if ((metric === "profit" || metric === "balance") && pts.length > 1) {
          const flowAt = pts.map(() => 0);
          for (const f of sFlows) { const ft = flowT(f), i = pts.findIndex((p) => p.t >= ft); if (i > 0) flowAt[i] += signed(f); }
          dd = maxDrawdownWindow(pts.map((p) => p.t), pts.map((p) => (metric === "profit" ? base + p.v : p.v)), flowAt);
          if (dd) {
            ddText = dd.pct != null ? `-${fmt(dd.pct, 1)}%${hideMoney ? "" : ` (${fmtMoney(-dd.amount, { currency })})`}` : hideMoney ? "••••" : fmtMoney(-dd.amount, { currency });
            ddSub = `${dayFmt.format(new Date(dd.peakT))} ${lang === "ar" ? "←" : "→"} ${dayFmt.format(new Date(dd.troughT))} · ${dd.recoverT != null ? `${t("chRecovered")} ${dayFmt.format(new Date(dd.recoverT))}` : t("chUnderwater")}`;
          }
        }
        // Prop-firm rules on the balance curve: max-loss floor, profit target, days that broke the daily loss limit.
        let prop: PropResult | null = null, guides: Series["guides"], alerts: Series["alerts"], propNote: Series["propNote"], odds: PropOdds | null = null;
        if (metric === "prop" && pts.length > 1 && (id !== ALL || accsInView.length === 1)) { // a prop firm judges each account on its own
          prop = propCheck(pts, shown, base, st.prop);
          if (prop) {
            guides = [
              ...(st.prop.maxDDPct > 0 ? [{ pts: prop.floor, color: RED, label: t("chPropFloor") }] : []),
              ...(st.prop.targetPct > 0 ? [{ pts: [{ t: pts[0].t, v: prop.target }, { t: pts[pts.length - 1].t, v: prop.target }], color: GREEN, label: t("chPropTarget") }] : []),
            ];
            alerts = prop.dailyBreaches.map((b) => ({ t: b.t, title: `${t("chPropDayBreach")} · ${dayFmt.format(new Date(b.t))} · ${hideMoney ? "••••" : fmtMoney(b.pnl, { currency })}` }));
            propNote = prop.status === "passed" && prop.targetT != null ? { tone: "ok", text: `${t("chPropPassed")} · ${dayFmt.format(new Date(prop.targetT))}` }
              : prop.status === "failed" && prop.failT != null ? { tone: "bad", text: `${t("chPropFailed")} ${dayFmt.format(new Date(prop.failT))} · ${t(prop.failT === prop.floorBreachT ? "chPropFloor" : "chPropDayBreach")}` }
              : { tone: "info", text: [t("chPropActive"), ...(st.prop.maxDDPct > 0 ? [`${moneyBase(prop.toFloor)} ${t("chPropToFloor")}`] : []), ...(st.prop.targetPct > 0 ? [`${moneyBase(prop.toTarget)} ${t("chPropToTarget")}`] : [])].join(" · ") };
            odds = propOdds(shown, base, st.prop, { horizon: st.propDays || 250 }); // a new attempt, trading like in this period
          }
        }
        return { id, name, color, pts, bars: [], stats, base, dd, ddText, ddSub, marks, prop, propNote, guides, alerts, odds };
      })
      .filter((s) => (metric === "heat" ? (s.heat ?? []).some((r) => r.some((c) => c.n > 0)) : metric === "periods" || metric === "dist" || metric === "rmult" || metric === "tilt" ? s.bars.some((b) => b.n > 0) : s.pts.length > 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, chosen.join("|"), metric, st.colors, st.bucket, st.roll, st.rollN, st.whatIf, st.tiltMin, st.prop, st.propDays, cutoff, until, balances, flows, acc, byAcc, lang, accounts, startSum, hideMoney, currency]);

  // $ / % : percent is relative to the starting balance (balance view: change since the start). Rolling / distribution / simulation have their own units.
  const unitless = metric === "rolling" || metric === "dist" || metric === "mc" || metric === "heat" || metric === "rmult" || metric === "tilt" || metric === "size";
  const canPct = !unitless && rawSeries.length > 0 && rawSeries.every((x) => x.base > 0);
  const pctMode = st.unit === "pct" && canPct;
  const series: Series[] = useMemo(() => {
    // What-if: the first selected curve, actual vs with the rules (two lines, same scale).
    const src = metric === "whatif" && rawSeries[0]?.twin
      ? [{ ...rawSeries[0], name: `${rawSeries[0].name} · ${t("chActual")}` }, { ...rawSeries[0], id: `${rawSeries[0].id}:wi`, name: `${rawSeries[0].name} · ${t("chWhatIf")}`, color: rawSeries[0].color === "#a78bfa" ? "#60a5fa" : "#a78bfa", pts: rawSeries[0].twin.pts, stats: rawSeries[0].twin.stats, twin: undefined }].filter((x) => x.pts.length > 1)
      : rawSeries;
    if (!pctMode) return src;
    const f = (x: Series, v: number) => (balanceLike ? ((v - x.base) / x.base) * 100 : (v / x.base) * 100);
    return src.map((x) => ({ ...x, pts: x.pts.map((p) => ({ t: p.t, v: f(x, p.v) })), bars: x.bars.map((b) => ({ ...b, v: f(x, b.v) })), guides: x.guides?.map((g) => ({ ...g, pts: g.pts.map((p) => ({ t: p.t, v: f(x, p.v) })) })) }));
  }, [rawSeries, pctMode, metric, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const rollFmt = st.roll === "win" ? (n: number) => `${fmt(n, 1)}%` : st.roll === "pf" ? (n: number) => fmt(n, 2) : moneyBase;
  const rFmt = (n: number) => `${n > 0 ? "+" : ""}${fmt(n, 2)}R`;
  const growthFmt = (n: number) => `${n > 0 ? "+" : ""}${fmt(n, Math.abs(n) >= 100 ? 0 : 1)}%`;
  const money = metric === "rolling" ? rollFmt : metric === "rmult" ? rFmt : metric === "size" ? growthFmt : pctMode ? (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}%` : moneyBase;

  // ----- the answer: what the big number is, a few labelled facts, how to read the chart -----
  const head = series[0];
  const startAll = startSum;
  const bidi = (x: string) => (lang === "ar" ? ltrNumbers(x) : x); // Arabic text with numbers: keep "59$" in reading order
  const signedMoney = (n: number) => (hideMoney ? "••••" : fmtMoney(n, { sign: true, currency }));
  const hh = (h: number) => `${String(h).padStart(2, "0")}h`;
  let headVal = 0, pct: number | null = null, answer: string | null = null, caption = "", hint = "";
  let facts: Fact[] = [];
  if (head) {
    if (metric === "periods") {
      headVal = head.bars.reduce((a, b) => a + b.v, 0);
      pct = startAll ? (headVal / startAll) * 100 : null;
      const best = head.bars.reduce((a, b) => (b.v > a.v ? b : a), head.bars[0]), worst = head.bars.reduce((a, b) => (b.v < a.v ? b : a), head.bars[0]);
      caption = t("chCapPeriods");
      facts = [{ label: t("chFPosPeriods"), value: `${head.bars.filter((b) => b.v > 0).length}/${head.bars.length}` },
        ...(best && best.v > 0 ? [{ label: t("chFBestPeriod"), value: `${best.label}  ${money(best.v)}`, tone: "pos" as const }] : []),
        ...(worst && worst.v < 0 ? [{ label: t("chFWorstPeriod"), value: `${worst.label}  ${money(worst.v)}`, tone: "neg" as const }] : [])];
      hint = t("chHintPeriods");
    } else if (metric === "dist") {
      headVal = head.median ?? 0;
      caption = t("chMedianTrade");
      facts = [{ label: t("chFWinners"), value: head.stats.winRate == null ? "—" : `${fmt(head.stats.winRate, 1)}%` },
        { label: t("chFAvgWin"), value: head.dInfo?.avgWin == null ? "—" : moneyBase(head.dInfo.avgWin), tone: "pos" },
        { label: t("chFAvgLoss"), value: head.dInfo?.avgLoss == null ? "—" : moneyBase(head.dInfo.avgLoss), tone: "neg" }];
      hint = t("chHintDist");
    } else if (metric === "mc") {
      const m = head.mc;
      headVal = m?.finalP50 ?? 0;
      pct = startAll && m ? (headVal / startAll) * 100 : null;
      caption = t("chCapMC").replace("{x}", String(m?.horizon ?? 0));
      if (m) facts = [{ label: t("chMcProb"), value: `${fmt(m.probProfit, 0)}%` }, { label: t("chMcBand"), value: `${money(m.finalP5)} … ${money(m.finalP95)}` },
        { label: t("chMcDD"), value: money(-m.ddMedian), tone: "neg" }, { label: t("chMcDD95"), value: money(-m.ddP95), tone: "neg" }];
      hint = t("chMcNote");
    } else if (metric === "whatif") {
      // Facts in money even when the lines are in % (stats are never converted); no what-if line = the rules removed every trade.
      const act = rawSeries[0], w = act.twin?.stats, d = (w?.net ?? 0) - act.stats.net;
      headVal = series[1]?.pts[series[1].pts.length - 1]?.v ?? 0;
      caption = t("chCapWhatIf");
      facts = [{ label: t("chFVsActual"), value: signedMoney(d), tone: d > 0.005 ? "pos" : d < -0.005 ? "neg" : undefined }, { label: t("chFActual"), value: moneyBase(act.stats.net) },
        { label: t("chFDDRules"), value: `${moneyBase(-(w?.maxDD ?? 0))} / ${moneyBase(-(act.stats.maxDD ?? 0))}` }, { label: t("chFKept"), value: `${w?.n ?? 0}/${act.stats.n}` }];
      hint = t("chWhatIfHint");
    } else if (metric === "heat") {
      const cells = (head.heat ?? []).flatMap((r, d) => r.map((c, h) => ({ ...c, d, h }))).filter((c) => c.n > 0);
      const best = cells.reduce((a, c) => (c.net > a.net ? c : a), cells[0]), worst = cells.reduce((a, c) => (c.net < a.net ? c : a), cells[0]);
      headVal = best?.net ?? 0;
      caption = best ? t("chCapHeat").replace("{x}", `${WD[best.d]} ${hh(best.h)}`) : "";
      if (worst) facts = [{ label: t("chFWorstSlot"), value: `${WD[worst.d]} ${hh(worst.h)}  ${money(worst.net)}`, tone: worst.net < 0 ? "neg" : undefined }];
      hint = t("chHeatHint");
    } else if (metric === "rmult") {
      const r = head.rInfo;
      headVal = r?.avg ?? 0;
      caption = t("chCapRmult");
      if (r) facts = [{ label: t("chFWithSL"), value: `${r.n}/${r.total}` }, { label: t("chFAvgWin"), value: r.avgWin == null ? "—" : rFmt(r.avgWin), tone: "pos" },
        { label: t("chFAvgLoss"), value: r.avgLoss == null ? "—" : rFmt(r.avgLoss), tone: "neg" }];
      hint = t("chRHint");
    } else if (metric === "tilt") {
      const x = head.tilt, after = x && x.after.n ? x.after.net / x.after.n : null, other = x && x.normal.n ? x.normal.net / x.normal.n : null;
      headVal = after ?? 0;
      caption = t("chCapTilt");
      if (x) facts = [{ label: t("chFAfterLoss"), value: String(x.after.n) }, { label: t("chFNormalAvg"), value: other == null ? "—" : moneyBase(other) },
        ...(after != null && other != null ? [{ label: t("chFDiff"), value: signedMoney(after - other), tone: after < other ? "neg" as const : "pos" as const }] : [])];
      hint = t("chTiltHint");
    } else if (metric === "size") {
      const z = head.size;
      headVal = z ? z.half.f * 100 : 0;
      answer = `${fmt(headVal, 2)}%`;
      caption = z && z.kelly > 0 ? t("chCapSize") : t("chNoEdge");
      if (z) facts = [...(z.kelly > 0 ? [{ label: t("chFKelly"), value: `${fmt(z.kelly * 100, 2)}%${z.capped ? ` (${t("chKellyCap")})` : ""}` }] : []),
        ...(z.current ? [{ label: t("chFYourRisk"), value: `≈ ${fmt(z.current.f * 100, 2)}%` }] : []), { label: t("chFWithSL"), value: String(z.n) }];
      hint = t("chSizeHint");
    } else if (metric === "rolling") {
      const vs = head.pts.map((p) => p.v);
      headVal = vs[vs.length - 1];
      caption = t("chCapRolling").replace("{x}", String(st.rollN));
      facts = [{ label: t("chFLowest"), value: money(Math.min(...vs)) }, { label: t("chFHighest"), value: money(Math.max(...vs)) }];
      hint = t("chRollHint");
    } else if (metric === "drawdown") {
      headVal = Math.min(...head.pts.map((p) => p.v));
      pct = startAll ? (headVal / startAll) * 100 : null;
      caption = t("chCapDrawdown");
      const now = head.pts[head.pts.length - 1].v;
      facts = [{ label: t("chFCurrentDD"), value: money(now), tone: now < -0.005 ? "neg" : undefined }];
      hint = t("chHintDrawdown");
    } else if (metric === "prop") {
      const o = head.odds, note = head.propNote;
      headVal = o?.pass ?? 0;
      answer = o ? `${fmt(o.pass, 0)}%` : "—";
      caption = note || o ? t("chPropOdds") : t("chPropPick");
      facts = [...(note ? [{ label: t("chFStatus"), value: note.text, tone: note.tone === "ok" ? "pos" as const : note.tone === "bad" ? "neg" as const : undefined }] : []),
        ...(o ? [{ label: t("chFFail"), value: `${fmt(o.fail, 0)}%` }, ...(o.open >= 0.5 ? [{ label: t("chFOpen"), value: `${fmt(o.open, 0)}%` }] : []), ...(o.medianDays != null ? [{ label: t("chFMedianDays"), value: `${o.medianDays} ${t("chTradingDays")}` }] : [])] : []),
        ...(note || o ? [{ label: t("chCapBalance"), value: moneyBase(rawSeries[0]?.pts[rawSeries[0].pts.length - 1]?.v ?? 0) }] : [])];
      hint = `${t("chPropHint")} ${t("chPropOddsHint")}`;
    } else {
      headVal = head.pts[head.pts.length - 1].v;
      const first = head.pts[0].v;
      pct = metric === "balance" ? (first ? ((headVal - first) / Math.abs(first)) * 100 : null) : startAll ? (headVal / startAll) * 100 : null;
      caption = t(metric === "balance" ? "chCapBalance" : "chCapProfit");
      facts = [...(metric === "balance" ? [{ label: t("chFStart"), value: moneyBase(rawSeries[0]?.pts[0]?.v ?? 0) }] : [{ label: t("chFAvgTrade"), value: head.stats.n ? moneyBase(head.stats.net / head.stats.n) : "—" }]),
        ...(head.ddText ? [{ label: t("chMaxDD"), value: head.ddText, tone: "neg" as const }] : [])];
      hint = t(metric === "balance" ? "chHintBalance" : "chHintProfit");
    }
  }
  if (answer == null) answer = money(headVal);
  const label = (m: Metric) => t(LABEL[m]);
  const lineKind = metric === "drawdown" ? "dd" : "line";
  const isBars = metric === "periods" || metric === "dist" || metric === "rmult" || metric === "tilt";
  const split = (st.split || isBars) && metric !== "whatif"; // what-if compares two lines on one chart
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const value = (s: Series) => (metric === "size" ? (s.size?.half.f ?? 0) * 100 : metric === "dist" ? s.median ?? 0 : metric === "rmult" ? s.rInfo?.avg ?? 0 : metric === "tilt" ? (s.tilt && s.tilt.after.n ? s.tilt.after.net / s.tilt.after.n : 0) : isBars ? s.bars.reduce((a, b) => a + b.v, 0) : metric === "mc" ? s.mc?.finalP50 ?? 0 : metric === "drawdown" ? Math.min(...s.pts.map((p) => p.v)) : s.pts[s.pts.length - 1]?.v ?? 0);
  const valueText = (s: Series) => (metric === "size" ? `${fmt(value(s), 2)}%` : money(value(s))); // position size: the suggested risk, not a growth
  // Chart options per metric: units, reference line, x axis (Monte Carlo runs on trade numbers, position size on risk %).
  const chartOpts = metric === "rolling"
    ? { axisFmt: st.roll === "win" ? (v: number, d: number) => `${fmt(v, d)}%` : st.roll === "pf" ? (v: number, d: number) => fmt(v, Math.max(d, 1)) : undefined, badgeFmt: rollFmt, refLine: st.roll === "win" ? 50 : st.roll === "pf" ? 1 : 0, fromStart: false }
    : metric === "dist" || metric === "rmult" ? { axisFmt: (v: number) => fmt(v, 0) }
    : metric === "mc" ? { xFmt: (x: number) => `${t("chTradeNo")}${Math.round(x)}`, fill: true, fromStart: false }
    : metric === "size" ? { xFmt: (x: number) => `${fmt(x, 2)}%`, axisFmt: (v: number, d: number) => `${fmt(v, d)}%`, fill: true, fromStart: false, refLine: 0, noEnd: true, csvX: ["risk_pct", (x: number) => x.toFixed(3)] as [string, (x: number) => string] }
    : {};
  if (st.range === "custom" && metric !== "mc") Object.assign(chartOpts, { fill: true }); // a closed custom range ends at its last day: no open space with dates beyond it
  const openDay = onOpenDay && !["dist", "mc", "heat", "rmult", "tilt", "size"].includes(metric) && (metric !== "periods" || st.bucket === "day")
    ? (tm: number, sid: string | null, barKey?: string) => onOpenDay(barKey ?? new Date(tm).toISOString().slice(0, 10), byAcc ? (sid && sid !== ALL ? sid : null) : acc !== "all" ? acc : null)
    : undefined;
  const showDD = st.showDD && (metric === "profit" || metric === "balance");
  const [picking, setPicking] = useState(false);
  const todayKey = new Date().toISOString().slice(0, 10);

  const seg = (on: boolean) => `px-3 py-1.5 transition-colors ${on ? "bg-primary text-on-primary" : "hover:text-icon"}`;
  const group = "flex overflow-hidden rounded-lg border border-border text-sm font-semibold";
  const pill = "flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold transition-colors hover:border-icon";
  const sel = "field !min-h-0 !w-auto !py-1.5 text-sm";
  const ctl = "flex items-center gap-2 text-sm";
  const chartH = Math.max(300, vh - 470);
  const oneH = Math.max(300, vh - 500);
  const cardH = Math.max(240, Math.min(300, (vh - 400) / 2));

  // Entry cards: what each workspace holds. Symbol analytics sits on the left, account analytics on the right (regardless of text direction).
  const entry = (m: Mode, Icon: typeof Wallet, title: string, hint: string) => {
    const count = GROUPS.reduce((n, g) => n + g.items.filter((x) => m === "account" || (x !== "balance" && x !== "prop")).length, 0);
    return (
      <button type="button" onClick={() => setOpen(m)} dir={lang === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 text-start transition-colors hover:border-icon">
        <span className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-tint"><Icon size={22} className="text-icon" strokeWidth={1.8} /></span>
          <span><span className="block font-heading text-lg font-bold">{title}</span><span className="block text-sm text-muted">{hint}</span></span>
        </span>
        <span className="flex flex-wrap gap-1.5">{GROUPS.map((g) => <span key={g.key} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">{t(g.key)}</span>)}</span>
        <span className="text-sm font-semibold text-icon">{bidi(`${count} ${t("chAnalysesCount")}`)}</span>
      </button>
    );
  };
  const switcher = (
    <div className="grid gap-4 md:grid-cols-2" dir="ltr">
      {entry("symbol", CandlestickChart, t("chSymAnalytics"), t("chSymHint"))}
      {entry("account", Wallet, t("chAccAnalytics"), t("chAccHint"))}
    </div>
  );

  const pageHead = (
    <div>
      <h1 className="font-heading text-lg font-semibold">{t("charts")}</h1>
      <p className="text-sm text-muted">{t("chLanding")}</p>
    </div>
  );
  if (!open) return <section className="flex flex-col gap-4">{pageHead}{switcher}</section>;

  // ----- workspace: global scope in the top bar, analyses grouped in a rail, one analysis at a time -----
  const available = (items: Metric[]) => items.filter((m) => byAcc || (m !== "balance" && m !== "prop")); // balance and prop rules need accounts
  const modeSwitch = ( // symbols on the left, accounts on the right, whatever the language (same as the launchers)
    <div className={group} role="group" aria-label={t("charts")} dir="ltr">
      {([["symbol", CandlestickChart, "chBySymbol"], ["account", Wallet, "chByAccount"]] as const).map(([m, Icon, k]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setOpen(m)} className={`flex items-center gap-2 ${seg(mode === m)}`}><Icon size={15} strokeWidth={1.9} />{t(k)}</button>
      ))}
    </div>
  );
  const scopeControls = (
    <>
      {!byAcc && accounts.length > 1 && (
        <select className={sel} value={acc} onChange={(e) => setAcc(e.target.value)} aria-label={t("pickAccount")}>
          <option value="all">{t("allAccounts")}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <Dropdown
        label={t(byAcc ? "chByAccount" : "chSymbols")}
        panelClass="w-72 max-h-80 overflow-auto"
        bare
        trigger={<span className={pill}><span className="flex -space-x-1">{chosen.slice(0, 4).map((id) => <span key={id} className="h-2.5 w-2.5 rounded-full ring-2 ring-surface" style={{ background: colorOf(id) }} />)}</span><span className="max-w-[160px] truncate">{chosen.length === 1 ? nameOf(chosen[0]) : `${chosen.length}/${items.length}`}</span><ChevronDown size={14} /></span>}
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
      <select className={sel} value={st.range} aria-label={t("chRange")} onChange={(e) => {
        const r = e.target.value as Range;
        if (r !== "custom") return save({ range: r });
        const from = st.from ?? new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10), to = st.to ?? todayKey;
        save({ range: r, from, to }); setPicking(true);
      }}>
        {RANGES.map((r) => <option key={r} value={r}>{r === "all" ? t("chRangeAll") : r === "custom" ? t("chCustom") : r}</option>)}
      </select>
      {st.range === "custom" && st.from && st.to && (
        <div className="relative">
          <button type="button" onClick={() => setPicking(!picking)} aria-expanded={picking} className={pill}><CalendarRange size={14} className="text-icon" /><span className="tnum" dir="ltr">{st.from} → {st.to}</span></button>
          {picking && <RangePicker lang={lang} value={{ from: st.from, to: st.to }} today={todayKey} onChange={(v) => save({ from: v.from, to: v.to })} onClose={() => setPicking(false)} labels={{ cancel: t("chCancel"), apply: t("chApply") }} />}
        </div>
      )}
    </>
  );
  const navButton = (m: Metric, chip: boolean) => {
    const Icon = ICON[m], on = metric === m;
    return chip ? (
      <button key={m} type="button" aria-current={on ? "true" : undefined} onClick={() => save({ metric: m })} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-icon bg-primary-tint font-semibold" : "border-border text-muted hover:text-text"}`}><Icon size={14} strokeWidth={1.9} className={on ? "text-icon" : ""} />{label(m)}</button>
    ) : (
      <button key={m} type="button" aria-current={on ? "true" : undefined} title={t(QUESTION[m])} onClick={() => save({ metric: m })} className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors ${on ? "bg-primary-tint font-semibold text-text" : "text-muted hover:bg-primary-tint hover:text-text"}`}>
        {on && <span aria-hidden className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-icon" />}
        <Icon size={16} strokeWidth={1.9} className={on ? "text-icon" : ""} />{label(m)}
      </button>
    );
  };
  const rail = (
    <nav aria-label={t("chAnalyses")} className="hidden w-56 shrink-0 overflow-y-auto border-e border-border px-3 py-4 lg:block">
      {GROUPS.map((g) => (
        <div key={g.key} className="mb-4">
          <p className="px-3 pb-1.5 text-xs font-semibold text-muted">{t(g.key)}</p>
          {available(g.items).map((m) => navButton(m, false))}
        </div>
      ))}
    </nav>
  );
  const chips = (
    <nav aria-label={t("chAnalyses")} className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
      {GROUPS.flatMap((g, i) => [...(i ? [<span key={`sep${i}`} aria-hidden className="my-1.5 w-px shrink-0 bg-border" />] : []), ...available(g.items).map((m) => navButton(m, true))])}
    </nav>
  );

  const activeRules = Object.values(st.whatIf).filter((v) => (Array.isArray(v) ? v.length : v)).length;
  const local = (
    <>
      {metric === "periods" && (
        <label className={ctl}><span className="text-muted">{t("chGroupBy")}</span>
          <select className={sel} value={st.bucket} onChange={(e) => save({ bucket: e.target.value as Bucket })}>
            {(["day", "week", "month", "session", "weekday", "hour", "side"] as const).map((b) => <option key={b} value={b}>{t(({ day: "chBucketDay", week: "chBucketWeek", month: "chBucketMonth", session: "chBucketSession", weekday: "chBucketWeekday", hour: "chBucketHour", side: "chBucketSide" } as const)[b])}</option>)}
          </select>
        </label>
      )}
      {metric === "rolling" && (
        <>
          <label className={ctl}><span className="text-muted">{t("chMeasure")}</span>
            <select className={sel} value={st.roll} onChange={(e) => save({ roll: e.target.value as RollKind })}>
              {(["win", "pf", "exp"] as const).map((k) => <option key={k} value={k}>{t(({ win: "chRollWin", pf: "chRollPF", exp: "chRollExp" } as const)[k])}</option>)}
            </select>
          </label>
          <select className={sel} value={st.rollN} onChange={(e) => save({ rollN: Number(e.target.value) })} aria-label={t("chWindow")}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{t("chWindow")} {n} {t("monthTrades")}</option>)}
          </select>
        </>
      )}
      {metric === "whatif" && (
        <Dropdown label={t("chRules")} panelClass="w-80 max-h-[70vh] overflow-auto" bare trigger={<span className={`${pill} ${activeRules ? "!border-icon" : ""}`}><SlidersHorizontal size={14} className="text-icon" />{t("chRules")}{activeRules > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-on-primary tnum">{activeRules}</span>}<ChevronDown size={14} /></span>}>
          {() => <WhatIfPanel rules={st.whatIf} onChange={(whatIf) => save({ whatIf })} symbols={symbols} t={t} weekdays={WD} currency={currency} />}
        </Dropdown>
      )}
      {metric === "tilt" && (
        <label className={ctl}><span className="text-muted">{t("chOpenedWithin")}</span>
          <select className={sel} value={st.tiltMin} onChange={(e) => save({ tiltMin: Number(e.target.value) })}>
            {[10, 30, 60, 120].map((n) => <option key={n} value={n}>{n} {t("chMinutes")}</option>)}
          </select>
        </label>
      )}
      {metric === "heat" && (
        <label className={ctl}><span className="text-muted">{t("chColourBy")}</span>
          <select className={sel} value={st.heatVal} onChange={(e) => save({ heatVal: e.target.value as Saved["heatVal"] })}>
            {(["net", "win", "n"] as const).map((k) => <option key={k} value={k}>{t(({ net: "chHeatNet", win: "chHeatWin", n: "chHeatN" } as const)[k])}</option>)}
          </select>
        </label>
      )}
      {metric === "prop" && (
        <Dropdown label={t("chProp")} panelClass="w-72" bare trigger={<span className={pill}><SlidersHorizontal size={14} className="text-icon" />{t("chProp")}<ChevronDown size={14} /></span>}>
          {() => (
            <div className="flex flex-col gap-2 p-1.5 text-sm">
              {([["dailyLossPct", "chPropDaily"], ["maxDDPct", "chPropMax"], ["targetPct", "chPropTarget"]] as const).map(([k, lbl]) => (
                <label key={k} className="flex items-center justify-between gap-3">
                  <span>{t(lbl)}</span>
                  <span className="flex items-center gap-1" dir="ltr"><input type="number" min={0} max={100} step={0.5} value={st.prop[k]} onChange={(e) => save({ prop: { ...st.prop, [k]: Math.max(0, Number(e.target.value) || 0) } })} className="field !w-20 !py-1 text-end tnum" />%</span>
                </label>
              ))}
              <label className="flex items-center gap-2"><input type="checkbox" checked={st.prop.trailing} onChange={(e) => save({ prop: { ...st.prop, trailing: e.target.checked } })} className="accent-[var(--primary)]" />{t("chPropTrailing")}</label>
              <label className="flex items-center justify-between gap-3"><span>{t("chPropDays")}</span><input type="number" min={0} max={250} step={1} value={st.propDays} onChange={(e) => save({ propDays: Math.max(0, Math.min(250, Math.round(Number(e.target.value) || 0))) })} className="field !w-20 !py-1 text-end tnum" /></label>
            </div>
          )}
        </Dropdown>
      )}
    </>
  );
  const canSplit = series.length > 1 && !isBars && metric !== "whatif" && metric !== "heat";
  const canSmooth = !isBars && !["drawdown", "mc", "size", "heat"].includes(metric);
  const canDD = metric === "profit" || metric === "balance";
  const display = (canSplit || canSmooth || canDD) && (
    <Dropdown label={t("chDisplay")} panelClass="w-64" bare trigger={<span className={pill}>{t("chDisplay")}<ChevronDown size={14} /></span>}>
      {() => (
        <div className="flex flex-col gap-3 p-2 text-sm">
          {canSplit && (
            <div><p className="mb-1.5 text-xs font-semibold text-muted">{t("chLayout")}</p>
              <div className={group} role="group">{[false, true].map((sp) => <button key={String(sp)} type="button" aria-pressed={st.split === sp} onClick={() => save({ split: sp })} className={`flex-1 ${seg(st.split === sp)}`}>{t(sp ? "chSplit" : "chOverlay")}</button>)}</div>
            </div>
          )}
          {canSmooth && (
            <div><p className="mb-1.5 text-xs font-semibold text-muted">{t("chLineStyle")}</p>
              <div className={group} role="group">{[true, false].map((sm) => <button key={String(sm)} type="button" aria-pressed={st.smooth === sm} onClick={() => save({ smooth: sm })} className={`flex-1 ${seg(st.smooth === sm)}`}>{t(sm ? "chSmooth" : "chStep")}</button>)}</div>
            </div>
          )}
          {canDD && <label className="flex items-center gap-2"><input type="checkbox" checked={st.showDD} onChange={(e) => save({ showDD: e.target.checked })} className="accent-[var(--primary)]" />{t("chShowDDL")}</label>}
        </div>
      )}
    </Dropdown>
  );
  const units = !unitless && (
    <div className={group} role="group" title={canPct ? undefined : t("chNeedStart")}>
      {(["money", "pct"] as const).map((u) => (
        <button key={u} type="button" disabled={u === "pct" && !canPct} aria-pressed={(u === "pct") === pctMode} onClick={() => save({ unit: u })} className={`${seg((u === "pct") === pctMode)} disabled:cursor-not-allowed disabled:opacity-40`}>{u === "money" ? (currency === "USD" ? "$" : currency ?? "$") : "%"}</button>
      ))}
    </div>
  );
  const hasLocal = ["periods", "rolling", "whatif", "tilt", "heat", "prop"].includes(metric);
  const propPick = metric === "prop" && series.length > 0 && !series.some((x) => x.propNote || x.odds); // combined accounts: ask for one
  const noData = metric === "size" && scope.some((x) => inRange(ts(x.exitTime))) ? "chNeed20SL" : metric === "rmult" && scope.some((x) => inRange(ts(x.exitTime))) ? "chNoSL" : "chNoData";

  return (
    <>
      {/* placeholder keeps the page layout while the analysis covers the screen */}
      <section className="flex flex-col gap-4">{pageHead}{switcher}</section>
      {/* Portal: the animated page wrapper (transform/filter) would otherwise become the overlay's containing block and clip it. */}
      {createPortal(<div className="fixed inset-0 z-[60] flex flex-col bg-bg" role="dialog" aria-label={t("charts")}>
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="font-heading text-lg font-bold">{t("charts")}</h2>
          {modeSwitch}
          <div className="order-last flex w-full flex-wrap items-center gap-2 sm:order-none sm:ms-auto sm:w-auto">{scopeControls}</div>
          <button type="button" onClick={() => setOpen(null)} className="icon-btn ms-auto sm:ms-0" aria-label={t("chClose")} title={t("chClose")}><X size={20} className="text-icon" /></button>
        </header>

        <div className="flex min-h-0 flex-1">
          {rail}
          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {chips}
            <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="font-heading text-2xl font-bold">{label(metric)}</h3>
              <p className="mt-1 text-sm text-muted">{t(QUESTION[metric])}</p>

              {head && !propPick && (
                <div className="mt-5 flex flex-wrap items-end gap-x-12 gap-y-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {series.length > 1 && metric !== "whatif" && <span className="flex items-center gap-1.5 font-semibold text-text" dir="ltr"><span className="h-2 w-2 rounded-full" style={{ background: head.color }} />{head.name}</span>}
                      <span>{bidi(caption)}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-3">
                      <span className={`font-heading text-4xl font-bold tnum ${headVal < 0 && metric !== "size" && metric !== "prop" ? "text-[#f87171]" : ""}`} dir="ltr">{answer}</span>
                      {pct != null && !pctMode && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pct >= 0 ? "bg-primary-tint text-icon" : "bg-[#f87171]/15 text-[#f87171]"}`} dir="ltr">{pct >= 0 ? "+" : ""}{fmt(pct)}%</span>}
                    </p>
                  </div>
                  {facts.length > 0 && (
                    <dl className="flex flex-wrap gap-x-10 gap-y-3 pb-1">
                      {facts.map((f) => (
                        <div key={f.label} className="min-w-0">
                          <dt className="text-xs text-muted">{f.label}</dt>
                          <dd className="mt-0.5 text-sm font-semibold" style={f.tone ? { color: f.tone === "pos" ? GREEN : RED } : undefined}>{bidi(f.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}

              {(hasLocal || units || display) && (
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  {local}
                  {!propPick && <div className="ms-auto flex flex-wrap items-center gap-2">{units}{display}</div>}
                </div>
              )}

              {series.length === 0 ? (
                <p className="py-24 text-center text-sm text-muted">{t(noData)}</p>
              ) : propPick ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                  <ShieldCheck size={36} strokeWidth={1.5} className="text-icon" />
                  <p className="max-w-md text-sm text-muted">{t("chPropPick")}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {accounts.map((a) => <button key={a.id} type="button" onClick={() => setChosen([a.id])} className={pill}><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(a.id) }} />{a.name}</button>)}
                  </div>
                </div>
              ) : metric === "heat" ? (
                <div className="mt-4 flex flex-col gap-6">
                  {series.map((s) => (
                    <div key={s.id}>
                      {series.length > 1 && <p className="mb-2 flex items-center gap-2 text-sm font-bold" dir="ltr"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</p>}
                      <Heatmap cells={s.heat ?? []} mode={st.heatVal} money={moneyBase} weekdays={WD} t={t} rtl={lang === "ar"} />
                      <StatsRow s={s} money={moneyBase} t={t} rtl={lang === "ar"} />
                    </div>
                  ))}
                </div>
              ) : split ? (
                <div className={`mt-4 grid gap-4 ${series.length > 1 ? "lg:grid-cols-2" : ""}`}>
                  {series.map((s) => (
                    <div key={s.id} className={series.length > 1 ? "rounded-xl border border-border p-3" : ""}>
                      {series.length > 1 && (
                        <p className="mb-1 flex items-center gap-2 text-sm font-bold" dir="ltr"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}
                          <span className="ms-auto tnum" style={{ color: isBars ? (value(s) >= 0 ? GREEN : RED) : s.color }}>{valueText(s)}</span></p>
                      )}
                      <Chart series={[s]} lang={lang} money={money} cur={currencySuffix(currency)} pct={pctMode} height={series.length > 1 ? cardH : oneH} label={label(metric)} title={`${label(metric)} ${s.name}`} smooth={st.smooth && metric !== "mc" && metric !== "size"} kind={isBars ? "bars" : lineKind} t={t} {...chartOpts} showDD={showDD} onOpenDay={openDay} />
                      <StatsRow s={s} money={moneyBase} t={t} rtl={lang === "ar"} />
                      {s.size && s.size.kelly > 0 && <SizeTable z={s.size} t={t} rtl={lang === "ar"} />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  {metric === "whatif" && rawSeries[0] && (
                    <div className="mb-4"><GoldenRules ideas={rawSeries[0].ideas ?? []} base={rawSeries[0].stats.maxDD ?? 0} current={st.whatIf} onApply={(whatIf) => save({ whatIf })} t={t} money={moneyBase} weekdays={WD} rtl={lang === "ar"} /></div>
                  )}
                  <Chart series={series} lang={lang} money={money} cur={currencySuffix(currency)} pct={pctMode} height={chartH} label={label(metric)} title={`${label(metric)} · ${series.map((s) => s.name).join(", ")}`} smooth={st.smooth && metric !== "mc" && metric !== "size"} kind={lineKind} t={t} {...chartOpts} showDD={showDD} onOpenDay={openDay} />
                  {series.length > 1 ? (
                    <div className="mt-3 flex flex-col">
                      {series.map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border py-2.5" dir="ltr">
                          <span className="flex min-w-[130px] items-center gap-2 text-sm font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>
                          <span className="tnum text-sm font-bold" style={{ color: s.color }}>{valueText(s)}</span>
                          <StatsRow s={s} money={moneyBase} t={t} rtl={lang === "ar"} inline />
                          {s.size && s.size.kelly > 0 && <div className="w-full"><SizeTable z={s.size} t={t} rtl={lang === "ar"} /></div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <StatsRow s={series[0]} money={moneyBase} t={t} rtl={lang === "ar"} extra={false} />
                      {series[0].size && series[0].size.kelly > 0 && <SizeTable z={series[0].size} t={t} rtl={lang === "ar"} />}
                    </>
                  )}
                </div>
              )}

              {hint && (
                <details className="group mt-6 border-t border-border pt-3 text-sm">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-2 font-semibold text-muted hover:text-text [&::-webkit-details-marker]:hidden"><Info size={15} className="text-icon" />{t("chHowRead")}<ChevronDown size={14} className="transition-transform group-open:rotate-180" /></summary>
                  <p className="mt-2 max-w-[75ch] leading-relaxed text-muted">{bidi(hint)}</p>
                </details>
              )}
            </div>
          </main>
        </div>
      </div>, document.body)}
    </>
  );
}

function StatsRow({ s, money, t, inline, rtl, extra = true }: { s: Series; money: (n: number) => string; t: (k: Key) => string; inline?: boolean; rtl?: boolean; extra?: boolean }) {
  const chip = "flex items-baseline gap-1.5 text-xs";
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 ${inline ? "" : "mt-2 border-t border-border pt-2"}`} dir="ltr">
      <span className={chip}><span className="text-muted">{t("pnl")}</span><span className="tnum font-semibold" style={{ color: s.stats.net >= 0 ? GREEN : RED }}>{money(s.stats.net)}</span></span>
      <span className={chip}><span className="text-muted">{t("chFTrades")}</span><span className="tnum font-semibold">{s.stats.n}</span></span>
      <span className={chip}><span className="text-muted">{t("chWinRate")}</span><span className="tnum font-semibold">{s.stats.winRate == null ? "—" : `${fmt(s.stats.winRate, 1)}%`}</span></span>
      <span className={chip}><span className="text-muted">{t("chPF")}</span><span className="tnum font-semibold">{s.stats.pf == null ? "—" : fmt(s.stats.pf)}</span></span>
      {s.stats.maxDD != null && <span className={chip}><span className="text-muted">{t("chMaxDD")}</span><span className="tnum font-semibold" style={{ color: RED }}>{money(-s.stats.maxDD)}</span></span>}
      {extra && s.odds && <span className={chip}><span dir={rtl ? "rtl" : undefined} className="text-muted">{rtl ? ltrNumbers(oddsLine(s.odds, t)) : oddsLine(s.odds, t)}</span></span>}
      {extra && s.propNote && <span className={`${chip} font-semibold`} style={{ color: s.propNote.tone === "ok" ? GREEN : s.propNote.tone === "bad" ? RED : undefined }}><span dir={rtl ? "rtl" : undefined}>{t("chProp")}: {rtl ? ltrNumbers(s.propNote.text) : s.propNote.text}</span></span>}
    </div>
  );
}
