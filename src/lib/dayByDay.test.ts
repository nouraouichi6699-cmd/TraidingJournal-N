import { dayKey, dayList, dayStats, dayTrades } from "./dayByDay";
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
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
