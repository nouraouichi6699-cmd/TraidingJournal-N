// Run: npx tsx src/lib/keyEvents.test.ts
import { isKeyEvent, keyEventKind, keyEventDayKinds, keyEventDayLabel, keyEventDayFullLabel, nextKeyEvent } from "./keyEvents";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`);
};

// ---- NFP: ForexFactory and MT5 wording ----
is("FF: Non-Farm Employment Change", keyEventKind("Non-Farm Employment Change") === "NFP");
is("FF: Nonfarm Payrolls", keyEventKind("Nonfarm Payrolls") === "NFP");
is("MT5: Non-Farm Payrolls", keyEventKind("Non-Farm Payrolls") === "NFP");
is("MT5: Non Farm Payrolls (spaced)", keyEventKind("Non Farm Payrolls") === "NFP");
is("lower-case nonfarm payrolls", keyEventKind("nonfarm payrolls") === "NFP");
is("Average Hourly Earnings is not NFP", keyEventKind("Average Hourly Earnings m/m") !== "NFP");

// ---- NFP exclusions: productivity and ADP, on both ForexFactory and MT5 wording ----
is("FF: Nonfarm Productivity is excluded", keyEventKind("Nonfarm Productivity") !== "NFP");
is("MT5: Non-Farm Productivity is excluded", keyEventKind("Non-Farm Productivity") !== "NFP");
is("FF: ADP Non-Farm Employment Change is excluded", keyEventKind("ADP Non-Farm Employment Change") !== "NFP");
is("FF: ADP Nonfarm Employment Change is excluded", keyEventKind("ADP Nonfarm Employment Change") !== "NFP");
is("MT5: ADP Employment Change is excluded", keyEventKind("ADP Employment Change") !== "NFP");
is("MT5: ADP Non-Farm Payrolls is excluded", keyEventKind("ADP Non-Farm Payrolls") !== "NFP");

// ---- CPI ----
is("FF: CPI m/m", keyEventKind("CPI m/m") === "CPI");
is("FF: Core CPI m/m", keyEventKind("Core CPI m/m") === "CPI");
is("MT5: Consumer Price Index (CPI) y/y", keyEventKind("Consumer Price Index (CPI) y/y") === "CPI");
is("MT5: Consumer Price Index ex Food & Energy y/y", keyEventKind("Consumer Price Index ex Food & Energy y/y") === "CPI");
is("lower-case cpi y/y", keyEventKind("cpi y/y") === "CPI");

// ---- PPI ----
is("FF: PPI m/m", keyEventKind("PPI m/m") === "PPI");
is("FF: Core PPI m/m", keyEventKind("Core PPI m/m") === "PPI");
is("MT5: Producer Price Index (PPI) m/m", keyEventKind("Producer Price Index (PPI) m/m") === "PPI");
is("lower-case ppi y/y", keyEventKind("ppi y/y") === "PPI");

// ---- FOMC ----
is("FF: FOMC Statement", keyEventKind("FOMC Statement") === "FOMC");
is("FF: FOMC Meeting Minutes", keyEventKind("FOMC Meeting Minutes") === "FOMC");
is("FF: FOMC Press Conference", keyEventKind("FOMC Press Conference") === "FOMC");
is("FF: FOMC Economic Projections", keyEventKind("FOMC Economic Projections") === "FOMC");
is("MT5: Federal Funds Rate", keyEventKind("Federal Funds Rate") === "FOMC");
is("MT5: Fed Interest Rate Decision", keyEventKind("Fed Interest Rate Decision") === "FOMC");

// ---- FOMC exclusions: member speeches, on both ForexFactory and MT5 wording ----
is("FF: FOMC Member Williams Speaks is excluded", keyEventKind("FOMC Member Williams Speaks") !== "FOMC");
is("FF: FOMC Member Bostic Speech is excluded", keyEventKind("FOMC Member Bostic Speech") !== "FOMC");
is("MT5: FOMC Member Mester Speaks is excluded", keyEventKind("FOMC Member Mester Speaks") !== "FOMC");
is("MT5: FOMC Member Williams Speech is excluded", keyEventKind("FOMC Member Williams Speech") !== "FOMC");

// ---- not key events ----
is("ECB rate decision is not a key event", keyEventKind("ECB Rate Decision") === null);
is("GDP is not a key event", keyEventKind("GDP q/q") === null);
is("Retail Sales is not a key event", keyEventKind("Retail Sales m/m") === null);
is("Tankan survey is not a key event", keyEventKind("Tankan Survey") === null);
is("empty title is not a key event", keyEventKind("") === null);

// ---- isKeyEvent mirrors keyEventKind ----
is("isKeyEvent true for NFP", isKeyEvent("Non-Farm Payrolls"));
is("isKeyEvent false for GDP", !isKeyEvent("GDP q/q"));

// ---- keyEventDayKinds / keyEventDayLabel / keyEventDayFullLabel: the calendar flame marker ----
is("no events -> no kinds, null label", keyEventDayKinds([]).length === 0 && keyEventDayLabel([]) === null && keyEventDayFullLabel([]) === null);
is("no key events among them -> null", keyEventDayLabel([{ time: "2026-01-05T12:00:00Z", title: "GDP q/q" }]) === null);
is("one key event -> its kind, no count", keyEventDayLabel([{ time: "2026-01-05T12:30:00Z", title: "Non-Farm Payrolls" }]) === "NFP");
is(
  "two distinct kinds -> both, joined, earliest first",
  keyEventDayLabel([
    { time: "2026-01-05T19:00:00Z", title: "FOMC Statement" },
    { time: "2026-01-05T12:30:00Z", title: "Non-Farm Payrolls" },
  ]) === "NFP · FOMC",
);
is(
  "duplicates of the same kind collapse to one entry",
  keyEventDayLabel([
    { time: "2026-01-05T12:30:00Z", title: "CPI m/m" },
    { time: "2026-01-05T14:30:00Z", title: "Core CPI y/y" },
  ]) === "CPI",
);
is(
  "a non-key event among key ones is ignored",
  keyEventDayLabel([
    { time: "2026-01-05T08:30:00Z", title: "GDP q/q" },
    { time: "2026-01-05T12:30:00Z", title: "Non-Farm Payrolls" },
  ]) === "NFP",
);
is(
  "tie at the same time breaks by kind, alphabetically",
  keyEventDayKinds([
    { time: "2026-01-05T12:30:00Z", title: "PPI m/m" },
    { time: "2026-01-05T12:30:00Z", title: "CPI m/m" },
  ]).join(",") === "CPI,PPI",
);
const threeKinds = [
  { time: "2026-01-05T08:30:00Z", title: "Non-Farm Payrolls" },
  { time: "2026-01-05T12:30:00Z", title: "CPI m/m" },
  { time: "2026-01-05T19:00:00Z", title: "FOMC Statement" },
];
is("three distinct kinds -> display label truncates to the first plus an ellipsis", keyEventDayLabel(threeKinds) === "NFP…");
is("three distinct kinds -> accessible label lists all of them, untruncated", keyEventDayFullLabel(threeKinds) === "NFP · CPI · FOMC");
is("two distinct kinds -> full label matches the display label", keyEventDayFullLabel(threeKinds.slice(0, 2)) === keyEventDayLabel(threeKinds.slice(0, 2)));

// ---- nextKeyEvent: the calendar header's "Next key event" pick ----
const now = Date.parse("2026-01-01T00:00:00Z");
const day = 86_400_000;
const nkEvents = [
  { time: "2026-01-10T13:30:00Z", currency: "USD", title: "Non-Farm Payrolls" },
  { time: "2026-01-05T08:30:00Z", currency: "USD", title: "GDP q/q" }, // not a key event
  { time: "2026-01-20T13:30:00Z", currency: "USD", title: "CPI m/m" }, // beyond the 14-day window
  { time: "2025-12-20T13:30:00Z", currency: "USD", title: "FOMC Statement" }, // in the past
];
is("picks the soonest key event in range", nextKeyEvent(nkEvents, now, ["USD"])?.kind === "NFP");
is("none in range -> null", nextKeyEvent([nkEvents[2]], now, ["USD"]) === null);
is("currency filter excludes it", nextKeyEvent([nkEvents[0]], now, ["EUR"]) === null);
is(
  "right at the 14-day edge still counts",
  nextKeyEvent([{ time: new Date(now + 14 * day).toISOString(), currency: "USD", title: "Non-Farm Payrolls" }], now, ["USD"])?.kind === "NFP",
);
is(
  "one minute past the 14-day edge does not",
  nextKeyEvent([{ time: new Date(now + 14 * day + 60_000).toISOString(), currency: "USD", title: "Non-Farm Payrolls" }], now, ["USD"]) === null,
);
const tieTime = new Date(now + day).toISOString();
is(
  "ties at the same time break by title",
  nextKeyEvent(
    [
      { time: tieTime, currency: "USD", title: "PPI m/m" },
      { time: tieTime, currency: "USD", title: "CPI m/m" },
    ],
    now,
    ["USD"],
  )?.kind === "CPI",
);
is("an event exactly at nowMs still counts", nextKeyEvent([{ time: new Date(now).toISOString(), currency: "USD", title: "Non-Farm Payrolls" }], now, ["USD"]) != null);
is("a past event (even by a millisecond) does not", nextKeyEvent([{ time: new Date(now - 1).toISOString(), currency: "USD", title: "Non-Farm Payrolls" }], now, ["USD"]) === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
