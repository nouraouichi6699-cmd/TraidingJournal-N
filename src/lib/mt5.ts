import { readSheet } from "read-excel-file/browser";
import { parseDate, parseNum } from "./csv";
import type { BalancePoint } from "../types";
import type { ParsedTrade } from "./tradingview";

export interface Mt5Report {
  login: string | null;
  currency: string | null;
  server: string | null;
  deposit: number | null;
  trades: ParsedTrade[];
  points: BalancePoint[];
}

type Cell = unknown;

const pad = (n: number) => String(n).padStart(2, "0");
const text = (c: Cell): string =>
  c instanceof Date
    ? `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())} ${pad(c.getHours())}:${pad(c.getMinutes())}`
    : c == null
      ? ""
      : String(c);
const num = (c: Cell): number | null => (typeof c === "number" ? c : parseNum(text(c)));
const when = (c: Cell) => parseDate(text(c));

/**
 * Reads an MT5 "Trade History Report" exported as .xlsx.
 * Sections are recognised by the shape of their rows, not by (localised) titles.
 */
export async function parseMt5Xlsx(file: File): Promise<Mt5Report | null> {
  const rows = (await readSheet(file)) as Cell[][];
  const report: Mt5Report = { login: null, currency: null, server: null, deposit: null, trades: [], points: [] };

  for (const r of rows) {
    // "111419341 (USD, MetaQuotes-Demo, demo, Hedge)"
    for (const c of r) {
      const m = text(c).match(/^(\d{5,})\s*\(\s*([A-Z]{3})\s*,\s*([^,)]+)/);
      if (m && !report.login) {
        report.login = m[1];
        report.currency = m[2];
        report.server = m[3].trim();
      }
    }

    // Positions: open time | id | symbol | buy/sell | volume | price | SL | TP | close time | price | commission | swap | profit
    if (
      when(r[0]) && when(r[8]) &&
      /^\d+$/.test(text(r[1])) &&
      /^(buy|sell)$/i.test(text(r[3]).trim()) &&
      num(r[4]) != null && num(r[5]) != null && num(r[9]) != null
    ) {
      const commission = (num(r[10]) ?? 0) + 0;
      const swap = num(r[11]) ?? 0;
      const profit = num(r[12]) ?? 0;
      report.trades.push({
        no: report.trades.length + 1,
        symbol: text(r[2]),
        side: /^buy$/i.test(text(r[3]).trim()) ? "long" : "short",
        qty: num(r[4]) as number,
        entryTime: when(r[0]),
        entryPrice: num(r[5]) as number,
        exitTime: when(r[8]),
        exitPrice: num(r[9]),
        pnl: Math.round((profit + commission + swap) * 100) / 100,
        returnPct: null,
        commission: Math.abs(commission),
        sl: num(r[6]),
        tp: num(r[7]),
        status: "closed",
        orderId: text(r[1]),
      });
      continue;
    }

    // Transactions: time | deal | symbol | type | direction | volume | price | order | commission | fee | swap | profit | balance
    if (when(r[0]) && /^\d+$/.test(text(r[1])) && num(r[12]) != null && text(r[3]) !== "") {
      const t = when(r[0]) as string;
      if (/^balance$/i.test(text(r[3]).trim()) && report.deposit == null) report.deposit = num(r[11]);
      report.points.push({ t, balance: num(r[12]) as number });
    }
  }

  report.points.sort((a, b) => a.t.localeCompare(b.t));
  return report.trades.length || report.points.length ? report : null;
}
