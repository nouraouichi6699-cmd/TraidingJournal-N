import { applyTradeMood, parseTradeMoods } from "./tradeMood";
import { MISTAKES, parseTradeMistakes, toggleTradeMistake } from "./tradeMistakes";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + d}`); };

let m = applyTradeMood({}, "t1", "before", "happy");
m = applyTradeMood(m, "t1", "after", "tired");
ok("mood: both sides set", m.t1?.before === "happy" && m.t1?.after === "tired");
const m2 = applyTradeMood(m, "t1", "before", null);
ok("mood: clear one side keeps the other, no mutation", m2.t1?.before === undefined && m2.t1?.after === "tired" && m.t1?.before === "happy");
ok("mood: clearing last side removes entry", applyTradeMood(m2, "t1", "after", null).t1 === undefined);
ok("mood: parse drops junk", JSON.stringify(parseTradeMoods('{"a":{"before":"nope","after":"angry"},"b":{"before":"x"},"c":5}')) === '{"a":{"after":"angry"}}');
ok("mood: parse never throws", Object.keys(parseTradeMoods("{bad")).length === 0 && Object.keys(parseTradeMoods(null)).length === 0);

ok("mistakes: 10 tags, unique ids, 3 labels each", MISTAKES.length === 10 && new Set(MISTAKES.map((x) => x.id)).size === 10 && MISTAKES.every((x) => x.label.en && x.label.ar && x.label.fr));
let t = toggleTradeMistake({}, "t1", "fomo");
t = toggleTradeMistake(t, "t1", "revenge");
ok("mistakes: toggle adds several", t.t1.length === 2);
const t2 = toggleTradeMistake(t, "t1", "fomo");
ok("mistakes: toggle off, no mutation", t2.t1.length === 1 && t2.t1[0] === "revenge" && t.t1.length === 2);
ok("mistakes: emptied list removes entry", toggleTradeMistake(t2, "t1", "revenge").t1 === undefined);
ok("mistakes: parse drops unknown/dupes", JSON.stringify(parseTradeMistakes('{"a":["fomo","fomo","zzz"],"b":["zzz"],"c":"fomo"}')) === '{"a":["fomo"]}');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
