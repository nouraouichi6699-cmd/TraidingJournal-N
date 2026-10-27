// The trader's own strategies: the tools catalog, cleaning and saving, colors, and how they meet the journal links.
// Run: npx tsx src/lib/customStrategies.test.ts
import { readFileSync } from "node:fs";
import { TOOLS, TOOL_GROUPS, TOOL_GROUP_LABEL, toolName } from "./tools";
import { COLORS, CUSTOM_KEY, LIMITS, cleanCustom, inkOn, isCustomId, newCustomId, readCustom, removeCustom, saveCustom, type CustomStrategy } from "./customStrategies";
import { LINK_KEY, MINE_KEY, deleteCustom, linkTrade, readLinks, readMine, shownOf } from "./myStrategies";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const J = JSON.stringify;
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; },
} as Storage;

// ---- the catalog
is("about 90 tools", TOOLS.length >= 80 && TOOLS.length <= 100, String(TOOLS.length));
is("tool ids are unique", new Set(TOOLS.map((t) => t.id)).size === TOOLS.length);
is("every group has tools and a name in every language", TOOL_GROUPS.every((g) => TOOLS.some((t) => t.g === g) && ["en", "ar", "fr"].every((l) => TOOL_GROUP_LABEL[g][l as "en"].length > 1)));
is("the classic indicators are there", ["rsi", "macd", "ema", "sma", "bb", "atr", "stoch", "ichimoku", "vwap", "vprofile", "fvg", "ob", "fib", "killzones"].every((id) => TOOLS.some((t) => t.id === id)));
is("Arabic names are in Arabic", TOOLS.filter((t) => t.ar).every((t) => /[؀-ۿ]/.test(t.ar as string)));
is("a tool without a translation keeps its name", toolName(TOOLS.find((t) => t.id === "rsi")!, "ar") === "RSI" && toolName(TOOLS.find((t) => t.id === "trendline")!, "ar") === "خط الاتجاه");

// ---- cleaning
const id = newCustomId();
is("new ids look like the trader's own", isCustomId(id) && id !== newCustomId(), id);
is("library ids are not the trader's own", !isCustomId("smc") && !isCustomId("c-") && !isCustomId("c-AB12"));
const c = cleanCustom({ id, name: "  My London scalp  ", color: "#38BDF8", tools: ["ema", "rsi", "nope", "ema", 7], check: [" EMA 50 above EMA 200 ", "", "RSI over 50"], stop: " under the swing ", target: "2R", notes: "x".repeat(3000), at: 5 });
is("name trimmed", c?.name === "My London scalp", J(c?.name));
is("color kept, lower case", c?.color === "#38bdf8");
is("unknown and repeated tools left out", J(c?.tools) === J(["ema", "rsi"]), J(c?.tools));
is("empty checklist lines dropped, others trimmed", J(c?.check) === J(["EMA 50 above EMA 200", "RSI over 50"]), J(c?.check));
is("stop and target trimmed", c?.stop === "under the swing" && c?.target === "2R");
is("notes cut to size", c?.notes.length === LIMITS.notes);
is("no name, not kept", cleanCustom({ id, name: "   " }) === null && cleanCustom({ id: "smc", name: "x" }) === null && cleanCustom(null) === null);
is("a bad color falls back to the first", cleanCustom({ id, name: "x", color: "red" })?.color === COLORS[0]);
is("a long name is cut", cleanCustom({ id, name: "n".repeat(80) })?.name.length === LIMITS.name);
is("at most 12 checklist lines", cleanCustom({ id, name: "x", check: Array.from({ length: 20 }, (_, i) => `rule ${i}`) })?.check.length === LIMITS.check);

// ---- saving
const a: CustomStrategy = { id: "c-aaaa1", name: "A", color: "#22c55e", tools: ["vwap"], check: [], stop: "", target: "", notes: "", at: 1 };
const b: CustomStrategy = { ...a, id: "c-bbbb2", name: "B", color: "#f472b6" };
saveCustom(a); saveCustom(b);
is("saved in order", J(readCustom().map((x) => x.name)) === J(["A", "B"]));
saveCustom({ ...a, name: "A2", tools: ["vwap", "atr"] });
is("an edit replaces it in place", J(readCustom().map((x) => x.name)) === J(["A2", "B"]) && J(readCustom()[0].tools) === J(["vwap", "atr"]));
is("a strategy with no name is not saved", saveCustom({ ...b, id: "c-cccc3", name: "" }).length === 2);
store.set(CUSTOM_KEY, J([a, a, { nonsense: true }, b]));
is("repeats and broken entries left out on reading", J(readCustom().map((x) => x.id)) === J(["c-aaaa1", "c-bbbb2"]));
store.set(CUSTOM_KEY, "not json");
is("broken storage reads as empty", readCustom().length === 0);
saveCustom(a); saveCustom(b);
removeCustom("c-aaaa1");
is("removed", J(readCustom().map((x) => x.id)) === J(["c-bbbb2"]));
saveCustom(a);

// ---- with the journal: links, my strategies, deleting
store.set(MINE_KEY, J(["smc"]));
linkTrade("A:1", "c-aaaa1"); linkTrade("A:2", "c-bbbb2"); linkTrade("A:3", "smc");
is("trades linked to the trader's own", readLinks()["A:1"] === "c-aaaa1" && readLinks()["A:2"] === "c-bbbb2");
is("they join my strategies", J(readMine()) === J(["smc", "c-aaaa1", "c-bbbb2"]), J(readMine()));
is("shown with their name and color", J(shownOf("c-bbbb2", readCustom())) === J({ id: "c-bbbb2", name: "B", short: "B", color: "#f472b6" }));
is("library strategies shown with their short name", shownOf("smc", readCustom())?.short === "SMC" && shownOf("smc", readCustom())?.color === undefined);
// a link to a strategy not on this device yet (made on another device, not synced yet) is kept, but not shown
linkTrade("A:4", "c-zzzz9");
is("a link to an unknown strategy is kept in storage", JSON.parse(store.get(LINK_KEY) as string)["A:4"] === "c-zzzz9");
is("but not shown", !("A:4" in readLinks()));
deleteCustom("c-aaaa1");
is("deleting: gone from the list", !readCustom().some((x) => x.id === "c-aaaa1"));
is("deleting: its trades are unlinked", !("A:1" in JSON.parse(store.get(LINK_KEY) as string)) && readLinks()["A:2"] === "c-bbbb2" && readLinks()["A:3"] === "smc");
is("deleting: out of my strategies", J(readMine()) === J(["smc", "c-bbbb2"]), J(readMine()));

// ---- colors
is("dark text on light colors", COLORS.every((x) => inkOn(x) === "#0b0b0b"), COLORS.filter((x) => inkOn(x) !== "#0b0b0b").join());
is("light text on dark colors", inkOn("#0a1f5c") === "#ffffff" && inkOn("#000000") === "#ffffff" && inkOn("#7f1d1d") === "#ffffff");
is("12 ready colors, all different", COLORS.length === 12 && new Set(COLORS).size === 12);

// ---- sync
const sync = readFileSync(new URL("./settingsSync.ts", import.meta.url), "utf8");
is("the trader's own strategies follow them to other devices", sync.includes(`"${CUSTOM_KEY}"`));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
