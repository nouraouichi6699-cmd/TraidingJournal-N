import { symbolColor, withSymbolColor } from "./symbolColors";
import { DEFAULTS } from "../useSettings";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const c = JSON.stringify(got) === JSON.stringify(want); c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`); };

eq("default setting is an empty map", DEFAULTS.symbolColors, {});
eq("no map falls back to auto", symbolColor(undefined, "EURUSD", "AUTO"), "AUTO");
eq("symbol without a manual colour falls back", symbolColor({ GBPUSD: "#112233" }, "EURUSD", "AUTO"), "AUTO");
eq("manual colour wins", symbolColor({ EURUSD: "#112233" }, "EURUSD", "AUTO"), "#112233");
eq("manual colour is normalised to lowercase", symbolColor({ EURUSD: "#AABBCC" }, "EURUSD", "AUTO"), "#aabbcc");
eq("a corrupt stored value falls back", symbolColor({ EURUSD: "red" }, "EURUSD", "AUTO"), "AUTO");
eq("prototype names do not leak", symbolColor({}, "constructor", "AUTO"), "AUTO");

const a = { XAUUSD: "#112233" };
eq("set adds", withSymbolColor(a, "EURUSD", "#ABCDEF"), { XAUUSD: "#112233", EURUSD: "#abcdef" });
eq("set replaces", withSymbolColor(a, "XAUUSD", "#000000"), { XAUUSD: "#000000" });
eq("null resets to automatic", withSymbolColor(a, "XAUUSD", null), {});
eq("invalid hex resets rather than storing rubbish", withSymbolColor(a, "XAUUSD", "nope"), {});
eq("input is not mutated", a, { XAUUSD: "#112233" });
eq("undefined map is fine", withSymbolColor(undefined, "X", "#010203"), { X: "#010203" });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
