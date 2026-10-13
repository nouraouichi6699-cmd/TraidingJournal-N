import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Maximize2, Minimize2 } from "lucide-react";
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
const PALETTE = ["#f5b83d", "#22c55e", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];
const RANGES = ["all", "1M", "3M", "6M", "YTD", "1Y"] as const;
type Range = (typeof RANGES)[number];
type Metric = "balance" | "profit";
type Pt = { t: number; v: number };
type Series = { id: string; name: string; color: string; pts: Pt[] };

interface Saved { metric: Metric; selected: string[]; colors: Record<string, string>; range: Range; split: boolean }
const defaults: Saved = { metric: "profit", selected: [ALL], colors: {}, range: "all", split: false };
const load = (): Saved => {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORE) ?? "{}") }; } catch { return defaults; }
};

const inst = (s: string) => s.replace(/^[^:]+:/, "");
const ts = (s: string | null) => (s ? Date.parse(s.length <= 16 ? `${s}Z` : s) : NaN);

function niceTicks(min: number, max: number, n = 6): number[] {
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

function Chart({ series, lang, money, height, metricLabel }: { series: Series[]; lang: Lang; money: (n: number) => string; height: number; metricLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const padL = 12, padR = 78, padT = 14, padB = 30;
  const all = series.flatMap((s) => s.pts);
  const xMin = Math.min(...all.map((p) => p.t)), xMax = Math.max(...all.map((p) => p.t));
  let yMin = Math.min(...all.map((p) => p.v)), yMax = Math.max(...all.map((p) => p.v));
  const padY = (yMax - yMin || 1) * 0.08;
  yMin -= padY; yMax += padY;
  const ticks = niceTicks(yMin, yMax);
  const X = (t: number) => padL + ((t - xMin) / (xMax - xMin || 1)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (height - padT - padB);

  const path = (pts: Pt[]) =>
    pts.map((p, i) => (i === 0 ? `M${X(p.t)} ${Y(p.v)}` : `H${X(p.t)} V${Y(p.v)}`)).join(" ");

  const fmtDate = (t: number, long = false) =>
    new Intl.DateTimeFormat(lang, long ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(t));
  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) * i) / 4);

  const active = pinned ?? hover;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const t = xMin + ((px - padL) / (w - padL - padR)) * (xMax - xMin);
    setHover(Math.min(xMax, Math.max(xMin, t)));
  };
  const gid = useRef(`g${Math.random().toString(36).slice(2, 7)}`).current;
  const tipLeft = active != null && X(active) > w * 0.6;

  return (
    <div ref={wrap} className="relative select-none" dir="ltr">
      <svg width={w} height={height} onPointerMove={move} onPointerLeave={() => setHover(null)} onClick={() => setPinned(pinned == null ? hover : null)} className="block cursor-crosshair" role="img" aria-label={metricLabel}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={`${gid}${s.id.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeDasharray="3 5" />
            <text x={w - padR + 10} y={Y(v) + 4} fontSize="11" fill="var(--muted)" className="tnum">{fmt(v === 0 ? 0 : v, Math.abs(v) < 10 && v !== 0 ? 2 : 0)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={X(t)} y={height - 8} fontSize="11" fill="var(--muted)" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{fmtDate(t)}</text>
        ))}
        {series.length === 1 && series[0].pts.length > 1 && (
          <path d={`${path(series[0].pts)} V${height - padB} H${X(series[0].pts[0].t)} Z`} fill={`url(#${gid}${series[0].id.replace(/\W/g, "")})`} />
        )}
        {series.map((s) => (
          <path key={s.id} d={path(s.pts)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
        ))}
        {active != null && (
          <g>
            <line x1={X(active)} x2={X(active)} y1={padT} y2={height - padB} stroke="var(--icon)" strokeDasharray="4 4" opacity="0.7" />
            {series.map((s) => (
              <circle key={s.id} cx={X(active)} cy={Y(valueAt(s.pts, active))} r="4.5" fill={s.color} stroke="var(--bg)" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {active != null && (
        <div className="pointer-events-none absolute top-3 z-10 min-w-[190px] rounded-xl border border-icon/40 bg-surface/95 px-3 py-2 text-xs shadow-xl" style={{ left: tipLeft ? undefined : X(active) + 12, right: tipLeft ? w - X(active) + 12 : undefined }}>
          <p className="mb-1 text-muted">{fmtDate(active, true)} · UTC{pinned != null ? " 📌" : ""}</p>
          {series.map((s) => {
            const v = valueAt(s.pts, active);
            return (
              <p key={s.id} className="flex items-center gap-2 py-0.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 font-medium">{s.name}</span>
                <span className="tnum font-bold" style={{ color: s.color }}>{money(v)}</span>
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ChartsView({ t, lang, accounts, trades, balances }: Props) {
  const [st, setSt] = useState<Saved>(load);
  const [acc, setAcc] = useState("all");
  const [full, setFull] = useState(false);
  const save = (p: Partial<Saved>) => {
    const next = { ...st, ...p };
    setSt(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch {}
  };

  const scope = useMemo(
    () => trades.filter((x) => (acc === "all" || x.accountId === acc) && x.status === "closed" && x.pnl != null && !isNaN(ts(x.exitTime))),
    [trades, acc],
  );
  const accs = acc === "all" ? accounts : accounts.filter((a) => a.id === acc);
  const start = accs.reduce((a, x) => a + (x.startBalance || 0), 0);
  const currency = accs[0]?.currency ?? "USD";
  const money = (n: number) => `${n < 0 ? "-" : ""}${currency === "USD" ? "$" : ""}${fmt(Math.abs(n))}${currency === "USD" ? "" : ` ${currency}`}`;

  const symbols = useMemo(() => [...new Set(scope.map((x) => x.symbol))].sort(), [scope]);
  const colorOf = (id: string) => st.colors[id] ?? (id === ALL ? PALETTE[0] : PALETTE[(1 + symbols.indexOf(id)) % PALETTE.length]);
  const selected = st.selected.filter((id) => id === ALL || symbols.includes(id));
  const chosen = selected.length ? selected : [ALL];

  const cutoff = useMemo(() => {
    const d = new Date();
    if (st.range === "all") return null;
    if (st.range === "YTD") return Date.UTC(d.getUTCFullYear(), 0, 1);
    const m = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 }[st.range];
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m, d.getUTCDate());
  }, [st.range]);

  const series: Series[] = useMemo(() => {
    const baseOf = (id: string) => (st.metric === "balance" ? start : 0);
    return chosen
      .map((id) => {
        const list = scope.filter((x) => id === ALL || x.symbol === id).sort((a, b) => ts(a.exitTime) - ts(b.exitTime));
        let pts: Pt[] = [];
        // Real balance history (deposits/withdrawals included) when one account is in view.
        const real = id === ALL && st.metric === "balance" && accs.length === 1 ? balances[accs[0].id] : undefined;
        if (real && real.length > 1) pts = real.map((p) => ({ t: ts(p.t), v: p.balance })).filter((p) => !isNaN(p.t)).sort((a, b) => a.t - b.t);
        else {
          let run = baseOf(id);
          pts = list.map((x) => ({ t: ts(x.exitTime), v: (run += x.pnl as number) }));
          if (pts.length) pts.unshift({ t: ts(list[0].entryTime ?? list[0].exitTime) || pts[0].t, v: baseOf(id) });
        }
        if (cutoff != null && pts.length) {
          const base = valueAt(pts, cutoff);
          pts = [{ t: cutoff, v: base }, ...pts.filter((p) => p.t > cutoff)];
        }
        return { id, name: id === ALL ? t("chAll") : inst(id), color: colorOf(id), pts };
      })
      .filter((s) => s.pts.length > 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, chosen.join("|"), st.metric, st.colors, cutoff, start, balances, acc, symbols.join("|")]);

  const head = series[0];
  const last = head?.pts[head.pts.length - 1]?.v ?? 0;
  const first = head?.pts[0]?.v ?? 0;
  const pct = st.metric === "balance" ? (first ? ((last - first) / Math.abs(first)) * 100 : null) : start ? (last / start) * 100 : null;
  const metricLabel = t(st.metric === "balance" ? "chBalance" : "chProfit");
  const toggle = (id: string) => save({ selected: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id] });
  const allIds = [ALL, ...symbols];

  const pill = "flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold hover:border-icon";

  return (
    <section className={full ? "fixed inset-0 z-[60] flex flex-col gap-3 overflow-auto bg-bg p-5" : "flex flex-col gap-4"}>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="me-auto">
            <div className="flex items-center gap-2 text-sm text-muted">
              {metricLabel}
              {pct != null && series.length > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pct >= 0 ? "bg-primary-tint text-icon" : "bg-[#f87171]/15 text-[#f87171]"}`} dir="ltr">{pct >= 0 ? "+" : ""}{fmt(pct)}%</span>
              )}
            </div>
            <p className="font-heading text-3xl font-bold tnum" dir="ltr">{money(last)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {accounts.length > 1 && (
              <select className="field !w-auto" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label={t("pickAccount")}>
                <option value="all">{t("allAccounts")}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <div className="flex overflow-hidden rounded-lg border border-border text-sm font-semibold" role="group">
              {(["profit", "balance"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={st.metric === m} onClick={() => save({ metric: m })} className={`px-3 py-1.5 ${st.metric === m ? "bg-primary text-on-primary" : "hover:text-icon"}`}>{t(m === "profit" ? "chProfit" : "chBalance")}</button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-lg border border-border text-sm font-semibold" role="group">
              {[false, true].map((sp) => (
                <button key={String(sp)} type="button" aria-pressed={st.split === sp} onClick={() => save({ split: sp })} className={`px-3 py-1.5 ${st.split === sp ? "bg-primary text-on-primary" : "hover:text-icon"}`}>{t(sp ? "chSplit" : "chOverlay")}</button>
              ))}
            </div>

            <Dropdown
              label={t("chSymbols")}
              panelClass="w-72 max-h-80 overflow-auto" bare
              trigger={<span className={pill}><span className="flex -space-x-1">{chosen.slice(0, 4).map((id) => <span key={id} className="h-2.5 w-2.5 rounded-full ring-2 ring-surface" style={{ background: colorOf(id) }} />)}</span>{chosen.length}/{allIds.length}<ChevronDown size={14} /></span>}
            >
              {() => (
                <div className="flex flex-col gap-0.5">
                  <button type="button" role="menuitemcheckbox" aria-checked={chosen.length === allIds.length} onClick={() => save({ selected: chosen.length === allIds.length ? [ALL] : allIds })} className="menu-item border-b border-border pb-2 font-bold">
                    <input type="checkbox" readOnly checked={chosen.length === allIds.length} className="accent-[var(--primary)]" />
                    <span className="flex-1 text-start">{t("chSelectAll")}<span className="block text-xs font-normal text-muted">{chosen.length}/{allIds.length}</span></span>
                  </button>
                  {allIds.map((id) => (
                    <div key={id} className="menu-item">
                      <input type="checkbox" checked={chosen.includes(id)} onChange={() => toggle(id)} aria-label={id === ALL ? t("chAll") : inst(id)} className="accent-[var(--primary)]" />
                      <span className="flex flex-1 items-center gap-2 text-start" dir="ltr">{id === ALL ? <span className="font-bold">{t("chAll")}</span> : (<><SymbolIcon symbol={id} />{inst(id)}</>)}</span>
                      <label title={t("chColor")} className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full ring-2 ring-border">
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
        ) : st.split ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {series.map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-3">
                <p className="mb-1 flex items-center gap-2 text-sm font-bold" dir="ltr"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}<span className="ms-auto tnum" style={{ color: s.color }}>{money(s.pts[s.pts.length - 1].v)}</span></p>
                <Chart series={[s]} lang={lang} money={money} height={260} metricLabel={metricLabel} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <Chart series={series} lang={lang} money={money} height={full ? Math.max(360, window.innerHeight - 260) : 400} metricLabel={metricLabel} />
            <div className="mt-2 flex flex-wrap gap-3 text-xs" dir="ltr">
              {series.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} /><span className="font-medium">{s.name}</span><span className="tnum text-muted">{money(s.pts[s.pts.length - 1].v)}</span></span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
