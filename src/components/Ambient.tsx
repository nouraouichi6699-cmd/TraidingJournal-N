// The light behind the app: an aurora, police flashes, or scattered orbs. It sits over the page background and under
// everything else, in the upper part of the screen only, and never takes a pointer event.
//
// The aurora is a faithful port of the drawing the customer tuned over many rounds, constant for constant. Three
// curtains hang from a bright undulating lower edge, graded by height, drifting right to left, composited with
// "lighter" and softened with a CSS blur. There are deliberately NO vertical rays or lines: the bands below are
// wider than their spacing, so they overlap into one smooth sheet. Anything that reintroduces visible verticals is
// wrong and was rejected twice.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  auroraAlpha, buildPalette, DEFAULT_LIGHTING, dur, fullColourBg, orbAlpha, orbSpread, paletteKey, policeAlpha,
  POLICE_SECONDS, sessionNow, sessionTrio, speedFactor, SWATCH, type Lighting, type Rgb, type Stop, type Trio,
} from "../lib/lighting";
import { useReduceMotion, useSettings } from "../useSettings";
import type { Theme } from "../types";

/** The far curtain first (higher, fainter, slower), the main one last (lowest, brightest). */
const LAYERS = [
  { y: 0.44, h: 0.36, a: 0.45, img: 0, s: 0.6, ph: 1.7 },
  { y: 0.63, h: 0.46, a: 0.7, img: 1, s: 0.8, ph: 4.1 },
  { y: 0.8, h: 0.58, a: 1, img: 0, s: 1, ph: 0 },
] as const;

const FPS = 30; // the drawing is soft enough that more frames buy nothing
const STEP = 2; // pixels between bands, in the half-resolution canvas
const STARS = 110;
const SEED = 20261101;

/** Fixed star positions from a seeded generator, so they stay put while the aurora drifts past them. */
function makeStars() {
  let seed = SEED;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  return Array.from({ length: STARS }, () => {
    const size = Number((1 + rnd() * 1.6).toFixed(1));
    return {
      left: Number((rnd() * 100).toFixed(2)),
      top: Number((rnd() * 92).toFixed(2)),
      size,
      opacity: Number((0.35 + rnd() * 0.6).toFixed(2)),
      twinkle: rnd() < 0.25,
      period: 2 + rnd() * 3,
      delay: Number((-rnd() * 4).toFixed(1)),
    };
  });
}

/** One 1px-wide image per curtain holding its height gradient; each band is that image stretched. */
function makeStrips(pal: Stop[][]): HTMLCanvasElement[] {
  return pal.map((stops) => {
    const cv = document.createElement("canvas");
    cv.width = 1;
    cv.height = 256;
    const g = cv.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    for (const [at, colour] of stops) gr.addColorStop(at, colour);
    g.fillStyle = gr;
    g.fillRect(0, 0, 1, 256);
    return cv;
  });
}

const orbBg = (rgb: Rgb, alpha: number, spread: number) =>
  `radial-gradient(circle, rgba(${rgb},${alpha.toFixed(2)}), rgba(${rgb},0) ${spread}%)`;

export default function Ambient({ theme }: { theme: Theme }) {
  const s = useSettings();
  const still = useReduceMotion();
  const light: Lighting = { ...DEFAULT_LIGHTING, ...(s.lighting ?? {}) };
  // The aurora, the flashes and the orbs are glows: over a light page they read as a smudge, so they stay in the
  // dark themes. The full-colour background is a tint rather than a glow, so it works in every theme.
  const darkOnly = light.style === "aurora" || light.style === "police" || light.style === "orbs";
  const off = light.style === "off" || (darkOnly && theme === "light");

  // The open session is checked now and then rather than every frame; nothing else here depends on the clock.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (off || light.color !== "session") return;
    const id = window.setInterval(() => setTick((n) => n + 1), 60e3);
    return () => window.clearInterval(id);
  }, [off, light.color]);

  const trio: Trio = useMemo(
    () => (light.color === "session" ? sessionTrio(sessionNow(Date.now(), s.sessionBounds)) : light.custom),
    // tick is what brings a new session's colours in
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [light.color, light.custom, s.sessionBounds, tick],
  );

  const stars = useMemo(makeStars, []);
  const key = paletteKey(light.color, trio);
  const alpha = auroraAlpha(light.level);
  const rate = 1 / speedFactor(light.speed);
  const running = light.playing && !still;

  // What the loop reads each frame, without restarting it when a number changes.
  const cfg = useRef({ alpha, rate, key, pal: buildPalette(light.color, trio), running });
  cfg.current = { alpha, rate, key, pal: buildPalette(light.color, trio), running };

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const decor = useRef<HTMLDivElement | null>(null);

  // ---- the aurora loop ----
  useEffect(() => {
    if (off || light.style !== "aurora") return;
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let time = 0;
    let last = performance.now();
    let paintedAt = 0;
    let strips: HTMLCanvasElement[] = [];
    let stripKey = "";
    let W = 0, H = 0;

    // Resizing and a change of screen only resize the canvas; the strips are 1x256 and never depend on either.
    const measure = () => {
      const w = Math.max(2, Math.round(cv.clientWidth / 2));
      const h = Math.max(2, Math.round(cv.clientHeight / 2));
      if (w !== W || h !== H) { W = w; H = h; cv.width = W; cv.height = H; }
    };

    const draw = () => {
      measure();
      const c = cfg.current;
      if (!c.pal.length) return;
      if (stripKey !== c.key) { strips = makeStrips(c.pal); stripKey = c.key; }
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (const L of LAYERS) {
        const img = strips[L.img];
        if (!img) continue;
        const tt = time * L.s;
        for (let x = 0; x < W; x += STEP) {
          const u = (x / W) * 6.2832;
          // The lower edge: slow wide folds, then smaller ripples, all drifting right to left.
          const base = H * (L.y
            + 0.07 * Math.sin(u * 1.1 + tt * 0.25 + L.ph)
            + 0.035 * Math.sin(u * 2.7 + tt * 0.18 + L.ph * 2)
            + 0.015 * Math.sin(u * 6.3 + tt * 0.4));
          // Bright and dim stretches along the curtain, with only a gentle, wide shimmer: no visible ray lines.
          const fold = 0.5 + 0.5 * Math.sin(u * 1.9 + tt * 0.22 + L.ph);
          const shimmer = 0.85 + 0.15 * Math.sin(u * 7 + tt * 0.5 + L.ph);
          const b = Math.pow(fold * 0.75 + 0.25, 1.6) * shimmer;
          const h = H * L.h * (0.6 + 0.2 * (1 + Math.sin(u * 3.3 + tt * 0.3 + L.ph)));
          const a = Math.min(1, b * L.a * c.alpha);
          // A wide, faint glow, then a soft band. Each band is 12px wide while they sit 2px apart, so they overlap
          // into one smooth sheet of light with no visible lines (alpha is lowered to match the overlap).
          ctx.globalAlpha = a * 0.1;
          ctx.drawImage(img, x - 8, base - h * 0.85, 18, h * 0.95);
          ctx.globalAlpha = a * 0.2;
          ctx.drawImage(img, x - 5, base - h, 12, h * 1.08);
        }
      }
      ctx.globalAlpha = 1;
    };

    // Reduced motion gets one frame and no loop at all.
    if (still) { draw(); return; }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const c = cfg.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (c.running) time += dt * c.rate;
      // 30 frames a second is plenty for light this soft, and a third of the work of an unbounded loop.
      if (now - paintedAt < 1000 / FPS) return;
      paintedAt = now;
      draw();
    };
    raf = requestAnimationFrame(frame);

    const onVisible = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [off, light.style, still]);

  // ---- the mouse parallax, as two custom properties the layers below read ----
  useEffect(() => {
    if (off || still || light.style !== "aurora") return;
    const el = decor.current;
    if (!el) return;
    const on = (e: PointerEvent) => {
      el.style.setProperty("--mx", String((e.clientX / window.innerWidth) * 2 - 1));
      el.style.setProperty("--my", String((e.clientY / window.innerHeight) * 2 - 1));
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, [off, still, light.style]);

  if (off) return null;

  // Full colour: one static wash over the whole page, as strong as the theme's text can take. No canvas, no loop.
  if (light.style === "full") {
    const tint = light.color === "session" ? sessionTrio(sessionNow(Date.now(), s.sessionBounds)).a
      : light.color === "custom" ? light.solid
        : (SWATCH[light.color] ?? SWATCH.gold);
    const { color } = fullColourBg(theme, tint, light.level);
    return (
      <div
        aria-hidden="true" className="pointer-events-none fixed inset-0 z-0"
        style={{ background: color }}
      />
    );
  }

  const play = light.playing && !still ? "running" : "paused";
  const spread = orbSpread(light.level);
  const orbA = orbAlpha(light.level);
  const hue = light.color === "rgb" ? `mz-hue ${dur(30, light.speed)} linear infinite, ` : "";
  const single = light.color === "custom" || light.color === "session" ? null : light.color;
  const orbRgb: [Rgb, Rgb, Rgb] = light.color === "rgb"
    ? ["255,70,90", "60,140,255", "60,230,140"]
    : light.color === "custom" || light.color === "session"
      ? [hexOf(trio.a), hexOf(trio.b), hexOf(trio.c)]
      : [fixedOf(single), fixedOf(single), fixedOf(single)];

  return (
    <div
      ref={decor} aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-0 h-screen overflow-hidden"
      style={{ ["--mx" as string]: 0, ["--my" as string]: 0 }}
    >
      {light.style === "aurora" && (
        <div
          className="absolute inset-x-0 top-0 h-[62%]"
          style={{
            maskImage: "linear-gradient(to bottom, #000 0%, #000 60%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 60%, transparent 100%)",
          }}
        >
          {/* The far layer: stars, and two shooting stars that cross now and then, right to left. */}
          <div
            className="absolute inset-0"
            style={{ transform: "translate(calc(var(--mx) * -10px), calc(var(--my) * -6px))", transition: "transform .8s cubic-bezier(.2,.7,.2,1)" }}
          >
            {stars.map((st, i) => (
              <span
                key={i} className="mz-orb absolute rounded-full"
                style={{
                  left: `${st.left}%`, top: `${st.top}%`, width: st.size, height: st.size, background: "#fff",
                  opacity: st.opacity, boxShadow: `0 0 ${st.size * 3}px rgba(255,255,255,.7)`,
                  animation: st.twinkle && !still ? `mz-twinkle ${dur(st.period, light.speed)} ease-in-out ${st.delay}s infinite` : undefined,
                  animationPlayState: play,
                }}
              />
            ))}
            {!still && ([["9%", "14%", 150, 26, "4s"], ["22%", "42%", 110, 33, "17s"]] as const).map(([top, right, w, secs, delay], i) => (
              <span
                key={i} className="mz-orb absolute rounded-sm"
                style={{
                  top, right, width: w, height: 2, opacity: 0,
                  background: "linear-gradient(90deg, #fff, rgba(255,255,255,0))",
                  boxShadow: "0 0 10px rgba(255,255,255,.8)",
                  animation: `mz-meteor ${dur(secs, light.speed)} linear ${delay} infinite`,
                  animationPlayState: play,
                }}
              />
            ))}
          </div>
          {/* The near layer: the aurora moves more than the stars do. */}
          <canvas
            ref={canvas} className="absolute inset-0 h-full w-full"
            style={{
              filter: "blur(3px)",
              transform: still ? undefined : "translate(calc(var(--mx) * -24px), calc(var(--my) * -10px)) scale(1.04)",
              transition: "transform .8s cubic-bezier(.2,.7,.2,1)",
            }}
          />
        </div>
      )}

      {light.style === "police" && ([
        ["left", "35%", "255,45,85", "0s"],
        ["right", "65%", "45,123,255", `${-POLICE_SECONDS[light.speed] / 2}s`],
      ] as const).map(([side, at, rgb, delay]) => (
        <div
          key={side} className="mz-orb absolute"
          style={{
            top: "-15%", bottom: "-15%", [side]: "-25%", width: "75%",
            background: `radial-gradient(ellipse at ${at} 45%, rgba(${rgb},${policeAlpha(light.level).toFixed(2)}), rgba(${rgb},0) 65%)`,
            animation: `mz-police ${POLICE_SECONDS[light.speed]}s linear infinite`,
            animationDelay: delay,
            animationPlayState: play,
          }}
        />
      ))}

      {light.style === "orbs" && ([
        { pos: { top: -240, left: -160 }, size: 720, rgb: orbRgb[0], a: orbA[0], anim: `${hue}mz-drift-a ${dur(48, light.speed)} ease-in-out infinite` },
        { pos: { bottom: -280, right: -200 }, size: 800, rgb: orbRgb[1], a: orbA[1], anim: `${hue}mz-drift-b ${dur(56, light.speed)} ease-in-out infinite` },
        { pos: { top: 160, right: "30%" }, size: 560, rgb: orbRgb[2], a: orbA[2], anim: `${hue}mz-drift-c ${dur(64, light.speed)} ease-in-out infinite` },
      ]).map((o, i) => (
        <div
          key={i} className="mz-orb absolute rounded-full"
          style={{ ...o.pos, width: o.size, height: o.size, background: orbBg(o.rgb, o.a, spread), animation: o.anim, animationPlayState: play }}
        />
      ))}
    </div>
  );
}

// Small helpers kept here because only the orbs need them in this shape.
function hexOf(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(",");
}
function fixedOf(color: string | null): Rgb {
  const map: Record<string, Rgb> = { gold: "242,193,78", blue: "90,184,240", violet: "167,139,250", green: "52,211,153" };
  return map[color ?? ""] ?? map.gold;
}
