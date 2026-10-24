// Whether each trade was in the trader's plan: answered with the buttons under the Telegram "new trade" message and
// written by the "telegram" function in the synced setting "mizan-trade-plan" ({ [trade key]: boolean }). Read-only here.
import type { Trade } from "../types";

export function readPlan(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem("mizan-trade-plan") ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Closed trades in and outside the plan: count and net result of each (trades never answered are left out). */
export function planSplit(trades: Trade[], plan: Record<string, boolean>) {
  const part = (v: boolean) => { const l = trades.filter((t) => t.status === "closed" && t.pnl != null && plan[t.key] === v); return { list: l, n: l.length, net: l.reduce((s, t) => s + (t.pnl as number), 0) }; };
  return { yes: part(true), no: part(false) };
}
