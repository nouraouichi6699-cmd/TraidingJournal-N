import type { LucideIcon } from "lucide-react";
import StyledIcon from "./StyledIcon";
import GlassIcon from "./GlassIcon";
import { useIconGlass } from "../useIconGlass";
import { Calculator, Coins, Delete, Eye, Percent, EyeOff, Globe, Bell, Maximize2, Minimize2, Palette, User, Settings, CalendarDays, Newspaper, ChevronDown, Plus, Pencil, Check, MoreHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import Brand from "./Brand";
import Dropdown from "./Dropdown";
import Sessions from "./Sessions";
import NotificationsPanel from "./NotificationsPanel";
import { usePrivacy } from "../usePrivacy";
import { useDashEdit } from "../useDashEdit";
import type { Interests } from "../useInterests";
import { languages, stT, themeNames, type Key } from "../i18n";
import { useActiveTheme, useSettings } from "../useSettings";
import { openCalculator } from "../useCalculators";
import type { Lang, Theme } from "../types";

interface Props {
  lang: Lang;
  t: (k: Key) => string;
  theme: Theme;
  name: string;
  avatar: string | null;
  onLang: (l: Lang) => void;
  onTheme: (t: string) => void;
  onProfile: () => void;
  onSettings: () => void;
  onNews: () => void;
  onCalendar: () => void;
  calc?: ReactNode; // position size calculator panel
  onDashboard: () => void;
  onCharts?: () => void;
  interests: Interests;
}

const GOLD = "#e6b84a", GREY = "#94a3b8";
const ic = { size: 18, strokeWidth: 1.9, className: "text-icon" };
// A header icon: plain as before, or (icon style "glass") a coloured tile. `plain` is the plain size/stroke/class.
const G = (icon: LucideIcon, color: string, size = 30, plain: { size: number; strokeWidth?: number; className?: string } = ic) =>
  <StyledIcon icon={icon} size={size} color={color} plain={plain} className="transition hover:brightness-110" />;

const calcLabel: Record<Lang, string> = { en: "Position size", ar: "حجم الصفقة", fr: "Taille de position" };
const generalTools: Record<Lang, string> = { en: "General tools", ar: "أدوات عامة", fr: "Outils généraux" };
const generalItems: { key: string; icon: typeof Delete; label: Record<Lang, string> }[] = [
  { key: "std", icon: Delete, label: { en: "Calculator", ar: "آلة حاسبة", fr: "Calculatrice" } },
  { key: "fx", icon: Coins, label: { en: "Currency converter", ar: "محوّل العملات", fr: "Convertisseur de devises" } },
  { key: "pct", icon: Percent, label: { en: "Percentage", ar: "النسبة المئوية", fr: "Pourcentage" } },
];
const genColor: Record<string, string> = { std: "#94a3b8", fx: "#22c55e", pct: "#f97316" };
const allCalcs: Record<Lang, string> = { en: "All calculators", ar: "كل الحاسبات", fr: "Toutes les calculatrices" };

export default function Header({ lang, t, theme, name, avatar, onLang, onTheme, onProfile, onSettings, onNews, onCalendar, onDashboard, onCharts, interests, calc }: Props) {
  const privacy = usePrivacy();
  const { glass, fill } = useIconGlass();
  const ng = glass ? " mz-no-glass" : ""; // the coloured tile brings its own surface, so the frosted one steps aside
  const dash = useDashEdit();
  const appSettings = useSettings();
  const activeId = useActiveTheme();
  const customs = appSettings.customThemes ?? [];
  const L = stT(lang);
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
    { icon: CalendarDays, color: "#06b6d4", label: t("calendar"), onClick: onCalendar },
    { icon: Newspaper, color: "#d946ef", label: t("news"), onClick: onNews },
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
            {tabs.map(({ icon, color, label, onClick }) => (
              <button key={label} type="button" aria-label={label} onClick={onClick} className="flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium hover:bg-primary-tint">
                {G(icon, color, 24, { size: 16, strokeWidth: 1.9, className: "text-icon" })}
                <span className="hidden 2xl:inline">{label}</span>
              </button>
            ))}
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-bg/40 p-0.5">
              <button type="button" className="flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-medium hover:bg-primary-tint">
                {t("boards")}
                <ChevronDown size={14} className="text-icon" />
              </button>
              <button type="button" aria-label={t("addBoard")} className={`icon-btn${ng} !h-7 !w-7`}>
                {G(Plus, "#22c55e", 24, { size: 15, className: "text-icon" })}
              </button>
              <button type="button" aria-label={t("editBoards")} aria-pressed={dash.editing} onClick={() => { onDashboard(); dash.toggle(); }} className={`icon-btn${ng} !h-7 !w-7 ${dash.editing ? "!bg-primary" : ""}`}>
                {G(Pencil, "#8b5cf6", 24, { size: 14, className: dash.editing ? "text-on-primary" : "text-icon" })}
              </button>
            </div>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          </div>

          {calc && (
            <Dropdown label={calcLabel[lang]} panelClass="w-[min(92vw,360px)]" bare={glass} trigger={G(Calculator, GOLD)}>
              {(close) => (
                <>
                  {calc}
                  <div className="flex items-center justify-between gap-2 border-t border-border px-4 pb-1.5 pt-2">
                    <div className="flex items-center gap-1" role="group" aria-label={generalTools[lang]}>
                      {generalItems.map(({ key, icon: Icon, label }) => (
                        <button key={key} type="button" aria-label={label[lang]} title={label[lang]} onClick={() => { close(); openCalculator(key); }} className={`icon-btn${ng}`}>
                          {G(Icon, genColor[key], 28, { size: 16, strokeWidth: 1.9, className: "text-icon" })}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => { openCalculator(); close(); }} className="inline-flex items-center gap-1 text-xs font-semibold text-icon hover:underline">
                      {allCalcs[lang]}
                      <ChevronDown size={14} className="-rotate-90 rtl:rotate-90" aria-hidden />
                    </button>
                  </div>
                </>
              )}
            </Dropdown>
          )}

          <button type="button" aria-pressed={privacy.hidden} aria-label={t(privacy.hidden ? "privacyOff" : "privacyOn")} title={t(privacy.hidden ? "privacyOff" : "privacyOn")} onClick={privacy.toggle} className={`icon-btn${ng}`}>
            {privacy.hidden ? G(EyeOff, GREY) : G(Eye, "#22c55e")}
          </button>

          <Dropdown label={t("language")} bare={glass} trigger={G(Globe, "#3b82f6")}>
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
            bare={glass}
            label={t("notifications")}
            panelClass="w-[min(92vw,380px)]"
            trigger={
              <span className={`relative flex items-center justify-center ${interests.unread > 0 ? "bell-ringing" : ""}`}>
                {glass ? <GlassIcon icon={Bell} size={30} color="#f97316" fill={fill} className="bell-ico" /> : <Bell {...ic} className="bell-ico" />}
                {interests.unread > 0 && (
                  <span className="absolute -end-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] font-bold text-white">{interests.unread > 9 ? "9+" : interests.unread}</span>
                )}
              </span>
            }
          >
            {(close) => <NotificationsPanel t={t} lang={lang} interests={interests} onNews={onNews} onCalendar={onCalendar} onCharts={onCharts} close={close} />}
          </Dropdown>

          <Dropdown label={t("settings")} bare={glass} trigger={G(MoreHorizontal, GREY)}>
            {(close) => (
              <>
                <button type="button" onClick={() => { toggleFull(); close(); }} className="menu-item">
                  {full ? <Minimize2 size={16} className="text-icon" /> : <Maximize2 size={16} className="text-icon" />}
                  <span className="flex-1 text-start">{t("fullscreen")}</span>
                </button>
                <button type="button" onClick={() => { onSettings(); close(); }} className="menu-item">
                  <Settings size={16} className="text-icon" />
                  <span className="flex-1 text-start">{t("settings")}</span>
                </button>
                <div className="my-1 h-px bg-border" aria-hidden />
                <p className="px-2 pb-1 pt-1 text-xs font-semibold text-muted">{t("theme")}</p>
                {(Object.keys(themeNames) as Theme[]).map((th) => (
                  <button key={th} role="menuitemradio" aria-checked={activeId === th} onClick={() => { onTheme(th); close(); }} className="menu-item">
                    <Palette size={16} className="text-icon" />
                    <span className="flex-1 text-start">{themeNames[th][lang]}</span>
                    {activeId === th && <Check size={16} className="text-icon" />}
                  </button>
                ))}
                {customs.length > 0 && (
                  <>
                    <div className="my-1 h-px bg-border" aria-hidden />
                    <button role="menuitemradio" aria-checked={activeId === customs[0].id} onClick={() => { onTheme(customs[0].id); close(); }} className="menu-item">
                      <Palette size={16} className="text-icon" />
                      <span className="flex-1 text-start">{customs[0].name}</span>
                      {activeId === customs[0].id && <Check size={16} className="text-icon" />}
                    </button>
                  </>
                )}
              </>
            )}
          </Dropdown>

          <button type="button" aria-label={t("profile")} title={t("profile")} onClick={onProfile} className="icon-btn mz-no-glass overflow-hidden rounded-full border-2 border-primary" style={{ boxShadow: "0 0 10px 0 color-mix(in srgb, var(--primary) 45%, transparent)" }}>
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <User {...ic} />}
          </button>
        </div>
      </div>
    </header>
  );
}
