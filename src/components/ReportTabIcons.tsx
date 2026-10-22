import { useEffect, useId } from "react";
import { motion, useAnimationControls, useReducedMotion, type Variants } from "motion/react";

export type ReportTabId = "overview" | "daybyday" | "activity" | "outcomes" | "returns" | "benchmark" | "portfolio" | "path" | "advanced";
type Body = (p: { uid: string }) => JSX.Element;

const OUT = [0.22, 1, 0.36, 1] as const; // soft ease-out
const IN_OUT = [0.65, 0, 0.35, 1] as const;

/** Line drawn from nothing; `o` is its resting opacity. */
const draw = (delay = 0, duration = 0.8, o = 1): Variants => ({
  rest: { pathLength: 1, pathSpacing: 2, opacity: o }, // spacing 2: the dash pattern never repeats, so no stray dot at the far end
  play: { pathLength: [0.001, 1], pathSpacing: 2, opacity: [0, o], transition: { duration, delay, ease: IN_OUT, opacity: { duration: 0.2, delay } } },
});
/** Pops in with a small overshoot. */
const pop = (delay = 0, duration = 0.45): Variants => ({
  rest: { scale: 1, opacity: 1 },
  play: { scale: [0, 1.35, 1], opacity: [0, 1, 1], transition: { duration, delay, ease: OUT } },
});

// Overview: the dashboard tiles light up one after the other.
const Overview: Body = () => (
  <>
    {([[3, 3, 7.5, 9], [13.5, 3, 7.5, 5], [13.5, 11, 7.5, 10], [3, 15, 7.5, 6]] as const).map(([x, y, w, h], i) => (
      <motion.rect key={i} x={x} y={y} width={w} height={h} rx={1.8} fill="currentColor"
        variants={{ rest: { scale: 1, fillOpacity: 0 }, play: { scale: [1, 0.55, 1.1, 1], fillOpacity: [0, 0.45, 0.25, 0], transition: { duration: 0.65, delay: i * 0.08, ease: "easeOut", times: [0, 0.3, 0.65, 1] } } }} />
    ))}
  </>
);

// Day by day: the rings jump like a page turning, the days fill in one by one, today pulses.
const DayByDay: Body = () => (
  <>
    <rect x={3} y={5} width={18} height={16} rx={2.5} />
    <path d="M3 10h18" />
    {[8, 16].map((x, i) => (
      <motion.path key={x} d={`M${x} 3v4`} variants={{ rest: { y: 0 }, play: { y: [0, -1.8, 0.4, 0], transition: { duration: 0.45, delay: i * 0.07, ease: "easeOut" } } }} />
    ))}
    {([[7.5, 14], [12, 14], [16.5, 14], [7.5, 17.6], [12, 17.6], [16.5, 17.6]] as const).map(([cx, cy], i) => (
      <motion.circle key={i} cx={cx} cy={cy} r={1.1} fill="currentColor" stroke="none" variants={pop(0.14 + i * 0.065, 0.35)} />
    ))}
    <motion.circle cx={16.5} cy={17.6} strokeWidth={1.2} variants={{ rest: { r: 1.1, opacity: 0 }, play: { r: [1.1, 1.1, 3.6], opacity: [0, 0.9, 0], transition: { duration: 0.55, delay: 0.52, times: [0, 0.01, 1], ease: "easeOut" } } }} />
  </>
);

// Activity: the pulse line is traced, then beats twice.
const Activity: Body = () => (
  <motion.path d="M2 12.5h3.6l2.5-7 3.9 14 3.3-10.5 2 3.5H22"
    variants={{ rest: { pathLength: 1, pathSpacing: 2, scaleY: 1 }, play: { pathLength: [0.001, 1, 1, 1, 1, 1], pathSpacing: 2, scaleY: [1, 1, 1.24, 0.96, 1.1, 1], transition: { duration: 1.15, times: [0, 0.55, 0.68, 0.78, 0.88, 1], ease: "easeInOut" } } }} />
);

// Trade outcomes: the scale weighs wins against losses, swings and settles. The pans hang from the beam ends.
const TILT = [0, -14, 10, -6, 3, 0];
const SWING = { duration: 1.25, ease: "easeInOut" as const, times: [0, 0.2, 0.42, 0.62, 0.81, 1] };
const beamEnd = (s: 1 | -1) => ({ x: TILT.map((t) => s * 7.5 * (Math.cos((t * Math.PI) / 180) - 1)), y: TILT.map((t) => s * 7.5 * Math.sin((t * Math.PI) / 180)) });
const Outcomes: Body = () => (
  <>
    <path d="M12 6.2v14.3M7.5 20.5h9" />
    <motion.path d="M4.5 7h15" variants={{ rest: { rotate: 0 }, play: { rotate: TILT, transition: SWING } }} />
    <circle cx={12} cy={4.8} r={1.3} fill="currentColor" stroke="none" />
    {([-1, 1] as const).map((s) => (
      <motion.path key={s} d={s < 0 ? "M4.5 7 1.8 14.2c.85.6 1.75.9 2.7.9s1.85-.3 2.7-.9Z" : "M19.5 7l-2.7 7.2c.85.6 1.75.9 2.7.9s1.85-.3 2.7-.9Z"}
        variants={{ rest: { x: 0, y: 0 }, play: { ...beamEnd(s), transition: SWING } }} />
    ))}
  </>
);

// Returns & capital: a coin is tossed into the wallet, the wallet gives under its weight, a new coin appears.
const Returns: Body = ({ uid }) => (
  <>
    <clipPath id={`${uid}c`}><rect x={-4} y={-4} width={32} height={11.2} /></clipPath>
    <g clipPath={`url(#${uid}c)`}>
      <motion.g variants={{ rest: { y: 0, scale: 1, opacity: 1 }, play: { y: [0, -1.4, 8, 8, 0, 0, 0], scale: [1, 1, 1, 0, 0, 1.15, 1], opacity: [1, 1, 1, 0, 1, 1, 1], transition: { duration: 1.25, times: [0, 0.16, 0.46, 0.5, 0.62, 0.84, 1], ease: "easeInOut" } } }}>
        <circle cx={12} cy={3.6} r={2.3} />
        <path d="M12 2.6v2" />
      </motion.g>
    </g>
    <motion.g style={{ originY: 1 }} variants={{ rest: { scaleY: 1 }, play: { scaleY: [1, 1, 0.9, 1.04, 1, 1], transition: { duration: 1.25, times: [0, 0.4, 0.5, 0.64, 0.8, 1], ease: "easeOut" } } }}>
      <path d="M3 9.5A2.5 2.5 0 0 1 5.5 7h13A2.5 2.5 0 0 1 21 9.5v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18Z" />
      <path d="M21 11.5h-3.4a2 2 0 0 0 0 4H21" />
      <circle cx={17.6} cy={13.5} r={0.55} fill="currentColor" stroke="none" />
    </motion.g>
  </>
);

// Benchmark & market: your curve and the market's are drawn together; yours finishes on top.
const Benchmark: Body = () => (
  <>
    <path d="M3 20.5h18" strokeWidth={1.3} opacity={0.45} />
    <motion.path d="M3 10.5c4 0 5.5 3 9 2.5s5.5-2 9-1" strokeWidth={1.5} variants={draw(0, 0.85, 0.5)} />
    <motion.path d="M3 17c4-.5 5.5-4.5 9-5.5s5.5-5 9-6" variants={draw(0.08, 0.85)} />
    <motion.circle cx={21} cy={5.5} r={1.7} fill="currentColor" stroke="none" variants={pop(0.88)} />
  </>
);

// Portfolio: the pie is drawn round and its highlighted slice steps out.
const Portfolio: Body = () => (
  <>
    <motion.path d="M11 13h8a8 8 0 1 1-8-8Z" variants={draw(0, 0.85)} />
    <motion.path d="m11 13-5.66 5.66" variants={draw(0.6, 0.3)} />
    <motion.path d="M13 11V3a8 8 0 0 1 8 8Z" fill="currentColor"
      variants={{ rest: { x: 0, y: 0, fillOpacity: 0.16 }, play: { x: [0, 2, 0], y: [0, -2, 0], fillOpacity: [0.16, 0.45, 0.16], transition: { duration: 0.75, delay: 0.42, ease: "easeInOut" } } }} />
  </>
);

// Trade path: a dot rides the route from the entry ring to the exit ring, which lights up on arrival.
// The route: two straight runs joined by two half turns (radius 3.25); positions are sampled on the same easing as the drawing.
const TURN = 3.25, RUNS = [7.3, Math.PI * TURN, 6, Math.PI * TURN, 7.3], ROUTE = RUNS.reduce((a, b) => a + b, 0);
function routeAt(s: number): [number, number] {
  if (s <= RUNS[0]) return [7.7 + s, 18.5];
  s -= RUNS[0];
  if (s <= RUNS[1]) { const a = Math.PI / 2 - s / TURN; return [15 + TURN * Math.cos(a), 15.25 + TURN * Math.sin(a)]; }
  s -= RUNS[1];
  if (s <= RUNS[2]) return [15 - s, 12];
  s -= RUNS[2];
  if (s <= RUNS[3]) { const a = Math.PI / 2 + s / TURN; return [9 + TURN * Math.cos(a), 8.75 + TURN * Math.sin(a)]; }
  s -= RUNS[3];
  return [9 + Math.min(s, RUNS[4]), 5.5];
}
const SAMPLES = 30, RIDE = 1;
const DONE = Array.from({ length: SAMPLES + 1 }, (_, i) => { const t = i / SAMPLES; return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; });
const AT = DONE.map((f) => routeAt(f * ROUTE));
const TradePath: Body = () => (
  <>
    <circle cx={5.5} cy={18.5} r={2.2} />
    <motion.path d="M7.7 18.5H15a3.25 3.25 0 0 0 0-6.5H9a3.25 3.25 0 0 1 0-6.5h7.3" variants={{ rest: { pathLength: 1, pathSpacing: 2 }, play: { pathLength: DONE.map((f) => Math.max(f, 0.001)), pathSpacing: 2, transition: { duration: RIDE, ease: "linear" } } }} />
    <motion.circle cx={18.5} cy={5.5} r={2.2} fill="currentColor"
      variants={{ rest: { fillOpacity: 0, scale: 1 }, play: { fillOpacity: [0, 1, 1, 0], scale: [1, 1.3, 1, 1], transition: { duration: 1, delay: RIDE - 0.05, times: [0, 0.2, 0.7, 1], ease: "easeOut" } } }} />
    <motion.circle r={1.5} fill="currentColor" stroke="none"
      variants={{ rest: { cx: AT[SAMPLES][0], cy: AT[SAMPLES][1], opacity: 0 }, play: { cx: AT.map((p) => p[0]), cy: AT.map((p) => p[1]), opacity: [0, 1, 1, 1, 1, 1, 1, 1, 0], transition: { duration: RIDE, ease: "linear" } } }} />
  </>
);

// Advanced statistics: the histogram builds up bar by bar, the bell curve is fitted over it, its peak sparks.
const BELL = "M2 19.3C7 19.3 8 6 12 6s5 13.3 10 13.3";
const Advanced: Body = () => (
  <>
    {([[7, 15.2], [10.65, 8.25], [14.3, 15.2]] as const).map(([x, top], i) => (
      <motion.rect key={x} x={x} y={top} width={2.7} height={19.6 - top} rx={0.6} fill="currentColor" fillOpacity={0.4} stroke="none" style={{ originY: 1 }}
        variants={{ rest: { scaleY: 1 }, play: { scaleY: [0, 1], transition: { duration: 0.45, delay: i * 0.09, ease: OUT } } }} />
    ))}
    <path d="M1.5 20.5h21" strokeWidth={1.3} opacity={0.45} />
    <motion.path d={BELL} variants={draw(0.32, 0.8)} />
    <motion.circle cx={12} cy={6} r={1.4} fill="currentColor" stroke="none"
      variants={{ rest: { scale: 0, opacity: 0 }, play: { scale: [0, 1.4, 1, 0], opacity: [0, 1, 1, 0], transition: { duration: 0.7, delay: 1.02, times: [0, 0.3, 0.65, 1], ease: "easeOut" } } }} />
  </>
);

const BODIES: Record<ReportTabId, Body> = { overview: Overview, daybyday: DayByDay, activity: Activity, outcomes: Outcomes, returns: Returns, benchmark: Benchmark, portfolio: Portfolio, path: TradePath, advanced: Advanced };

/** Icon of a Reports section. Its motion plays each time `play` grows (hover, selection), never under reduced motion. */
export default function TabIcon({ id, play, size = 22 }: { id: ReportTabId; play: number; size?: number }) {
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const uid = "rti" + useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => { if (play > 0 && !reduce) void controls.start("play"); }, [play]); // eslint-disable-line react-hooks/exhaustive-deps
  const B = BODIES[id];
  return (
    <motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" overflow="visible" aria-hidden="true" initial="rest" animate={controls}>
      <B uid={uid} />
    </motion.svg>
  );
}
