// Win/loss colour preset. "classic" is no override at all: the stylesheet's per-theme --profit / --loss show through.
// The other presets put one pair on :root (inline style outranks the three theme selectors), whichever theme is active.
//
// Inline style on :root does NOT reach the card-ink block in index.css, which re-declares --profit / --loss on every
// surface container (`--profit: var(--ink-profit)`). So each preset also carries a darker pair for those tinted
// surfaces, set as --ink-wl-profit / --ink-wl-loss; index.css reads them first and falls back to --ink-profit.
// They are separate names on purpose: Ambient.tsx owns --ink-profit / --ink-loss and clears them on its own schedule.

import { contrastRatio, mixHex, normalizeHex, relLuminance } from "./lighting";

export type WinLossPreset = "classic" | "colorBlind" | "asian" | "custom";
export const WIN_LOSS_PRESETS: WinLossPreset[] = ["classic", "colorBlind", "asian", "custom"];
export const DEFAULT_WIN_LOSS: WinLossPreset = "classic";

interface Pair { profit: string; loss: string }

/**
 * On the page surfaces (dark #000e2e / #0a0a0a, light #fff / #f3f5fa) every colour here is at least 3:1, which is the
 * bar for large and bold text; one pair has to serve all three themes, so none is as bright as Classic's dark pair.
 * The ink pair sits on strongly tinted light cards, where it is at least 4.5:1 on white.
 */
export const WIN_LOSS_COLOURS: Record<Exclude<WinLossPreset, "classic" | "custom">, { page: Pair; ink: Pair }> = {
  // Blue for a gain, orange for a loss: separable under red-green colour blindness.
  colorBlind: { page: { profit: "#3b82f6", loss: "#d9570b" }, ink: { profit: "#1d4ed8", loss: "#c2410c" } },
  // Red up, green down: the East Asian market convention. Classic's pair, swapped (a little deeper to hold 3:1 on light).
  asian: { page: { profit: "#ef4444", loss: "#16a34a" }, ink: { profit: "#b91c1c", loss: "#166534" } },
};

// ---- Custom: the customer's own pair ----
//
// What they pick is stored exactly as picked and never rewritten. Only what is applied is nudged, the same way
// readableTone (lib/calculators.ts) leaves a colour alone when it already reads and otherwise moves it the shortest
// way: nothing is refused, and a pick that already reads is applied untouched.

/** The two colours the customer chose, as six-digit hex. */
export interface CustomWinLoss { profit: string; loss: string }

/** Where Custom starts: a green and a red that already hold the bars below, so a first visit changes nothing visibly. */
export const DEFAULT_CUSTOM_WIN_LOSS: CustomWinLoss = { profit: "#16a34a", loss: "#ef4444" };

/** The six page surfaces of the three themes (dark #000e2e / #061126, black #0a0a0a / #000000, light #fff / #f3f5fa). */
export const PAGE_SURFACES = ["#061126", "#000e2e", "#0a0a0a", "#000000", "#ffffff", "#f3f5fa"];
/** The same bars the built-in presets are held to: 3:1 on every page surface, 4.5:1 on a white card for the ink pair. */
export const PAGE_MIN = 3;
export const INK_MIN = 4.5;

const pageContrast = (hex: string): number => Math.min(...PAGE_SURFACES.map((s) => contrastRatio(hex, s)));

/** The colour itself when it reads on every theme surface, else the closest shade that does. */
export function readablePage(hex: string): string {
  if (pageContrast(hex) >= PAGE_MIN) return hex;
  // Too dark fails on the dark surfaces, too light on the light ones: move away from whichever it fails on.
  const toward = relLuminance(hex) < 0.18 ? "#ffffff" : "#000000";
  for (let t = 0.02; t <= 1 + 1e-9; t += 0.02) {
    const c = mixHex(hex, toward, t);
    if (pageContrast(c) >= PAGE_MIN) return c;
  }
  return "#808080";
}

/** The darker twin for tinted cards, derived the way the presets' ink pairs were: darkened until it holds on white. */
export function readableInk(hex: string): string {
  if (contrastRatio(hex, "#ffffff") >= INK_MIN) return hex;
  for (let t = 0.02; t <= 1 + 1e-9; t += 0.02) {
    const c = mixHex(hex, "#000000", t);
    if (contrastRatio(c, "#ffffff") >= INK_MIN) return c;
  }
  return "#000000";
}

const rgbGap = (a: string, b: string): number => {
  const ch = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [ch(a), ch(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** What Custom applies for a stored pair, and what was changed on the way. Missing or malformed values fall back. */
export function customPair(c: Partial<CustomWinLoss> | null | undefined): {
  page: Pair; ink: Pair; adjusted: { profit: boolean; loss: boolean }; tooClose: boolean;
} {
  const pick = (k: keyof CustomWinLoss) => normalizeHex(typeof c?.[k] === "string" ? (c[k] as string) : "") ?? DEFAULT_CUSTOM_WIN_LOSS[k];
  const raw = { profit: pick("profit"), loss: pick("loss") };
  const page = { profit: readablePage(raw.profit), loss: readablePage(raw.loss) };
  return {
    page,
    ink: { profit: readableInk(page.profit), loss: readableInk(page.loss) },
    adjusted: { profit: page.profit !== raw.profit, loss: page.loss !== raw.loss },
    // A gain and a loss that look alike defeat the point; this is a warning only, it never blocks the choice.
    tooClose: rgbGap(page.profit, page.loss) < 40,
  };
}

const VARS = ["--profit", "--loss", "--ink-wl-profit", "--ink-wl-loss"];

/** The properties a preset sets on :root; empty for classic. `custom` is the stored pair, read only for "custom". */
export function winLossVars(preset: WinLossPreset, custom?: Partial<CustomWinLoss> | null): Record<string, string> {
  if (preset === "custom") {
    const c = customPair(custom);
    return { "--profit": c.page.profit, "--loss": c.page.loss, "--ink-wl-profit": c.ink.profit, "--ink-wl-loss": c.ink.loss };
  }
  if (!Object.prototype.hasOwnProperty.call(WIN_LOSS_COLOURS, preset)) return {};
  const c = WIN_LOSS_COLOURS[preset as Exclude<WinLossPreset, "classic" | "custom">];
  return { "--profit": c.page.profit, "--loss": c.page.loss, "--ink-wl-profit": c.ink.profit, "--ink-wl-loss": c.ink.loss };
}

/** Sets the preset's properties, or removes every one of them for classic (and for anything unrecognised). */
export function applyWinLoss(style: Pick<CSSStyleDeclaration, "setProperty" | "removeProperty">, preset: WinLossPreset, custom?: Partial<CustomWinLoss> | null) {
  const vars = winLossVars(preset, custom);
  for (const name of VARS) {
    if (name in vars) style.setProperty(name, vars[name]);
    else style.removeProperty(name);
  }
}
