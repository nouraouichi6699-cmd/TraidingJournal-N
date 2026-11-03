// The arithmetic behind the ambient lighting: which colours a curtain is graded in, how strong and how fast
// everything runs, and which session is open. Pure, so lighting.test.ts can hold it to its numbers; the drawing
// itself lives in components/Ambient.tsx.
//
// Every constant here was tuned by eye with the customer over many rounds. They are copied from the design sheet
// rather than re-derived, and changing one changes what the aurora looks like.
import { sessionAt, type SessionBounds, type SessionKey } from "./tradingTime";
import { SESSION_TRIO } from "./sessionColors";
import type { Theme } from "../types";

export type LightStyle = "full" | "off";
export type LightColor = "rgb" | "gold" | "blue" | "violet" | "green" | "custom" | "solid" | "session";
export type LightSpeed = "slow" | "normal" | "fast";

export interface Trio { a: string; b: string; c: string }

/** The swatch each fixed choice shows in the panel. */
export const SWATCH: Record<string, string> = { gold: "#f2c14e", blue: "#5ab8f0", violet: "#a78bfa", green: "#34d399" };

export const DEFAULT_CUSTOM: Trio = { a: "#4dffa0", b: "#38d8ff", c: "#b56bff" };

// ---------- strength ----------

export const clampLevel = (level: number): number =>
  Number.isFinite(level) ? Math.max(20, Math.min(100, Math.round(level))) : 70;

/** 0..1 across the usable range, which every strength below is scaled by. */
export const levelT = (level: number): number => clampLevel(level) / 100;

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

// ---------- the cards colour ----------

/**
 * The surface family, mirrored from index.css: the surface itself, and the colours that are drawn as literals next
 * to it. The ones that already read var(--surface) or var(--card-bg) are left out on purpose, because they follow
 * the tint on their own - Ivory's card background is a gradient over the surface and has to keep being one.
 */
export const SURFACE_FAMILY: Record<Theme, { surface: string; companions: Record<string, string> }> = {
  dark: {
    surface: "#000e2e",
    // --gauge-bg is var(--card-bg) here, so it follows.
    companions: { "--card-bg": "#031031", "--gauge-track": "#112454", "--border": "#122657", "--skeleton": "#061841" },
  },
  light: {
    surface: "#ffffff",
    // --card-bg is a gradient over the surface and --gauge-bg is the surface, so both follow.
    companions: { "--gauge-track": "#e3e7f0", "--border": "#dbe1ee", "--skeleton": "#e8ecf5" },
  },
  black: {
    surface: "#0a0a0a",
    companions: { "--card-bg": "#000000", "--gauge-bg": "#000000", "--gauge-track": "#2a2a2a", "--border": "#1f1f1f", "--skeleton": "#151515" },
  },
};

/** The five things that have to stay legible on a card. */
export const SURFACE_INK: Record<Theme, { text: string; muted: string; primary: string; profit: string; loss: string }> = {
  dark: { text: "#ffffff", muted: "#a9b8d6", primary: "#e6b84a", profit: "#e6b84a", loss: "#f87171" },
  light: { text: "#0a1a3f", muted: "#4b5a7d", primary: "#0a1f5c", profit: "#946900", loss: "#b91c1c" },
  black: { text: "#ffffff", muted: "#9a9a9a", primary: "#f5b83d", profit: "#f5b83d", loss: "#f87171" },
};

/** WCAG for something that is not text: an outline, a bar, a dot. */
export const AA_LARGE = 3;

/** Generic readability check: text and muted at 4.5:1, gold / profit / loss at 3:1. */
export function inkReadable(
  ink: { text: string; muted: string; primary: string; profit: string; loss: string },
  bg: string,
): boolean {
  return contrastRatio(ink.text, bg) >= AA_CONTRAST
    && contrastRatio(ink.muted, bg) >= AA_CONTRAST
    && contrastRatio(ink.primary, bg) >= AA_LARGE
    && contrastRatio(ink.profit, bg) >= AA_LARGE
    && contrastRatio(ink.loss, bg) >= AA_LARGE;
}

/** True while the theme's own ink still reads on that background. */
export function surfaceReadable(theme: Theme, bg: string): boolean {
  return inkReadable(SURFACE_INK[theme] ?? SURFACE_INK.dark, bg);
}

/** As much of the tint as a card can take while all five still read. Walks up and stops at the first failure. */
export function maxReadableSurfaceMix(theme: Theme, tint: string, step = 0.01): number {
  const base = (SURFACE_FAMILY[theme] ?? SURFACE_FAMILY.dark).surface;
  let best = 0;
  for (let t = 0; t <= 1 + 1e-9; t += step) {
    if (!surfaceReadable(theme, mixHex(base, tint, t))) break;
    best = Math.min(1, t);
  }
  return best;
}

/**
 * A companion colour put back the same distance from the tinted surface that it sits from the plain one.
 *
 * Mixing it towards the tint along with the surface would pull the two together and fade the hairline; keeping the
 * distance keeps a border exactly as visible as it is today. When the tint is close enough to black or white that
 * the distance would run off the end, it is applied the other way instead, which keeps the separation rather than
 * flattening it against the edge.
 */
export function offsetFrom(tintedSurface: string, plainSurface: string, companion: string): string {
  const [tr, tg, tb] = triple(tintedSurface);
  const [sr, sg, sb] = triple(plainSurface);
  const [cr, cg, cb] = triple(companion);
  const off: [number, number, number] = [cr - sr, cg - sg, cb - sb];
  const fits = (sign: number) => off.every((d, i) => {
    const v = [tr, tg, tb][i] + sign * d;
    return v >= 0 && v <= 255;
  });
  const sign = fits(1) ? 1 : fits(-1) ? -1 : 1; // both off the end: clamp, which only happens at the very extremes
  return `#${hex2(tr + sign * off[0])}${hex2(tg + sign * off[1])}${hex2(tb + sign * off[2])}`;
}

/**
 * Every variable the cards colour writes, and the share of the tint used. The surface is tinted and each literal of
 * its family is rebuilt from it, so the whole set moves together.
 */
export function surfaceVars(theme: Theme, tint: string, level: number): { vars: Record<string, string>; mix: number } {
  const family = SURFACE_FAMILY[theme] ?? SURFACE_FAMILY.dark;
  const mix = maxReadableSurfaceMix(theme, tint) * (clampLevel(level) / 100);
  const surface = mixHex(family.surface, tint, mix);
  const vars: Record<string, string> = { "--surface": surface };
  for (const [name, value] of Object.entries(family.companions)) {
    vars[name] = offsetFrom(surface, family.surface, value);
  }
  return { vars, mix };
}

/** The variable names the cards colour ever touches, so they can all be taken off again. */
export const SURFACE_VAR_NAMES: string[] = [
  "--surface",
  ...Array.from(new Set(Object.values(SURFACE_FAMILY).flatMap((f) => Object.keys(f.companions)))),
];

/** "theme" is the untouched look; the rest are the colours on offer. */
export type CardColor = "theme" | "gold" | "blue" | "violet" | "green" | "session" | "custom";
export const CARD_COLORS: CardColor[] = ["theme", "gold", "blue", "violet", "green", "session", "custom"];

// ---------- automatic ink: light and dark ----------

export type InkChoice = "light" | "dark";

/**
 * The dark ink for strongly tinted surfaces: dark text, a deeper gold (stays in the gold family, never navy),
 * and a deeper red. These are the five inks the guard checks.
 */
export const DARK_SURFACE_INK = {
  text: "#0a1a3f", muted: "#374257", primary: "#7a5600", profit: "#7a5600", loss: "#b91c1c",
};

/**
 * Every CSS variable the dark ink overrides inside surface containers. The five guard inks, the gold family
 * (primary, primary-2, on-primary, accent, icon, gauge-arc, c-gold), the derived colours (primary-tint,
 * chart-grid, chart-axis, gauge-glow), and the seven tone colours in their Ivory-dark form.
 *
 * --bg is dynamic (offset from the tinted surface) and is added by cardSurface rather than listed here.
 */
export const DARK_INK_VARS: Record<string, string> = {
  "--text": "#0a1a3f",
  "--muted": "#374257",
  "--primary": "#7a5600",
  "--primary-2": "#5c4100",
  "--on-primary": "#ffffff",
  "--accent": "#6b4b00",
  "--icon": "#7a5600",
  "--profit": "#7a5600",
  "--loss": "#b91c1c",
  "--primary-tint": "rgba(122,86,0,.14)",
  "--chart-grid": "rgba(55,66,87,.14)",
  "--chart-axis": "rgba(55,66,87,.3)",
  "--gauge-arc": "#7a5600",
  "--gauge-glow": "none",
  "--c-gold": "#7a5600",
  "--c-sky": "#0369a1",
  "--c-rose": "#be123c",
  "--c-violet": "#6d28d9",
  "--c-emerald": "#047857",
  "--c-indigo": "#4338ca",
  "--c-amber": "#c2410c",
  "--c-slate": "#475569",
};

/** The variable names the dark ink ever touches, including the dynamic --bg. */
export const INK_VAR_NAMES: string[] = [...Object.keys(DARK_INK_VARS), "--bg"];

/** One readable range for a given ink. */
export interface Band { ink: InkChoice; from: number; to: number }

/**
 * The readable ranges for a tint across a theme's surface, using both the theme's own ink (light)
 * and the universal dark ink. Light ink is preferred where both pass.
 *
 * Returns ordered, non-overlapping bands. There can be an unreadable gap between the light and dark ranges.
 */
export function readableBands(theme: Theme, tint: string, step = 0.01): Band[] {
  const base = (SURFACE_FAMILY[theme] ?? SURFACE_FAMILY.dark).surface;
  const lightInk = SURFACE_INK[theme] ?? SURFACE_INK.dark;
  const bands: Band[] = [];
  let current: Band | null = null;

  for (let t = 0; t <= 1 + 1e-9; t += step) {
    const tt = Math.min(1, t);
    const bg = mixHex(base, tint, tt);
    const lightOk = inkReadable(lightInk, bg);
    const darkOk = inkReadable(DARK_SURFACE_INK, bg);
    const ink: InkChoice | null = lightOk ? "light" : darkOk ? "dark" : null;

    if (ink) {
      if (current && current.ink === ink) {
        current.to = tt;
      } else {
        if (current) bands.push(current);
        current = { ink, from: tt, to: tt };
      }
    } else {
      if (current) { bands.push(current); current = null; }
    }
  }
  if (current) bands.push(current);
  return bands;
}

/**
 * Where the slider lands in the bands: maps a 20..100 level linearly across the total readable length,
 * skipping any unreadable gap, so every slider position is readable and 100% reaches the top of the
 * last band.
 */
export function bandAt(bands: Band[], level: number): { ink: InkChoice; mix: number } | null {
  if (!bands.length) return null;
  const lengths = bands.map(b => b.to - b.from);
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 0) return { ink: bands[0].ink, mix: bands[0].from };

  const target = total * (clampLevel(level) / 100);
  let acc = 0;
  for (let i = 0; i < bands.length; i++) {
    if (acc + lengths[i] >= target - 1e-9) {
      return { ink: bands[i].ink, mix: Math.min(bands[i].to, bands[i].from + (target - acc)) };
    }
    acc += lengths[i];
  }
  const last = bands[bands.length - 1];
  return { ink: last.ink, mix: last.to };
}

/**
 * The full card treatment: surface vars, ink vars when the dark ink is needed, the mix used and which ink.
 *
 * When the ink is "light" the theme's own ink applies unchanged and inkVars is null. When the ink is "dark",
 * inkVars holds every variable to override inside surface containers, including --bg rebuilt at its correct
 * distance from the tinted surface.
 */
export function cardSurface(theme: Theme, tint: string, level: number): {
  vars: Record<string, string>;
  inkVars: Record<string, string> | null;
  mix: number;
  ink: InkChoice;
} {
  const family = SURFACE_FAMILY[theme] ?? SURFACE_FAMILY.dark;
  const bands = readableBands(theme, tint);
  const pos = bandAt(bands, level);

  if (!pos) {
    return { vars: { "--surface": family.surface }, inkVars: null, mix: 0, ink: "light" };
  }

  const surface = mixHex(family.surface, tint, pos.mix);
  const vars: Record<string, string> = { "--surface": surface };
  for (const [name, value] of Object.entries(family.companions)) {
    vars[name] = offsetFrom(surface, family.surface, value);
  }

  if (pos.ink === "dark") {
    const themeBg = THEME_INK[theme]?.bg ?? THEME_INK.dark.bg;
    const inkVars: Record<string, string> = { ...DARK_INK_VARS };
    inkVars["--bg"] = offsetFrom(surface, family.surface, themeBg);
    return { vars, inkVars, mix: pos.mix, ink: "dark" };
  }

  return { vars, inkVars: null, mix: pos.mix, ink: "light" };
}

// ---------- the shared palette ----------

/** One plain colour on offer, by name so it can be spoken and translated. */
export interface Preset { id: string; hex: string }

/**
 * The twenty plain colours every colour row offers.
 *
 * They are Tailwind's 400 shades, which is the family the app is already painted from - --loss is red-400, --c-rose
 * is rose-400, --c-violet is violet-400 - so a chosen colour sits at the same weight as the ones in the charts.
 * The last three round the row off: a white, a grey, and a brown. Tailwind has no brown, so that one is ours.
 */
export const PRESETS: Preset[] = [
  { id: "red", hex: "#f87171" },
  { id: "orange", hex: "#fb923c" },
  { id: "amber", hex: "#fbbf24" },
  { id: "yellow", hex: "#facc15" },
  { id: "lime", hex: "#a3e635" },
  { id: "green", hex: "#4ade80" },
  { id: "emerald", hex: "#34d399" },
  { id: "teal", hex: "#2dd4bf" },
  { id: "cyan", hex: "#22d3ee" },
  { id: "sky", hex: "#38bdf8" },
  { id: "blue", hex: "#60a5fa" },
  { id: "indigo", hex: "#818cf8" },
  { id: "violet", hex: "#a78bfa" },
  { id: "purple", hex: "#c084fc" },
  { id: "fuchsia", hex: "#e879f9" },
  { id: "pink", hex: "#f472b6" },
  { id: "rose", hex: "#fb7185" },
  { id: "white", hex: "#ffffff" },
  { id: "grey", hex: "#94a3b8" },  // slate-400
  { id: "brown", hex: "#a1724a" },  // ours: Tailwind has no brown, and a mid one sits well next to the amber
];

/** True for a full six-digit hex with the hash, which is the only form ever stored. */
export const isHexColor = (v: string): boolean => /^#[0-9a-fA-F]{6}$/.test(v.trim());

/** A typed hex brought to the stored form, or null when it is not one. */
export const normalizeHex = (v: string): string | null =>
  isHexColor(v) ? `#${v.trim().slice(1).toLowerCase()}` : null;

/** How many of the customer's own colours are remembered. */
export const RECENT_MAX = 6;

/** The list with this colour at the front, no repeats, no longer than RECENT_MAX. Rubbish leaves it alone. */
export function pushRecent(list: string[], hex: string): string[] {
  const h = normalizeHex(hex);
  if (!h) return list;
  return [h, ...list.filter((x) => normalizeHex(x) !== h)].slice(0, RECENT_MAX);
}

/** Which swatch in a colour row wears the check. */
export type PaletteChoice =
  | { kind: "special"; id: string }
  | { kind: "preset"; hex: string }
  | { kind: "own"; hex: string }
  | { kind: "none" };

/**
 * Which swatch a colour row marks, from what is stored.
 *
 *  - one of the row's own choices - the moving colours, the gold, the session, the three own colours - marks itself;
 *  - "solid" marks the palette swatch of that hex, or the own-colour swatch when the hex is not one of the twenty;
 *  - anything else is a colour saved before the palette existed. It still paints exactly as it did, and is matched
 *    against the palette by its hex, so violet lands on violet-400; the old blue is #5ab8f0, which is not the
 *    palette's sky, so nothing is marked until it is picked again.
 */
export function paletteChoice(stored: string, specials: string[], hex: string, legacy: Record<string, string>): PaletteChoice {
  if (specials.includes(stored)) return { kind: "special", id: stored };
  const h = normalizeHex(stored === "solid" ? hex : legacy[stored] ?? "");
  if (!h) return { kind: "none" };
  if (PRESETS.some((pr) => pr.hex === h)) return { kind: "preset", hex: h };
  // A hex of one's own is only ever the "solid" case; an old fixed colour that misses the palette marks nothing.
  return stored === "solid" ? { kind: "own", hex: h } : { kind: "none" };
}

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

  // ---- the cards, independent of the background above ----
  /** "theme" leaves every surface exactly as the theme paints it. */
  cardColor: CardColor;
  /** The colour behind the cards when cardColor is "custom". */
  cardSolid: string;
  /** 20..100, across what the card can take before its text stops reading. */
  cardLevel: number;

  /** The last few colours of the customer's own, newest first, shared by every colour row. */
  recentColors: string[];
}

export const DEFAULT_LIGHTING: Lighting = {
  style: "off",
  color: "gold",
  custom: DEFAULT_CUSTOM,
  level: 70,
  speed: "normal",
  playing: true,
  solid: "#4dffa0",
  cardColor: "theme",
  cardSolid: "#5ab8f0",
  cardLevel: 70,
  recentColors: [],
};
