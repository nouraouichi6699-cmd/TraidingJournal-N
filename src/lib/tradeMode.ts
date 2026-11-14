// The account's verified type: what MT5 reported through the MizanSync EA (accounts.trade_mode, server-written only).
// Nothing in the app sets it; these helpers only read it, for the badge and the exports.
import type { Account, TradeMode } from "../types";

export const TRADE_MODES: readonly TradeMode[] = ["demo", "contest", "real"];

/** The value as a TradeMode, or null for anything unknown. */
export const asTradeMode = (v: unknown): TradeMode | null => ((TRADE_MODES as readonly unknown[]).includes(v) ? (v as TradeMode) : null);

/** One mode for a group of accounts: the mode they all share; null when the group is empty, any is unknown or they differ. */
export function sharedTradeMode(accounts: readonly Pick<Account, "tradeMode">[]): TradeMode | null {
  if (!accounts.length) return null;
  const m = accounts[0].tradeMode ?? null;
  return m && accounts.every((a) => (a.tradeMode ?? null) === m) ? m : null;
}

/** The word the exports print for a mode (English, like the rest of the sheet); "Unverified" when unknown. */
export const tradeModeWord = (m: TradeMode | null | undefined): string => (m === "real" ? "Verified" : m === "demo" ? "Demo" : m === "contest" ? "Contest" : "Unverified");

/** Hover tooltip for the badge — explains what the mode means. */
export function tradeModeTooltip(m: TradeMode | null | undefined): string {
  if (m === "real") return "This account is linked to a real MT5 account with verified data. Your trades carry full credibility.";
  if (m === "contest") return "This account is linked to an MT5 trading contest. Show your skills and compete!";
  if (m === "demo") return "This account is linked to a demo MT5 account. Great for practice and strategy testing.";
  return "This account has no MT5 verification yet. Link your MT5 account to verify your trades and build credibility.";
}
