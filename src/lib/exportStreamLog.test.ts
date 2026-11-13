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
eq("a stray typed 0.01 for gold no longer rescales it", pipsFor(T("XAUUSD", "long", 2000, 2006.58, 5, "2026-11-02T10:00"), { XAUUSD: "0.01" }), 65.8);
eq("XAUUSD long +6.58 = 65.8 pips", pipsFor(T("XAUUSD", "long", 2000, 2006.58, 5, "2026-11-02T10:00")), 65.8);
eq("XAUUSD short, price up 6.58 = -65.8 pips", pipsFor(T("XAUUSD", "short", 2000, 2006.58, -5, "2026-11-02T10:00")), -65.8);
eq("XAUUSD.m suffix still gold", pipsFor(T("XAUUSD.m", "long", 2000, 2006.58, 5, "2026-11-02T10:00")), 65.8);
eq("OANDA:XAUUSD prefix still gold (journal guess)", pipsFor(T("OANDA:XAUUSD", "long", 2000, 2006.58, 5, "2026-11-02T10:00")), 65.8);
eq("XAGUSD +0.5 = 50 pips (0.01)", pipsFor(T("XAGUSD", "long", 25, 25.5, 5, "2026-11-02T10:00")), 50);
eq("EURUSD 0.0020 = 20 pips even with a stray typed size", pipsFor(T("EURUSD", "long", 1.1, 1.102, 5, "2026-11-02T10:00"), { EURUSD: "0.01" }), 20);
eq("GBPJPY +0.30 = 30 pips", pipsFor(T("GBPJPY", "long", 190, 190.3, 5, "2026-11-02T10:00")), 30);
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
const row = (r: number, from: number, n: number) => Array.from({ length: n }, (_, k) => v(r, from + k));
eq("brand", v(1, 1), "Mizan");
eq("title sits over the trades table (G)", v(1, 7), "Main · November 2026");
eq("stats and trades share header row 3", [row(3, 1, 2), row(3, 7, 7)], [["Stats", "Month"], ["Contract", "Date", "Long/Short", "Entry price", "Exit price", "Pip", "W/L/BE"]]);
eq("gap columns E:F empty", [v(3, 5), v(3, 6), v(4, 5), v(14, 6)], [null, null, null, null]);
eq("stats labels", [4, 5, 6, 7, 8, 9, 10, 11].map((r) => v(r, 1)), ["Total trades", "W", "L", "BE", "Win rate", "Winning pips", "Losing pips", "Total pips"]);
eq("stats values", [4, 5, 6, 7, 8, 9, 10, 11].map((r) => Math.round(Number(v(r, 2)) * 1e6) / 1e6), [4, 1, 1, 1, 0.333333, 20, -30, -10]);
// balance = 10000 start + 20 - 30 + 0 (open ignored) + 40 (September) = 10030, independent of the pips
eq("balance", [v(13, 1), v(13, 2)], ["Account balance", 10030]);
eq("risk header", row(14, 1, 4), ["Risk per pip", "Amount ($)", "% of balance", "Pips to margin call"]);
eq("$1/pip row (still fed by the net)", row(15, 1, 4), ["$1 / pip", -10, -10 / 10030, 10030]);
eq("$2/pip row", row(16, 1, 4), ["$2 / pip", -20, -20 / 10030, 5015]);
eq("newest first: open trade", row(4, 7, 7), ["EURUSD", "2026-11-07", "Long", 1.1, null, null, null]);
eq("BE row", [v(5, 12), v(5, 13)], [0, "BE"]);
eq("loss row", [v(6, 9), v(6, 12), v(6, 13)], ["Short", -30, "L"]);
eq("win row", [v(7, 8), v(7, 12), v(7, 13)], ["2026-11-02", 20, "W"]);
eq("table ends", v(8, 7), null);
eq("no Exit note column anywhere", [3, 4, 5, 6, 7].some((r) => row(r, 1, 14).includes("Exit note")), false);
eq("nothing right of W/L/BE", v(3, 14), null);
const sep = wb.getWorksheet("September 2026")!;
eq("sept: winning/losing/total pips", [9, 10, 11].map((r) => sep.getCell(r, 2).value), [30, 0, 30]);
eq("sept: balance is the real one, not pips", sep.getCell(13, 2).value, 10030);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
