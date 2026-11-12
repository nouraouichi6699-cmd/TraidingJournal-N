// Win/loss colour preset. "classic" is no override at all: the stylesheet's per-theme --profit / --loss show through.
// The other two put one pair on :root (inline style outranks the three theme selectors), whichever theme is active.
//
// Inline style on :root does NOT reach the card-ink block in index.css, which re-declares --profit / --loss on every
// surface container (`--profit: var(--ink-profit)`). So each preset also carries a darker pair for those tinted
// surfaces, set as --ink-wl-profit / --ink-wl-loss; index.css reads them first and falls back to --ink-profit.
// They are separate names on purpose: Ambient.tsx owns --ink-profit / --ink-loss and clears them on its own schedule.

export type WinLossPreset = "classic" | "colorBlind" | "asian";
export const WIN_LOSS_PRESETS: WinLossPreset[] = ["classic", "colorBlind", "asian"];
export const DEFAULT_WIN_LOSS: WinLossPreset = "classic";

interface Pair { profit: string; loss: string }

/**
 * On the page surfaces (dark #000e2e / #0a0a0a, light #fff / #f3f5fa) every colour here is at least 3:1, which is the
 * bar for large and bold text; one pair has to serve all three themes, so none is as bright as Classic's dark pair.
 * The ink pair sits on strongly tinted light cards, where it is at least 4.5:1 on white.
 */
export const WIN_LOSS_COLOURS: Record<Exclude<WinLossPreset, "classic">, { page: Pair; ink: Pair }> = {
  // Blue for a gain, orange for a loss: separable under red-green colour blindness.
  colorBlind: { page: { profit: "#3b82f6", loss: "#d9570b" }, ink: { profit: "#1d4ed8", loss: "#c2410c" } },
  // Red up, green down: the East Asian market convention. Classic's pair, swapped (a little deeper to hold 3:1 on light).
  asian: { page: { profit: "#ef4444", loss: "#16a34a" }, ink: { profit: "#b91c1c", loss: "#166534" } },
};

const VARS = ["--profit", "--loss", "--ink-wl-profit", "--ink-wl-loss"];

/** The properties a preset sets on :root; empty for classic. */
export function winLossVars(preset: WinLossPreset): Record<string, string> {
  if (!Object.prototype.hasOwnProperty.call(WIN_LOSS_COLOURS, preset)) return {};
  const c = WIN_LOSS_COLOURS[preset as Exclude<WinLossPreset, "classic">];
  return { "--profit": c.page.profit, "--loss": c.page.loss, "--ink-wl-profit": c.ink.profit, "--ink-wl-loss": c.ink.loss };
}

/** Sets the preset's properties, or removes every one of them for classic (and for anything unrecognised). */
export function applyWinLoss(style: Pick<CSSStyleDeclaration, "setProperty" | "removeProperty">, preset: WinLossPreset) {
  const vars = winLossVars(preset);
  for (const name of VARS) {
    if (name in vars) style.setProperty(name, vars[name]);
    else style.removeProperty(name);
  }
}
