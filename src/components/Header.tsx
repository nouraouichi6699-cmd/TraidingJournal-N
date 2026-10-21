import { Eye, EyeOff, Globe, Bell, Maximize2, Minimize2, Palette, User, Settings, CalendarDays, Newspaper, ChevronDown, Plus, Pencil, Check, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import Brand from "./Brand";
import Dropdown from "./Dropdown";
import Sessions from "./Sessions";
import NotificationsPanel from "./NotificationsPanel";
import { usePrivacy } from "../usePrivacy";
import { useDashEdit } from "../useDashEdit";
import type { Interests } from "../useInterests";
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
  onDashboard: () => void;
  onCharts?: () => void;
  interests: Interests;
}

const ic = { size: 18, strokeWidth: 1.9, className: "text-icon" };

export default function Header({ lang, t, theme, name, avatar, onLang, onTheme, onProfile, onNews, onCalendar, onDashboard, onCharts, interests }: Props) {
  const privacy = usePrivacy();
  const dash = useDashEdit();
  const [full, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => { });
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
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-bg/40 p-0.5">
              <button type="button" className="flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-medium hover:bg-primary-tint">
                {t("boards")}
                <ChevronDown size={14} className="text-icon" />
              </button>
              <button type="button" aria-label={t("addBoard")} className="icon-btn !h-7 !w-7">
                <Plus size={15} className="text-icon" />
              </button>
              <button type="button" aria-label={t("editBoards")} aria-pressed={dash.editing} onClick={() => { onDashboard(); dash.toggle(); }} className={`icon-btn !h-7 !w-7 ${dash.editing ? "!bg-primary" : ""}`}>
                <Pencil size={14} className={dash.editing ? "text-on-primary" : "text-icon"} />
              </button>
            </div>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          </div>

          <button type="button" aria-pressed={privacy.hidden} aria-label={t(privacy.hidden ? "privacyOff" : "privacyOn")} title={t(privacy.hidden ? "privacyOff" : "privacyOn")} onClick={privacy.toggle} className="icon-btn">
            {privacy.hidden ? <EyeOff {...ic} /> : <Eye {...ic} />}
          </button>

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

          <Dropdown
            label={t("notifications")}
            panelClass="w-[min(92vw,380px)]"
            trigger={
              <span className={`relative flex items-center justify-center ${interests.unread > 0 ? "bell-ringing" : ""}`}>
                <Bell {...ic} className="bell-ico" />
                {interests.unread > 0 && (
                  <span className="absolute -end-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] font-bold text-white">{interests.unread > 9 ? "9+" : interests.unread}</span>
                )}
              </span>
            }
          >
            {(close) => <NotificationsPanel t={t} lang={lang} interests={interests} onNews={onNews} onCalendar={onCalendar} onCharts={onCharts} close={close} />}
          </Dropdown>

          <Dropdown label={t("settings")} trigger={<MoreHorizontal {...ic} />}>
            {(close) => (
              <>
                <button type="button" onClick={() => { toggleFull(); close(); }} className="menu-item">
                  {full ? <Minimize2 size={16} className="text-icon" /> : <Maximize2 size={16} className="text-icon" />}
                  <span className="flex-1 text-start">{t("fullscreen")}</span>
                </button>
                <button type="button" className="menu-item">
                  <Settings size={16} className="text-icon" />
                  <span className="flex-1 text-start">{t("settings")}</span>
                </button>
                <div className="my-1 h-px bg-border" aria-hidden />
                <p className="px-2 pb-1 pt-1 text-xs font-semibold text-muted">{t("theme")}</p>
                {(Object.keys(themeNames) as Theme[]).map((th) => (
                  <button key={th} role="menuitemradio" aria-checked={theme === th} onClick={() => { onTheme(th); close(); }} className="menu-item">
                    <Palette size={16} className="text-icon" />
                    <span className="flex-1 text-start">{themeNames[th][lang]}</span>
                    {theme === th && <Check size={16} className="text-icon" />}
                  </button>
                ))}
              </>
            )}
          </Dropdown>

          <button type="button" aria-label={t("profile")} title={t("profile")} onClick={onProfile} className="icon-btn overflow-hidden rounded-full border-2 border-primary" style={{ boxShadow: "0 0 10px 0 color-mix(in srgb, var(--primary) 45%, transparent)" }}>
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <User {...ic} />}
          </button>
        </div>
      </div>
    </header>
  );
}
