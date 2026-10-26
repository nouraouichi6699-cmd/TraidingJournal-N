// Symbol search for the pickers. Run: npx tsx src/lib/symbols.test.ts
import { cleanSymbol, searchSymbols } from "./symbols";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const J = JSON.stringify;

const all = searchSymbols("", ["XAUUSD", "EURUSD.m"]);
is("the trader's own come first", all[0].group === "mine" && J(all[0].list) === J(["XAUUSD", "EURUSD.m"]));
is("not listed twice: XAUUSD left out of metals", !all.find((g) => g.group === "metals")!.list.includes("XAUUSD"));
is("every group is there", J(all.map((g) => g.group)) === J(["mine", "fx", "metals", "indices", "energy", "crypto"]));
const us = searchSymbols("usd.m", ["EURUSD.m", "GBPJPY"]);
is("search ignores case and dots: usd.m finds EURUSD.m first", us[0].group === "mine" && J(us[0].list) === J(["EURUSD.m"]), J(us));
const nas = searchSymbols("nas", []);
is("nas: NAS100 in the indices only", nas.length === 1 && nas[0].group === "indices" && J(nas[0].list) === J(["NAS100"]), J(nas));
is("nothing found: no group", searchSymbols("zzzz", ["XAUUSD"]).length === 0);
is("clean: the name in capitals, the suffix as typed", cleanSymbol(" xauusd.m ") === "XAUUSD.m" && cleanSymbol("ger 40") === "GER40" && cleanSymbol("btc/usd") === "BTCUSD");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
