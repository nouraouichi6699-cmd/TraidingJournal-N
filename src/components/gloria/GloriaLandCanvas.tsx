// GLORIA_RPG: draws a land (gloriaLands) as two layers:
//   1. the land's painted pixel-art image, filling the container (object-cover, centred)
//   2. an SVG overlay with the interactive spots: the entry, boss and exit gates.
//
// The overlay's viewBox is the image's natural pixel size and it uses preserveAspectRatio "xMidYMid slice", which
// crops exactly like the image's object-cover + centre. So a gate placed at (x%, y%) of the image always sits on
// the same landmark, whatever the screen shape. Gate markers are drawn in a 1000-unit space scaled to the image
// width, so they keep their size relative to the art.
//
// On screens shaped differently from the image, the crop can cut off the edges where the entry and exit gates
// sit. So each marker is clamped into the visible part of the image (and below the zone-name badge floating at
// the top of the land view): a gate on the edge of the land stays on the edge of the screen.
//
// The image fades in once it has loaded (the overlay with it). All motion is CSS keyframes in gloria.css, which
// the app's reduced-motion rules switch off.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  /** The exit gate is locked (padlock, not clickable) until the boss is beaten. */
  bossDefeated?: boolean;
}

const GATE_STYLE: Record<LandGateId, { color: string; glow: string; r: number }> = {
  entry: { color: "#f59e0b", glow: "#fcd34d", r: 17 },
  boss: { color: "#dc2626", glow: "#fb923c", r: 26 },
  exit: { color: "#16a34a", glow: "#86efac", r: 17 },
};

interface VisibleBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Screen-pixel safe areas: the top keeps clear of the land view's zone-name badge. */
const SAFE_TOP_PX = 56;
const SAFE_EDGE_PX = 8;

/** Clamp v into [lo, hi]; when the range is empty (tiny screen) fall back to its middle. */
const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

const LOCKED_TEXT = { ar: "مغلقة حتى هزيمة الزعيم", en: "Locked until the boss is defeated" };

/** Door / arch, centred on 0,0. */
const DoorIcon = () => (
  <g>
    <path d="M-7 9 V-1 A7 7 0 0 1 7 -1 V9 Z" fill="#fef3c7" />
    <path d="M-4 9 V0 A4 4 0 0 1 4 0 V9 Z" fill="#78350f" />
    <rect x={1.5} y={3} width={1.6} height={1.6} fill="#fcd34d" />
  </g>
);

/** Arrow up, centred on 0,0. */
const ArrowUpIcon = () => <path d="M0 -10 L9 0 H3.5 V10 H-3.5 V0 H-9 Z" fill="#dcfce7" />;

/** Crossed swords, centred on 0,0. */
const SwordsIcon = () => (
  <g strokeLinecap="round">
    {[45, -45].map((deg) => (
      <g key={deg} transform={`rotate(${deg})`}>
        <line x1={0} y1={-16} x2={0} y2={7} stroke="#fee2e2" strokeWidth={3.2} />
        <line x1={-6} y1={7} x2={6} y2={7} stroke="#fbbf24" strokeWidth={3} />
        <line x1={0} y1={8} x2={0} y2={14} stroke="#92400e" strokeWidth={3.4} />
      </g>
    ))}
  </g>
);

/** Small padlock, centred on 0,0. */
const LockIcon = () => (
  <g>
    <circle r={9} fill="#1c1917" stroke="#a8a29e" strokeWidth={1.5} />
    <path d="M-3.2 -1 V-3.4 A3.2 3.2 0 0 1 3.2 -3.4 V-1" fill="none" stroke="#e7e5e4" strokeWidth={1.8} />
    <rect x={-4.6} y={-1.2} width={9.2} height={6.6} rx={1.2} fill="#e7e5e4" />
  </g>
);

function GateMarker({
  gate,
  lang,
  scale,
  cx,
  cy,
  visible,
  locked,
  onClick,
}: {
  gate: LandGate;
  lang: Lang;
  scale: number;
  cx: number;
  cy: number;
  /** The visible part of the image in viewBox units, already inset by the screen-edge safe areas. */
  visible: VisibleBox | null;
  locked: boolean;
  onClick?: () => void;
}) {
  const { color, glow, r } = GATE_STYLE[gate.id];
  const isBoss = gate.id === "boss";
  const loc = lang === "ar" ? "ar" : "en";
  const name = gate.label[loc];
  const text = isBoss ? `⚔️ ${name}` : name;
  const fontSize = isBoss ? 15 : 12;
  // SVG text can't be measured before render; a per-glyph estimate is close enough for a short badge.
  const badgeW = Math.round(text.length * fontSize * 0.58 + 18);
  const badgeH = fontSize + 10;
  const badgeY = r + 10;
  const interactive = !!onClick && !locked;
  const ariaLabel = locked ? `${name} (${LOCKED_TEXT[loc]})` : name;

  // Keep the whole marker -- glow on top, label below -- inside the visible part of the image.
  let px = cx;
  let py = cy;
  if (visible) {
    const above = r * 1.9 * scale;
    const below = (badgeY + badgeH) * scale;
    const side = Math.max(r * 1.9, badgeW / 2) * scale;
    px = clamp(cx, visible.x0 + side, visible.x1 - side);
    py = clamp(cy, visible.y0 + above, visible.y1 - below);
  }

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onClick?.();
  };

  return (
    <g transform={`translate(${px} ${py}) scale(${scale})`}>
      <g
        className={`gz-gate ${interactive ? "gz-gate--interactive" : ""}`}
        style={{ animationDelay: `${gate.y * -0.03}s`, pointerEvents: interactive ? "auto" : "none" }}
        {...(interactive
          ? { role: "button", tabIndex: 0, "aria-label": ariaLabel, onClick, onKeyDown }
          : { role: "img", "aria-label": ariaLabel })}
      >
        {/* soft glow + pulsing rings */}
        <circle r={r * 1.9} fill={glow} opacity={0.18} />
        <circle r={r} fill="none" stroke={glow} strokeWidth={isBoss ? 3 : 2} className={isBoss ? "gz-boss-ring" : "gz-pulse"} />
        <circle r={r} fill="none" stroke={glow} strokeWidth={isBoss ? 3 : 2} className={isBoss ? "gz-boss-ring gz-gate-ring-2" : "gz-pulse gz-pulse-2"} />
        {isBoss && <circle r={r + 7} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 5" opacity={0.85} />}

        {/* core badge */}
        <circle r={r} fill={color} stroke="#0c0a09" strokeOpacity={0.6} strokeWidth={2.5} />
        <circle r={r - 3.5} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={1.5} />
        {gate.id === "entry" && <DoorIcon />}
        {gate.id === "exit" && <g opacity={locked ? 0.45 : 1}><ArrowUpIcon /></g>}
        {isBoss && <SwordsIcon />}
        {locked && (
          <g transform={`translate(${r * 0.75} ${-r * 0.75})`}>
            <LockIcon />
          </g>
        )}

        {/* label */}
        <g transform={`translate(0 ${badgeY})`}>
          <rect
            x={-badgeW / 2}
            y={0}
            width={badgeW}
            height={badgeH}
            rx={badgeH / 2}
            fill="#0c0a09"
            fillOpacity={0.72}
            stroke={glow}
            strokeOpacity={0.45}
            strokeWidth={1}
          />
          <text
            x={0}
            y={badgeH / 2}
            dominantBaseline="central"
            textAnchor="middle"
            fontSize={fontSize}
            fontWeight={700}
            fill={isBoss ? "#fecaca" : "#fef3c7"}
            direction={loc === "ar" ? "rtl" : "ltr"}
          >
            {text}
          </text>
        </g>
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
  }, [land.image]);

  // Markers are drawn in a 1000-unit space spanning the image width.
  const scale = w / 1000;

  // "slice" scales the image by the larger ratio and centres it; s converts screen px to viewBox units.
  let visible: VisibleBox | null = null;
  if (box && box.cw > 0 && box.ch > 0) {
    const s = Math.max(box.cw / w, box.ch / h);
    const visW = box.cw / s;
    const visH = box.ch / s;
    const x0 = (w - visW) / 2;
    const y0 = (h - visH) / 2;
    visible = {
      x0: x0 + SAFE_EDGE_PX / s,
      x1: x0 + visW - SAFE_EDGE_PX / s,
      y0: y0 + SAFE_TOP_PX / s,
      y1: y0 + visH - SAFE_EDGE_PX / s,
    };
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full transition-opacity duration-300 ease-out"
      style={{ opacity: loaded ? 1 : 0 }}
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
        {land.gates.map((gate) => (
          <GateMarker
            key={gate.id}
            gate={gate}
            lang={lang}
            scale={scale}
            cx={(gate.x / 100) * w}
            cy={(gate.y / 100) * h}
            visible={visible}
            locked={gate.id === "exit" && !bossDefeated}
            onClick={onGateClick ? () => onGateClick(gate.id) : undefined}
          />
        ))}
        {/* challenge locations: to come */}
      </svg>
    </div>
  );
}
