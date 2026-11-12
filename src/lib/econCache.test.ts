// Run: npx tsx src/lib/econCache.test.ts
import { econCacheKey, econMonthRange, monthsToEvict, mergeEconCacheRows, ECON_CACHE_MAX_MONTHS } from "./econCache";
import { econEventsByDay, type StoredEconEvent } from "./econEvents";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`);
};

// ---- econCacheKey ----
is("key combines user and month", econCacheKey("u1", "2026-11") === "u1:2026-11");
is("different users -> different keys for the same month", econCacheKey("u1", "2026-11") !== econCacheKey("u2", "2026-11"));
is("different months -> different keys for the same user", econCacheKey("u1", "2026-11") !== econCacheKey("u1", "2026-12"));

// ---- econMonthRange ----
const nov = econMonthRange("2026-11");
is("Nov start is the 1st at UTC midnight", nov.start === "2026-11-01T00:00:00.000Z");
is("Nov end is the 30th just before midnight", nov.end === "2026-11-30T23:59:59.999Z");
const feb28 = econMonthRange("2026-02"); // 2026 is not a leap year
is("Feb 2026 (non-leap) ends on the 28th", feb28.end.startsWith("2026-02-28"));
const feb29 = econMonthRange("2028-02"); // 2028 is a leap year
is("Feb 2028 (leap) ends on the 29th", feb29.end.startsWith("2028-02-29"));
const dec = econMonthRange("2026-12");
is("Dec end does not spill into next year", dec.end.startsWith("2026-12-31"));

// ---- monthsToEvict ----
is("under the cap: nothing evicted", monthsToEvict(["2026-01", "2026-02"], 14).length === 0);
is("exactly at the cap: nothing evicted", monthsToEvict(Array.from({ length: 14 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`), 14).length === 0);
const over = monthsToEvict(["2025-01", "2025-02", "2025-03", "2026-01"], 2);
is("over the cap: evicts the oldest first", over.length === 2 && over[0] === "2025-01" && over[1] === "2025-02");
is("duplicates are not double-counted", monthsToEvict(["2026-01", "2026-01", "2026-02"], 2).length === 0);
is("default max matches the 14-month rule", monthsToEvict(Array.from({ length: 15 }, (_, i) => `202${Math.floor(i / 10)}-${String((i % 12) + 1).padStart(2, "0")}`)).length === 1);
is("ECON_CACHE_MAX_MONTHS is 14", ECON_CACHE_MAX_MONTHS === 14);

// ---- mergeEconCacheRows ----
const cachedFf: StoredEconEvent[] = [{ id: "c1", time: "2026-11-01T00:00:00Z", currency: "USD", title: "old", impact: "high", previous: "", forecast: "", actual: "", updated_at: "" }];
const cachedMt5: StoredEconEvent[] = [{ id: "c2", time: "2026-11-02T00:00:00Z", currency: "EUR", title: "old mt5", impact: "medium", previous: "", forecast: "", actual: "", updated_at: "" }];
const freshFf: StoredEconEvent[] = [{ id: "f1", time: "2026-11-01T00:00:00Z", currency: "USD", title: "new", impact: "high", previous: "", forecast: "", actual: "", updated_at: "" }];

is("both fresh: fresh wins for both sources", (() => {
  const r = mergeEconCacheRows({ ff: cachedFf, mt5: cachedMt5 }, { ff: freshFf, mt5: [] });
  return r.ff === freshFf && r.mt5.length === 0;
})());
is("ff failed (undefined), mt5 fresh: ff falls back to cached, mt5 uses fresh", (() => {
  const r = mergeEconCacheRows({ ff: cachedFf, mt5: cachedMt5 }, { ff: undefined, mt5: [] });
  return r.ff === cachedFf && r.mt5.length === 0;
})());
is("ff failed (null): same fallback as undefined", (() => {
  const r = mergeEconCacheRows({ ff: cachedFf, mt5: cachedMt5 }, { ff: null, mt5: null });
  return r.ff === cachedFf && r.mt5 === cachedMt5;
})());
is("no cache, fetch failed: empty rows, not a crash", (() => {
  const r = mergeEconCacheRows(null, { ff: null, mt5: undefined });
  return r.ff.length === 0 && r.mt5.length === 0;
})());
is("fresh empty array is a real empty month, not treated as a failure", (() => {
  const r = mergeEconCacheRows({ ff: cachedFf, mt5: cachedMt5 }, { ff: [], mt5: cachedMt5 });
  return r.ff.length === 0;
})());
// ---- econMonthRange with dayStart ----
is("midnight: explicit param leaves the range identical", JSON.stringify(econMonthRange("2026-11", "midnight")) === JSON.stringify(econMonthRange("2026-11")));
const nyNov = econMonthRange("2026-11", "ny17");
is("ny17: start reaches one UTC day back (Oct 31)", nyNov.start === "2026-10-31T00:00:00.000Z");
is("ny17: end is unchanged", nyNov.end === nov.end);
is("ny17: January start crosses the year boundary", econMonthRange("2027-01", "ny17").start === "2026-12-31T00:00:00.000Z");
{
  const evening = { time: "2026-10-31T23:00:00Z", id: "e" }; // 19:00 EDT on Oct 31 -> trading day 2026-11-01
  const inRange = (t: string, r: { start: string; end: string }) => t >= r.start.slice(0, 19) && t <= r.end.slice(0, 19);
  is("midnight: the Oct 31 evening event is outside November's fetch", !inRange("2026-10-31T23:00:00", econMonthRange("2026-11")));
  is("ny17: the Oct 31 evening event is inside November's fetch", inRange("2026-10-31T23:00:00", nyNov));
  is("ny17: it lands under 2026-11-01's trading day", (econEventsByDay([evening], "ny17").get("2026-11-01") ?? []).length === 1);
  is("midnight: it stays under 2026-10-31", (econEventsByDay([evening]).get("2026-10-31") ?? []).length === 1);
}


console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
