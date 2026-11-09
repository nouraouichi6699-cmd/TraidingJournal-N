// Run: npx tsx src/lib/dashStats.test.ts
import { metrics } from "./dashStats";
import { computeOverview } from "./stats";
import { setBreakEvenRange } from "./outcome";
import type { Account, Trade } from "../types";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + info}`); };
const near = (name: string, got: number | null, exp: number, tol = 0.01) => check(name, got != null && Math.abs(got - exp) <= tol, `got ${got}, expected ${exp}`);

const acc: Account[] = [{ id: "a", name: "A", startBalance: 1000 } as Account];
let k = 0;
const tr = (pnl: number | null, day: string, o: Partial<Trade> = {}): Trade => ({
  key: String(k++), accountId: "a", no: k, symbol: "X", side: "long", qty: 1, entryTime: `${day}T10:00`, entryPrice: 1, exitTime: `${day}T11:00`, exitPrice: 1,
  pnl, returnPct: null, commission: 0, sl: null, tp: null, status: pnl == null ? "open" : "closed", ...o,
} as Trade);

// Overview and Dashboard must agree on net: one trade with commission+swap already baked into pnl, one open
// trade (excluded), and one deposit (excluded) -- net is the sum of closed trades' pnl only.
{
  setBreakEvenRange(0);
  const trades = [tr(-64.4, "2026-01-05", { commission: 5 }), tr(500, "2026-01-06")]; // 2nd trade is open (pnl=null below)
  trades[1].pnl = null; trades[1].status = "open";
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null);
  const o = computeOverview(trades, acc, {}, "", [{ id: "f1", accountId: "a", t: "2026-01-04T00:00", type: "deposit", amount: 1000 }]);
  const d = metrics(closed);
  near("Overview net = -64.4 (closed trade only, open & deposit excluded)", o.net, -64.4);
  near("Dashboard net matches Overview net", d.net, o.net);
}

// Regression: with a non-zero break-even range, a trade inside the range must still count fully in both nets
// (the range reclassifies win/loss/be, but it must never make pnl vanish from an aggregate's net -- the bug
// this test guards against: dashStats.metrics() used to compute net as wins-sum minus losses-sum, silently
// dropping break-even trades).
{
  setBreakEvenRange(0.5);
  const trades = [tr(100, "2026-01-05"), tr(0.3, "2026-01-06"), tr(-0.3, "2026-01-07")];
  const o = computeOverview(trades, acc, {});
  const d = metrics(trades);
  near("break-even range classifies 2 of 3 trades as 'be'", o.beRate, (2 / 3) * 100);
  near("Overview net sums every closed trade regardless of be classification", o.net, 100);
  near("Dashboard net matches Overview net under a break-even range", d.net, o.net);
  setBreakEvenRange(0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
