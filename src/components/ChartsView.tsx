import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Maximize2, Minimize2 } from "lucide-react";
import Dropdown from "./Dropdown";
import SymbolIcon from "./SymbolIcon";
import { fmt } from "../lib/stats";
import type { Key } from "../i18n";
import type { Account, BalancePoint, Lang, Trade } from "../types";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  accounts: Account[];
  trades: Trade[];
  balances: Record<string, BalancePoint[]>;
}

const STORE = "mizan-charts";
const ALL = "__all";
const GREEN = "#22c55e";
const RED = "#f87171";
const PALETTE = ["#f5b83d", "#22c55e", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];
const RANGES = ["all", "1M", "3M", "6M", "YTD", "1Y"] as const;
type Range = (typeof RANGES)[number];
type Metric = "profit" | "balance" | "drawdown" | "periods";
type By = "symbol" | "account";
type Bucket = "day" | "week" | "month" | "session";
type Pt = { t: number; v: number };
type Bar = { key: string; label: string; v: number; n: number };
type Series = { id: string; name: string; color: string; pts: Pt[]; bars: Bar[] };

interface Saved {
  metric: Metric; by: By; selected: string[]; selectedAcc: string[]; colors: Record<string, string>;
  range: Range; split: boolean; smooth: boolean; bucket: Bucket;
}
const defaults: Saved = { metric: "profit", by: "symbol", selected: [ALL], selectedAcc: [ALL], colors: {}, range: "all", split: false, smooth: true, bucket: "day" };
const load = (): Saved => {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORE) ?? "{}") }; } catch { return defaults; }
};

const inst = (s: string) => s.replace(/^[^:]+:/, "");
const ts = (s: string | null) => (s ? Date.parse(s.length <= 16 ? `${s}Z` : s) : NaN);
const DAY = 864e5;

function niceTicks(min: number, max: number, n = 5): number[] {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
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
  height: number;
  label: string;
  title: string;
  smooth: boolean;
  kind: "line" | "dd" | "bars";
  t: (k: Key) => string;
}

function Chart({ series, lang, money, height, label, title, smooth, kind, t }: ChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const gid = useRef(`g${Math.random().toString(36).slice(2, 7)}`).current;

  const bars = kind === "bars";
  const padL = 14, padR = bars ? 70 : 84, padT = 18, padB = 32;
  const iw = w - padL - padR, ih = height - padT - padB;

  // ----- scales -----
  const all = series.flatMap((s) => s.pts);
  const barList = series[0]?.bars ?? [];
  let xMin = 0, xMax = 1, yMin = 0, yMax = 1;
  if (bars) {
    const vs = barList.map((b) => b.v);
    yMin = Math.min(0, ...vs); yMax = Math.max(0, ...vs);
  } else {
    xMin = Math.min(...all.map((p) => p.t)); xMax = Math.max(...all.map((p) => p.t));
    yMin = Math.min(...all.map((p) => p.v)); yMax = Math.max(...all.map((p) => p.v));
    if (kind === "dd") yMax = Math.max(yMax, 0);
  }
  const span = yMax - yMin || 1;
  yMin -= span * (bars || kind === "dd" ? 0.06 : 0.1);
  yMax += span * (kind === "dd" ? 0.04 : 0.1);
  const ticks = niceTicks(yMin, yMax);
  const X = (t0: number) => padL + ((t0 - xMin) / (xMax - xMin || 1)) * iw;
  const Y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;

  const linePath = (pts: Pt[]) => {
    if (smooth && kind !== "dd") return smoothPath(pts.map((p) => [X(p.t), Y(p.v)]));
    return pts.map((p, i) => (i === 0 ? `M${X(p.t)} ${Y(p.v)}` : `H${X(p.t)} V${Y(p.v)}`)).join(" ");
  };
  const fmtDate = (t0: number, long = false) =>
    new Intl.DateTimeFormat(lang, long ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(t0));
  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) * i) / 4);
  const zeroY = Y(0);

  // ----- hover (snaps to the nearest real data point) -----
  const times = useMemo(() => [...new Set(all.map((p) => p.t))].sort((a, b) => a - b), [series]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = bars ? iw / Math.max(1, barList.length) : 0;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (bars) { setHover(Math.min(barList.length - 1, Math.max(0, Math.floor((px - padL) / step)))); return; }
    const tt = xMin + ((px - padL) / iw) * (xMax - xMin);
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < tt) lo = mid + 1; else hi = mid; }
    const a = times[Math.max(0, lo - 1)], b = times[lo];
    setHover(Math.abs(a - tt) < Math.abs(b - tt) ? a : b);
  };
  const active = pinned ?? hover;
  const ax = active == null ? 0 : bars ? padL + (active + 0.5) * step : X(active);
  const tipLeft = active != null && ax > w * 0.6;

  // ----- landmarks (single line only) -----
  const one = kind === "line" && series.length === 1 ? series[0] : null;
  const hi = one ? one.pts.reduce((a, p) => (p.v > a.v ? p : a)) : null;
  const lo = one ? one.pts.reduce((a, p) => (p.v < a.v ? p : a)) : null;
  const clampX = (x: number) => Math.min(w - padR - 34, Math.max(padL + 34, x));

  // latest-value badges on the right axis (skip ones that would overlap)
  const badges: { s: Series; y: number }[] = [];
  if (!bars) {
    series.map((s) => ({ s, y: Y(s.pts[s.pts.length - 1].v) })).sort((a, b) => a.y - b.y).forEach((b) => {
      if (!badges.length || b.y - badges[badges.length - 1].y > 20) badges.push(b);
    });
  }
  const cid = (s: Series) => `${gid}${s.id.replace(/\W/g, "")}`;
  const sig = `${kind}${smooth}${series.map((s) => s.id + s.pts.length).join()}`;

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
      <svg ref={svgRef} width={w} height={height} onPointerMove={move} onPointerLeave={() => setHover(null)} onClick={() => setPinned(pinned == null ? hover : null)} className="block cursor-crosshair" style={{ fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif" }} role="img" aria-label={label}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={cid(s)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={series.length > 1 ? 0.16 : 0.34} />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
          <filter id={`${gid}glow`} x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>

        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeOpacity={v === 0 ? 0.95 : 0.55} strokeDasharray={v === 0 ? undefined : "2 6"} />
            <text x={w - padR + 12} y={Y(v) + 4} fontSize="11" fill="var(--muted)" className="tnum">{fmt(v === 0 ? 0 : v, Math.abs(v) < 10 && v !== 0 ? 2 : 0)}</text>
          </g>
        ))}

        {!bars && xTicks.map((t0, i) => (
          <text key={i} x={X(t0)} y={height - 9} fontSize="11" fill="var(--muted)" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{fmtDate(t0)}</text>
        ))}
        {bars && barList.map((b, i) => (i % Math.max(1, Math.ceil(barList.length / 8)) === 0 ? (
          <text key={b.key} x={padL + (i + 0.5) * step} y={height - 9} fontSize="11" fill="var(--muted)" textAnchor="middle">{b.label}</text>
        ) : null))}

        {bars ? (
          <g key={sig}>
            {barList.map((b, i) => {
              const bw = Math.max(2, Math.min(34, step * 0.66));
              const y0 = Y(0), y1 = Y(b.v);
              const on = active === i;
              return (
                <rect key={b.key} x={padL + (i + 0.5) * step - bw / 2} y={Math.min(y0, y1)} width={bw} height={Math.max(1.5, Math.abs(y1 - y0))} rx={Math.min(4, bw / 2)}
                  fill={b.v >= 0 ? GREEN : RED} opacity={active == null || on ? 1 : 0.45} className="ch-bar"
                  style={{ transformOrigin: b.v >= 0 ? "50% 100%" : "50% 0%", transformBox: "fill-box", animationDelay: `${Math.min(i * 12, 500)}ms` }} />
              );
            })}
          </g>
        ) : (
          <g key={sig}>
            {series.length === 1 && series[0].pts.length > 1 && (
              <path className="ch-fade" d={`${linePath(series[0].pts)} V${kind === "dd" ? zeroY : height - padB} H${X(series[0].pts[0].t)} Z`} fill={`url(#${cid(series[0])})`} />
            )}
            {series.length > 1 && series.map((s) => (
              <path key={`a${s.id}`} className="ch-fade" d={`${linePath(s.pts)} V${height - padB} H${X(s.pts[0].t)} Z`} fill={`url(#${cid(s)})`} />
            ))}
            {series.length <= 3 && series.map((s) => (
              <path key={`g${s.id}`} d={linePath(s.pts)} pathLength={1} className="ch-line" fill="none" stroke={s.color} strokeWidth="5" strokeOpacity="0.35" filter={`url(#${gid}glow)`} />
            ))}
            {series.map((s) => (
              <path key={s.id} d={linePath(s.pts)} pathLength={1} className="ch-line" fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {series.map((s) => {
              const p = s.pts[s.pts.length - 1];
              return (
                <g key={`e${s.id}`}>
                  <circle cx={X(p.t)} cy={Y(p.v)} r="3.5" fill={s.color} />
                  <circle cx={X(p.t)} cy={Y(p.v)} r="3.5" fill="none" stroke={s.color} strokeWidth="1.5">
                    <animate attributeName="r" values="3.5;12" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}
            {hi && lo && hi.t !== lo.t && [[hi, true], [lo, false]].map(([p, top]) => {
              const pt = p as Pt;
              return (
                <g key={String(top)}>
                  <circle cx={X(pt.t)} cy={Y(pt.v)} r="3" fill="var(--bg)" stroke={top ? GREEN : RED} strokeWidth="1.6" />
                  <text x={clampX(X(pt.t))} y={Y(pt.v) + (top ? -9 : 17)} fontSize="10.5" fontWeight="600" textAnchor="middle" fill={top ? GREEN : RED} className="tnum">{money(pt.v)}</text>
                </g>
              );
            })}
            {badges.map(({ s, y }) => (
              <g key={`b${s.id}`}>
                <rect x={w - padR + 6} y={y - 10} width={padR - 8} height="20" rx="6" fill={s.color} />
                <text x={w - padR + 6 + (padR - 8) / 2} y={y + 4} fontSize="11" fontWeight="700" textAnchor="middle" fill="#111" className="tnum">{fmt(s.pts[s.pts.length - 1].v, 0)}</text>
              </g>
            ))}
          </g>
        )}

        {active != null && !bars && (
          <g>
            <line x1={ax} x2={ax} y1={padT} y2={height - padB} stroke="var(--icon)" strokeOpacity="0.7" strokeDasharray="4 5" />
            {series.map((s) => (
              <g key={s.id}>
                <circle cx={ax} cy={Y(valueAt(s.pts, active))} r="8" fill={s.color} opacity="0.22" />
                <circle cx={ax} cy={Y(valueAt(s.pts, active))} r="4.5" fill={s.color} stroke="var(--bg)" strokeWidth="2" />
              </g>
            ))}
            <rect x={Math.min(Math.max(ax - 44, padL), w - padR - 88)} y={height - padB + 4} width="88" height="20" rx="6" fill="var(--icon)" />
            <text x={Math.min(Math.max(ax, padL + 44), w - padR - 44)} y={height - padB + 18} fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--on-primary)">{fmtDate(active)}</text>
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
              <p className="mb-1 text-muted">{fmtDate(active, true)} · UTC{pinned != null ? " 📌" : ""}</p>
              {series.map((s) => {
                const v = valueAt(s.pts, active);
                return (
                  <p key={s.id} className="flex items-center gap-2 py-0.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1 font-medium">{s.name}</span>
                    <span className="tnum text-sm font-bold" style={{ color: s.color }}>{money(v)}</span>
                  </p>
                );
              })}
              {series.length === 1 && kind === "line" && (() => {
                const d = valueAt(series[0].pts, active) - series[0].pts[0].v;
                return <p className="mt-1 flex justify-between border-t border-border pt-1 text-muted"><span>{t("chFromStart")}</span><span className="tnum font-semibold" style={{ color: d >= 0 ? GREEN : RED }}>{d > 0 ? "+" : ""}{money(d)}</span></p>;
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const weekStart = (t0: number) => { const d = new Date(t0); const wd = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd); };

export default function ChartsView({ t, lang, accounts, trades, balances }: Props) {
  const [st, setSt] = useState<Saved>(load);
  const [acc, setAcc] = useState("all");
  const [full, setFull] = useState(false);
  const save = (p: Partial<Saved>) => {
    const next = { ...st, ...p };
    setSt(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch {}
  };

  const byAcc = st.by === "account" && accounts.length > 1;
  const closed = useMemo(() => trades.filter((x) => x.status === "closed" && x.pnl != null && !isNaN(ts(x.exitTime))), [trades]);
  const scope = useMemo(() => (byAcc || acc === "all" ? closed : closed.filter((x) => x.accountId === acc)), [closed, acc, byAcc]);
  const accsInView = byAcc || acc === "all" ? accounts : accounts.filter((a) => a.id === acc);
  const currency = accsInView[0]?.currency ?? "USD";
  const money = (n: number) => `${n < 0 ? "-" : ""}${currency === "USD" ? "$" : ""}${fmt(Math.abs(n))}${currency === "USD" ? "" : ` ${currency}`}`;

  const symbols = useMemo(() => [...new Set(scope.map((x) => x.symbol))].sort(), [scope]);
  const items = byAcc ? [ALL, ...accounts.map((a) => a.id)] : [ALL, ...symbols];
  const nameOf = (id: string) => (id === ALL ? t("chAll") : byAcc ? accounts.find((a) => a.id === id)?.name ?? id : inst(id));
  const colorOf = (id: string) => st.colors[id] ?? (id === ALL ? PALETTE[0] : PALETTE[(1 + Math.max(0, items.indexOf(id) - 1)) % PALETTE.length]);
  const stored = byAcc ? st.selectedAcc : st.selected;
  const chosen = stored.filter((id) => items.includes(id)).length ? stored.filter((id) => items.includes(id)) : [ALL];
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

  const series: Series[] = useMemo(() => {
    return chosen
      .map((id) => {
        const list = scope
          .filter((x) => id === ALL || (byAcc ? x.accountId === id : x.symbol === id))
          .sort((a, b) => ts(a.exitTime) - ts(b.exitTime));
        const startOf = id === ALL ? accsInView.reduce((a, x) => a + (x.startBalance || 0), 0) : byAcc ? accounts.find((a) => a.id === id)?.startBalance ?? 0 : accsInView.reduce((a, x) => a + (x.startBalance || 0), 0);
        const base = st.metric === "balance" ? startOf : 0;
        const color = colorOf(id);
        const name = nameOf(id);

        if (st.metric === "periods") {
          const m = new Map<string, Bar>();
          for (const x of list) {
            if (cutoff != null && ts(x.exitTime) < cutoff) continue;
            const b = bucketOf(x);
            const cur = m.get(b.key) ?? { key: b.key, label: b.label, v: 0, n: 0 };
            cur.v += x.pnl as number; cur.n++;
            m.set(b.key, cur);
          }
          const bars = [...m.values()].sort((a, b) => (st.bucket === "session" ? 0 : a.key.localeCompare(b.key)));
          return { id, name, color, pts: [], bars };
        }

        let pts: Pt[] = [];
        const acct = id === ALL ? (accsInView.length === 1 ? accsInView[0] : undefined) : byAcc ? accounts.find((a) => a.id === id) : undefined;
        const real = st.metric === "balance" && acct ? balances[acct.id] : undefined;
        if (real && real.length > 1) pts = real.map((p) => ({ t: ts(p.t), v: p.balance })).filter((p) => !isNaN(p.t)).sort((a, b) => a.t - b.t);
        else {
          let run = base;
          pts = list.map((x) => ({ t: ts(x.exitTime), v: (run += x.pnl as number) }));
          if (pts.length) pts.unshift({ t: ts(list[0].entryTime ?? list[0].exitTime) || pts[0].t, v: base });
        }
        if (st.metric === "drawdown") {
          let peak = 0, run = 0;
          pts = [{ t: pts[0]?.t ?? 0, v: 0 }, ...list.map((x) => { run += x.pnl as number; peak = Math.max(peak, run); return { t: ts(x.exitTime), v: run - peak }; })];
          if (!list.length) pts = [];
        }
        // one point per timestamp (keep the last), so curves stay well-defined
        const dedup: Pt[] = [];
        for (const p of pts) { if (dedup.length && dedup[dedup.length - 1].t === p.t) dedup[dedup.length - 1] = p; else dedup.push(p); }
        pts = dedup;
        if (cutoff != null && pts.length) pts = [{ t: cutoff, v: valueAt(pts, cutoff) }, ...pts.filter((p) => p.t > cutoff)];
        return { id, name, color, pts, bars: [] };
      })
      .filter((s) => (st.metric === "periods" ? s.bars.length > 0 : s.pts.length > 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, chosen.join("|"), st.metric, st.colors, st.bucket, cutoff, balances, acc, byAcc, lang]);

  // ----- headline -----
  const head = series[0];
  const startAll = accsInView.reduce((a, x) => a + (x.startBalance || 0), 0);
  let headVal = 0, pct: number | null = null, sub = "";
  if (head) {
    if (st.metric === "periods") {
      headVal = head.bars.reduce((a, b) => a + b.v, 0);
      const pos = head.bars.filter((b) => b.v > 0).length;
      sub = `${pos}/${head.bars.length} ${t("chPosPeriods")}`;
      pct = startAll ? (headVal / startAll) * 100 : null;
    } else if (st.metric === "drawdown") {
      headVal = Math.min(...head.pts.map((p) => p.v));
      pct = startAll ? (headVal / startAll) * 100 : null;
    } else {
      headVal = head.pts[head.pts.length - 1].v;
      const first = head.pts[0].v;
      pct = st.metric === "balance" ? (first ? ((headVal - first) / Math.abs(first)) * 100 : null) : startAll ? (headVal / startAll) * 100 : null;
    }
  }
  const metricLabel = t(({ profit: "chProfit", balance: "chBalance", drawdown: "chDrawdown", periods: "chPeriods" } as const)[st.metric]);
  const lineKind = st.metric === "drawdown" ? "dd" : "line";
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const isBars = st.metric === "periods";
  const split = st.split || isBars;

  const seg = (on: boolean) => `px-3 py-1.5 transition-colors ${on ? "bg-primary text-on-primary" : "hover:text-icon"}`;
  const group = "flex overflow-hidden rounded-lg border border-border text-sm font-semibold";
  const pill = "flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold transition-colors hover:border-icon";
  const chartH = full ? Math.max(360, (typeof window !== "undefined" ? window.innerHeight : 800) - 260) : 400;

  return (
    <section className={full ? "fixed inset-0 z-[60] flex flex-col gap-3 overflow-auto bg-bg p-5" : "flex flex-col gap-4"}>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-[0_0_0_1px_rgb(245_184_61/0.04),0_20px_50px_-30px_rgb(245_184_61/0.25)]">
        <div className="flex flex-wrap items-start gap-3">
          <div className="me-auto">
            <div className="flex items-center gap-2 text-sm text-muted">
              {metricLabel}
              {pct != null && head && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pct >= 0 ? "bg-primary-tint text-icon" : "bg-[#f87171]/15 text-[#f87171]"}`} dir="ltr">{pct >= 0 ? "+" : ""}{fmt(pct)}%</span>
              )}
            </div>
            <p className={`font-heading text-3xl font-bold tnum ${st.metric === "drawdown" && headVal < 0 ? "text-[#f87171]" : ""}`} dir="ltr">{money(headVal)}</p>
            {sub && <p className="text-xs text-muted">{sub}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {accounts.length > 1 && !byAcc && (
              <select className="field !w-auto" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label={t("pickAccount")}>
                <option value="all">{t("allAccounts")}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            {accounts.length > 1 && (
              <div className={group} role="group">
                {(["symbol", "account"] as const).map((b) => (
                  <button key={b} type="button" aria-pressed={st.by === b} onClick={() => save({ by: b })} className={seg(st.by === b)}>{t(b === "symbol" ? "chBySymbol" : "chByAccount")}</button>
                ))}
              </div>
            )}
            <div className={group} role="group">
              {(["profit", "balance", "drawdown", "periods"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={st.metric === m} onClick={() => save({ metric: m })} className={seg(st.metric === m)}>{t(({ profit: "chProfit", balance: "chBalance", drawdown: "chDrawdown", periods: "chPeriods" } as const)[m])}</button>
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
                {st.metric !== "drawdown" && (
                  <div className={group} role="group">
                    {[true, false].map((sm) => (
                      <button key={String(sm)} type="button" aria-pressed={st.smooth === sm} onClick={() => save({ smooth: sm })} className={seg(st.smooth === sm)}>{t(sm ? "chSmooth" : "chStep")}</button>
                    ))}
                  </div>
                )}
              </>
            )}

            <Dropdown
              label={t("chSymbols")}
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

            <select className="field !w-auto" value={st.range} onChange={(e) => save({ range: e.target.value as Range })} aria-label={t("chRange")}>
              {RANGES.map((r) => <option key={r} value={r}>{r === "all" ? t("chRangeAll") : r}</option>)}
            </select>
            <button type="button" onClick={() => setFull(!full)} className="icon-btn" aria-label={t("chFullscreen")}>{full ? <Minimize2 size={18} className="text-icon" /> : <Maximize2 size={18} className="text-icon" />}</button>
          </div>
        </div>

        {series.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted">{t("chNoData")}</p>
        ) : split ? (
          <div className={`mt-4 grid gap-4 ${series.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {series.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-bg/40 p-3">
                <p className="mb-1 flex items-center gap-2 text-sm font-bold" dir="ltr"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}
                  <span className="ms-auto tnum" style={{ color: isBars ? (s.bars.reduce((a, b) => a + b.v, 0) >= 0 ? GREEN : RED) : s.color }}>{money(isBars ? s.bars.reduce((a, b) => a + b.v, 0) : st.metric === "drawdown" ? Math.min(...s.pts.map((p) => p.v)) : s.pts[s.pts.length - 1].v)}</span></p>
                <Chart series={[s]} lang={lang} money={money} height={series.length > 1 ? 260 : chartH} label={metricLabel} title={`${metricLabel} ${s.name}`} smooth={st.smooth} kind={isBars ? "bars" : lineKind} t={t} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <Chart series={series} lang={lang} money={money} height={chartH} label={metricLabel} title={`${metricLabel} · ${series.map((s) => s.name).join(", ")}`} smooth={st.smooth} kind={lineKind} t={t} />
            <div className="mt-2 flex flex-wrap gap-3 text-xs" dir="ltr">
              {series.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} /><span className="font-medium">{s.name}</span><span className="tnum text-muted">{money(st.metric === "drawdown" ? Math.min(...s.pts.map((p) => p.v)) : s.pts[s.pts.length - 1].v)}</span></span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
