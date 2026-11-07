// Run: npx tsx src/lib/econEvents.test.ts
import {
  filterEconEvents, econEventsByDay, selectDots, econTooltipLine,
  mapMt5Importance, validateMt5CalendarEvent, mt5CoverageRange, dayCoveredByMt5, mergeEconByDay,
} from "./econEvents";

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

// ---- mapMt5Importance ----
is("HIGH -> high", mapMt5Importance("HIGH") === "high");
is("MODERATE -> medium", mapMt5Importance("MODERATE") === "medium");
is("LOW -> low", mapMt5Importance("LOW") === "low");
is("NONE -> null (skip)", mapMt5Importance("NONE") === null);
is("unknown -> null", mapMt5Importance("WHATEVER") === null);

// ---- validateMt5CalendarEvent ----
const goodRaw = { id: "123", time: "2026-11-07T14:30", currency: "usd", title: "CPI", impact: "high", previous: "3.1%", forecast: "3.2%", actual: "" };
const good = validateMt5CalendarEvent(goodRaw);
is("valid event accepted", good !== null);
is("currency upper-cased", good?.currency === "USD");
is("missing id rejected", validateMt5CalendarEvent({ ...goodRaw, id: "" }) === null);
is("id too long rejected", validateMt5CalendarEvent({ ...goodRaw, id: "x".repeat(41) }) === null);
is("bad time format rejected", validateMt5CalendarEvent({ ...goodRaw, time: "2026-11-07 14:30" }) === null);
is("bad currency rejected", validateMt5CalendarEvent({ ...goodRaw, currency: "1" }) === null);
is("empty title rejected", validateMt5CalendarEvent({ ...goodRaw, title: "" }) === null);
is("title too long rejected", validateMt5CalendarEvent({ ...goodRaw, title: "x".repeat(201) }) === null);
is("bad impact rejected", validateMt5CalendarEvent({ ...goodRaw, impact: "holiday" }) === null);
is("previous too long rejected", validateMt5CalendarEvent({ ...goodRaw, previous: "x".repeat(41) }) === null);
is("non-object rejected", validateMt5CalendarEvent("nope") === null);
is("null rejected", validateMt5CalendarEvent(null) === null);

// ---- mt5CoverageRange ----
const range = mt5CoverageRange([{ time: "2026-11-05T10:00:00Z" }, { time: "2026-11-07T10:00:00Z" }, { time: "2026-11-01T10:00:00Z" }]);
is("range min is earliest day", range?.min === "2026-11-01");
is("range max is latest day", range?.max === "2026-11-07");
is("empty events -> null range", mt5CoverageRange([]) === null);

// ---- dayCoveredByMt5 ----
is("day inside range covered", dayCoveredByMt5("2026-11-03", range));
is("day at range edge covered", dayCoveredByMt5("2026-11-01", range));
is("day outside range not covered", !dayCoveredByMt5("2026-12-01", range));
is("no range: nothing covered", !dayCoveredByMt5("2026-11-03", null));

// ---- mergeEconByDay ----
const mt5Day = new Map([["2026-11-07", [{ time: "2026-11-07T10:00:00Z", id: "m1" }]]]);
const ffDay = new Map([
  ["2026-11-07", [{ time: "2026-11-07T12:00:00Z", id: "f1" }]],
  ["2026-11-20", [{ time: "2026-11-20T12:00:00Z", id: "f2" }]],
]);
const mt5OnlyRange = { min: "2026-11-01", max: "2026-11-10" };
const merged = mergeEconByDay(mt5Day, ffDay, mt5OnlyRange);
is("day covered by MT5 uses MT5 events", merged.get("2026-11-07")?.source === "mt5" && merged.get("2026-11-07")?.events[0].id === "m1");
is("day outside MT5 range falls back to FF", merged.get("2026-11-20")?.source === "ff" && merged.get("2026-11-20")?.events[0].id === "f2");
is("merge covers all days from both sources", merged.size === 2);
const mergedNoMt5 = mergeEconByDay(new Map(), ffDay, null);
is("no MT5 data: every day is FF", mergedNoMt5.get("2026-11-07")?.source === "ff" && mergedNoMt5.get("2026-11-20")?.source === "ff");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
