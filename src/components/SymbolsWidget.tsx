import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { symbolBreakdown } from "../lib/dashAnalytics";
import { symL } from "../i18n";
import type { Ctx } from "./dashWidgets";

// Categorical palette: Mizan gold first, no pure red/green (those mean loss/profit). Beyond the palette, lighter then darker variants.
const BASE = ["var(--primary)", "#5b8def", "#a78bfa", "#38bdf8", "#e879f9", "#94a3b8", "#fb923c", "#818cf8"];
export const symColor = (rank: number) => {
  const c = BASE[rank % BASE.length], r = Math.floor(rank / BASE.length) % 3;
  return r === 0 ? c : `color-mix(in srgb, ${c}, ${r === 1 ? "white" : "black"} 35%)`;
};

export default function SymbolsWidget({ c }: { c: Ctx }) {
  const L = (k: string) => symL(k)[c.lang];
  const full = useMemo(() => symbolBreakdown(c.closed), [c.closed]);
  const rank = useMemo(() => new Map(full.symbols.map((s, i) => [s.symbol, i])), [full]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [expand, setExpand] = useState(false);
  const [hot, setHot] = useState<number | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const names = full.symbols.map((s) => s.symbol);
  const chosen = names.filter((n) => !off.has(n));
  const selected = chosen.length ? chosen : names; // never empty
  const b = useMemo(() => symbolBreakdown(c.closed, selected), [c.closed, selected.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.("[data-symmenu],[data-symbtn]")) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!full.total) return <div className="grid h-full place-items-center text-center text-xs text-muted">{({ en: "No data yet", ar: "لا توجد بيانات بعد", fr: "Pas encore de données" })[c.lang]}</div>;

  const toggle = (n: string) => setOff((o) => { const nx = new Set(o); if (nx.has(n)) nx.delete(n); else if (names.filter((x) => !nx.has(x)).length > 1) nx.add(n); return nx; });
  const openMenu = () => { const r = btn.current!.getBoundingClientRect(); const rtl = document.dir === "rtl"; setPos({ top: r.bottom + 6, left: rtl ? Math.max(8, r.right - 208) : Math.min(r.left, window.innerWidth - 216) }); setOpen((v) => !v); };

  // Donut geometry (viewBox 100): each slice is a dashed circle segment.
  const R = 38, C = 2 * Math.PI * R, gap = b.symbols.length > 1 ? 0.8 : 0;
  let acc = 0;
  const slices = b.symbols.map((s) => { const len = (s.pct / 100) * C, d = { ...s, len, off: acc, color: symColor(rank.get(s.symbol) ?? 0) }; acc += len; return d; });
  const h = hot != null ? slices[hot] : null;
  const shown = expand ? slices : slices.slice(0, 3);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="tnum font-heading font-bold" style={{ fontSize: "clamp(1.1rem,6cqh,1.8rem)", lineHeight: 1 }}>{b.distinct}</div>
        <button ref={btn} data-symbtn type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={L("pick")} onClick={openMenu} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text">
          <span className="h-2 w-2 rounded-full bg-primary" />{chosen.length === names.length || !chosen.length ? `${L("all")} ${names.length}` : `${chosen.length}/${names.length}`}<ChevronDown size={12} />
        </button>
      </div>
      {open && createPortal(
        <div data-symmenu role="listbox" aria-multiselectable title={L("keep")} className="fixed z-50 max-h-64 w-52 overflow-auto rounded-xl border border-border bg-surface p-1 shadow-2xl" style={{ top: pos.top, left: pos.left }}>
          {full.symbols.map((s) => { const on = !off.has(s.symbol) || !chosen.length; return (
            <button key={s.symbol} role="option" aria-selected={on} type="button" onClick={() => toggle(s.symbol)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs text-text hover:bg-primary-tint">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: symColor(rank.get(s.symbol) ?? 0) }} />
              <span className="flex-1 truncate">{s.symbol}</span><span className="tnum text-muted">{s.count}</span>{on && <Check size={12} className="text-primary" />}
            </button>); })}
        </div>, document.body)}

      <div className="relative min-h-0 flex-1">
        <svg viewBox="0 0 100 100" className="absolute inset-0 mx-auto h-full w-full" role="img" aria-label={`${L("title")}: ${b.total}`}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--gauge-track)" strokeWidth="12" />
          {slices.map((s, i) => (
            <circle key={s.symbol} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth={hot === i ? 14 : 12} tabIndex={0} role="img" aria-label={`${s.symbol}: ${s.count}, ${s.pct.toFixed(1)}%`}
              strokeDasharray={`${Math.max(0, s.len - gap)} ${C}`} strokeDashoffset={-s.off} transform="rotate(-90 50 50)" style={{ transition: "stroke-width .15s", outline: "none", cursor: "pointer" }}
              onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)}><title>{`${s.symbol} · ${s.count} · ${s.pct.toFixed(1)}%`}</title></circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {h ? (<div><div className="tnum font-bold" style={{ fontSize: "clamp(.8rem,5cqh,1.2rem)", color: h.color }}>{h.symbol}</div><div className="tnum text-[11px] text-text">{h.count} · {h.pct.toFixed(1)}%</div></div>)
            : (<div><div className="tnum font-heading font-bold" style={{ fontSize: "clamp(1.1rem,8cqh,2.2rem)", lineHeight: 1 }}>{b.total}</div><div className="mt-0.5 text-[11px] text-muted">{L("trades")}</div></div>)}
        </div>
      </div>

      <div className={`flex flex-wrap gap-x-3 gap-y-1 text-[11px] ${expand ? "max-h-[40%] overflow-auto" : ""}`}>
        {shown.map((s) => (
          <div key={s.symbol} className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} /><span className="truncate font-medium text-text">{s.symbol}</span><span className="tnum text-muted">{s.count}</span><span className="tnum text-muted">{s.pct.toFixed(1)}%</span></div>
        ))}
        {slices.length > 3 && <button type="button" onClick={() => setExpand((v) => !v)} className="font-semibold text-primary">{expand ? L("less") : `+${slices.length - 3} ${L("more")}`}</button>}
      </div>
    </div>
  );
}
