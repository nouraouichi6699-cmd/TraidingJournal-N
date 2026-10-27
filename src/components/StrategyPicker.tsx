// The strategy of a trade, picked from a chip: the trader's own strategies first, then the whole library. The list
// opens over the page (outside the table, which scrolls sideways) and closes on a choice, a click away, Escape or scroll.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Star, Target, X } from "lucide-react";
import type { Lang } from "../types";
import { STRATEGIES, type Id } from "../lib/strategies";

type L3 = Record<Lang, string>;
const T = {
  add: { en: "Strategy", ar: "استراتيجية", fr: "Stratégie" },
  label: { en: "Strategy of this trade", ar: "استراتيجية هذه الصفقة", fr: "Stratégie de ce trade" },
  mine: { en: "My strategies", ar: "استراتيجياتي", fr: "Mes stratégies" },
  all: { en: "All strategies", ar: "كل الاستراتيجيات", fr: "Toutes les stratégies" },
  none: { en: "No strategy", ar: "بلا استراتيجية", fr: "Aucune stratégie" },
} satisfies Record<string, L3>;
const PW = 264, PH = 336; // panel size

export default function StrategyPicker({ value, mine, lang, onChange }: { value?: Id; mine: Id[]; lang: Lang; onChange: (id: Id | null) => void }) {
  const L = (x: L3) => x[lang];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const cur = STRATEGIES.find((s) => s.id === value);

  useLayoutEffect(() => {
    if (!open) return;
    const r = (btn.current as HTMLButtonElement).getBoundingClientRect(), rtl = document.documentElement.dir === "rtl";
    const up = r.bottom + PH + 8 > innerHeight && r.top - PH - 8 > 0;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.max(8, Math.min(rtl ? r.right - PW : r.left, innerWidth - PW - 8)), up });
    const inside = (e: Event) => panel.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node);
    const down = (e: MouseEvent) => { if (!inside(e)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const away = (e: Event) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  const pick = (id: Id | null) => { setOpen(false); if (id !== (value ?? null)) onChange(id); };
  const item = (id: Id) => {
    const s = STRATEGIES.find((x) => x.id === id);
    if (!s) return null;
    return (
      <button key={id} type="button" role="menuitemradio" aria-checked={value === id} onClick={() => pick(id)} className="menu-item">
        <span dir="ltr" className="min-w-0 flex-1 truncate text-start rtl:text-right">{s.name}</span>
        {value === id && <Check size={15} className="shrink-0 text-icon" />}
      </button>
    );
  };
  const head = (icon: React.ReactNode, text: string) => <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{icon}{text}</p>;

  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`${L(T.label)}: ${cur?.name ?? L(T.none)}`} title={cur?.name}
        className={`inline-flex max-w-[160px] items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-colors ${cur ? "border border-[var(--icon)]/45 bg-primary-tint font-semibold text-icon" : "border border-dashed border-border text-muted hover:border-[var(--icon)] hover:text-text"}`}>
        {cur ? <Target size={12} className="shrink-0" /> : <Plus size={12} className="shrink-0" />}
        <span dir={cur ? "ltr" : undefined} className="truncate">{cur ? cur.short : L(T.add)}</span>
      </button>
      {open && pos && createPortal(
        <div ref={panel} role="menu" aria-label={L(T.label)} style={{ position: "fixed", top: pos.top, left: pos.left, width: PW, maxHeight: PH, transform: pos.up ? "translateY(-100%)" : undefined }}
          className="z-[60] overflow-y-auto rounded-xl border border-border bg-surface p-1.5 text-sm shadow-xl">
          {cur && <button type="button" onClick={() => pick(null)} className="menu-item text-muted"><X size={15} className="shrink-0" /><span className="flex-1 text-start">{L(T.none)}</span></button>}
          {mine.length > 0 && <>{head(<Star size={11} className="text-icon" />, L(T.mine))}{mine.map(item)}</>}
          {head(<Target size={11} className="text-icon" />, L(T.all))}
          {STRATEGIES.filter((s) => !mine.includes(s.id)).map((s) => item(s.id))}
        </div>,
        document.body,
      )}
    </>
  );
}
