import type { Account, BalancePoint, Trade } from "../types";
import { signed, type CashFlow } from "./cashflow";

export interface BalPt { t: string; v: number }
/** Comparable timestamp: "YYYY-MM-DD 00:00:00" and "YYYY-MM-DDTHH:MM" both become "YYYY-MM-DDTHH:MM". */
const norm = (s: string) => s.trim().replace(" ", "T").slice(0, 16);
const closeOf = (t: Trade) => norm(t.exitTime || t.entryTime || "");

/**
 * Balance history of one account, oldest first. Open trades never move the balance.
 *  - With imported balance snapshots (MT5 report): the snapshots, then the realised P&L of trades closed
 *    AFTER the last snapshot and the cash flows recorded after it (earlier ones are already inside the snapshots).
 *  - Without snapshots: the starting balance, then every realised trade and recorded cash flow
 *    (a flow comes before a trade with the same timestamp).
 */
export function balanceSeries(a: Account, trades: Trade[], points: BalancePoint[] = [], flows: CashFlow[] = []): BalPt[] {
  const mine = trades.filter((t) => t.accountId === a.id && t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && closeOf(t));
  const fl = flows.filter((f) => f.accountId === a.id && Number.isFinite(f.amount) && f.amount !== 0 && f.t);
  const snaps = points.filter((p) => p.t && Number.isFinite(p.balance)).map((p) => ({ t: norm(p.t), v: p.balance })).sort((x, y) => x.t.localeCompare(y.t));
  const after = snaps.length ? snaps[snaps.length - 1].t : "";
  const ev = [
    ...fl.map((f) => ({ t: norm(f.t), v: signed(f), o: 0 })),
    ...mine.map((t) => ({ t: closeOf(t), v: t.pnl as number, o: 1 })),
  ].filter((e) => e.t > after).sort((x, y) => x.t.localeCompare(y.t) || x.o - y.o);
  const out: BalPt[] = [...snaps];
  let run = snaps.length ? snaps[snaps.length - 1].v : a.startBalance || 0;
  if (!snaps.length && ev.length) {
    const firstEntry = mine.map((t) => norm(t.entryTime || "")).filter(Boolean).sort()[0];
    out.push({ t: firstEntry && firstEntry < ev[0].t ? firstEntry : ev[0].t, v: run }); // starting balance, just before the first event
  }
  for (const e of ev) out.push({ t: e.t, v: (run += e.v) });
  return out;
}

/** Latest balance of one account (see balanceSeries); the starting balance when nothing is recorded yet. */
export function currentBalance(a: Account, trades: Trade[], points: BalancePoint[] = [], flows: CashFlow[] = []): number {
  const s = balanceSeries(a, trades, points, flows);
  return s.length ? s[s.length - 1].v : a.startBalance || 0;
}

/**
 * True when the account's ledger (starting balance + realised P&L + recorded cash flows) reproduces its imported balance
 * history at the last snapshot, i.e. no deposit/withdrawal is missing. Null when there is no imported history to check against.
 * Used to decide whether "0 deposits" is a real zero or just unknown (e.g. an MT5 report imported before cash flows were read).
 */
export function ledgerReconciles(a: Account, trades: Trade[], points: BalancePoint[] = [], flows: CashFlow[] = []): boolean | null {
  const snaps = points.filter((p) => p.t && Number.isFinite(p.balance)).map((p) => ({ t: norm(p.t), v: p.balance })).sort((x, y) => x.t.localeCompare(y.t));
  if (!snaps.length) return null;
  const last = snaps[snaps.length - 1];
  const pnl = trades.filter((t) => t.accountId === a.id && t.status === "closed" && t.pnl != null && closeOf(t) && closeOf(t) <= last.t).reduce((s, t) => s + (t.pnl as number), 0);
  const fl = flows.filter((f) => f.accountId === a.id && f.t && norm(f.t) <= last.t).reduce((s, f) => s + signed(f), 0);
  return Math.abs((a.startBalance || 0) + pnl + fl - last.v) <= Math.max(0.5, Math.abs(last.v) * 1e-4);
}
