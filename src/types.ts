export type Theme = "dark" | "light" | "black";
export type Lang = "en" | "ar" | "fr";

export type Platform = "tradingview" | "mt5";

export interface Account {
  id: string;
  platform: Platform;
  name: string;
  currency: string;
  startBalance: number;
  login?: string;
  server?: string;
  createdAt: number;
}

export interface Trade {
  key: string; // accountId + entry order id
  accountId: string;
  no: number;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entryTime: string | null;
  entryPrice: number;
  exitTime: string | null;
  exitPrice: number | null;
  pnl: number | null; // net, null while open
  returnPct: number | null;
  commission: number;
  sl?: number | null;
  tp?: number | null;
  status: "open" | "closed";
  /**
   * Set only on a converted copy (see lib/fx.ts): the P&L and commission in the account's own currency. Their
   * presence marks a trade as a copy that must never be stored, and the classifier reads pnlOwn so that an
   * outcome never depends on which view it is being looked at in.
   */
  pnlOwn?: number | null;
  commissionOwn?: number;
}

export interface BalancePoint {
  t: string;
  balance: number;
}
