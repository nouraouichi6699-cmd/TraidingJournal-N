// Ambient lighting: palettes, strength, speed, the police flash rate and the session colour.
// Run: npx tsx src/lib/lighting.test.ts
import {
  auroraAlpha, buildPalette, clampLevel, DEFAULT_CUSTOM, DEFAULT_LIGHTING, dur, FLASHES_PER_CYCLE, hexRgb, levelT,
  lift, orbAlpha, orbSpread, paletteKey, policeAlpha, policeFlashesPerSecond, POLICE_SECONDS, SAFE_FLASHES_PER_SECOND,
  sessionNow, sessionTrio, speedFactor, SPEED_FACTOR, strip, type LightColor, type LightSpeed,
  AA_CONTRAST, contrastRatio, FULL_COLORS, fullColourBg, maxReadableMix, mixHex, relLuminance, THEME_INK,
  AA_LARGE, CARD_COLORS, maxReadableSurfaceMix, offsetFrom, SURFACE_FAMILY, SURFACE_INK, SURFACE_VAR_NAMES,
  surfaceReadable, surfaceVars,
  isHexColor, normalizeHex, paletteChoice, PRESETS, pushRecent, RECENT_MAX, SWATCH,
} from "./lighting";
import type { Theme } from "../types";
import { SESSION_COLORS, SESSION_TRIO } from "./sessionColors";
import { DEFAULT_BOUNDS } from "./tradingTime";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const eq = (name: string, got: unknown, want: unknown) => is(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const near = (name: string, got: number, want: number) => is(name, Math.abs(got - want) < 0.005, `got ${got}, want ${want}`);

const SPEEDS: LightSpeed[] = ["slow", "normal", "fast"];

console.log("-- the police flash rate is a safety limit, not a preference");
// Three or more flashes a second is the rate that can trigger a photosensitive seizure.
for (const s of SPEEDS) {
  const rate = policeFlashesPerSecond(s);
  is(`${s}: ${rate.toFixed(2)} flashes a second is under ${SAFE_FLASHES_PER_SECOND}`, rate < SAFE_FLASHES_PER_SECOND);
}
is("even the fastest leaves a wide margin", policeFlashesPerSecond("fast") < SAFE_FLASHES_PER_SECOND / 2);
near("slow is 0.71 a second", policeFlashesPerSecond("slow"), 2 / 2.8);
near("normal is 1 a second", policeFlashesPerSecond("normal"), 1);
near("fast is 1.33 a second", policeFlashesPerSecond("fast"), 2 / 1.5);
eq("two flashes to a cycle", FLASHES_PER_CYCLE, 2);
is("no cycle is shorter than a second and a half", SPEEDS.every((s) => POLICE_SECONDS[s] >= 1.5));
// Whatever a future speed is called, the rate has to hold.
is("an unknown speed falls back to a safe rate", policeFlashesPerSecond("whatever" as LightSpeed) < SAFE_FLASHES_PER_SECOND);

console.log("-- colours");
eq("a hex reads as r,g,b", hexRgb("#4dffa0"), "77,255,160");
eq("black reads as zeros", hexRgb("#000000"), "0,0,0");
eq("white reads as 255s", hexRgb("#ffffff"), "255,255,255");
eq("rubbish reads as black", hexRgb("nonsense"), "0,0,0");
eq("lifting by nothing changes nothing", lift("10,20,30", 0), "10,20,30");
eq("lifting all the way is white", lift("10,20,30", 1), "255,255,255");
eq("lifting halfway", lift("0,0,0", 0.5), "128,128,128");

console.log("-- a curtain is graded from its tips down to its rim");
{
  const s = strip("160,80,255", "60,210,210", "70,255,160", "215,255,230");
  eq("seven stops", s.length, 7);
  eq("it starts at the very top", s[0][0], 0);
  eq("and ends at the very bottom", s[6][0], 1);
  is("the stops only ever go down the curtain", s.every((x, i) => i === 0 || x[0] > s[i - 1][0]));
  is("the top is transparent", s[0][1].endsWith(",0)"));
  is("the bottom is transparent too", s[6][1].endsWith(",0)"));
  is("the brightest point is the rim at 0.92", s[4][0] === 0.92 && s[4][1].endsWith(",1)"));
}

console.log("-- two curtains for every setting");
for (const c of ["rgb", "gold", "blue", "violet", "green", "custom", "session"] as LightColor[]) {
  const p = buildPalette(c, DEFAULT_CUSTOM);
  is(`${c}: two curtains of seven stops`, p.length === 2 && p.every((x) => x.length === 7));
  is(`${c}: every stop is an rgba`, p.every((x) => x.every(([, col]) => col.startsWith("rgba("))));
}
is("an unknown colour falls back to gold rather than nothing", buildPalette("made-up" as LightColor, DEFAULT_CUSTOM)[0].length === 7);
is("the natural colours are not the gold ones", JSON.stringify(buildPalette("rgb", DEFAULT_CUSTOM)) !== JSON.stringify(buildPalette("gold", DEFAULT_CUSTOM)));

console.log("-- the strips are only rebuilt when they have to be");
eq("a fixed colour keys on itself", paletteKey("gold", DEFAULT_CUSTOM), "gold");
is("own colours key on all three", paletteKey("custom", DEFAULT_CUSTOM).includes(DEFAULT_CUSTOM.c));
is("changing one own colour changes the key", paletteKey("custom", { ...DEFAULT_CUSTOM, b: "#123456" }) !== paletteKey("custom", DEFAULT_CUSTOM));
eq("the same setting gives the same key", paletteKey("blue", DEFAULT_CUSTOM), paletteKey("blue", { a: "#1", b: "#2", c: "#3" }));

console.log("-- strength");
eq("below the range clamps up", clampLevel(0), 20);
eq("above it clamps down", clampLevel(500), 100);
eq("rubbish falls back to the default", clampLevel(NaN), 70);
eq("a fraction rounds", clampLevel(70.4), 70);
near("the lowest strength still shows", auroraAlpha(20), 0.35 + 0.65 * 0.2);
near("the highest is full", auroraAlpha(100), 1);
is("strength only ever goes up with the slider", [20, 40, 60, 80, 100].every((v, i, a) => i === 0 || auroraAlpha(v) > auroraAlpha(a[i - 1])));
is("every strength stays inside 0..1", [20, 50, 70, 100].every((v) => auroraAlpha(v) > 0 && auroraAlpha(v) <= 1));
eq("the orbs spread further as it rises", orbSpread(20) < orbSpread(100), true);
eq("the default spread", orbSpread(70), 66);
is("the police glow stays inside 0..1", [20, 70, 100].every((v) => policeAlpha(v) > 0 && policeAlpha(v) <= 1));
{
  const a = orbAlpha(70);
  is("three orbs, dimmest last", a.length === 3 && a[0] > a[1] && a[1] > a[2]);
  is("all three stay inside 0..1", a.every((x) => x > 0 && x <= 1));
}
near("the default strength is 0.7", levelT(70), 0.7);

console.log("-- speed");
eq("calm is the slowest", SPEED_FACTOR.slow > SPEED_FACTOR.normal, true);
eq("fast is the quickest", SPEED_FACTOR.fast < SPEED_FACTOR.normal, true);
eq("an unknown speed runs at normal", speedFactor("whatever" as LightSpeed), 1);
eq("calm stretches a 10 second drift", dur(10, "slow"), "18.0s");
eq("normal leaves it alone", dur(10, "normal"), "10.0s");
eq("fast halves it", dur(10, "fast"), "5.0s");

console.log("-- the session colour follows the customer's own boundaries");
const at = (h: number) => Date.UTC(2026, 0, 15, h);
eq("06:00 UTC is Tokyo by default", sessionNow(at(6), DEFAULT_BOUNDS), "sessTK");
eq("08:00 is London", sessionNow(at(8), DEFAULT_BOUNDS), "sessLN");
eq("15:00 is New York", sessionNow(at(15), DEFAULT_BOUNDS), "sessNY");
eq("22:00 is Sydney", sessionNow(at(22), DEFAULT_BOUNDS), "sessSY");
// The whole point of taking the boundaries from settings rather than hard-coding 7 / 13 / 21.
eq("moving a boundary moves the colour", sessionNow(at(8), { tokyo: 9, london: 14, newYork: 22 }), "sessTK");
eq("and the other end too", sessionNow(at(21), { tokyo: 7, london: 13, newYork: 22 }), "sessNY");
is("every hour of the day has a session", Array.from({ length: 24 }, (_, h) => sessionNow(at(h), DEFAULT_BOUNDS)).every(Boolean));

console.log("-- each session's three shades");
for (const k of ["sessTK", "sessLN", "sessNY", "sessSY"] as const) {
  const t = sessionTrio(k);
  is(`${k}: three hex shades`, [t.a, t.b, t.c].every((x) => /^#[0-9a-f]{6}$/i.test(x)));
  eq(`${k}: the lower shade is the one the ribbon uses`, t.a, SESSION_COLORS[k]);
  eq(`${k}: comes from the shared table`, t, SESSION_TRIO[k]);
}
is("the four sessions do not share a colour", new Set(["sessTK", "sessLN", "sessNY", "sessSY"].map((k) => SESSION_TRIO[k as "sessTK"].a)).size === 4);

console.log("-- the defaults are what the design asks for");
eq("aurora, natural colours, 70%, normal, playing", [DEFAULT_LIGHTING.style, DEFAULT_LIGHTING.color, DEFAULT_LIGHTING.level, DEFAULT_LIGHTING.speed, DEFAULT_LIGHTING.playing], ["aurora", "rgb", 70, "normal", true]);
eq("with the design's own three colours behind the picker", DEFAULT_LIGHTING.custom, DEFAULT_CUSTOM);

const THEMES: Theme[] = ["dark", "light", "black"];
const readable = (theme: Theme, bg: string) =>
  Math.min(contrastRatio(THEME_INK[theme].text, bg), contrastRatio(THEME_INK[theme].muted, bg));

console.log("-- mixing a tint into a background");
eq("none of the tint leaves the base", mixHex("#061126", "#ffff00", 0), "#061126");
eq("all of it is the tint", mixHex("#061126", "#ffff00", 1), "#ffff00");
eq("halfway between black and white is grey", mixHex("#000000", "#ffffff", 0.5), "#808080");
eq("a quarter of white over black", mixHex("#000000", "#ffffff", 0.25), "#404040");
eq("past the end clamps to the tint", mixHex("#000000", "#ffffff", 5), "#ffffff");
eq("below the start clamps to the base", mixHex("#000000", "#ffffff", -5), "#000000");
eq("rubbish leaves the base alone", mixHex("#000000", "#ffffff", NaN), "#000000");
eq("a short hex still reads", mixHex("#000", "#fff", 1), "#ffffff");
is("every step between is between", [0.2, 0.4, 0.6, 0.8].every((t) => {
  const l = relLuminance(mixHex("#061126", "#ffff00", t));
  return l > relLuminance("#061126") && l < relLuminance("#ffff00");
}));

console.log("-- contrast, against the figures WCAG gives");
near("black on white is 21", contrastRatio("#000000", "#ffffff"), 21);
near("a colour against itself is 1", contrastRatio("#4dffa0", "#4dffa0"), 1);
is("the order of the two does not matter", contrastRatio("#000000", "#ffffff") === contrastRatio("#ffffff", "#000000"));
near("white on mid grey", contrastRatio("#ffffff", "#808080"), 3.95);
eq("white is the brightest", relLuminance("#ffffff"), 1);
eq("black is the darkest", relLuminance("#000000"), 0);

console.log("-- every theme already reads before anything is tinted");
for (const th of THEMES) {
  is(`${th}: text and muted both clear AA untouched`, readable(th, THEME_INK[th].bg) >= AA_CONTRAST);
}

console.log("-- the guard holds, tint by tint and theme by theme");
const TINTS = ["#ffff00", "#f2c14e", "#5ab8f0", "#a78bfa", "#34d399", "#4dffa0", "#ff0000", "#ffffff", "#000000"];
for (const th of THEMES) {
  for (const tint of TINTS) {
    const ceiling = maxReadableMix(th, tint);
    is(`${th} ${tint}: the ceiling itself still reads`, readable(th, mixHex(THEME_INK[th].bg, tint, ceiling)) >= AA_CONTRAST - 1e-9);
    is(`${th} ${tint}: a ceiling between 0 and 1`, ceiling >= 0 && ceiling <= 1);
    is(`${th} ${tint}: every strength reads`, [20, 40, 60, 80, 100].every((lv) => readable(th, fullColourBg(th, tint, lv).color) >= AA_CONTRAST - 1e-9));
  }
}

console.log("-- a very bright tint at full strength");
// Yellow is the case a naive mix gets wrong: it is nearly as bright as white.
{
  const navy = fullColourBg("dark", "#ffff00", 100);
  is(`Navy at 100% uses only ${(navy.mix * 100).toFixed(0)}% of the yellow`, navy.mix > 0 && navy.mix < 0.35);
  is("and Navy still reads", readable("dark", navy.color) >= AA_CONTRAST - 1e-9);
  const ivory = fullColourBg("light", "#ffff00", 100);
  // Ivory's ink is nearly black, so it stays readable on yellow and the ceiling is far higher.
  is(`Ivory at 100% can take ${(ivory.mix * 100).toFixed(0)}% of it`, ivory.mix > 0.9);
  is("and Ivory still reads", readable("light", ivory.color) >= AA_CONTRAST - 1e-9);
  is("the dark theme takes less of it than the light one", navy.mix < ivory.mix);
  const black = fullColourBg("black", "#ffff00", 100);
  is("Black & Gold takes a little too", black.mix > 0 && black.mix < 0.35);
  is("and Black & Gold still reads", readable("black", black.color) >= AA_CONTRAST - 1e-9);
}

console.log("-- the strength runs across the whole slider");
for (const th of THEMES) {
  const at = (lv: number) => fullColourBg(th, "#5ab8f0", lv).mix;
  is(`${th}: more strength means more colour`, [20, 40, 60, 80, 100].every((lv, i, a) => i === 0 || at(lv) > at(a[i - 1])));
  near(`${th}: 100% is the ceiling`, at(100), maxReadableMix(th, "#5ab8f0"));
  near(`${th}: 20% is a fifth of it`, at(20), maxReadableMix(th, "#5ab8f0") * 0.2);
}
eq("an unknown theme falls back rather than throwing", typeof fullColourBg("nope" as Theme, "#5ab8f0", 70).color, "string");

console.log("-- which colours this style offers");
is("no moving colours", !FULL_COLORS.includes("rgb"));
is("the four swatches, the session and one of your own", FULL_COLORS.length === 6 && FULL_COLORS.includes("session") && FULL_COLORS.includes("custom"));
is("full colour is not the default style", DEFAULT_LIGHTING.style !== "full");
is("and it carries one colour", /^#[0-9a-f]{6}$/i.test(DEFAULT_LIGHTING.solid));

console.log("-- the cards colour: what the surface family is");
for (const th of THEMES) {
  const f = SURFACE_FAMILY[th];
  is(`${th}: a surface and at least a border, a track and a skeleton`, /^#[0-9a-f]{6}$/i.test(f.surface)
    && ["--border", "--gauge-track", "--skeleton"].every((k) => k in f.companions));
  is(`${th}: every companion is a plain colour`, Object.values(f.companions).every((v) => /^#[0-9a-f]{6}$/i.test(v)));
}
// Ivory paints its cards with a gradient over the surface, so it must not be overridden with a flat colour.
is("Ivory leaves its card gradient to follow the surface", !("--card-bg" in SURFACE_FAMILY.light.companions));
is("Navy and Black set their card background, which is a literal there",
  "--card-bg" in SURFACE_FAMILY.dark.companions && "--card-bg" in SURFACE_FAMILY.black.companions);
is("nothing outside the surface family is ever written",
  SURFACE_VAR_NAMES.every((n) => ["--surface", "--card-bg", "--gauge-bg", "--gauge-track", "--border", "--skeleton"].includes(n)));
is("the background, the gold and the ink are never written",
  !SURFACE_VAR_NAMES.some((n) => ["--bg", "--primary", "--primary-2", "--on-primary", "--accent", "--icon", "--text", "--muted", "--profit", "--loss"].includes(n)));

console.log("-- all five inks read on an untinted card today");
for (const th of THEMES) {
  is(`${th}: untouched surface passes`, surfaceReadable(th, SURFACE_FAMILY[th].surface));
}

console.log("-- the guard, tint by tint and theme by theme");
for (const th of THEMES) {
  for (const tint of TINTS) {
    const ceiling = maxReadableSurfaceMix(th, tint);
    is(`${th} ${tint}: the ceiling itself reads`, surfaceReadable(th, mixHex(SURFACE_FAMILY[th].surface, tint, ceiling)));
    is(`${th} ${tint}: every strength reads`, [20, 40, 60, 80, 100].every((lv) => surfaceReadable(th, surfaceVars(th, tint, lv).vars["--surface"])));
    // No comparison with the background ceiling here: the two mix into different colours (--bg against --surface),
    // and in Ivory the surface starts at pure white, which takes more of a tint than the slightly grey page does.
  }
}
{
  const navy = surfaceVars("dark", "#ffff00", 100);
  is(`Navy cards take only ${(navy.mix * 100).toFixed(0)}% of a pure yellow`, navy.mix > 0 && navy.mix < 0.3);
  const ivory = surfaceVars("light", "#ffff00", 100);
  is("Ivory cards can take all of it", ivory.mix > 0.9);
}

console.log("-- a companion keeps its exact distance from the surface");
for (const th of THEMES) {
  const f = SURFACE_FAMILY[th];
  for (const [name, value] of Object.entries(f.companions)) {
    const { vars } = surfaceVars(th, "#5ab8f0", 100);
    const d = (a: string, b: string) => {
      const pa = a.replace("#", "").match(/../g)!.map((x) => parseInt(x, 16));
      const pb = b.replace("#", "").match(/../g)!.map((x) => parseInt(x, 16));
      return pa.map((v, i) => v - pb[i]);
    };
    const before = d(value, f.surface);
    const after = d(vars[name], vars["--surface"]);
    is(`${th} ${name}: the same distance, in size`, before.every((x, i) => Math.abs(Math.abs(x) - Math.abs(after[i])) <= 1));
  }
}

console.log("-- the distance flips rather than clipping at the ends");
// A surface pushed to pure white cannot take a lighter border on top, so the same distance goes the other way.
{
  const lighter = offsetFrom("#ffffff", "#0b1c3d", "#1d3466"); // the border sits lighter than the surface in Navy
  is("a white surface gets a darker border instead of a clipped one", lighter !== "#ffffff");
  const p = lighter.replace("#", "").match(/../g)!.map((x) => parseInt(x, 16));
  is("and it stays inside the range", p.every((v) => v >= 0 && v <= 255));
  is("with the distance kept", Math.abs(255 - p[2]) === Math.abs(0x34 - 0x3d) || Math.abs(255 - p[2]) > 0);
}
{
  const darker = offsetFrom("#000000", "#ffffff", "#dbe1ee"); // the border sits darker than the surface in Ivory
  is("a black surface gets a lighter border instead of a clipped one", darker !== "#000000");
  const p = darker.replace("#", "").match(/../g)!.map((x) => parseInt(x, 16));
  is("and it stays inside the range too", p.every((v) => v >= 0 && v <= 255));
}
is("no companion ever lands on the surface itself, at any strength", THEMES.every((th) => {
  const f = SURFACE_FAMILY[th];
  return [20, 60, 100].every((lv) => ["#ffff00", "#000000", "#ffffff", "#5ab8f0"].every((tint) => {
    const { vars } = surfaceVars(th, tint, lv);
    return Object.keys(f.companions).every((k) => vars[k] !== vars["--surface"]);
  }));
}));

console.log("-- the strength runs across the whole slider here too");
for (const th of THEMES) {
  const at = (lv: number) => surfaceVars(th, "#a78bfa", lv).mix;
  is(`${th}: more strength means more colour`, [20, 40, 60, 80, 100].every((lv, i, a) => i === 0 || at(lv) > at(a[i - 1])));
  near(`${th}: 100% is the ceiling`, at(100), maxReadableSurfaceMix(th, "#a78bfa"));
}
eq("an unknown theme falls back rather than throwing", typeof surfaceVars("nope" as Theme, "#5ab8f0", 70).vars["--surface"], "string");

console.log("-- what the cards colour offers, and its default");
is("the theme's own look is one of the choices", CARD_COLORS.includes("theme"));
is("no moving colours and no three-colour set", !CARD_COLORS.some((c) => c === "rgb" || c === "custom3"));
eq("and it starts on the theme's own look", DEFAULT_LIGHTING.cardColor, "theme");
is("with a colour behind the picker", /^#[0-9a-f]{6}$/i.test(DEFAULT_LIGHTING.cardSolid));
eq("at the same default strength as the background", DEFAULT_LIGHTING.cardLevel, 70);
is("the five-ink rule is stricter for text than for the rest", AA_CONTRAST > AA_LARGE);
is("every theme names all five inks", THEMES.every((th) => ["text", "muted", "primary", "profit", "loss"].every((k) => /^#[0-9a-f]{6}$/i.test((SURFACE_INK[th] as Record<string, string>)[k]))));

console.log("-- the twenty colours every row offers");
eq("twenty of them", PRESETS.length, 20);
is("each one is a plain six-digit hex, in lower case", PRESETS.every((p) => /^#[0-9a-f]{6}$/.test(p.hex)));
eq("no colour appears twice", new Set(PRESETS.map((p) => p.hex)).size, 20);
eq("and no name does either", new Set(PRESETS.map((p) => p.id)).size, 20);
// They are Tailwind's 400 shades, which is the weight index.css is already painted at. If one of these drifts, the
// palette has stopped matching the charts.
const hexOfId = (id: string) => PRESETS.find((p) => p.id === id)?.hex;
eq("red is the one --loss already uses", hexOfId("red"), "#f87171");
eq("rose is the one --c-rose uses", hexOfId("rose"), "#fb7185");
eq("violet is the one --c-violet uses", hexOfId("violet"), "#a78bfa");
eq("emerald is the one --c-emerald uses", hexOfId("emerald"), "#34d399");
is("a white, a grey and a brown round the row off", ["white", "grey", "brown"].every((id) => !!hexOfId(id)));
eq("white is white", hexOfId("white"), "#ffffff");
// The gold is the theme's own and stays a choice of its own, so it must not also sit in the palette.
is("the gold is not one of the twenty", !PRESETS.some((p) => p.hex === SWATCH.gold));

console.log("-- what counts as a colour code");
is("a six-digit hex with the hash", isHexColor("#4dffa0"));
is("upper case is a hex too", isHexColor("#4DFFA0"));
is("and spaces around it are forgiven", isHexColor("  #4dffa0 "));
is("no hash is not", !isHexColor("4dffa0"));
is("three digits is not", !isHexColor("#fff"));
is("eight digits is not", !isHexColor("#4dffa0ff"));
is("letters past f are not", !isHexColor("#gggggg"));
is("nothing is not", !isHexColor(""));
is("a colour name is not", !isHexColor("red"));
eq("a hex is stored in lower case", normalizeHex("  #4DFFA0 "), "#4dffa0");
eq("and rubbish is stored not at all", normalizeHex("#fff"), null);

console.log("-- the last few colours of your own");
eq("six are kept", RECENT_MAX, 6);
eq("the newest goes first", pushRecent(["#111111"], "#222222"), ["#222222", "#111111"]);
eq("picking one again moves it up rather than repeating it",
  pushRecent(["#111111", "#222222", "#333333"], "#333333"), ["#333333", "#111111", "#222222"]);
eq("case is not a different colour", pushRecent(["#aabbcc"], "#AABBCC"), ["#aabbcc"]);
{
  let list: string[] = [];
  for (const h of ["#010101", "#020202", "#030303", "#040404", "#050505", "#060606", "#070707"]) list = pushRecent(list, h);
  eq("the seventh pushes the first out", list.length, RECENT_MAX);
  eq("and the newest is still at the front", list[0], "#070707");
  is("the one that fell off is gone", !list.includes("#010101"));
}
eq("rubbish is not remembered", pushRecent(["#111111"], "nope"), ["#111111"]);

console.log("-- which swatch wears the check");
const BG = ["rgb", "gold", "session", "custom"];
const CARD = ["theme", "gold", "session"];
eq("a choice that means something marks itself", paletteChoice("rgb", BG, "#4dffa0", SWATCH), { kind: "special", id: "rgb" });
eq("so does the gold", paletteChoice("gold", BG, "#4dffa0", SWATCH), { kind: "special", id: "gold" });
eq("and the theme's own look", paletteChoice("theme", CARD, "#4dffa0", SWATCH), { kind: "special", id: "theme" });
eq("one of the twenty marks that colour", paletteChoice("solid", BG, "#f87171", SWATCH), { kind: "preset", hex: "#f87171" });
eq("upper case is the same colour", paletteChoice("solid", BG, "#F87171", SWATCH), { kind: "preset", hex: "#f87171" });
eq("anything else marks the own colour", paletteChoice("solid", BG, "#123456", SWATCH), { kind: "own", hex: "#123456" });
eq("a broken colour marks nothing", paletteChoice("solid", BG, "oops", SWATCH), { kind: "none" });
// The three fixed colours are no longer offered on their own. A setting saved before the palette keeps painting; it
// is matched by its hex, so violet lands on the palette's violet and the old blue, #5ab8f0, lands nowhere.
eq("a violet saved earlier finds its swatch", paletteChoice("violet", BG, "#4dffa0", SWATCH), { kind: "preset", hex: "#a78bfa" });
eq("so does a green", paletteChoice("green", BG, "#4dffa0", SWATCH), { kind: "preset", hex: "#34d399" });
eq("the old blue is not one of the twenty, so nothing is marked", paletteChoice("blue", BG, "#4dffa0", SWATCH), { kind: "none" });
is("and it is never mistaken for a colour of your own", paletteChoice("blue", BG, "#4dffa0", SWATCH).kind !== "own");
eq("a choice that was never offered marks nothing", paletteChoice("made-up", BG, "#4dffa0", SWATCH), { kind: "none" });

console.log("-- a colour of your own lights the pages like a fixed one");
{
  const p = buildPalette("solid", DEFAULT_CUSTOM, "#f87171");
  is("two curtains of seven stops", p.length === 2 && p.every((x) => x.length === 7));
  is("every stop is an rgba", p.every((x) => x.every(([, col]) => col.startsWith("rgba("))));
  is("it is graded in its own colour, not the gold", JSON.stringify(p) !== JSON.stringify(buildPalette("gold", DEFAULT_CUSTOM)));
  is("a different colour gives a different curtain",
    JSON.stringify(p) !== JSON.stringify(buildPalette("solid", DEFAULT_CUSTOM, "#38bdf8")));
  is("no colour at all still gives a curtain", buildPalette("solid", DEFAULT_CUSTOM)[0].length === 7);
}
is("the strips are rebuilt when the colour changes",
  paletteKey("solid", DEFAULT_CUSTOM, "#f87171") !== paletteKey("solid", DEFAULT_CUSTOM, "#38bdf8"));
is("and not when the three own colours change under it",
  paletteKey("solid", DEFAULT_CUSTOM, "#f87171") === paletteKey("solid", { a: "#1", b: "#2", c: "#3" }, "#f87171"));
eq("the three own colours still key on all three", paletteKey("custom", DEFAULT_CUSTOM).includes(DEFAULT_CUSTOM.c), true);
eq("nothing is remembered to begin with", DEFAULT_LIGHTING.recentColors, []);

console.log("-- the guard holds for all twenty, as it does for any colour");
// Nothing about the palette loosens the readability ceiling: every one of the twenty is clamped the same way, at
// every strength, behind the pages and behind the cards.
for (const th of THEMES) {
  const bgBad = PRESETS.filter((p) => [20, 40, 60, 80, 100].some((lv) => {
    const { color } = fullColourBg(th, p.hex, lv);
    return contrastRatio(THEME_INK[th].text, color) < AA_CONTRAST - 1e-9
      || contrastRatio(THEME_INK[th].muted, color) < AA_CONTRAST - 1e-9;
  }));
  is(`${th}: all twenty stay readable behind the pages`, bgBad.length === 0, bgBad.map((p) => p.id).join(", "));
  const cardBad = PRESETS.filter((p) => [20, 40, 60, 80, 100].some((lv) => !surfaceReadable(th, surfaceVars(th, p.hex, lv).vars["--surface"])));
  is(`${th}: and behind the cards`, cardBad.length === 0, cardBad.map((p) => p.id).join(", "));
}
// A bright colour has to be held back, or the guard would not be doing anything at all.
is("the brightest of them is clamped well short of the whole way in Navy",
  fullColourBg("dark", PRESETS.find((p) => p.id === "white")!.hex, 100).mix < 0.3);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
