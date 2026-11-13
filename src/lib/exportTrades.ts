// Trades out as a styled .xlsx workbook, entirely in the browser: nothing is uploaded and no server is involved.
// (exceljs is loaded on demand so it stays out of the main bundle.)
import type { Account, Trade } from "../types";
import { computeStats } from "./stats";

const MONEY = "#,##0.00";
const BODY_PT = 10;
/** "2026-01-01T10:00" or "2026-01-01 10:00" -> ["2026-01-01", "10:00"]; kept as text so no timezone shifts. */
const splitStamp = (v: string | null): [string | null, string | null] => {
  if (!v) return [null, null];
  const m = /^(\S+?)[T\s]+(.+)$/.exec(v.trim());
  return m ? [m[1], m[2]] : [v, null];
};

interface Col { key: string; value: (t: Trade, i: number, accountName: string) => string | number | null; numFmt?: string; num?: boolean }
/** The one place that defines the trades table's columns; the order, count, formats and pnl position all derive from it. */
const columns = (showAccount: boolean): Col[] => [
  ...(showAccount ? [{ key: "account", value: (_t: Trade, _i: number, acc: string) => acc }] : []),
  { key: "no", value: (_t, i) => i + 1, num: true }, // sequential per sheet, not the original trade.no
  { key: "symbol", value: (t) => t.symbol },
  { key: "side", value: (t) => t.side },
  { key: "qty", value: (t) => t.qty, num: true },
  { key: "entry_date", value: (t) => splitStamp(t.entryTime)[0] },
  { key: "entry_time", value: (t) => splitStamp(t.entryTime)[1] },
  { key: "entry_price", value: (t) => t.entryPrice, numFmt: MONEY, num: true },
  { key: "exit_date", value: (t) => splitStamp(t.exitTime)[0] },
  { key: "exit_time", value: (t) => splitStamp(t.exitTime)[1] },
  { key: "exit_price", value: (t) => t.exitPrice, numFmt: MONEY, num: true },
  { key: "pnl", value: (t) => t.pnl, numFmt: MONEY, num: true },
  { key: "sl", value: (t) => t.sl ?? null, numFmt: MONEY, num: true },
  { key: "tp", value: (t) => t.tp ?? null, numFmt: MONEY, num: true },
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

  const used = new Set<string>(["trades"]);
  type Sheet = ReturnType<typeof wb.addWorksheet>;
  const INK = "FF111827";
  // Formal statement look: no fills anywhere, only hairline rules. A dark rule under headers, a light one between rows.
  const RULE_DARK = { style: "thin", color: { argb: INK } } as const;
  const RULE_LIGHT = { style: "thin", color: { argb: "FFD1D5DB" } } as const;
  const RIGHT = { horizontal: "right" } as const;
  const headCell = (ws: Sheet, row: number, col: number, v: string, right = false) => {
    const c = ws.getCell(row, col);
    c.value = v;
    c.font = { bold: true, color: { argb: INK } };
    c.border = { bottom: RULE_DARK };
    if (right) c.alignment = RIGHT;
  };

  // Writes a trades table whose header sits on `h` and whose first column is `c0`, with the frozen header,
  // autofilter, number formats, row rules, pnl colouring and auto widths all scoped to that range.
  const fill = (ws: Sheet, input: Trade[], c0: number, h: number, showAccount: boolean) => {
    // Newest entry first (undated last; ties keep their input order), and `no` counts in that order.
    const stamp = (t: Trade) => (t.entryTime ?? "").replace("T", " ");
    const list = [...input].sort((a, b) => (stamp(a) < stamp(b) ? 1 : stamp(a) > stamp(b) ? -1 : 0));
    const cols = columns(showAccount);
    const pnlAt = c0 + cols.findIndex((c) => c.key === "pnl");
    cols.forEach((c, i) => headCell(ws, h, c0 + i, c.key, c.num));
    list.forEach((t, r) => {
      const acc = name.get(t.accountId) ?? t.accountId;
      cols.forEach((c, i) => { ws.getCell(h + 1 + r, c0 + i).value = c.value(t, r, acc); });
    });
    ws.views = [{ state: "frozen", ySplit: h }];
    ws.autoFilter = { from: { row: h, column: c0 }, to: { row: h, column: c0 + cols.length - 1 } };
    for (let r = h + 1; r <= h + list.length; r++) {
      cols.forEach((c, i) => {
        const cell = ws.getCell(r, c0 + i);
        cell.border = { bottom: RULE_LIGHT };
        cell.font = { name: "Calibri", size: BODY_PT };
        if (c.num) cell.alignment = RIGHT;
        if (c.numFmt) cell.numFmt = c.numFmt;
      });
      const p = ws.getCell(r, pnlAt);
      const v = p.value;
      if (typeof v === "number" && v !== 0) {
        p.font = { name: "Calibri", size: BODY_PT, color: { argb: argb(v > 0 ? profit : loss) }, bold: true };
      }
    }
    cols.forEach((c, i) => {
      // The bold header is wider per character than the body, so it counts a little extra.
      let w = Math.ceil(c.key.length * 1.15);
      for (let r = h + 1; r <= h + list.length; r++) {
        const val = ws.getCell(r, c0 + i).value;
        const len = typeof val === "number"
          ? (c.numFmt ? val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(val)).length
          : String(val ?? "").length;
        if (len > w) w = len;
      }
      ws.getColumn(c0 + i).width = Math.min(18, w + 1);
    });
    return cols.length;
  };

  // Brand area over `last` columns. Row 1: "Mizan" in blackletter at the left and, for a single-account table, the
  // account's name as a bold title further right (over the trades table; `titleAt` is its first column). Row 2: the
  // export date. The header row follows directly on row 3.
  const strip = (ws: Sheet, last: number, titleAt: number, title?: string) => {
    ws.mergeCells(1, 1, 1, titleAt - 1);
    const brand = ws.getCell(1, 1);
    brand.value = "Mizan";
    // Blackletter ships with Office ("Old English Text MT"); where it is missing the viewer falls back to its default.
    brand.font = { name: "Old English Text MT", bold: true, size: 22, color: { argb: INK } };
    brand.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    if (title) {
      ws.mergeCells(1, titleAt, 1, last);
      const t = ws.getCell(1, titleAt);
      t.value = title;
      t.font = { bold: true, size: 20, color: { argb: INK } };
      t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }
    for (let c = 1; c <= last; c++) ws.getCell(1, c).border = { bottom: RULE_DARK };
    ws.getRow(1).height = 36;
    ws.mergeCells(2, 1, 2, last);
    const when = ws.getCell(2, 1);
    when.value = `Exported ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
    when.font = { italic: true, color: { argb: "FF6B7280" } };
    when.alignment = { horizontal: "left", indent: 1 };
  };

  // One sheet: a brand area (rows 1-2), then the shared header row 3, with the summary in columns A-D, two gap columns (E, F)
  // and the trades table from G, the two blocks sharing the header row.
  const C0 = 7, HDR = 3;
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

  // KPI cards: a label + value pair per metric. `good` null = no polarity, so neutral grey.
  const best = trades.filter((t) => t.pnl != null).reduce<Trade | null>((m, t) => (m == null || (t.pnl as number) > (m.pnl as number) ? t : m), null);
  const worst = trades.filter((t) => t.pnl != null).reduce<Trade | null>((m, t) => (m == null || (t.pnl as number) < (m.pnl as number) ? t : m), null);
  // `good` null = no polarity, so the value stays dark; otherwise only the font turns green or red.
  const card = (row: number, label: string, v: number | null, numFmt: string, good: boolean | null, extra?: string) => {
    const l = put(row, 1, label);
    l.font = { bold: true, color: { argb: INK } };
    const c = put(row, 2, v, numFmt);
    c.font = { bold: true, size: 13, color: { argb: good == null ? INK : argb(good ? profit : loss) } };
    c.alignment = RIGHT;
    const e = put(row, 3, extra ?? null);
    if (extra !== undefined) e.font = { bold: true, color: { argb: INK } };
    for (let k = 1; k <= 4; k++) main.getCell(row, k).border = { bottom: RULE_LIGHT };
  };
  ["Metric", "Value"].forEach((hd, i) => headCell(main, HDR, 1 + i, hd, i === 1));
  card(HDR + 1, "Total trades", s.count, "0", null);
  card(HDR + 2, "Win rate", s.winRate == null ? null : s.winRate / 100, "0.0%", null);
  card(HDR + 3, "Net P&L", s.net, "#,##0.00", s.net >= 0);
  card(HDR + 4, "Profit factor", s.profitFactor, "0.00", s.profitFactor == null ? null : s.profitFactor >= 1);
  card(HDR + 5, "Best trade", best ? (best.pnl as number) : null, "#,##0.00", best ? (best.pnl as number) >= 0 : null, best?.symbol ?? "");
  card(HDR + 6, "Worst trade", worst ? (worst.pnl as number) : null, "#,##0.00", worst ? (worst.pnl as number) >= 0 : null, worst?.symbol ?? "");

  // The per-account table only earns its place when accounts are mixed; for one account it repeats the cards.
  if (single === undefined) {
    const AH = HDR + 8;
    ["Account", "Trades", "Win rate", "Net P&L"].forEach((hd, i) => headCell(main, AH, 1 + i, hd, i > 0));
    byAccount.forEach((id, i) => {
      const a = computeStats(trades.filter((t) => t.accountId === id));
      put(AH + 1 + i, 1, name.get(id) ?? id);
      put(AH + 1 + i, 2, a.count).alignment = RIGHT;
      put(AH + 1 + i, 3, a.winRate == null ? null : a.winRate / 100, "0.0%").alignment = RIGHT;
      const nc = put(AH + 1 + i, 4, a.net, "#,##0.00");
      nc.font = { color: { argb: argb(a.net >= 0 ? profit : loss) } };
      nc.alignment = RIGHT;
      for (let k = 1; k <= 4; k++) main.getCell(AH + 1 + i, k).border = { bottom: RULE_LIGHT };
    });
    if (byAccount.length) {
      // Win rates are stored as 0-1 fractions, so the bar scales over that fixed range.
      main.addConditionalFormatting({
        ref: `C${AH + 1}:C${AH + byAccount.length}`,
        rules: [{ type: "dataBar", priority: 1, gradient: false, showValue: true, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: argb(profit) } } as never],
      });
    }
  }
  main.getColumn(1).width = 24;
  [2, 3, 4].forEach((i) => { main.getColumn(i).width = 14; });
  main.getColumn(5).width = 4;
  main.getColumn(6).width = 4;
  const n = fill(main, trades, C0, HDR, single === undefined);
  strip(main, C0 + n - 1, C0, single);

  if (accounts.length > 1) {
    for (const id of byAccount) {
      const ws = wb.addWorksheet(sheetName(name.get(id) ?? id, used));
      const n = fill(ws, trades.filter((t) => t.accountId === id), 1, HDR, false);
      // Table starts at column 1 here, so the title sits over the entry columns, clear of "Mizan".
      strip(ws, n, 5, name.get(id) ?? id);
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
