// Day-first date fields. Run: npx tsx src/lib/dates.test.ts
import { dayFirst, parseDay, shape } from "./dates";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };

is("shown day first", dayFirst("2002-12-29") === "29/12/2002");
is("not a date: nothing shown", dayFirst("") === "" && dayFirst(null) === "");
is("29/12/2002 reads as 2002-12-29", parseDay("29/12/2002") === "2002-12-29");
is("dots, dashes and one-digit parts", parseDay("5.1.2026") === "2026-01-05" && parseDay("05-01-2026") === "2026-01-05");
is("no 31 June", parseDay("31/06/2026") === null);
is("29 February only in a leap year", parseDay("29/02/2024") === "2024-02-29" && parseDay("29/02/2026") === null);
is("month 13 is not a month", parseDay("01/13/2026") === null);
is("the slashes come by themselves", shape("2") === "2" && shape("2912") === "29/12" && shape("29122002") === "29/12/2002" && shape("29/12/20029") === "29/12/2002");
is("deleting past a slash works", shape("29/12/") === "29/12" && shape("29/") === "29");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
