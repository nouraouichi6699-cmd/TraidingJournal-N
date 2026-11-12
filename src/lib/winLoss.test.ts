import { applyWinLoss, customPair, DEFAULT_CUSTOM_WIN_LOSS, DEFAULT_WIN_LOSS, INK_MIN, PAGE_MIN, PAGE_SURFACES, readableInk, readablePage, WIN_LOSS_COLOURS, WIN_LOSS_PRESETS, winLossVars, type WinLossPreset } from "./winLoss";
import { DEFAULTS } from "../useSettings";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const eq = (name: string, got: unknown, want: unknown) => is(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// A stand-in for root.style: just a map.
const fake = () => {
  const m = new Map<string, string>();
  return { m, style: { setProperty: (k: string, v: string) => { m.set(k, v); }, removeProperty: (k: string) => { const o = m.get(k) ?? ""; m.delete(k); return o; } } };
};

// ---- contrast helpers (WCAG) ----
const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

eq("default preset is classic", DEFAULT_WIN_LOSS, "classic");
eq("the settings default is classic", DEFAULTS.winLossPreset, "classic");
eq("four presets", WIN_LOSS_PRESETS, ["classic", "colorBlind", "asian", "custom"]);
eq("the settings default custom pair", DEFAULTS.winLossCustom, DEFAULT_CUSTOM_WIN_LOSS);
eq("classic sets nothing", winLossVars("classic"), {});

{
  const f = fake();
  applyWinLoss(f.style, "colorBlind");
  eq("colour-blind sets profit blue", f.m.get("--profit"), "#3b82f6");
  eq("colour-blind sets loss orange", f.m.get("--loss"), "#d9570b");
  is("colour-blind sets the ink pair too", f.m.has("--ink-wl-profit") && f.m.has("--ink-wl-loss"));
  applyWinLoss(f.style, "classic");
  eq("classic after colour-blind removes every property", [...f.m.keys()], []);
}
{
  const f = fake();
  applyWinLoss(f.style, "asian");
  eq("asian profit is red", f.m.get("--profit"), "#ef4444");
  eq("asian loss is green", f.m.get("--loss"), "#16a34a");
  applyWinLoss(f.style, "colorBlind");
  eq("switching preset replaces, not accumulates", f.m.size, 4);
  applyWinLoss(f.style, "bogus" as WinLossPreset);
  eq("an unrecognised value (e.g. from a synced row) falls back to no override", [...f.m.keys()], []);
  applyWinLoss(f.style, "constructor" as WinLossPreset);
  eq("a prototype key is not a preset", [...f.m.keys()], []);
}
{
  const f = fake();
  applyWinLoss(f.style, "classic");
  eq("classic on a clean root touches nothing", f.m.size, 0);
}

// Contrast: the page pair clears 3:1 on every surface of the three themes; the ink pair clears 4.5:1 on white.
const surfaces = ["#061126", "#000e2e", "#0a0a0a", "#000000", "#ffffff", "#f3f5fa"];
for (const p of ["colorBlind", "asian"] as const) {
  for (const k of ["profit", "loss"] as const) {
    const min = Math.min(...surfaces.map((s) => ratio(WIN_LOSS_COLOURS[p].page[k], s)));
    is(`${p} ${k} >= 3:1 on every theme surface`, min >= 3, `min ${min.toFixed(2)}`);
    const inkMin = ratio(WIN_LOSS_COLOURS[p].ink[k], "#ffffff");
    is(`${p} ${k} ink >= 4.5:1 on white`, inkMin >= 4.5, `got ${inkMin.toFixed(2)}`);
  }
  is(`${p}: gain and loss are different colours`, WIN_LOSS_COLOURS[p].page.profit !== WIN_LOSS_COLOURS[p].page.loss);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
