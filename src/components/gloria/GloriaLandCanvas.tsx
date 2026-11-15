// GLORIA_RPG: draws a land (gloriaLands) as two layers:
//   1. the land's painted pixel-art image, filling the container (object-cover, centred)
//   2. an SVG overlay with the interactive spots: the entry, boss and exit gates.
//
// The overlay's viewBox is the image's natural pixel size and it uses preserveAspectRatio "xMidYMid slice", which
// crops exactly like the image's object-cover + centre. So a gate placed at (x%, y%) of the image always sits on
// the same landmark, whatever the screen shape. Gates are drawn as RPG-style ground rings -- flat glowing
// ellipses -- in a 1000-unit space scaled to the image width, so they keep their size relative to the art. They
// carry no permanent label: hovering (mouse), focusing (keyboard) or tapping (touch) a ring shows a small tooltip
// above it, as plain HTML so its text stays a crisp 12px whatever the image scale.
//
// On screens shaped differently from the image, the crop can cut off the edges where the entry and exit gates
// sit. So each ring is clamped into the visible part of the image (and below the zone-name badge floating at
// the top of the land view): a gate on the edge of the land stays on the edge of the screen.
//
// The image fades in once it has loaded (the overlay with it). All motion is CSS keyframes in gloria.css, which
// the app's reduced-motion rules switch off.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Lang } from "../../types";
import type { LandDefinition, LandGate, LandGateId } from "./gloriaLands";
import "./gloria.css";

interface Props {
  land: LandDefinition;
  /** Gate labels use Arabic for "ar" and English otherwise. */
  lang?: Lang;
  /** Reserved for the challenge locations (not drawn yet). */
  activeChallengeId?: string;
  /** Makes the gates clickable. The exit gate stays inert while it is locked. */
  onGateClick?: (gate: LandGateId) => void;
  /** The exit gate is locked (grey, dimmed ring, not clickable) until the boss is beaten. */
  bossDefeated?: boolean;
}

/** Ring colour and size (rx/ry in the 1000-unit marker space; ry squashes the ring flat onto the ground). */
const GATE_STYLE: Record<LandGateId, { color: string; rx: number; ry: number }> = {
  entry: { color: "#f59e0b", rx: 45, ry: 18 },
  boss: { color: "#ef4444", rx: 55, ry: 22 },
  exit: { color: "#4ade80", rx: 45, ry: 18 },
};
const LOCKED_COLOR = "#9ca3af";
/** Room around the ring for its blurred glow and the pulse's 1.05 scale, in marker units. */
const GLOW_PAD = 14;

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
  const color = locked ? LOCKED_COLOR : GATE_STYLE[gate.id].color;
  const loc = lang === "ar" ? "ar" : "en";
  const name = gate.label[loc];
  const interactive = !!onClick && !locked;
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
          strokeOpacity={0.4}
          strokeWidth={6}
          filter={`url(#${glowId})`}
          pointerEvents="none"
        />
        <ellipse className="gz-ring-body" rx={rx} ry={ry} fill={color} fillOpacity={0.1} stroke={color} strokeOpacity={0.7} strokeWidth={2} />
      </g>
    </g>
  );
}

export default function GloriaLandCanvas({ land, lang = "en", onGateClick, bossDefeated = false }: Props) {
  const { w, h } = land.imageSize;
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [box, setBox] = useState<{ cw: number; ch: number } | null>(null);
  // The tooltip stays mounted after it closes (open: false) so it can fade out.
  const [tip, setTip] = useState<TipState | null>(null);
  const glowId = `gz-ring-glow-${useId().replace(/:/g, "")}`;

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

  // "slice" scales the image by the larger ratio and centres it; s converts screen px to viewBox units and
  // (ox, oy) is the image point at the container's top-left corner.
  let view: { s: number; ox: number; oy: number } | null = null;
  let visible: VisibleBox | null = null;
  if (box && box.cw > 0 && box.ch > 0) {
    const s = Math.max(box.cw / w, box.ch / h);
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
      className="relative h-full w-full transition-opacity duration-300 ease-out"
      style={{ opacity: loaded ? 1 : 0 }}
      onPointerDown={onWrapPointerDown}
    >
      <img
        ref={imgRef}
        key={land.image}
        src={land.image}
        alt={land.id}
        className="block h-full w-full select-none object-cover object-center"
        style={{ imageRendering: "auto" }}
        width={w}
        height={h}
        loading="eager"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
      />

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid slice"
        role="group"
        aria-label={land.id}
      >
        <defs>
          {/* region padded well past the ring: the default 10% would clip the blur on the flat ellipse */}
          <filter id={glowId} x="-50%" y="-120%" width="200%" height="340%">
            <feGaussianBlur stdDeviation={4} />
          </filter>
        </defs>
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
            onClick={onGateClick ? () => onGateClick(gate.id) : undefined}
            onShow={() => showTip(gate.id)}
            onHide={() => hideTip(gate.id)}
            onToggle={() => toggleTip(gate.id)}
          />
        ))}
        {/* challenge locations: to come */}
      </svg>

      {tipEl}
    </div>
  );
}
