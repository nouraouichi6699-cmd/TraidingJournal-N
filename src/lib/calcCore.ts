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

/** How a stop, a target or a result is typed: in pips (the default) or as prices. */
export type DistUnit = "pips" | "price";

/** The pip size a symbol starts with: forex from its spec, gold 0.1, silver 0.01; null for anything else. */
export const defaultPipSize = (sp: SymbolSpec): number | null => sp.pip ?? (sp.base === "XAU" ? 0.1 : sp.base === "XAG" ? 0.01 : null);

/**
 * The pip size to count in: forex always its spec's (0.0001, JPY pairs 0.01); any other symbol the size typed for it
 * (`typed`, undefined while nothing was typed), else its default. NaN when there is none.
 */
export function pipSizeFor(sp: SymbolSpec, typed?: string): number {
  if (sp.pip) return sp.pip;
  if (typed !== undefined) return parseNum(typed);
  return defaultPipSize(sp) ?? NaN;
}

/** A number of pips as a price distance (negative pips give a negative distance); NaN without a positive pip size. */
export const pipsToDistance = (pips: number, pip: number): number => (Number.isFinite(pips) && Number.isFinite(pip) && pip > 0 ? pips * pip : NaN);

/** True when the quote currency has to be converted with a rate the trader types: it is neither the account's
 *  currency nor the base of a pair whose base is the account's currency. */
export const needsRate = (sp: SymbolSpec, cur: string): boolean => !!sp.quote && sp.quote !== cur && sp.base !== cur;

/** True when the quote-to-account rate is worked out from the symbol's price: the account currency is the pair's base
 *  (USDJPY on a USD account). With prices typed the entry serves; in pips the trader gives the current price. */
export const needsPrice = (sp: SymbolSpec, cur: string): boolean => !!sp.quote && sp.quote !== cur && sp.base === cur;

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

/** The "lots / balance" rule: `lotsPerUnit` lots for every `unitAmt` of balance, rounded down to 0.01 lot; NaN when the
 *  unit is not positive or any input is not finite. No stop distance is involved. */
export function lotsFromBalanceRule(balance: number, unitAmt: number, lotsPerUnit: number): number {
  if (![balance, unitAmt, lotsPerUnit].every(Number.isFinite) || unitAmt <= 0) return NaN;
  return Math.floor((balance / unitAmt) * lotsPerUnit / 0.01 + 1e-9) * 0.01;
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
  /** Stop in pips: the stop's price distance (pips x pip size), used instead of entry and stop. */
  dist?: number;
  /** Stop in pips: the current price, to convert when the account currency is the pair's base (the entry otherwise). */
  price?: number;
  /** Stop in pips: the pip size the distance is counted in (else the spec's, forex only). */
  pip?: number;
}

/** Lots for a risk between an entry and a stop, as the size calculator has always worked it out, or for a stop typed
 *  in pips (`dist`, with `price` for the conversion). */
export function positionSize(i: SizeInput) {
  const inPips = i.dist !== undefined;
  const dist = inPips ? Math.abs(i.dist as number) : Math.abs(i.entry - i.stop);
  const needRate = needsRate(i.spec, i.cur);
  const rate = quoteToAccountRate(i.spec, i.cur, inPips ? (i.price as number) : i.entry, i.rate);
  const riskMoney = i.mode === "pct" ? (i.balance * i.pct) / 100 : i.amt;
  const perLot = dist * i.contract * rate;
  const ok = Number.isFinite(perLot) && perLot > 0 && Number.isFinite(riskMoney) && riskMoney > 0;
  const lots = ok ? lotsFor(riskMoney, perLot) : NaN;
  const pip = i.pip ?? i.spec.pip;
  return { dist, needRate, needPrice: inPips && needsPrice(i.spec, i.cur), rate, riskMoney, perLot, ok, lots, real: ok ? lots * perLot : NaN, pips: pip && dist > 0 ? dist / pip : null };
}
