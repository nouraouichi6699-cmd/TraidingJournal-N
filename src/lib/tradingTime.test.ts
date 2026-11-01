// Broker clock, trading-day boundary and session split. Run: npx tsx src/lib/tradingTime.test.ts
import {
  analysisParts, brokerAheadHours, DEFAULT_BOUNDS, nyIsDst, nyOffsetHours, parseWall,
  sessionAt, sessionOfHour, setAnalysisSettings, tradeDay, tradeParts, tradingDayOf,
} from "./tradingTime";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const eq = (name: string, got: unknown, want: unknown) => is(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const WINTER = Date.UTC(2026, 0, 15, 12); // 15 Jan 2026
const SUMMER = Date.UTC(2026, 6, 15, 12); // 15 Jul 2026

console.log("-- New York daylight saving");
eq("January is -5", nyOffsetHours(WINTER), -5);
eq("July is -4", nyOffsetHours(SUMMER), -4);
is("DST only in summer", !nyIsDst(WINTER) && nyIsDst(SUMMER));
// 2026: DST starts 8 March, ends 1 November.
is("the day before the switch is still winter", !nyIsDst(Date.UTC(2026, 2, 7, 12)));
is("the day after the switch is summer", nyIsDst(Date.UTC(2026, 2, 9, 12)));
is("November is back to winter", !nyIsDst(Date.UTC(2026, 10, 2, 12)));

console.log("-- the broker's clock");
eq("none never shifts", brokerAheadHours({ kind: "none" }, WINTER), 0);
eq("a fixed offset is taken as given", brokerAheadHours({ kind: "fixed", hours: 3 }, WINTER), 3);
eq("a negative fixed offset", brokerAheadHours({ kind: "fixed", hours: -5 }, SUMMER), -5);
eq("nonsense falls back to none", brokerAheadHours({ kind: "fixed", hours: NaN }, WINTER), 0);
eq("MT5 is GMT+2 in winter", brokerAheadHours({ kind: "mt5" }, WINTER), 2);
eq("MT5 is GMT+3 in summer", brokerAheadHours({ kind: "mt5" }, SUMMER), 3);

console.log("-- wall times read as UTC");
eq("a space instead of a T", parseWall("2026-03-04 22:30:00"), Date.UTC(2026, 2, 4, 22, 30));
eq("an explicit zone is respected", parseWall("2026-03-04T22:30:00Z"), Date.UTC(2026, 2, 4, 22, 30));

console.log("-- the defaults return exactly what the call sites used to compute");
for (const s of ["2026-03-04 22:30:00", "2026-03-04 00:05:00", "2026-12-31 23:59:59", "2026-03-04"]) {
  eq(`day of ${s}`, tradingDayOf(s), s.slice(0, 10));
  const p = analysisParts(s);
  eq(`hour of ${s}`, p.hour, s.length >= 13 ? Number(s.slice(11, 13)) : null);
}
eq("no stamp gives no day", tradingDayOf(null), "");
eq("no stamp gives no hour", analysisParts("").hour, null);
// Monday 2 March 2026; the app numbers Monday 0.
eq("Monday is 0", analysisParts("2026-03-02 10:00:00").weekday, 0);
eq("Sunday is 6", analysisParts("2026-03-08 10:00:00").weekday, 6);

console.log("-- a broker clock ahead of UTC");
// 01:30 on a GMT+3 server is 22:30 UTC the day before.
eq("the day rolls back", tradingDayOf("2026-03-05 01:30:00", { aheadHours: 3 }), "2026-03-04");
eq("and so does the hour", analysisParts("2026-03-05 01:30:00", { aheadHours: 3 }).hour, 22);
eq("the weekday follows the day", analysisParts("2026-03-09 01:30:00", { aheadHours: 3 }).weekday, 6);
eq("a stamp in the middle of the day does not move", tradingDayOf("2026-03-05 12:00:00", { aheadHours: 3 }), "2026-03-05");
eq("a date with no clock is left alone", tradingDayOf("2026-03-05", { aheadHours: 3 }), "2026-03-05");

console.log("-- the trading day that starts at 17:00 New York");
// Winter: 17:00 New York is 22:00 UTC.
eq("21:59 UTC is still the same day", tradingDayOf("2026-01-15 21:59:00", { dayStart: "ny17" }), "2026-01-15");
eq("22:00 UTC belongs to tomorrow", tradingDayOf("2026-01-15 22:00:00", { dayStart: "ny17" }), "2026-01-16");
// Summer: 17:00 New York is 21:00 UTC.
eq("20:59 UTC in July is the same day", tradingDayOf("2026-07-15 20:59:00", { dayStart: "ny17" }), "2026-07-15");
eq("21:00 UTC in July is tomorrow", tradingDayOf("2026-07-15 21:00:00", { dayStart: "ny17" }), "2026-07-16");
eq("early morning UTC is the day before in New York", tradingDayOf("2026-01-16 02:00:00", { dayStart: "ny17" }), "2026-01-16");
eq("a date with no clock keeps its own date", tradingDayOf("2026-01-15", { dayStart: "ny17" }), "2026-01-15");
// Both at once. In winter the cutoff is 22:00 UTC, so a GMT+3 server has to read 01:00 before a day turns over:
// 00:30 on its clock is 21:30 UTC, still 16:30 in New York and so still the day before.
eq("clock and boundary together, just before", tradingDayOf("2026-01-16 00:30:00", { aheadHours: 3, dayStart: "ny17" }), "2026-01-15");
eq("clock and boundary together, just after", tradingDayOf("2026-01-16 01:30:00", { aheadHours: 3, dayStart: "ny17" }), "2026-01-16");

console.log("-- sessions");
eq("before 07:00 is Tokyo", sessionAt(0, DEFAULT_BOUNDS), "sessTK");
eq("06:00 is still Tokyo", sessionAt(6, DEFAULT_BOUNDS), "sessTK");
eq("07:00 is London", sessionAt(7, DEFAULT_BOUNDS), "sessLN");
eq("12:00 is still London", sessionAt(12, DEFAULT_BOUNDS), "sessLN");
eq("13:00 is New York", sessionAt(13, DEFAULT_BOUNDS), "sessNY");
eq("20:00 is still New York", sessionAt(20, DEFAULT_BOUNDS), "sessNY");
eq("21:00 is Sydney", sessionAt(21, DEFAULT_BOUNDS), "sessSY");
eq("23:00 is Sydney", sessionAt(23, DEFAULT_BOUNDS), "sessSY");
eq("moved boundaries move the answer", sessionAt(7, { tokyo: 8, london: 14, newYork: 22 }), "sessTK");
is("every hour lands somewhere", Array.from({ length: 24 }, (_, h) => sessionAt(h, DEFAULT_BOUNDS)).every(Boolean));

console.log("-- what the analytics see, through the settings");
const t = { accountId: "a1" };
eq("untouched settings leave a day as it was", tradeDay(t, "2026-03-05 01:30:00"), "2026-03-05");
eq("untouched settings leave the hour as it was", tradeParts(t, "2026-03-05 01:30:00").hour, 1);
eq("sessionOfHour starts on the old split", sessionOfHour(7), "sessLN");

setAnalysisSettings({ clock: { kind: "fixed", hours: 3 } });
eq("the global clock reaches the day", tradeDay(t, "2026-03-05 01:30:00"), "2026-03-04");
setAnalysisSettings({ byAccount: { a1: { kind: "none" } } });
eq("an account can opt out of it", tradeDay(t, "2026-03-05 01:30:00"), "2026-03-05");
eq("while another account still follows the default", tradeDay({ accountId: "a2" }, "2026-03-05 01:30:00"), "2026-03-04");

setAnalysisSettings({ bounds: { tokyo: 8, london: 14, newYork: 22 } });
eq("moved boundaries reach sessionOfHour", sessionOfHour(7), "sessTK");
eq("and the top of the day", sessionOfHour(21), "sessNY");

setAnalysisSettings({ dayStart: "ny17", clock: { kind: "none" }, byAccount: {}, bounds: DEFAULT_BOUNDS });
eq("the boundary reaches the analytics", tradeDay(t, "2026-01-15 22:00:00"), "2026-01-16");

// Back to neutral, so nothing after this file is affected.
setAnalysisSettings({ dayStart: "midnight", clock: { kind: "none" }, byAccount: {}, bounds: DEFAULT_BOUNDS });
eq("and can be put back", tradeDay(t, "2026-01-15 22:00:00"), "2026-01-15");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
