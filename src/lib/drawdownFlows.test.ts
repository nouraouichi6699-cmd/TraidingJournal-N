// Run: npx tsx src/lib/drawdownFlows.test.ts — Overview drawdown / ratios with recorded deposits and withdrawals.
import { computeOverview } from "./stats";
import type { CashFlow } from "./cashflow";
import type { Account, Trade } from "../types";
let pass = 0, fail = 0;
const t = (name: string, got: number | null, exp: number | null, tol = 0.01) => { const ok = got == null || exp == null ? got === exp : Math.abs(got - exp) <= tol; ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${got}, expected ${exp}`}`); };
let k = 0;
const tr = (pnl: number, at: string, acc = "a"): Trade => ({ key: `${acc}:${++k}`, accountId: acc, no: k, symbol: "X", side: "long", qty: 1, entryTime: at.slice(0, 10) + "T08:00", entryPrice: 1, exitTime: at, exitPrice: 1, pnl, returnPct: null, commission: 0, status: "closed" } as Trade);
const F = (at: string, type: CashFlow["type"], amount: number, acc = "a"): CashFlow => ({ id: String(++k), accountId: acc, t: at, type, amount });
const A = (id = "a", start = 10000): Account[] => [{ id, platform: "tradingview", name: id, currency: "USD", startBalance: start } as Account];

console.log("-- Ledger curve (no imported history)");
{ // +1000, withdraw 5000, +100: the withdrawal is not a drawdown
  const trades = [tr(1000, "2026-01-02T10:00"), tr(100, "2026-01-04T10:00")];
  const naive = computeOverview(trades, A(), {}, "", [F("2026-01-03T00:00", "deposit", -1)].slice(0, 0));
  t("without flows: no drawdown (sanity)", naive.maxBalDD, 0);
  const o = computeOverview(trades, A(), {}, "", [F("2026-01-03T00:00", "withdrawal", 5000)]);
  t("withdrawal of 5,000 is not a 45% drawdown", o.maxBalDD, 0);
  t("no time under water", o.underwaterDays, 0);
}
{ // deposit 10,000 then lose 1,000: 5% of the 20,000 traded, 1,000 in money
  const trades = [tr(-1000, "2026-01-03T10:00"), tr(1500, "2026-01-05T10:00")];
  const o = computeOverview(trades, A(), {}, "", [F("2026-01-02T00:00", "deposit", 10000)]);
  t("drawdown % is measured on the balance actually traded (1,000 / 20,000)", o.maxBalDD, 5);
  t("recovery factor = net / money lost (500 / 1,000)", o.recovery, 0.5);
}
console.log("-- Imported balance history (MT5 snapshots include the withdrawal)");
{ const pts = { m: [{ t: "2026-01-01T09:00", balance: 10000 }, { t: "2026-01-02T10:00", balance: 11000 }, { t: "2026-01-03T09:00", balance: 6000 }, { t: "2026-01-04T10:00", balance: 5900 }] };
  const trades = [tr(1000, "2026-01-02T10:00", "m"), tr(-100, "2026-01-04T10:00", "m")];
  const before = computeOverview(trades, A("m"), pts);
  t("old behaviour without the flow: 46.4% fake drawdown", before.maxBalDD, (11000 - 5900) / 11000 * 100);
  const o = computeOverview(trades, A("m"), pts, "", [F("2026-01-03T09:00", "withdrawal", 5000, "m")]);
  t("with the imported withdrawal: only the 100 loss counts (100 / 6,000 of the index)", o.maxBalDD, (1 - (1 - 100 / 6000)) * 100);
  t("money lost to trading = 100", o.recovery, 900 / 100);
  const manual = computeOverview(trades, A("m"), pts, "", [F("2026-01-03 00:00:00", "withdrawal", 5000, "m")]);
  t("a manual flow dated that morning is matched to the next snapshot", manual.maxBalDD, (100 / 6000) * 100);
}
console.log("-- Sharpe / Sortino: a deposit raises the base, it is not a return (independent Python reference)");
{ const days: string[] = []; for (let d = new Date(Date.UTC(2026, 0, 5)); days.length < 30; d = new Date(d.getTime() + 864e5)) if (d.getUTCDay() % 6 !== 0) days.push(d.toISOString().slice(0, 10));
  const trades = days.map((d, i) => tr(i % 2 === 0 ? 100 : -50, `${d}T10:00`));
  const o = computeOverview(trades, A(), {}, "", [F(`${days[10]}T00:00`, "deposit", 10000)]);
  t("Sharpe with the deposit", o.sharpe, 4.910810490192764, 1e-6);
  t("Sortino with the deposit", o.sortino, 10.724104930304847, 1e-6);
  const n = computeOverview(trades, A(), {});
  t("Sharpe without flows unchanged", n.sharpe, 5.267939118325951, 1e-6);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
