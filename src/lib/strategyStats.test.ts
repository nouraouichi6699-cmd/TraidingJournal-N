// The deeper results of one strategy. Run: npx tsx src/lib/strategyStats.test.ts
import type { Trade } from "../types";
import { conditionsOf, strategyStats } from "./strategyStats";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const near = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.01;
const J = JSON.stringify;

const tr = (key: string, side: "long" | "short", pnl: number | null, entry: string, exit: string | null, prices: [number, number | null, number | null] = [1, 1, null]): Trade => ({
  key, accountId: "A", no: Number(key.slice(2)), symbol: "XAUUSD", side, qty: 1, entryTime: entry, entryPrice: prices[0], exitTime: exit, exitPrice: prices[1], sl: prices[2],
  pnl, returnPct: null, commission: 0, status: pnl == null ? "open" : "closed",
});
// given out of order; one open trade
const list = [
  tr("A:3", "long", -50, "2026-10-03T10:00", "2026-10-03T12:00"),
  tr("A:1", "long", 200, "2026-10-01T10:00", "2026-10-01T11:00", [1, 1.2, 0.9]), // +2R
  tr("A:5", "long", null, "2026-10-05T10:00", null),
  tr("A:4", "long", 80, "2026-10-04T10:00", "2026-10-04T10:30"),
  tr("A:2", "short", -100, "2026-10-02T10:00", "2026-10-02T10:30", [2, 2.1, 2.2]), // -0.5R
];
const s = strategyStats(list);
is("closed trades only", s.n === 4, String(s.n));
is("curve in close order", J(s.curve) === J([200, 100, 50, 130]), J(s.curve));
is("profit factor", near(s.pf, 280 / 150), String(s.pf));
is("average per trade", near(s.avgTrade, 32.5), String(s.avgTrade));
is("average win / loss", near(s.avgWin, 140) && near(s.avgLoss, -75), `${s.avgWin} ${s.avgLoss}`);
is("best / worst", s.best === 200 && s.worst === -100);
is("max drawdown from the peak", near(s.maxDD, 150), String(s.maxDD));
is("streaks", s.winStreak === 1 && s.lossStreak === 2, `${s.winStreak} ${s.lossStreak}`);
is("average R over the trades with a stop", near(s.avgR, 0.75) && s.rN === 2, `${s.avgR} ${s.rN}`);
is("average hold in minutes", near(s.holdMin, 60), String(s.holdMin));
is("long side", s.long.n === 3 && s.long.wins === 2 && near(s.long.winRate, 66.67) && near(s.long.net, 230), J(s.long));
is("short side", s.short.n === 1 && s.short.winRate === 0 && near(s.short.net, -100), J(s.short));
is("a loss first: drawdown from 0", near(strategyStats([tr("A:1", "long", -50, "2026-10-01T10:00", "2026-10-01T11:00"), tr("A:2", "long", 20, "2026-10-02T10:00", "2026-10-02T11:00")]).maxDD, 50));
const e = strategyStats([]);
is("no trades", e.n === 0 && e.pf === null && e.avgR === null && e.holdMin === null && e.maxDD === 0 && e.curve.length === 0 && e.long.winRate === null);

// ---- when it works (entry times read as UTC; 2026-10-26 is a Monday)
const at = (key: string, sym: string, pnl: number | null, entry: string) => ({ ...tr(key, "long", pnl, entry, pnl == null ? null : entry.slice(0, 11) + "23:00"), symbol: sym });
const w = [
  at("A:1", "XAUUSD", 100, "2026-10-26T14:30"), at("A:2", "XAUUSD", 50, "2026-10-26T15:00"), at("A:3", "XAUUSD", 70, "2026-10-27T15:10"),
  at("A:4", "XAUUSD", -40, "2026-10-27T08:00"), at("A:5", "EURUSD", -60, "2026-10-26T09:00"), at("A:6", "EURUSD", -30, "2026-10-28T09:30"),
  at("A:7", "EURUSD", -20, "2026-10-26T16:00"), at("A:8", "EURUSD", null, "2026-10-26T10:00"),
];
const c = conditionsOf(w);
is("closed trades only", c.n === 7);
is("hours and days with trades", J(c.hours) === J([8, 9, 14, 15, 16]) && J(c.days) === J([0, 1, 2]), `${J(c.hours)} ${J(c.days)}`);
is("the Charts heatmap", c.heat[0][14].n === 1 && c.heat[0][14].net === 100 && c.heat[1][15].wins === 1);
is("by session, in session order", J(c.sessions.map((x) => [x.s, x.p.n, x.p.net])) === J([["sessLN", 3, -130], ["sessNY", 4, 200]]), J(c.sessions));
is("by day", J(c.byDay.map((x) => [x.d, x.p.n])) === J([[0, 4], [1, 2], [2, 1]]));
is("top symbols", J(c.symbols.map((x) => [x.sym, x.p.net])) === J([["XAUUSD", 180], ["EURUSD", -110]]));
is("best: gold in New York", c.best?.g.kind === "symbolSession" && J(c.best.g) === J({ kind: "symbolSession", sym: "XAUUSD", s: "sessNY" }) && c.best.p.net === 220, J(c.best));
is("worst: the London session", J(c.worst?.g) === J({ kind: "session", s: "sessLN" }) && c.worst?.p.net === -130, J(c.worst));
const one = conditionsOf(w.slice(0, 4));
is("one symbol: not named for all the trades, the more specific group on a tie", one.best?.g.kind === "symbolSession" && one.best.p.n === 3, J(one.best));
is("fewer than 3 trades: nothing named", conditionsOf(w.slice(4, 6)).best === null && conditionsOf(w.slice(4, 6)).worst === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
