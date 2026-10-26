// Pick a market from all of them: the trader's own first, then the common ones by group, with a search box; a symbol
// that is not listed can be added as typed. One symbol (the trade check) or several (own rules: ticks).
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import type { Lang } from "../types";
import { cleanSymbol, searchSymbols, type SymbolGroup } from "../lib/symbols";

type L3 = Record<Lang, string>;
const X3 = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });
const T = {
  search: X3("Search a market", "ابحث عن سوق", "Chercher un marché"),
  mine: X3("Your markets", "أسواقك", "Vos marchés"),
  fx: X3("Forex", "العملات", "Forex"),
  metals: X3("Metals", "المعادن", "Métaux"),
  indices: X3("Indices", "المؤشرات", "Indices"),
  energy: X3("Energy", "الطاقة", "Énergie"),
  crypto: X3("Crypto", "العملات الرقمية", "Crypto"),
  add: X3("Add “{s}”", "أضف «{s}»", "Ajouter « {s} »"),
  none: X3("No market found.", "لا يوجد سوق بهذا الاسم.", "Aucun marché trouvé."),
  clear: X3("Clear", "مسح", "Effacer"),
  done: X3("Done", "تم", "OK"),
  n: X3("{n} markets", "{n} أسواق", "{n} marchés"),
} satisfies Record<string, L3>;

type Props = { lang: Lang; mine: string[]; placeholder?: string; label: string; inline?: boolean } & (
  | { multi?: false; value: string; onChange: (v: string) => void }
  | { multi: true; value: string[]; onChange: (v: string[]) => void }
);

export default function SymbolPicker(p: Props) {
  const { lang, mine, label, inline } = p, L = (x: L3) => x[lang];
  const [open, setOpen] = useState(false), [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const chosen = p.multi ? p.value : p.value ? [p.value] : [];
  const groups = useMemo(() => searchSymbols(q, [...chosen.filter((s) => !mine.includes(s)), ...mine]), [q, mine, chosen]);
  const typed = cleanSymbol(q), listed = groups.some((g) => g.list.includes(typed));
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  const pick = (s: string) => {
    if (p.multi) p.onChange(chosen.includes(s) ? chosen.filter((x) => x !== s) : [...chosen, s]);
    else { p.onChange(s); setOpen(false); setQ(""); }
  };
  const shown = p.multi ? (chosen.length ? (chosen.length <= 3 ? chosen.join(", ") : `${chosen.slice(0, 3).join(", ")} +${chosen.length - 3}`) : "") : p.value;
  const panel = (
    <div className={`${inline ? "mt-2" : "absolute inset-x-0 top-full z-40 mt-1.5 min-w-[16rem] shadow-xl"} overflow-hidden rounded-xl border border-border bg-surface`}>
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search size={15} className="shrink-0 text-muted" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(T.search)} aria-label={L(T.search)} dir="ltr"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const first = groups[0]?.list[0]; if (first) pick(first); else if (typed) pick(typed); } }}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none focus-visible:outline-none" />
        {q && <button type="button" aria-label={L(T.clear)} onClick={() => setQ("")} className="text-muted hover:text-text"><X size={14} /></button>}
      </div>
      <div className="max-h-72 overflow-y-auto p-1.5" role="listbox" aria-label={label} aria-multiselectable={p.multi || undefined}>
        {groups.map((g) => (
          <div key={g.group} className="mb-1">
            <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{L(T[g.group as "mine" | SymbolGroup])}</p>
            <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">
              {g.list.map((s) => {
                const on = chosen.includes(s);
                return (
                  <button key={s} type="button" role="option" aria-selected={on} onClick={() => pick(s)} dir="ltr"
                    className={`flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-start text-sm font-medium ${on ? "bg-primary-tint text-primary" : "hover:bg-primary-tint"}`}>
                    <span className="truncate">{s}</span>{on && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!groups.length && <p className="px-2.5 pb-1 pt-3 text-sm text-muted">{L(T.none)}</p>}
        {typed && !listed && (
          <button type="button" onClick={() => pick(typed)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm font-semibold text-primary hover:bg-primary-tint">
            <Plus size={14} />{L(T.add).replace("{s}", typed)}
          </button>
        )}
      </div>
      {p.multi && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span className="text-xs text-muted">{chosen.length ? L(T.n).replace("{n}", String(chosen.length)) : ""}</span>
          <span className="flex gap-2">
            {chosen.length > 0 && <button type="button" onClick={() => p.onChange([])} className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-muted hover:text-text">{L(T.clear)}</button>}
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-on-primary">{L(T.done)}</button>
          </span>
        </div>
      )}
    </div>
  );
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)} className="field flex w-full items-center justify-between gap-2 text-start">
        <span className={`truncate ${shown ? "" : "text-muted"}`} dir="ltr">{shown || p.placeholder || ""}</span>
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && panel}
    </div>
  );
}
