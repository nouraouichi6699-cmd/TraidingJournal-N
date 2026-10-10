import { parseCsv, parseDate, parseNum } from "./csv";
import type { BalancePoint } from "../types";

export type ParsedTrade = Omit<import("../types").Trade, "key" | "accountId"> & { orderId?: string };

export type ParseResult =
  | { kind: "trades"; trades: ParsedTrade[]; currency: string | null }
  | { kind: "balance"; points: BalancePoint[] }
  | { kind: "unknown" };

const ENTRY = /entr|entry|enter|دخول/i;
const EXIT = /sort|exit|close|خروج/i;

/**
 * Detects the export type from the file's shape (column positions), not its
 * header text, so it works whatever language TradingView exported in.
 */
export function parseTradingViewCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { kind: "unknown" };
  const header = rows[0];
  const data = rows.slice(1);
  const first = data[0];

  // Trade history: Symbol, #, Type, Date, OrderId, Signal, Price, Qty, Value, P&L, Return%, Commission, ...
  if (
    header.length >= 12 &&
    /:/.test(first[0] ?? "") &&
    /^\d+$/.test((first[1] ?? "").trim()) &&
    (ENTRY.test(first[2] ?? "") || EXIT.test(first[2] ?? ""))
  ) {
    const byNo = new Map<number, { entry?: string[]; exit?: string[] }>();
    for (const r of data) {
      const no = Number(r[1]);
      if (!Number.isInteger(no)) continue;
      const slot = byNo.get(no) ?? {};
      if (ENTRY.test(r[2] ?? "")) slot.entry = r;
      else slot.exit = r;
      byNo.set(no, slot);
    }
    const trades: ParsedTrade[] = [];
    for (const [no, { entry, exit }] of byNo) {
      if (!entry) continue;
      const entryPrice = parseNum(entry[6]);
      const qty = parseNum(entry[7]);
      if (entryPrice == null || qty == null) continue;
      const exitTime = exit ? parseDate(exit[3]) : null;
      const closed = !!exit && exitTime !== null;
      const commission = Math.abs(parseNum(entry[11]) ?? 0) + (closed ? Math.abs(parseNum(exit![11]) ?? 0) : 0);
      trades.push({
        no,
        symbol: entry[0],
        side: /short/i.test(entry[2]) ? "short" : "long",
        qty,
        entryTime: parseDate(entry[3]),
        entryPrice,
        exitTime: closed ? exitTime : null,
        exitPrice: closed ? parseNum(exit![6]) : null,
        pnl: closed ? parseNum(entry[9]) : null,
        returnPct: closed ? parseNum(entry[10]) : null,
        commission,
        status: closed ? "closed" : "open",
        orderId: entry[4]?.trim() || undefined,
      });
    }
    const cur = header[9]?.match(/\b([A-Z]{3})\b\s*$/)?.[1] ?? null;
    return trades.length ? { kind: "trades", trades, currency: cur } : { kind: "unknown" };
  }

  // Balance history: Time, Before, After, P&L, Currency, Action
  if (
    header.length >= 6 &&
    parseDate(first[0]) &&
    parseNum(first[1]) != null &&
    parseNum(first[2]) != null
  ) {
    const points: BalancePoint[] = [];
    for (const r of data) {
      const t = parseDate(r[0]);
      const after = parseNum(r[2]);
      if (t && after != null) points.push({ t, balance: after });
    }
    points.sort((a, b) => a.t.localeCompare(b.t));
    return points.length ? { kind: "balance", points } : { kind: "unknown" };
  }

  return { kind: "unknown" };
}
