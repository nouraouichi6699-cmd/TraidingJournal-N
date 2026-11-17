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
// opens the world map). A fired gate stays disarmed until the hero has walked clear of it, and every transition
// locks the controls until it is over, so neither can loop.
import { useEffect, useRef, useState } from "react";
import GloriaSprite, { preloadSpriteFrames } from "./GloriaSprite";
import { prefersReducedMotion } from "./GloriaCloudTransition";
import { facingOf, idleFrames, numbered, planWalkTable, type SpriteSheet } from "./GloriaLandSprites";
import type { LandObstacle, SpriteDirection } from "./gloriaLands";
import { GATE_REARM_FACTOR, inGateZone, type TriggerGateId } from "./gloriaGateTriggers";

/** The hero's Warrior sheet (public/sprites/warrior/): eight 48x48 idle rotations and a west-walk loop of 64x64
 *  frames, so only west has walk frames and east mirrors them. The walk frames are the same art at the same pixel
 *  scale, just on a larger canvas (8px of air each side of the 48px core): GloriaSprite centres every frame on the
 *  same 48px core box (coreSize below), so idle and walk neither change size nor shift when the hero starts or
 *  stops. Don't give the walk frames their own coreSize. */
const HERO_SHEET: SpriteSheet = {
  idle: idleFrames("warrior"),
  animations: { walk: { west: numbered("/sprites/warrior/walk-w", 8) } },
};
// one table covers both looks per facing: `.idle` doesn't depend on the animation key, only `.walk` does
const HERO_PLAN = planWalkTable(HERO_SHEET, "walk");
const HERO_ALL_FRAMES = [
  ...Object.values(HERO_SHEET.idle),
  ...Object.values(HERO_SHEET.animations.walk ?? {}).flatMap((f) => f ?? []),
];

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
}

const NO_OBSTACLES: readonly LandObstacle[] = [];
const NO_GATES: readonly HeroGateZone[] = [];

export default function GloriaHeroSprite({
  start, landWidth, landHeight, obstacles = NO_OBSTACLES, gates = NO_GATES, insideSpawn, onGateReach,
}: Props) {
  const live = useRef<LiveHero>({ x: start.x, y: start.y, facing: "north" });
  const [frame, setFrame] = useState<HeroFrame>({ ...live.current, moving: false, now: 0 });
  const [fade, setFade] = useState<{ opacity: number; ms: number }>({ opacity: 1, ms: 0 });
  const keysDown = useRef<Set<string>>(new Set());
  // the latest gate props, read by the long-lived movement loop below without re-subscribing it on every render
  const gateProps = useRef({ gates, insideSpawn, onGateReach });
  gateProps.current = { gates, insideSpawn, onGateReach };

  useEffect(() => {
    void preloadSpriteFrames(HERO_ALL_FRAMES);
  }, []);

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
        if (g.id === "entry") {
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

  const look = HERO_PLAN?.[frame.facing];
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
