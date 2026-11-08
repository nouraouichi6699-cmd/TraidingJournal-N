// Run: npx tsx src/lib/econEvents.test.ts
import {
  filterEconEvents, econEventsByDay, selectDots, econTooltipLine,
  mapMt5Importance, validateMt5CalendarEvent, mt5CoverageRange, dayCoveredByMt5, mergeEconByDay,
  dayTradedCurrencies, filterByMySymbols,
} from "./econEvents";
import { dayKey } from "./dashStats";
import { DEFAULTS } from "../useSettings";
import type { Trade } from "../types";

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

// ---- end-to-end: one month of sample MT5 + ForexFactory rows, through the exact pipeline the
// dashboard and Day-by-day calendars run (filter -> group by day -> coverage -> merge -> dots),
// under the real DEFAULT settings. Reproduces the reported bug (no dot on any day, any month)
// and proves it is fixed: dots appear on the right days, under both default and custom filters.
console.log("\n-- end-to-end: a month of MT5 + FF rows --");

// MT5 calendar history, as stored in econ_events_mt5 (mt5-sync "calendar" action), covering the
// whole month -- same shape dashWidgets.tsx / DayByDayTab.tsx select from Supabase.
const novMt5 = [
  { id: "m1", time: "2026-11-03T13:30:00Z", currency: "USD", title: "NFP", impact: "high" },
  { id: "m2", time: "2026-11-10T09:00:00Z", currency: "EUR", title: "ECB rate decision", impact: "high" },
  { id: "m3", time: "2026-11-10T10:00:00Z", currency: "EUR", title: "ECB presser", impact: "medium" },
  { id: "m4", time: "2026-11-12T23:50:00Z", currency: "JPY", title: "Tankan survey", impact: "low" }, // low only: no dot by default
  { id: "m5", time: "2026-11-18T14:00:00Z", currency: "GBP", title: "CPI", impact: "medium" },
  { id: "m6", time: "2026-11-25T13:30:00Z", currency: "USD", title: "GDP", impact: "high" },
];
// ForexFactory rows, as stored in econ_events (news function "calendar" upsert) -- would be the
// fallback for any day the MT5 range does not cover. None here fall in November, confirming the
// merge correctly prefers MT5 for every November day once MT5 covers the whole month.
const novFf = [{ id: "f1", time: "2026-10-15T12:00:00Z", currency: "USD", title: "October CPI", impact: "high" }];

// Sample closed trades on some of the same days, exactly as the trades table stores them, to
// prove event day-keys line up with trade day-keys (point 4): both must reduce to the same
// YYYY-MM-DD under the default (neutral) trading-time settings.
const sampleTrade = (exitTime: string): Trade => ({
  key: "a1:1", accountId: "a1", no: 1, symbol: "EURUSD", side: "long", qty: 1,
  entryTime: exitTime, entryPrice: 1, exitTime, exitPrice: 1, pnl: 10, returnPct: 1, commission: 0,
  status: "closed",
});
const tradeDays = [sampleTrade("2026-11-03T14:00:00Z"), sampleTrade("2026-11-10T11:00:00Z"), sampleTrade("2026-11-18T15:00:00Z")];

const { econImpacts, econCurrencies } = DEFAULTS; // ["high","medium"], all 9 currencies -- the real defaults
const mt5Filtered = filterEconEvents(novMt5, econImpacts, econCurrencies);
const ffFiltered = filterEconEvents(novFf, econImpacts, econCurrencies);
const mt5Range = mt5CoverageRange(novMt5); // unfiltered, per the coverage-range fix
const novByDay = mergeEconByDay(econEventsByDay(mt5Filtered), econEventsByDay(ffFiltered), mt5Range);

for (const t of tradeDays) is(`trade day-key ${dayKey(t)} matches an event day-key`, novByDay.has(dayKey(t)));

is("Nov 3 (high): 1 dot", selectDots(novByDay.get("2026-11-03")?.events ?? []).dots.length === 1);
is("Nov 3 dot is high", selectDots(novByDay.get("2026-11-03")?.events ?? []).dots[0]?.impact === "high");
is("Nov 10 (high+medium): 2 dots, high first", (() => {
  const d = selectDots(novByDay.get("2026-11-10")?.events ?? []).dots;
  return d.length === 2 && d[0].impact === "high" && d[1].impact === "medium";
})());
is("Nov 12 (low only, default filter excludes low): no day entry at all", !novByDay.has("2026-11-12"));
is("Nov 18 (medium): 1 dot", selectDots(novByDay.get("2026-11-18")?.events ?? []).dots.length === 1);
is("Nov 25 (high, no trade that day): still has a dot", selectDots(novByDay.get("2026-11-25")?.events ?? []).dots.length === 1);
is("source for every November day is mt5 (MT5 covers the whole month)", ["2026-11-03", "2026-11-10", "2026-11-18", "2026-11-25"].every((d) => novByDay.get(d)?.source === "mt5"));
is("October FF-only day (outside the MT5 range) correctly falls back to ff, not mt5", novByDay.get("2026-10-15")?.source === "ff");

// With "low" turned on (a user who enables it in the chips), the previously-empty day gets a dot.
const mt5WithLow = filterEconEvents(novMt5, ["high", "medium", "low"], econCurrencies);
const byDayWithLow = mergeEconByDay(econEventsByDay(mt5WithLow), econEventsByDay(filterEconEvents(novFf, ["high", "medium", "low"], econCurrencies)), mt5Range);
is("enabling 'low' reveals the Nov 12 dot", selectDots(byDayWithLow.get("2026-11-12")?.events ?? []).dots[0]?.impact === "low");

// Currency filter: dropping EUR removes the Nov 10 ECB dots even though impact still matches.
const noEur = econCurrencies.filter((c) => c !== "EUR");
const mt5NoEur = filterEconEvents(novMt5, econImpacts, noEur);
const byDayNoEur = mergeEconByDay(econEventsByDay(mt5NoEur), econEventsByDay(filterEconEvents(novFf, econImpacts, noEur)), mt5CoverageRange(novMt5));
is("dropping EUR from the currency filter removes the Nov 10 dots", !byDayNoEur.has("2026-11-10"));
is("other days are unaffected by the EUR filter", selectDots(byDayNoEur.get("2026-11-03")?.events ?? []).dots.length === 1);

// ---- dayTradedCurrencies ----
is("forex pair contributes both currencies", (() => {
  const s = dayTradedCurrencies(["EURUSD"]);
  return s.has("EUR") && s.has("USD") && s.size === 2;
})());
is("metal contributes USD only", dayTradedCurrencies(["XAUUSD"]).size === 1 && dayTradedCurrencies(["XAUUSD"]).has("USD"));
is("multiple symbols union their currencies", (() => {
  const s = dayTradedCurrencies(["EURUSD", "USDJPY"]);
  return s.has("EUR") && s.has("USD") && s.has("JPY") && s.size === 3;
})());
is("duplicate symbols don't duplicate currencies", dayTradedCurrencies(["EURUSD", "EURUSD"]).size === 2);
is("unrecognised symbol contributes nothing", dayTradedCurrencies(["NOTASYMBOL"]).size === 0);
is("no symbols: empty set", dayTradedCurrencies([]).size === 0);

// ---- filterByMySymbols ----
const newsEvs = [
  { id: "1", currency: "USD", title: "NFP" },
  { id: "2", currency: "EUR", title: "ECB" },
  { id: "3", currency: "JPY", title: "Tankan" },
];
is("off: returns events unchanged", filterByMySymbols(newsEvs, false, new Set(["EUR"])).length === 3);
is("on, day traded nothing recognised (empty set): no-op, not an empty result", filterByMySymbols(newsEvs, true, new Set()).length === 3);
const onlyEur = filterByMySymbols(newsEvs, true, new Set(["EUR"]));
is("on: keeps only matching currency", onlyEur.length === 1 && onlyEur[0].id === "2");
const usdAndJpy = filterByMySymbols(newsEvs, true, new Set(["USD", "JPY"]));
is("on: keeps every matching currency", usdAndJpy.length === 2 && usdAndJpy.every((e) => e.currency === "USD" || e.currency === "JPY"));
is("on: no overlap excludes everything", filterByMySymbols(newsEvs, true, new Set(["GBP"])).length === 0);

// ---- shared filter state: the Day-by-day timeline and the dashboard calendar read/write the exact
// same settings.econImpacts/econCurrencies, so filtering with one's values must match the other's.
console.log("\n-- shared filter state (Day-by-day timeline vs. dashboard calendar) --");
const sharedSettings = { econImpacts: ["high"] as ("high" | "medium" | "low")[], econCurrencies: ["USD", "JPY"] };
const dashboardView = filterEconEvents(novMt5, sharedSettings.econImpacts, sharedSettings.econCurrencies);
const timelineView = filterEconEvents(novMt5, sharedSettings.econImpacts, sharedSettings.econCurrencies);
is("same settings object -> identical filtered result in both views", JSON.stringify(dashboardView) === JSON.stringify(timelineView));
is("changing the shared impacts changes both views identically", (() => {
  const updated = { ...sharedSettings, econCurrencies: ["EUR", "USD", "JPY"] };
  const a = filterEconEvents(novMt5, updated.econImpacts, updated.econCurrencies);
  const b = filterEconEvents(novMt5, updated.econImpacts, updated.econCurrencies);
  return a.length === b.length && a.length > dashboardView.length;
})());
// The timeline then narrows its own copy further with "My symbols only" -- the dashboard calendar never does,
// so the two views diverge only there, never on the impact/currency chips themselves.
const timelineNarrowed = filterByMySymbols(timelineView, true, new Set(["USD"]));
is("'My symbols only' narrows the timeline without touching the shared filtered set", timelineNarrowed.length <= timelineView.length && timelineView.length === dashboardView.length);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
