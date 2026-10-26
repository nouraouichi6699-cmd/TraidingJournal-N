// "My own rules". Expected values worked out by hand from the small journal below. Run: npx tsx src/lib/ownRules.test.ts
import type { Trade } from "../types";
import { ctxAt, entryBreaks, fromAdvisor, loosens, ownState, rulesAt, stricter, type Ctx, type OwnRules } from "./ownRules";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const near = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) <= 0.01;
const J = JSON.stringify;

let no = 0;
const tr = (symbol: string, side: "long" | "short", qty: number, entry: string, exit: string | null, pnl: number | null, sl: number | null = 1): Trade => ({
  key: `a:${++no}`, accountId: "a", no, symbol, side, qty, entryTime: entry, entryPrice: 1, exitTime: exit, exitPrice: exit ? 1 : null, pnl, returnPct: null, commission: 0, sl, status: exit ? "closed" : "open",
});
const none: Ctx = { n: 0, run: 0, day: 0, week: 0, month: 0, total: 0, lastLoss: null };
const at = (d: string, symbol = "XAUUSD", side: "long" | "short" = "long", qty = 0.5) => ({ at: d, symbol, side, qty });

console.log("-- a trade as it opens");
is("only these markets", J(entryBreaks({ only: ["XAUUSD"], onBreak: "warn" }, at("2026-10-20T10:00", "EURUSD"), none, 10000)) === J(["only"]));
is("hours past midnight 22-2: 23h and 1h fine, 3h not", entryBreaks({ hours: [22, 2], onBreak: "warn" }, at("2026-10-20T23:10"), none, 1e4).length === 0 && entryBreaks({ hours: [22, 2], onBreak: "warn" }, at("2026-10-20T01:10"), none, 1e4).length === 0 && J(entryBreaks({ hours: [22, 2], onBreak: "warn" }, at("2026-10-20T03:10"), none, 1e4)) === J(["hours"]));
is("profit lock at 1% of 10,000: up 100 is reached", J(entryBreaks({ lock: { v: 1, unit: "pct" }, onBreak: "warn" }, at("2026-10-20T10:00"), { ...none, day: 100 }, 1e4)) === J(["lock"]));
is("profit lock: up 99 is not", entryBreaks({ lock: { v: 1, unit: "pct" }, onBreak: "warn" }, at("2026-10-20T10:00"), { ...none, day: 99 }, 1e4).length === 0);
is("overall 10%: down 1,000 is reached", J(entryBreaks({ overall: { v: 10, unit: "pct" }, onBreak: "warn" }, at("2026-10-20T10:00"), { ...none, total: -1000 }, 1e4)) === J(["overall"]));
is("weekly 250: down 249 is not", entryBreaks({ weekly: { v: 250, unit: "money" }, onBreak: "warn" }, at("2026-10-20T10:00"), { ...none, week: -249 }, 1e4).length === 0);
is("a pause of 30 min: 29 min after a loss breaks it, 30 does not", J(entryBreaks({ cool: 30, onBreak: "warn" }, at("2026-10-20T10:29"), { ...none, lastLoss: "2026-10-20T10:00" }, 1e4)) === J(["cool"]) && entryBreaks({ cool: 30, onBreak: "warn" }, at("2026-10-20T10:30"), { ...none, lastLoss: "2026-10-20T10:00" }, 1e4).length === 0);
is("buys only: a sell; volume 1: 1.5 lots", J(entryBreaks({ side: "long", lots: 1, onBreak: "warn" }, at("2026-10-20T10:00", "XAUUSD", "short", 1.5), none, 1e4)) === J(["side", "lots"]));

// the journal: size 10,000 from Monday 2026-10-19, today Tuesday 2026-10-27
const R: OwnRules = {
  daily: { v: 100, unit: "money" }, weekly: { v: 250, unit: "money" }, monthly: { v: 5, unit: "pct" }, overall: { v: 10, unit: "pct" },
  perTrade: { v: 60, unit: "money" }, lots: 1, sl: true, maxTrades: 3, streak: 2, lock: { v: 150, unit: "money" }, cool: 30,
  hours: [9, 17], daysOff: [4], avoid: ["GBPUSD"], onBreak: "warn",
};
const J1 = [
  tr("XAUUSD", "long", 0.5, "2026-10-19T09:10", "2026-10-19T09:40", -40), // Monday
  tr("XAUUSD", "long", 0.5, "2026-10-19T10:00", "2026-10-19T10:30", -30), // 20 min after a loss: the pause
  tr("XAUUSD", "short", 0.5, "2026-10-19T11:00", "2026-10-19T11:20", -50), // after 2 losses in a row; the day ends at -120, past 100
  tr("EURUSD", "long", 0.5, "2026-10-20T09:30", "2026-10-20T10:00", 80), // Tuesday
  tr("EURUSD", "long", 0.5, "2026-10-20T10:30", "2026-10-20T11:00", 90), // up 170
  tr("XAUUSD", "long", 0.5, "2026-10-20T11:30", "2026-10-20T12:00", -70), // after the 150 lock; lost 70, past 60 a trade
  tr("XAUUSD", "long", 2, "2026-10-21T18:00", "2026-10-21T18:30", 20, null), // Wednesday: 2 lots at 18h, no stop loss
  tr("XAUUSD", "long", 0.5, "2026-10-22T09:00", "2026-10-22T09:30", 40), // Thursday: clean
  tr("GBPUSD", "long", 0.5, "2026-10-23T10:00", "2026-10-23T10:20", -100), // Friday off, an avoided market, lost 100 (day exactly at its limit)
  tr("XAUUSD", "long", 0.5, "2026-10-26T09:00", "2026-10-26T09:30", 10), // Monday: clean
  tr("XAUUSD", "long", 0.5, "2026-10-27T09:00", "2026-10-27T09:20", 15), // Tuesday: clean
];
const C = { accountId: "a", start: "2026-10-19", size: 10000 };
console.log("-- the journal, a warning only");
const s = ownState({ own: R }, C, J1, "2026-10-27");
const keys = s.violations.map((v) => `${v.key}@${v.at.slice(5)}`);
is("11 broken rules, in time order", J(keys) === J(["cool@10-19T10:00", "streak@10-19T11:00", "daily@10-19T11:20", "lock@10-20T11:30", "perTrade@10-20T12:00", "lots@10-21T18:00", "hours@10-21T18:00", "sl@10-21T18:30", "avoid@10-23T10:00", "daysOff@10-23T10:00", "perTrade@10-23T10:20"]), J(keys));
const v = (k: string, a: string) => s.violations.find((x) => x.key === k && x.at.endsWith(a));
is("the pause: 20 of 30 minutes", v("cool", "10:00")?.value === 20 && v("cool", "10:00")?.limit === 30);
is("the day: 120 lost, limit 100", near(v("daily", "11:20")?.value, 120) && near(v("daily", "11:20")?.limit, 100));
is("the lock: up 170, lock 150", near(v("lock", "11:30")?.value, 170) && near(v("lock", "11:30")?.limit, 150));
is("one trade: 70 lost, limit 60", near(v("perTrade", "12:00")?.value, 70));
is("still running (a warning only)", s.status === "active" && s.endedOn === null);
is("balance 9,965, result -35", near(s.balance, 9965) && near(s.pnl, -35), `${s.balance} ${s.pnl}`);
is("7 days with trades, 3 without a broken rule: 43", s.activeDays === 7 && s.cleanDays === 3 && s.score === 43, `${s.activeDays} ${s.cleanDays} ${s.score}`);
is("2 clean days in a row now, best 2", s.streak === 2 && s.best === 2, `${s.streak} ${s.best}`);
is("trades that broke a rule: 5, -230", s.cost.broke.n === 5 && near(s.cost.broke.net, -230), J(s.cost.broke));
is("trades within the rules: 6, +195", s.cost.kept.n === 6 && near(s.cost.kept.net, 195), J(s.cost.kept));
is("today: 1 trade, +15, not stopped", s.today.n === 1 && near(s.today.net, 15) && !s.today.stopped && s.today.nextAt === null);
const room = (k: string) => s.rooms.find((x) => x.key === k);
is("daily room 115 (up 15 today)", near(room("daily")?.room, 115) && room("daily")?.used === 0);
is("weekly: this week +25, room 275", near(room("weekly")?.room, 275));
is("monthly: 5% = 500, down 35: room 465, 7% used", near(room("monthly")?.limit, 500) && near(room("monthly")?.room, 465) && near(room("monthly")?.used, 0.07));
is("overall: 1,000, room 965", near(room("overall")?.room, 965));
is("7 day rows, the bad ones marked", s.days.length === 7 && J(s.days.filter((d) => d.bad).map((d) => d.day.slice(8))) === J(["19", "20", "21", "23"]));
is("Friday ends at 9,940 (10,000 -120 +100 +20 +40 -100)", near(s.days.find((d) => d.day === "2026-10-23")?.end, 9940));

console.log("-- the rest of the day off");
const s2 = ownState({ own: { ...R, onBreak: "day" } }, C, J1, "2026-10-27");
is("the trade after the pause also counts as trading on after a stop", s2.violations.filter((x) => x.key === "afterStop").length === 1 && s2.violations.find((x) => x.key === "afterStop")?.at === "2026-10-19T11:00", J(s2.violations.map((x) => x.key)));
is("on Monday the rest of the day is off", ownState({ own: { ...R, onBreak: "day" } }, C, J1.slice(0, 2), "2026-10-19").today.stopped);
const cool = ownState({ own: { ...R, onBreak: "day" } }, C, J1.slice(0, 1), "2026-10-19");
is("after the 09:40 loss the next trade waits until 10:10", cool.today.nextAt === "2026-10-19T10:10", String(cool.today.nextAt));

console.log("-- the end at the first broken rule");
const s3 = ownState({ own: { ...R, onBreak: "end" } }, C, J1, "2026-10-27");
is("ended on Monday by the pause, nothing after counts", s3.status === "failed" && s3.endedOn === "2026-10-19" && J(s3.violations.map((x) => x.key)) === J(["cool"]), J(s3.violations.map((x) => x.key)));
is("all the rules one trade broke are listed", J(ownState({ own: { ...R, onBreak: "end" } }, C, [J1[6]], "2026-10-27").violations.map((x) => x.key)) === J(["lots", "hours"]));

console.log("-- the goal");
const g = ownState({ own: { onBreak: "warn", goal: { v: 1, unit: "pct" } } }, C, J1.slice(3, 5), "2026-10-27");
is("goal 1% = 100: up 170, reached", g.goal?.amount === 100 && g.goal.reached && g.goal.progress === 1 && g.violations.length === 0);

console.log("-- the rule lock");
const w = (x: Partial<OwnRules>): OwnRules => ({ onBreak: "warn", ...x });
is("a higher daily limit loosens", loosens(w({ daily: { v: 100, unit: "money" } }), w({ daily: { v: 150, unit: "money" } }), 1e4));
is("a lower one does not", !loosens(w({ daily: { v: 100, unit: "money" } }), w({ daily: { v: 80, unit: "money" } }), 1e4));
is("% and money compare in money: 120 over 1% of 10,000 loosens, 90 does not", loosens(w({ daily: { v: 1, unit: "pct" } }), w({ daily: { v: 120, unit: "money" } }), 1e4) && !loosens(w({ daily: { v: 1, unit: "pct" } }), w({ daily: { v: 90, unit: "money" } }), 1e4));
is("dropping the stop-loss rule loosens", loosens(w({ sl: true }), w({}), 1e4) && stricter(w({ sl: true }), w({}), 1e4).sl === true);
is("narrower hours tighten, other hours wait", !loosens(w({ hours: [9, 17] }), w({ hours: [10, 12] }), 1e4) && loosens(w({ hours: [9, 17] }), w({ hours: [8, 12] }), 1e4) && J(stricter(w({ hours: [9, 17] }), w({ hours: [8, 12] }), 1e4).hours) === J([9, 17]));
is("one more day off tightens, none loosens", !loosens(w({ daysOff: [4] }), w({ daysOff: [4, 0] }), 1e4) && loosens(w({ daysOff: [4] }), w({}), 1e4));
is("warning instead of the day off loosens; the end tightens", loosens(w({ onBreak: "day" }), w({ onBreak: "warn" }), 1e4) && !loosens(w({ onBreak: "day" }), w({ onBreak: "end" }), 1e4));
is("the goal is not a rule", !loosens(w({ goal: { v: 500, unit: "money" } }), w({ goal: { v: 800, unit: "money" } }), 1e4));
const mix = stricter(w({ daily: { v: 100, unit: "money" }, maxTrades: 3 }), w({ daily: { v: 50, unit: "money" }, maxTrades: 5 }), 1e4);
is("tighter daily now, more trades a day later", loosens(w({ daily: { v: 100, unit: "money" }, maxTrades: 3 }), w({ daily: { v: 50, unit: "money" }, maxTrades: 5 }), 1e4) && mix.daily?.v === 50 && mix.maxTrades === 3, J(mix));
const A = w({ maxTrades: 3 }), B = w({ maxTrades: 5 });
is("the loosened set takes over once due (broker clock)", rulesAt({ own: A, ownNext: { rules: B, from: "2026-10-27T10:00" } }, "2026-10-27T09:59").maxTrades === 3 && rulesAt({ own: A, ownNext: { rules: B, from: "2026-10-27T10:00" } }, "2026-10-27T10:00").maxTrades === 5);
is("an earlier set holds until it was changed", rulesAt({ own: B, ownPast: [{ until: "2026-10-20T12:00", rules: A }] }, "2026-10-20T11:59").maxTrades === 3 && rulesAt({ own: B, ownPast: [{ until: "2026-10-20T12:00", rules: A }] }, "2026-10-20T12:00").maxTrades === 5);
const since = ownState({ own: R, ownPast: [{ until: "2026-10-21T00:00", rules: { onBreak: "warn" } }] }, C, J1, "2026-10-27");
is("rules set on Wednesday: Monday and Tuesday were within the rules then", J(since.violations.map((x) => x.key)) === J(["lots", "hours", "sl", "avoid", "daysOff", "perTrade"]) && since.cleanDays === 5 && since.score === 71, `${J(since.violations.map((x) => x.key))} ${since.cleanDays} ${since.score}`);

console.log("-- the Advisor's rules");
const imp = fromAdvisor([{ rules: { skipSymbols: ["EURUSD"] } }, { rules: { hours: [16, 14] } }, { rules: { streak: 2, dayLoss: 150 } }], w({ daily: { v: 100, unit: "money" }, onBreak: "day" }), 1e4);
is("added: the market, the hours, 2 losses in a row; the daily limit stays 100", J(imp.avoid) === J(["EURUSD"]) && J(imp.hours) === J([16, 14]) && imp.streak === 2 && imp.daily?.v === 100 && imp.onBreak === "day", J(imp));

console.log("-- the day so far, for a trade about to open");
const cx = ctxAt(J1, C, "2026-10-19T11:00");
is("Monday 11:00: 2 trades opened, 2 losses in a row, -70 today and this week", cx.n === 2 && cx.run === 2 && near(cx.day, -70) && near(cx.week, -70) && cx.lastLoss === "2026-10-19T10:30", J(cx));
const cf = ctxAt(J1, C, "2026-10-23T12:00");
is("Friday noon: -100 today, the week -60, the month and since the start -60", near(cf.day, -100) && near(cf.week, -60) && near(cf.month, -60) && near(cf.total, -60) && cf.n === 1 && cf.run === 1, J(cf));
is("a trade breaking the rules then: Friday off, 2 in a row? no: 1; the daily limit reached (-100)", J(entryBreaks(R, { at: "2026-10-23T12:00", symbol: "XAUUSD", side: "long", qty: 0.5 }, cf, 1e4)) === J(["daysOff", "daily"]), J(entryBreaks(R, { at: "2026-10-23T12:00", symbol: "XAUUSD", side: "long", qty: 0.5 }, cf, 1e4)));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
