import { dayKey, dayList, dayStats, dayTrades, monthCells, monthSummary, shiftMonth, weekTotals } from "./dayByDay";
import type { Trade } from "../types";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + d}`); };
const near = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) <= 0.01);
const T = (id: number, entry: string, exit: string | null, pnl: number | null): Trade => ({ key: `a:${id}`, accountId: "a", no: id, symbol: "X", side: "long", qty: 1, entryTime: entry, entryPrice: 1, exitTime: exit, exitPrice: 1, pnl, returnPct: null, commission: 0, status: exit && pnl != null ? "closed" : "open" } as Trade);
const tr = [
  T(1, "2025-03-03 23:00", "2025-03-04 01:00", 100),   // closes next day -> belongs to Mar 4
  T(2, "2025-03-04 09:00", "2025-03-04 10:30", -40),
  T(3, "2025-03-04 11:00", "2025-03-04 11:30", 0),
  T(4, "2025-03-05 09:00", "2025-03-05 09:10", -25.5),
  T(5, "2025-03-05 09:00", null, null),                // open -> excluded
  T(6, "2025-02-28 09:00", "2025-02-28 10:00", 10),
];
ok("dayKey uses the close date", dayKey(tr[0]) === "2025-03-04");
const L = dayList(tr);
ok("days newest first", L.map((d) => d.day).join() === "2025-03-05,2025-03-04,2025-02-28", L.map((d) => d.day).join());
ok("open trades excluded from counts", L[0].n === 1 && L[1].n === 3);
ok("day net", near(L[1].net, 60) && near(L[0].net, -25.5) && near(L[2].net, 10));
const d = dayTrades(tr, "2025-03-04");
ok("trades in close order", d.map((t) => t.no).join() === "1,2,3", d.map((t) => t.no).join());
const s = dayStats(d);
ok("net / trades", near(s.net, 60) && s.trades === 3);
ok("win rate 1/3", near(s.winRate, 100 / 3));
ok("profit factor 100/40", near(s.pf, 2.5));
ok("expectancy = net/trades", near(s.expectancy, 20));
ok("avg hold (120+90+30)/3 = 80 min", near(s.avgHoldMin, 80), String(s.avgHoldMin));
ok("win/loss/breakeven split", s.wins === 1 && s.losses === 1 && s.be === 1);
const w = dayStats(dayTrades(tr, "2025-02-28"));
ok("all wins -> profit factor null", w.pf === null && near(w.winRate, 100));
ok("empty day -> nulls", dayStats([]).winRate === null && dayStats([]).expectancy === null && dayStats([]).avgHoldMin === null);
ok("same-minute ties ordered by ticket", dayTrades([T(9, "2025-03-06 09:00", "2025-03-06 10:00", 1), T(3, "2025-03-06 09:00", "2025-03-06 10:00", 1)], "2025-03-06").map((t) => t.no).join() === "3,9");
// month grid: 2025-03-01 is a Saturday
const mc = monthCells("2025-03", false), ms = monthCells("2025-03", true);
ok("Mon-first: 5 leading blanks before Sat the 1st", mc.slice(0, 5).every((c) => c === null) && mc[5] === "2025-03-01" && mc.length === 42, String(mc.length));
ok("Sun-first: 6 leading blanks", ms.slice(0, 6).every((c) => c === null) && ms[6] === "2025-03-01" && ms.length === 42);
ok("grid holds exactly the month's days, in order", mc.filter(Boolean).length === 31 && mc.filter(Boolean).at(-1) === "2025-03-31");
ok("padded to whole weeks, trailing blanks null", monthCells("2027-02", false).length === 28 && monthCells("2025-06", false).at(-1) === null);
ok("shiftMonth crosses year edges", shiftMonth("2025-12", 1) === "2026-01" && shiftMonth("2025-01", -1) === "2024-12" && shiftMonth("2025-03", 0) === "2025-03");
// month summary + week totals (Mar 2025: 4th +60, 5th -25.5; Feb 28 is outside the month)
const ms3 = monthSummary(tr, L, "2025-03");
ok("monthSummary net / days / green / red", near(ms3.net, 34.5) && ms3.tradingDays === 2 && ms3.greenDays === 1 && ms3.redDays === 1, JSON.stringify(ms3));
ok("monthSummary win rate over the month's trades (1 win of 4)", near(ms3.winRate, 25), String(ms3.winRate));
const ms2 = monthSummary(tr, L, "2025-02");
ok("monthSummary excludes other months", near(ms2.net, 10) && ms2.tradingDays === 1 && ms2.greenDays === 1 && ms2.redDays === 0);
const none = monthSummary(tr, L, "2025-04");
ok("monthSummary empty month -> zeros, null win rate", none.net === 0 && none.winRate === null && none.tradingDays === 0 && none.greenDays === 0);
// Mon-first March 2025: row 0 = pad + Mar 1-2, row 1 = Mar 3-9 (4th, 5th traded), the rest empty
const wk = weekTotals(mc, L);
ok("weekTotals: one total per row", wk.length === 6, String(wk.length));
ok("weekTotals: pad cells and no-trade days add nothing", wk[0].days === 0 && wk[0].net === 0, JSON.stringify(wk[0]));
ok("weekTotals: net + trading-day count", near(wk[1].net, 34.5) && wk[1].days === 2, JSON.stringify(wk[1]));
ok("weekTotals: empty weeks have 0 days", wk.slice(2).every((w) => w.days === 0 && w.net === 0));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
