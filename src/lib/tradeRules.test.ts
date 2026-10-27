// The rules sent to the Telegram bot and the answers read back. Run: npx tsx src/lib/tradeRules.test.ts
import type { Trade } from "../types";
import { ANSWERS_KEY, BOT_KEY, botRulesOf, publishBotRules, readAnswers, ruleResults } from "./tradeRules";
import { EN } from "./strategyText.en";
import { AR } from "./strategyText.ar";
import type { CustomStrategy } from "./customStrategies";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const J = JSON.stringify;
const store = new Map<string, string>();
let events = 0;
const g = globalThis as unknown as { localStorage: Storage; window: { dispatchEvent: (e: Event) => boolean } };
g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
g.window = { dispatchEvent: () => { events++; return true; } };

const own = (id: string, name: string, check: string[]): CustomStrategy => ({ id: id as CustomStrategy["id"], name, color: "#38bdf8", tools: [], check, stop: "", target: "", notes: "", at: 1 });
const custom = [own("c-aaaa1", "basic order_flow", ["wait to break val & vah", "wait for absorption"]), own("c-bbbb2", "empty", [])];

// ---- what the bot gets
const r = botRulesOf("en", ["smc", "c-aaaa1", "c-bbbb2", "orb"], custom, EN);
is("in the trader's order, those without rules left out", J(r.list.map((x) => x.id)) === J(["smc", "c-aaaa1", "orb"]), J(r.list.map((x) => x.id)));
is("a library strategy: its short name and its entry checklist", r.list[0].name === "SMC" && J(r.list[0].rules) === J(EN.smc.check));
is("the trader's own: its name and its checklist", r.list[1].name === "basic order_flow" && r.list[1].rules.length === 2);
is("the language is sent too", r.lang === "en");
is("library rules in the trader's language", J(botRulesOf("ar", ["smc"], [], AR).list[0].rules) === J(AR.smc.check));
is("no library text: library strategies left out, the trader's own kept", J(botRulesOf("en", ["smc", "c-aaaa1"], custom, null).list.map((x) => x.id)) === J(["c-aaaa1"]));
const many = Array.from({ length: 12 }, (_, i) => own(`c-zz${i}xx`, `S${i}`, ["r"]));
is("8 strategies at most", botRulesOf("en", many.map((x) => x.id), many, null).list.length === 8);

// ---- published on change only
store.set("mizan-custom-strategies", J(custom));
store.set("mizan-my-strategies", J(["c-aaaa1", "smc"]));
await publishBotRules("en");
const first = store.get(BOT_KEY);
is("published", !!first && J(JSON.parse(first as string).list.map((x: { id: string }) => x.id)) === J(["c-aaaa1", "smc"]), String(first));
let writes = 0;
const set0 = g.localStorage.setItem;
g.localStorage.setItem = (k: string, v: string) => { if (k === BOT_KEY) writes++; set0(k, v); };
await publishBotRules("en");
is("not written again when nothing changed", writes === 0);
await publishBotRules("fr");
is("written again when the language changes", writes === 1 && JSON.parse(store.get(BOT_KEY) as string).lang === "fr");
g.localStorage.setItem = set0;

// ---- a change to the trader's strategies is announced (the app sends the rules again)
const { setMine } = await import("./myStrategies");
const { saveCustom } = await import("./customStrategies");
const e0 = events;
setMine("orb", true);
saveCustom(own("c-cccc3", "New", ["x"]));
is("changes announced", events >= e0 + 2, `${events - e0}`);

// ---- the answers
store.set(ANSWERS_KEY, J({ "A:1": { s: "c-aaaa1", b: [], done: true }, "A:2": { s: "c-aaaa1", b: [1] }, "A:3": { s: "c-aaaa1", b: [-1] }, "A:4": { b: [0] }, "A:5": "x" }));
is("answers read, broken ones left out", J(Object.keys(readAnswers())) === J(["A:1", "A:2"]), J(Object.keys(readAnswers())));
store.set(ANSWERS_KEY, "no");
is("broken storage reads as empty", J(readAnswers()) === "{}");

const tr = (key: string, pnl: number | null): Trade => ({ key, accountId: "A", no: 1, symbol: "XAUUSD", side: "long", qty: 1, entryTime: "2026-10-27T10:00", entryPrice: 1, exitTime: pnl == null ? null : "2026-10-27T11:00", exitPrice: pnl == null ? null : 1, pnl, returnPct: null, commission: 0, status: pnl == null ? "open" : "closed" });
const trades = [tr("A:1", 100), tr("A:2", 80), tr("A:3", -60), tr("A:4", -40), tr("A:5", -30), tr("A:6", 50), tr("A:7", null), tr("A:8", 20)];
const ans = {
  "A:1": { s: "c-aaaa1", b: [], done: true }, "A:2": { s: "c-aaaa1", b: [], done: true }, // kept: +100, +80
  "A:3": { s: "c-aaaa1", b: [1] }, "A:4": { s: "c-aaaa1", b: [0, 1], done: true }, "A:5": { s: "c-aaaa1", b: [0] }, // broken
  "A:6": { s: "smc", b: [], done: true }, // another strategy
  "A:7": { s: "c-aaaa1", b: [1] }, // still open
  "A:8": { s: "c-aaaa1", b: [] }, // nothing chosen, not done: not counted
};
const rr = ruleResults("c-aaaa1", trades, ans, 2);
is("answered: kept + broken closed trades", rr.answered === 5, String(rr.answered));
is("all rules kept", rr.kept.n === 2 && rr.kept.net === 180 && rr.kept.winRate === 100, J(rr.kept));
is("a rule broken", rr.broke.n === 3 && rr.broke.net === -130 && rr.broke.winRate === 0, J(rr.broke));
is("each rule, the costliest first", J(rr.each.map((x) => [x.i, x.n, x.net])) === J([[1, 2, -100], [0, 2, -70]]), J(rr.each));
is("a rule index past the list is ignored", ruleResults("c-aaaa1", trades, ans, 1).each.every((x) => x.i === 0));
is("another strategy's answers are not mixed in", ruleResults("smc", trades, ans, 5).answered === 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
