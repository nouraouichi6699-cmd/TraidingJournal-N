import { Fragment, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { Lang } from "../types";
import TabIcon, { type ReportTabId } from "./ReportTabIcons";

type L3 = readonly [string, string, string];
/** The Reports sections, from the first look at the numbers to the professional tools. */
export const LEVELS: readonly { name: L3; tabs: readonly ReportTabId[] }[] = [
  { name: ["Beginner", "مبتدئ", "Débutant"], tabs: ["overview", "daybyday", "activity"] },
  { name: ["Intermediate", "متوسط", "Intermédiaire"], tabs: ["outcomes", "returns", "benchmark"] },
  { name: ["Pro", "محترف", "Pro"], tabs: ["portfolio", "path", "whatif", "advanced"] },
];
const ORDER = LEVELS.flatMap((l) => l.tabs);
const LIST_LABEL: L3 = ["Report sections", "أقسام التقارير", "Sections du rapport"];
const INTRO = "mizan-rt-intro"; // the icons' welcome wave plays once per browser session
const PILL: CSSProperties = {
  background: "var(--primary-tint)",
  boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--primary) 50%, transparent), 0 8px 22px -12px color-mix(in srgb, var(--primary) 80%, transparent)",
};

/** Level of a group: one to three rising bars. */
function Meter({ level }: { level: number }) {
  return (
    <svg width="13" height="11" viewBox="0 0 13 11" aria-hidden="true" className="shrink-0 rtl:-scale-x-100">
      {[4, 7, 10].map((h, i) => <rect key={h} x={i * 4.5} y={11 - h} width={3.2} height={h} rx={1} fill={i < level ? "currentColor" : "var(--border)"} />)}
    </svg>
  );
}

function Tile({ id, label, levelId, active, intro, onSelect, onKey, setRef }: {
  id: ReportTabId; label: string; levelId: string; active: boolean; intro?: number;
  onSelect: () => void; onKey: (e: KeyboardEvent<HTMLButtonElement>) => void; setRef: (b: HTMLButtonElement | null) => void;
}) {
  const reduce = useReducedMotion();
  const [play, setPlay] = useState(0);
  const last = useRef(0);
  const fire = () => { const now = performance.now(); if (now - last.current < 350) return; last.current = now; setPlay((p) => p + 1); }; // a hover followed by a click plays once
  useEffect(() => { if (intro == null) return; const t = window.setTimeout(fire, intro); return () => window.clearTimeout(t); }, [intro]); // eslint-disable-line react-hooks/exhaustive-deps
  const was = useRef(active);
  useEffect(() => { if (active && !was.current) fire(); was.current = active; }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      ref={setRef} id={`rt-tab-${id}`} type="button" role="tab" aria-selected={active} aria-controls="rt-panel" aria-describedby={levelId} tabIndex={active ? 0 : -1}
      onClick={onSelect} onKeyDown={onKey} onPointerEnter={(e) => { if (e.pointerType !== "touch") fire(); }}
      className={`group relative flex min-w-[84px] flex-1 flex-col items-center gap-1.5 rounded-xl px-2 pb-2 pt-2.5 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${active ? "text-primary" : "text-muted hover:text-text"}`}
    >
      {active ? (
        <motion.span layoutId="rt-pill" aria-hidden="true" className="absolute inset-0 rounded-xl" style={PILL} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34, mass: 0.9 }} />
      ) : (
        <span aria-hidden="true" className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ background: "color-mix(in srgb, var(--text) 5%, transparent)" }} />
      )}
      <span className={`relative ${active ? "" : "text-icon"}`}><TabIcon id={id} play={play} /></span>
      <span className={`relative line-clamp-2 text-center text-[12px] leading-tight ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
    </button>
  );
}

/** Reports section switcher: three levels of three sections, a sliding highlight, animated icons, arrow-key navigation. */
export default function ReportTabs({ lang, tab, onTab, labels }: { lang: Lang; tab: string; onTab: (id: ReportTabId) => void; labels: Record<ReportTabId, string> }) {
  const li = lang === "en" ? 0 : lang === "ar" ? 1 : 2;
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const btns = useRef(new Map<string, HTMLButtonElement>());
  const [intro] = useState<Partial<Record<string, number>>>(() => {
    let first = false;
    try { first = !sessionStorage.getItem(INTRO); sessionStorage.setItem(INTRO, "1"); } catch { /* storage blocked: no wave */ }
    return first ? Object.fromEntries(ORDER.map((id, i) => [id, 250 + i * 90])) : { [tab]: 150 };
  });
  // Narrow screens: the bar scrolls sideways; fade the edge that hides more sections.
  const [fade, setFade] = useState<[boolean, boolean]>([false, false]); // [left, right]
  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) { setFade([false, false]); return; }
    const rtl = getComputedStyle(el).direction === "rtl", s = Math.abs(el.scrollLeft); // distance from the start edge
    const startHidden = s > 1, endHidden = s < max - 1;
    setFade(rtl ? [endHidden, startHidden] : [startHidden, endHidden]);
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // keep the selected section in view
    const el = scroller.current, b = btns.current.get(tab);
    if (!el || !b || el.scrollWidth <= el.clientWidth + 1) return;
    const r = b.getBoundingClientRect(), c = el.getBoundingClientRect();
    el.scrollBy({ left: r.left + r.width / 2 - (c.left + c.width / 2), behavior: reduce ? "auto" : "smooth" });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl", i = ORDER.indexOf(tab as ReportTabId);
    const step = e.key === "ArrowRight" ? (rtl ? -1 : 1) : e.key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;
    const j = e.key === "Home" ? 0 : e.key === "End" ? ORDER.length - 1 : step ? (i + step + ORDER.length) % ORDER.length : -1;
    if (j < 0) return;
    e.preventDefault();
    onTab(ORDER[j]);
    btns.current.get(ORDER[j])?.focus();
  };
  const at = LEVELS.findIndex((l) => l.tabs.includes(tab as ReportTabId));
  const mask = fade[0] || fade[1] ? `linear-gradient(to right, ${fade[0] ? "transparent" : "#000"}, #000 32px, #000 calc(100% - 32px), ${fade[1] ? "transparent" : "#000"})` : undefined;
  return (
    <LayoutGroup id="reports-tabs">
      <motion.div ref={scroller} layoutScroll onScroll={measure} className="rt-tabs overflow-x-auto" style={{ maskImage: mask, WebkitMaskImage: mask }}>
        <div role="tablist" aria-label={LIST_LABEL[li]} className="flex w-full min-w-[900px] rounded-2xl border border-border bg-surface p-1.5" style={{ boxShadow: "var(--shadow-card)" }}>
          {LEVELS.map((lv, i) => (
            <Fragment key={i}>
              {i > 0 && <span aria-hidden="true" className="mx-1 my-2 w-px shrink-0 bg-border" />}
              <div className="flex min-w-0 flex-col" style={{ flex: `${lv.tabs.length} 1 0%` }}>
                <div id={`rt-level-${i}`} className={`flex items-center gap-1.5 px-2 pb-1 pt-0.5 font-semibold transition-colors duration-300 ${lang === "ar" ? "text-[12px]" : "text-[10.5px] uppercase tracking-[0.12em]"} ${i === at ? "text-icon" : "text-muted"}`}>
                  <Meter level={i + 1} />
                  <span>{lv.name[li]}</span>
                </div>
                <div className="flex gap-1">
                  {lv.tabs.map((id) => (
                    <Tile key={id} id={id} label={labels[id]} levelId={`rt-level-${i}`} active={tab === id} intro={intro[id]} onSelect={() => onTab(id)} onKey={onKey}
                      setRef={(b) => { if (b) btns.current.set(id, b); else btns.current.delete(id); }} />
                  ))}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </motion.div>
    </LayoutGroup>
  );
}
