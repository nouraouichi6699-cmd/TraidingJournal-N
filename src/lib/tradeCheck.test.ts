// "Should I take this trade?" checks. Expected values worked out by hand from the small journal below.
// Run: npx tsx src/lib/tradeCheck.test.ts
import type { Trade } from "../types";
import { breaks, checkTrade, todayOf, weekdayOf, type Planned, type Today } from "./tradeCheck";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const near = (a: number, b: number) => Math.abs(a - b) <= 0.01;

let no = 0;
const tr = (symbol: string, side: "long" | "short", entry: string, exit: string | null, pnl: number | null, sl: number | null = 1): Trade => ({
  key: `a:${++no}`, accountId: "a", no, symbol, side, qty: 1, entryTime: entry, entryPrice: 1, exitTime: exit, exitPrice: exit ? 1 : null, pnl, returnPct: null, commission: 0, sl, status: exit ? "closed" : "open",
});
const x = (o: Partial<Planned>): Planned => ({ day: "2026-10-15", hour: 10, weekday: 3, symbol: "XAUUSD", side: "long", ...o });
const none: Today = { n: 0, closed: 0, net: 0, run: 0 };

// ---- breaks: each rule on its own
is("weekdayOf: 2026-10-15 is a Thursday (3)", weekdayOf("2026-10-15") === 3);
is("symbol left aside", breaks({ skipSymbols: ["EURUSD"] }, x({ symbol: "EURUSD" }), none));
is("other symbol is fine", !breaks({ skipSymbols: ["EURUSD"] }, x({}), none));
is("longs only: a short breaks it", breaks({ side: "long" }, x({ side: "short" }), none));
is("both sides: nothing", !breaks({ side: "both" }, x({ side: "short" }), none));
is("skipped weekday", breaks({ skipDays: [3] }, x({}), none));
is("hours 9-12: 14h breaks", breaks({ hours: [9, 12] }, x({ hour: 14 }), none));
is("hours 9-12: 10h is fine", !breaks({ hours: [9, 12] }, x({ hour: 10 }), none));
is("hours 16-14 (avoid 14-16): 15h breaks", breaks({ hours: [16, 14] }, x({ hour: 15 }), none));
is("hours 16-14: 13h is fine", !breaks({ hours: [16, 14] }, x({ hour: 13 }), none));
is("hours 16-14: 17h is fine", !breaks({ hours: [16, 14] }, x({ hour: 17 }), none));
is("at most 2 a day: third trade breaks", breaks({ maxDay: 2 }, x({}), { ...none, n: 2 }));
is("at most 2 a day: second is fine", !breaks({ maxDay: 2 }, x({}), { ...none, n: 1 }));
is("stop after 2 losses: run 2 breaks", breaks({ streak: 2 }, x({}), { ...none, run: 2 }));
is("daily loss 100: at -100 breaks", breaks({ dayLoss: 100 }, x({}), { ...none, net: -100 }));
is("daily loss 100: at -99 is fine", !breaks({ dayLoss: 100 }, x({}), { ...none, net: -99 }));
is("day gain 200: at +200 breaks", breaks({ dayGain: 200 }, x({}), { ...none, net: 200 }));
is("a stop-loss rule does not block an entry", !breaks({ sl: { v: 50, unit: "money" } }, x({}), none));

// ---- today so far: 3 closed (+30 at 09:20, -50 at 10:40, -20 at 11:15) and 1 still open, on 2026-10-15
const day = [
  tr("XAUUSD", "long", "2026-10-15T09:00", "2026-10-15T09:20", 30),
  tr("XAUUSD", "short", "2026-10-15T10:00", "2026-10-15T10:40", -50),
  tr("EURUSD", "long", "2026-10-15T11:00", "2026-10-15T11:15", -20),
  tr("XAUUSD", "long", "2026-10-15T11:30", null, null),
  tr("XAUUSD", "long", "2026-10-14T09:00", "2026-10-14T09:30", 80), // the day before
];
const td = todayOf(day, "2026-10-15");
is("today: 4 opened", td.n === 4, `got ${td.n}`);
is("today: 3 closed", td.closed === 3, `got ${td.closed}`);
is("today: net -40", near(td.net, -40), `got ${td.net}`);
is("today: 2 losses in a row", td.run === 2, `got ${td.run}`);

// ---- the history: EURUSD longs at 15h on Mondays all lost (6 × -20); XAUUSD longs at 10h on Tuesdays won 5 of 6
const week = (from: string, i: number) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 7 * 864e5).toISOString().slice(0, 10);
const hist: Trade[] = [];
for (let i = 0; i < 6; i++) { const d = week("2026-09-07", i); hist.push(tr("EURUSD", "long", `${d}T15:00`, `${d}T15:30`, -20, i < 3 ? null : 1.1)); }
for (let i = 0; i < 6; i++) { const d = week("2026-09-01", i); hist.push(tr("XAUUSD", "long", `${d}T10:00`, `${d}T10:40`, i === 5 ? -30 : 50)); }
is("history days: EURUSD on Mondays", weekdayOf("2026-09-07") === 0);
is("history days: XAUUSD on Tuesdays", weekdayOf("2026-09-01") === 1);
const adopted = [{ id: "symbol", rules: { skipSymbols: ["EURUSD"] } }];
const plan = [{ id: "hours", rules: { hours: [16, 14] as [number, number] } }, { id: "symbol", rules: { skipSymbols: ["EURUSD"] } }];

const c1 = checkTrade(x({ symbol: "EURUSD", hour: 15, weekday: 0, day: "2026-10-19" }), hist, adopted, plan);
is("EURUSD at 15h: stop", c1.verdict === "stop", c1.verdict);
is("EURUSD at 15h: breaks the adopted symbol rule", c1.broken.length === 1 && c1.broken[0].id === "symbol");
is("EURUSD at 15h: the plan's hour rule too (not the adopted one twice)", c1.plan.length === 1 && c1.plan[0].id === "hours", JSON.stringify(c1.plan));
const s1 = c1.signs.find((s) => s.kind === "symbol");
is("EURUSD history: 6 trades, -120, 0% won, bad", !!s1 && s1.n === 6 && near(s1.net, -120) && s1.wr === 0 && !s1.good, JSON.stringify(s1));
is("EURUSD: no separate side sign (all longs)", !c1.signs.some((s) => s.kind === "side"));
const h1 = c1.signs.find((s) => s.kind === "hour"), d1 = c1.signs.find((s) => s.kind === "day");
is("15h: 6 trades, -120, bad", !!h1 && h1.n === 6 && near(h1.net, -120) && !h1.good);
is("Mondays: 6 trades, -120, bad", !!d1 && d1.n === 6 && !d1.good);
is("no stop on 3 of 12 trades: 25%", near(c1.noStop, 0.25), `got ${c1.noStop}`);

const c2 = checkTrade(x({ symbol: "XAUUSD", hour: 10, weekday: 6, day: "2026-10-18" }), hist, adopted, plan);
is("XAUUSD at 10h on a Sunday: go", c2.verdict === "go", c2.verdict);
const s2 = c2.signs.find((s) => s.kind === "symbol");
is("XAUUSD history: 6 trades, +220, 83% won, good", !!s2 && s2.n === 6 && near(s2.net, 220) && near(s2.wr, 83.33) && s2.good, JSON.stringify(s2));
is("10h: good sign", !!c2.signs.find((s) => s.kind === "hour" && s.good));
is("Sunday: no trades, no sign", !c2.signs.some((s) => s.kind === "day"));

const c3 = checkTrade(x({ symbol: "XAUUSD", hour: 15, weekday: 6, day: "2026-10-18" }), hist, adopted, plan);
is("XAUUSD at 15h: careful (the plan's hours, the bad hour)", c3.verdict === "careful" && c3.plan.length === 1 && c3.broken.length === 0, `${c3.verdict} ${JSON.stringify(c3.plan)}`);

const c4 = checkTrade(x({ symbol: "XAUUSD", hour: 10, weekday: 6, day: "2026-10-15" }), [...hist, ...day], adopted, []);
is("after 2 losses in a row today: careful", c4.verdict === "careful" && c4.today.run === 2, `${c4.verdict} ${c4.today.run}`);
const c5 = checkTrade(x({ symbol: "XAUUSD", hour: 10, weekday: 6, day: "2026-10-15" }), [...hist, ...day], [...adopted, { id: "streak", rules: { streak: 2 } }], []);
is("an adopted 'stop after 2 losses' rule: stop", c5.verdict === "stop" && c5.broken.some((r) => r.id === "streak"), c5.verdict);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
