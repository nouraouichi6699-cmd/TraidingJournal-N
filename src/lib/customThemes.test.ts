import {
  createOnFirstEdit, DEFAULT_LOOK, deleteTheme, duplicateTheme, extractLook,
  isBuiltIn, isDefaultLook, looksEqual, MAX_CUSTOM, migrateIfNeeded, nextFreeNumber,
  renameTheme, resolveTheme, updateLook,
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
  style: "police",
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
is("different style is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, style: "police" }));
is("different color is not equal", !looksEqual(DEFAULT_LOOK, { ...DEFAULT_LOOK, color: "gold" }));
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
is("only style changed is not default", !isDefaultLook({ ...DEFAULT_LOOK, style: "off" }));
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
  const lighting = { ...DEFAULT_LIGHTING, style: "police" as const, level: 90, cardColor: "gold" as const };
  const look = extractLook(lighting);
  eq("extractLook picks up changed style", look.style, "police");
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
  const customs = [mk("ct_1", "My theme 1", "dark"), mk("ct_2", "My theme 2", "light", { ...customLook, style: "orbs" })];

  // Built-in ids
  for (const th of THEMES) {
    const r = resolveTheme(th, customs, "dark");
    eq(`resolve built-in ${th}: base`, r.base, th);
    is(`resolve built-in ${th}: default look`, isDefaultLook(r.look));
  }

  // Empty id falls back to deviceTheme
  {
    const r = resolveTheme("", customs, "light");
    eq("resolve empty id: base is deviceTheme", r.base, "light");
    is("resolve empty id: default look", isDefaultLook(r.look));
  }

  // Custom id found
  {
    const r = resolveTheme("ct_1", customs, "dark");
    eq("resolve ct_1: base", r.base, "dark");
    eq("resolve ct_1: look style", r.look.style, customLook.style);
    eq("resolve ct_1: look level", r.look.level, customLook.level);
  }
  {
    const r = resolveTheme("ct_2", customs, "dark");
    eq("resolve ct_2: base", r.base, "light");
    eq("resolve ct_2: look style", r.look.style, "orbs");
  }

  // Custom id not found falls back
  {
    const r = resolveTheme("ct_99", customs, "black");
    eq("resolve missing custom: base is deviceTheme", r.base, "black");
    is("resolve missing custom: default look", isDefaultLook(r.look));
  }

  // Empty customs list
  {
    const r = resolveTheme("ct_1", [], "dark");
    eq("resolve in empty list: base is deviceTheme", r.base, "dark");
    is("resolve in empty list: default look", isDefaultLook(r.look));
  }
}

// ---------- nextFreeNumber ----------
console.log("-- nextFreeNumber");
eq("empty list gives 1", nextFreeNumber([]), 1);
eq("one theme named 1 gives 2", nextFreeNumber([mk("ct_1", "My theme 1")]), 2);
eq("themes 1 and 2 give 3", nextFreeNumber([mk("ct_1", "My theme 1"), mk("ct_2", "My theme 2")]), 3);
eq("gap at 2: themes 1 and 3 give 2", nextFreeNumber([mk("ct_1", "My theme 1"), mk("ct_3", "My theme 3")]), 2);
eq("gap at 1: themes 2 and 3 give 1", nextFreeNumber([mk("ct_2", "Th 2"), mk("ct_3", "Th 3")]), 1);
eq("a name without a number is ignored", nextFreeNumber([mk("ct_1", "Navy custom")]), 1);
eq("a name ending in 5 uses 5", nextFreeNumber([mk("ct_1", "Theme 5")]), 1);
eq("names 1 through 5 give 6", nextFreeNumber(
  [1, 2, 3, 4, 5].map((n) => mk(`ct_${n}`, `T ${n}`)),
), 6);
eq("trailing space after number: 1 is taken", nextFreeNumber([mk("ct_1", "T 1 ")]), 2);
{
  const ten = Array.from({ length: 10 }, (_, i) => mk(`ct_${i + 1}`, `T ${i + 1}`));
  eq("ten consecutive gives 11", nextFreeNumber(ten), 11);
}

// ---------- createOnFirstEdit ----------
console.log("-- createOnFirstEdit");
{
  const look: ThemeLook = { ...DEFAULT_LOOK, style: "police" };
  const result = createOnFirstEdit("dark", look, [], "My theme 1");
  is("creates a theme", result !== null);
  eq("created id is ct_1", result!.created.id, "ct_1");
  eq("created name", result!.created.name, "My theme 1");
  eq("created base", result!.created.base, "dark");
  eq("created look style", result!.created.look.style, "police");
  is("created look is a copy", result!.created.look !== look);
  is("created look custom is a copy", result!.created.look.custom !== look.custom);
  eq("customs list has one entry", result!.customs.length, 1);
  eq("the entry is the created theme", result!.customs[0].id, "ct_1");
}
{
  // Second creation gets ct_2
  const first = [mk("ct_1", "My theme 1")];
  const look: ThemeLook = { ...DEFAULT_LOOK, color: "gold" };
  const result = createOnFirstEdit("light", look, first, "My theme 2");
  eq("second created id is ct_2", result!.created.id, "ct_2");
  eq("customs list has two entries", result!.customs.length, 2);
  eq("original is still there", result!.customs[0].id, "ct_1");
}
{
  // Fills a gap
  const customs = [mk("ct_1", "T 1"), mk("ct_3", "T 3")];
  const result = createOnFirstEdit("dark", DEFAULT_LOOK, customs, "T 2");
  eq("fills gap: id is ct_2", result!.created.id, "ct_2");
}
{
  // At the limit of 10
  const ten = Array.from({ length: 10 }, (_, i) => mk(`ct_${i + 1}`, `T ${i + 1}`));
  const result = createOnFirstEdit("dark", DEFAULT_LOOK, ten, "T 11");
  eq("at limit: returns null", result, null);
}
{
  // Base is preserved
  for (const th of THEMES) {
    const r = createOnFirstEdit(th, DEFAULT_LOOK, [], "T");
    eq(`base ${th} is preserved`, r!.created.base, th);
  }
}
{
  // Look patch is applied correctly
  const look: ThemeLook = { ...DEFAULT_LOOK, speed: "fast", cardLevel: 30, cardColor: "gold" };
  const r = createOnFirstEdit("dark", look, [], "T");
  eq("look speed", r!.created.look.speed, "fast");
  eq("look cardLevel", r!.created.look.cardLevel, 30);
  eq("look cardColor", r!.created.look.cardColor, "gold");
  eq("look style stays default", r!.created.look.style, DEFAULT_LOOK.style);
}

// ---------- migrateIfNeeded ----------
console.log("-- migrateIfNeeded");
{
  const result = migrateIfNeeded(customLook, "dark", [], "My theme 1");
  is("migrates non-default look", result !== null);
  eq("migrated id is ct_1", result!.created.id, "ct_1");
  eq("migrated name", result!.created.name, "My theme 1");
  eq("migrated base", result!.created.base, "dark");
  eq("migrated look matches input", result!.created.look.style, customLook.style);
  eq("migrated look level", result!.created.look.level, customLook.level);
  eq("migrated look speed", result!.created.look.speed, customLook.speed);
  eq("migrated look cardColor", result!.created.look.cardColor, customLook.cardColor);
  is("migrated look custom is a copy", result!.created.look.custom !== customLook.custom);
  eq("customs list has one entry", result!.customs.length, 1);
}
{
  const result = migrateIfNeeded(DEFAULT_LOOK, "dark", [], "My theme 1");
  eq("default look returns null", result, null);
}
{
  const result = migrateIfNeeded({ ...DEFAULT_LOOK }, "light", [], "My theme 1");
  eq("copy of default look returns null", result, null);
}
{
  const ten = Array.from({ length: 10 }, (_, i) => mk(`ct_${i + 1}`, `T ${i + 1}`));
  const result = migrateIfNeeded(customLook, "dark", ten, "T 11");
  eq("at limit: returns null", result, null);
}
{
  for (const th of THEMES) {
    const r = migrateIfNeeded(customLook, th, [], "T");
    eq(`migrate base ${th}`, r!.created.base, th);
  }
}
{
  // Existing customs: id does not collide
  const existing = [mk("ct_1", "T 1")];
  const r = migrateIfNeeded(customLook, "dark", existing, "T 2");
  eq("does not collide with existing ct_1", r!.created.id, "ct_2");
  eq("existing theme preserved", r!.customs[0].id, "ct_1");
  eq("new theme added", r!.customs[1].id, "ct_2");
}

// ---------- duplicateTheme ----------
console.log("-- duplicateTheme");
{
  const customs = [mk("ct_1", "My theme 1", "dark", customLook)];
  const result = duplicateTheme(customs, "ct_1", "My theme 1 copy");
  is("duplicates successfully", result !== null);
  eq("duplicated id is ct_2", result!.duplicated.id, "ct_2");
  eq("duplicated name", result!.duplicated.name, "My theme 1 copy");
  eq("duplicated base", result!.duplicated.base, "dark");
  eq("duplicated look style", result!.duplicated.look.style, customLook.style);
  eq("duplicated look level", result!.duplicated.look.level, customLook.level);
  is("duplicated look is a copy", result!.duplicated.look !== customs[0].look);
  is("duplicated look custom is a copy", result!.duplicated.look.custom !== customs[0].look.custom);
  eq("customs list has two entries", result!.customs.length, 2);
  eq("original untouched", result!.customs[0].name, "My theme 1");
}
{
  // Source not found
  const customs = [mk("ct_1", "T 1")];
  const result = duplicateTheme(customs, "ct_99", "T copy");
  eq("missing source returns null", result, null);
}
{
  // At the limit of 10
  const ten = Array.from({ length: 10 }, (_, i) => mk(`ct_${i + 1}`, `T ${i + 1}`));
  const result = duplicateTheme(ten, "ct_1", "T copy");
  eq("at limit: returns null", result, null);
}
{
  // Duplicate with gap fills the gap
  const customs = [mk("ct_1", "T 1"), mk("ct_3", "T 3")];
  const r = duplicateTheme(customs, "ct_1", "T copy");
  eq("fills gap: id is ct_2", r!.duplicated.id, "ct_2");
}
{
  // Duplicate preserves base
  const customs = [mk("ct_1", "T 1", "light")];
  const r = duplicateTheme(customs, "ct_1", "T copy");
  eq("preserves base", r!.duplicated.base, "light");
}

// ---------- deleteTheme ----------
console.log("-- deleteTheme");
{
  const customs = [mk("ct_1", "T 1", "dark"), mk("ct_2", "T 2", "light")];
  const result = deleteTheme(customs, "ct_1");
  eq("removes the right theme", result.customs.length, 1);
  eq("remaining is ct_2", result.customs[0].id, "ct_2");
  eq("fallback base is the deleted theme's base", result.fallbackBase, "dark");
}
{
  const customs = [mk("ct_1", "T 1", "light")];
  const result = deleteTheme(customs, "ct_1");
  eq("single theme: list is empty", result.customs.length, 0);
  eq("fallback base is light", result.fallbackBase, "light");
}
{
  const customs = [mk("ct_1", "T 1", "dark")];
  const result = deleteTheme(customs, "ct_99");
  eq("deleting non-existent: list unchanged", result.customs.length, 1);
  eq("fallback base defaults to dark", result.fallbackBase, "dark");
}
{
  const result = deleteTheme([], "ct_1");
  eq("deleting from empty: list still empty", result.customs.length, 0);
  eq("fallback base defaults to dark", result.fallbackBase, "dark");
}
{
  for (const th of THEMES) {
    const r = deleteTheme([mk("ct_1", "T", th)], "ct_1");
    eq(`fallback base for ${th}`, r.fallbackBase, th);
  }
}
{
  // Delete does not affect other themes
  const customs = [mk("ct_1", "T 1"), mk("ct_2", "T 2"), mk("ct_3", "T 3")];
  const r = deleteTheme(customs, "ct_2");
  eq("two remain", r.customs.length, 2);
  eq("ct_1 still there", r.customs[0].id, "ct_1");
  eq("ct_3 still there", r.customs[1].id, "ct_3");
}

// ---------- renameTheme ----------
console.log("-- renameTheme");
{
  const customs = [mk("ct_1", "Old name"), mk("ct_2", "Other")];
  const result = renameTheme(customs, "ct_1", "New name");
  eq("renames the right theme", result[0].name, "New name");
  eq("does not affect other themes", result[1].name, "Other");
  eq("list length unchanged", result.length, 2);
}
{
  const customs = [mk("ct_1", "T 1")];
  const result = renameTheme(customs, "ct_99", "New");
  eq("renaming non-existent: unchanged", result[0].name, "T 1");
}
{
  const customs = [mk("ct_1", "T 1")];
  const result = renameTheme(customs, "ct_1", "");
  eq("empty name is accepted", result[0].name, "");
}
{
  const customs = [mk("ct_1", "T 1")];
  const result = renameTheme(customs, "ct_1", "سمتي الأولى");
  eq("arabic name is accepted", result[0].name, "سمتي الأولى");
}

// ---------- updateLook ----------
console.log("-- updateLook");
{
  const customs = [mk("ct_1", "T 1", "dark", { ...DEFAULT_LOOK })];
  const result = updateLook(customs, "ct_1", { style: "police" });
  eq("updates the right field", result[0].look.style, "police");
  eq("other fields unchanged", result[0].look.color, DEFAULT_LOOK.color);
  eq("level unchanged", result[0].look.level, DEFAULT_LOOK.level);
}
{
  const customs = [mk("ct_1", "T 1"), mk("ct_2", "T 2")];
  const result = updateLook(customs, "ct_1", { level: 50 });
  eq("does not affect other themes", result[1].look.level, customLook.level);
  eq("updated theme has new level", result[0].look.level, 50);
}
{
  const customs = [mk("ct_1", "T 1", "dark", { ...DEFAULT_LOOK })];
  const result = updateLook(customs, "ct_1", { cardColor: "gold", cardLevel: 30 });
  eq("multiple fields: cardColor", result[0].look.cardColor, "gold");
  eq("multiple fields: cardLevel", result[0].look.cardLevel, 30);
}
{
  const customs = [mk("ct_1", "T 1")];
  const result = updateLook(customs, "ct_99", { style: "off" });
  eq("updating non-existent: unchanged", result[0].look.style, customLook.style);
}
{
  const trio = { a: "#aa0000", b: "#00bb00", c: "#0000cc" };
  const customs = [mk("ct_1", "T 1", "dark", { ...DEFAULT_LOOK })];
  const result = updateLook(customs, "ct_1", { color: "custom", custom: trio });
  eq("custom trio updated", result[0].look.custom, trio);
  eq("color updated", result[0].look.color, "custom");
}
{
  // Name and base are not affected by updateLook
  const customs = [mk("ct_1", "My T", "light", { ...DEFAULT_LOOK })];
  const result = updateLook(customs, "ct_1", { style: "orbs" });
  eq("name unchanged", result[0].name, "My T");
  eq("base unchanged", result[0].base, "light");
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

// ---------- MAX_CUSTOM ----------
console.log("-- MAX_CUSTOM");
eq("limit is 10", MAX_CUSTOM, 10);

// ---------- round trips ----------
console.log("-- round trips and edge cases");
{
  // Create, then resolve, then update, then resolve again
  const r1 = createOnFirstEdit("dark", { ...DEFAULT_LOOK, style: "orbs" }, [], "T 1");
  const resolved1 = resolveTheme(r1!.created.id, r1!.customs, "dark");
  eq("round trip: base", resolved1.base, "dark");
  eq("round trip: style after create", resolved1.look.style, "orbs");

  const updated = updateLook(r1!.customs, r1!.created.id, { level: 50 });
  const resolved2 = resolveTheme(r1!.created.id, updated, "dark");
  eq("round trip: level after update", resolved2.look.level, 50);
  eq("round trip: style preserved", resolved2.look.style, "orbs");
}
{
  // Create, duplicate, delete original, resolve duplicate
  const r1 = createOnFirstEdit("light", customLook, [], "T 1");
  const r2 = duplicateTheme(r1!.customs, "ct_1", "T 1 copy");
  const after = deleteTheme(r2!.customs, "ct_1");
  const resolved = resolveTheme("ct_2", after.customs, "dark");
  eq("after delete original: duplicate resolves", resolved.base, "light");
  eq("after delete original: style from duplicate", resolved.look.style, customLook.style);
}
{
  // Ten themes, create fails, duplicate fails
  const customs = Array.from({ length: 10 }, (_, i) => mk(`ct_${i + 1}`, `T ${i + 1}`));
  eq("create at limit: null", createOnFirstEdit("dark", DEFAULT_LOOK, customs, "T"), null);
  eq("duplicate at limit: null", duplicateTheme(customs, "ct_1", "T"), null);
  eq("migrate at limit: null", migrateIfNeeded(customLook, "dark", customs, "T"), null);
  // Delete one, then create succeeds
  const after = deleteTheme(customs, "ct_5");
  const r = createOnFirstEdit("dark", DEFAULT_LOOK, after.customs, "T 5");
  is("create after delete succeeds", r !== null);
  eq("new id fills the gap", r!.created.id, "ct_5");
}
{
  // Rename + resolve
  const customs = [mk("ct_1", "Old", "dark")];
  const renamed = renameTheme(customs, "ct_1", "New");
  const r = resolveTheme("ct_1", renamed, "dark");
  eq("resolve after rename: base", r.base, "dark");
  eq("resolve after rename: look unchanged", r.look.style, customLook.style);
}
{
  // resolveTheme with no customs and non-built-in id
  const r = resolveTheme("ct_1", [], "light");
  eq("no customs + custom id: fallback to deviceTheme", r.base, "light");
  is("no customs + custom id: default look", isDefaultLook(r.look));
}
{
  // looksEqual is symmetric
  const a: ThemeLook = { ...DEFAULT_LOOK, style: "police" };
  const b: ThemeLook = { ...DEFAULT_LOOK, style: "police" };
  is("looksEqual is symmetric: a=b", looksEqual(a, b));
  is("looksEqual is symmetric: b=a", looksEqual(b, a));
  is("looksEqual different: not symmetric trap", !looksEqual(a, DEFAULT_LOOK));
  is("looksEqual different: not symmetric trap reversed", !looksEqual(DEFAULT_LOOK, a));
}
{
  // nextFreeNumber with mixed names
  const customs = [mk("ct_1", "My 3"), mk("ct_2", "Navy remix"), mk("ct_3", "Theme 1")];
  eq("mixed names: 1 and 3 taken, 2 is free", nextFreeNumber(customs), 2);
}
{
  // nextFreeNumber with duplicate numbers in names
  const customs = [mk("ct_1", "T 1"), mk("ct_2", "T 1")];
  eq("duplicate name numbers: 2 is free", nextFreeNumber(customs), 2);
}
{
  // extractLook preserves solid
  const lighting = { ...DEFAULT_LIGHTING, solid: "#abcdef", color: "solid" as const };
  const look = extractLook(lighting);
  eq("extractLook solid", look.solid, "#abcdef");
  eq("extractLook color", look.color, "solid");
}
{
  // createOnFirstEdit does not modify input customs
  const original = [mk("ct_1", "T 1")];
  const frozen = [...original];
  createOnFirstEdit("dark", DEFAULT_LOOK, original, "T 2");
  eq("input customs not modified", original.length, frozen.length);
}
{
  // updateLook returns new array
  const customs = [mk("ct_1", "T 1")];
  const result = updateLook(customs, "ct_1", { level: 50 });
  is("updateLook returns new array", result !== customs);
  is("original entry unchanged", customs[0].look.level === customLook.level);
}
{
  // deleteTheme returns new array
  const customs = [mk("ct_1", "T 1"), mk("ct_2", "T 2")];
  const result = deleteTheme(customs, "ct_1");
  eq("original length unchanged", customs.length, 2);
  eq("result length", result.customs.length, 1);
}
{
  // renameTheme returns new array
  const customs = [mk("ct_1", "T 1")];
  const result = renameTheme(customs, "ct_1", "New");
  is("renameTheme returns new array", result !== customs);
  eq("original name unchanged", customs[0].name, "T 1");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
