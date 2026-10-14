import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GripVertical, MoveDiagonal2, Plus, X, Check, Pencil, DollarSign, Percent, Scale, Hash, LineChart, CalendarDays, Repeat, Trophy, ListOrdered, TrendingUp, Layers } from "lucide-react";
import { useDashEdit } from "../useDashEdit";
import { usePrivacy } from "../usePrivacy";
import { computeStats, fmt } from "../lib/stats";
import { computeActivity } from "../lib/activity";
import type { Key } from "../i18n";
import type { Lang, Trade } from "../types";

interface Props { t: (k: Key) => string; lang: Lang; trades: Trade[] }
type L = Record<Lang, string>;
const TR = (en: string, ar: string, fr: string): L => ({ en, ar, fr });
const STORE = "mizan-dashboard";
const GREEN = "#22c55e", RED = "#f87171";

interface Ctx { trades: Trade[]; closed: Trade[]; s: ReturnType<typeof computeStats>; hide: boolean; lang: Lang }
interface Def { id: string; icon: ReactNode; name: L; desc: L; wide?: boolean; render: (c: Ctx) => ReactNode }

const money = (c: Ctx, n: number) => (c.hide ? "••••" : `${n > 0 ? "+" : ""}${fmt(n)}`);
const tone = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : undefined);

const Big = ({ v, color, sub }: { v: string; color?: string; sub?: string }) => (
  <div className="flex h-full flex-col justify-center"><div className="tnum font-heading text-3xl font-bold" style={{ color: color ?? "var(--primary)" }}>{v}</div>{sub && <div className="mt-1 text-xs text-muted">{sub}</div>}</div>
);
const Empty = ({ lang }: { lang: Lang }) => <div className="grid h-full place-items-center text-xs text-muted">{TR("No data yet", "لا توجد بيانات بعد", "Pas encore de données")[lang]}</div>;

function Equity({ c }: { c: Ctx }) {
  const sorted = [...c.closed].sort((a, b) => (a.exitTime || a.entryTime || "").localeCompare(b.exitTime || b.entryTime || ""));
  if (sorted.length < 2) return <Empty lang={c.lang} />;
  let run = 0;
  const pts = [0, ...sorted.map((t) => (run += t.pnl as number))];
  const mn = Math.min(...pts), mx = Math.max(...pts), rg = mx - mn || 1;
  const W = 300, H = 110;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 8 - ((v - mn) / rg) * (H - 16)] as const);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const col = run >= 0 ? GREEN : RED;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
      <defs><linearGradient id="eqg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".3" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#eqg)" />
      <path d={d} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Bars({ c }: { c: Ctx }) {
  const v = Array(7).fill(0);
  for (const t of c.closed) if (t.entryTime) v[(new Date(t.entryTime.slice(0, 10) + "T00:00:00Z").getUTCDay() + 6) % 7] += t.pnl as number;
  if (!c.closed.length) return <Empty lang={c.lang} />;
  const mx = Math.max(...v.map(Math.abs), 1);
  const names = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(c.lang, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))));
  return (
    <div dir="ltr" className="flex h-full items-center gap-1.5">
      {v.map((x, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center" title={c.hide ? "" : fmt(x)}>
          <div className="flex w-full flex-1 flex-col justify-end"><div className="w-full rounded-t" style={{ height: x > 0 ? `${(x / mx) * 100}%` : 0, background: GREEN, opacity: 0.85 }} /></div>
          <div className="h-px w-full bg-border" />
          <div className="flex w-full flex-1 flex-col"><div className="w-full rounded-b" style={{ height: x < 0 ? `${(-x / mx) * 100}%` : 0, background: RED, opacity: 0.85 }} /></div>
          <span className="mt-1 text-[10px] text-muted">{names[i]}</span>
        </div>
      ))}
    </div>
  );
}

const DEFS: Def[] = [
  { id: "net", icon: <DollarSign size={16} />, name: TR("Net P&L", "صافي الربح والخسارة", "P&L net"), desc: TR("Total profit or loss of closed trades", "إجمالي ربح أو خسارة الصفقات المغلقة", "Résultat total des trades clôturés"), render: (c) => <Big v={money(c, c.s.net)} color={c.hide ? undefined : tone(c.s.net)} /> },
  { id: "win", icon: <Percent size={16} />, name: TR("Win rate", "نسبة الربح", "Taux de réussite"), desc: TR("Share of winning trades", "نسبة الصفقات الرابحة", "Part des trades gagnants"), render: (c) => <Big v={c.s.winRate == null ? "—" : `${fmt(c.s.winRate, 1)}%`} sub={`${c.s.wins} / ${c.s.closed}`} /> },
  { id: "pf", icon: <Scale size={16} />, name: TR("Profit factor", "معامل الربح", "Facteur de profit"), desc: TR("Gross profit ÷ gross loss", "إجمالي الربح ÷ إجمالي الخسارة", "Gains bruts ÷ pertes brutes"), render: (c) => <Big v={c.s.profitFactor == null ? "—" : fmt(c.s.profitFactor)} /> },
  { id: "count", icon: <Hash size={16} />, name: TR("Trades", "عدد الصفقات", "Trades"), desc: TR("Total trades imported", "إجمالي الصفقات المستوردة", "Total des trades importés"), render: (c) => <Big v={String(c.s.count)} sub={`${c.s.open} ${TR("open", "مفتوحة", "ouverts")[c.lang]}`} /> },
  { id: "avg", icon: <TrendingUp size={16} />, name: TR("Avg win / loss", "متوسط الربح / الخسارة", "Gain / perte moy."), desc: TR("Average winning vs losing trade", "متوسط الصفقة الرابحة مقابل الخاسرة", "Gain moyen vs perte moyenne"), render: (c) => {
    const w = c.closed.filter((t) => (t.pnl as number) > 0), l = c.closed.filter((t) => (t.pnl as number) < 0);
    const a = (x: Trade[]) => (x.length ? x.reduce((s, t) => s + (t.pnl as number), 0) / x.length : 0);
    return <div className="flex h-full flex-col justify-center gap-1"><div className="tnum font-heading text-xl font-bold" style={{ color: GREEN }}>{money(c, a(w))}</div><div className="tnum font-heading text-xl font-bold" style={{ color: RED }}>{money(c, a(l))}</div></div>;
  } },
  { id: "best", icon: <Trophy size={16} />, name: TR("Best & worst trade", "أفضل وأسوأ صفقة", "Meilleur & pire trade"), desc: TR("Your biggest win and biggest loss", "أكبر ربح وأكبر خسارة", "Plus gros gain et plus grosse perte"), render: (c) => {
    if (!c.closed.length) return <Empty lang={c.lang} />;
    const p = c.closed.map((t) => t.pnl as number);
    return <div className="flex h-full flex-col justify-center gap-1"><div className="tnum font-heading text-xl font-bold" style={{ color: GREEN }}>{money(c, Math.max(...p))}</div><div className="tnum font-heading text-xl font-bold" style={{ color: RED }}>{money(c, Math.min(...p))}</div></div>;
  } },
  { id: "equity", icon: <LineChart size={16} />, wide: true, name: TR("Equity curve", "منحنى الأرباح التراكمية", "Courbe de capital"), desc: TR("Cumulative P&L over your trades", "الربح التراكمي عبر صفقاتك", "P&L cumulé"), render: (c) => (c.hide ? <div className="grid h-full place-items-center text-xs text-muted">••••</div> : <Equity c={c} />) },
  { id: "weekday", icon: <CalendarDays size={16} />, wide: true, name: TR("P&L by weekday", "الربح حسب اليوم", "P&L par jour"), desc: TR("Which weekdays make or lose you money", "أي الأيام تربحك وأيها تخسرك", "Quels jours rapportent ou coûtent"), render: (c) => <Bars c={c} /> },
  { id: "dir", icon: <Layers size={16} />, name: TR("Long vs short", "شراء مقابل بيع", "Long vs short"), desc: TR("Direction split of your trades", "توزيع اتجاه صفقاتك", "Répartition des directions"), render: (c) => {
    const a = computeActivity(c.trades); if (!a) return <Empty lang={c.lang} />;
    return <div className="flex h-full flex-col justify-center gap-2"><div dir="ltr" className="flex h-3 overflow-hidden rounded-full bg-border"><div style={{ width: `${(a.long / a.trades) * 100}%`, background: GREEN }} /><div style={{ width: `${(a.short / a.trades) * 100}%`, background: RED }} /></div><div className="tnum flex justify-between text-sm"><span style={{ color: GREEN }}>{a.long}</span><span style={{ color: RED }}>{a.short}</span></div></div>;
  } },
  { id: "freq", icon: <Repeat size={16} />, name: TR("Trades per day", "الصفقات في اليوم", "Trades par jour"), desc: TR("Average trades per trading day", "متوسط الصفقات في يوم التداول", "Moyenne par jour de trading"), render: (c) => { const a = computeActivity(c.trades); return a ? <Big v={fmt(a.perDay)} sub={`${a.tradingDays} ${TR("days", "يوم", "jours")[c.lang]}`} /> : <Empty lang={c.lang} />; } },
  { id: "recent", icon: <ListOrdered size={16} />, wide: true, name: TR("Recent trades", "آخر الصفقات", "Derniers trades"), desc: TR("Your latest five trades", "آخر خمس صفقات", "Vos cinq derniers trades"), render: (c) => {
    const r = [...c.trades].sort((a, b) => (b.entryTime || "").localeCompare(a.entryTime || "")).slice(0, 5);
    if (!r.length) return <Empty lang={c.lang} />;
    return <div className="space-y-1.5 text-xs">{r.map((t, i) => <div key={i} className="flex items-center justify-between gap-2"><span className="truncate font-medium">{t.symbol}</span><span className="text-muted" style={{ color: t.side === "long" ? GREEN : RED }}>{t.side}</span><span className="tnum" style={{ color: t.pnl == null || c.hide ? undefined : tone(t.pnl) }}>{t.pnl == null ? "—" : money(c, t.pnl)}</span></div>)}</div>;
  } },
];
const DEFAULT = ["net", "win", "pf", "count", "equity", "weekday"];

export default function DashboardView({ t: _t, lang, trades }: Props) {
  const { editing, toggle } = useDashEdit();
  const { hidden } = usePrivacy();
  type Item = { id: string; w: number; h: number };
  const [items, setItems] = useState<Item[]>(() => {
    const dflt = (id: string): Item => ({ id, w: DEFS.find((d) => d.id === id)?.wide ? 2 : 1, h: 1 });
    try {
      const v = JSON.parse(localStorage.getItem(STORE) || "null");
      if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? dflt(x) : { id: x.id, w: Math.min(4, Math.max(1, x.w | 0 || 1)), h: Math.min(3, Math.max(1, x.h | 0 || 1)) })).filter((x) => DEFS.some((d) => d.id === x.id));
    } catch {}
    return DEFAULT.map(dflt);
  });
  const ids = items.map((i) => i.id);
  const [drag, setDrag] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(items)); } catch {} }, [items]);
  const dropOn = (target: string) => setItems((a) => {
    if (!drag || drag === target) return a;
    const from = a.findIndex((x) => x.id === drag), to = a.findIndex((x) => x.id === target);
    const b = [...a]; const [m] = b.splice(from, 1); b.splice(to, 0, m); return b;
  });
  const startResize = (e: React.PointerEvent, it: Item) => {
    e.preventDefault(); e.stopPropagation();
    const card = (e.currentTarget as HTMLElement).parentElement!;
    const r = card.getBoundingClientRect();
    const cu = (r.width + 12) / it.w, ru = (r.height + 12) / it.h;
    const x0 = e.clientX, y0 = e.clientY;
    const rtl = document.dir === "rtl" || getComputedStyle(card).direction === "rtl";
    const mv = (ev: PointerEvent) => {
      const dx = (rtl ? -1 : 1) * (ev.clientX - x0), dy = ev.clientY - y0;
      const w = Math.min(4, Math.max(1, Math.round((r.width + dx + 12) / cu)));
      const h = Math.min(3, Math.max(1, Math.round((r.height + dy + 12) / ru)));
      setItems((a) => a.map((x) => (x.id === it.id && (x.w !== w || x.h !== h) ? { ...x, w, h } : x)));
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const c: Ctx = useMemo(() => ({ trades, closed: trades.filter((x) => x.status === "closed" && x.pnl != null), s: computeStats(trades), hide: hidden, lang }), [trades, hidden, lang]);
  const L = (l: L) => l[lang];
  const avail = DEFS.filter((d) => !ids.includes(d.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-lg font-semibold">{TR("Dashboard", "لوحة التحكم", "Tableau de bord")[lang]}</h1>
        <button type="button" onClick={toggle} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium ${editing ? "border-primary bg-primary text-on-primary" : "border-border bg-surface hover:bg-primary-tint"}`}>
          {editing ? <Check size={15} /> : <Pencil size={15} />}{editing ? TR("Done", "تم", "Terminé")[lang] : TR("Customize", "تخصيص", "Personnaliser")[lang]}
        </button>
      </div>

      {editing && (
        <div className="rounded-2xl border border-primary/40 bg-primary-tint p-4">
          <div className="mb-3 text-sm font-semibold">{TR("Analysis tools — press + to add to your dashboard", "أدوات التحليل — اضغط + لإضافتها إلى لوحتك", "Outils d'analyse — appuyez sur + pour ajouter")[lang]}</div>
          {avail.length === 0 ? <div className="text-xs text-muted">{TR("Everything is already on your dashboard.", "كل الأدوات مضافة إلى لوحتك.", "Tout est déjà sur votre tableau de bord.")[lang]}</div> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {avail.map((d) => (
                <button key={d.id} type="button" onClick={() => setItems((a) => [...a, { id: d.id, w: d.wide ? 2 : 1, h: 1 }])} className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-start transition hover:border-primary">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-icon">{d.icon}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{L(d.name)}</span><span className="block truncate text-[11px] text-muted">{L(d.desc)}</span></span>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-on-primary"><Plus size={15} /></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">{TR("Your dashboard is empty. Press Customize to add tools.", "لوحتك فارغة. اضغط تخصيص لإضافة الأدوات.", "Tableau vide. Appuyez sur Personnaliser.")[lang]}</div>
      ) : (
        <div className="grid grid-flow-dense grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" style={{ gridAutoRows: 130 }}>
          {items.map((it) => {
            const d = DEFS.find((x) => x.id === it.id)!;
            return (
              <div key={it.id} data-w={it.w} draggable={editing} onDragStart={() => setDrag(it.id)} onDragEnd={() => setDrag(null)} onDragOver={(e) => { if (editing && drag) { e.preventDefault(); } }} onDrop={() => dropOn(it.id)}
                className={`dash-card relative flex flex-col overflow-hidden rounded-2xl border bg-surface p-4 ${editing ? "cursor-grab border-primary/50" : "border-border"} ${drag === it.id ? "opacity-40" : ""}`} style={{ ["--w" as string]: it.w, ["--h" as string]: it.h }}>
                <div className="mb-2 flex items-center gap-2 text-xs text-muted">{editing && <GripVertical size={14} className="text-icon" />}<span className="text-icon">{d.icon}</span>{L(d.name)}</div>
                <div className="min-h-0 flex-1">{d.render(c)}</div>
                {editing && (
                  <>
                    <button type="button" aria-label="remove" onClick={() => setItems((a) => a.filter((x) => x.id !== it.id))} className="icon-btn absolute end-2 top-2 !h-7 !w-7"><X size={13} style={{ color: RED }} /></button>
                    <span onPointerDown={(e) => startResize(e, it)} role="separator" aria-label="resize" className="absolute bottom-1 end-1 grid h-6 w-6 cursor-nwse-resize place-items-center rounded-md bg-primary-tint text-icon" style={{ touchAction: "none" }}><MoveDiagonal2 size={13} className="rtl:-scale-x-100" /></span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
