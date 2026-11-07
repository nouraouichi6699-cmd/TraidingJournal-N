// Run: npx tsx src/lib/econEvents.test.ts
import { filterEconEvents, econEventsByDay, selectDots, econTooltipLine } from "./econEvents";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`);
};

// ---- filterEconEvents ----
const evs = [
  { impact: "high", currency: "USD", title: "CPI" },
  { impact: "medium", currency: "EUR", title: "GDP" },
  { impact: "low", currency: "GBP", title: "PMI" },
  { impact: "holiday", currency: "USD", title: "Thanksgiving" },
  { impact: "none", currency: "JPY", title: "speech" },
];

const f1 = filterEconEvents(evs, ["high", "medium"], ["USD", "EUR", "GBP"]);
is("high+medium with USD+EUR+GBP: 2 results", f1.length === 2);
is("holiday excluded", !f1.some((e) => e.impact === "holiday"));
is("none excluded", !f1.some((e) => e.impact === "none"));
is("low excluded", !f1.some((e) => e.impact === "low"));

const f2 = filterEconEvents(evs, ["high"], ["EUR"]);
is("high USD excluded when USD not in currencies", f2.length === 0);

const f3 = filterEconEvents(evs, ["low"], ["GBP"]);
is("low GBP included", f3.length === 1 && f3[0].title === "PMI");

const f4 = filterEconEvents([], ["high"], ["USD"]);
is("empty input returns empty", f4.length === 0);

const f5 = filterEconEvents(evs, [], ["USD"]);
is("empty impacts returns empty", f5.length === 0);

const f6 = filterEconEvents(evs, ["high", "medium", "low"], []);
is("empty currencies returns empty", f6.length === 0);

// ---- econEventsByDay ----
const dateEvs = [
  { time: "2026-11-07T14:30:00Z", id: "1" },
  { time: "2026-11-07T16:00:00Z", id: "2" },
  { time: "2026-11-08T10:00:00Z", id: "3" },
];
const byDay = econEventsByDay(dateEvs);
is("two events on 2026-11-07", (byDay.get("2026-11-07") ?? []).length === 2);
is("one event on 2026-11-08", (byDay.get("2026-11-08") ?? []).length === 1);
is("only 2 day keys", byDay.size === 2);

const byDayEmpty = econEventsByDay([]);
is("empty events produces empty map", byDayEmpty.size === 0);

// date boundary: midnight UTC stays on same day
const midnight = econEventsByDay([{ time: "2026-11-07T00:00:00Z", id: "m" }]);
is("midnight UTC maps to 2026-11-07", (midnight.get("2026-11-07") ?? []).length === 1);

// ---- selectDots ----
const { dots: d4, extra: e4 } = selectDots([
  { impact: "low" }, { impact: "high" }, { impact: "medium" }, { impact: "high" },
]);
is("4 events → 3 dots", d4.length === 3);
is("4 events → 1 extra", e4 === 1);
is("first dot is high", d4[0].impact === "high");
is("second dot is high", d4[1].impact === "high");
is("third dot is medium", d4[2].impact === "medium");

const { dots: d2, extra: e2 } = selectDots([{ impact: "low" }, { impact: "high" }]);
is("2 events → 2 dots", d2.length === 2);
is("2 events → 0 extra", e2 === 0);
is("high before low when 2 events", d2[0].impact === "high" && d2[1].impact === "low");

const { dots: d0, extra: e0 } = selectDots([]);
is("empty → 0 dots", d0.length === 0);
is("empty → 0 extra", e0 === 0);

const { dots: d3, extra: e3 } = selectDots([{ impact: "medium" }, { impact: "medium" }, { impact: "medium" }]);
is("3 exactly → 3 dots", d3.length === 3);
is("3 exactly → 0 extra", e3 === 0);

// ---- econTooltipLine ----
const line = econTooltipLine({ time: "2026-11-07T14:30:00Z", currency: "USD", title: "CPI", impact: "high" });
is("tooltip contains time", line.includes("14:30"));
is("tooltip contains currency", line.includes("USD"));
is("tooltip contains title", line.includes("CPI"));
is("tooltip contains impact", line.includes("high"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
