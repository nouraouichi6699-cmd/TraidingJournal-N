export type Theme = "dark" | "light" | "cream";
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
  status: "open" | "closed";
}

export interface BalancePoint {
  t: string;
  balance: number;
}
