// Run: npx tsx src/lib/keyEvents.test.ts
import { isKeyEvent, keyEventKind } from "./keyEvents";

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
is("FOMC member speech counts too (contains FOMC)", keyEventKind("FOMC Member Williams Speaks") === "FOMC");

// ---- not key events ----
is("ECB rate decision is not a key event", keyEventKind("ECB Rate Decision") === null);
is("GDP is not a key event", keyEventKind("GDP q/q") === null);
is("Retail Sales is not a key event", keyEventKind("Retail Sales m/m") === null);
is("Tankan survey is not a key event", keyEventKind("Tankan Survey") === null);
is("empty title is not a key event", keyEventKind("") === null);

// ---- isKeyEvent mirrors keyEventKind ----
is("isKeyEvent true for NFP", isKeyEvent("Non-Farm Payrolls"));
is("isKeyEvent false for GDP", !isKeyEvent("GDP q/q"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
