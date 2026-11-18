// GLORIA_RPG: full-screen game mode. Takes over the entire viewport via React portal,
// hiding the dashboard sidebar/header beneath a fixed overlay.
//   - Top bar: pixel MIZAN logo (gold) + player name | exit button
//   - Center: the adventure map (fills available space). Clicking a zone travels INTO that land: the camera
//     zooms into the zone, clouds sweep across (GloriaCloudTransition), and the land takes the whole center.
//     "World Map" / Esc travels back under the clouds.
//   - Bottom bar: slim player HUD (character, rank, XP, Elf Meter, radar)
//   - Fade-in entry transition from black
//
// TODO(gloria-demo-testing): see the old file's note -- no tradeMode filter; demo accounts are intentional.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, LogOut, TriangleAlert } from "lucide-react";
import type { Account, Lang, Trade } from "../types";
import type { GloriaRadarStats } from "../types/gloria";
import { useGloriaQuests } from "../hooks/useGloriaQuests";
import { useGloriaHero } from "../hooks/useGloriaHero";
import { calculateElfMeter, calculateMonthlyStats, calculateRadarStats, mostRecentTradingMonth } from "../services/gloriaCharacterService";
import { getRank } from "../services/gloriaPlayerService";
import GloriaPlayerHUD from "../components/gloria/GloriaPlayerHUD";
import GloriaHeroReveal from "../components/gloria/GloriaHeroReveal";
import GloriaMapView from "../components/gloria/GloriaMapView";
import GloriaLandView from "../components/gloria/GloriaLandView";
import GloriaCloudTransition, { prefersReducedMotion } from "../components/gloria/GloriaCloudTransition";
import { buildMapZones, type MapZone, type ZoneMapState } from "../components/gloria/gloriaZones";
import { gt } from "../components/gloria/gloriaText";

const EMPTY_RADAR: GloriaRadarStats = { precision: 0, speed: 0, defense: 0, wisdom: 0, recovery: 0, intelligence: 0, power: 0 };
const CELEBRATE_MS = 6000;
const LOADING_OVERLAY_MAX_MS = 2000;
/** How far into the 600ms zoom (.gz-map-frame--zoom) the clouds start closing in. */
const ZOOM_CLOUDS_DELAY_MS = 400;

/**
 * map → entering (zoom, clouds in, swap to land, clouds out) → land → exiting (clouds in, swap to map,
 * clouds out) → map. Zone clicks and Esc are ignored mid-transition.
 */
type GamePhase = "map" | "entering" | "land" | "exiting";

const seenKey = (userId: string) => `mizan-gloria-seen-${userId}`;
function readSeen(userId: string): Record<number, ZoneMapState> | null {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return raw ? (JSON.parse(raw) as Record<number, ZoneMapState>) : {};
  } catch {
    return null;
  }
}
function writeSeen(userId: string, seen: Record<number, ZoneMapState>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch { /* storage unavailable */ }
}

interface Props {
  userId: string;
  lang: Lang;
  trades: Trade[];
  accounts: Account[];
  playerName?: string;
  onExit?: () => void;
}

export default function GloriaPage({ userId, lang, trades, accounts, playerName, onExit }: Props) {
  const t = gt(lang);
  const quests = useGloriaQuests(userId, trades, accounts);
  const { zones, challenges, progress, playerStats, loading, evaluating, error, refresh } = quests;

  const mapZones = useMemo(() => buildMapZones(zones, challenges, progress), [zones, challenges, progress]);

  // The hero (who the player IS) is persisted and only changes on the weekly / new-month schedule: useGloriaHero reads
  // it, running a due update when there is one. `live` below is a different thing: this month's running numbers,
  // which keep the HUD's radar and Elf Meter moving and feed the roster's progress bars, but never pick the hero.
  const hero = useGloriaHero(userId, trades, accounts);

  const live = useMemo(() => {
    const month = mostRecentTradingMonth(trades);
    const stats = calculateMonthlyStats(trades, month, accounts);
    if (!stats.totalTrades) return { stats, radar: EMPTY_RADAR, elfMeter: 0 };
    const radar = calculateRadarStats(stats);
    return { stats, radar, elfMeter: calculateElfMeter(radar) };
  }, [trades, accounts]);
  const heroData = useMemo(() => ({ hero, live: { stats: live.stats, radar: live.radar } }), [hero, live]);

  const totalXp = playerStats?.totalXp ?? 0;
  const rank = playerStats?.currentRank ?? getRank(totalXp);

  // ── Zone entry / exit state machine ──
  const [phase, setPhase] = useState<GamePhase>("map");
  const [activeLand, setActiveLand] = useState<number | null>(null);
  /** The zone node (map viewBox units) the camera dives into; null = map at scale 1. */
  const [zoomOrigin, setZoomOrigin] = useState<{ x: number; y: number } | null>(null);
  /** Which scene is mounted. It flips mid-phase, while the clouds fully cover the game area. */
  const [scene, setScene] = useState<"map" | "land">("map");
  const [cloudsIn, setCloudsIn] = useState(false);

  const land = activeLand != null ? mapZones.find((z) => z.visual.order === activeLand) ?? null : null;
  const prev = activeLand != null ? mapZones.find((z) => z.visual.order === activeLand - 1) ?? null : null;

  const onOpenZone = useCallback(
    (mz: MapZone) => {
      if (phase !== "map") return;
      setActiveLand(mz.visual.order);
      if (!prefersReducedMotion()) setZoomOrigin({ x: mz.visual.node.x, y: mz.visual.node.y });
      setPhase("entering");
    },
    [phase],
  );
  const onWorldMap = useCallback(() => {
    if (phase === "land") setPhase("exiting");
  }, [phase]);

  // Entering: clouds close in partway through the zoom. Exiting: straight away.
  useEffect(() => {
    if (phase !== "entering" && phase !== "exiting") return;
    const delay = phase === "entering" && !prefersReducedMotion() ? ZOOM_CLOUDS_DELAY_MS : 0;
    const timer = window.setTimeout(() => setCloudsIn(true), delay);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const onCloudsCovered = () => {
    if (phase === "entering") {
      setScene("land");
      setZoomOrigin(null); // the map is hidden now; snap it back to scale 1 for the return trip
    } else if (phase === "exiting") {
      setScene("map");
      setActiveLand(null);
    }
    setCloudsIn(false);
  };
  const onCloudsCleared = () => {
    if (phase === "entering") setPhase("land");
    else if (phase === "exiting") setPhase("map");
  };

  const [celebrate, setCelebrate] = useState<ReadonlySet<number>>(new Set());
  const [reveal, setReveal] = useState<ReadonlySet<number>>(new Set());

  const [overlayTimedOut, setOverlayTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) { setOverlayTimedOut(false); return; }
    const timer = window.setTimeout(() => setOverlayTimedOut(true), LOADING_OVERLAY_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);
  const showLoadingOverlay = loading && !overlayTimedOut;

  useEffect(() => {
    if (loading || error || !progress.length) return;
    const seen = readSeen(userId);
    if (!seen) return;
    const conquered = new Set<number>(), revealed = new Set<number>();
    for (const z of mapZones) {
      const before = seen[z.visual.order];
      if (z.state === "completed" && before !== "completed") conquered.add(z.visual.order);
      else if (z.state === "active" && before === "locked") revealed.add(z.visual.order);
    }
    writeSeen(userId, Object.fromEntries(mapZones.map((z) => [z.visual.order, z.state])));
    if (conquered.size) setCelebrate(conquered);
    if (revealed.size) setReveal(revealed);
  }, [mapZones, loading, error, progress.length, userId]);

  useEffect(() => {
    if (!celebrate.size && !reveal.size) return;
    const timer = window.setTimeout(() => { setCelebrate(new Set()); setReveal(new Set()); }, CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [celebrate, reveal]);

  // ── Game-mode specific hooks ──

  // Fade-in entry animation
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Escape steps back out: land → world map → exit the game (ignored mid-transition)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phase === "land") setPhase("exiting");
      else if (phase === "map") onExit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, phase]);

  // Lock body scroll while game mode is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const gameScreen = (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black transition-opacity duration-700"
      style={{ opacity: entered ? 1 : 0 }}
    >
      {/* ── top bar: pixel MIZAN logo + player name | exit ── */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2 bg-black/90 border-b border-amber-500/20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Mizan"
            className="h-8 w-8"
            style={{ imageRendering: "pixelated", filter: "sepia(1) saturate(3) hue-rotate(10deg) brightness(1.1)" }}
          />
          <span
            className="font-bold tracking-widest"
            style={{
              background: "linear-gradient(135deg, #facc15, #f59e0b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontFamily: "'Press Start 2P', 'Courier New', monospace",
              fontSize: "13px",
              letterSpacing: "0.15em",
            }}
          >
            MIZAN
          </span>
          {playerName && (
            <span className="text-xs font-medium text-amber-200/60 max-w-[120px] truncate">
              {playerName}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/25 hover:text-amber-100"
          title="Exit (Esc)"
        >
          <LogOut size={14} />
          {lang === "ar" ? "خروج" : "Exit"}
        </button>
      </div>

      {/* ── center: the adventure map or a land, full size, with the cloud curtain on top ── */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className={`h-full ${zoomOrigin ? "overflow-hidden" : "overflow-auto"}`} hidden={scene !== "map"}>
          {error && (
            <div role="alert" className="mx-4 mt-2 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <TriangleAlert size={16} className="shrink-0" />
              <span className="font-semibold">{t("error")}</span>
              <span className="truncate text-xs opacity-80">{error}</span>
            </div>
          )}

          <GloriaMapView
            zones={mapZones}
            lang={lang}
            onOpenZone={onOpenZone}
            celebrate={celebrate}
            reveal={reveal}
            zoomOrigin={zoomOrigin}
            overlay={
              showLoadingOverlay ? (
                <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-amber-100">
                  <Loader2 size={16} className="animate-spin" /> {t("loading")}
                </div>
              ) : null
            }
          />
        </div>

        {scene === "land" && land && (
          <div className="absolute inset-0">
            <GloriaLandView mz={land} prev={prev} lang={lang} onWorldMap={onWorldMap} onExitGame={onExit} character={hero.character} heroData={heroData} />
          </div>
        )}

        <GloriaCloudTransition active={cloudsIn} onFullyCovered={onCloudsCovered} onFullyCleared={onCloudsCleared} />
      </div>

      {/* ── bottom bar: slim player HUD ── */}
      <div className="shrink-0 border-t border-amber-500/20 bg-black/90 backdrop-blur-sm">
        <GloriaPlayerHUD
          lang={lang}
          character={hero.loading && !hero.state.character ? null : hero.character}
          isStarter={hero.state.isStarter}
          totalXp={totalXp}
          rank={rank}
          elfMeter={live.elfMeter}
          radar={live.radar}
          evaluating={evaluating}
          onRefresh={refresh}
        />
      </div>

      {/* the reveal, over everything, the next time Gloria opens after a scheduled update changed the hero */}
      {hero.revealPending && hero.state.character && (
        <GloriaHeroReveal
          character={hero.state.character}
          previous={hero.state.previousCharacter}
          kind={hero.state.isStarter ? "starter" : hero.state.previousCharacter ? "change" : "first"}
          lang={lang}
          onDismiss={hero.dismissReveal}
        />
      )}
    </div>
  );

  // Portal to document.body → sits above sidebar/header z-index layers
  return createPortal(gameScreen, document.body);
}
