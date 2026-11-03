import {
  createMyTheme, DEFAULT_LOOK, deleteMyTheme, extractLook, getMyTheme,
  isBuiltIn, isDefaultLook, looksEqual, migrateToSingle, MY_THEME_ID,
  resolveTheme, updateLook,
  type CustomTheme, type ThemeLook,
} from "./customThemes";
import { DEFAULT_LIGHTING } from "./lighting";
import type { Theme } from "../types";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const eq = (name: string, got: unknown, want: unknown) => is(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const THEMES: Theme[] = ["dark", "light", "black"];

const customLook: ThemeLook = {
  ...DEFAULT_LOOK,
  style: "full",
  color: "gold",
  level: 90,
  speed: "fast",
  cardColor: "gold",
  cardLevel: 50,
};

const mk = (id: string, name: string, base: Theme = "dark", look: ThemeLook = customLook): CustomTheme =>
  ({ id, name, base, look: { ...look, custom: { ...look.custom } } });

// ---------- isBuiltIn ----------
console.log("-- isBuiltIn");
is("dark is built-in", isBuiltIn("dark"));
is("light is built-in", isBuiltIn("light"));
is("black is built-in", isBuiltIn("black"));
is("ct_1 is not built-in", !isBuiltIn("ct_1"));
is("empty string is not built-in", !isBuiltIn(""));
is("custom is not built-in", !isBuiltIn("custom"));
is("Dark (capital) is not built-in", !isBuiltIn("Dark"));

// ---------- looksEqual ----------
console.log("-- looksEqual");
is("same look is equal", looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK }));
is("different style is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, style: "full" }));
is("different color is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, color: "session" }));
is("different custom.a is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, custom: { ...DEFAULT_LOOK.custom, a: "#ff0000" } }));
is("different custom.b is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, custom: { ...DEFAULT_LOOK.custom, b: "#ff0000" } }));
is("different custom.c is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, custom: { ...DEFAULT_LOOK.custom, c: "#ff0000" } }));
is("different solid is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, solid: "#ff0000" }));
is("different level is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, level: 50 }));
is("different speed is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, speed: "fast" }));
is("different cardColor is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, cardColor: "gold" }));
is("different cardSolid is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, cardSolid: "#ff0000" }));
is("different cardLevel is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, cardLevel: 30 }));

// ---------- isDefaultLook ----------
console.log("-- isDefaultLook");
is("DEFAULT_LOOK is default", isDefaultLook(DEFAULT_LOOK));
is("a copy of DEFAULT_LOOK is default", isDefaultLook({ ...DEFAULT_LOOK }));
is("a changed look is not default", !isDefaultLook(customLook));
is("only style changed is not default", !isDefaultLook({ ...DEFAULT_LOOK, style: "full" }));
is("only cardColor changed is not default", !isDefaultLook({ ...DEFAULT_LOOK, cardColor: "gold" }));

// ---------- extractLook ----------
console.log("-- extractLook");
{
  const lighting = { ...DEFAULT_LIGHTING, playing: false, recentColors: ["#aaa"] };
  const look = extractLook(lighting);
  eq("extractLook matches DEFAULT_LOOK for default lighting", look.style, DEFAULT_LOOK.style);
  eq("extractLook: color", look.color, DEFAULT_LOOK.color);
  eq("extractLook: level", look.level, DEFAULT_LOOK.level);
  eq("extractLook: speed", look.speed, DEFAULT_LOOK.speed);
  eq("extractLook: cardColor", look.cardColor, DEFAULT_LOOK.cardColor);
  eq("extractLook: cardSolid", look.cardSolid, DEFAULT_LOOK.cardSolid);
  eq("extractLook: cardLevel", look.cardLevel, DEFAULT_LOOK.cardLevel);
  eq("extractLook: solid", look.solid, DEFAULT_LOOK.solid);
  is("extractLook result is default", isDefaultLook(look));
  is("extractLook does not include playing", !("playing" in look));
  is("extractLook does not include recentColors", !("recentColors" in look));
}
{
  const lighting = { ...DEFAULT_LIGHTING, style: "full" as const, level: 90, cardColor: "gold" as const };
  const look = extractLook(lighting);
  eq("extractLook picks up changed style", look.style, "full");
  eq("extractLook picks up changed level", look.level, 90);
  eq("extractLook picks up changed cardColor", look.cardColor, "gold");
  is("extractLook of non-default lighting is not default", !isDefaultLook(look));
}
{
  const trio = { a: "#aa0000", b: "#00bb00", c: "#0000cc" };
  const lighting = { ...DEFAULT_LIGHTING, custom: trio };
  const look = extractLook(lighting);
  eq("extractLook copies the trio", look.custom, trio);
  is("extractLook trio is a copy, not a reference", look.custom !== trio);
}

// ---------- resolveTheme ----------
console.log("-- resolveTheme");
{
  const customs = [mk(MY_THEME_ID, "My theme", "dark")];

  for (const th of THEMES) {
    const r = resolveTheme(th, customs, "dark");
    eq(`resolve built-in ${th}: base`, r.base, th);
    is(`resolve built-in ${th}: default look`, isDefaultLook(r.look));
  }

  {
    const r = resolveTheme("", customs, "light");
    eq("resolve empty id: base is deviceTheme", r.base, "light");
    is("resolve empty id: default look", isDefaultLook(r.look));
  }

  {
    const r = resolveTheme(MY_THEME_ID, customs, "dark");
    eq("resolve my theme: base", r.base, "dark");
    eq("resolve my theme: look style", r.look.style, customLook.style);
    eq("resolve my theme: look level", r.look.level, customLook.level);
  }

  {
    const r = resolveTheme("ct_99", customs, "black");
    eq("resolve missing custom: base is deviceTheme", r.base, "black");
    is("resolve missing custom: default look", isDefaultLook(r.look));
  }

  {
    const r = resolveTheme(MY_THEME_ID, [], "dark");
    eq("resolve in empty list: base is deviceTheme", r.base, "dark");
    is("resolve in empty list: default look", isDefaultLook(r.look));
  }
}
{
  // resolveTheme coerces removed styles to "off"
  const customs = [mk(MY_THEME_ID, "T", "dark", { ...customLook, style: "police" as any })];
  const r = resolveTheme(MY_THEME_ID, customs, "dark");
  eq("removed style coerced to off", r.look.style, "off");
}

// ---------- MY_THEME_ID ----------
console.log("-- MY_THEME_ID");
eq("canonical id", MY_THEME_ID, "ct_1");

// ---------- getMyTheme ----------
console.log("-- getMyTheme");
eq("empty list returns null", getMyTheme([]), null);
{
  const customs = [mk(MY_THEME_ID, "My theme")];
  is("returns the theme", getMyTheme(customs) !== null);
  eq("returns the right id", getMyTheme(customs)!.id, MY_THEME_ID);
}

// ---------- createMyTheme ----------
console.log("-- createMyTheme");
{
  const look: ThemeLook = { ...DEFAULT_LOOK, style: "full" };
  const result = createMyTheme("dark", look, "My theme");
  eq("created id", result.created.id, MY_THEME_ID);
  eq("created name", result.created.name, "My theme");
  eq("created base", result.created.base, "dark");
  eq("created look style", result.created.look.style, "full");
  is("created look is a copy", result.created.look !== look);
  is("created look custom is a copy", result.created.look.custom !== look.custom);
  eq("customs list has one entry", result.customs.length, 1);
}
{
  for (const th of THEMES) {
    const r = createMyTheme(th, DEFAULT_LOOK, "T");
    eq(`base ${th} is preserved`, r.created.base, th);
  }
}
{
  const look: ThemeLook = { ...DEFAULT_LOOK, speed: "fast", cardLevel: 30, cardColor: "gold" };
  const r = createMyTheme("dark", look, "T");
  eq("look speed", r.created.look.speed, "fast");
  eq("look cardLevel", r.created.look.cardLevel, 30);
  eq("look cardColor", r.created.look.cardColor, "gold");
}

// ---------- deleteMyTheme ----------
console.log("-- deleteMyTheme");
{
  const customs = [mk(MY_THEME_ID, "My theme", "light")];
  const result = deleteMyTheme(customs);
  eq("list is empty", result.customs.length, 0);
  eq("fallback base is light", result.fallbackBase, "light");
}
{
  const result = deleteMyTheme([]);
  eq("deleting from empty: list still empty", result.customs.length, 0);
  eq("fallback base defaults to dark", result.fallbackBase, "dark");
}
{
  for (const th of THEMES) {
    const r = deleteMyTheme([mk(MY_THEME_ID, "T", th)]);
    eq(`fallback base for ${th}`, r.fallbackBase, th);
  }
}

// ---------- updateLook ----------
console.log("-- updateLook");
{
  const customs = [mk(MY_THEME_ID, "T", "dark", { ...DEFAULT_LOOK })];
  const result = updateLook(customs, MY_THEME_ID, { style: "full" });
  eq("updates the right field", result[0].look.style, "full");
  eq("other fields unchanged", result[0].look.color, DEFAULT_LOOK.color);
  eq("level unchanged", result[0].look.level, DEFAULT_LOOK.level);
}
{
  const customs = [mk(MY_THEME_ID, "T", "dark", { ...DEFAULT_LOOK })];
  const result = updateLook(customs, MY_THEME_ID, { cardColor: "gold", cardLevel: 30 });
  eq("multiple fields: cardColor", result[0].look.cardColor, "gold");
  eq("multiple fields: cardLevel", result[0].look.cardLevel, 30);
}
{
  const customs = [mk(MY_THEME_ID, "T")];
  const result = updateLook(customs, "ct_99", { style: "off" });
  eq("updating non-existent: unchanged", result[0].look.style, customLook.style);
}
{
  const trio = { a: "#aa0000", b: "#00bb00", c: "#0000cc" };
  const customs = [mk(MY_THEME_ID, "T", "dark", { ...DEFAULT_LOOK })];
  const result = updateLook(customs, MY_THEME_ID, { color: "custom", custom: trio });
  eq("custom trio updated", result[0].look.custom, trio);
  eq("color updated", result[0].look.color, "custom");
}
{
  const customs = [mk(MY_THEME_ID, "My T", "light", { ...DEFAULT_LOOK })];
  const result = updateLook(customs, MY_THEME_ID, { style: "full" });
  eq("name unchanged", result[0].name, "My T");
  eq("base unchanged", result[0].base, "light");
}
{
  const customs = [mk(MY_THEME_ID, "T")];
  const result = updateLook(customs, MY_THEME_ID, { level: 50 });
  is("updateLook returns new array", result !== customs);
  is("original entry unchanged", customs[0].look.level === customLook.level);
}

// ---------- migrateToSingle ----------
console.log("-- migrateToSingle");
{
  const customs = [mk("ct_1", "Old 1", "dark"), mk("ct_2", "Old 2", "light")];
  const result = migrateToSingle(customs, "ct_2", "My theme");
  eq("keeps one theme", result.length, 1);
  eq("id is canonical", result[0].id, MY_THEME_ID);
  eq("name is new", result[0].name, "My theme");
  eq("picks the active one", result[0].base, "light");
}
{
  const customs = [mk("ct_1", "Old 1", "dark"), mk("ct_2", "Old 2", "light")];
  const result = migrateToSingle(customs, "ct_99", "My theme");
  eq("missing active: picks first", result[0].base, "dark");
}
{
  eq("empty list stays empty", migrateToSingle([], "ct_1", "T").length, 0);
}
{
  const customs = [mk("ct_5", "Only", "black", customLook)];
  const result = migrateToSingle(customs, "ct_5", "My theme");
  eq("single non-canonical id is normalised", result[0].id, MY_THEME_ID);
  eq("look is preserved", result[0].look.style, customLook.style);
  eq("base is preserved", result[0].base, "black");
}

// ---------- DEFAULT_LOOK matches DEFAULT_LIGHTING ----------
console.log("-- DEFAULT_LOOK matches DEFAULT_LIGHTING");
eq("style", DEFAULT_LOOK.style, DEFAULT_LIGHTING.style);
eq("color", DEFAULT_LOOK.color, DEFAULT_LIGHTING.color);
eq("custom", DEFAULT_LOOK.custom, DEFAULT_LIGHTING.custom);
eq("solid", DEFAULT_LOOK.solid, DEFAULT_LIGHTING.solid);
eq("level", DEFAULT_LOOK.level, DEFAULT_LIGHTING.level);
eq("speed", DEFAULT_LOOK.speed, DEFAULT_LIGHTING.speed);
eq("cardColor", DEFAULT_LOOK.cardColor, DEFAULT_LIGHTING.cardColor);
eq("cardSolid", DEFAULT_LOOK.cardSolid, DEFAULT_LIGHTING.cardSolid);
eq("cardLevel", DEFAULT_LOOK.cardLevel, DEFAULT_LIGHTING.cardLevel);

// ---------- round trips ----------
console.log("-- round trips and edge cases");
{
  const r1 = createMyTheme("dark", { ...DEFAULT_LOOK, style: "full" }, "My theme");
  const resolved1 = resolveTheme(r1.created.id, r1.customs, "dark");
  eq("round trip: base", resolved1.base, "dark");
  eq("round trip: style after create", resolved1.look.style, "full");

  const updated = updateLook(r1.customs, r1.created.id, { level: 50 });
  const resolved2 = resolveTheme(r1.created.id, updated, "dark");
  eq("round trip: level after update", resolved2.look.level, 50);
  eq("round trip: style preserved", resolved2.look.style, "full");
}
{
  const r1 = createMyTheme("light", customLook, "My theme");
  const after = deleteMyTheme(r1.customs);
  const resolved = resolveTheme(MY_THEME_ID, after.customs, "dark");
  eq("after delete: falls back to deviceTheme", resolved.base, "dark");
  is("after delete: default look", isDefaultLook(resolved.look));
}
{
  const r = resolveTheme(MY_THEME_ID, [], "light");
  eq("no customs + custom id: fallback to deviceTheme", r.base, "light");
  is("no customs + custom id: default look", isDefaultLook(r.look));
}
{
  const a: ThemeLook = { ...DEFAULT_LOOK, style: "full" };
  const b: ThemeLook = { ...DEFAULT_LOOK, style: "full" };
  is("looksEqual is symmetric: a=b", looksEqual(a, b));
  is("looksEqual is symmetric: b=a", looksEqual(b, a));
  is("looksEqual different: not symmetric trap", !looksEqual(a, DEFAULT_LOOK));
  is("looksEqual different: not symmetric trap reversed", !looksEqual(DEFAULT_LOOK, a));
}
{
  const lighting = { ...DEFAULT_LIGHTING, solid: "#abcdef", color: "solid" as const };
  const look = extractLook(lighting);
  eq("extractLook solid", look.solid, "#abcdef");
  eq("extractLook color", look.color, "solid");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
