// GLORIA_RPG: the player's own character on the land, moved with the arrow keys -- unlike GloriaLandSprites'
// ambient farmers/guard/horse/boss, this one isn't in a land's `sprites` list and has no fixed patrol.
//
// It reuses the same look-up/mirroring machinery GloriaLandSprites built for the guard and farmer (planWalkTable,
// facingOf): a sheet only has the walk directions PixelLab drew (here, just west, like the guard's own sheet --
// east is mirrored from it), and a direction with no walk frames shows its idle pose with a one-pixel step bob
// instead. Movement reads the live set of held arrow keys every rAF tick and steps the hero at HERO_SPEED painting
// px/sec along the resulting (normalized, so diagonals aren't faster) direction, clamped to the image's edges and
// stopped by the active land's `obstacles`; releasing every movement key settles it back to idle facing whichever
// way it last moved.
//
// Entry and exit gates are trigger zones (gloriaGateTriggers): when the hero's feet come within a gate's radius the
// hero fades out and either reappears at the inside spawn (entry) or hands over to `onGateReach` (exit, which
// opens the world map). A gate that is a scene portal (`to`) fades the hero out and hands over to `onSceneChange`
// instead: the land view swaps in the next scene, whose hero mounts fresh (`arrive` fades it in). A fired gate stays disarmed until the hero has walked clear of it, and every transition
// locks the controls until it is over, so neither can loop.
import { useEffect, useRef, useState } from "react";
import GloriaSprite, { preloadSpriteFrames } from "./GloriaSprite";
import { prefersReducedMotion } from "./GloriaCloudTransition";
import { facingOf, idleFrames, numbered, planWalkTable, type PatrolPlan, type SpriteSheet } from "./GloriaLandSprites";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";
import type { LandObstacle, LandSceneId, SceneTransition, SpriteDirection } from "./gloriaLands";
import { GATE_REARM_FACTOR, inGateZone, type TriggerGateId } from "./gloriaGateTriggers";

/** The hero's Warrior sheet (public/sprites/warrior/): eight 48x48 idle rotations and west/north/south walk loops
 *  of 8 64x64 frames each (same frameDuration for all), so east mirrors west and the diagonals fall back to the
 *  north/south loops in planWalkTable (flipped for the west-leaning ones). The walk frames are the same art at the same pixel
 *  scale, just on a larger canvas (8px of air each side of the 48px core): GloriaSprite centres every frame on the
 *  same 48px core box (coreSize below), so idle and walk neither change size nor shift when the hero starts or
 *  stops. Don't give the walk frames their own coreSize. */
const WARRIOR_SHEET: SpriteSheet = {
  idle: idleFrames("warrior"),
  animations: {
    walk: {
      west: numbered("/sprites/warrior/walk-w", 8),
      north: numbered("/sprites/warrior/walk-n", 8),
      south: numbered("/sprites/warrior/walk-s", 8),
    },
  },
};

/** The Savage sheet (public/sprites/savage/): same layout and sizes as Warrior's, but only the north walk exists so
 *  far. Every other walk direction is simply absent, and planWalkTable then gives it no `walk`, so the hero shows
 *  that facing's idle pose with the step bob (see the render below) rather than a blank or a crash. Add
 *  `south` / `west` entries here as those frames are generated; east mirrors west automatically. */
const SAVAGE_SHEET: SpriteSheet = {
  idle: idleFrames("savage"),
  animations: {
    walk: {
      north: numbered("/sprites/savage/walk-n", 8),
    },
  },
};

/** The Rogue sheet (public/sprites/rogue/): north walk only so far, like Savage (other directions fall back to the
 *  idle pose with the step bob). The walk frames are 60x60 rather than 64x64 and are drawn in a different (blue-cloak)
 *  design than the dark-hooded idles -- both accepted as generated. GloriaSprite sizes frames by natural width and
 *  centres them on the 48px core, so the 60px canvas needs no special handling. */
const ROGUE_SHEET: SpriteSheet = {
  idle: idleFrames("rogue"),
  animations: {
    walk: {
      north: numbered("/sprites/rogue/walk-n", 8),
    },
  },
};

/** The Tank sheet (public/sprites/tank/): eight idle rotations and a north walk loop (8 frames), like Savage and Rogue.
 *  planWalkTable gives the walk to north, and north-east / north-west (north's frames, flipped for north-west); every
 *  other facing shows this sheet's OWN idle pose with the step bob. */
const TANK_SHEET: SpriteSheet = {
  idle: idleFrames("tank"),
  animations: {
    walk: {
      north: numbered("/sprites/tank/walk-n", 8),
    },
  },
};

/** The Sniper sheet (public/sprites/sniper/): eight idles and a north walk, same shape as Tank's. */
const SNIPER_SHEET: SpriteSheet = {
  idle: idleFrames("sniper"),
  animations: {
    walk: {
      north: numbered("/sprites/sniper/walk-n", 8),
    },
  },
};

/** The Elf sheet (public/sprites/elf/): eight idles and a north walk, same shape as Tank's. */
const ELF_SHEET: SpriteSheet = {
  idle: idleFrames("elf"),
  animations: {
    walk: {
      north: numbered("/sprites/elf/walk-n", 8),
    },
  },
};

/** The Mage sheet (public/sprites/mage/): eight idles and a SOUTH walk (walk-s), unlike the others. planWalkTable gives
 *  the walk to south, and south-east / south-west (south's frames, flipped for south-west); north, east, west and the
 *  north diagonals show this sheet's own idle pose with the step bob. */
const MAGE_SHEET: SpriteSheet = {
  idle: idleFrames("mage"),
  animations: {
    walk: {
      south: numbered("/sprites/mage/walk-s", 8),
    },
  },
};

/** The Assassin sheet (public/sprites/assassin/): eight idles and a north walk, same shape as Tank's. */
const ASSASSIN_SHEET: SpriteSheet = {
  idle: idleFrames("assassin"),
  animations: {
    walk: {
      north: numbered("/sprites/assassin/walk-n", 8),
    },
  },
};

/** The Healer sheet (public/sprites/healer/): eight idles and east/north/south walk loops (8 frames each) -- the
 *  fullest walk coverage after Warrior's. West mirrors from east automatically. */
const HEALER_SHEET: SpriteSheet = {
  idle: idleFrames("healer"),
  animations: {
    walk: {
      east: numbered("/sprites/healer/walk-e", 8),
      north: numbered("/sprites/healer/walk-n", 8),
      south: numbered("/sprites/healer/walk-s", 8),
    },
  },
};

/** The player classes that have a hero sheet, keyed by GloriaCharacterId. A class with no sheet yet (and a player
 *  with no class at all) plays as the Warrior. Exported so the sheet test can check every entry. */
export const HERO_SHEETS: Partial<Record<GloriaCharacterId, SpriteSheet>> = {
  warrior: WARRIOR_SHEET,
  savage: SAVAGE_SHEET,
  rogue: ROGUE_SHEET,
  tank: TANK_SHEET,
  sniper: SNIPER_SHEET,
  elf: ELF_SHEET,
  mage: MAGE_SHEET,
  assassin: ASSASSIN_SHEET,
  healer: HEALER_SHEET,
};

interface HeroLook {
  /** one table covers both looks per facing: `.idle` doesn't depend on the animation key, only `.walk` does */
  plan: PatrolPlan | null;
  allFrames: string[];
}

function buildLook(sheet: SpriteSheet): HeroLook {
  return {
    plan: planWalkTable(sheet, "walk"),
    allFrames: [
      ...Object.values(sheet.idle),
      ...Object.values(sheet.animations.walk ?? {}).flatMap((f) => f ?? []),
    ],
  };
}

const HERO_LOOKS: Partial<Record<GloriaCharacterId, HeroLook>> = Object.fromEntries(
  Object.entries(HERO_SHEETS).map(([id, sheet]) => [id, buildLook(sheet)]),
);
const DEFAULT_HERO_LOOK = buildLook(WARRIOR_SHEET);

const heroLookFor = (character?: GloriaCharacterId | null): HeroLook =>
  (character && HERO_LOOKS[character]) || DEFAULT_HERO_LOOK;

const HERO_SPEED = 90; // painting px/sec -- the player's primary control, so it should feel brisk and immediate
const HERO_SCALE = 1.2; // ~1.3x the guard/farmer's own 0.9-1.2 scale -- noticeably the lead character, not oversized

const ARROW_TO_AXIS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

// The hero collides with its feet only, so it can stand right in front of a wall with its head overlapping it
const FOOT_HALF_W = 7; // painting px either side of the feet
const FOOT_DEPTH = 6; // painting px the footprint reaches up from the feet

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** True when the hero's footprint, with its feet at (x, y) in image percentages, overlaps any obstacle. */
export function footprintBlocked(
  x: number, y: number, obstacles: readonly LandObstacle[], landWidth: number, landHeight: number,
): boolean {
  const hw = (FOOT_HALF_W / landWidth) * 100;
  const depth = (FOOT_DEPTH / landHeight) * 100;
  return obstacles.some((o) => x + hw > o.x && x - hw < o.x + o.w && y > o.y && y - depth < o.y + o.h);
}

/**
 * One movement step from (x, y) by (dx, dy), all in image percentages: X and Y are tried separately, so pushing
 * diagonally into a wall still slides along it. A hero already overlapping an obstacle (spawned or resized into
 * one) moves freely until it is out, rather than being stuck there.
 */
export function stepHero(
  x: number, y: number, dx: number, dy: number, obstacles: readonly LandObstacle[], landWidth: number, landHeight: number,
): HeroPoint {
  const free = (px: number, py: number) =>
    !footprintBlocked(px, py, obstacles, landWidth, landHeight) || footprintBlocked(x, y, obstacles, landWidth, landHeight);
  const nx = clamp(x + dx, 0, 100);
  if (free(nx, y)) x = nx;
  const ny = clamp(y + dy, 0, 100);
  if (free(x, ny)) y = ny;
  return { x, y };
}

/** True while the event's target is a place the arrow keys should type instead of move the hero. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export interface HeroPoint {
  x: number;
  y: number;
}

interface LiveHero {
  x: number;
  y: number;
  facing: SpriteDirection;
}

interface HeroFrame extends LiveHero {
  moving: boolean;
  /** rAF timestamp of this position, for the idle step bob while walking a direction with no walk sheet. */
  now: number;
}

/** An entry/exit gate as a trigger zone: its marker position (image percentages) and whether it is locked. */
export interface HeroGateZone {
  id: TriggerGateId;
  x: number;
  y: number;
  /** A locked gate still reports the hero's arrival (so the caller can say why) but does no fade. */
  locked?: boolean;
  /** A scene portal: reaching it fades the hero out and calls `onSceneChange` instead of respawning. */
  to?: SceneTransition;
}

const FADE_MS = 350;
/** After an exit fades the hero out it stays hidden for the land swap; if the swap never comes it returns. */
const EXIT_RECOVER_MS = 3000;

interface Props {
  /** Where the hero starts standing, in image percentages (just outside the entry gate). */
  start: HeroPoint;
  landWidth: number;
  landHeight: number;
  /** The active land's solid scenery. */
  obstacles?: readonly LandObstacle[];
  /** The land's entry/exit trigger zones; none means the hero just walks past gates. */
  gates?: readonly HeroGateZone[];
  /** Where the hero reappears after the entry gate (image percentages, inside the city). */
  insideSpawn?: HeroPoint;
  /** The hero reached a gate: right away for a locked gate, after the fade-out for an unlocked exit, and after the
   *  respawn for the entry. */
  onGateReach?: (gate: TriggerGateId) => void;
  /** The hero walked into a scene portal; the caller swaps the land to that scene (and this hero is replaced). */
  onSceneChange?: (scene: LandSceneId) => void;
  /** The hero fades in on mount: it has just arrived from another scene. */
  arrive?: boolean;
  /** The player's class, picking the hero's sheet; unset or a class without a sheet yet plays as the Warrior. */
  character?: GloriaCharacterId | null;
  /** A one-shot teleport (fade out, jump, fade in), e.g. the boss "respawns you in the green zone" after it lands
   *  a hit. Bump `nonce` to trigger it again from the same point; undefined does nothing. */
  respawn?: { x: number; y: number; nonce: number };
  /** The undefeated boss's own position (image percentages): getting within touching distance of it fires
   *  `onBossContact`, once per approach (it re-arms once the hero has stepped back out). Omit it (the parent does,
   *  once the boss is mid-animation, defeated, or gone) to suspend the check entirely. */
  dangerZone?: { x: number; y: number };
  onBossContact?: () => void;
}

const NO_OBSTACLES: readonly LandObstacle[] = [];
const NO_GATES: readonly HeroGateZone[] = [];

export default function GloriaHeroSprite({
  start, landWidth, landHeight, obstacles = NO_OBSTACLES, gates = NO_GATES, insideSpawn, onGateReach, onSceneChange,
  arrive = false, character, respawn, dangerZone, onBossContact,
}: Props) {
  const heroLook = heroLookFor(character);
  const live = useRef<LiveHero>({ x: start.x, y: start.y, facing: "north" });
  const [frame, setFrame] = useState<HeroFrame>({ ...live.current, moving: false, now: 0 });
  const [fade, setFade] = useState<{ opacity: number; ms: number }>({ opacity: arrive ? 0 : 1, ms: 0 });
  const keysDown = useRef<Set<string>>(new Set());
  // the latest gate props, read by the long-lived movement loop below without re-subscribing it on every render
  const gateProps = useRef({ gates, insideSpawn, onGateReach, onSceneChange, dangerZone, onBossContact });
  gateProps.current = { gates, insideSpawn, onGateReach, onSceneChange, dangerZone, onBossContact };

  useEffect(() => {
    void preloadSpriteFrames(heroLook.allFrames);
  }, [heroLook]);

  // Arriving from another scene: appear with a fade instead of popping in.
  useEffect(() => {
    if (!arrive) return;
    const id = requestAnimationFrame(() => setFade({ opacity: 1, ms: prefersReducedMotion() ? 0 : FADE_MS }));
    return () => cancelAnimationFrame(id);
  }, [arrive]);

  // The boss knocks the hero back to the green zone (cosmetic -- see GloriaLandCanvas): fade out, jump straight
  // there (no walk), fade back in. `live.current` is the same object the movement loop below closes over, so
  // writing through it here lands the hero at the new spot for every effect that reads it after this.
  useEffect(() => {
    if (!respawn) return;
    const ms = prefersReducedMotion() ? 0 : FADE_MS;
    keysDown.current.clear();
    setFade({ opacity: 0, ms });
    const t = window.setTimeout(() => {
      live.current.x = respawn.x;
      live.current.y = respawn.y;
      live.current.facing = "north";
      setFrame({ ...live.current, moving: false, now: performance.now() });
      setFade({ opacity: 1, ms });
    }, ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respawn?.nonce]);

  // Track the held arrow keys and drive the hero from them. The rAF loop only runs while a key is actually held --
  // it sleeps as soon as the last one releases instead of re-rendering forever at rest -- and a keydown wakes it
  // back up. A typing field (search boxes, etc. elsewhere on the page) keeps its own arrow handling instead of the
  // hero stealing it. Losing focus (alt-tab, devtools) clears every held key and lets the loop settle to idle.
  useEffect(() => {
    const p = live.current;
    let raf = 0;
    let running = false;
    let last: number | null = null;

    // Gate zones: a gate fires once per approach (disarmed until the hero is clear of it) and a transition locks the
    // controls until it has finished. The hero starts disarmed on any gate it already stands in.
    const size = { w: landWidth, h: landHeight };
    const armed = new Map<TriggerGateId, boolean>();
    for (const g of gateProps.current.gates) armed.set(g.id, !inGateZone(p, g, size));
    // Boss contact: a plain radius check against gateProps.current.dangerZone, re-read every tick so the parent
    // can turn it on/off (armed only while the boss is actually idle and undefeated) without resubscribing this
    // effect. Distinct from gate zones: no fade/lock of its own -- onBossContact just starts the boss's attack,
    // and the hero's knock-back is a separate `respawn` trigger the parent fires once that finishes.
    const BOSS_RADIUS_FRAC = 0.045;
    const bossDist = () => {
      const { dangerZone: z } = gateProps.current;
      if (!z) return Infinity;
      return Math.hypot(((p.x - z.x) / 100) * landWidth, ((p.y - z.y) / 100) * landHeight);
    };
    const bossRadiusPx = Math.min(landWidth, landHeight) * BOSS_RADIUS_FRAC;
    let dangerInside = bossDist() <= bossRadiusPx;
    const checkBoss = () => {
      const inside = bossDist() <= bossRadiusPx;
      if (inside && !dangerInside) gateProps.current.onBossContact?.();
      dangerInside = inside;
    };

    let busy = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      if (ms <= 0) fn();
      else timers.push(window.setTimeout(fn, ms));
    };
    const settle = () => {
      busy = false;
      // keys held through the transition get the hero moving again
      if (keysDown.current.size > 0) wake();
    };

    /** Fires the first armed gate the hero stands in; returns true when a fade-out transition took over. */
    const checkGates = (): boolean => {
      for (const g of gateProps.current.gates) {
        if (!inGateZone(p, g, size)) {
          if (armed.get(g.id) !== true && !inGateZone(p, g, size, GATE_REARM_FACTOR)) armed.set(g.id, true);
          continue;
        }
        if (armed.get(g.id) === false) continue;
        armed.set(g.id, false);
        const { insideSpawn: spawn, onGateReach: reach } = gateProps.current;
        if (g.locked) {
          reach?.(g.id);
          continue;
        }
        const ms = prefersReducedMotion() ? 0 : FADE_MS;
        busy = true;
        keysDown.current.clear();
        setFade({ opacity: 0, ms });
        if (g.to) {
          const scene = g.to.scene;
          later(() => {
            gateProps.current.onSceneChange?.(scene);
            // the land view is about to swap this hero for the next scene's; only if it isn't does the hero come back
            later(() => {
              setFade({ opacity: 1, ms });
              later(settle, ms);
            }, EXIT_RECOVER_MS);
          }, ms);
        } else if (g.id === "entry") {
          later(() => {
            if (spawn) {
              p.x = spawn.x;
              p.y = spawn.y;
              p.facing = "north";
            }
            setFrame({ ...p, moving: false, now: performance.now() });
            setFade({ opacity: 1, ms });
            reach?.("entry");
            later(settle, ms);
          }, ms);
        } else {
          later(() => {
            reach?.("exit");
            // the land view is about to be swapped for the world map; only if it isn't does the hero come back
            later(() => {
              setFade({ opacity: 1, ms });
              later(settle, ms);
            }, EXIT_RECOVER_MS);
          }, ms);
        }
        return true;
      }
      return false;
    };

    const tick = (now: number) => {
      if (busy) {
        running = false;
        return;
      }
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      let vx = 0;
      let vy = 0;
      for (const key of keysDown.current) {
        const [ax, ay] = ARROW_TO_AXIS[key];
        vx += ax;
        vy += ay;
      }
      if (vx === 0 && vy === 0) {
        setFrame({ ...p, moving: false, now });
        running = false; // nothing held: stop the loop until the next keydown wakes it
        return;
      }
      const len = Math.hypot(vx, vy);
      vx /= len;
      vy /= len;
      p.facing = facingOf(vx, vy);
      const budget = HERO_SPEED * dt;
      const next = stepHero(p.x, p.y, ((vx * budget) / landWidth) * 100, ((vy * budget) / landHeight) * 100,
        obstacles, landWidth, landHeight);
      p.x = next.x;
      p.y = next.y;
      checkBoss();
      if (checkGates()) {
        setFrame({ ...p, moving: false, now });
        running = false;
        return;
      }
      setFrame({ ...p, moving: true, now });
      raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (running || busy) return;
      running = true;
      last = null;
      raf = requestAnimationFrame(tick);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.key in ARROW_TO_AXIS) || isTypingTarget(e.target)) return;
      keysDown.current.add(e.key);
      e.preventDefault();
      wake();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!(e.key in ARROW_TO_AXIS)) return;
      keysDown.current.delete(e.key);
    };
    const onBlur = () => keysDown.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      keysDown.current.clear();
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [landWidth, landHeight, obstacles]);

  const look = heroLook.plan?.[frame.facing];
  if (!look) return null;

  if (frame.moving && look.walk) {
    return (
      <GloriaSprite x={frame.x} y={frame.y} scale={HERO_SCALE} coreSize={48} landWidth={landWidth}
        frames={look.walk.value} frameDuration={150} flipX={look.walk.flipX} opacity={fade.opacity} fadeMs={fade.ms} />
    );
  }
  // standing still, or moving a direction with no walk sheet: idle pose, bobbing a pixel every other step
  const bob = frame.moving ? (Math.floor(frame.now / 300) % 2) * 0.9 : 0;
  return (
    <GloriaSprite x={frame.x} y={frame.y - (bob / landHeight) * 100} scale={HERO_SCALE} coreSize={48} landWidth={landWidth}
      frames={look.idle.value} flipX={look.idle.flipX} opacity={fade.opacity} fadeMs={fade.ms} />
  );
}
