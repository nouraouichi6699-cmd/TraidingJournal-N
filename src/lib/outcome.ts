// Whether a result counts as a win, a loss, or neither. Until now this was decided in thirteen places in three
// different ways: a raw comparison, or one rounded to cents first. Both are kept, because they do not always agree
// (a P&L of 0.004 is a win raw and a break-even once rounded), so each call site passes the rounding it has always
// used and no default moves.
//
// Trades go through tradeOutcome, which honours the user's break-even range. A day's or a group's net goes through
// netOutcome, which never does: widening the range is a statement about single trades, and a day that nets 0.50
// is still a winning day.

export type Outcome = "win" | "loss" | "be";

export interface OutcomeRule {
  /** A result whose size is at or below this is break-even. 0 keeps the plain sign test. */
  breakEven?: number;
  /** Round to this many decimals before deciding. Left out, the comparison is exact. */
  decimals?: number;
}

/** Pure: everything it needs is in its arguments. */
export function classifyOutcome(pnl: number, o: OutcomeRule = {}): Outcome {
  if (!Number.isFinite(pnl)) return "be";
  const d = o.decimals;
  const v = d == null ? pnl : Math.round(pnl * 10 ** d) / 10 ** d;
  const be = Number.isFinite(o.breakEven) && (o.breakEven as number) > 0 ? (o.breakEven as number) : 0;
  if (Math.abs(v) <= be) return "be"; // with a range of 0 this is only an exact zero, as it was before
  return v > 0 ? "win" : "loss";
}

// ---------- the range the app is working with ----------

let range = 0;

/** Set from the Settings page; anything invalid falls back to no range at all. */
export const setBreakEvenRange = (v: number) => { range = Number.isFinite(v) && v > 0 ? v : 0; };
export const breakEvenRange = () => range;

/** One trade's outcome, under the break-even range now in force. */
export const tradeOutcome = (pnl: number, decimals?: number): Outcome =>
  classifyOutcome(pnl, { breakEven: range, decimals });

/** The sign of an aggregate — a day, a week, a group of trades. The break-even range never applies here. */
export const netOutcome = (net: number, decimals?: number): Outcome =>
  classifyOutcome(net, { breakEven: 0, decimals });
