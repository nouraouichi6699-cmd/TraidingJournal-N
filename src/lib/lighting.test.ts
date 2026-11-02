// Ambient lighting: palettes, strength, speed, the police flash rate and the session colour.
// Run: npx tsx src/lib/lighting.test.ts
import {
  auroraAlpha, buildPalette, clampLevel, DEFAULT_CUSTOM, DEFAULT_LIGHTING, dur, FLASHES_PER_CYCLE, hexRgb, levelT,
  lift, orbAlpha, orbSpread, paletteKey, policeAlpha, policeFlashesPerSecond, POLICE_SECONDS, SAFE_FLASHES_PER_SECOND,
  sessionNow, sessionTrio, speedFactor, SPEED_FACTOR, strip, type LightColor, type LightSpeed,
} from "./lighting";
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
