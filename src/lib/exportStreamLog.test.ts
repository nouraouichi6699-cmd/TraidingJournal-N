// Run: npx tsx src/lib/exportStreamLog.test.ts
// Builds a real workbook and reads it back: sheets per month (newest first), stats, risk table and the trades table.
import ExcelJS from "exceljs";
import { pipsFor, tradesToStreamLog } from "./exportStreamLog";
import type { Account, Trade } from "../types";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const eq = (name: string, got: unknown, exp: unknown) => is(name, JSON.stringify(got) === JSON.stringify(exp), `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`);

let n = 0;
const T = (symbol: string, side: "long" | "short", entry: number, exit: number | null, pnl: number | null, entryTime: string): Trade => ({
  key: `a:${++n}`, accountId: "a", no: n, symbol, side, qty: 1, entryTime, entryPrice: entry, exitTime: exit == null ? null : entryTime,
  exitPrice: exit, pnl, returnPct: null, commission: 0, status: exit == null ? "open" : "closed",
} as Trade);
const A: Account = { id: "a", platform: "tradingview", name: "Main", currency: "USD", startBalance: 10000 } as Account;

// pips: direction-signed, per-symbol size
eq("EURUSD long +20 pips", pipsFor(T("EURUSD", "long", 1.1, 1.102, 5, "2026-11-02T10:00")), 20);
eq("EURUSD short, price up = -20", pipsFor(T("EURUSD", "short", 1.1, 1.102, -5, "2026-11-02T10:00")), -20);
eq("USDJPY long +30 pips (0.01)", pipsFor(T("USDJPY", "long", 150, 150.3, 5, "2026-11-02T10:00")), 30);
eq("XAUUSD short +15 pips (0.1)", pipsFor(T("XAUUSD", "short", 2000, 1998.5, 5, "2026-11-02T10:00")), 15);
eq("NAS100 falls back to the journal's size (1)", pipsFor(T("NAS100", "long", 100, 125, 5, "2026-11-02T10:00")), 25);
eq("typed pip size wins for an unknown symbol", pipsFor(T("NAS100", "long", 100, 125, 5, "2026-11-02T10:00"), { NAS100: "5" }), 5);
eq("open trade has no pips", pipsFor(T("EURUSD", "long", 1.1, null, null, "2026-11-02T10:00")), null);

const trades = [
  T("EURUSD", "long", 1.1, 1.102, 20, "2026-11-02T10:00"),   // +20 W
  T("EURUSD", "short", 1.1, 1.103, -30, "2026-11-05T09:00"), // -30 L
  T("EURUSD", "long", 1.1, 1.1, 0, "2026-11-06T09:00"),      // 0 BE
  T("EURUSD", "long", 1.1, null, null, "2026-11-07T09:00"),  // open
  T("USDJPY", "long", 150, 150.3, 40, "2026-09-15T09:00"),   // +30 W, September (October empty)
];

const buf = Buffer.from(await (await tradesToStreamLog(trades, [A])).arrayBuffer());
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);
eq("sheets: newest month first, no empty October", wb.worksheets.map((w) => w.name), ["November 2026", "September 2026"]);

const ws = wb.getWorksheet("November 2026")!;
const v = (r: number, c: number) => { const x = ws.getCell(r, c).value; return x && typeof x === "object" && "result" in x ? x.result : x; };
eq("brand", v(1, 1), "Mizan");
eq("title: account + month", v(1, 3), "Main · November 2026");
eq("stats labels", [5, 6, 7, 8, 9, 10].map((r) => v(r, 1)), ["Total trades", "W", "L", "BE", "Win rate", "Total pips"]);
eq("stats values", [5, 6, 7, 8, 9, 10].map((r) => Math.round(Number(v(r, 2)) * 1e6) / 1e6), [4, 1, 1, 1, 0.333333, -10]);
// balance = 10000 start + 20 - 30 + 0 (open ignored) + 40 (September) = 10030
eq("balance", v(12, 2), 10030);
eq("risk header", [1, 2, 3, 4].map((c) => v(13, c)), ["Risk per pip", "Amount ($)", "% of balance", "Pips to margin call"]);
eq("$1/pip row", [1, 2, 3, 4].map((c) => v(14, c)), ["$1 / pip", -10, -10 / 10030, 10030]);
eq("$2/pip row", [1, 2, 3, 4].map((c) => v(15, c)), ["$2 / pip", -20, -20 / 10030, 5015]);
eq("table header", [1, 2, 3, 4, 5, 6, 7, 8].map((c) => v(17, c)), ["Contract", "Date", "Long/Short", "Entry price", "Exit price", "Pip", "Exit note", "W/L/BE"]);
eq("newest first: open trade", [1, 2, 3, 4, 5, 6, 7, 8].map((c) => v(18, c)), ["EURUSD", "2026-11-07", "Long", 1.1, null, null, null, null]);
eq("BE row", [6, 8].map((c) => v(19, c)), [0, "BE"]);
eq("loss row", [3, 6, 8].map((c) => v(20, c)), ["Short", -30, "L"]);
eq("win row", [2, 6, 8].map((c) => v(21, c)), ["2026-11-02", 20, "W"]);
eq("table ends", v(22, 1), null);
eq("sept sheet pips", wb.getWorksheet("September 2026")!.getCell(10, 2).value, 30);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
