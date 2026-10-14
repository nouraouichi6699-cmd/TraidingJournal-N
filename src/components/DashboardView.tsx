import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GripVertical, LayoutGrid, Magnet, RotateCcw, Plus, X, Check, Pencil, DollarSign, Percent, Scale, Hash, LineChart, CalendarDays, Repeat, Trophy, ListOrdered, TrendingUp, Layers } from "lucide-react";
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
  <div className="flex h-full flex-col justify-center"><div className="tnum font-heading font-bold leading-none" style={{ color: color ?? "var(--primary)", fontSize: "clamp(1.3rem,min(30cqh,15cqw),4.5rem)" }}>{v}</div>{sub && <div className="mt-2 text-muted" style={{ fontSize: "clamp(.7rem,7cqh,1rem)" }}>{sub}</div>}</div>
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
    return <div className="flex h-full flex-col justify-center gap-1"><div className="tnum font-heading font-bold" style={{ color: GREEN, fontSize: "clamp(1.1rem,min(24cqh,11cqw),2.6rem)" }}>{money(c, a(w))}</div><div className="tnum font-heading font-bold" style={{ color: RED, fontSize: "clamp(1.1rem,min(24cqh,11cqw),2.6rem)" }}>{money(c, a(l))}</div></div>;
  } },
  { id: "best", icon: <Trophy size={16} />, name: TR("Best & worst trade", "أفضل وأسوأ صفقة", "Meilleur & pire trade"), desc: TR("Your biggest win and biggest loss", "أكبر ربح وأكبر خسارة", "Plus gros gain et plus grosse perte"), render: (c) => {
    if (!c.closed.length) return <Empty lang={c.lang} />;
    const p = c.closed.map((t) => t.pnl as number);
    return <div className="flex h-full flex-col justify-center gap-1"><div className="tnum font-heading font-bold" style={{ color: GREEN, fontSize: "clamp(1.1rem,min(24cqh,11cqw),2.6rem)" }}>{money(c, Math.max(...p))}</div><div className="tnum font-heading font-bold" style={{ color: RED, fontSize: "clamp(1.1rem,min(24cqh,11cqw),2.6rem)" }}>{money(c, Math.min(...p))}</div></div>;
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

type Item = { id: string; x: number; y: number; w: number; h: number; z: number };
const REF = 1200, ROW = 142, MINW = 150, MINH = 96, TH = 7, STEP = 12;
const defSize = (id: string) => (DEFS.find((d) => d.id === id)?.wide ? { c: 2, r: 1 } : { c: 1, r: 1 });

// Packs widgets into a tidy 4-column layout (also used for migrating the old grid format).
function pack(list: { id: string; c: number; r: number }[]): Item[] {
  const hts = [0, 0, 0, 0];
  return list.map((it, z) => {
    let best = 0, by = Infinity;
    for (let c = 0; c + it.c <= 4; c++) { const y = Math.max(...hts.slice(c, c + it.c)); if (y < by) { by = y; best = c; } }
    for (let k = best; k < best + it.c; k++) hts[k] = by + it.r;
    return { id: it.id, x: best / 4, y: by * ROW, w: (it.c * (REF / 4) - 12) / REF, h: it.r * ROW - 12, z };
  });
}
const loadItems = (): Item[] => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "null");
    if (Array.isArray(v)) {
      const ok = v.filter((x) => (typeof x === "string" ? x : x?.id) && DEFS.some((d) => d.id === (typeof x === "string" ? x : x.id)));
      if (ok.every((x) => typeof x === "object" && typeof x.x === "number")) return ok.map((x, z) => ({ ...x, z: x.z ?? z }));
      return pack(ok.map((x) => (typeof x === "string" ? { id: x, c: defSize(x).c, r: 1 } : { id: x.id, c: x.w || 1, r: x.h || 1 })));
    }
  } catch {}
  return pack(DEFAULT.map((id) => ({ id, c: defSize(id).c, r: 1 })));
};

type Dir = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: { d: Dir; cls: string; cur: string; dot?: boolean }[] = [
  { d: "nw", cls: "-left-1.5 -top-1.5", cur: "nwse-resize", dot: true }, { d: "ne", cls: "-right-1.5 -top-1.5", cur: "nesw-resize", dot: true },
  { d: "sw", cls: "-left-1.5 -bottom-1.5", cur: "nesw-resize", dot: true }, { d: "se", cls: "-right-1.5 -bottom-1.5", cur: "nwse-resize", dot: true },
  { d: "n", cls: "left-3 right-3 -top-1.5 h-3", cur: "ns-resize" }, { d: "s", cls: "left-3 right-3 -bottom-1.5 h-3", cur: "ns-resize" },
  { d: "w", cls: "top-3 bottom-3 -left-1.5 w-3", cur: "ew-resize" }, { d: "e", cls: "top-3 bottom-3 -right-1.5 w-3", cur: "ew-resize" },
];

export default function DashboardView({ t: _t, lang, trades }: Props) {
  const { editing, toggle } = useDashEdit();
  const { hidden } = usePrivacy();
  const [items, setItems] = useState<Item[]>(loadItems);
  const [snap, setSnap] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; label: string } | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [W, setW] = useState(REF);
  const box = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items); itemsRef.current = items;
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(items)); } catch {} }, [items]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || REF)); ro.observe(el); setW(el.clientWidth || REF);
    return () => ro.disconnect();
  }, []);
  const c: Ctx = useMemo(() => ({ trades, closed: trades.filter((x) => x.status === "closed" && x.pnl != null), s: computeStats(trades), hide: hidden, lang }), [trades, hidden, lang]);
  const L = (l: L) => l[lang];
  const narrow = W < 640;
  const can = editing && !narrow;
  const avail = DEFS.filter((d) => !items.some((i) => i.id === d.id));
  const bottom = Math.max(0, ...items.map((i) => i.y + i.h));
  const canvasH = narrow ? undefined : Math.max(can ? 560 : 300, bottom + (can ? 160 : 24));

  const add = (id: string) => setItems((a) => {
    const { c: cc } = defSize(id);
    const w = (cc * (REF / 4) - 12) / REF;
    return [...a, { id, x: 0, y: a.length ? Math.max(...a.map((i) => i.y + i.h)) + STEP : 0, w, h: ROW - 12, z: Math.max(0, ...a.map((i) => i.z)) + 1 }];
  });

  const begin = (e: React.PointerEvent, it: Item, dir: Dir) => {
    if (!can || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setSel(it.id);
    const z = Math.max(0, ...itemsRef.current.map((i) => i.z)) + 1;
    setItems((a) => a.map((x) => (x.id === it.id ? { ...x, z } : x)));
    const r0 = { x: it.x * W, y: it.y, w: it.w * W, h: it.h };
    const x0 = e.clientX, y0 = e.clientY;
    const others = itemsRef.current.filter((o) => o.id !== it.id).map((o) => ({ l: o.x * W, r: (o.x + o.w) * W, t: o.y, b: o.y + o.h }));
    const xs = [0, W / 2, W, ...others.flatMap((o) => [o.l, (o.l + o.r) / 2, o.r])];
    const ys = [0, ...others.flatMap((o) => [o.t, (o.t + o.b) / 2, o.b])];
    const near = (v: number, list: number[]) => { let d = TH + 1, hit: number | null = null; for (const q of list) { const k = Math.abs(q - v); if (k < d) { d = k; hit = q; } } return hit; };
    const mv = (ev: PointerEvent) => {
      const free = ev.altKey || !snap;
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      let { x, y, w, h } = r0;
      if (dir === "move") { x += dx; y += dy; }
      else {
        if (dir.includes("e")) w = r0.w + dx;
        if (dir.includes("s")) h = r0.h + dy;
        if (dir.includes("w")) { w = r0.w - dx; x = r0.x + dx; }
        if (dir.includes("n")) { h = r0.h - dy; y = r0.y + dy; }
      }
      const gv: number[] = [], gh: number[] = [];
      if (!free) {
        const sx = (v: number) => { const q = near(v, xs); if (q != null) { gv.push(q); return q; } return Math.round(v / STEP) * STEP; };
        const sy = (v: number) => { const q = near(v, ys); if (q != null) { gh.push(q); return q; } return Math.round(v / STEP) * STEP; };
        if (dir === "move") {
          const cand = [x, x + w / 2, x + w].map((v, i) => ({ q: near(v, xs), i, v })).filter((k) => k.q != null);
          if (cand.length) { const k = cand.sort((a, b) => Math.abs(a.q! - a.v) - Math.abs(b.q! - b.v))[0]; x += k.q! - k.v; gv.push(k.q!); } else x = Math.round(x / STEP) * STEP;
          const cy = [y, y + h / 2, y + h].map((v) => ({ q: near(v, ys), v })).filter((k) => k.q != null);
          if (cy.length) { const k = cy.sort((a, b) => Math.abs(a.q! - a.v) - Math.abs(b.q! - b.v))[0]; y += k.q! - k.v; gh.push(k.q!); } else y = Math.round(y / STEP) * STEP;
        } else {
          if (dir.includes("e")) { w = sx(x + w) - x; }
          if (dir.includes("w")) { const R = x + w; x = sx(x); w = R - x; }
          if (dir.includes("s")) { h = sy(y + h) - y; }
          if (dir.includes("n")) { const B = y + h; y = sy(y); h = B - y; }
        }
      }
      if (dir !== "move") {
        if (w < MINW) { if (dir.includes("w")) x = r0.x + r0.w - MINW; w = MINW; }
        if (h < MINH) { if (dir.includes("n")) y = r0.y + r0.h - MINH; h = MINH; }
      }
      x = Math.max(0, Math.min(x, W - w)); w = Math.min(w, W - x); y = Math.max(0, y);
      setGuides({ v: gv, h: gh });
      setActive({ id: it.id, label: dir === "move" ? `${Math.round(x)}, ${Math.round(y)}` : `${Math.round(w)} × ${Math.round(h)}` });
      setItems((a) => a.map((q) => (q.id === it.id ? { ...q, x: x / W, y, w: w / W, h } : q)));
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); setGuides({ v: [], h: [] }); setActive(null); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  const order = narrow ? [...items].sort((a, b) => a.y - b.y || a.x - b.x) : items;
  const TT = {
    title: TR("Dashboard", "لوحة التحكم", "Tableau de bord"), custom: TR("Customize", "تخصيص", "Personnaliser"), done: TR("Done", "تم", "Terminé"),
    tools: TR("Analysis tools — press + to add to your dashboard", "أدوات التحليل — اضغط + لإضافتها إلى لوحتك", "Outils d'analyse — appuyez sur + pour ajouter"),
    all: TR("Everything is already on your dashboard.", "كل الأدوات مضافة إلى لوحتك.", "Tout est déjà sur votre tableau de bord."),
    snap: TR("Smart snap", "المحاذاة الذكية", "Aimantation"), arrange: TR("Auto-arrange", "ترتيب تلقائي", "Organiser"), hint: TR("Drag anywhere · pull any edge or corner · hold Alt for free movement", "اسحب من أي مكان · اسحب أي حافة أو زاوية · اضغط Alt للحركة الحرة", "Glissez partout · tirez un bord ou un coin · Alt = mouvement libre"),
    empty: TR("Your dashboard is empty. Press Customize to add tools.", "لوحتك فارغة. اضغط تخصيص لإضافة الأدوات.", "Tableau vide. Appuyez sur Personnaliser."),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-lg font-semibold">{L(TT.title)}</h1>
        <div className="flex items-center gap-2">
          {can && (
            <>
              <button type="button" aria-pressed={snap} onClick={() => setSnap(!snap)} className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium ${snap ? "border-primary text-primary" : "border-border text-muted"}`}><Magnet size={14} />{L(TT.snap)}</button>
              <button type="button" onClick={() => setItems(pack([...items].sort((a, b) => a.y - b.y || a.x - b.x).map((i) => ({ id: i.id, c: defSize(i.id).c, r: 1 }))))} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-primary-tint"><LayoutGrid size={14} />{L(TT.arrange)}</button>
              <button type="button" aria-label="reset" onClick={() => setItems(pack(DEFAULT.map((id) => ({ id, c: defSize(id).c, r: 1 }))))} className="icon-btn !h-8 !w-8"><RotateCcw size={14} className="text-icon" /></button>
            </>
          )}
          <button type="button" onClick={toggle} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium ${editing ? "border-primary bg-primary text-on-primary" : "border-border bg-surface hover:bg-primary-tint"}`}>
            {editing ? <Check size={15} /> : <Pencil size={15} />}{editing ? L(TT.done) : L(TT.custom)}
          </button>
        </div>
      </div>

      {can && (
        <div className="rounded-2xl border border-primary/40 bg-primary-tint p-4">
          <div className="mb-1 text-sm font-semibold">{L(TT.tools)}</div>
          <div className="mb-3 text-[11px] text-muted">{L(TT.hint)}</div>
          {avail.length === 0 ? <div className="text-xs text-muted">{L(TT.all)}</div> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {avail.map((d) => (
                <button key={d.id} type="button" onClick={() => add(d.id)} className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-start transition hover:border-primary">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-icon">{d.icon}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{L(d.name)}</span><span className="block truncate text-[11px] text-muted">{L(d.desc)}</span></span>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-on-primary transition group-hover:scale-110"><Plus size={15} /></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {items.length === 0 && !can ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">{L(TT.empty)}</div>
      ) : (
        <div ref={box} dir="ltr" onPointerDown={() => setSel(null)} className={narrow ? "flex flex-col gap-3" : "relative rounded-2xl"} style={{ height: canvasH, backgroundImage: can ? "radial-gradient(circle, color-mix(in srgb,var(--text) 16%,transparent) 1px, transparent 1.5px)" : undefined, backgroundSize: "24px 24px", outline: can ? "1px dashed color-mix(in srgb,var(--primary) 35%,transparent)" : undefined, outlineOffset: 6 }}>
          {order.map((it) => {
            const d = DEFS.find((x) => x.id === it.id)!;
            const on = can && sel === it.id;
            const busy = active?.id === it.id;
            return (
              <div key={it.id} onPointerDown={(e) => begin(e, it, "move")} dir={lang === "ar" ? "rtl" : "ltr"}
                className={`flex flex-col rounded-2xl border p-4 ${narrow ? "" : "absolute"} ${can ? "cursor-grab select-none" : "transition-shadow hover:shadow-lg"} ${busy ? "cursor-grabbing" : ""}`}
                style={{
                  ...(narrow ? { height: Math.max(it.h, 130) } : { left: it.x * W, top: it.y, width: it.w * W, height: it.h, zIndex: it.z }),
                  background: "linear-gradient(150deg, var(--surface), color-mix(in srgb, var(--surface) 90%, var(--primary) 10%))",
                  borderColor: on || busy ? "var(--primary)" : can ? "color-mix(in srgb,var(--primary) 40%,var(--border))" : "var(--border)",
                  boxShadow: busy ? "0 18px 40px -12px rgba(0,0,0,.55), 0 0 0 1px var(--primary)" : on ? "0 0 0 3px color-mix(in srgb,var(--primary) 25%,transparent)" : undefined,
                  transition: busy ? "none" : "box-shadow .2s, border-color .2s",
                  touchAction: can ? "none" : undefined,
                }}>
                <div className="mb-2 flex shrink-0 items-center gap-2 text-xs text-muted">{can && <GripVertical size={14} className="text-icon" />}<span className="text-icon">{d.icon}</span><span className="truncate">{L(d.name)}</span></div>
                <div className="min-h-0 flex-1 overflow-hidden" style={{ containerType: "size" }}><div className="h-full w-full">{d.render(c)}</div></div>
                {can && (
                  <>
                    <button type="button" aria-label="remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => setItems((a) => a.filter((x) => x.id !== it.id))} className="icon-btn absolute end-2 top-2 !h-7 !w-7 !bg-bg/70"><X size={13} style={{ color: RED }} /></button>
                    {HANDLES.map((h) => (
                      <span key={h.d} onPointerDown={(e) => begin(e, it, h.d)} className={`absolute z-10 grid place-items-center ${h.cls} ${h.dot ? "h-3.5 w-3.5" : ""}`} style={{ cursor: h.cur, touchAction: "none" }}>
                        {h.dot ? <span className={`block h-2.5 w-2.5 rounded-full border-2 border-primary bg-bg transition ${on || busy ? "scale-100" : "scale-75 opacity-70"}`} /> : <span className={`block rounded-full bg-primary/60 ${h.d === "n" || h.d === "s" ? "h-[3px] w-8" : "h-8 w-[3px]"} ${on || busy ? "opacity-100" : "opacity-0"}`} />}
                      </span>
                    ))}
                  </>
                )}
                {busy && <div className="tnum pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-on-primary shadow">{active!.label}</div>}
              </div>
            );
          })}
          {guides.v.map((x, i) => <div key={"v" + i} className="pointer-events-none absolute inset-y-0 z-[999] w-px bg-primary" style={{ left: x, boxShadow: "0 0 6px var(--primary)" }} />)}
          {guides.h.map((y, i) => <div key={"h" + i} className="pointer-events-none absolute inset-x-0 z-[999] h-px bg-primary" style={{ top: y, boxShadow: "0 0 6px var(--primary)" }} />)}
        </div>
      )}
    </div>
  );
}
