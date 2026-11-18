// GLORIA_RPG: the land view -- what fills the whole game area once you travel INTO a zone (GloriaPage dives
// into the map and swaps to this under a cloud curtain). The land (a painted image with clickable gates) is drawn by
// GloriaLandCanvas from the zone's LandDefinition (gloriaLands). Zones without a land yet show a "Coming soon"
// placeholder in their colour. The land fills the area edge to edge; all chrome floats over it: zone name
// (top-centre), exit (top-end), the circular mini-map (bottom-start) that travels back to the world map, and the
// guide button (bottom-end) that asks GloriaPage to open the full-screen guide (GloriaGuidePanel) -- the zone's
// challenges, the rules and the roster.
//
// The land's gates are wired to the game: clicking the entry gate opens GloriaWelcomeModal (the zone's flavour
// text), the boss gate opens the guide on its Challenges tab, and the exit gate travels back to the world map once
// the boss is defeated -- before that it only raises a "Defeat the boss first!" GloriaToast. The entry and exit
// are also trigger zones the hero walks into (gloriaGateTriggers): the entry respawns it inside the city, the exit
// does what clicking it does. The boss gate is click-only.
//
// A multi-scene land (Aurelia: temple exterior, then interior) opens on its first scene; a gate with `to` is a portal
// -- walking into it or clicking it swaps the land to that scene (getLandScene), where the hero starts at the scene's
// own `start`. The scene is view state, keyed to the zone so travelling away and back reopens the first scene.
//
// Escape closes the welcome card first: while it is open a capture-phase listener swallows the key, so GloriaPage's
// own Escape handler (land → world map → exit) only runs once it is closed. Colours are explicit light-on-dark (not
// theme tokens) because game mode is always a dark screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import type { Lang } from "../../types";
import { ZONE_ICON, type MapZone } from "./gloriaZones";
import { getLandScene, getZoneLand, type LandGateId, type LandSceneId } from "./gloriaLands";
import type { TriggerGateId } from "./gloriaGateTriggers";
import GloriaLandCanvas from "./GloriaLandCanvas";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";
import GloriaMiniMap from "./GloriaMiniMap";
import type { GuideTab } from "./GloriaGuidePanel";
import GloriaWelcomeModal from "./GloriaWelcomeModal";
import GloriaToast from "./GloriaToast";
import "./gloria.css";

const EXIT_TEXT: Record<Lang, string> = { en: "Exit game", ar: "الخروج من اللعبة", fr: "Quitter le jeu" };
const COMING_SOON: Record<Lang, string> = { en: "Coming Soon", ar: "قريباً", fr: "Bientôt disponible" };
const GUIDE_TEXT: Record<Lang, string> = { en: "Guide", ar: "دليل", fr: "Guide" };
const BOSS_FIRST_TEXT: Record<Lang, string> = { en: "Defeat the boss first!", ar: "اهزم الزعيم أولاً!", fr: "Battez d'abord le boss !" };

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
  /** The player's class, which picks the hero sprite. */
  character?: GloriaCharacterId | null;
  /** Opens the full-screen guide (owned by GloriaPage) on the given tab. */
  onOpenGuide: (tab: GuideTab) => void;
}

export default function GloriaLandView({ mz, lang, onWorldMap, onExitGame, className = "", character, onOpenGuide }: Props) {
  const { visual } = mz;
  const baseLand = getZoneLand(visual.theme);
  // The active scene, remembered with the zone it belongs to: another zone (or coming back) always starts on the
  // first scene. A land without scenes never has one.
  const [scene, setScene] = useState<{ order: number; id: LandSceneId } | null>(null);
  const sceneId = scene?.order === visual.order ? scene.id : undefined;
  const land = baseLand ? getLandScene(baseLand, sceneId) : null;
  const icon = ZONE_ICON[visual.theme];
  const worldMapRef = useRef<HTMLButtonElement>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  // A fresh id per toast restarts it when the same gate is clicked again while it is still showing.
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  // Arriving in a land: focus the way back (the mini-map), with the welcome card and toast closed.
  useEffect(() => {
    setWelcomeOpen(false);
    setToast(null);
    worldMapRef.current?.focus({ preventScroll: true });
  }, [visual.order]);

  // Leaving the zone forgets its scene, so coming back reopens the first one even if this view stays mounted.
  useEffect(() => () => setScene(null), [visual.order]);

  // Warm the cache with the other scenes' paintings so a portal swaps instantly instead of fading in from black.
  useEffect(() => {
    for (const s of Object.values(baseLand?.scenes ?? {})) new Image().src = s.image;
  }, [baseLand]);

  const enterScene = useCallback((id: LandSceneId) => setScene({ order: visual.order, id }), [visual.order]);

  const onGateClick = useCallback(
    (gate: LandGateId) => {
      if (gate === "entry") setWelcomeOpen(true);
      else if (gate === "boss") onOpenGuide("challenges");
      else if (mz.bossDefeated) onWorldMap();
      else setToast((t) => ({ id: (t?.id ?? 0) + 1, message: BOSS_FIRST_TEXT[lang] }));
    },
    [mz.bossDefeated, onWorldMap, onOpenGuide, lang],
  );

  // The hero walked into a trigger zone (the canvas has already faded it out where that applies). Reaching the exit
  // does what clicking it does: the world map once the boss is beaten, the "defeat the boss first" toast before.
  // Reaching the entry needs nothing here: the hero has been respawned inside the city.
  const onGateReach = useCallback(
    (gate: TriggerGateId) => {
      if (gate === "exit") onGateClick("exit");
    },
    [onGateClick],
  );

  return (
    <section aria-label={visual.name[lang]} className={`gz-land relative h-full overflow-hidden text-stone-100 ${className}`}>
      {land ? (
        <div className="h-full w-full overflow-hidden bg-black">
          <GloriaLandCanvas
            land={land}
            lang={lang}
            onGateClick={onGateClick}
            onGateReach={onGateReach}
            onSceneChange={enterScene}
            arrived={!!sceneId}
            bossDefeated={mz.bossDefeated}
            character={character}
          />
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

      <GloriaMiniMap ref={worldMapRef} mz={mz} lang={lang} onWorldMap={onWorldMap} />

      {/* guide button: bottom-end, mirroring the mini-map. Opens the full-screen guide on its Challenges tab. */}
      <button
        type="button"
        onClick={() => onOpenGuide("challenges")}
        aria-label={GUIDE_TEXT[lang]}
        aria-haspopup="dialog"
        className="gz-guide-btn group absolute bottom-4 end-4 z-[25] flex h-11 w-11 items-center justify-center rounded-full border-2 border-amber-500/40 bg-amber-900/80 text-amber-200 shadow-lg shadow-black/50 backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:border-amber-400/60 hover:bg-amber-800/90 focus-visible:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 md:h-[52px] md:w-[52px]"
      >
        <BookOpen className="h-5 w-5 md:h-6 md:w-6" aria-hidden />
        <span
          className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-amber-500/30 bg-black/85 px-2 py-0.5 text-xs font-semibold text-amber-100 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        >
          {GUIDE_TEXT[lang]}
        </span>
      </button>

      {/* zone name badge */}
      <div className="pointer-events-none absolute left-1/2 top-3 flex max-w-[50%] -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-sm font-bold text-amber-100 backdrop-blur-sm">
        <span aria-hidden>{icon}</span>
        <span className="truncate">{visual.name[lang]}</span>
      </div>

      {toast && (
        <GloriaToast key={toast.id} message={toast.message} dir={lang === "ar" ? "rtl" : "ltr"} onDone={() => setToast(null)} />
      )}

      {welcomeOpen && <GloriaWelcomeModal zone={visual} lang={lang} onClose={() => setWelcomeOpen(false)} />}

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
