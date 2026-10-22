// What-if simulator. Expected values: independent Python oracle on the same handmade journal (scratch whatif_expect.py).
// Run: npx tsx src/lib/whatif.test.ts
import type { Trade } from "../types";
import type { Path } from "./path";
import { curves, impact, NO_RULES, simulate, type Rules, type SimInput } from "./whatif";

let pass = 0, fail = 0;
const near = (a: number | null | undefined, b: number | null, tol = 0.01) => (a == null || b == null ? a == b : Math.abs(a - b) <= tol); // eslint-disable-line eqeqeq
const t = (name: string, got: number | null | undefined, exp: number | null) => { const ok = near(got, exp); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${got}, expected ${exp}`}`); };
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };

// id, entry, exit, side, symbol, entry price, exit price, P&L, stop, path [mfe, mae, fx, ax] (null fx: measured before records)
type Row = [number, string, string, "long" | "short", string, number, number, number, number | null, [number, number, number[] | null, number[] | null] | null];
const J: Row[] = [
  [1, "2026-10-05T09:00", "2026-10-05T09:30", "long", "XAUUSD", 2400, 2402, 195, 2398, [3.0, 1.0, [5, 1.0, 20, 3.0], [2, 0.5, 8, 1.0]]],
  [2, "2026-10-05T10:00", "2026-10-05T10:20", "short", "XAUUSD", 2405, 2407, -205, 2408, [0.8, 2.5, [3, 0.8], [10, 2.5]]],
  [3, "2026-10-05T10:30", "2026-10-05T11:00", "long", "XAUUSD", 2406, 2404, -205, 2403, [0.5, 2.2, [4, 0.5], [12, 2.2]]],
  [4, "2026-10-05T11:30", "2026-10-05T12:00", "long", "XAUUSD", 2404, 2408, 395, null, [4.5, 0.6, [6, 1.5, 25, 4.5], [3, 0.6]]],
  [5, "2026-10-05T12:10", "2026-10-05T12:40", "short", "EURUSD", 1.1, 1.099, 97, 1.101, [0.0015, 0.0004, [10, 0.0015], [2, 0.0004]]],
  [6, "2026-10-06T08:00", "2026-10-06T09:00", "long", "XAUUSD", 2410, 2408, -205, 2407, [1.2, 2.4, [10, 1.2], [30, 2.4]]],
  [7, "2026-10-06T08:30", "2026-10-06T08:50", "long", "XAUUSD", 2409, 2411, 195, 2406, [2.5, 0.5, [5, 1.0, 15, 2.5], [2, 0.5]]],
  [8, "2026-10-06T09:10", "2026-10-06T09:40", "short", "XAUUSD", 2408, 2410, -205, 2411, [1.0, 2.8, [5, 1.0], [20, 2.8]]],
  [9, "2026-10-06T10:00", "2026-10-06T10:30", "long", "XAUUSD", 2410, 2413, 295, 2408, [3.5, 1.5, [3, 0.5, 25, 3.5], [10, 1.5]]],
  [10, "2026-10-07T14:00", "2026-10-07T14:45", "long", "XAUUSD", 2420, 2425, 495, 2417, [6.0, 2.0, [5, 2, 15, 4, 40, 6], [10, 1, 30, 2]]],
  [11, "2026-10-07T15:00", "2026-10-07T15:30", "short", "XAUUSD", 2425, 2421, 395, 2429, [4.5, 3.2, [8, 1, 20, 4.5], [12, 3.2]]],
  [12, "2026-10-07T16:00", "2026-10-07T16:20", "long", "XAUUSD", 2421, 2420, -105, 2417, [3.0, 3.0, [10, 3.0], [10, 3.0]]],
  [13, "2026-10-09T09:00", "2026-10-09T09:20", "long", "XAUUSD", 2430, 2433, 295, 2428, [3.2, 2.1, null, null]],
  [14, "2026-10-09T10:00", "2026-10-09T10:40", "short", "XAUUSD", 2433, 2430, 295, null, null],
  [15, "2026-10-09T11:00", "2026-10-09T11:15", "long", "EURUSD", 1.105, 1.104, -103, null, [0.0005, 0.0012, [5, 0.0005], [10, 0.0012]]],
  [16, "2026-10-09T12:00", "2026-10-09T13:00", "long", "XAUUSD", 2431, 2436, 495, 2429, [5.5, 1.0, [30, 5.5], [5, 1.0]]],
  [17, "2026-10-09T22:30", "2026-10-09T23:00", "long", "XAUUSD", 2440, 2441, 95, null, null],
];
const inputs: SimInput[] = J.map(([no, entryTime, exitTime, side, symbol, entryPrice, exitPrice, pnl, sl, p]) => {
  const trade: Trade = { key: `a:${no}`, accountId: "a", no, symbol, side, qty: 1, entryTime, entryPrice, exitTime, exitPrice, pnl, returnPct: null, commission: symbol === "XAUUSD" ? 5 : 3, sl, tp: null, status: "closed" };
  const path = p ? ({ mfe: p[0], mae: p[1], ...(p[2] ? { fx: p[2], ax: p[3] as number[] } : {}) } as unknown as Path) : null;
  return { trade, path, k: no === 16 ? null : symbol === "XAUUSD" ? 100 : 100000 }; // trade 16: no money value
});
const R = (o: Partial<Rules>): Rules => ({ ...NO_RULES, ...o });
const skipped = (r: Rules) => simulate(inputs, r).rows.filter((x) => x.skip).map((x) => x.trade.no);
const stats = (name: string, r: Rules, e: { n: number; net: number; winRate: number | null; pf: number | null; maxDD: number }, skip: number[]) => {
  const s = simulate(inputs, r);
  t(`${name}: trades`, s.sim.n, e.n); t(`${name}: net`, s.sim.net, e.net); t(`${name}: win rate %`, s.sim.winRate, e.winRate); t(`${name}: profit factor`, s.sim.pf, e.pf); t(`${name}: max drawdown`, s.sim.maxDD, e.maxDD);
  const got = skipped(r);
  is(`${name}: skipped trades`, JSON.stringify(got) === JSON.stringify(skip), `got ${JSON.stringify(got)}, expected ${JSON.stringify(skip)}`);
  return s;
};

console.log("-- No rule: the real journal");
const s0 = stats("none", NO_RULES, { n: 17, net: 2219, winRate: 64.705882, pf: 3.15856, maxDD: 410 }, []);
t("none: actual net equals what-if net", s0.actual.net, s0.sim.net);

console.log("-- Daily rules (causal: only trades already closed count)");
stats("stop after 2 losses in a row", R({ streak: 2 }), { n: 14, net: 1432, winRate: 57.142857, pf: 2.392996, maxDD: 625 }, [4, 5, 9]);
stats("daily loss limit 200", R({ dayLoss: 200 }), { n: 14, net: 1432, winRate: 57.142857, pf: 2.392996, maxDD: 625 }, [4, 5, 9]);
stats("daily profit target 400", R({ dayGain: 400 }), { n: 12, net: 1442, winRate: 66.666667, pf: 2.758537, maxDD: 410 }, [11, 12, 15, 16, 17]);
stats("max 2 trades a day", R({ maxDay: 2 }), { n: 8, net: 1460, winRate: 75, pf: 4.560976, maxDD: 215 }, [3, 4, 5, 8, 9, 12, 15, 16, 17]);
const st = simulate(inputs, R({ streak: 2 })).rows;
is("streak: trade 8 is taken (trade 6 was still open when trade 7 started)", !st.find((x) => x.trade.no === 8)?.skip);
is("skip reason recorded", st.find((x) => x.trade.no === 4)?.skip === "streak");

console.log("-- Filters");
stats("no Fridays", R({ skipDays: [4] }), { n: 12, net: 1142, winRate: 58.333333, pf: 2.234595, maxDD: 410 }, [13, 14, 15, 16, 17]);
stats("entries 09:00 to 12:00", R({ hours: [9, 12] }), { n: 9, net: 757, winRate: 55.555556, pf: 2.054318, maxDD: 410 }, [5, 6, 7, 10, 11, 12, 16, 17]);
stats("entries 22:00 to 02:00 (past midnight)", R({ hours: [22, 2] }), { n: 1, net: 95, winRate: 100, pf: null, maxDD: 0 }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
stats("without EURUSD", R({ skipSymbols: ["EURUSD"] }), { n: 15, net: 2225, winRate: 66.666667, pf: 3.405405, maxDD: 410 }, [5, 15]);
stats("long only", R({ side: "long" }), { n: 12, net: 1842, winRate: 66.666667, pf: 3.980583, maxDD: 205 }, [2, 5, 8, 11, 14]);

console.log("-- Exits (from the price path)");
const exitRow = (r: Rules, no: number) => simulate(inputs, r).rows.find((x) => x.trade.no === no)!;
const exits = (name: string, r: Rules, e: { applied: number; changed: number; noPath: number; noMoney: number; noStop: number; ties: number; unordered: number }) => {
  const x = simulate(inputs, r).exits;
  is(`${name}: exit counts`, JSON.stringify(x) === JSON.stringify(e), `got ${JSON.stringify(x)}, expected ${JSON.stringify(e)}`);
};
stats("stop loss 1R", R({ sl: { v: 1, unit: "R" } }), { n: 17, net: 1719, winRate: 58.823529, pf: 2.394161, maxDD: 410 }, []);
exits("stop loss 1R", R({ sl: { v: 1, unit: "R" } }), { applied: 12, changed: 1, noPath: 2, noMoney: 1, noStop: 2, ties: 0, unordered: 0 });
t("stop loss 1R: trade 13 stopped at -2 x 100 - 5", exitRow(R({ sl: { v: 1, unit: "R" } }), 13).pnl, -205);
is("stop loss 1R: trade 13 has no records, keeps its real close time", exitRow(R({ sl: { v: 1, unit: "R" } }), 13).exitTime === "2026-10-09T09:20");
stats("take profit 2R", R({ tp: { v: 2, unit: "R" } }), { n: 17, net: 2319, winRate: 64.705882, pf: 3.255837, maxDD: 410 }, []);
t("take profit 2R: trade 10 closes at +6 x 100 - 5", exitRow(R({ tp: { v: 2, unit: "R" } }), 10).pnl, 595);
is("take profit 2R: trade 10 closes at minute 40", exitRow(R({ tp: { v: 2, unit: "R" } }), 10).exitTime === "2026-10-07T14:40");
const both = R({ sl: { v: 300, unit: "money" }, tp: { v: 300, unit: "money" } });
stats("stop 300 + target 300", both, { n: 17, net: 1119, winRate: 58.823529, pf: 1.729941, maxDD: 610 }, []);
exits("stop 300 + target 300", both, { applied: 14, changed: 7, noPath: 2, noMoney: 1, noStop: 0, ties: 1, unordered: 0 });
is("stop 300 + target 300: trade 11 stopped first (minute 12 before 20)", exitRow(both, 11).exit === "sl" && exitRow(both, 11).exitTime === "2026-10-07T15:12");
t("stop 300 + target 300: trade 11 result", exitRow(both, 11).pnl, -305);
is("stop 300 + target 300: trade 12 both in the same bar, counted as stopped", exitRow(both, 12).exit === "sl");
is("stop 300 + target 300: trade 10 target at minute 15", exitRow(both, 10).exit === "tp" && exitRow(both, 10).exitTime === "2026-10-07T14:15");
is("stop 300 + target 300: trade 16 without money value unchanged", exitRow(both, 16).exit === null && exitRow(both, 16).pnl === 495);
stats("stop 50", R({ sl: { v: 50, unit: "money" } }), { n: 17, net: 269, winRate: 23.529412, pf: 1.377279, maxDD: 563 }, []);
t("stop 50: EURUSD trade 15 stopped at -0.0005 x 100000 - 3", exitRow(R({ sl: { v: 50, unit: "money" } }), 15).pnl, -53);
const unordered = simulate([{ ...inputs[12], path: { ...inputs[12].path!, mfe: 3.2, mae: 3.1 } }], both).exits;
is("both levels reached on a path without records: counted, cautious side", unordered.unordered === 1 && unordered.changed === 1);

console.log("-- Running totals for the chart");
const cv = curves(simulate(inputs, R({ streak: 2 })));
t("curves: one point per trade plus the start", cv.a.length, 18); t("curves: actual line ends at the real net", cv.a[17], 2219); t("curves: what-if line ends at its net", cv.b[17], 1432);
t("curves: what-if line flat over the skipped trade 4 (4th close)", cv.b[4] - cv.b[3], 0);

console.log("-- Rules together, and each rule alone");
const mix = R({ streak: 2, sl: { v: 300, unit: "money" }, tp: { v: 300, unit: "money" } });
stats("2 losses + stop 300 + target 300", mix, { n: 14, net: 432, winRate: 50, pf: 1.2818, maxDD: 940 }, [4, 5, 9]);
exits("2 losses + stop 300 + target 300", mix, { applied: 11, changed: 5, noPath: 2, noMoney: 1, noStop: 0, ties: 1, unordered: 0 });
const imp = impact(inputs, mix);
const of = (k: string) => imp.find((x) => x.key === k);
is("impact lists the 3 active rules", imp.map((x) => x.key).join() === "streak,sl,tp");
t("impact: 2 losses alone", of("streak")?.net, -787); t("impact: 2 losses alone, trades skipped", of("streak")?.skipped, 3);
t("impact: stop 300 alone", of("sl")?.net, -900); t("impact: stop 300 alone, exits changed", of("sl")?.changed, 2);
t("impact: target 300 alone", of("tp")?.net, 100); t("impact: target 300 alone, exits changed", of("tp")?.changed, 7);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
