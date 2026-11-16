// GLORIA_RPG: the player's own character on the land, moved with the arrow keys -- unlike GloriaLandSprites'
// ambient farmers/guard/horse/boss, this one isn't in a land's `sprites` list and has no fixed patrol.
//
// It reuses the same look-up/mirroring machinery GloriaLandSprites built for the guard and farmer (planWalkTable,
// facingOf): a sheet only has the walk directions PixelLab drew (here, just west, like the guard's own sheet --
// east is mirrored from it), and a direction with no walk frames shows its idle pose with a one-pixel step bob
// instead. Movement reads the live set of held arrow keys every rAF tick and steps the hero at HERO_SPEED painting
// px/sec along the resulting (normalized, so diagonals aren't faster) direction, clamped to the image's edges;
// releasing every movement key settles it back to idle facing whichever way it last moved.
import { useEffect, useRef, useState } from "react";
import GloriaSprite, { preloadSpriteFrames } from "./GloriaSprite";
import { facingOf, idleFrames, numbered, planWalkTable, type SpriteSheet } from "./GloriaLandSprites";
import type { SpriteDirection } from "./gloriaLands";

/** The current placeholder hero sheet is the guard's own sprite, recolored blue, until the real PixelLab-generated
 *  Warrior art lands (public/sprites/hero/): same layout, so only a walk-west sheet exists and east mirrors it. */
const HERO_SHEET: SpriteSheet = {
  idle: idleFrames("hero"),
  animations: { walk: { west: numbered("/sprites/hero/walk-w", 8) } },
};
// one table covers both looks per facing: `.idle` doesn't depend on the animation key, only `.walk` does
const HERO_PLAN = planWalkTable(HERO_SHEET, "walk");
const HERO_ALL_FRAMES = [
  ...Object.values(HERO_SHEET.idle),
  ...Object.values(HERO_SHEET.animations.walk ?? {}).flatMap((f) => f ?? []),
];

const HERO_SPEED = 90; // painting px/sec -- the player's primary control, so it should feel brisk and immediate
const HERO_SCALE = 1.8;

const ARROW_TO_AXIS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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

interface Props {
  /** Where the hero starts standing, in image percentages (the entry gate). */
  start: HeroPoint;
  landWidth: number;
  landHeight: number;
}

export default function GloriaHeroSprite({ start, landWidth, landHeight }: Props) {
  const live = useRef<LiveHero>({ x: start.x, y: start.y, facing: "north" });
  const [frame, setFrame] = useState<HeroFrame>({ ...live.current, moving: false, now: 0 });
  const keysDown = useRef<Set<string>>(new Set());

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

    const tick = (now: number) => {
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
      p.x = clamp(p.x + ((vx * budget) / landWidth) * 100, 0, 100);
      p.y = clamp(p.y + ((vy * budget) / landHeight) * 100, 0, 100);
      setFrame({ ...p, moving: true, now });
      raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (running) return;
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
    };
  }, [landWidth, landHeight]);

  const look = HERO_PLAN?.[frame.facing];
  if (!look) return null;

  if (frame.moving && look.walk) {
    return (
      <GloriaSprite x={frame.x} y={frame.y} scale={HERO_SCALE} coreSize={48} landWidth={landWidth}
        frames={look.walk.value} frameDuration={150} flipX={look.walk.flipX} />
    );
  }
  // standing still, or moving a direction with no walk sheet: idle pose, bobbing a pixel every other step
  const bob = frame.moving ? (Math.floor(frame.now / 300) % 2) * 0.9 : 0;
  return (
    <GloriaSprite x={frame.x} y={frame.y - (bob / landHeight) * 100} scale={HERO_SCALE} coreSize={48} landWidth={landWidth}
      frames={look.idle.value} flipX={look.idle.flipX} />
  );
}
