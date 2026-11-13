// Trades out as a styled .xlsx workbook, entirely in the browser: nothing is uploaded and no server is involved.
// (exceljs is loaded on demand so it stays out of the main bundle.)
import type { Account, Trade } from "../types";
import { computeStats } from "./stats";

const MONEY = "#,##0.00";
/** "2026-01-01T10:00" or "2026-01-01 10:00" -> ["2026-01-01", "10:00"]; kept as text so no timezone shifts. */
const splitStamp = (v: string | null): [string | null, string | null] => {
  if (!v) return [null, null];
  const m = /^(\S+?)[T\s]+(.+)$/.exec(v.trim());
  return m ? [m[1], m[2]] : [v, null];
};

interface Col { key: string; value: (t: Trade, i: number, accountName: string) => string | number | null; numFmt?: string }
/** The one place that defines the trades table's columns; the order, count, formats and pnl position all derive from it. */
const columns = (showAccount: boolean): Col[] => [
  ...(showAccount ? [{ key: "account", value: (_t: Trade, _i: number, acc: string) => acc }] : []),
  { key: "no", value: (_t, i) => i + 1 }, // sequential per sheet, not the original trade.no
  { key: "symbol", value: (t) => t.symbol },
  { key: "side", value: (t) => t.side },
  { key: "qty", value: (t) => t.qty },
  { key: "entry_date", value: (t) => splitStamp(t.entryTime)[0] },
  { key: "entry_time", value: (t) => splitStamp(t.entryTime)[1] },
  { key: "entry_price", value: (t) => t.entryPrice, numFmt: MONEY },
  { key: "exit_date", value: (t) => splitStamp(t.exitTime)[0] },
  { key: "exit_time", value: (t) => splitStamp(t.exitTime)[1] },
  { key: "exit_price", value: (t) => t.exitPrice, numFmt: MONEY },
  { key: "pnl", value: (t) => t.pnl, numFmt: MONEY },
  { key: "sl", value: (t) => t.sl ?? null, numFmt: MONEY },
  { key: "tp", value: (t) => t.tp ?? null, numFmt: MONEY },
];

/** The app's own --profit / --loss, resolved at export time so custom win/loss colours carry through. */
function themeColors(): { profit: string; loss: string } {
  const read = (name: string, fallback: string) => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  return { profit: read("--profit", "#22c55e"), loss: read("--loss", "#f87171") };
}

const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
/** Soft fill: the colour blended 70% toward white, so the dark text stays readable on it. */
const tint = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return argb(`#${c.map((v) => Math.round(v + (255 - v) * 0.7).toString(16).padStart(2, "0")).join("")}`);
};

/** Excel forbids []:*?/\ in sheet names, caps them at 31 chars, and wants them unique. */
function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[\[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Account";
  let name = base, i = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 31 - String(i).length - 1)} ${i++}`;
  used.add(name.toLowerCase());
  return name;
}

/*
 * Formula safety: exceljs writes every plain string as a text cell (shared string), never as a formula, so a value
 * starting with = + - @ is shown as text and cannot run. Only an object like { formula } becomes a formula, and
 * this file never builds one, so no manual guarding is needed.
 */
export async function tradesToXlsx(trades: Trade[], accounts: Account[]): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const { profit, loss } = themeColors();
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mizan";
  wb.created = new Date();

  const HEADER_FILL = argb("#1F2937");
  const used = new Set<string>(["trades"]);
  type Sheet = ReturnType<typeof wb.addWorksheet>;
  const solid = (color: string) => ({ type: "pattern", pattern: "solid", fgColor: { argb: color } }) as const;
  const headCell = (ws: Sheet, row: number, col: number, v: string) => {
    const c = ws.getCell(row, col);
    c.value = v;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = solid(HEADER_FILL);
  };
  const ZEBRA = "FFF3F4F6";
  const NEUTRAL = "FFE5E7EB";
  const INK = "FF111827";

  // Writes a trades table whose header sits on `h` and whose first column is `c0`, with the frozen header,
  // autofilter, number formats, zebra stripes, pnl colouring and auto widths all scoped to that range.
  const fill = (ws: Sheet, list: Trade[], c0: number, h: number, showAccount: boolean) => {
    const cols = columns(showAccount);
    const pnlAt = c0 + cols.findIndex((c) => c.key === "pnl");
    cols.forEach((c, i) => headCell(ws, h, c0 + i, c.key));
    list.forEach((t, r) => {
      const acc = name.get(t.accountId) ?? t.accountId;
      cols.forEach((c, i) => { ws.getCell(h + 1 + r, c0 + i).value = c.value(t, r, acc); });
    });
    ws.views = [{ state: "frozen", ySplit: h }];
    ws.autoFilter = { from: { row: h, column: c0 }, to: { row: h, column: c0 + cols.length - 1 } };
    for (let r = h + 1; r <= h + list.length; r++) {
      cols.forEach((c, i) => {
        const cell = ws.getCell(r, c0 + i);
        // Zebra first, so the pnl tint below overrides it on that one column.
        if ((r - h) % 2 === 0) cell.fill = solid(ZEBRA);
        if (c.numFmt) cell.numFmt = c.numFmt;
      });
      const p = ws.getCell(r, pnlAt);
      const v = p.value;
      if (typeof v === "number" && v !== 0) {
        p.fill = solid(tint(v > 0 ? profit : loss));
        p.font = { color: { argb: argb(v > 0 ? profit : loss) }, bold: true };
      }
    }
    cols.forEach((c, i) => {
      let w = c.key.length;
      for (let r = h + 1; r <= h + list.length; r++) {
        const val = ws.getCell(r, c0 + i).value;
        const len = typeof val === "number" ? val.toFixed(2).length : String(val ?? "").length;
        if (len > w) w = len;
      }
      ws.getColumn(c0 + i).width = Math.min(40, w + 3);
    });
    return cols.length;
  };

  // Brand strip over `last` columns: "Mizan" (row 1), the export date (row 2) and, for a single-account table,
  // the account's name as a bold title (row 3).
  const strip = (ws: Sheet, last: number, title?: string) => {
    ws.mergeCells(1, 1, 1, last);
    const brand = ws.getCell(1, 1);
    brand.value = "Mizan";
    brand.font = { bold: true, size: 22, color: { argb: "FFFFFFFF" } };
    brand.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    for (let c = 1; c <= last; c++) ws.getCell(1, c).fill = solid(HEADER_FILL);
    ws.getRow(1).height = 36;
    ws.mergeCells(2, 1, 2, last);
    const when = ws.getCell(2, 1);
    when.value = `Exported ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
    when.font = { italic: true, color: { argb: "FF6B7280" } };
    when.alignment = { horizontal: "left", indent: 1 };
    if (title) {
      ws.mergeCells(3, 1, 3, last);
      const t = ws.getCell(3, 1);
      t.value = title;
      t.font = { bold: true, size: 14, color: { argb: INK } };
      t.alignment = { horizontal: "left", indent: 1 };
    }
  };

  // One sheet: a brand strip (rows 1-2, row 3 blank), then the summary in columns A-D, two gap columns (E, F)
  // and the trades table from G, the two blocks sharing the header row.
  const C0 = 7, HDR = 4;
  const main = wb.addWorksheet("Trades");
  const s = computeStats(trades);
  const byAccount = [...new Set(trades.map((t) => t.accountId))];
  // One account only (scoped export, or a single account in the app): its name becomes the title, not a column.
  const single = byAccount.length === 1 ? (name.get(byAccount[0]) ?? byAccount[0]) : undefined;
  const put = (row: number, col: number, v: string | number | null, numFmt?: string) => {
    const c = main.getCell(row, col);
    c.value = v;
    if (numFmt) c.numFmt = numFmt;
    return c;
  };

  // KPI cards: a tinted label + value pair per metric. `good` null = no polarity, so neutral grey.
  const best = trades.filter((t) => t.pnl != null).reduce<Trade | null>((m, t) => (m == null || (t.pnl as number) > (m.pnl as number) ? t : m), null);
  const worst = trades.filter((t) => t.pnl != null).reduce<Trade | null>((m, t) => (m == null || (t.pnl as number) < (m.pnl as number) ? t : m), null);
  const card = (row: number, label: string, v: number | null, numFmt: string, good: boolean | null, extra?: string) => {
    const bg = solid(good == null ? NEUTRAL : tint(good ? profit : loss));
    const l = put(row, 1, label);
    l.fill = bg; l.font = { bold: true, color: { argb: INK } };
    const c = put(row, 2, v, numFmt);
    c.fill = bg; c.font = { bold: true, size: 13, color: { argb: INK } };
    c.alignment = { horizontal: "right" };
    if (extra !== undefined) {
      const e = put(row, 3, extra);
      e.fill = bg; e.font = { bold: true, color: { argb: INK } };
    }
  };
  ["Metric", "Value"].forEach((hd, i) => headCell(main, HDR, 1 + i, hd));
  card(5, "Total trades", s.count, "0", null);
  card(6, "Win rate", s.winRate == null ? null : s.winRate / 100, "0.0%", s.winRate == null ? null : s.winRate >= 50);
  card(7, "Net P&L", s.net, "#,##0.00", s.net >= 0);
  card(8, "Profit factor", s.profitFactor, "0.00", s.profitFactor == null ? null : s.profitFactor >= 1);
  card(9, "Best trade", best ? (best.pnl as number) : null, "#,##0.00", best ? (best.pnl as number) >= 0 : null, best?.symbol ?? "");
  card(10, "Worst trade", worst ? (worst.pnl as number) : null, "#,##0.00", worst ? (worst.pnl as number) >= 0 : null, worst?.symbol ?? "");

  const AH = 12;
  ["Account", "Trades", "Win rate", "Net P&L"].forEach((hd, i) => headCell(main, AH, 1 + i, hd));
  byAccount.forEach((id, i) => {
    const a = computeStats(trades.filter((t) => t.accountId === id));
    put(AH + 1 + i, 1, name.get(id) ?? id);
    put(AH + 1 + i, 2, a.count);
    put(AH + 1 + i, 3, a.winRate == null ? null : a.winRate / 100, "0.0%");
    put(AH + 1 + i, 4, a.net, "#,##0.00").font = { color: { argb: argb(a.net >= 0 ? profit : loss) } };
  });
  if (byAccount.length) {
    // Win rates are stored as 0-1 fractions, so the bar scales over that fixed range.
    main.addConditionalFormatting({
      ref: `C${AH + 1}:C${AH + byAccount.length}`,
      rules: [{ type: "dataBar", priority: 1, gradient: false, showValue: true, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: argb(profit) } } as never],
    });
  }
  main.getColumn(1).width = 24;
  [2, 3, 4].forEach((i) => { main.getColumn(i).width = 14; });
  main.getColumn(5).width = 4;
  main.getColumn(6).width = 4;
  const n = fill(main, trades, C0, HDR, single === undefined);
  strip(main, C0 + n - 1, single);

  if (accounts.length > 1) {
    for (const id of byAccount) {
      const ws = wb.addWorksheet(sheetName(name.get(id) ?? id, used));
      const n = fill(ws, trades.filter((t) => t.accountId === id), 1, HDR, false);
      strip(ws, n, name.get(id) ?? id);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking at once can cancel the download in some browsers, so it waits a moment.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
