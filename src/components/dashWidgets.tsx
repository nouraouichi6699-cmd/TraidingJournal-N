import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, DollarSign, Percent, Scale, CalendarDays, Hash, Trophy, Layers, Repeat, Target, LineChart, BarChart3, ListOrdered, CalendarRange, Info } from "lucide-react";
import { computeActivity } from "../lib/activity";
import { fmt } from "../lib/stats";
import { dayKey, type Metrics } from "../lib/dashStats";
import type { Lang, Trade } from "../types";

type L = Record<Lang, string>;
export const TR = (en: string, ar: string, fr: string): L => ({ en, ar, fr });
export const GREEN = "#22c55e", RED = "#f87171";

export interface Ctx { trades: Trade[]; closed: Trade[]; m: Metrics; hide: boolean; lang: Lang }
export interface Def { id: string; icon: ReactNode; name: L; info: L; min: { w: number; h: number }; size: { w: number; h: number }; render: (c: Ctx) => ReactNode }

const tone = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : "var(--text)");
export const money = (c: Ctx, n: number, sign = true) => (c.hide ? "••••" : `${sign && n > 0 ? "+" : ""}${fmt(n)}`);
const compact = (n: number) => { const a = Math.abs(n); return (n < 0 ? "-" : "") + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + "k" : a.toFixed(0)); };

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [s, set] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => set({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); set({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, s] as const;
}

const Empty = ({ lang }: { lang: Lang }) => <div className="grid h-full place-items-center text-center text-xs text-muted">{TR("No data yet", "لا توجد بيانات بعد", "Pas encore de données")[lang]}</div>;
const Hidden = () => <div className="grid h-full place-items-center text-xl tracking-widest text-muted">••••</div>;
const big = (extra?: string) => ({ fontSize: "clamp(1.4rem,min(30cqh,14cqw),3.4rem)", lineHeight: 1, ...(extra ? { color: extra } : {}) });

function Donut({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 40, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="h-full max-h-full w-full" style={{ maxWidth: "100%" }}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="color-mix(in srgb,var(--text) 10%,transparent)" strokeWidth="11" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 50 50)" style={{ transition: "stroke-dasharray .6s ease" }} />
      <text x="50" y="55" textAnchor="middle" fontSize="19" fontWeight="700" fill="currentColor" className="tnum">{label}</text>
    </svg>
  );
}

function HalfGauge({ v, max, color }: { v: number; max: number; color: string }) {
  const f = Math.max(0, Math.min(1, v / max)), r = 40, L = Math.PI * r;
  return (
    <svg viewBox="0 0 100 56" className="h-full w-full">
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="color-mix(in srgb,var(--text) 10%,transparent)" strokeWidth="11" strokeLinecap="round" />
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${f * L} ${L}`} style={{ transition: "stroke-dasharray .6s ease" }} />
    </svg>
  );
}

/** KPI layout: number on the left, mini visual on the right. */
function Kpi({ value, color, sub, visual }: { value: string; color?: string; sub?: string; visual?: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="tnum truncate font-heading font-bold" style={big(color)}>{value}</div>
        {sub && <div className="mt-1.5 truncate text-muted" style={{ fontSize: "clamp(.65rem,7cqh,.85rem)" }}>{sub}</div>}
      </div>
      {visual && <div className="h-full min-w-0 shrink-0" style={{ width: "min(44%,100cqh)" }}>{visual}</div>}
    </div>
  );
}

function Radar({ c }: { c: Ctx }) {
  const m = c.m;
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  if (!m.score) return <Empty lang={c.lang} />;
  const names: Record<string, L> = {
    win: TR("Win %", "نسبة الربح", "Réussite"), pf: TR("Profit factor", "معامل الربح", "Facteur"), avg: TR("Avg win/loss", "ربح/خسارة", "Gain/perte"),
    rec: TR("Recovery", "التعافي", "Récupération"), dd: TR("Drawdown", "السحب", "Drawdown"), con: TR("Consistency", "الاتساق", "Régularité"),
  };
  const cx = w / 2, cy = h / 2, R = Math.max(40, Math.min(h / 2 - 20, w / 2 - 58));
  const pt = (i: number, f: number) => { const a = -Math.PI / 2 + (i / 6) * 2 * Math.PI; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f] as const; };
  const ring = (f: number) => m.score!.map((_, i) => pt(i, f).join(",")).join(" ");
  const poly = m.score.map((s, i) => pt(i, s.v / 100).join(",")).join(" ");
  return (
    <div ref={ref} className="relative h-full w-full">
      {w > 0 && (
        <svg width={w} height={h} className="absolute inset-0">
          {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={ring(f)} fill="none" stroke="color-mix(in srgb,var(--text) 12%,transparent)" />)}
          {m.score.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="color-mix(in srgb,var(--text) 10%,transparent)" />; })}
          <polygon points={poly} fill="color-mix(in srgb,var(--primary) 30%,transparent)" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
          {m.score.map((s, i) => { const [x, y] = pt(i, s.v / 100); return <circle key={i} cx={x} cy={y} r="3" fill="var(--primary)" />; })}
          {m.score.map((s, i) => { const [x, y] = pt(i, 1.2); return <text key={s.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="var(--muted)">{names[s.key][c.lang]}</text>; })}
        </svg>
      )}
    </div>
  );
}

function ScoreW({ c }: { c: Ctx }) {
  const o = c.m.overall;
  if (o == null) return <Empty lang={c.lang} />;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1"><Radar c={c} /></div>
      <div className="mt-1 flex items-center gap-3">
        <div className="tnum font-heading text-3xl font-bold text-primary">{Math.round(o)}</div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full" style={{ width: `${o}%`, background: "linear-gradient(90deg,#f87171,var(--primary),#22c55e)" }} /></div>
      </div>
    </div>
  );
}

function CumW({ c }: { c: Ctx }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hv, setHv] = useState<number | null>(null);
  const pts = c.m.cum;
  if (c.hide) return <Hidden />;
  if (pts.length < 2) return <Empty lang={c.lang} />;
  const padL = 44, padB = 20, padT = 8, padR = 8;
  const vs = [0, ...pts.map((p) => p.v)];
  const mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn || 1;
  const X = (i: number) => padL + (i / (pts.length - 1)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - (v - mn) / rg) * (h - padT - padB);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1].v, col = last >= 0 ? GREEN : RED;
  const ticks = [mn, mn + rg / 2, mx];
  const sel = hv != null ? pts[hv] : null;
  return (
    <div ref={ref} className="relative h-full w-full">
      {w > 0 && (
        <svg width={w} height={h} className="absolute inset-0" onPointerLeave={() => setHv(null)} onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHv(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left - padL) / (w - padL - padR)) * (pts.length - 1))))); }}>
          <defs><linearGradient id="cumg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".35" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
          {ticks.map((t, i) => <g key={i}><line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke="color-mix(in srgb,var(--text) 9%,transparent)" strokeDasharray="3 4" /><text x={padL - 6} y={Y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)" className="tnum">{compact(t)}</text></g>)}
          {mn < 0 && mx > 0 && <line x1={padL} x2={w - padR} y1={Y(0)} y2={Y(0)} stroke="color-mix(in srgb,var(--text) 25%,transparent)" />}
          <path d={`${line} L${X(pts.length - 1)} ${Y(Math.max(mn, Math.min(0, mx)))} L${X(0)} ${Y(Math.max(mn, Math.min(0, mx)))} Z`} fill="url(#cumg)" />
          <path d={line} fill="none" stroke={col} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          <text x={padL} y={h - 4} fontSize="10" fill="var(--muted)">{pts[0].d.slice(5)}</text>
          <text x={w - padR} y={h - 4} textAnchor="end" fontSize="10" fill="var(--muted)">{pts[pts.length - 1].d.slice(5)}</text>
          {sel && hv != null && <g><line x1={X(hv)} x2={X(hv)} y1={padT} y2={h - padB} stroke="var(--primary)" strokeOpacity=".6" /><circle cx={X(hv)} cy={Y(sel.v)} r="4" fill={col} stroke="var(--bg)" strokeWidth="2" /></g>}
        </svg>
      )}
      {sel && hv != null && <div className="tnum pointer-events-none absolute top-1 rounded-md border border-border bg-bg px-2 py-1 text-[11px] shadow" style={{ left: Math.min(Math.max(X(hv) - 40, 0), w - 90) }}><div className="text-muted">{sel.d}</div><div className="font-semibold" style={{ color: tone(sel.v) }}>{fmt(sel.v)}</div></div>}
    </div>
  );
}

function DailyW({ c }: { c: Ctx }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hv, setHv] = useState<number | null>(null);
  const days = c.m.days.slice(-60);
  if (c.hide) return <Hidden />;
  if (!days.length) return <Empty lang={c.lang} />;
  const padL = 44, padB = 20, padT = 8, padR = 8;
  const mx = Math.max(...days.map((d) => d.pnl), 0), mn = Math.min(...days.map((d) => d.pnl), 0), rg = mx - mn || 1;
  const Y = (v: number) => padT + (1 - (v - mn) / rg) * (h - padT - padB);
  const slot = (w - padL - padR) / days.length, bw = Math.max(2, Math.min(26, slot * 0.7));
  return (
    <div ref={ref} className="relative h-full w-full">
      {w > 0 && (
        <svg width={w} height={h} className="absolute inset-0" onPointerLeave={() => setHv(null)}>
          {[mn, 0, mx].filter((v, i, a) => a.indexOf(v) === i).map((t, i) => <g key={i}><line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? "color-mix(in srgb,var(--text) 25%,transparent)" : "color-mix(in srgb,var(--text) 9%,transparent)"} strokeDasharray={t === 0 ? undefined : "3 4"} /><text x={padL - 6} y={Y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)" className="tnum">{compact(t)}</text></g>)}
          {days.map((d, i) => {
            const x = padL + i * slot + (slot - bw) / 2, y0 = Y(0), y1 = Y(d.pnl);
            return <rect key={d.d} x={x} y={Math.min(y0, y1)} width={bw} height={Math.max(1.5, Math.abs(y1 - y0))} rx={Math.min(3, bw / 2)} fill={d.pnl >= 0 ? GREEN : RED} opacity={hv == null || hv === i ? 0.95 : 0.4} onPointerEnter={() => setHv(i)} />;
          })}
          <text x={padL} y={h - 4} fontSize="10" fill="var(--muted)">{days[0].d.slice(5)}</text>
          <text x={w - padR} y={h - 4} textAnchor="end" fontSize="10" fill="var(--muted)">{days[days.length - 1].d.slice(5)}</text>
        </svg>
      )}
      {hv != null && days[hv] && <div className="tnum pointer-events-none absolute top-1 rounded-md border border-border bg-bg px-2 py-1 text-[11px] shadow" style={{ left: Math.min(Math.max(padL + hv * slot - 30, 0), w - 90) }}><div className="text-muted">{days[hv].d} · {days[hv].n}</div><div className="font-semibold" style={{ color: tone(days[hv].pnl) }}>{fmt(days[hv].pnl)}</div></div>}
    </div>
  );
}

function TradesW({ c }: { c: Ctx }) {
  const [tab, setTab] = useState<"recent" | "open">("recent");
  const open = c.trades.filter((t) => t.status !== "closed");
  const recent = [...c.closed].sort((a, b) => (b.exitTime || b.entryTime || "").localeCompare(a.exitTime || a.entryTime || ""));
  const rows = (tab === "recent" ? recent : open).slice(0, 30);
  const tabs = [["recent", TR("Recent trades", "آخر الصفقات", "Derniers trades")], ["open", TR("Open positions", "المراكز المفتوحة", "Positions ouvertes")]] as const;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex gap-1 border-b border-border">
        {tabs.map(([id, l]) => <button key={id} type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-semibold transition ${tab === id ? "border-primary text-primary" : "border-transparent text-muted hover:text-text"}`}>{l[c.lang]}{id === "open" && open.length ? ` (${open.length})` : ""}</button>)}
      </div>
      {rows.length === 0 ? <Empty lang={c.lang} /> : (
        <div className="min-h-0 flex-1 overflow-y-auto pe-1" onPointerDown={(e) => e.stopPropagation()}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-muted"><tr><th className="py-1.5 text-start font-medium">{TR("Date", "التاريخ", "Date")[c.lang]}</th><th className="text-start font-medium">{TR("Symbol", "الرمز", "Symbole")[c.lang]}</th><th className="text-start font-medium">{TR("Side", "الاتجاه", "Sens")[c.lang]}</th><th className="text-end font-medium">{TR("Net P&L", "صافي", "P&L net")[c.lang]}</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.key} className="border-t border-border/60 transition hover:bg-primary-tint">
                  <td className="tnum py-1.5 text-muted">{dayKey(t) || "—"}</td>
                  <td className="font-medium">{t.symbol}</td>
                  <td style={{ color: t.side === "long" ? GREEN : RED }}>{t.side === "long" ? TR("Long", "شراء", "Long")[c.lang] : TR("Short", "بيع", "Short")[c.lang]}</td>
                  <td className="tnum text-end font-semibold" style={{ color: t.pnl == null || c.hide ? undefined : tone(t.pnl) }}>{t.pnl == null ? "—" : money(c, t.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CalW({ c }: { c: Ctx }) {
  const days = c.m.days;
  const map = new Map(days.map((d) => [d.d, d]));
  const [month, setMonth] = useState(() => (days.length ? days[days.length - 1].d.slice(0, 7) : new Date().toISOString().slice(0, 7)));
  useEffect(() => { if (days.length && !days.some((d) => d.d.startsWith(month))) setMonth(days[days.length - 1].d.slice(0, 7)); }, [days.length]); // eslint-disable-line
  const [y, mo] = month.split("-").map(Number);
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const mTotal = days.filter((d) => d.d.startsWith(month)).reduce((s, d) => s + d.pnl, 0);
  const mx = Math.max(1, ...days.filter((d) => d.d.startsWith(month)).map((d) => Math.abs(d.pnl)));
  const step = (n: number) => { const d = new Date(Date.UTC(y, mo - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const title = new Intl.DateTimeFormat(c.lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1)));
  const wd = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(c.lang, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))));
  return (
    <div className="flex h-full flex-col" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="previous month" onClick={() => step(-1)} className="icon-btn !h-7 !w-7"><ChevronLeft size={15} className="text-icon rtl:rotate-180" /></button>
          <span className="min-w-[110px] text-center text-sm font-semibold capitalize">{title}</span>
          <button type="button" aria-label="next month" onClick={() => step(1)} className="icon-btn !h-7 !w-7"><ChevronRight size={15} className="text-icon rtl:rotate-180" /></button>
        </div>
        <div className="tnum text-xs text-muted">{TR("Monthly", "الشهر", "Mois")[c.lang]}: <b style={{ color: c.hide ? undefined : tone(mTotal) }}>{money(c, mTotal)}</b></div>
      </div>
      <div className="grid min-h-0 flex-1 gap-1" style={{ gridTemplateColumns: "repeat(7,minmax(0,1fr)) minmax(0,1.15fr)", gridTemplateRows: `auto repeat(${weeks.length},minmax(0,1fr))` }}>
        {wd.map((w) => <div key={w} className="text-center text-[10px] uppercase text-muted">{w}</div>)}
        <div className="text-center text-[10px] uppercase text-muted">{TR("Week", "الأسبوع", "Sem.")[c.lang]}</div>
        {weeks.map((wk, wi) => {
          const tot = wk.reduce((s, k) => s + (k ? map.get(k)?.pnl ?? 0 : 0), 0), has = wk.some((k) => k && map.has(k));
          return [
            ...wk.map((k, i) => {
              const d = k ? map.get(k) : undefined;
              const a = d ? 0.14 + (Math.abs(d.pnl) / mx) * 0.4 : 0;
              return (
                <div key={`${wi}-${i}`} title={d ? `${k} · ${d.n}` : undefined} className="flex min-h-0 flex-col justify-between overflow-hidden rounded-md p-1 transition hover:ring-1 hover:ring-primary" style={{ background: d ? `color-mix(in srgb, ${d.pnl >= 0 ? GREEN : RED} ${a * 100}%, transparent)` : k ? "color-mix(in srgb,var(--text) 5%,transparent)" : "transparent" }}>
                  <span className="text-[9px] leading-none text-muted">{k ? Number(k.slice(8)) : ""}</span>
                  {d && <span className="tnum truncate text-center text-[10px] font-semibold leading-none" style={{ color: tone(d.pnl) }}>{c.hide ? "•••" : compact(d.pnl)}</span>}
                </div>
              );
            }),
            <div key={`t${wi}`} className="grid min-h-0 place-items-center rounded-md border border-border/70 text-[10px] font-semibold tnum" style={{ color: has && !c.hide ? tone(tot) : "var(--muted)" }}>{has ? (c.hide ? "•••" : compact(tot)) : "—"}</div>,
          ];
        })}
      </div>
    </div>
  );
}

const S = (label: L, c: Ctx) => label[c.lang];
export const DEFS: Def[] = [
  { id: "net", icon: <DollarSign size={14} />, min: { w: 2, h: 2 }, size: { w: 3, h: 2 }, name: TR("Net P&L", "صافي الربح والخسارة", "P&L net"), info: TR("Total profit or loss of all closed trades in the selected period.", "إجمالي ربح أو خسارة كل الصفقات المغلقة في الفترة المختارة.", "Résultat total des trades clôturés sur la période."),
    render: (c) => <Kpi value={money(c, c.m.net)} color={c.hide ? undefined : tone(c.m.net)} sub={`${c.m.n} ${S(TR("trades", "صفقة", "trades"), c)}`} /> },
  { id: "win", icon: <Percent size={14} />, min: { w: 2, h: 2 }, size: { w: 2, h: 2 }, name: TR("Trade win %", "نسبة ربح الصفقات", "Taux de trades gagnants"), info: TR("Winning trades ÷ closed trades.", "الصفقات الرابحة ÷ الصفقات المغلقة.", "Trades gagnants ÷ trades clôturés."),
    render: (c) => c.m.winRate == null ? <Empty lang={c.lang} /> : <Kpi value={`${fmt(c.m.winRate, 1)}%`} sub={`${c.m.wins}W · ${c.m.losses}L`} visual={<Donut pct={c.m.winRate} color={GREEN} label="" />} /> },
  { id: "pf", icon: <Scale size={14} />, min: { w: 2, h: 2 }, size: { w: 2, h: 2 }, name: TR("Profit factor", "معامل الربح", "Facteur de profit"), info: TR("Gross profit ÷ gross loss. Above 1 means profitable.", "إجمالي الربح ÷ إجمالي الخسارة. أعلى من 1 يعني رابحًا.", "Gains bruts ÷ pertes brutes. >1 = rentable."),
    render: (c) => c.m.pf == null ? (c.m.wins ? <Kpi value="∞" /> : <Empty lang={c.lang} />) : <Kpi value={fmt(c.m.pf)} visual={<HalfGauge v={c.m.pf} max={3} color={c.m.pf >= 1 ? GREEN : RED} />} /> },
  { id: "day", icon: <CalendarDays size={14} />, min: { w: 2, h: 2 }, size: { w: 2, h: 2 }, name: TR("Day win %", "نسبة ربح الأيام", "Jours gagnants"), info: TR("Profitable trading days ÷ all trading days.", "أيام التداول الرابحة ÷ كل أيام التداول.", "Jours gagnants ÷ jours de trading."),
    render: (c) => c.m.dayWinRate == null ? <Empty lang={c.lang} /> : <Kpi value={`${fmt(c.m.dayWinRate, 1)}%`} sub={`${c.m.days.length} ${S(TR("days", "يوم", "jours"), c)}`} visual={<Donut pct={c.m.dayWinRate} color={GREEN} label="" />} /> },
  { id: "avg", icon: <Scale size={14} />, min: { w: 2, h: 2 }, size: { w: 3, h: 2 }, name: TR("Avg win/loss trade", "متوسط الربح/الخسارة", "Gain/perte moyen"), info: TR("Average winning trade ÷ average losing trade.", "متوسط الصفقة الرابحة ÷ متوسط الصفقة الخاسرة.", "Gain moyen ÷ perte moyenne."),
    render: (c) => {
      if (!c.m.wins && !c.m.losses) return <Empty lang={c.lang} />;
      const t = c.m.avgWin + c.m.avgLoss || 1;
      return (
        <div className="flex h-full flex-col justify-center gap-1.5">
          <div className="tnum font-heading font-bold" style={{ fontSize: "clamp(1.2rem,min(24cqh,12cqw),2.6rem)", lineHeight: 1 }}>{c.m.ratio == null ? "∞" : fmt(c.m.ratio)}</div>
          <div dir="ltr" className="flex h-2.5 overflow-hidden rounded-full bg-border"><div style={{ width: `${(c.m.avgWin / t) * 100}%`, background: GREEN }} /><div style={{ width: `${(c.m.avgLoss / t) * 100}%`, background: RED }} /></div>
          <div className="tnum flex justify-between text-[11px]"><span style={{ color: GREEN }}>{money(c, c.m.avgWin)}</span><span style={{ color: RED }}>{c.hide ? "••••" : `-${fmt(c.m.avgLoss)}`}</span></div>
        </div>
      );
    } },
  { id: "score", icon: <Target size={14} />, min: { w: 3, h: 3 }, size: { w: 3, h: 4 }, name: TR("Mizan score", "درجة ميزان", "Score Mizan"), info: TR("0–100 from six metrics: win %, profit factor, avg win/loss, recovery factor, max drawdown and weekly consistency. Needs 5+ closed trades.", "من 0 إلى 100 من ستة مقاييس: نسبة الربح، معامل الربح، ربح/خسارة، عامل التعافي، أقصى سحب، واتساق الأسابيع. يلزم 5 صفقات مغلقة على الأقل.", "0–100 selon six mesures. Au moins 5 trades clôturés."), render: (c) => <ScoreW c={c} /> },
  { id: "cum", icon: <LineChart size={14} />, min: { w: 3, h: 3 }, size: { w: 5, h: 4 }, name: TR("Daily net cumulative P&L", "الربح التراكمي اليومي", "P&L cumulé quotidien"), info: TR("Running total of your daily net P&L.", "المجموع التراكمي لصافي ربحك اليومي.", "Cumul de votre P&L net quotidien."), render: (c) => <CumW c={c} /> },
  { id: "daily", icon: <BarChart3 size={14} />, min: { w: 3, h: 3 }, size: { w: 4, h: 4 }, name: TR("Net daily P&L", "صافي الربح اليومي", "P&L net quotidien"), info: TR("Net result of each trading day (last 60 days).", "نتيجة كل يوم تداول (آخر 60 يومًا).", "Résultat net par jour (60 derniers jours)."), render: (c) => <DailyW c={c} /> },
  { id: "trades", icon: <ListOrdered size={14} />, min: { w: 4, h: 3 }, size: { w: 7, h: 5 }, name: TR("Trades", "الصفقات", "Trades"), info: TR("Your latest closed trades and open positions.", "آخر صفقاتك المغلقة ومراكزك المفتوحة.", "Derniers trades clôturés et positions ouvertes."), render: (c) => <TradesW c={c} /> },
  { id: "cal", icon: <CalendarRange size={14} />, min: { w: 4, h: 4 }, size: { w: 5, h: 5 }, name: TR("P&L calendar", "تقويم الأرباح", "Calendrier P&L"), info: TR("Daily net P&L with weekly totals.", "صافي الربح اليومي مع مجاميع الأسابيع.", "P&L quotidien et totaux hebdomadaires."), render: (c) => <CalW c={c} /> },
  { id: "count", icon: <Hash size={14} />, min: { w: 2, h: 2 }, size: { w: 2, h: 2 }, name: TR("Trades", "عدد الصفقات", "Trades"), info: TR("Total trades in the selected period.", "إجمالي الصفقات في الفترة المختارة.", "Total des trades sur la période."), render: (c) => <Kpi value={String(c.trades.length)} sub={`${c.trades.length - c.closed.length} ${S(TR("open", "مفتوحة", "ouverts"), c)}`} /> },
  { id: "best", icon: <Trophy size={14} />, min: { w: 2, h: 2 }, size: { w: 3, h: 2 }, name: TR("Best & worst trade", "أفضل وأسوأ صفقة", "Meilleur & pire trade"), info: TR("Your biggest win and biggest loss.", "أكبر ربح وأكبر خسارة.", "Plus gros gain et plus grosse perte."),
    render: (c) => { if (!c.closed.length) return <Empty lang={c.lang} />; const p = c.closed.map((t) => t.pnl as number); return <div className="flex h-full flex-col justify-center gap-1"><div className="tnum font-heading font-bold" style={{ color: GREEN, fontSize: "clamp(1.1rem,min(24cqh,11cqw),2.4rem)" }}>{money(c, Math.max(...p))}</div><div className="tnum font-heading font-bold" style={{ color: RED, fontSize: "clamp(1.1rem,min(24cqh,11cqw),2.4rem)" }}>{money(c, Math.min(...p))}</div></div>; } },
  { id: "dir", icon: <Layers size={14} />, min: { w: 2, h: 2 }, size: { w: 3, h: 2 }, name: TR("Long vs short", "شراء مقابل بيع", "Long vs short"), info: TR("Direction split of your trades.", "توزيع اتجاه صفقاتك.", "Répartition des directions."),
    render: (c) => { const a = computeActivity(c.trades); if (!a) return <Empty lang={c.lang} />; return <div className="flex h-full flex-col justify-center gap-2"><div dir="ltr" className="flex h-3 overflow-hidden rounded-full bg-border"><div style={{ width: `${(a.long / a.trades) * 100}%`, background: GREEN }} /><div style={{ width: `${(a.short / a.trades) * 100}%`, background: RED }} /></div><div className="tnum flex justify-between text-sm"><span style={{ color: GREEN }}>{a.long}</span><span style={{ color: RED }}>{a.short}</span></div></div>; } },
  { id: "freq", icon: <Repeat size={14} />, min: { w: 2, h: 2 }, size: { w: 2, h: 2 }, name: TR("Trades per day", "الصفقات في اليوم", "Trades par jour"), info: TR("Average trades per trading day.", "متوسط الصفقات في يوم التداول.", "Moyenne par jour de trading."), render: (c) => { const a = computeActivity(c.trades); return a ? <Kpi value={fmt(a.perDay)} sub={`${a.tradingDays} ${S(TR("days", "يوم", "jours"), c)}`} /> : <Empty lang={c.lang} />; } },
];
export const DEFAULT_IDS = ["net", "win", "pf", "day", "avg", "score", "cum", "daily", "trades", "cal"];
export { Info };
