// The arithmetic behind the ambient lighting: which colours a curtain is graded in, how strong and how fast
// everything runs, and which session is open. Pure, so lighting.test.ts can hold it to its numbers; the drawing
// itself lives in components/Ambient.tsx.
//
// Every constant here was tuned by eye with the customer over many rounds. They are copied from the design sheet
// rather than re-derived, and changing one changes what the aurora looks like.
import { sessionAt, type SessionBounds, type SessionKey } from "./tradingTime";
import { SESSION_TRIO } from "./sessionColors";
import type { Theme } from "../types";

export type LightStyle = "aurora" | "police" | "orbs" | "full" | "off";
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

// ---------- the full-colour background ----------

/**
 * Each theme's page colour and the two inks that have to stay readable on it, mirrored from index.css.
 *
 * They are literals for the same reason the theme preview cards are: a pure function cannot read a CSS variable,
 * and the whole point of the guard below is that it can be tested without a browser.
 */
export const THEME_INK: Record<Theme, { bg: string; text: string; muted: string }> = {
  dark: { bg: "#061126", text: "#ffffff", muted: "#a9b8d6" },
  light: { bg: "#f3f5fa", text: "#0a1a3f", muted: "#4b5a7d" },
  black: { bg: "#000000", text: "#ffffff", muted: "#9a9a9a" },
};

/** WCAG AA for body text. Not a matter of taste: below this the text stops being readable for some people. */
export const AA_CONTRAST = 4.5;

const srgb = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const triple = (hex: string): [number, number, number] => {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
};

export const relLuminance = (hex: string): number => {
  const [r, g, b] = triple(hex);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
};

/** The WCAG ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a), lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** `t` of the tint over the base, channel by channel. 0 is the base untouched, 1 is the tint alone. */
export function mixHex(base: string, tint: string, t: number): string {
  const k = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const [br, bg, bb] = triple(base);
  const [tr, tg, tb] = triple(tint);
  return `#${hex2(br + (tr - br) * k)}${hex2(bg + (tg - bg) * k)}${hex2(bb + (tb - bb) * k)}`;
}

/**
 * How much of the tint a theme can take before its text stops being readable.
 *
 * It walks up from nothing and stops at the first share that would break AA for either the body or the muted ink, so
 * what it returns is reachable from zero without passing through anything unreadable. That matters more than finding
 * some larger share further up: a slider has to behave along its whole travel, not only at the end.
 */
export function maxReadableMix(theme: Theme, tint: string, step = 0.01): number {
  const ink = THEME_INK[theme] ?? THEME_INK.dark;
  let best = 0;
  for (let t = 0; t <= 1 + 1e-9; t += step) {
    const bg = mixHex(ink.bg, tint, t);
    if (contrastRatio(ink.text, bg) < AA_CONTRAST || contrastRatio(ink.muted, bg) < AA_CONTRAST) break;
    best = Math.min(1, t);
  }
  return best;
}

/**
 * The colour to paint behind the page, and the share of the tint it actually used.
 *
 * The strength runs across what the theme can take rather than straight from 0 to 1: at 100% the background is as
 * strong as it can be while the text still reads, and every step below does something. A bright tint in a dark theme
 * has a low ceiling, so the same 100% means a gentler wash there than it does in Ivory.
 */
export function fullColourBg(theme: Theme, tint: string, level: number): { color: string; mix: number } {
  const ceiling = maxReadableMix(theme, tint);
  const mix = ceiling * (clampLevel(level) / 100);
  return { color: mixHex(THEME_INK[theme]?.bg ?? THEME_INK.dark.bg, tint, mix), mix };
}

/** The colours this style offers: the plain swatches, the session, and one colour of the customer's own. */
export const FULL_COLORS: LightColor[] = ["gold", "blue", "violet", "green", "session", "custom"];

/** The whole lighting setting, as it is stored. */
export interface Lighting {
  style: LightStyle;
  color: LightColor;
  custom: Trio;
  /** 20..100. */
  level: number;
  speed: LightSpeed;
  playing: boolean;
  /** The one colour the full-colour background uses, kept apart so it cannot disturb the aurora's three. */
  solid: string;
}

export const DEFAULT_LIGHTING: Lighting = {
  style: "aurora",
  color: "rgb",
  custom: DEFAULT_CUSTOM,
  level: 70,
  speed: "normal",
  playing: true,
  solid: "#4dffa0",
};
