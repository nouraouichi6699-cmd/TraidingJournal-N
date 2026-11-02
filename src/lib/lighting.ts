// The arithmetic behind the ambient lighting: which colours a curtain is graded in, how strong and how fast
// everything runs, and which session is open. Pure, so lighting.test.ts can hold it to its numbers; the drawing
// itself lives in components/Ambient.tsx.
//
// Every constant here was tuned by eye with the customer over many rounds. They are copied from the design sheet
// rather than re-derived, and changing one changes what the aurora looks like.
import { sessionAt, type SessionBounds, type SessionKey } from "./tradingTime";
import { SESSION_TRIO } from "./sessionColors";

export type LightStyle = "aurora" | "police" | "orbs" | "off";
export type LightColor = "rgb" | "gold" | "blue" | "violet" | "green" | "custom" | "session";
export type LightSpeed = "slow" | "normal" | "fast";

export interface Trio { a: string; b: string; c: string }

/** A colour as "r,g,b", which is the form the gradients are built from. */
export type Rgb = string;

/** The fixed choices. The RGB and session entries are blank: they build their colours another way. */
export const FIXED: Record<LightColor, Rgb> = {
  rgb: "", gold: "242,193,78", blue: "90,184,240", violet: "167,139,250", green: "52,211,153", custom: "", session: "",
};

/** The swatch each fixed choice shows in the panel. */
export const SWATCH: Record<string, string> = { gold: "#f2c14e", blue: "#5ab8f0", violet: "#a78bfa", green: "#34d399" };

export const DEFAULT_CUSTOM: Trio = { a: "#4dffa0", b: "#38d8ff", c: "#b56bff" };

export const hexRgb = (h: string): Rgb => {
  const n = parseInt(String(h).slice(1), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(",");
};

/** Towards white by k (0..1): how a shade is brightened for a curtain's rim. */
export const lift = (rgb: Rgb, k: number): Rgb =>
  rgb.split(",").map((v) => { const n = Number(v); return Math.round(n + (255 - n) * k); }).join(",");

const rgba = (rgb: Rgb, k: number, a: number) => `rgba(${lift(rgb, k)},${a})`;

/** One stop of a curtain's height gradient: how far down it sits, and the colour there. */
export type Stop = [number, string];

/**
 * A curtain graded by height, top of the curtain first: faint tips, a middle, the body, then the bright lower rim
 * and a short fade under it. This shape is what makes it read as a hanging sheet rather than a band.
 */
export const strip = (tip: Rgb, mid: Rgb, body: Rgb, rim: Rgb): Stop[] => [
  [0, rgba(tip, 0, 0)],
  [0.3, rgba(tip, 0, 0.22)],
  [0.55, rgba(mid, 0, 0.5)],
  [0.82, rgba(body, 0, 0.85)],
  [0.92, rgba(rim, 0, 1)],
  [0.97, rgba(body, 0, 0.35)],
  [1, rgba(body, 0, 0)],
];

/** How far down, and how transparent, a single-colour curtain is at each stop. */
const ONE_K = [0.3, 0.3, 0.1, 0, 0.75, 0, 0];
const ONE_A = [0, 0.22, 0.5, 0.85, 1, 0.35, 0];
const TWO_K = [0.5, 0.5, 0.25, 0.1, 0.8, 0.1, 0.1];
const TWO_A = [0, 0.2, 0.45, 0.8, 0.95, 0.3, 0.1];

const oneColour = (c: Rgb): Stop[][] => [
  strip(c, c, c, c).map((s, i) => [s[0], rgba(c, ONE_K[i], ONE_A[i])] as Stop),
  strip(c, c, c, c).map((s, i) => [s[0], rgba(c, TWO_K[i], TWO_A[i])] as Stop),
];

/**
 * The two curtain gradients a light setting needs.
 *  - "rgb" is what a real aurora looks like: violet or pink tips, a teal middle, a green body, a green-white rim.
 *  - three own colours, or a session's three, grade from the tips down to a brightened version of the lower one.
 *  - a single colour gives the same grading in shades of itself.
 */
export function buildPalette(color: LightColor, trio: Trio): Stop[][] {
  if (color === "rgb") {
    return [
      strip("160,80,255", "60,210,210", "70,255,160", "215,255,230"),
      strip("255,80,190", "150,100,255", "60,240,190", "205,255,235"),
    ];
  }
  if (color === "custom" || color === "session") {
    const [A, B, C] = [hexRgb(trio.a), hexRgb(trio.b), hexRgb(trio.c)];
    return [
      strip(C, B, A, lift(A, 0.7)),
      strip(C, lift(B, 0.15), A, lift(A, 0.75)),
    ];
  }
  return oneColour(FIXED[color] || FIXED.gold);
}

/** What rebuilding the gradients depends on: while this is unchanged the strips are reused as they are. */
export const paletteKey = (color: LightColor, trio: Trio): string =>
  color === "custom" || color === "session" ? `${color}|${trio.a}|${trio.b}|${trio.c}` : color;

// ---------- strength ----------

export const clampLevel = (level: number): number =>
  Number.isFinite(level) ? Math.max(20, Math.min(100, Math.round(level))) : 70;

/** 0..1 across the usable range, which every strength below is scaled by. */
export const levelT = (level: number): number => clampLevel(level) / 100;

export const auroraAlpha = (level: number): number => 0.35 + 0.65 * levelT(level);
export const orbSpread = (level: number): number => Math.round(55 + 15 * levelT(level));
export const policeAlpha = (level: number): number => 0.25 + 0.6 * levelT(level);
/** The three scattered orbs, brightest first. */
export const orbAlpha = (level: number): [number, number, number] => {
  const t = levelT(level);
  return [0.15 + 0.6 * t, 0.12 + 0.5 * t, 0.08 + 0.42 * t];
};

// ---------- speed ----------

/** One factor stretches or shortens every animation at once. */
export const SPEED_FACTOR: Record<LightSpeed, number> = { slow: 1.8, normal: 1, fast: 0.5 };
export const speedFactor = (speed: LightSpeed): number => SPEED_FACTOR[speed] ?? 1;
/** Seconds a CSS animation should take, at the chosen speed. */
export const dur = (seconds: number, speed: LightSpeed): string => `${(seconds * speedFactor(speed)).toFixed(1)}s`;

/** Seconds one red-and-blue cycle takes. */
export const POLICE_SECONDS: Record<LightSpeed, number> = { slow: 2.8, normal: 2, fast: 1.5 };
/** The cycle brightens twice, once for each colour. */
export const FLASHES_PER_CYCLE = 2;
/**
 * How many flashes land in a second. Kept well under three: three or more per second is the rate that can set off
 * a photosensitive seizure, so this is a safety limit and not a matter of taste.
 */
export const policeFlashesPerSecond = (speed: LightSpeed): number =>
  FLASHES_PER_CYCLE / (POLICE_SECONDS[speed] ?? POLICE_SECONDS.normal);

export const SAFE_FLASHES_PER_SECOND = 3;

// ---------- the session colour ----------

/** The session open at that moment, under the customer's own boundaries. */
export const sessionNow = (atMs: number, bounds: SessionBounds): SessionKey =>
  sessionAt(new Date(atMs).getUTCHours(), bounds);

/** The three shades the aurora takes while a session is open. */
export const sessionTrio = (key: SessionKey): Trio => SESSION_TRIO[key];

/** The whole lighting setting, as it is stored. */
export interface Lighting {
  style: LightStyle;
  color: LightColor;
  custom: Trio;
  /** 20..100. */
  level: number;
  speed: LightSpeed;
  playing: boolean;
}

export const DEFAULT_LIGHTING: Lighting = {
  style: "aurora",
  color: "rgb",
  custom: DEFAULT_CUSTOM,
  level: 70,
  speed: "normal",
  playing: true,
};
