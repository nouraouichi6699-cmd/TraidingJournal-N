// GLORIA_RPG: the land view -- what fills the whole game area once you travel INTO a zone (GloriaPage dives
// into the map and swaps to this under a cloud curtain). The land is drawn as a pixel-art tile map by
// GloriaLandCanvas from the zone's LandDefinition (gloriaLands). Zones without a land yet show a "Coming soon"
// placeholder in their colour. Floating chrome: "World Map" (top-start), zone name (top-centre), exit (top-end).
//
// The challenge cards + boss card are kept below as GloriaLandChallenges but are not rendered for now -- they
// come back as a sidebar beside the land. Colours are explicit light-on-dark (not theme tokens) because game
// mode is always a dark screen.
import { useEffect, useRef } from "react";
import { Lock, Map as MapIcon, Skull, X } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaQuestStatus } from "../../types/gloria";
import type { MapZone, ZoneTheme } from "./gloriaZones";
import { Bar, STATUS_ICON, XpChip, zoneDetail } from "./gloriaChallengeUi";
import { gt, QUEST_STATUS_TEXT } from "./gloriaText";
import { getZoneLand } from "./gloriaLands";
import GloriaLandCanvas from "./GloriaLandCanvas";
import "./gloria.css";

const STATUS_TONE: Record<GloriaQuestStatus, string> = {
  locked: "text-stone-500",
  active: "text-stone-100",
  completed: "text-emerald-400",
  failed: "text-red-400",
};

const WORLD_MAP_TEXT: Record<Lang, string> = { en: "World Map", ar: "خريطة العالم", fr: "Carte du monde" };
const EXIT_TEXT: Record<Lang, string> = { en: "Exit game", ar: "الخروج من اللعبة", fr: "Quitter le jeu" };
const COMING_SOON: Record<Lang, string> = { en: "Coming Soon", ar: "قريباً", fr: "Bientôt disponible" };

const THEME_ICON: Record<ZoneTheme, string> = {
  oasis: "🏝️",
  forest: "🌲",
  mountain: "⛰️",
  sea: "🌊",
  castle: "🏰",
  volcano: "🌋",
  throne: "👑",
};

interface Props {
  mz: MapZone;
  /** The zone before this one, named in the "how to unlock" line. */
  prev: MapZone | null;
  lang: Lang;
  /** Travel back to the world map (cloud transition). */
  onWorldMap: () => void;
  /** Leave game mode entirely. */
  onExitGame?: () => void;
  className?: string;
}

export default function GloriaLandView({ mz, lang, onWorldMap, onExitGame, className = "" }: Props) {
  const { visual } = mz;
  const land = getZoneLand(visual.theme);
  const icon = THEME_ICON[visual.theme];
  const worldMapRef = useRef<HTMLButtonElement>(null);

  // Arriving in a land: focus the way back.
  useEffect(() => {
    worldMapRef.current?.focus({ preventScroll: true });
  }, [visual.order]);

  return (
    <section aria-label={visual.name[lang]} className={`gz-land relative h-full overflow-hidden text-stone-100 ${className}`}>
      {land ? (
        <div className="flex h-full w-full items-center justify-center overflow-auto bg-black/95">
          <GloriaLandCanvas land={land} />
        </div>
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center"
          style={{ background: `radial-gradient(ellipse, ${visual.color}22, black)` }}
        >
          <span className="mb-4 text-6xl" aria-hidden>
            {icon}
          </span>
          <span className="text-lg font-bold text-amber-200/60">{visual.name[lang]}</span>
          <span className="mt-2 text-sm text-amber-200/30">{COMING_SOON[lang]}</span>
        </div>
      )}

      <button
        ref={worldMapRef}
        type="button"
        onClick={onWorldMap}
        title={`${WORLD_MAP_TEXT[lang]} (Esc)`}
        className="absolute start-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-black/60 px-3 py-2 text-sm font-bold text-amber-200 backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        <MapIcon size={16} className="shrink-0" aria-hidden />
        <span className="hidden sm:inline">{WORLD_MAP_TEXT[lang]}</span>
        <span className="sr-only sm:hidden">{WORLD_MAP_TEXT[lang]}</span>
      </button>

      {/* zone name badge */}
      <div className="pointer-events-none absolute left-1/2 top-3 flex max-w-[50%] -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-sm font-bold text-amber-100 backdrop-blur-sm">
        <span aria-hidden>{icon}</span>
        <span className="truncate">{visual.name[lang]}</span>
      </div>

      {onExitGame && (
        <button
          type="button"
          onClick={onExitGame}
          aria-label={EXIT_TEXT[lang]}
          title={EXIT_TEXT[lang]}
          className="absolute end-3 top-3 z-10 rounded-full border border-white/15 bg-black/55 p-1.5 text-stone-300 backdrop-blur-sm transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <X size={18} />
        </button>
      )}
    </section>
  );
}

/** The zone's challenge cards + boss card. Not rendered yet -- it returns as the land's sidebar in the next step. */
export function GloriaLandChallenges({ mz, lang }: { mz: MapZone; lang: Lang }) {
  const t = gt(lang);
  const ar = lang === "ar";
  const { visual } = mz;
  const { regular, boss, bossName, text, zoneFill } = zoneDetail(mz, lang);

  return (
    <div className="p-5 sm:p-7">
      {/* challenges */}
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-stone-400">{t("challenges")}</h3>
      {mz.challenges.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-stone-400">{t("noChallenges")}</p>}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {regular.map(({ challenge: c, progress: p, status }) => {
          const Icon = STATUS_ICON[status];
          return (
            <li
              key={c.id}
              className={`rounded-xl border p-4 backdrop-blur-sm transition ${
                status === "completed" ? "border-emerald-500/30 bg-emerald-500/[0.07]" : status === "failed" ? "border-red-500/30 bg-red-500/[0.07]" : status === "active" ? "border-white/15 bg-white/[0.05]" : "border-white/10 bg-black/20 opacity-60"
              }`}
              style={status === "active" ? { boxShadow: `inset ${ar ? -3 : 3}px 0 0 ${visual.color}` } : undefined}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 ${STATUS_TONE[status]}`} title={QUEST_STATUS_TEXT[status][lang]}>
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold leading-snug">{text(c.name, c.nameAr)}</div>
                    <XpChip xp={c.xpReward} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-stone-400">{text(c.description, c.descriptionAr)}</p>
                  <div className={`mt-1.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_TONE[status]}`}>{QUEST_STATUS_TEXT[status][lang]}</div>
                  {status !== "locked" && p && (
                    <Bar value={p.currentValue} target={p.targetValue} color={status === "completed" ? "#22c55e" : status === "failed" ? "#ef4444" : zoneFill} />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* the boss */}
      {(boss || bossName) && (
        <div
          className={`relative mt-8 overflow-hidden rounded-2xl border p-5 sm:p-6 ${
            boss?.status === "completed" ? "border-amber-400/40" : boss?.status === "active" ? "gz-boss-card--active border-red-500/60" : "border-red-900/50"
          }`}
          style={{ background: "radial-gradient(120% 90% at 50% 0%, rgba(127,29,29,0.6), rgba(28,25,23,0.94) 70%)" }}
        >
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 sm:h-20 sm:w-20 ${
                boss?.status === "completed" ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-red-500 bg-red-950 text-red-300"
              }`}
            >
              <Skull size={38} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300/80">{t("boss")}</div>
              <div className="font-heading text-xl font-bold leading-tight text-red-50 sm:text-2xl">{bossName ?? text(boss!.challenge.name, boss!.challenge.nameAr)}</div>
            </div>
            {boss && <XpChip xp={boss.challenge.xpReward} big />}
          </div>
          {boss && (
            <>
              <div className="mt-4 text-sm font-semibold text-red-100">{text(boss.challenge.name, boss.challenge.nameAr)}</div>
              <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-red-200/70">{text(boss.challenge.description, boss.challenge.descriptionAr)}</p>
              {boss.status === "locked" && (
                <p className="mt-3 flex items-center gap-2 text-xs text-red-200/60">
                  <Lock size={13} /> {t("bossLocked")}
                </p>
              )}
              {boss.status === "active" && (
                <>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wider text-red-400">{t("bossAwaits")}</p>
                  {boss.progress && <Bar value={boss.progress.currentValue} target={boss.progress.targetValue} color="#ef4444" />}
                </>
              )}
              {boss.status === "completed" && (
                <div className="absolute bottom-3 end-4 rotate-[-12deg] rounded-md border-2 border-amber-400 px-2 py-0.5 text-xs font-black uppercase tracking-widest text-amber-400">
                  {t("bossDefeated")}
                </div>
              )}
              {boss.status === "failed" && <p className="mt-3 text-xs font-bold uppercase text-red-400">{QUEST_STATUS_TEXT.failed[lang]}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
