// GLORIA_RPG: the land view -- what fills the whole game area once you travel INTO a zone (GloriaPage dives
// into the map and swaps to this under a cloud curtain). The land (a painted image with clickable gates) is drawn by
// GloriaLandCanvas from the zone's LandDefinition (gloriaLands). Zones without a land yet show a "Coming soon"
// placeholder in their colour. The land fills the area edge to edge; all chrome floats over it: zone name
// (top-centre), exit (top-end), the circular mini-map (bottom-start) that travels back to the world map, and the
// guide button (bottom-end) that slides in GloriaGuidePanel -- the zone's challenges, the rules and the roster.
//
// Escape closes the guide first: while it is open a capture-phase listener swallows the key, so GloriaPage's
// own Escape handler (land → world map → exit) only runs once the guide is closed. Colours are explicit
// light-on-dark (not theme tokens) because game mode is always a dark screen.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import type { Lang } from "../../types";
import type { MapZone, ZoneTheme } from "./gloriaZones";
import { getZoneLand } from "./gloriaLands";
import GloriaLandCanvas from "./GloriaLandCanvas";
import GloriaMiniMap from "./GloriaMiniMap";
import GloriaGuidePanel from "./GloriaGuidePanel";
import "./gloria.css";

const EXIT_TEXT: Record<Lang, string> = { en: "Exit game", ar: "الخروج من اللعبة", fr: "Quitter le jeu" };
const COMING_SOON: Record<Lang, string> = { en: "Coming Soon", ar: "قريباً", fr: "Bientôt disponible" };
const GUIDE_TEXT: Record<Lang, string> = { en: "Guide", ar: "دليل", fr: "Guide" };

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
  const guideBtnRef = useRef<HTMLButtonElement>(null);
  const guideCloseRef = useRef<HTMLButtonElement>(null);
  const guideId = useId();
  const [guideOpen, setGuideOpen] = useState(false);

  // Arriving in a land: focus the way back (the mini-map), with the guide closed.
  useEffect(() => {
    setGuideOpen(false);
    worldMapRef.current?.focus({ preventScroll: true });
  }, [visual.order]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    guideBtnRef.current?.focus({ preventScroll: true });
  }, []);

  // Opening the guide moves focus into it.
  useEffect(() => {
    if (guideOpen) guideCloseRef.current?.focus({ preventScroll: true });
  }, [guideOpen]);

  // Escape closes the guide before anything else. Capture phase on window runs ahead of GloriaPage's bubble-phase
  // window listener, and stopImmediatePropagation keeps that one from also leaving the land.
  useEffect(() => {
    if (!guideOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeGuide();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [guideOpen, closeGuide]);

  return (
    <section aria-label={visual.name[lang]} className={`gz-land relative h-full overflow-hidden text-stone-100 ${className}`}>
      {land ? (
        <div className="h-full w-full overflow-hidden bg-black">
          <GloriaLandCanvas land={land} lang={lang} />
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

      {guideOpen && <GloriaGuidePanel id={guideId} mz={mz} lang={lang} onClose={closeGuide} closeRef={guideCloseRef} />}

      {/* guide button: bottom-end, mirroring the mini-map. Sits above the panel; on wide screens it steps aside to
          the panel's edge so it never covers the panel's content. */}
      <button
        ref={guideBtnRef}
        type="button"
        onClick={() => (guideOpen ? closeGuide() : setGuideOpen(true))}
        aria-label={GUIDE_TEXT[lang]}
        aria-expanded={guideOpen}
        aria-controls={guideOpen ? guideId : undefined}
        className={`gz-guide-btn group absolute bottom-4 end-4 z-[25] flex h-11 w-11 items-center justify-center rounded-full border-2 border-amber-500/40 bg-amber-900/80 text-amber-200 shadow-lg shadow-black/50 backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:border-amber-400/60 hover:bg-amber-800/90 focus-visible:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 md:h-[52px] md:w-[52px] ${
          guideOpen ? "border-amber-400/60 bg-amber-800/90 md:end-[396px]" : ""
        }`}
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
