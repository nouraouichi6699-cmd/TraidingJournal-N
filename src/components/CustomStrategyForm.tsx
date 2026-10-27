// The window to make or edit one of the trader's own strategies: a name, a color (12 ready ones or any other), the
// indicators and tools it uses (searchable, in six groups), and if they like, an entry checklist, a stop, a target
// and notes. Deleting asks once more; the trades linked to it stay, unlinked.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Activity, BarChart3, CandlestickChart, Check, Clock, Gauge, Pipette, Search, Trash2, TrendingUp, X } from "lucide-react";
import type { Lang } from "../types";
import { norm } from "../lib/strategies";
import { TOOLS, TOOL_GROUPS, TOOL_GROUP_LABEL, toolName, type ToolGroup } from "../lib/tools";
import { COLORS, LIMITS, inkOn, newCustomId, type CustomStrategy } from "../lib/customStrategies";

type L3 = Record<Lang, string>;
const T = {
  newTitle: { en: "New strategy", ar: "استراتيجية جديدة", fr: "Nouvelle stratégie" },
  editTitle: { en: "Edit strategy", ar: "تعديل الاستراتيجية", fr: "Modifier la stratégie" },
  name: { en: "Name", ar: "الاسم", fr: "Nom" },
  namePh: { en: "e.g. My London scalp", ar: "مثلاً: سكالب لندن", fr: "ex. Mon scalp de Londres" },
  color: { en: "Color", ar: "اللون", fr: "Couleur" },
  own: { en: "Any color", ar: "لون آخر", fr: "Autre couleur" },
  tools: { en: "Indicators and tools", ar: "المؤشرات والأدوات", fr: "Indicateurs et outils" },
  chosen: { en: "{n} chosen", ar: "تم اختيار {n}", fr: "{n} choisi(s)" },
  search: { en: "Search an indicator", ar: "ابحث عن مؤشر", fr: "Rechercher un indicateur" },
  noTool: { en: "No indicator matches.", ar: "لا يوجد مؤشر مطابق.", fr: "Aucun indicateur ne correspond." },
  rules: { en: "Your rules (optional)", ar: "قواعدك (اختياري)", fr: "Vos règles (facultatif)" },
  check: { en: "Entry checklist", ar: "شروط الدخول", fr: "Check-list d'entrée" },
  checkPh: { en: "One condition per line", ar: "شرط في كل سطر", fr: "Une condition par ligne" },
  stop: { en: "Stop loss", ar: "وقف الخسارة", fr: "Stop loss" },
  stopPh: { en: "Where the stop goes", ar: "أين تضع الوقف", fr: "Où placer le stop" },
  target: { en: "Target", ar: "الهدف", fr: "Objectif" },
  targetPh: { en: "Where you take profit", ar: "أين تأخذ الربح", fr: "Où prendre le profit" },
  notes: { en: "Notes", ar: "ملاحظات", fr: "Notes" },
  create: { en: "Create", ar: "إنشاء", fr: "Créer" },
  save: { en: "Save", ar: "حفظ", fr: "Enregistrer" },
  cancel: { en: "Cancel", ar: "إلغاء", fr: "Annuler" },
  del: { en: "Delete", ar: "حذف", fr: "Supprimer" },
  delSure: { en: "Delete this strategy? Its trades stay, without it.", ar: "حذف هذه الاستراتيجية؟ تبقى صفقاتها لكن دون ربط.", fr: "Supprimer cette stratégie ? Ses trades restent, sans elle." },
  delYes: { en: "Yes, delete", ar: "نعم، احذف", fr: "Oui, supprimer" },
  nameNeeded: { en: "Give it a name to save it.", ar: "أعطها اسماً لتحفظها.", fr: "Donnez-lui un nom pour l'enregistrer." },
} satisfies Record<string, L3>;
export const TOOL_ICON: Record<ToolGroup, typeof Activity> = { trend: TrendingUp, momentum: Activity, volatility: Gauge, volume: BarChart3, price: CandlestickChart, time: Clock };

export default function CustomStrategyForm({ lang, initial, onSave, onDelete, onClose }: { lang: Lang; initial: CustomStrategy | null; onSave: (c: CustomStrategy) => void; onDelete?: () => void; onClose: () => void }) {
  const L = (x: L3) => x[lang];
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [tools, setTools] = useState<string[]>(initial?.tools ?? []);
  const [check, setCheck] = useState((initial?.check ?? []).join("\n"));
  const [stop, setStop] = useState(initial?.stop ?? "");
  const [target, setTarget] = useState(initial?.target ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [q, setQ] = useState("");
  const [sure, setSure] = useState(false);
  const nameBox = useRef<HTMLInputElement>(null), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    nameBox.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return words.length ? TOOLS.filter((t) => { const h = norm(`${t.n} ${t.ar ?? ""} ${t.fr ?? ""} ${t.id}`); return words.every((w) => h.includes(w)); }) : TOOLS;
  }, [q]);
  const flip = (id: string) => setTools((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));
  const ok = name.trim().length > 0;
  const custom = !COLORS.includes(color);
  const submit = () => {
    if (!ok) return;
    onSave({ id: initial?.id ?? newCustomId(), name, color, tools: TOOL_GROUPS.flatMap((g) => TOOLS.filter((t) => t.g === g && tools.includes(t.id)).map((t) => t.id)), check: check.split("\n"), stop, target, notes, at: initial?.at ?? Date.now() });
  };
  const tint = (a: number) => `color-mix(in srgb, ${color} ${a}%, transparent)`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        role="dialog" aria-modal="true" aria-labelledby="cs-title" className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6" style={{ background: `linear-gradient(135deg, ${tint(16)}, transparent 70%)` }}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl font-heading text-sm font-bold" style={{ background: color, color: inkOn(color) }}>{(name.trim() || "?").slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h2 id="cs-title" className="font-heading text-lg font-semibold">{L(initial ? T.editTitle : T.newTitle)}</h2>
            <p className="truncate text-xs text-muted" dir="auto">{name.trim() || L(T.namePh)} · {L(T.chosen).replace("{n}", String(tools.length))}</p>
          </div>
          <button type="button" aria-label={L(T.cancel)} onClick={onClose} className="icon-btn -m-1.5"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <label className="block text-sm font-semibold" htmlFor="cs-name">{L(T.name)}</label>
          <input id="cs-name" ref={nameBox} value={name} maxLength={LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder={L(T.namePh)} dir="auto" className="field mt-1.5"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />

          <p className="mt-4 text-sm font-semibold">{L(T.color)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {COLORS.map((c, i) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`${L(T.color)} ${i + 1}`} aria-pressed={color === c}
                className={`grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]" : ""}`} style={{ background: c }}>
                {color === c && <Check size={15} strokeWidth={3} style={{ color: inkOn(c) }} />}
              </button>
            ))}
            <label title={L(T.own)} className={`relative grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110 ${custom ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]" : ""}`}
              style={{ background: custom ? color : "conic-gradient(#f87171, #facc15, #22c55e, #38bdf8, #a78bfa, #f472b6, #f87171)" }}>
              <Pipette size={14} style={{ color: custom ? inkOn(color) : "#0b0b0b" }} />
              <input type="color" value={color} onChange={(e) => setColor(e.target.value.toLowerCase())} aria-label={L(T.own)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{L(T.tools)}</p>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: tint(18), color: "var(--text)" }}>{L(T.chosen).replace("{n}", String(tools.length))}</span>
            <label className="relative ms-auto w-full sm:w-56">
              <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(T.search)} aria-label={L(T.search)}
                className="w-full rounded-xl border border-border bg-bg py-1.5 pe-2 ps-8 text-sm outline-none placeholder:text-muted focus:border-[var(--icon)] focus-visible:outline-none" />
            </label>
          </div>
          {!shown.length && <p className="py-6 text-center text-sm text-muted">{L(T.noTool)}</p>}
          <div className="mt-2 flex flex-col gap-3">
            {TOOL_GROUPS.map((g) => {
              const list = shown.filter((t) => t.g === g);
              if (!list.length) return null;
              const Icon = TOOL_ICON[g], n = list.filter((t) => tools.includes(t.id)).length;
              return (
                <div key={g}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted"><Icon size={13} className="text-icon" />{TOOL_GROUP_LABEL[g][lang]}{n > 0 && <span className="tabular-nums">· {n}</span>}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((t) => {
                      const on = tools.includes(t.id);
                      return (
                        <motion.button key={t.id} type="button" whileTap={{ scale: 0.92 }} onClick={() => flip(t.id)} aria-pressed={on}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "font-semibold text-text" : "border-border text-muted hover:text-text"}`}
                          style={on ? { borderColor: tint(70), background: tint(20) } : undefined}>
                          {on && <Check size={12} strokeWidth={3} style={{ color }} />}<span dir="auto">{toolName(t, lang)}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-6 border-t border-border pt-4 text-sm font-semibold">{L(T.rules)}</p>
          <div className="mt-2 grid gap-3">
            <label className="block text-xs font-semibold text-muted">{L(T.check)}
              <textarea value={check} onChange={(e) => setCheck(e.target.value)} rows={4} placeholder={L(T.checkPh)} dir="auto" className="field mt-1 block w-full resize-y text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-muted">{L(T.stop)}
                <input value={stop} maxLength={LIMITS.field} onChange={(e) => setStop(e.target.value)} placeholder={L(T.stopPh)} dir="auto" className="field mt-1" />
              </label>
              <label className="block text-xs font-semibold text-muted">{L(T.target)}
                <input value={target} maxLength={LIMITS.field} onChange={(e) => setTarget(e.target.value)} placeholder={L(T.targetPh)} dir="auto" className="field mt-1" />
              </label>
            </div>
            <label className="block text-xs font-semibold text-muted">{L(T.notes)}
              <textarea value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} rows={3} dir="auto" className="field mt-1 block w-full resize-y text-sm" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-6">
          {initial && onDelete && (sure ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{L(T.delSure)}</span>
              <button type="button" onClick={onDelete} className="rounded-xl bg-[#f87171] px-3 py-1.5 text-sm font-semibold text-[#1a0505]">{L(T.delYes)}</button>
              <button type="button" onClick={() => setSure(false)} className="rounded-xl px-2 py-1.5 text-sm font-semibold text-muted hover:text-text">{L(T.cancel)}</button>
            </span>
          ) : (
            <button type="button" onClick={() => setSure(true)} className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-[#f87171] hover:bg-[#f87171]/10"><Trash2 size={15} />{L(T.del)}</button>
          ))}
          <span className="ms-auto text-xs text-muted">{!ok && L(T.nameNeeded)}</span>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-primary-tint">{L(T.cancel)}</button>
          <button type="button" onClick={submit} disabled={!ok} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-40">{L(initial ? T.save : T.create)}</button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
