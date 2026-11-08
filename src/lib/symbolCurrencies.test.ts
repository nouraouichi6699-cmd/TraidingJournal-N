// Run: npx tsx src/lib/symbolCurrencies.test.ts
import { symbolCurrencies } from "./symbolCurrencies";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + d}`); };
const J = (v: unknown) => JSON.stringify(v);

// ---- forex pairs ----
ok("EURUSD -> EUR, USD", J(symbolCurrencies("EURUSD")) === J(["EUR", "USD"]));
ok("USDJPY -> USD, JPY", J(symbolCurrencies("USDJPY")) === J(["USD", "JPY"]));
ok("GBPJPY -> GBP, JPY", J(symbolCurrencies("GBPJPY")) === J(["GBP", "JPY"]));
ok("EURGBP -> EUR, GBP", J(symbolCurrencies("EURGBP")) === J(["EUR", "GBP"]));

// ---- metals ----
ok("XAUUSD -> USD", J(symbolCurrencies("XAUUSD")) === J(["USD"]));
ok("XAGUSD -> USD", J(symbolCurrencies("XAGUSD")) === J(["USD"]));
ok("XPTUSD -> USD", J(symbolCurrencies("XPTUSD")) === J(["USD"]));
ok("XAUEUR (still a metal) -> USD", J(symbolCurrencies("XAUEUR")) === J(["USD"]));

// ---- oil ----
for (const s of ["USOIL", "WTI", "XTI", "UKOIL", "BRENT"]) ok(`${s} -> USD`, J(symbolCurrencies(s)) === J(["USD"]), J(symbolCurrencies(s)));

// ---- indices ----
for (const s of ["US30", "DJ30", "NAS100", "US100", "SPX500", "US500"]) ok(`${s} -> USD`, J(symbolCurrencies(s)) === J(["USD"]), J(symbolCurrencies(s)));
for (const s of ["GER40", "DE40", "DAX"]) ok(`${s} -> EUR`, J(symbolCurrencies(s)) === J(["EUR"]), J(symbolCurrencies(s)));
ok("UK100 -> GBP", J(symbolCurrencies("UK100")) === J(["GBP"]));
ok("JP225 -> JPY", J(symbolCurrencies("JP225")) === J(["JPY"]));
ok("AUS200 -> AUD", J(symbolCurrencies("AUS200")) === J(["AUD"]));

// ---- crypto quoted in USD/USDT ----
ok("BTCUSD -> USD (not BTC + USD)", J(symbolCurrencies("BTCUSD")) === J(["USD"]));
ok("ETHUSDT -> USD", J(symbolCurrencies("ETHUSDT")) === J(["USD"]));
ok("DOGEUSD -> USD", J(symbolCurrencies("DOGEUSD")) === J(["USD"]));
ok("SOLUSD -> USD", J(symbolCurrencies("SOLUSD")) === J(["USD"]));

// ---- broker suffixes stripped ----
ok("EURUSD.m -> EUR, USD", J(symbolCurrencies("EURUSD.m")) === J(["EUR", "USD"]));
ok("EURUSDpro -> EUR, USD", J(symbolCurrencies("EURUSDpro")) === J(["EUR", "USD"]));
ok("EURUSD_i -> EUR, USD", J(symbolCurrencies("EURUSD_i")) === J(["EUR", "USD"]));
ok("XAUUSD.m -> USD", J(symbolCurrencies("XAUUSD.m")) === J(["USD"]));
ok("US30.m -> USD", J(symbolCurrencies("US30.m")) === J(["USD"]));
ok("BTCUSDpro -> USD", J(symbolCurrencies("BTCUSDpro")) === J(["USD"]));

// ---- unknown symbols ----
ok("AAPL -> unknown (null)", symbolCurrencies("AAPL") === null);
ok("a plain stock-like ticker -> unknown", symbolCurrencies("TSLA") === null);
ok("empty string -> unknown", symbolCurrencies("") === null);
ok("blank -> unknown", symbolCurrencies("   ") === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
