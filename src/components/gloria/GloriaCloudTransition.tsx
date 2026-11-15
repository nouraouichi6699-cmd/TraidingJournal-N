// GLORIA_RPG: the cloud curtain between the world map and a land. Toggling `active` on sweeps eight soft clouds
// in from every edge until the game area is white (`onFullyCovered` -- swap the scene underneath now); toggling
// it off drifts them apart to new edges and fades them (`onFullyCleared`). Covers only its positioned parent
// (the game area between the top bar and the HUD) and never takes pointer events.
//
// All motion is CSS keyframes on transform/opacity; each cloud's path comes in through CSS variables. Callbacks
// run on setTimeout so they fire on schedule even if an animation is skipped.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./gloria.css";

/** Delay between consecutive clouds, and how long each cloud's move takes (ms). */
const STAGGER_MS = 60;
const CLOUD_MS = 500;

interface Cloud {
  /** Resting centre, as a percentage of the game area. */
  x: number;
  y: number;
  /** Diameter in vmax: big enough that eight blurred clouds close over any screen shape. */
  size: number;
  /** Where it flies in from / leaves to, as a translate in % of its own size (±120% puts it off-screen). */
  from: [number, number];
  to: [number, number];
  rot: number;
  opacity: number;
  color: string;
}

// Fixed "random" layout: it looks scattered but never reshuffles between transitions.
const CLOUDS: Cloud[] = [
  { x: 18, y: 22, size: 58, from: [-120, 0], to: [0, -120], rot: -8, opacity: 0.92, color: "#f5f5f5" },
  { x: 52, y: 14, size: 52, from: [0, -120], to: [120, 0], rot: 12, opacity: 0.85, color: "#f5f5f5" },
  { x: 84, y: 26, size: 62, from: [120, 0], to: [0, -120], rot: 5, opacity: 0.9, color: "#f5f5f5" },
  { x: 12, y: 72, size: 60, from: [0, 120], to: [-120, 0], rot: 15, opacity: 0.88, color: "#f5f5f5" },
  { x: 48, y: 50, size: 72, from: [-120, 0], to: [0, 120], rot: -4, opacity: 0.95, color: "#fff8e7" },
  { x: 86, y: 74, size: 58, from: [0, 120], to: [120, 0], rot: -12, opacity: 0.8, color: "#f5f5f5" },
  { x: 50, y: 88, size: 54, from: [120, 0], to: [-120, 0], rot: 8, opacity: 0.75, color: "#f5f5f5" },
  { x: 30, y: 46, size: 50, from: [0, -120], to: [0, 120], rot: -15, opacity: 0.7, color: "#f5f5f5" },
];

/** Time from toggling until the last cloud has arrived / left. */
export const CLOUD_TOTAL_MS = STAGGER_MS * (CLOUDS.length - 1) + CLOUD_MS;

/** The OS setting or the app's own "Reduce motion" switch (useSettings puts it on <html>). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.getAttribute("data-reduce-motion") === "1" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

type Stage = "idle" | "in" | "out";

interface Props {
  active: boolean;
  onFullyCovered: () => void;
  onFullyCleared: () => void;
}

export default function GloriaCloudTransition({ active, onFullyCovered, onFullyCleared }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  // The callbacks change every render of the parent; the timers always call the latest ones.
  const callbacks = useRef({ onFullyCovered, onFullyCleared });
  useEffect(() => {
    callbacks.current = { onFullyCovered, onFullyCleared };
  });

  const wasActive = useRef(false);
  useEffect(() => {
    const ms = prefersReducedMotion() ? 0 : CLOUD_TOTAL_MS;
    if (active) {
      wasActive.current = true;
      setStage("in");
      const timer = window.setTimeout(() => callbacks.current.onFullyCovered(), ms);
      return () => window.clearTimeout(timer);
    }
    if (!wasActive.current) return;
    setStage("out");
    const timer = window.setTimeout(() => {
      wasActive.current = false;
      setStage("idle");
      callbacks.current.onFullyCleared();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (stage === "idle" || prefersReducedMotion()) return null;

  return (
    <div className={`gz-tc gz-tc--${stage}`} aria-hidden>
      {/* A flat veil under the clouds guarantees the swap underneath is never visible through a gap. */}
      <div className="gz-tc-veil" style={{ "--gz-tc-ms": `${CLOUD_TOTAL_MS}ms` } as CSSProperties} />
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="gz-tc-cloud"
          style={
            {
              left: `calc(${c.x}% - ${c.size / 2}vmax)`,
              top: `calc(${c.y}% - ${c.size / 2}vmax)`,
              width: `${c.size}vmax`,
              height: `${c.size * 0.72}vmax`,
              background: c.color,
              animationDelay: `${i * STAGGER_MS}ms`,
              animationDuration: `${CLOUD_MS}ms`,
              "--gz-tc-from-x": `${c.from[0]}%`,
              "--gz-tc-from-y": `${c.from[1]}%`,
              "--gz-tc-to-x": `${c.to[0]}%`,
              "--gz-tc-to-y": `${c.to[1]}%`,
              "--gz-tc-rot": `${c.rot}deg`,
              "--gz-tc-op": c.opacity,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
