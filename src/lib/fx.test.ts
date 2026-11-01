// Currency conversion for the all-accounts views. Run: npx tsx src/lib/fx.test.ts
import {
  convertAccounts, convertAmount, convertBalances, convertFlows, convertTrades, currenciesOf,
  frankfurterUrl, isFrankfurter, missingRates, rateOk, stripConverted,
} from "./fx";
import { setBreakEvenRange, tradeOutcomeOf } from "./outcome";
import type { Account, Trade } from "../types";
import type { CashFlow } from "./cashflow";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const eq = (name: string, got: unknown, want: unknown) => is(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const near = (name: string, got: number | null, want: number) => is(name, got != null && Math.abs(got - want) < 0.005, `got ${got}, want ${want}`);

const acc = (id: string, currency: string, startBalance = 1000): Account =>
  ({ id, platform: "mt5", name: `A-${id}`, currency, startBalance, createdAt: 0 });
const trade = (key: string, accountId: string, pnl: number | null, commission = 0): Trade => ({
  key, accountId, no: 1, symbol: "X", side: "long", qty: 1, entryTime: "2026-03-02 10:00:00", entryPrice: 1,
  exitTime: "2026-03-02 11:00:00", exitPrice: 2, pnl, returnPct: 1, commission, status: pnl == null ? "open" : "closed",
});

// Frankfurter quotes units of <code> per 1 <base>. These are the real shapes, checked against the live service.
const EUR_BASE = { USD: 1.1172, GBP: 0.8338 };
const USD_BASE = { EUR: 0.89509 };

console.log("-- rate direction, the thing that must never be inverted");
// 1 EUR = 1.1172 USD, so 100 USD is less than 100 EUR.
near("100 USD into EUR is about 89.51", convertAmount(100, "USD", "EUR", EUR_BASE), 89.51);
is("and it is less than it started", (convertAmount(100, "USD", "EUR", EUR_BASE) as number) < 100);
// The other way: 1 USD = 0.89509 EUR, so 100 EUR is more than 100 USD.
near("100 EUR into USD is about 111.72", convertAmount(100, "EUR", "USD", USD_BASE), 111.72);
is("and it is more than it started", (convertAmount(100, "EUR", "USD", USD_BASE) as number) > 100);
near("100 GBP into EUR is about 119.93", convertAmount(100, "GBP", "EUR", EUR_BASE), 119.93);
// Round trip: into the base and back out again lands where it started.
{
  const toEur = convertAmount(250, "USD", "EUR", EUR_BASE) as number;
  const back = convertAmount(toEur, "EUR", "USD", { EUR: 1 / EUR_BASE.USD }) as number;
  near("a round trip comes home", back, 250);
}
eq("the base needs no rate", convertAmount(42, "EUR", "EUR", {}), 42);
eq("a lower-case code still works", convertAmount(100, "usd", "eur", EUR_BASE), convertAmount(100, "USD", "EUR", EUR_BASE));
eq("a negative amount keeps its sign", convertAmount(-100, "USD", "EUR", EUR_BASE), -100 / 1.1172);

console.log("-- a rate has to be usable");
is("zero is not a rate", !rateOk(0));
is("a negative is not a rate", !rateOk(-1));
is("nonsense is not a rate", !rateOk(NaN) && !rateOk("1.1" as unknown) && !rateOk(undefined));
is("a positive number is", rateOk(1.1172));
eq("a missing rate converts nothing", convertAmount(100, "TND", "EUR", EUR_BASE), null);
eq("a zero rate converts nothing", convertAmount(100, "USD", "EUR", { USD: 0 }), null);
eq("a blank currency converts nothing", convertAmount(100, "", "EUR", EUR_BASE), null);

console.log("-- which rates are still needed");
const accounts = [acc("a", "EUR"), acc("b", "USD"), acc("c", "USD")];
eq("the currencies in play", currenciesOf(accounts), ["EUR", "USD"]);
eq("nothing missing once USD is known", missingRates(accounts, "EUR", EUR_BASE), []);
eq("USD missing when it is not", missingRates(accounts, "EUR", {}), ["USD"]);
eq("the base is never missing", missingRates([acc("a", "EUR")], "EUR", {}), []);
eq("a blank currency is reported", missingRates([acc("a", "")], "EUR", {}), [""]);
eq("no base means everything is missing", missingRates(accounts, "", EUR_BASE), ["EUR", "USD"]);

console.log("-- all or nothing");
const trades = [trade("t1", "a", 100, 2), trade("t2", "b", 100, 2)];
is("one missing rate converts no trades", convertTrades(trades, accounts, "EUR", {}) === null);
is("one missing rate converts no accounts", convertAccounts(accounts, "EUR", {}) === null);
is("one missing rate converts no flows", convertFlows([{ id: "f", accountId: "b", t: "2026-03-02", type: "deposit", amount: 10 } as CashFlow], accounts, "EUR", {}) === null);
is("one missing rate converts no balances", convertBalances({ b: [{ t: "2026-03-02", balance: 10 }] }, accounts, "EUR", {}) === null);

console.log("-- converted copies");
const conv = convertTrades(trades, accounts, "EUR", EUR_BASE)!;
eq("the EUR trade is untouched", conv[0].pnl, 100);
near("the USD trade is converted", conv[1].pnl, 89.51);
near("and so is its commission", conv[1].commission, 1.79);
eq("the own-currency P&L travels along", conv[1].pnlOwn, 100);
eq("so does the own-currency commission", conv[1].commissionOwn, 2);
eq("the stored trades are not touched", trades[1].pnl, 100);
is("prices are left alone, they are not in the account currency", conv[1].entryPrice === 1 && conv[1].exitPrice === 2);
eq("a return percentage has no currency", conv[1].returnPct, 1);
// An open trade has no P&L to convert.
{
  const open = convertTrades([trade("t3", "b", null, 1)], accounts, "EUR", EUR_BASE)!;
  eq("an open trade keeps its empty P&L", open[0].pnl, null);
  eq("and records it as such", open[0].pnlOwn, null);
}
{
  const ca = convertAccounts(accounts, "EUR", EUR_BASE)!;
  near("a USD start balance is converted", ca[1].startBalance, 895.09);
  eq("and the account now reads as the base", ca[1].currency, "EUR");
}

console.log("-- an outcome never depends on the view");
setBreakEvenRange(0.5);
{
  // 0.40 USD is inside the break-even range in its own account; converting would make it 0.358 EUR, still inside,
  // so pick a value that would cross: 0.56 USD is a win on its own and 0.50 EUR converted, which the range swallows.
  const t = trade("edge", "b", 0.56);
  const c = convertTrades([t], accounts, "EUR", EUR_BASE)!;
  eq("a win on its own account", tradeOutcomeOf(t), "win");
  eq("is still a win once converted", tradeOutcomeOf(c[0]), "win");
  near("even though the converted amount is inside the range", c[0].pnl, 0.5);
}
{
  // The rounding edge: 0.0049 is break-even under the cents rule, but 0.00438 EUR would round the other way if the
  // converted value were classified. Reading the own-currency value keeps it break-even.
  const t = trade("round", "b", 0.0049);
  const c = convertTrades([t], accounts, "EUR", EUR_BASE)!;
  eq("break-even on its own account", tradeOutcomeOf(t, 2), "be");
  eq("still break-even once converted", tradeOutcomeOf(c[0], 2), "be");
}
setBreakEvenRange(0);
{
  const t = trade("plain", "b", 0.0049);
  const c = convertTrades([t], accounts, "EUR", EUR_BASE)!;
  eq("and with no range it is still break-even", tradeOutcomeOf(c[0], 2), "be");
  eq("while the raw rule still calls it a win", tradeOutcomeOf(c[0]), "win");
}

console.log("-- a converted copy can never be stored");
eq("ordinary trades pass through untouched", stripConverted(trades), trades);
is("and are the very same array", stripConverted(trades) === trades);
{
  const stripped = stripConverted(conv);
  eq("the P&L is put back", stripped[1].pnl, 100);
  eq("the commission is put back", stripped[1].commission, 2);
  is("and the markers are gone", !("pnlOwn" in stripped[1]) && !("commissionOwn" in stripped[1]));
  eq("a mixed list is cleaned too", stripConverted([trades[0], conv[1]])[1].pnl, 100);
  // What the journal would have written before the net existed.
  is("nothing converted survives a round trip through storage", JSON.parse(JSON.stringify(stripConverted(conv))).every((t: Trade) => t.pnlOwn === undefined));
}

console.log("-- the service call carries nothing but codes");
{
  const url = frankfurterUrl("EUR", ["USD", "GBP"]);
  eq("the url is the documented one", url, "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP");
  is("no amount is in it", !/\d{3,}/.test(url));
  is("no account is in it", !/account|user|id=/i.test(url));
  eq("codes are normalised", frankfurterUrl("eur", ["usd"]), "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD");
}
is("the ECB set is recognised", isFrankfurter("USD") && isFrankfurter("jpy") && isFrankfurter("ZAR"));
is("crypto and the rest are not", !isFrankfurter("USDT") && !isFrankfurter("RUB") && !isFrankfurter("TND") && !isFrankfurter(""));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
