import { useEffect, useRef } from "react";
import type { Anchor } from "./LoginChart";

const UP = "#2EBD85";
const DOWN = "#F6465D";

// The green one erupts and is gone well before the hand-over finishes; the red one stays long enough to be read,
// then clears so the next attempt starts from a normal chart.
const PLAN = {
  up: { grow: 350, hold: 150, fade: 250 },
  down: { grow: 320, hold: 480, fade: 400 },
} as const;

/** The body stops short of the edge so the wick has somewhere to go and still reaches it. */
const BODY_INSET = 0.06;

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

export type NewsKind = "up" | "down";

interface Props {
  kind: NewsKind;
  /** The newest candle, in viewport pixels. Both kinds take their column from it; only the red one starts at its price. */
  at: Anchor;
  onDone: () => void;
}

/**
 * One giant candle on its own canvas over the right panel, in the column the newest candle occupies. It crosses the
 * whole panel, which the chart band itself is far too short to allow, and removes itself once the effect is over.
 */
export default function NewsCandle({ kind, at, onDone }: Props) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const plan = PLAN[kind];
    const total = plan.grow + plan.hold + plan.fade;
    const colour = kind === "up" ? UP : DOWN;
    let raf = 0;
    let start = 0;
    let w = 0;
    let h = 0;
    // The anchor is in viewport pixels; this canvas has its own corner to measure from.
    let ox = 0;
    let oy = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const box = el.getBoundingClientRect();
      w = Math.max(1, Math.round(box.width));
      h = Math.max(1, Math.round(box.height));
      ox = at.x - box.left;
      oy = at.y - box.top;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (elapsed: number) => {
      ctx.clearRect(0, 0, w, h);
      const grown = easeOut(Math.min(1, elapsed / plan.grow));
      const fading = Math.max(0, elapsed - plan.grow - plan.hold) / plan.fade;
      const alpha = 1 - Math.min(1, fading);
      if (alpha <= 0) return;

      // The green one opens at the bottom edge so it has the whole panel to run up; the red one opens at the price
      // the chart is showing and falls from there. Either way the body stops short and the wick carries on.
      const from = kind === "up" ? h : oy;
      const edge = kind === "up" ? h * BODY_INSET : h * (1 - BODY_INSET);
      const tip = kind === "up" ? 0 : h;
      const bodyEnd = from + (edge - from) * grown;
      const wickEnd = from + (tip - from) * grown;
      const width = Math.max(14, at.bw * 2.4);

      ctx.globalAlpha = alpha;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 26;
      // Drawn first and covered by the body, so only the part reaching past it shows as a wick.
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(1.5, width * 0.14);
      ctx.beginPath();
      ctx.moveTo(ox, from);
      ctx.lineTo(ox, wickEnd);
      ctx.stroke();

      ctx.fillStyle = colour;
      ctx.fillRect(ox - width / 2, Math.min(from, bodyEnd), width, Math.max(1, Math.abs(bodyEnd - from)));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;
      draw(elapsed);
      if (elapsed >= total) {
        ctx.clearRect(0, 0, w, h);
        done.current();
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind, at]);

  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 h-full w-full" />;
}
