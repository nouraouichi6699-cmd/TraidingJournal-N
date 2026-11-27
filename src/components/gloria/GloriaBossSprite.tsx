// GLORIA_RPG: the zone boss's own combat visuals, layered the same way the hero is (a child of GloriaLandSprites,
// not one of the land's plain `sprites`) so it can be driven by GloriaLandCanvas's encounter state instead of
// just looping its idle pose. Three moments, per the zone's own art (public/sprites/boss-<name>/):
//   - idle:   the standing pose, same as before this feature existed.
//   - attack: the boss's wind-up-and-strike flourish (south-facing only -- it only ever faces the player), played
//             once when the hero challenges it before the trading-challenge boss fight is won.
//   - death:  "Falling_Back_Death" -- played once the moment the real fight is won (gloriaZones' bossDefeated
//             flips true), after which the boss is gone from the scene for good. Aurelia's set shipped without a
//             death animation yet; it fades out instead (fallbackFade below) so the moment still reads as a win.
// None of this touches gloriaZones.bossDefeated itself -- that's still decided entirely by the trading challenge.
import { useEffect } from "react";
import GloriaSprite, { preloadSpriteFrames } from "./GloriaSprite";
import { numbered } from "./GloriaLandSprites";
import type { LandSprite } from "./gloriaLands";

export const BOSS_TYPES = [
  "boss-solmara",
  "boss-verdantia",
  "boss-aurelia",
  "boss-heartlands",
  "boss-drakemar",
  "boss-frostfell",
  "boss-throne",
] as const;
export type BossType = (typeof BOSS_TYPES)[number];

export function isBossType(type: string): type is BossType {
  return (BOSS_TYPES as readonly string[]).includes(type);
}

export type BossEncounterState = "idle" | "attack" | "death" | "gone";

interface BossSheet {
  idle: string;
  attack: string[];
  /** null for a boss whose death set hasn't been generated yet (Aurelia, for now): see fallbackFade below. */
  death: string[] | null;
}

function sheetFor(type: BossType): BossSheet {
  return {
    idle: `/sprites/${type}/idle-south.png`,
    attack: numbered(`/sprites/${type}/attack`, 13),
    death: type === "boss-aurelia" ? null : numbered(`/sprites/${type}/death`, 7),
  };
}

const BOSS_SHEETS = Object.fromEntries(BOSS_TYPES.map((t) => [t, sheetFor(t)])) as Record<BossType, BossSheet>;

/** How long the Aurelia fallback (no death frames yet) takes to fade out, matching the other bosses' ~7-frame,
 *  90ms-per-frame death animation (630ms) closely enough that the pacing feels the same. */
const FALLBACK_DEATH_MS = 650;

interface Props {
  sprite: LandSprite;
  landWidth: number;
  state: BossEncounterState;
  /** The attack flourish finished playing. */
  onAttackEnd?: () => void;
  /** The death sequence (real frames, or the Aurelia fallback fade) finished. */
  onDeathEnd?: () => void;
}

export default function GloriaBossSprite({ sprite, landWidth, state, onAttackEnd, onDeathEnd }: Props) {
  const sheet = isBossType(sprite.type) ? BOSS_SHEETS[sprite.type] : undefined;

  useEffect(() => {
    if (sheet) void preloadSpriteFrames([sheet.idle, ...sheet.attack, ...(sheet.death ?? [])]);
  }, [sheet]);

  // Aurelia fallback: no death frames to play, so just fade the idle pose out and call it done.
  const fallbackFading = state === "death" && !!sheet && !sheet.death;
  useEffect(() => {
    if (!fallbackFading) return;
    const t = window.setTimeout(() => onDeathEnd?.(), FALLBACK_DEATH_MS);
    return () => window.clearTimeout(t);
  }, [fallbackFading, onDeathEnd]);

  if (!sheet || state === "gone") return null;
  const common = {
    x: sprite.x,
    y: sprite.y,
    scale: sprite.scale ?? 1,
    coreSize: sprite.coreSize ?? 48,
    landWidth,
  };

  if (state === "attack") {
    return <GloriaSprite {...common} frames={sheet.attack} frameDuration={70} loop={false} onAnimationEnd={onAttackEnd} />;
  }
  if (state === "death") {
    if (sheet.death) return <GloriaSprite {...common} frames={sheet.death} frameDuration={90} loop={false} onAnimationEnd={onDeathEnd} />;
    return <GloriaSprite {...common} frames={[sheet.idle]} opacity={0} fadeMs={FALLBACK_DEATH_MS} />;
  }
  return <GloriaSprite {...common} frames={[sheet.idle]} />;
}
