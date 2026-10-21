import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { GripVertical, LayoutGrid, RotateCcw, Plus, X, Check, Pencil, Info } from "lucide-react";
import { useDashEdit } from "../useDashEdit";
import { usePrivacy } from "../usePrivacy";
import { metrics } from "../lib/dashStats";
import { dayKey } from "../lib/dashStats";
import { DEFS, DEFAULT_IDS, TR, RED, type Ctx } from "./dashWidgets";
import type { Key } from "../i18n";
import { commonCurrency } from "../lib/money";
import type { CashFlow } from "../lib/cashflow";
import type { Account, Lang, Trade } from "../types";

interface Props { t: (k: Key) => string; lang: Lang; accounts: Account[]; trades: Trade[]; flows?: CashFlow[] }
const STORE = "mizan-dashboard-v2", FILTER = "mizan-dash-filter";
const COLS = 12, PAD = 8;

type Cell = { id: string; x: number; y: number; w: number; h: number };
const hit = (a: Cell, b: Cell) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const def = (id: string) => DEFS.find((d) => d.id === id)!;

/** Vertical compaction: nothing overlaps, nothing floats. `fixed` keeps its spot and others flow around it. */
function settle(list: Cell[], fixedId?: string): Cell[] {
  const fixed = fixedId ? list.find((i) => i.id === fixedId) : undefined;
  const placed: Cell[] = fixed ? [fixed] : [];
  for (const it of list.filter((i) => i !== fixed).sort((a, b) => a.y - b.y || a.x - b.x)) {
    let y = 0;
    while (placed.some((p) => hit(p, { ...it, y }))) y++;
    placed.push({ ...it, y });
  }
  return list.map((i) => placed.find((p) => p.id === i.id)!);
}
function flow(ids: string[]): Cell[] {
  const out: Cell[] = []; let x = 0, y = 0, rowH = 0;
  for (const id of ids) {
    const { w, h } = def(id).size;
    if (x + w > COLS) { x = 0; y += rowH; rowH = 0; }
    out.push({ id, x, y, w, h }); x += w; rowH = Math.max(rowH, h);
  }
  return out;
}
const load = (): Cell[] => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "null");
    if (Array.isArray(v) && v.every((c) => c && typeof c.x === "number" && DEFS.some((d) => d.id === c.id))) return settle(v);
  } catch { }
  return flow(DEFAULT_IDS);
};

type Dir = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: { d: Dir; cls: string; cur: string; dot?: boolean }[] = [
  { d: "nw", cls: "-left-1.5 -top-1.5", cur: "nwse-resize", dot: true }, { d: "ne", cls: "-right-1.5 -top-1.5", cur: "nesw-resize", dot: true },
  { d: "sw", cls: "-left-1.5 -bottom-1.5", cur: "nesw-resize", dot: true }, { d: "se", cls: "-right-1.5 -bottom-1.5", cur: "nwse-resize", dot: true },
  { d: "n", cls: "left-3 right-3 -top-1.5 h-3", cur: "ns-resize" }, { d: "s", cls: "left-3 right-3 -bottom-1.5 h-3", cur: "ns-resize" },
  { d: "w", cls: "top-3 bottom-3 -left-1.5 w-3", cur: "ew-resize" }, { d: "e", cls: "top-3 bottom-3 -right-1.5 w-3", cur: "ew-resize" },
];

const RANGES = ["all", "7", "30", "90", "ytd", "month"] as const;
const rangeLabel: Record<string, ReturnType<typeof TR>> = {
  all: TR("All time", "كل الفترات", "Tout"), "7": TR("Last 7 days", "آخر 7 أيام", "7 derniers jours"), "30": TR("Last 30 days", "آخر 30 يومًا", "30 derniers jours"),
  "90": TR("Last 90 days", "آخر 90 يومًا", "90 derniers jours"), ytd: TR("Year to date", "منذ بداية السنة", "Depuis janvier"), month: TR("This month", "هذا الشهر", "Ce mois"),
};
const fromKey = (r: string) => {
  const d = new Date();
  if (r === "ytd") return `${d.getFullYear()}-01-01`;
  if (r === "month") return d.toISOString().slice(0, 7) + "-01";
  if (r === "all") return "";
  d.setDate(d.getDate() - Number(r)); return d.toISOString().slice(0, 10);
};

export default function DashboardView({ lang, accounts, trades: all, flows = [] }: Props) {
  const { editing, toggle } = useDashEdit();
  const { hidden } = usePrivacy();
  const [cells, setCells] = useState<Cell[]>(load);
  const [drag, setDrag] = useState<{ id: string; px: { x: number; y: number; w: number; h: number }; cell: Cell } | null>(null);
  const [W, setW] = useState(1200);
  const [vh, setVh] = useState(typeof window === "undefined" ? 900 : window.innerHeight);
  const [filter, setFilter] = useState<{ acc: string; range: string }>(() => { try { return { acc: "all", range: "all", ...JSON.parse(localStorage.getItem(FILTER) || "{}") }; } catch { return { acc: "all", range: "all" }; } });
  const box = useRef<HTMLDivElement>(null);
  const cellsRef = useRef(cells); cellsRef.current = cells;
  const L = (l: ReturnType<typeof TR>) => l[lang];

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(cells)); } catch { } }, [cells]);
  useEffect(() => { try { localStorage.setItem(FILTER, JSON.stringify(filter)); } catch { } }, [filter]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 1200)); ro.observe(el); setW(el.clientWidth || 1200);
    const on = () => setVh(window.innerHeight); window.addEventListener("resize", on);
    return () => { ro.disconnect(); window.removeEventListener("resize", on); };
  }, []);

  const acc = accounts.some((a) => a.id === filter.acc) ? filter.acc : "all"; // stale saved account falls back to all
  const trades = useMemo(() => {
    const from = fromKey(filter.range);
    return all.filter((t) => (acc === "all" || t.accountId === acc) && (!from || (dayKey(t) || "9") >= from));
  }, [all, acc, filter.range]);
  const c: Ctx = useMemo(() => { const closed = trades.filter((x) => x.status === "closed" && x.pnl != null); return { trades, closed, m: metrics(closed), hide: hidden, lang, start: accounts.filter((a) => acc === "all" || a.id === acc).reduce((x, a) => x + (a.startBalance || 0), 0), cur: commonCurrency(accounts.filter((a) => acc === "all" || a.id === acc)),
    allClosed: all.filter((x) => (acc === "all" || x.accountId === acc) && x.status === "closed" && x.pnl != null), flows: flows.filter((f) => acc === "all" || f.accountId === acc), from: fromKey(filter.range) }; }, [trades, hidden, lang, accounts, acc, all, flows, filter.range]);

  const narrow = W < 640;
  const can = editing && !narrow;
  const colW = W / COLS;
  const rowH = Math.max(58, Math.min(108, Math.floor((vh - 185) / 11)));
  const live = useMemo(() => (drag ? settle(cells.map((i) => (i.id === drag.id ? drag.cell : i)), drag.id) : cells), [cells, drag]);
  const rows = Math.max(0, ...live.map((i) => i.y + i.h));
  const avail = DEFS.filter((d) => !cells.some((i) => i.id === d.id));

  const add = (id: string) => setCells((a) => settle([...a, { id, x: 0, y: Math.max(0, ...a.map((i) => i.y + i.h)), ...def(id).size }]));

  const begin = (e: React.PointerEvent, it: Cell, dir: Dir) => {
    if (!can || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r0 = { x: it.x * colW, y: it.y * rowH, w: it.w * colW, h: it.h * rowH };
    const x0 = e.clientX, y0 = e.clientY, mn = def(it.id).min;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      let { x, y, w, h } = r0;
      if (dir === "move") { x += dx; y += dy; }
      else {
        if (dir.includes("e")) w = r0.w + dx;
        if (dir.includes("s")) h = r0.h + dy;
        if (dir.includes("w")) { w = r0.w - dx; x = r0.x + dx; }
        if (dir.includes("n")) { h = r0.h - dy; y = r0.y + dy; }
        if (w < mn.w * colW) { if (dir.includes("w")) x = r0.x + r0.w - mn.w * colW; w = mn.w * colW; }
        if (h < mn.h * rowH) { if (dir.includes("n")) y = r0.y + r0.h - mn.h * rowH; h = mn.h * rowH; }
      }
      x = Math.max(0, Math.min(x, W - w)); y = Math.max(0, y);
      let cw = Math.max(mn.w, Math.min(COLS, Math.round(w / colW))), ch = Math.max(mn.h, Math.round(h / rowH));
      let cx = Math.max(0, Math.min(COLS - cw, Math.round(x / colW))), cy = Math.max(0, Math.round(y / rowH));
      if (dir === "move") { cw = it.w; ch = it.h; cx = Math.max(0, Math.min(COLS - cw, Math.round(x / colW))); }
      setDrag({ id: it.id, px: { x, y, w, h }, cell: { id: it.id, x: cx, y: cy, w: cw, h: ch } });
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      setDrag((d) => {
        if (d) setCells(settle(settle(cellsRef.current.map((i) => (i.id === d.id ? d.cell : i)), d.id)));
        return null;
      });
    };
    setDrag({ id: it.id, px: r0, cell: it });
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  const order = [...live].sort((a, b) => a.y - b.y || a.x - b.x);
  const TT = {
    title: TR("Dashboard", "لوحة التحكم", "Tableau de bord"), custom: TR("Customize", "تخصيص", "Personnaliser"), done: TR("Done", "تم", "Terminé"),
    tools: TR("Analysis tools — press + to add to your dashboard", "أدوات التحليل — اضغط + لإضافتها إلى لوحتك", "Outils d'analyse — appuyez sur + pour ajouter"),
    all: TR("Everything is already on your dashboard.", "كل الأدوات مضافة إلى لوحتك.", "Tout est déjà sur votre tableau de bord."),
    arrange: TR("Auto-arrange", "ترتيب تلقائي", "Organiser"), hint: TR("Drag any card · pull an edge or corner to resize · cards snap to the grid", "اسحب أي بطاقة · اسحب حافة أو زاوية لتغيير الحجم · تلتصق البطاقات بالشبكة", "Glissez une carte · tirez un bord pour redimensionner · aimantation à la grille"),
    allAcc: TR("All accounts", "كل الحسابات", "Tous les comptes"),
    empty: TR("Your dashboard is empty. Press Customize to add tools.", "لوحتك فارغة. اضغط تخصيص لإضافة الأدوات.", "Tableau vide. Appuyez sur Personnaliser."),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="me-2 font-heading text-lg font-semibold">{L(TT.title)}</h1>
          {accounts.length > 0 && (
            <select aria-label="account" className="field !w-auto !py-1.5 text-sm" value={acc} onChange={(e) => setFilter({ ...filter, acc: e.target.value })}>
              <option value="all">{L(TT.allAcc)}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <select aria-label="range" className="field !w-auto !py-1.5 text-sm" value={filter.range} onChange={(e) => setFilter({ ...filter, range: e.target.value })}>
            {RANGES.map((r) => <option key={r} value={r}>{L(rangeLabel[r])}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {can && (
            <>
              <button type="button" onClick={() => setCells(flow(settle(cells).sort((a, b) => a.y - b.y || a.x - b.x).map((i) => i.id)))} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-primary-tint"><LayoutGrid size={14} />{L(TT.arrange)}</button>
              <button type="button" aria-label="reset" onClick={() => setCells(flow(DEFAULT_IDS))} className="icon-btn !h-8 !w-8"><RotateCcw size={14} className="text-icon" /></button>
            </>
          )}
          <button type="button" onClick={toggle} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition ${editing ? "border-primary bg-primary text-on-primary" : "border-border bg-surface hover:bg-primary-tint"}`}>
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
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{L(d.name)}</span><span className="block truncate text-[11px] text-muted">{L(d.info)}</span></span>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-on-primary transition group-hover:scale-110"><Plus size={15} /></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {cells.length === 0 && !can ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">{L(TT.empty)}</div>
      ) : (
        <div ref={box} dir="ltr" className={narrow ? "flex flex-col gap-3" : "relative"} style={{ height: narrow ? undefined : (rows + (can ? 2 : 0)) * rowH, backgroundImage: can ? "radial-gradient(circle, color-mix(in srgb,var(--text) 16%,transparent) 1px, transparent 1.5px)" : undefined, backgroundSize: can ? `${colW}px ${rowH}px` : undefined }}>
          {drag && !narrow && <div className="pointer-events-none absolute rounded-2xl border-2 border-dashed border-primary bg-primary-tint" style={{ left: drag.cell.x * colW + PAD, top: drag.cell.y * rowH + PAD, width: drag.cell.w * colW - PAD * 2, height: drag.cell.h * rowH - PAD * 2 }} />}
          {order.map((it, i) => {
            const d = def(it.id);
            const busy = drag?.id === it.id;
            const g = busy ? drag!.px : { x: it.x * colW, y: it.y * rowH, w: it.w * colW, h: it.h * rowH };
            return (
              <motion.div key={it.id} onPointerDown={(e) => begin(e, it, "move")} dir={lang === "ar" ? "rtl" : "ltr"}
                initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] }}
                className={narrow ? "" : "absolute"}
                style={narrow ? { height: Math.max(it.h * rowH, 130) } : { left: g.x, top: g.y, width: g.w, height: g.h, zIndex: busy ? 50 : 1, padding: PAD, transition: busy ? "none" : "left .22s ease, top .22s ease, width .22s ease, height .22s ease" }}>
                <div className={`group relative flex h-full flex-col rounded-2xl border p-4 ${can ? "cursor-grab select-none" : "transition hover:border-primary/50"} ${busy ? "cursor-grabbing" : ""}`}
                  style={{
                    background: d.gauge ? "var(--gauge-bg)" : "var(--card-bg)",
                    borderColor: busy ? "var(--primary)" : can ? "color-mix(in srgb,var(--primary) 45%,var(--border))" : "var(--border)",
                    boxShadow: busy ? "0 22px 44px -14px rgba(0,0,0,.6), 0 0 0 1px var(--primary)" : "0 1px 0 rgba(255,255,255,.03) inset",
                    touchAction: can ? "none" : undefined,
                  }}>
                  <div className="mb-2 flex shrink-0 items-center gap-2 text-xs font-semibold text-primary">
                    {can && <GripVertical size={14} className="text-icon" />}
                    <span className="line-clamp-2 leading-tight" title={L(d.name)}>{L(d.name)}</span>
                    <span className="relative" onPointerDown={(e) => e.stopPropagation()}>
                      <Info size={13} className="peer cursor-help opacity-70 hover:opacity-100" />
                      <span className="pointer-events-none absolute start-0 top-5 z-30 hidden w-56 rounded-lg border border-border bg-bg p-2 text-[11px] font-normal leading-snug shadow-xl peer-hover:block">{L(d.info)}</span>
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden" style={{ containerType: "size" }}><div className="h-full w-full">{d.render(c)}</div></div>
                  {can && (
                    <>
                      <button type="button" aria-label="remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => setCells((a) => settle(a.filter((x) => x.id !== it.id)))} className="icon-btn absolute end-2 top-2 !h-7 !w-7 !bg-bg/70"><X size={13} style={{ color: RED }} /></button>
                      {HANDLES.map((h) => (
                        <span key={h.d} onPointerDown={(e) => begin(e, it, h.d)} className={`absolute z-10 grid place-items-center ${h.cls} ${h.dot ? "h-3.5 w-3.5" : ""}`} style={{ cursor: h.cur, touchAction: "none" }}>
                          {h.dot ? <span className="block h-2.5 w-2.5 rounded-full border-2 border-primary bg-bg" /> : <span className={`block rounded-full bg-primary/50 opacity-0 transition group-hover:opacity-100 ${h.d === "n" || h.d === "s" ? "h-[3px] w-8" : "h-8 w-[3px]"}`} />}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
