// Trades out as CSV, entirely in the browser: nothing is uploaded and no server is involved.
import type { Account, Trade } from "../types";

const COLUMNS = [
  "account", "no", "symbol", "side", "qty", "entry_time", "entry_price",
  "exit_time", "exit_price", "pnl", "return_pct", "commission", "sl", "tp", "status",
] as const;

/** Anything that could be read as a formula is prefixed, so a spreadsheet shows the text instead of running it. */
const cell = (v: unknown): string => {
  if (v == null) return "";
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function tradesToCsv(trades: Trade[], accounts: Account[]): string {
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  const rows = trades.map((t) => [
    name.get(t.accountId) ?? t.accountId, t.no, t.symbol, t.side, t.qty, t.entryTime, t.entryPrice,
    t.exitTime, t.exitPrice, t.pnl, t.returnPct, t.commission, t.sl ?? "", t.tp ?? "", t.status,
  ]);
  // The BOM is what makes Excel read the file as UTF-8, so Arabic account names survive.
  return `﻿${[COLUMNS.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking at once can cancel the download in some browsers, so it waits a moment.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
