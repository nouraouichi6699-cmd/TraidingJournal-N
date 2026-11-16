// GLORIA_RPG: the animated characters standing on a land (the land's `sprites`), drawn by GloriaLandCanvas
// between the painting and the ambient layer.
//
// The layer is a box sized and offset exactly like the letterboxed painting (object-contain, centred), clipped to
// the land view, so each sprite's image percentages land on the same painted spot at any screen shape.
//
// Each LandSprite names a character sheet (public/sprites/<type>/), a facing and an animation; planSprite turns
// that into frame lists. A sheet only has the directions PixelLab generated, so a missing facing is mirrored from
// its opposite side when possible (a south-west walk is the south-east one flipped), otherwise the animation plays
// in the direction the sheet has. When an intermittent animation faces elsewhere than the idle pose (the horse
// idles facing east but rears facing south), it turns through the idle poses in between on the way in and out.
//
// A sprite with a `patrol` walks its waypoint loop (usePatrol): requestAnimationFrame moves it `speed` painting
// pixels per second and turns it to the nearest of the eight facings of its heading. While walking it plays its
// walk frames when the sheet has them for that heading (an east or west leg borrows the south-east / south-west
// walk, the sheets' only walk frames); otherwise it shows that facing's idle pose with a one-pixel step bob.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import GloriaSprite, { preloadSpriteFrames, useReducedMotion } from "./GloriaSprite";
import type { LandSprite, SpriteDirection } from "./gloriaLands";

type Animation = Exclude<NonNullable<LandSprite["animation"]>, "idle">;

export interface SpriteSheet {
  idle: Partial<Record<SpriteDirection, string>>;
  animations: Partial<Record<Animation, Partial<Record<SpriteDirection, string[]>>>>;
}

const DIRECTIONS: SpriteDirection[] = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];

const MIRROR: Record<SpriteDirection, SpriteDirection> = {
  south: "south",
  "south-east": "south-west",
  east: "west",
  "north-east": "north-west",
  north: "north",
  "north-west": "north-east",
  west: "east",
  "south-west": "south-east",
};

/** Builds a sheet's idle table from the naming convention every character under public/sprites/ follows -- shared
 *  with GloriaHeroSprite, which defines its own sheet the same way since the player's hero isn't a land `sprite`. */
export const idleFrames = (type: string) =>
  Object.fromEntries(DIRECTIONS.map((d) => [d, `/sprites/${type}/idle-${d}.png`])) as Record<SpriteDirection, string>;
export const numbered = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-${i}.png`);

/** What each character sheet in public/sprites holds (32x32 idles; animation frames are 48x48, padded). */
const SHEETS: Partial<Record<LandSprite["type"], SpriteSheet>> = {
  farmer: {
    idle: idleFrames("farmer"),
    animations: {
      walk: {
        "south-east": numbered("/sprites/farmer/walk-se", 8),
        east: numbered("/sprites/farmer/walk-e", 8),
        north: numbered("/sprites/farmer/walk-n", 8),
        south: numbered("/sprites/farmer/walk-s", 8),
      },
    },
  },
  horse: {
    idle: idleFrames("horse"),
    animations: { rear: { south: numbered("/sprites/horse/rear", 12) } },
  },
  guard: {
    idle: idleFrames("guard"),
    animations: {
      // only a walk-west sheet exists; east is mirrored from it via pick()'s MIRROR fallback
      walk: { west: numbered("/sprites/guard/walk-w", 8) },
    },
  },
  "boss-serpent": {
    // the generator produced the same pose for every rotation, so only south was kept; pick()'s anyDirection
    // fallback shows it for every facing since it's the sheet's only entry
    idle: { south: "/sprites/boss-serpent/idle-south.png" },
    animations: {},
  },
};

/** A direction's frames from a per-direction table: as is, mirrored from the opposite side, or (with
 *  `anyDirection`) the first direction the table has. `facing` is where the result actually looks. */
function pick<T>(table: Partial<Record<SpriteDirection, T>>, dir: SpriteDirection, anyDirection: boolean) {
  const direct = table[dir];
  if (direct) return { value: direct, flipX: false, facing: dir };
  const mirrored = table[MIRROR[dir]];
  if (mirrored) return { value: mirrored, flipX: true, facing: dir };
  if (!anyDirection) return null;
  const first = DIRECTIONS.find((d) => table[d]);
  return first ? { value: table[first] as T, flipX: false, facing: first } : null;
}

/** The idle poses strictly between two facings, turning the short way round. */
function turnBetween(from: SpriteDirection, to: SpriteDirection): SpriteDirection[] {
  const a = DIRECTIONS.indexOf(from);
  const diff = (DIRECTIONS.indexOf(to) - a + 8) % 8;
  if (diff === 0) return [];
  const step = diff <= 4 ? 1 : -1;
  const n = diff <= 4 ? diff : 8 - diff;
  return Array.from({ length: n - 1 }, (_, i) => DIRECTIONS[(a + step * (i + 1) + 8) % 8]);
}

interface SpritePlan {
  idle: string;
  idleFlip: boolean;
  /** The animation's frames (null for a still sprite); intermittent ones include the turn in and out. */
  action: string[] | null;
  actionFlip: boolean;
  intermittent: boolean;
  /** Every frame the sprite can show, for preloading. */
  all: string[];
}

function planSprite(sprite: LandSprite): SpritePlan | null {
  const sheet = SHEETS[sprite.type];
  if (!sheet) return null;
  const idle = pick(sheet.idle, sprite.direction, true);
  if (!idle) return null;
  const table = sprite.animation && sprite.animation !== "idle" ? sheet.animations[sprite.animation] : undefined;
  const anim = table ? pick(table, sprite.direction, true) : null;
  const intermittent = !!anim && !!sprite.animationInterval;

  let action = anim?.value ?? null;
  if (anim && intermittent && anim.facing !== idle.facing && !anim.flipX && !idle.flipX) {
    // turn poses only when each is drawn as is: one sprite element shares a single flip for all its frames
    const turn = turnBetween(idle.facing, anim.facing).map((d) => sheet.idle[d]);
    if (turn.every(Boolean)) action = [...(turn as string[]), ...anim.value, ...(turn as string[]).reverse()];
  }
  return {
    idle: idle.value,
    idleFlip: idle.flipX,
    action,
    actionFlip: anim?.flipX ?? false,
    intermittent,
    all: [idle.value, ...(action ?? [])],
  };
}

export type Frames = { value: string[]; flipX: boolean };

/** How a patrolling sprite looks heading each way: its walk frames, or (null) the idle pose with a step bob. */
export type PatrolPlan = Record<SpriteDirection, { walk: Frames | null; idle: Frames }>;

/** How every one of the eight facings looks for a sheet's animation: shared by patrolling land sprites and the
 *  player's own click-to-move hero (GloriaHeroSprite), which walks the same way but toward a clicked point
 *  instead of a fixed waypoint loop. */
export function planWalkTable(sheet: SpriteSheet, animKey?: Animation): PatrolPlan | null {
  const walkTable = animKey ? sheet.animations[animKey] : undefined;
  const out = {} as PatrolPlan;
  for (const dir of DIRECTIONS) {
    const idle = pick(sheet.idle, dir, true);
    if (!idle) return null;
    let walk = walkTable ? pick(walkTable, dir, false) : null;
    // no north-east/north-west walk asset: reuse north's (flipped for north-west), close enough at this sprite scale
    if (!walk && walkTable && (dir === "north-east" || dir === "north-west")) {
      const north = pick(walkTable, "north", false);
      if (north) walk = { value: north.value, flipX: dir === "north-west", facing: dir };
    }
    out[dir] = { walk: walk && { value: walk.value, flipX: walk.flipX }, idle: { value: [idle.value], flipX: idle.flipX } };
  }
  return out;
}

function planPatrol(sprite: LandSprite): PatrolPlan | null {
  const sheet = SHEETS[sprite.type];
  if (!sheet || !sprite.patrol?.length) return null;
  const animKey = sprite.animation && sprite.animation !== "idle" ? sprite.animation : undefined;
  return planWalkTable(sheet, animKey);
}

const DEFAULT_PATROL_SPEED = 8; // painting px per second
/** A waypoint counts as reached within this distance, in % of the painting. */
const ARRIVE_PCT = 0.3;

/** The nearest of the eight facings to a heading in painting pixels (y grows downward). Shared with
 *  GloriaHeroSprite's click-to-move, which turns the player the same way a patrolling sprite turns. */
export function facingOf(dx: number, dy: number): SpriteDirection {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // 0 = east, 90 = south
  const i = Math.round((90 - deg) / 45);
  return DIRECTIONS[((i % 8) + 8) % 8];
}

interface PatrolFrame {
  x: number;
  y: number;
  facing: SpriteDirection;
  /** rAF timestamp of this position, for the step bob. */
  now: number;
}

/** Walks `sprite.patrol` while `active`, returning the live position and facing (null when not patrolling).
 *  The position lives in a ref, so pausing (reduced motion) and resuming picks up where the walk left off. */
function usePatrol(sprite: LandSprite, landWidth: number, landHeight: number, active: boolean): PatrolFrame | null {
  const path = sprite.patrol;
  const live = useRef({ x: sprite.x, y: sprite.y, facing: sprite.direction, target: 0 });
  const [frame, setFrame] = useState<PatrolFrame | null>(null);
  const speed = sprite.speed ?? DEFAULT_PATROL_SPEED;

  useEffect(() => {
    if (!active || !path?.length) {
      setFrame(null);
      return;
    }
    const p = live.current;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      // a hidden tab pauses rAF: clamp the step so the walker doesn't jump on return
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      let budget = speed * dt; // painting px left to walk this frame
      for (let guard = 0; guard <= path.length; guard++) {
        const t = path[p.target % path.length];
        const dxPct = t.x - p.x;
        const dyPct = t.y - p.y;
        const dx = (dxPct / 100) * landWidth;
        const dy = (dyPct / 100) * landHeight;
        const dist = Math.hypot(dx, dy);
        if (Math.hypot(dxPct, dyPct) < ARRIVE_PCT || dist <= budget) {
          if (dist <= budget) {
            p.x = t.x;
            p.y = t.y;
            budget -= dist;
          }
          p.target = (p.target + 1) % path.length;
          continue;
        }
        p.facing = facingOf(dx, dy);
        if (budget > 0) {
          p.x += ((dx / dist) * budget * 100) / landWidth;
          p.y += ((dy / dist) * budget * 100) / landHeight;
        }
        break;
      }
      setFrame({ x: p.x, y: p.y, facing: p.facing, now });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, path, speed, landWidth, landHeight]);

  return frame;
}

function LandSpriteActor({ sprite, landWidth, landHeight }: { sprite: LandSprite; landWidth: number; landHeight: number }) {
  const reduced = useReducedMotion();
  const plan = useMemo(() => planSprite(sprite), [sprite]);
  const patrolPlan = useMemo(() => planPatrol(sprite), [sprite]);
  const patrol = usePatrol(sprite, landWidth, landHeight, !!patrolPlan && !reduced);
  const [acting, setActing] = useState(false);

  // Preload every frame up front, so the first intermittent play (or a patrol turn) swaps frames without a blank.
  useEffect(() => {
    if (plan) void preloadSpriteFrames(plan.all);
    if (patrolPlan) void preloadSpriteFrames(Object.values(patrolPlan).flatMap((d) => [...(d.walk?.value ?? []), ...d.idle.value]));
  }, [plan, patrolPlan]);

  // Intermittent animation: wait animationInterval..4/3 of it, play once (onAnimationEnd ends it), repeat.
  const interval = sprite.animationInterval ?? 0;
  useEffect(() => {
    if (!plan?.intermittent || reduced || acting) return;
    const t = window.setTimeout(() => setActing(true), interval * (1 + Math.random() / 3));
    return () => window.clearTimeout(t);
  }, [plan, reduced, acting, interval]);

  if (patrol && patrolPlan) {
    const look = patrolPlan[patrol.facing];
    const scale = sprite.scale ?? 1;
    const frameDuration = sprite.frameDuration ?? 150;
    const coreSize = sprite.coreSize ?? 32;
    if (look.walk) {
      return (
        <GloriaSprite x={patrol.x} y={patrol.y} scale={scale} coreSize={coreSize} landWidth={landWidth}
          frames={look.walk.value} frameDuration={frameDuration} flipX={look.walk.flipX} />
      );
    }
    // no walk frames this way: the facing's idle pose, lifted one sprite pixel on every other step
    const up = Math.floor(patrol.now / (frameDuration * 2)) % 2;
    const bob = ((up * scale) / landHeight) * 100;
    return (
      <GloriaSprite x={patrol.x} y={patrol.y - bob} scale={scale} coreSize={coreSize} landWidth={landWidth}
        frames={look.idle.value} flipX={look.idle.flipX} />
    );
  }

  if (!plan) return null;
  const common = { x: sprite.x, y: sprite.y, scale: sprite.scale ?? 1, coreSize: sprite.coreSize ?? 32, landWidth };
  const looping = plan.action && !plan.intermittent;
  const playingOnce = plan.action && plan.intermittent && acting && !reduced;

  if (looping || playingOnce) {
    return (
      <GloriaSprite
        {...common}
        frames={plan.action!}
        frameDuration={sprite.frameDuration ?? 150}
        flipX={plan.actionFlip}
        loop={!!looping}
        onAnimationEnd={playingOnce ? () => setActing(false) : undefined}
      />
    );
  }
  return <GloriaSprite {...common} frames={[plan.idle]} flipX={plan.idleFlip} />;
}

interface Props {
  sprites: LandSprite[];
  /** The painting's natural size. */
  w: number;
  h: number;
  /** The fit: screen px per image px, and the image point at the container's top-left corner (ox/oy go
   *  negative where a letterbox bar sits). */
  view: { s: number; ox: number; oy: number };
  /** Extra content placed in the same image-percentage box, e.g. the player's own hero sprite (GloriaHeroSprite),
   *  which isn't one of the land's own ambient `sprites` but still needs to ride along with the art the same way. */
  children?: ReactNode;
}

export default function GloriaLandSprites({ sprites, w, h, view, children }: Props) {
  if (sprites.length === 0 && !children) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute"
        style={{ left: -view.ox * view.s, top: -view.oy * view.s, width: w * view.s, height: h * view.s }}
      >
        {sprites.map((sprite) => (
          <LandSpriteActor key={sprite.id} sprite={sprite} landWidth={w} landHeight={h} />
        ))}
        {children}
      </div>
    </div>
  );
}
