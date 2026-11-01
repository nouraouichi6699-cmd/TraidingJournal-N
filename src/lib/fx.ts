// Money read across accounts that are not in the same currency. Off by default, when every amount is summed exactly
// as it is stored, which is what the app has always done and what single-account views keep doing.
//
// All or nothing: if any currency in play has no usable rate, the convert functions return null and the caller shows
// the raw view with a warning. A half-converted total is worse than an unconverted one.
//
// Only money is converted: P&L and commission. Entry, exit, stop and target are prices in the instrument's own quote
// currency, not the account's, and a return percentage has no currency at all.
import type { Account, BalancePoint, Trade } from "../types";
import type { CashFlow } from "./cashflow";

/** Units of <code> per 1 base, which is how Frankfurter quotes them. */
export type Rates = Record<string, number>;

/** The 30 currencies Frankfurter publishes (the ECB set). Anything else only ever has a hand-typed rate. */
export const FRANKFURTER_CODES = [
  "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK",
  "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
] as const;

export const isFrankfurter = (c: string): boolean => (FRANKFURTER_CODES as readonly string[]).includes(code(c));

/** Only currency codes travel to the service: never an amount, an account or anything about the user. */
export const frankfurterUrl = (base: string, codes: string[]): string =>
  `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(code(base))}&symbols=${codes.map((c) => encodeURIComponent(code(c))).join(",")}`;

export function code(c?: string | null): string {
  return (c ?? "").trim().toUpperCase();
}

/** A rate is usable only when it is a finite number above zero. */
export const rateOk = (r: unknown): r is number => typeof r === "number" && Number.isFinite(r) && r > 0;

/** Distinct currencies the accounts use. A blank currency comes back as "" so it cannot be quietly skipped. */
export const currenciesOf = (accounts: Pick<Account, "currency">[]): string[] =>
  [...new Set(accounts.map((a) => code(a.currency)))];

/** The currencies that still need a usable rate before anything can be converted. Empty means ready. */
export function missingRates(accounts: Pick<Account, "currency">[], base: string, rates: Rates): string[] {
  const b = code(base);
  if (!b) return currenciesOf(accounts);
  return currenciesOf(accounts).filter((c) => c !== b && !rateOk(rates[c]));
}

/**
 * One amount into the base currency. Frankfurter quotes units of <code> per 1 <base>, so an amount in <code> is
 * divided by its rate: with base EUR and USD at 1.1172, 100 USD is 100 / 1.1172 = 89.51 EUR.
 * Null means it cannot be converted, which stops the caller converting anything.
 */
export function convertAmount(amount: number, from: string, base: string, rates: Rates): number | null {
  if (!Number.isFinite(amount)) return null;
  const f = code(from), b = code(base);
  if (!b || !f) return null;
  if (f === b) return amount;
  const r = rates[f];
  return rateOk(r) ? amount / r : null;
}

const currencyById = (accounts: Account[]) => new Map(accounts.map((a) => [a.id, code(a.currency)]));

/**
 * Trades with their money in the base currency. These are copies; the stored trades are never touched.
 *
 * Each copy carries its own-currency P&L and commission alongside, which is what keeps an outcome from depending on
 * the view: the classifier reads pnlOwn, so a trade that is break-even in its own account stays break-even in the
 * all-accounts view, and the rounding edges cannot flip either.
 */
export function convertTrades(trades: Trade[], accounts: Account[], base: string, rates: Rates): Trade[] | null {
  const cur = currencyById(accounts);
  const out: Trade[] = [];
  for (const t of trades) {
    const from = cur.get(t.accountId) ?? "";
    const commission = convertAmount(t.commission, from, base, rates);
    if (commission == null) return null;
    let pnl = t.pnl;
    if (t.pnl != null) {
      const v = convertAmount(t.pnl, from, base, rates);
      if (v == null) return null;
      pnl = v;
    }
    out.push({ ...t, pnl, commission, pnlOwn: t.pnl, commissionOwn: t.commission });
  }
  return out;
}

/** Accounts with their start balance in the base currency, and their currency set to it, so the symbol follows. */
export function convertAccounts(accounts: Account[], base: string, rates: Rates): Account[] | null {
  const out: Account[] = [];
  for (const a of accounts) {
    const start = convertAmount(a.startBalance || 0, a.currency, base, rates);
    if (start == null) return null;
    out.push({ ...a, startBalance: start, currency: code(base) });
  }
  return out;
}

export function convertFlows(flows: CashFlow[], accounts: Account[], base: string, rates: Rates): CashFlow[] | null {
  const cur = currencyById(accounts);
  const out: CashFlow[] = [];
  for (const f of flows) {
    const v = convertAmount(f.amount, cur.get(f.accountId) ?? "", base, rates);
    if (v == null) return null;
    out.push({ ...f, amount: v });
  }
  return out;
}

export function convertBalances(
  balances: Record<string, BalancePoint[]>, accounts: Account[], base: string, rates: Rates,
): Record<string, BalancePoint[]> | null {
  const cur = currencyById(accounts);
  const out: Record<string, BalancePoint[]> = {};
  for (const [id, points] of Object.entries(balances)) {
    const from = cur.get(id) ?? "";
    const list: BalancePoint[] = [];
    for (const p of points) {
      const v = convertAmount(p.balance, from, base, rates);
      if (v == null) return null;
      list.push({ ...p, balance: v });
    }
    out[id] = list;
  }
  return out;
}

/**
 * A converted copy must never be stored. This is the net on the way into the journal: a trade still carrying its
 * own-currency values is put back to them and the extra fields are dropped. The sync's row mapper lists its columns
 * by name, so nothing can reach the server by this route either.
 */
export function stripConverted(trades: Trade[]): Trade[] {
  if (!trades.some((t) => t.pnlOwn !== undefined || t.commissionOwn !== undefined)) return trades;
  return trades.map((t) => {
    if (t.pnlOwn === undefined && t.commissionOwn === undefined) return t;
    const { pnlOwn, commissionOwn, ...rest } = t;
    return {
      ...rest,
      pnl: pnlOwn !== undefined ? pnlOwn : rest.pnl,
      commission: commissionOwn !== undefined ? commissionOwn : rest.commission,
    };
  });
}
