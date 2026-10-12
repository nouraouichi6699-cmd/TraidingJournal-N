import type { Trade } from "../types";

/** Price increment counted as one pip/point for a symbol (broker conventions differ; these are the common ones). */
export function pipSize(symbol: string): number {
  const s = symbol.replace(/^[^:]+:/, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/XAU|GOLD/.test(s)) return 0.1;
  if (/XAG|SILVER/.test(s)) return 0.01;
  if (/US30|DJI|DOW|NAS|NDX|US100|SPX|US500|SP500|GER|DE40|DAX|UK100|FTSE|JP225|NIK|BTC|XBT|ETH|SOL|XRP/.test(s)) return 1;
  if (/OIL|WTI|BRENT|XTI|XBR/.test(s)) return 0.01;
  if (/JPY/.test(s)) return 0.01;
  return 0.0001;
}

/** Signed pips of a closed trade: positive when it won, negative when it lost. */
export function pipsOf(t: Pick<Trade, "symbol" | "side" | "entryPrice" | "exitPrice">): number | null {
  if (t.exitPrice == null || !isFinite(t.entryPrice) || !isFinite(t.exitPrice)) return null;
  const diff = t.side === "long" ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice;
  return Math.round((diff / pipSize(t.symbol)) * 10) / 10;
}

/** Calendar week of the month (Monday-first): 1 = the week containing the 1st. Input "YYYY-MM-DD..." */
export function weekOfMonth(iso: string | null): { week: number; month: string } | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const offset = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;
  return { week: Math.floor((d - 1 + offset) / 7) + 1, month: `${y}-${m[2]}` };
}
