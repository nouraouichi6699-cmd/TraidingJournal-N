import { Globe, Bell, Maximize2, Minimize2, Palette, User, Settings, CalendarDays, Newspaper, ChevronDown, Plus, Pencil, Check } from "lucide-react";
import { useEffect, useState } from "react";
import Brand from "./Brand";
import Dropdown from "./Dropdown";
import Sessions from "./Sessions";
import { languages, themeNames, type Key } from "../i18n";
import type { Lang, Theme } from "../types";

interface Props {
  lang: Lang;
  t: (k: Key) => string;
  theme: Theme;
  name: string;
  avatar: string | null;
  onLang: (l: Lang) => void;
  onTheme: (t: Theme) => void;
  onProfile: () => void;
  onNews: () => void;
  onCalendar: () => void;
}

const ic = { size: 18, strokeWidth: 1.9, className: "text-icon" };

export default function Header({ lang, t, theme, name, avatar, onLang, onTheme, onProfile, onNews, onCalendar }: Props) {
  const [full, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const tabs = [
    { icon: CalendarDays, label: t("calendar"), onClick: onCalendar },
    { icon: Newspaper, label: t("news"), onClick: onNews },
  ];

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2">
      <Brand lang={lang} />

      <p className="hidden font-heading text-base font-semibold 2xl:block">
        {t("greeting")} {name}
      </p>

      <div className="ms-auto flex flex-wrap items-center gap-2">
        <Sessions t={t} />

        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1 text-sm">
          <div className="hidden items-center gap-1 lg:flex">
            {tabs.map(({ icon: Icon, label, onClick }) => (
              <button key={label} type="button" aria-label={label} onClick={onClick} className="flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium hover:bg-primary-tint">
                <Icon size={16} strokeWidth={1.9} className="text-icon" />
                <span className="hidden 2xl:inline">{label}</span>
              </button>
            ))}
            <button type="button" className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
              {t("boards")}
              <ChevronDown size={14} className="text-icon" />
            </button>
            <button type="button" aria-label={t("addBoard")} className="icon-btn !h-8 !w-8">
              <Plus size={16} className="text-icon" />
            </button>
            <button type="button" aria-label={t("editBoards")} className="icon-btn !h-8 !w-8">
              <Pencil size={15} className="text-icon" />
            </button>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          </div>

          <Dropdown label={t("language")} trigger={<Globe {...ic} />}>
            {(close) =>
              languages.map((l) => (
                <button key={l.code} role="menuitemradio" aria-checked={lang === l.code} onClick={() => { onLang(l.code); close(); }} className="menu-item">
                  <span className="flex-1 text-start">{l.label}</span>
                  {lang === l.code && <Check size={16} className="text-icon" />}
                </button>
              ))
            }
          </Dropdown>

          <button type="button" aria-label={t("notifications")} className="icon-btn relative">
            <Bell {...ic} />
            <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] font-bold text-white">1</span>
          </button>

          <button type="button" aria-label={t("fullscreen")} title={t("fullscreen")} onClick={toggleFull} className="icon-btn hidden sm:inline-flex">
            {full ? <Minimize2 {...ic} /> : <Maximize2 {...ic} />}
          </button>

          <Dropdown label={t("theme")} trigger={<Palette {...ic} />}>
            {(close) =>
              (Object.keys(themeNames) as Theme[]).map((th) => (
                <button key={th} role="menuitemradio" aria-checked={theme === th} onClick={() => { onTheme(th); close(); }} className="menu-item">
                  <span className="flex-1 text-start">{themeNames[th][lang]}</span>
                  {theme === th && <Check size={16} className="text-icon" />}
                </button>
              ))
            }
          </Dropdown>

          <button type="button" aria-label={t("profile")} title={t("profile")} onClick={onProfile} className="icon-btn overflow-hidden rounded-full border border-icon/60">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <User {...ic} />}
          </button>

          <button type="button" aria-label={t("settings")} title={t("settings")} className="icon-btn">
            <Settings {...ic} />
          </button>
        </div>
      </div>
    </header>
  );
}
