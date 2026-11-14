// Run: npx tsx src/lib/tradeMode.test.ts
import { asTradeMode, sharedTradeMode, tradeModeWord, tradeModeTooltip } from "./tradeMode";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, exp: unknown) => { const c = JSON.stringify(got) === JSON.stringify(exp); c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : `  got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`}`); };

eq("asTradeMode keeps the three values", ["demo", "contest", "real"].map(asTradeMode), ["demo", "contest", "real"]);
eq("asTradeMode: anything else is unknown", ["paper", "", null, undefined, 42, "REAL"].map(asTradeMode), [null, null, null, null, null, null]);

eq("shared: empty group has no mode", sharedTradeMode([]), null);
eq("shared: one real account", sharedTradeMode([{ tradeMode: "real" }]), "real");
eq("shared: one account with no mode", sharedTradeMode([{}]), null);
eq("shared: all real", sharedTradeMode([{ tradeMode: "real" }, { tradeMode: "real" }]), "real");
eq("shared: all demo", sharedTradeMode([{ tradeMode: "demo" }, { tradeMode: "demo" }]), "demo");
eq("shared: real + demo differ -> nothing", sharedTradeMode([{ tradeMode: "real" }, { tradeMode: "demo" }]), null);
eq("shared: one unknown spoils it", sharedTradeMode([{ tradeMode: "real" }, {}]), null);

eq("word: real=Verified, demo=Demo, contest=Contest, null/undefined=Unverified", [tradeModeWord("real"), tradeModeWord("demo"), tradeModeWord("contest"), tradeModeWord(null), tradeModeWord(undefined)], ["Verified", "Demo", "Contest", "Unverified", "Unverified"]);

eq("tooltip: real contains 'real MT5' and 'credibility'", tradeModeTooltip("real").includes("real MT5") && tradeModeTooltip("real").includes("credibility"), true);
eq("tooltip: demo contains 'demo' and 'practice'", tradeModeTooltip("demo").includes("demo") && tradeModeTooltip("demo").includes("practice"), true);
eq("tooltip: contest contains 'contest' and 'compete'", tradeModeTooltip("contest").includes("contest") && tradeModeTooltip("contest").includes("compete"), true);
eq("tooltip: null contains 'no MT5 verification'", tradeModeTooltip(null).includes("no MT5 verification"), true);
eq("tooltip: undefined same as null", tradeModeTooltip(undefined), tradeModeTooltip(null));
eq("tooltip: all four return non-empty strings", ["real", "demo", "contest", null].map((m) => tradeModeTooltip(m as never).length > 0), [true, true, true, true]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
