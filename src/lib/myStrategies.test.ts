// The trader's own strategies and the strategy of each trade: storage, results, and the portfolio's strategy shares.
// Run: npx tsx src/lib/myStrategies.test.ts
import { readFileSync } from "node:fs";
import type { Account, Trade } from "../types";
import { LINK_KEY, MINE_KEY, linkTrade, readLinks, readMine, resultsOf, setMine } from "./myStrategies";
import { portfolioStats } from "./portfolio";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const J = JSON.stringify;

// A browser-like storage for the test.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; },
} as Storage;

is("nothing kept yet", J(readMine()) === "[]" && J(readLinks()) === "{}");
setMine("smc", true); setMine("orb", true); setMine("smc", true);
is("added once each, in order", J(readMine()) === J(["orb", "smc"]), J(readMine()));
setMine("orb", false);
is("taken out", J(readMine()) === J(["smc"]));
store.set(MINE_KEY, J(["smc", "not-a-strategy", 7, "ict", "ict"]));
is("unknown ids and duplicates left out", J(readMine()) === J(["smc", "ict"]), J(readMine()));
store.set(MINE_KEY, "{broken");
is("broken storage reads as empty", J(readMine()) === "[]");
store.set(MINE_KEY, J(["smc"]));

linkTrade("A:1", "smc"); linkTrade("A:2", "wyckoff"); linkTrade("A:3", "smc");
is("trades linked", J(readLinks()) === J({ "A:1": "smc", "A:2": "wyckoff", "A:3": "smc" }), J(readLinks()));
is("a strategy used on a trade joins the trader's own", J(readMine()) === J(["smc", "wyckoff"]), J(readMine()));
linkTrade("A:2", null);
is("unlinked", !("A:2" in readLinks()));
is("unlinking keeps it among the trader's own", readMine().includes("wyckoff"));
linkTrade("A:3", "orb");
is("a trade has one strategy: the new one replaces the old", readLinks()["A:3"] === "orb");
store.set(LINK_KEY, J({ "A:1": "smc", "A:9": "gone", "A:8": 3 }));
is("links to unknown strategies left out", J(readLinks()) === J({ "A:1": "smc" }), J(readLinks()));
store.set(LINK_KEY, J([1, 2]));
is("a list is not a link map", J(readLinks()) === "{}");

const tr = (key: string, pnl: number | null, symbol = "EURUSD", accountId = "A"): Trade => ({
  key, accountId, no: Number(key.split(":")[1]), symbol, side: "long", qty: 1, entryTime: "2026-10-01T10:00", entryPrice: 1, exitTime: pnl == null ? null : "2026-10-01T11:00",
  exitPrice: pnl == null ? null : 1, pnl, returnPct: null, commission: 0, status: pnl == null ? "open" : "closed",
});
const trades = [tr("A:1", 120), tr("A:2", -40), tr("A:3", 60), tr("A:4", null), tr("A:5", -30), tr("A:6", 200)];
const links = { "A:1": "smc", "A:2": "smc", "A:3": "smc", "A:4": "smc", "A:5": "orb" } as const;
const r = resultsOf("smc", trades, links);
is("results: linked, closed, wins", r.linked === 4 && r.closed === 3 && r.wins === 2, J(r));
is("results: net of the closed trades", r.net === 140, String(r.net));
is("results: win rate", Math.abs((r.winRate ?? 0) - 66.6667) < 0.01, String(r.winRate));
const none = resultsOf("wyckoff", trades, links);
is("results: a strategy with no trades", none.linked === 0 && none.closed === 0 && none.net === 0 && none.winRate === null);
const onlyOpen = resultsOf("smc", [tr("A:4", null)], links);
is("results: only open trades have no win rate", onlyOpen.linked === 1 && onlyOpen.closed === 0 && onlyOpen.winRate === null);

// The portfolio's strategy shares: only linked trades, P&L ÷ starting balance, best first.
const acc: Account[] = [{ id: "A", platform: "mt5", name: "A", currency: "USD", startBalance: 10000, createdAt: 1 }];
const short: Record<string, string> = { smc: "SMC", orb: "ORB 15m" };
const p = portfolioStats(trades, acc, [], trades, Date.parse("2026-10-02T00:00Z"), (t) => (links[t.key as keyof typeof links] ? short[links[t.key as keyof typeof links]] : undefined));
is("portfolio: one share per strategy used", J(p.strategies.map((s) => s.name)) === J(["SMC", "ORB 15m"]), J(p.strategies));
is("portfolio: P&L of the linked closed trades", p.strategies[0].pnl === 140 && p.strategies[1].pnl === -30);
is("portfolio: share of the starting balance (percentage points)", Math.abs((p.strategies[0].pct ?? 0) - 1.4) < 1e-9 && Math.abs((p.strategies[1].pct ?? 0) + 0.3) < 1e-9);
is("portfolio: the unlinked trade (+200) is left out", p.strategies.every((s) => s.pnl !== 200));
const hhi = (140 / 170) ** 2 + (30 / 170) ** 2;
is("portfolio: strategy concentration (Herfindahl of |P&L| shares)", !!p.stratConc && Math.abs(p.stratConc.hhi - hhi) < 1e-9 && p.stratConc.n === 2, J(p.stratConc));
const q = portfolioStats(trades, acc, [], trades, Date.parse("2026-10-02T00:00Z"));
is("portfolio: no strategy shares without links", q.strategies.length === 0 && q.stratConc === null);
is("portfolio: the other figures do not change", q.symbols[0].pnl === p.symbols[0].pnl && q.closed === p.closed);

// Both settings follow the trader to other devices.
const sync = readFileSync(new URL("./settingsSync.ts", import.meta.url), "utf8");
is("synced settings include both keys", sync.includes(`"${MINE_KEY}"`) && sync.includes(`"${LINK_KEY}"`));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
