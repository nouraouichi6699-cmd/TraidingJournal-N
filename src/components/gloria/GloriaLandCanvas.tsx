// GLORIA_RPG: draws a land (gloriaLands) as layers, bottom to top:
//   1. the land's painted pixel-art image, shown in full (object-contain, centred, letterboxed in black)
//   2. its animated characters (GloriaLandSprites): farmers and a horse, frame-by-frame pixel-art sprites
//   3. an SVG overlay with the ambient life and the interactive spots: the entry, boss and exit gates
//   4. the gate tooltip.
//
// The overlay's viewBox is the image's natural pixel size and it uses preserveAspectRatio "xMidYMid meet", which
// scales exactly like the image's object-contain + centre. So a gate placed at (x%, y%) of the image always sits on
// the same landmark, whatever the screen shape. Gates are drawn as RPG-style ground rings -- flat glowing
// ellipses -- in a 1000-unit space scaled to the image width, so they keep their size relative to the art. They
// carry no permanent label: hovering (mouse), focusing (keyboard) or tapping (touch) a ring shows a small tooltip
// above it, as plain HTML so its text stays a crisp 12px whatever the image scale.
//
// On screens taller than the image the full image is shown with black letterbox bars above/below; on wider screens
// bars appear left/right. All gates stay inside the image area, so no ring is ever hidden behind a bar.
//
// Under the rings, an ambient layer brings the painting to life (the land's `ambience` data): chimney smoke, wheat
// swaying in the breeze, birds crossing the sky and the windmill's sails turning. It lives in the same viewBox,
// so it is placed in image percentages and crops/scales with the art.
//
// The image fades in once it has loaded (the overlay with it). Ambient motion is CSS keyframes in gloria.css, which
// the app's reduced-motion rules switch off (the ambient layer is hidden altogether then); sprites hold their
// first frame under reduced motion.
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { Lang } from "../../types";
import type { LandAmbience, LandDefinition, LandGate, LandGateId, LandSceneId } from "./gloriaLands";
import GloriaHeroSprite, { footprintBlocked, type HeroGateZone } from "./GloriaHeroSprite";
import { findInsideSpawn, findOutsideStart, isTriggerGate, type TriggerGateId } from "./gloriaGateTriggers";
import GloriaLandSprites from "./GloriaLandSprites";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";
import "./gloria.css";

interface Props {
  land: LandDefinition;
  /** Gate labels use Arabic for "ar" and English otherwise. */
  lang?: Lang;
  /** Reserved for the challenge locations (not drawn yet). */
  activeChallengeId?: string;
  /** Makes the gates clickable. The locked exit stays clickable too (dimmed and still), so the caller can say why
   *  it won't open. */
  onGateClick?: (gate: LandGateId) => void;
  /** The hero walked into the entry or exit gate's trigger zone (see gloriaGateTriggers). Called at once for a
   *  locked exit, after the fade-out for an open one, and after the respawn inside the city for the entry. */
  onGateReach?: (gate: TriggerGateId) => void;
  /** The hero walked into (or the player clicked) a scene portal -- a gate with `to`. The caller swaps `land` for
   *  that scene (getLandScene); the hero here fades out first. */
  onSceneChange?: (scene: LandSceneId) => void;
  /** The land was just entered from another scene, so the hero fades in on arrival. */
  arrived?: boolean;
  /** The exit gate is locked (dimmed, still ring) until the boss is beaten. */
  bossDefeated?: boolean;
  /** The player's class, which picks the hero sprite (see GloriaHeroSprite). */
  character?: GloriaCharacterId | null;
}

/** Ring colour and size (rx/ry in the 1000-unit marker space; ry squashes the ring flat onto the ground). */
const GATE_STYLE: Record<LandGateId, { color: string; rx: number; ry: number }> = {
  entry: { color: "#4ade80", rx: 45, ry: 18 },
  boss: { color: "#ef4444", rx: 55, ry: 22 },
  exit: { color: "#a855f7", rx: 45, ry: 18 },
};
/** Glow blur (marker units); the filter region and GLOW_PAD leave room for about 3x this. */
const GLOW_BLUR = 6;
/** Room around the ring for its blurred glow and the pulse's 1.05 scale, in marker units. */
const GLOW_PAD = 20;

interface VisibleBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Screen-pixel safe areas: the top keeps clear of the land view's zone-name badge. */
const SAFE_TOP_PX = 56;
const SAFE_EDGE_PX = 8;
/** Tooltip: gap to the ring and the room it needs above it (one line of 12px text + padding). */
const TIP_GAP_PX = 6;
const TIP_ROOM_PX = 30;

/** Clamp v into [lo, hi]; when the range is empty (tiny screen) fall back to its middle. */
const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

const LOCKED_TEXT = { ar: "مغلقة حتى هزيمة الزعيم", en: "Locked until the boss is defeated" };

interface TipState {
  id: LandGateId;
  open: boolean;
}

function GateRing({
  gate,
  lang,
  scale,
  px,
  py,
  locked,
  glowId,
  onClick,
  onShow,
  onHide,
  onToggle,
}: {
  gate: LandGate;
  lang: Lang;
  scale: number;
  /** Ring centre in viewBox units, already clamped into the visible part of the image. */
  px: number;
  py: number;
  locked: boolean;
  glowId: string;
  onClick?: () => void;
  onShow: () => void;
  onHide: () => void;
  onToggle: () => void;
}) {
  const { rx, ry } = GATE_STYLE[gate.id];
  const { color } = GATE_STYLE[gate.id];
  const loc = lang === "ar" ? "ar" : "en";
  const name = gate.label[loc];
  // A locked gate still takes clicks when there is a handler: the land view answers with "defeat the boss first".
  const interactive = !!onClick;
  const ariaLabel = locked ? `${name} (${LOCKED_TEXT[loc]})` : name;
  // Hover shows the label for a mouse; touch and pen have no hover, so a tap toggles it instead.
  const pointerType = useRef("mouse");

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onClick?.();
  };

  return (
    <g transform={`translate(${px} ${py}) scale(${scale})`}>
      <g
        className={`gz-ring ${interactive ? "gz-ring--interactive" : ""} ${locked ? "gz-ring--locked" : ""}`}
        style={{ animationDelay: `${gate.y * -0.02}s`, pointerEvents: "auto" }}
        onPointerDown={(e) => (pointerType.current = e.pointerType)}
        onPointerEnter={(e) => e.pointerType === "mouse" && onShow()}
        onPointerLeave={(e) => e.pointerType === "mouse" && onHide()}
        onClick={() => {
          if (pointerType.current !== "mouse") onToggle();
          if (interactive) onClick?.();
        }}
        {...(interactive
          ? { role: "button", tabIndex: 0, "aria-label": ariaLabel, onKeyDown, onFocus: onShow, onBlur: onHide }
          : { role: "img", "aria-label": ariaLabel })}
      >
        {/* outer glow: a blurred copy of the ring */}
        <ellipse
          rx={rx}
          ry={ry}
          fill="none"
          stroke={color}
          strokeOpacity={0.55}
          strokeWidth={6}
          filter={`url(#${glowId})`}
          pointerEvents="none"
        />
        <ellipse className="gz-ring-body" rx={rx} ry={ry} fill={color} fillOpacity={0.15} stroke={color} strokeOpacity={0.85} strokeWidth={2.5} />
      </g>
    </g>
  );
}

/** CSS custom properties are not in CSSProperties' keys; this lets them ride along in a style object. */
type VarStyle = CSSProperties & Record<`--${string}`, string>;

/** Puffs per chimney, staggered evenly over one rise (2 keeps the whole layer under 30 animated elements). */
const SMOKE_PUFFS = 2;

/**
 * The land's ambient life, drawn in image pixels (the viewBox) from the percentages in `ambience`. Purely
 * decorative: hidden from assistive tech and from the pointer, every element animated by a gloria.css keyframe.
 */
function AmbientLayer({ ambience, w, h, wheatFill }: { ambience: LandAmbience; w: number; h: number; wheatFill: string }) {
  const X = (pct: number) => (pct / 100) * w;
  const Y = (pct: number) => (pct / 100) * h;
  const { smoke = [], wheat = [], birds = [], windmill } = ambience;
  return (
    <g className="gz-ambient" aria-hidden="true">
      {/* wheat: faint golden sheens over the fields, each swaying on its own beat */}
      {wheat.map((f, i) => (
        <rect
          key={`wheat-${i}`}
          className="gz-wheat"
          x={X(f.x)}
          y={Y(f.y)}
          width={X(f.w)}
          height={Y(f.h)}
          fill={wheatFill}
          style={{ animationDuration: `${(2.5 + ((i * 0.37) % 1)).toFixed(2)}s`, animationDelay: `${-i * 0.6}s` }}
        />
      ))}

      {/* windmill: four translucent sails turning over the painted ones */}
      {windmill && (
        <g transform={`translate(${X(windmill.x)} ${Y(windmill.y)})`}>
          <g className="gz-windmill">
            {[0, 90, 180, 270].map((a) => {
              const len = X(windmill.size);
              const half = len * 0.12;
              return <polygon key={a} points={`0,0 ${-half},${-len} ${half},${-len}`} transform={`rotate(${a})`} />;
            })}
          </g>
        </g>
      )}

      {/* chimney smoke: puffs rise, drift and fade, staggered so each chimney smokes steadily */}
      {smoke.flatMap((c, ci) => {
        const dur = 3.2 + (ci % 3) * 0.4;
        return Array.from({ length: SMOKE_PUFFS }, (_, pi) => (
          <circle
            key={`smoke-${ci}-${pi}`}
            className="gz-smoke-puff"
            cx={X(c.x)}
            cy={Y(c.y)}
            r={3 + ((ci + pi) % 3)}
            style={
              {
                animationDuration: `${dur.toFixed(1)}s`,
                animationDelay: `${(-(pi * dur) / SMOKE_PUFFS - ci * 0.5).toFixed(2)}s`,
                "--gz-smoke-dx": `${[-7, 5, 9, -4][(ci + pi) % 4]}px`,
              } as VarStyle
            }
          />
        ));
      })}

      {/* birds: tiny flapping Vs gliding across the sky, each on its own loop */}
      {birds.map((b, i) => {
        const from = b.dir === 1 ? -20 : w + 20;
        const to = b.dir === 1 ? w + 20 : -20;
        return (
          <g key={`bird-${i}`} transform={`translate(0 ${Y(b.y)})`}>
            <g
              className="gz-bird"
              style={
                {
                  animationDuration: `${b.duration}s`,
                  animationDelay: `${b.delay}s`,
                  "--gz-bird-from": `${from}px`,
                  "--gz-bird-to": `${to}px`,
                } as VarStyle
              }
            >
              <path className="gz-bird-wings" d="M-4 -1.5 L0 1.5 L4 -1.5" style={{ animationDelay: `${-i * 0.15}s` }} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

export default function GloriaLandCanvas({
  land, lang = "en", onGateClick, onGateReach, onSceneChange, arrived = false, bossDefeated = false, character,
}: Props) {
  const { w, h } = land.imageSize;
  // The boss barrier (gloriaLands) only blocks while the zone's boss is still undefeated; once bossDefeated flips
  // true it drops out of the active obstacle list, same as any other obstacle disappearing.
  const effectiveObstacles = useMemo(
    () => (!bossDefeated && land.bossBarrier ? [...(land.obstacles ?? []), ...land.bossBarrier] : (land.obstacles ?? [])),
    [land.obstacles, land.bossBarrier, bossDefeated],
  );
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [box, setBox] = useState<{ cw: number; ch: number } | null>(null);
  // The tooltip stays mounted after it closes (open: false) so it can fade out.
  const [tip, setTip] = useState<TipState | null>(null);
  const uid = useId().replace(/:/g, "");
  const glowId = `gz-ring-glow-${uid}`;
  const wheatId = `gz-wheat-${uid}`;

  // Track the container size to know which part of the image the crop leaves visible.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setBox((prev) => (prev && prev.cw === width && prev.ch === height ? prev : { cw: width, ch: height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new land starts hidden; an image already in the cache may have finished before onLoad was attached.
  useEffect(() => {
    setLoaded(!!imgRef.current?.complete && (imgRef.current?.naturalWidth ?? 0) > 0);
    setTip(null);
  }, [land.image]);

  // Rings are drawn in a 1000-unit space spanning the image width.
  const scale = w / 1000;

  // "meet" scales the image by the smaller ratio and centres it; s converts screen px to viewBox units and
  // (ox, oy) is the image point at the container's top-left corner (negative where a letterbox bar sits).
  let view: { s: number; ox: number; oy: number } | null = null;
  let visible: VisibleBox | null = null;
  if (box && box.cw > 0 && box.ch > 0) {
    const s = Math.min(box.cw / w, box.ch / h);
    const visW = box.cw / s;
    const visH = box.ch / s;
    const ox = (w - visW) / 2;
    const oy = (h - visH) / 2;
    view = { s, ox, oy };
    visible = {
      x0: ox + SAFE_EDGE_PX / s,
      x1: ox + visW - SAFE_EDGE_PX / s,
      y0: oy + SAFE_TOP_PX / s,
      y1: oy + visH - SAFE_EDGE_PX / s,
    };
  }

  // Ring centres, kept (with their glow) inside the visible part of the image.
  const rings = land.gates.map((gate) => {
    const { rx, ry } = GATE_STYLE[gate.id];
    let px = (gate.x / 100) * w;
    let py = (gate.y / 100) * h;
    if (visible) {
      const sideX = (rx + GLOW_PAD) * scale;
      const sideY = (ry + GLOW_PAD) * scale;
      px = clamp(px, visible.x0 + sideX, visible.x1 - sideX);
      py = clamp(py, visible.y0 + sideY, visible.y1 - sideY);
    }
    return { gate, px, py, ry, locked: gate.id === "exit" && !bossDefeated };
  });

  const showTip = (id: LandGateId) => setTip({ id, open: true });
  const hideTip = (id: LandGateId) => setTip((t) => (t && t.id === id ? { ...t, open: false } : t));
  const toggleTip = (id: LandGateId) => setTip((t) => (t && t.id === id && t.open ? { ...t, open: false } : { id, open: true }));

  // A tap on the land outside every ring closes an open tooltip.
  const onWrapPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!(e.target as Element).closest?.(".gz-ring")) setTip((t) => (t && t.open ? { ...t, open: false } : t));
  };

  // The hero starts just outside the entry gate every time the land mounts; walking up to the gate carries it to
  // the inside spawn (gloriaGateTriggers). The zones derive from the land's entry/exit gates, so every land that
  // defines them gets the behaviour; the exit zone is locked until the boss is beaten.
  const heroSetup = useMemo(() => {
    const blocked = (p: { x: number; y: number }) => footprintBlocked(p.x, p.y, effectiveObstacles, w, h);
    // Carried in by a portal, the hero arrives on the scene's own entry gate -- the way back through the door it came
    // from (the exterior's entry is the trigger in front of the main gate). The opening scene uses its `start`.
    const arrival = arrived ? land.gates.find((g) => g.id === "entry") : undefined;
    return {
      start: arrival ? { x: arrival.x, y: arrival.y } : (land.start ?? findOutsideStart(land, blocked)),
      spawn: findInsideSpawn(land, blocked),
    };
  }, [land, w, h, arrived, effectiveObstacles]);
  const heroGates = useMemo<HeroGateZone[]>(
    () =>
      land.gates
        .filter((g): g is LandGate & { id: TriggerGateId } => isTriggerGate(g.id) && !g.spawnOnly)
        .map((g) => ({ id: g.id, x: g.x, y: g.y, locked: g.id === "exit" && !bossDefeated, to: g.to })),
    [land, bossDefeated],
  );

  // Tooltip position in container pixels: centred above its ring, or below it when the zone badge leaves no room.
  const tipRing = tip ? rings.find((r) => r.gate.id === tip.id) : undefined;
  let tipEl = null;
  if (tip && tipRing && view) {
    const loc = lang === "ar" ? "ar" : "en";
    const left = (tipRing.px - view.ox) * view.s;
    const ringTop = (tipRing.py - tipRing.ry * scale - view.oy) * view.s;
    const ringBottom = (tipRing.py + tipRing.ry * scale - view.oy) * view.s;
    const above = ringTop - TIP_GAP_PX - TIP_ROOM_PX >= SAFE_TOP_PX;
    tipEl = (
      <div
        role="tooltip"
        dir={loc === "ar" ? "rtl" : "ltr"}
        className="pointer-events-none absolute whitespace-nowrap text-center leading-tight text-white"
        style={{
          left,
          top: above ? ringTop - TIP_GAP_PX : ringBottom + TIP_GAP_PX,
          transform: `translate(-50%, ${above ? "-100%" : "0"})`,
          background: "rgba(0, 0, 0, 0.75)",
          fontSize: 12,
          borderRadius: 6,
          padding: "4px 10px",
          opacity: tip.open ? 1 : 0,
          transition: "opacity 150ms ease-out",
        }}
      >
        {tipRing.gate.label[loc]}
        {tipRing.locked && <div style={{ fontSize: 10, opacity: 0.7 }}>{LOCKED_TEXT[loc]}</div>}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full bg-black transition-opacity duration-300 ease-out"
      style={{ opacity: loaded ? 1 : 0 }}
      onPointerDown={onWrapPointerDown}
    >
      <img
        ref={imgRef}
        key={land.image}
        src={land.image}
        alt={land.id}
        className="block h-full w-full select-none object-contain object-center"
        style={{ imageRendering: "auto" }}
        width={w}
        height={h}
        loading="eager"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
      />

      {/* Gate rings paint before the sprites below, so a ground ring sits under a character standing on it
          (the boss serpent, notably) instead of its outline cutting across their body. The ring's own pointer
          events still work: the sprite layer above it is pointer-events-none throughout, so clicks and hovers
          pass straight through to the ring. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={land.id}
      >
        <defs>
          {/* region padded well past the ring: the default 10% would clip the blur on the flat ellipse */}
          <filter id={glowId} x="-50%" y="-120%" width="200%" height="340%">
            <feGaussianBlur stdDeviation={GLOW_BLUR} />
          </filter>
          <linearGradient id={wheatId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fde68a" stopOpacity={0} />
            <stop offset="0.5" stopColor="#fde68a" stopOpacity={0.08} />
            <stop offset="1" stopColor="#fde68a" stopOpacity={0} />
          </linearGradient>
        </defs>
        {land.ambience && <AmbientLayer ambience={land.ambience} w={w} h={h} wheatFill={`url(#${wheatId})`} />}
        {rings.map(({ gate, px, py, locked }) => (
          <GateRing
            key={gate.id}
            gate={gate}
            lang={lang}
            scale={scale}
            px={px}
            py={py}
            locked={locked}
            glowId={glowId}
            onClick={
              gate.to && onSceneChange
                ? () => onSceneChange(gate.to!.scene) // clicking a portal walks through it
                : onGateClick
                  ? () => onGateClick(gate.id)
                  : undefined
            }
            onShow={() => showTip(gate.id)}
            onHide={() => hideTip(gate.id)}
            onToggle={() => toggleTip(gate.id)}
          />
        ))}
        {/* challenge locations: to come */}
      </svg>

      {view && (
        <GloriaLandSprites sprites={land.sprites ?? []} w={w} h={h} view={view}>
          <GloriaHeroSprite
            key={`${land.id}:${land.image}`}
            character={character}
            start={heroSetup.start}
            landWidth={w}
            landHeight={h}
            obstacles={effectiveObstacles}
            gates={heroGates}
            insideSpawn={heroSetup.spawn}
            onGateReach={onGateReach}
            onSceneChange={onSceneChange}
            arrive={arrived}
          />
        </GloriaLandSprites>
      )}

      {tipEl}
    </div>
  );
}
