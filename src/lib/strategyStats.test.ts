// The deeper results of one strategy. Run: npx tsx src/lib/strategyStats.test.ts
import type { Trade } from "../types";
import { strategyStats } from "./strategyStats";

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
