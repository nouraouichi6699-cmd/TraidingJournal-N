// The position-size core: what one lot of a symbol is, how its quote currency turns into the account's, and the lots
// that risk a given amount. Shared by the header's size calculator (main bundle) and the Calculators page (its own
// chunk). It lives apart from calculators.ts, which re-exports it, so the main bundle carries only these few lines and
// not the whole page's maths. Pure, covered by calculators.test.ts.

const CUR = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "SGD", "HKD", "ZAR", "MXN", "TRY", "PLN", "CZK", "HUF", "CNH"]);

export interface SymbolSpec { base: string; quote: string; contract: number | null; pip: number | null }

/** What 1 lot of a symbol is: forex pairs 100,000 units of the base, gold 100 oz, silver 5,000 oz; others depend on the broker. */
export function symbolSpec(sym: string): SymbolSpec {
  const s = sym.toUpperCase().replace(/[^A-Z]/g, ""), b = s.slice(0, 3), q = s.slice(3, 6);
  if (b === "XAU") return { base: b, quote: CUR.has(q) ? q : "USD", contract: 100, pip: null };
  if (b === "XAG") return { base: b, quote: CUR.has(q) ? q : "USD", contract: 5000, pip: null };
  if (CUR.has(b) && CUR.has(q)) return { base: b, quote: q, contract: 100000, pip: q === "JPY" ? 0.01 : 0.0001 };
  return { base: "", quote: "", contract: null, pip: null };
}

/** A typed decimal, with a comma or a dot; NaN when empty or not a number. */
export const parseNum = (s: string): number => { const v = Number(s.replace(",", ".").trim()); return s.trim() && Number.isFinite(v) ? v : NaN; };

/** True when the quote currency has to be converted with a rate the trader types: it is neither the account's
 *  currency nor the base of a pair whose base is the account's currency. */
export const needsRate = (sp: SymbolSpec, cur: string): boolean => !!sp.quote && sp.quote !== cur && sp.base !== cur;

/** The key a typed quote-to-account rate is remembered under ("JPYEUR": 1 JPY in EUR). */
export const rateKey = (sp: SymbolSpec, cur: string): string => `${sp.quote}${cur}`;

/**
 * What one unit of the symbol's quote currency is worth in the account currency: 1 when they match (or the symbol's
 * currencies are unknown), 1 / price when the account currency is the pair's base, else the typed rate (NaN while it
 * is missing).
 */
export function quoteToAccountRate(sp: SymbolSpec, cur: string, price: number, typed: number): number {
  return !sp.quote || sp.quote === cur ? 1 : sp.base === cur ? 1 / price : typed;
}

/** The lots that lose `riskMoney` when each lot loses `perLot`, rounded down to 0.01 lot; NaN when either is not positive. */
export function lotsFor(riskMoney: number, perLot: number): number {
  const ok = Number.isFinite(perLot) && perLot > 0 && Number.isFinite(riskMoney) && riskMoney > 0;
  return ok ? Math.floor(riskMoney / perLot / 0.01 + 1e-9) * 0.01 : NaN;
}

export interface SizeInput {
  balance: number;
  mode: "pct" | "amt";
  pct: number; // risk, % of the balance
  amt: number; // risk, in money
  spec: SymbolSpec;
  contract: number; // units in 1 lot (the spec's, or typed)
  entry: number;
  stop: number;
  cur: string; // account currency
  rate: number; // the typed quote-to-account rate (used only when needsRate)
}

/** Lots for a risk between an entry and a stop, as the size calculator has always worked it out. */
export function positionSize(i: SizeInput) {
  const dist = Math.abs(i.entry - i.stop);
  const needRate = needsRate(i.spec, i.cur);
  const rate = quoteToAccountRate(i.spec, i.cur, i.entry, i.rate);
  const riskMoney = i.mode === "pct" ? (i.balance * i.pct) / 100 : i.amt;
  const perLot = dist * i.contract * rate;
  const ok = Number.isFinite(perLot) && perLot > 0 && Number.isFinite(riskMoney) && riskMoney > 0;
  const lots = ok ? lotsFor(riskMoney, perLot) : NaN;
  return { dist, needRate, rate, riskMoney, perLot, ok, lots, real: ok ? lots * perLot : NaN, pips: i.spec.pip && dist > 0 ? dist / i.spec.pip : null };
}
