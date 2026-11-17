// GLORIA_RPG: a frame-by-frame pixel-art sprite, drawn as an HTML <img> over a land painting.
//
// Placement: (x, y) are percentages of the containing box. GloriaLandCanvas's sprite layer is a box sized and
// offset exactly like the cropped painting, so the percentages are image percentages and the sprite rides along
// with the art however it is scaled or cropped. (x, y) is where the character stands -- the bottom-centre of its
// core box -- so a sprite placed on a painted figure's feet stays on them.
//
// Size: one sprite pixel is one painting pixel times `scale` (pass `landWidth`, the painting's natural width);
// without `landWidth`, one sprite pixel is `scale` screen pixels. PixelLab pads animation frames past the
// character's core size (a 32x32 character walks in 48x48 frames, 8px of air on each side), so every frame is
// drawn at its own natural size, centred on the same core box: idle and animation frames line up exactly.
//
// Timing: requestAnimationFrame advances the frame by elapsed time (frameDuration ms each); React only re-renders
// when the frame index changes. With loop off it holds the last frame and calls onAnimationEnd once.
// Reduced motion (the OS setting or the app's own switch) shows only the first frame.
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./GloriaCloudTransition";

export interface GloriaSpriteProps {
  /** Frame image URLs, in play order. */
  frames: string[];
  /** Milliseconds per frame (default 150). */
  frameDuration?: number;
  /** Where the character stands, as a percentage (0-100) of the land image width. */
  x: number;
  /** Where the character stands, as a percentage (0-100) of the land image height. */
  y: number;
  /** Size multiplier (default 1). */
  scale?: number;
  /** Start over after the last frame (default true). */
  loop?: boolean;
  /** Advance frames (default true); paused, the current frame stays. */
  playing?: boolean;
  /** Called once when a non-looping animation reaches its last frame. */
  onAnimationEnd?: () => void;
  /** Mirror horizontally (e.g. a south-east walk played as south-west). */
  flipX?: boolean;
  /** The character's core size in sprite pixels (default 32); larger frames are padding around it. */
  coreSize?: number;
  /** The land image's natural width in pixels, so sprite pixels match painting pixels (see top comment). */
  landWidth?: number;
  /** Fade to this opacity (default 1), easing over `fadeMs` -- the hero's gate transitions. */
  opacity?: number;
  fadeMs?: number;
}

/** Tracks the OS reduced-motion setting and the app's own switch (data-reduce-motion on <html>). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const update = () => setReduced(prefersReducedMotion());
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    mq?.addEventListener?.("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    update();
    return () => {
      mq?.removeEventListener?.("change", update);
      mo.disconnect();
    };
  }, []);
  return reduced;
}

/** Natural widths of every frame loaded so far, shared by all sprites: a frame list whose images are all known
 *  renders at once, so switching animations never blanks the sprite. */
const naturalWidths = new Map<string, number>();
const inflight = new Map<string, Promise<void>>();

/** Loads frames into the browser cache and the width table. Call early (on mount) for frames shown later. */
export function preloadSpriteFrames(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map((url) => {
      if (naturalWidths.has(url)) return Promise.resolve();
      let p = inflight.get(url);
      if (!p) {
        p = new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => {
            naturalWidths.set(url, img.naturalWidth);
            resolve();
          };
          // A missing frame falls back to the core size rather than holding the sprite back forever.
          img.onerror = () => {
            naturalWidths.set(url, 0);
            resolve();
          };
          img.src = url;
        });
        inflight.set(url, p);
      }
      return p;
    }),
  ).then(() => undefined);
}

/** True once every frame's width is known (preloading the rest on mount). */
function useFramesReady(frames: string[]): boolean {
  const key = frames.join("|");
  const known = () => frames.every((f) => naturalWidths.has(f));
  const [, bump] = useState(0);
  useEffect(() => {
    if (known()) return;
    let alive = true;
    preloadSpriteFrames(frames).then(() => alive && bump((n) => n + 1));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return known();
}

export default function GloriaSprite({
  frames,
  frameDuration = 150,
  x,
  y,
  scale = 1,
  loop = true,
  playing = true,
  onAnimationEnd,
  flipX = false,
  coreSize = 32,
  landWidth,
  opacity = 1,
  fadeMs = 0,
}: GloriaSpriteProps) {
  const reduced = useReducedMotion();
  const ready = useFramesReady(frames);
  const framesKey = frames.join("|");
  // The index belongs to its frame list: a new list starts from its first frame on the very first render.
  const [pos, setPos] = useState({ key: framesKey, index: 0 });
  const index = pos.key === framesKey ? pos.index : 0;
  const endRef = useRef(onAnimationEnd);
  endRef.current = onAnimationEnd;

  const animate = playing && !reduced && frames.length > 1 && ready;

  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    let start: number | null = null;
    let shown = 0;
    let ended = false;
    const tick = (now: number) => {
      if (start === null) start = now;
      const raw = Math.floor((now - start) / frameDuration);
      let next = raw % frames.length;
      if (!loop && raw >= frames.length - 1) {
        next = frames.length - 1;
        // the last frame gets its full duration before the animation counts as over
        ended = raw >= frames.length;
      }
      if (next !== shown) {
        shown = next;
        setPos({ key: framesKey, index: next });
      }
      if (ended) {
        endRef.current?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // frames are covered by framesKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, framesKey, frameDuration, loop]);

  if (!ready || frames.length === 0) return null;
  const src = frames[reduced ? 0 : Math.min(index, frames.length - 1)];
  const natural = naturalWidths.get(src) || coreSize;
  const core = coreSize * scale;
  const boxWidth = landWidth ? `${(core / landWidth) * 100}%` : `${core}px`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: boxWidth,
        aspectRatio: "1 / 1",
        transform: `translate(-50%, -100%)${flipX ? " scaleX(-1)" : ""}`,
        willChange: "transform",
        ...(opacity !== 1 || fadeMs > 0 ? { opacity, transition: `opacity ${fadeMs}ms ease-in-out` } : null),
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute select-none"
        style={{
          left: "50%",
          top: "50%",
          width: `${(natural / coreSize) * 100}%`,
          maxWidth: "none",
          height: "auto",
          transform: "translate(-50%, -50%)",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
