import {
  SquarePlus,
  MessageCircle,
  ArrowRight,
  Clock,
  Globe,
  Bell,
  Maximize2,
  Palette,
  User,
  Settings,
  LayoutGrid,
  CalendarDays,
  Newspaper,
  ChevronDown,
  Plus,
  Pencil,
  Check,
} from "lucide-react";
import Brand, { ByLine } from "./Brand";
import Dropdown from "./Dropdown";
import { languages, themeNames, type Key } from "../i18n";
import type { Lang, Theme } from "../types";

interface Props {
  lang: Lang;
  t: (k: Key) => string;
  theme: Theme;
  onLang: (l: Lang) => void;
  onTheme: (t: Theme) => void;
  onConnect: () => void;
}

const ic = { size: 18, strokeWidth: 1.9, className: "text-icon" };

function MenuRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button type="button" className="menu-row" onClick={onClick}>
      {icon}
      <span className="flex-1 text-start">{label}</span>
      <ArrowRight size={16} className="text-muted directional-icon" />
    </button>
  );
}

export default function Header({ lang, t, theme, onLang, onTheme, onConnect }: Props) {
  const tabs = [
    { icon: LayoutGrid, label: t("metrics"), active: true },
    { icon: CalendarDays, label: t("calendar"), active: false },
    { icon: Newspaper, label: t("news"), active: false },
  ];

  return (
    <header className="flex items-stretch gap-4 border-b border-border px-3 py-2.5">
      {/* Logo — far corner */}
      <div className="shrink-0 self-start">
        <Brand lang={lang} />
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-2 grid-rows-[auto_auto_auto] lg:grid-rows-[auto_auto] lg:grid-cols-[1fr_auto_1fr] items-center gap-x-4 gap-y-2">
        {/* Row 1 */}
        <div className="hidden w-full max-w-[340px] flex-col gap-1 min-[1360px]:flex">
          <MenuRow icon={<SquarePlus {...ic} />} label={t("connect")} onClick={onConnect} />
          <MenuRow icon={<MessageCircle {...ic} />} label={t("feedback")} />
        </div>
        <div className="col-span-2 col-start-1 row-start-1 justify-self-start lg:col-span-1 min-[1360px]:col-start-2 min-[1360px]:justify-self-center">
          <ByLine />
        </div>
        <div className="col-span-2 col-start-1 row-start-2 justify-self-start lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:justify-self-end flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
          <span className="hidden items-center gap-2 px-2.5 text-sm font-semibold whitespace-nowrap sm:flex">
            <Clock {...ic} />
            <span className="hidden min-[1360px]:inline">{t("market")}</span>
          </span>

          <Dropdown label={t("language")} trigger={<Globe {...ic} />}>
            {(close) =>
              languages.map((l) => (
                <button
                  key={l.code}
                  role="menuitemradio"
                  aria-checked={lang === l.code}
                  onClick={() => {
                    onLang(l.code);
                    close();
                  }}
                  className="menu-item"
                >
                  <span className="flex-1 text-start">{l.label}</span>
                  {lang === l.code && <Check size={16} className="text-icon" />}
                </button>
              ))
            }
          </Dropdown>

          <button type="button" aria-label={t("notifications")} className="icon-btn relative">
            <Bell {...ic} />
            <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] font-bold text-white">
              1
            </span>
          </button>

          <button type="button" aria-label={t("fullscreen")} className="icon-btn hidden sm:inline-flex">
            <Maximize2 {...ic} />
          </button>

          <Dropdown label={t("theme")} trigger={<Palette {...ic} />}>
            {(close) =>
              (Object.keys(themeNames) as Theme[]).map((th) => (
                <button
                  key={th}
                  role="menuitemradio"
                  aria-checked={theme === th}
                  onClick={() => {
                    onTheme(th);
                    close();
                  }}
                  className="menu-item"
                >
                  <span className="flex-1 text-start">{themeNames[th][lang]}</span>
                  {theme === th && <Check size={16} className="text-icon" />}
                </button>
              ))
            }
          </Dropdown>

          <button
            type="button"
            aria-label={t("profile")}
            className="icon-btn rounded-full border border-icon/60"
          >
            <User {...ic} />
          </button>

          <button type="button" className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold">
            <Settings {...ic} />
            {t("settings")}
          </button>
        </div>

        {/* Row 2 */}
        <p className="col-span-2 col-start-1 row-start-3 lg:col-span-1 lg:row-start-2 font-heading text-lg font-semibold">
          {t("greeting")}
        </p>

        <div className="col-start-2 row-start-2 hidden lg:flex items-center gap-1 rounded-xl border border-border bg-surface p-1 text-sm">
          {tabs.map(({ icon: Icon, label, active }) => (
            <button
              key={label}
              type="button"
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium ${
                active ? "bg-primary text-on-primary" : "text-text hover:bg-primary-tint"
              }`}
            >
              <Icon size={16} strokeWidth={1.9} className={active ? "" : "text-icon"} />
              <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
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
        </div>

        <button
          type="button"
          className="col-start-3 row-start-2 hidden lg:flex items-center gap-2 justify-self-end rounded-full border border-border bg-surface px-5 py-2 text-sm font-semibold"
        >
          <Pencil size={15} className="text-icon" />
          {t("editTemplate")}
        </button>
      </div>
    </header>
  );
}
