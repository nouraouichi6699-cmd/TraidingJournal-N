// GLORIA_RPG: the animated characters standing on a land (the land's `sprites`), drawn by GloriaLandCanvas
// between the painting and the ambient layer.
//
// The layer is a box sized and offset exactly like the cropped painting (object-cover, centred), clipped to the
// land view, so each sprite's image percentages land on the same painted spot at any screen shape.
//
// Each LandSprite names a character sheet (public/sprites/<type>/), a facing and an animation; planSprite turns
// that into frame lists. A sheet only has the directions PixelLab generated, so a missing facing is mirrored from
// its opposite side when possible (a south-west walk is the south-east one flipped), otherwise the animation plays
// in the direction the sheet has. When an intermittent animation faces elsewhere than the idle pose (the horse
// idles facing east but rears facing south), it turns through the idle poses in between on the way in and out.
import { useEffect, useMemo, useState } from "react";
import GloriaSprite, { preloadSpriteFrames, useReducedMotion } from "./GloriaSprite";
import type { LandSprite, SpriteDirection } from "./gloriaLands";

type Animation = Exclude<NonNullable<LandSprite["animation"]>, "idle">;

interface SpriteSheet {
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

const idleFrames = (type: string) =>
  Object.fromEntries(DIRECTIONS.map((d) => [d, `/sprites/${type}/idle-${d}.png`])) as Record<SpriteDirection, string>;
const numbered = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-${i}.png`);

/** What each character sheet in public/sprites holds (32x32 idles; animation frames are 48x48, padded). */
const SHEETS: Partial<Record<LandSprite["type"], SpriteSheet>> = {
  farmer: {
    idle: idleFrames("farmer"),
    animations: { walk: { "south-east": numbered("/sprites/farmer/walk-se", 8) } },
  },
  horse: {
    idle: idleFrames("horse"),
    animations: { rear: { south: numbered("/sprites/horse/rear", 12) } },
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

function LandSpriteActor({ sprite, landWidth }: { sprite: LandSprite; landWidth: number }) {
  const reduced = useReducedMotion();
  const plan = useMemo(() => planSprite(sprite), [sprite]);
  const [acting, setActing] = useState(false);

  // Preload every frame up front, so the first intermittent play swaps frames without a blank.
  useEffect(() => {
    if (plan) void preloadSpriteFrames(plan.all);
  }, [plan]);

  // Intermittent animation: wait animationInterval..4/3 of it, play once (onAnimationEnd ends it), repeat.
  const interval = sprite.animationInterval ?? 0;
  useEffect(() => {
    if (!plan?.intermittent || reduced || acting) return;
    const t = window.setTimeout(() => setActing(true), interval * (1 + Math.random() / 3));
    return () => window.clearTimeout(t);
  }, [plan, reduced, acting, interval]);

  if (!plan) return null;
  const common = { x: sprite.x, y: sprite.y, scale: sprite.scale ?? 1, landWidth };
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
  /** The crop: screen px per image px, and the image point at the container's top-left corner. */
  view: { s: number; ox: number; oy: number };
}

export default function GloriaLandSprites({ sprites, w, h, view }: Props) {
  if (sprites.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute"
        style={{ left: -view.ox * view.s, top: -view.oy * view.s, width: w * view.s, height: h * view.s }}
      >
        {sprites.map((sprite) => (
          <LandSpriteActor key={sprite.id} sprite={sprite} landWidth={w} />
        ))}
      </div>
    </div>
  );
}
