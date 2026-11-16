// GLORIA_RPG: the player's own character on the land, walking to wherever the player clicks -- unlike
// GloriaLandSprites' ambient farmers/guard/horse/boss, this one isn't in a land's `sprites` list and has no fixed
// patrol: GloriaLandCanvas turns a click into a destination (in image percentages) and passes it down as `target`.
//
// It reuses the same look-up/mirroring machinery GloriaLandSprites built for the guard and farmer (planWalkTable,
// facingOf): a sheet only has the walk directions PixelLab drew (here, just west, like the guard's own sheet --
// east is mirrored from it), and a direction with no walk frames shows its idle pose with a one-pixel step bob
// instead. Movement itself is a straight-line lerp toward `target` at HERO_SPEED painting px/sec, the same
// approach GloriaLandSprites' usePatrol uses for a fixed waypoint loop, but retargeted on every click instead of
// looping.
import { useEffect, useRef, useState } from "react";
import GloriaSprite, { preloadSpriteFrames, useReducedMotion } from "./GloriaSprite";
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

const HERO_SPEED = 60; // painting px/sec -- a click should feel responsive, not like an ambient patrol
/** A target counts as reached within this distance, in % of the painting (matches GloriaLandSprites' patrol). */
const ARRIVE_PCT = 0.3;

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
  /** The latest clicked destination, in image percentages; null means "stand still". */
  target: HeroPoint | null;
  landWidth: number;
  landHeight: number;
}

export default function GloriaHeroSprite({ start, target, landWidth, landHeight }: Props) {
  const reduced = useReducedMotion();
  const live = useRef<LiveHero>({ x: start.x, y: start.y, facing: "north" });
  const [frame, setFrame] = useState<HeroFrame>({ ...live.current, moving: false, now: 0 });

  useEffect(() => {
    void preloadSpriteFrames(HERO_ALL_FRAMES);
  }, []);

  useEffect(() => {
    const p = live.current;
    if (!target) return;
    if (reduced) {
      // reduced motion skips the walk animation, not the move itself -- it's the player's own click, not ambience
      p.facing = facingOf(target.x - p.x, target.y - p.y);
      p.x = target.x;
      p.y = target.y;
      setFrame({ ...p, moving: false, now: 0 });
      return;
    }
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      const dxPct = target.x - p.x;
      const dyPct = target.y - p.y;
      const dx = (dxPct / 100) * landWidth;
      const dy = (dyPct / 100) * landHeight;
      const dist = Math.hypot(dx, dy);
      const budget = HERO_SPEED * dt;
      if (Math.hypot(dxPct, dyPct) < ARRIVE_PCT || dist <= budget) {
        p.x = target.x;
        p.y = target.y;
        setFrame({ ...p, moving: false, now });
        return; // arrived: stop the loop until the next click retargets it
      }
      p.facing = facingOf(dx, dy);
      p.x += ((dx / dist) * budget * 100) / landWidth;
      p.y += ((dy / dist) * budget * 100) / landHeight;
      setFrame({ ...p, moving: true, now });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, landWidth, landHeight]);

  const moving = frame.moving && !reduced;
  const look = HERO_PLAN?.[frame.facing];
  if (!look) return null;

  if (moving && look.walk) {
    return (
      <GloriaSprite x={frame.x} y={frame.y} scale={0.9} coreSize={48} landWidth={landWidth}
        frames={look.walk.value} frameDuration={150} flipX={look.walk.flipX} />
    );
  }
  // standing still, or moving a direction with no walk sheet: idle pose, bobbing a pixel every other step
  const bob = moving ? (Math.floor(frame.now / 300) % 2) * 0.9 : 0;
  return (
    <GloriaSprite x={frame.x} y={frame.y - (bob / landHeight) * 100} scale={0.9} coreSize={48} landWidth={landWidth}
      frames={look.idle.value} flipX={look.idle.flipX} />
  );
}
