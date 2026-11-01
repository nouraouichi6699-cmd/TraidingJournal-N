import { useMemo } from "react";
import { useSettings } from "./useSettings";
import { convertAccounts, convertBalances, convertFlows, convertTrades, currenciesOf, missingRates } from "./lib/fx";
import type { Account, BalancePoint, Trade } from "./types";
import type { CashFlow } from "./lib/cashflow";

export interface Converted {
  accounts: Account[];
  trades: Trade[];
  flows: CashFlow[];
  balances: Record<string, BalancePoint[]>;
  /** Currencies still without a usable rate. Non-empty means nothing was converted. */
  missing: string[];
  converted: boolean;
}

/**
 * What an all-accounts view should show. With the setting off, or a single account selected, or any rate still
 * missing, this hands back exactly what it was given: the raw amounts, as the app has always summed them. Only when
 * every currency in play has a rate does it return converted copies, all of them together.
 *
 * `all` is the view's own idea of whether it is showing more than one account's money.
 */
export function useConverted(
  all: boolean,
  accounts: Account[],
  trades: Trade[],
  flows: CashFlow[] = [],
  balances: Record<string, BalancePoint[]> = {},
): Converted {
  const s = useSettings();
  const base = s.baseCurrency;
  const rates = s.rates;
  const on = s.unifyCurrency;
  return useMemo(() => {
    const raw: Converted = { accounts, trades, flows, balances, missing: [], converted: false };
    if (!on || !all) return raw;
    const missing = missingRates(accounts, base, rates);
    if (missing.length) return { ...raw, missing };
    const a = convertAccounts(accounts, base, rates);
    const t = convertTrades(trades, accounts, base, rates);
    const f = convertFlows(flows, accounts, base, rates);
    const b = convertBalances(balances, accounts, base, rates);
    // Any one of them failing means something is not convertible after all, so none of it is used.
    if (!a || !t || !f || !b) return { ...raw, missing: currenciesOf(accounts) };
    return { accounts: a, trades: t, flows: f, balances: b, missing: [], converted: true };
  }, [on, all, accounts, trades, flows, balances, base, rates]);
}
