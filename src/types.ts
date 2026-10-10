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
