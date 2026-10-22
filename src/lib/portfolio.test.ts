// Portfolio analytics: expected values come from an independent Python script (brute force minute by minute for exposure).
// Run: npx tsx src/lib/portfolio.test.ts
import type { Account, Trade } from "../types";
import type { CashFlow } from "./cashflow";
import { pointValues, portfolioStats } from "./portfolio";

let pass = 0, fail = 0;
const near = (a: number | null | undefined, b: number | null, tol = 0.01) => (a == null || b == null ? a === b : Math.abs(a - b) <= tol);
const t = (name: string, got: number | null | undefined, exp: number | null, tol = 0.01) => { const ok = near(got, exp, tol); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${got}, expected ${exp}`}`); };
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };

// ---- data: 30 weekdays from Mon 2026-03-02; A trades EURUSD (+ NAS100 every 5th day), B shorts XAUUSD
const D: string[] = [];
for (let u = Date.UTC(2026, 2, 2); D.length < 30; u += 864e5) { const w = new Date(u).getUTCDay(); if (w > 0 && w < 6) D.push(new Date(u).toISOString().slice(0, 10)); }
const r5 = (x: number) => Math.round(x * 1e5) / 1e5, r2 = (x: number) => Math.round(x * 100) / 100;
const T: Trade[] = [];
let k = 0;
const add = (accountId: string, symbol: string, side: "long" | "short", qty: number, entryTime: string, exitTime: string | null, entryPrice: number, exitPrice: number | null, commission: number, pnl: number | null) =>
  T.push({ key: `${accountId}:${++k}`, accountId, no: k, symbol, side, qty, entryTime, entryPrice, exitTime, exitPrice, pnl, returnPct: null, commission, status: exitTime ? "closed" : "open" });
D.forEach((d, i) => {
  const ep = r5(1.1 + i * 0.001), mv = 0.001 * (((i * 7) % 5) - 2);
  add("A", "EURUSD", "long", 1, `${d}T10:00`, `${d}T12:00`, ep, r5(ep + mv), 7, r2(mv * 100000 - 7));
  if (i % 5 === 0) add("A", "NAS100", "long", 2, `${d}T11:30`, `${d}T12:30`, 18000, 18000 + 10 * ((i % 4) - 1), 0, 20 * ((i % 4) - 1));
  if (i === 3) add("A", "EURUSD", "long", 1, `${d}T13:00`, `${d}T13:00`, 1.15, 1.1505, 7, 43); // opened and closed in the same minute
  const mb = 5 * (((i * 3) % 7) - 3), e2 = 2000 + i;
  add("B", "XAUUSD", "short", 0.1, `${d}T11:00`, `${d}T15:00`, e2, e2 - mb, 2, r2(10 * mb - 2));
});
add("A", "EURUSD", "long", 0.5, "2026-03-14T09:00", "2026-03-14T09:30", 1.2, 1.201, 3, 47); // a Saturday
add("B", "XAUUSD", "long", 0.2, `${D[29]}T16:00`, null, 2100, null, 0, null); // still open
const acc = (id: string, startBalance: number): Account => ({ id, platform: "mt5", name: `Acc ${id}`, currency: "USD", startBalance, createdAt: 1 });
const A = [acc("A", 10000), acc("B", 5000), acc("C", 2000)];
const F: CashFlow[] = [{ id: "f1", accountId: "B", t: `${D[10]}T09:00`, type: "deposit", amount: 1000 }, { id: "f2", accountId: "A", t: `${D[20]}T16:00`, type: "withdrawal", amount: 500 }];
const p = portfolioStats(T, A, F, T, Date.parse(`${D[29]}T18:00Z`));

console.log("-- Composition");
is("2 of 3 accounts have trades", p.active === 2 && p.selected === 3 && p.start === 15000, `${p.active}/${p.selected} start ${p.start}`);
t("account A P&L", p.accounts.find((x) => x.key === "A")?.pnl, -100); t("account A contribution %", p.accounts.find((x) => x.key === "A")?.pct, -0.6666666666666667);
t("account B contribution %", p.accounts.find((x) => x.key === "B")?.pct, -1.4);
is("best account first", p.accounts[0].key === "A" && p.accounts[p.accounts.length - 1].key === "B");
t("EURUSD contribution %", p.symbols.find((x) => x.key === "EURUSD")?.pct, -0.8); t("NAS100 contribution %", p.symbols.find((x) => x.key === "NAS100")?.pct, 0.13333333333333333);
t("XAUUSD contribution %", p.symbols.find((x) => x.key === "XAUUSD")?.pct, -1.4);
t("account HHI", p.accConc?.hhi, 0.5629552549427679, 1e-6); t("account effective number", p.accConc?.eff, 1.7763401109057304);
t("symbol HHI", p.symConc?.hhi, 0.48081632653061224, 1e-6); t("symbol effective number", p.symConc?.eff, 2.0797962648556876);

console.log("-- Drawdown (flows excluded) and who caused it");
t("max drawdown amount", p.dd?.amount, 466); t("max drawdown %", p.dd?.pct, 2.959399128155367);
t("A share of the drawdown", p.dd?.shares.find((x) => x.key === "A")?.share, 49.78540772532189); t("B share of the drawdown", p.dd?.shares.find((x) => x.key === "B")?.share, 50.21459227467812);
is("largest share first", p.dd?.shares[0].key === "B");

console.log("-- Daily series: correlation, diversification, risk contribution, VaR / ES");
t("trading days (30 weekdays + 1 Saturday)", p.days, 31);
t("A/B correlation", p.corr.max?.v, 0.020506895050695813, 1e-6); t("average correlation", p.corr.avg, 0.020506895050695813, 1e-6);
t("diversification ratio", p.divRatio, 1.4037172302008558); is("risk contribution by account, A largest", p.risk?.by === "account" && p.risk.key === "A");
t("A risk share %", p.risk?.share, 66.37968398623028);
t("VaR 95% (daily, %)", p.var95, -1.8712896667636398); t("ES 95% (daily, %)", p.es95, -2.291414248957502); t("end balance", p.balance, 15190);

console.log("-- Positions: overlap, exposure, leverage (open position runs to now)");
t("overlap % of time in market", p.overlap.share, 21.650273224043715); t("most positions at once", p.overlap.maxOpen, 3);
t("max gross exposure", p.exposure?.maxGross, 168749.99999999988); t("max net exposure", p.exposure?.maxNet, 128249.9999999999);
t("avg gross exposure", p.exposure?.avgGross, 61877.48633879781); t("avg net exposure", p.exposure?.avgNet, 30173.879781420757);
t("max effective leverage", p.exposure?.maxLev, 11.08264572797444); t("avg effective leverage", p.exposure?.avgLev, 4.045365519767009);
const pv = pointValues(T);
t("point value A|EURUSD (100,000 per lot)", pv.get("A|EURUSD"), 100000, 0.5); t("point value B|XAUUSD (100 oz)", pv.get("B|XAUUSD"), 100); t("point value A|NAS100", pv.get("A|NAS100"), 1);

console.log("-- Edge cases");
{ const one = portfolioStats(T.filter((x) => x.accountId === "A"), A, F.filter((f) => f.accountId === "A"), T, Date.parse(`${D[29]}T18:00Z`));
  is("one account: no account correlation / diversification", one.corr.pairs === 0 && one.corr.avg === null && one.divRatio === null);
  is("one account: risk contribution by symbol", one.risk?.by === "symbol", JSON.stringify(one.risk)); }
{ const none = portfolioStats([], A, [], [], 0);
  is("no trades: nothing computed", none.active === 0 && none.dd === null && none.exposure === null && none.var95 === null && none.accConc === null); }
{ const few = portfolioStats(T.slice(0, 12), A, [], T, 0);
  is("under 20 days: no VaR, correlation or diversification", few.var95 === null && few.divRatio === null && few.corr.pairs === 0, `${few.days} days`); }
{ const noPv = portfolioStats(T.map((x) => ({ ...x, exitPrice: x.entryPrice })), A, [], [], Date.parse(`${D[29]}T18:00Z`));
  is("no price moves: exposure unknown, overlap still measured", noPv.exposure === null && noPv.overlap.maxOpen === 3); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
