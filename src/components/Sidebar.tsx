import { useState } from "react";
import { LayoutDashboard, PenLine, SquarePlus, LineChart, ClipboardList, Upload, Target, Trophy, Route, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Key } from "../i18n";
import type { Lang } from "../types";

const groups = [
  { id: "g1", label: { en: "Overview", ar: "نظرة عامة", fr: "Aperçu" }, items: [
    { id: "dashboard", icon: LayoutDashboard }, { id: "journal", icon: PenLine }, { id: "charts", icon: LineChart }, { id: "reports", icon: ClipboardList },
  ] },
  { id: "g2", label: { en: "Manage", ar: "الإدارة", fr: "Gestion" }, items: [
    { id: "accounts", icon: SquarePlus }, { id: "import", icon: Upload }, { id: "roadmap", icon: Route },
  ] },
  { id: "g3", label: { en: "Growth", ar: "التطور", fr: "Progression" }, items: [
    { id: "strategies", icon: Target }, { id: "achievements", icon: Trophy },
  ] },
] as const;

export type View = (typeof groups)[number]["items"][number]["id"];

interface Props {
  t: (k: Key) => string;
  view: string;
  onView: (v: View) => void;
  lang?: Lang;
}

export default function Sidebar({ t, view, onView, lang = "en" }: Props) {
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem("mizan-sidebar"); return v == null ? window.innerWidth >= 1000 : v !== "0"; } catch { return true; } });
  const flip = () => setOpen((o) => { try { localStorage.setItem("mizan-sidebar", o ? "0" : "1"); } catch {} return !o; });

  return (
    <nav
      aria-label={t("mainNav")}
      className={`sticky top-3 m-3 flex shrink-0 flex-col self-start rounded-2xl border border-border bg-surface p-2 transition-[width] duration-300 ${open ? "w-[208px]" : "w-[60px]"}`}
    >
      {groups.map((g, gi) => (
        <div key={g.id} className={gi ? "mt-3" : ""}>
          {open ? <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{g.label[lang]}</div> : gi > 0 && <hr className="mx-2 mb-2 border-border" />}
          <div className="flex flex-col gap-0.5">
            {g.items.map(({ id, icon: Icon }) => {
              const on = view === id;
              return (
                <button
                  key={id} type="button" data-id={id} title={open ? undefined : t(id)} aria-label={t(id)} aria-current={on ? "page" : undefined} onClick={() => onView(id)}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${open ? "" : "justify-center px-0"} ${on ? "bg-primary text-on-primary shadow-sm" : "text-text hover:bg-primary-tint"}`}
                >
                  <Icon size={19} strokeWidth={1.9} className={`shrink-0 transition-transform group-hover:scale-110 ${on ? "" : "text-icon"}`} />
                  {open && <span className="truncate">{t(id)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button type="button" onClick={flip} aria-label={open ? "collapse" : "expand"} className={`mt-3 flex items-center gap-3 rounded-xl border-t border-border px-3 pt-3 text-xs text-muted transition hover:text-text ${open ? "" : "justify-center px-0"}`}>
        {open ? <PanelLeftClose size={16} className="rtl:rotate-180" /> : <PanelLeftOpen size={16} className="rtl:rotate-180" />}
        {open && <span>{lang === "ar" ? "طيّ القائمة" : lang === "fr" ? "Réduire" : "Collapse"}</span>}
      </button>
    </nav>
  );
}
