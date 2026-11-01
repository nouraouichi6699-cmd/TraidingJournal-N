// Win / loss / break-even, and the session boundary clamp. Run: npx tsx src/lib/outcome.test.ts
import { breakEvenRange, classifyOutcome, netOutcome, setBreakEvenRange, tradeOutcome } from "./outcome";
import { clampBounds, DEFAULT_BOUNDS } from "./tradingTime";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const eq = (name: string, got: unknown, want: unknown) => is(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const cents = (x: number) => Math.round(x * 100) / 100;

console.log("-- an exact comparison, which is what the raw call sites did");
eq("a profit wins", classifyOutcome(12.5), "win");
eq("a loss loses", classifyOutcome(-12.5), "loss");
eq("zero is neither", classifyOutcome(0), "be");
eq("minus zero is neither", classifyOutcome(-0), "be");
eq("a sub-cent profit still wins", classifyOutcome(0.004), "win");
eq("a sub-cent loss still loses", classifyOutcome(-0.004), "loss");
eq("not a number is neither", classifyOutcome(NaN), "be");
eq("infinity is neither", classifyOutcome(Infinity), "be");

console.log("-- rounded to cents, which is what the cents call sites did");
eq("a sub-cent profit rounds away", classifyOutcome(0.004, { decimals: 2 }), "be");
eq("a sub-cent loss rounds away", classifyOutcome(-0.004, { decimals: 2 }), "be");
eq("half a cent rounds up to a win", classifyOutcome(0.005, { decimals: 2 }), "win");
eq("one cent wins", classifyOutcome(0.01, { decimals: 2 }), "win");
eq("one cent down loses", classifyOutcome(-0.01, { decimals: 2 }), "loss");

console.log("-- the two rules only ever differ below a cent");
// -0.005 belongs here too: Math.round sends a half towards +infinity, so cents(-0.005) is -0 and the rounded rule
// calls it break-even while the raw one still calls it a loss. cents() has always done this.
for (const v of [0.004, -0.004, 0.0049, -0.0049, -0.005]) {
  is(`${v} differs between the rules`, classifyOutcome(v) !== classifyOutcome(v, { decimals: 2 }));
}
for (const v of [0, 0.01, -0.01, 1.5, -1.5, 1705.67, 0.005, 250, -3200.25]) {
  eq(`${v} agrees between the rules`, classifyOutcome(v), classifyOutcome(v, { decimals: 2 }));
}

console.log("-- decimals match the cents helper the call sites use");
for (const v of [0.004, 0.005, -0.005, 1.004, 1.005, -1.005, 0.014, 12.345, -12.345]) {
  const viaHelper = cents(v) > 0 ? "win" : cents(v) < 0 ? "loss" : "be";
  eq(`${v} classified as the helper would`, classifyOutcome(v, { decimals: 2 }), viaHelper);
}

console.log("-- the break-even range");
eq("inside the range is break-even", classifyOutcome(0.4, { breakEven: 0.5 }), "be");
eq("exactly on the range is break-even", classifyOutcome(0.5, { breakEven: 0.5 }), "be");
eq("just past it wins again", classifyOutcome(0.51, { breakEven: 0.5 }), "win");
eq("and loses on the other side", classifyOutcome(-0.51, { breakEven: 0.5 }), "loss");
eq("a negative range is ignored", classifyOutcome(0.4, { breakEven: -5 }), "win");
eq("a range that is not a number is ignored", classifyOutcome(0.4, { breakEven: NaN }), "win");
eq("the range applies after rounding", classifyOutcome(0.504, { breakEven: 0.5, decimals: 2 }), "be");

console.log("-- the range the app is working with");
eq("it starts at nothing", breakEvenRange(), 0);
eq("so a trade behaves as before", tradeOutcome(0.4), "win");
eq("and a day too", netOutcome(0.4), "win");
setBreakEvenRange(0.5);
eq("the range reaches a trade", tradeOutcome(0.4), "be");
eq("but never a day's net", netOutcome(0.4), "win");
eq("nor a group's net", netOutcome(-0.4), "loss");
eq("a trade past the range is unaffected", tradeOutcome(5), "win");
setBreakEvenRange(-1);
eq("rubbish turns it off", breakEvenRange(), 0);
setBreakEvenRange(0);
eq("and zero leaves it off", tradeOutcome(0.4), "win");

console.log("-- session boundaries stay in order");
eq("the defaults are already valid", clampBounds(DEFAULT_BOUNDS), DEFAULT_BOUNDS);
eq("London cannot sit on Tokyo", clampBounds({ tokyo: 7, london: 7, newYork: 21 }), { tokyo: 7, london: 8, newYork: 21 });
eq("London cannot sit below Tokyo", clampBounds({ tokyo: 10, london: 4, newYork: 21 }), { tokyo: 10, london: 11, newYork: 21 });
eq("New York is pushed past London", clampBounds({ tokyo: 7, london: 20, newYork: 12 }), { tokyo: 7, london: 20, newYork: 21 });
eq("nothing passes 24", clampBounds({ tokyo: 30, london: 30, newYork: 30 }), { tokyo: 22, london: 23, newYork: 24 });
eq("nothing falls below 0", clampBounds({ tokyo: -5, london: -5, newYork: -5 }), { tokyo: 0, london: 1, newYork: 2 });
eq("rubbish lands on the defaults", clampBounds({ tokyo: NaN, london: NaN, newYork: NaN }), DEFAULT_BOUNDS);
is("always strictly increasing", [
  { tokyo: 0, london: 0, newYork: 0 }, { tokyo: 24, london: 0, newYork: 3 }, { tokyo: 23, london: 24, newYork: 24 },
  { tokyo: 12, london: 11, newYork: 10 },
].every((b) => { const c = clampBounds(b); return c.tokyo < c.london && c.london < c.newYork && c.tokyo >= 0 && c.newYork <= 24; }));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
