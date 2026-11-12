// Trades out as a styled .xlsx workbook, entirely in the browser: nothing is uploaded and no server is involved.
// (exceljs is loaded on demand so it stays out of the main bundle.)
import type { Account, Trade } from "../types";
import { computeStats } from "./stats";

const COLUMNS = [
  "account", "no", "symbol", "side", "qty", "entry_time", "entry_price",
  "exit_time", "exit_price", "pnl", "return_pct", "commission", "sl", "tp", "status",
] as const;
const PNL_COL = COLUMNS.indexOf("pnl") + 1;

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
  const used = new Set<string>(["summary", "trades"]);

  const bold = { bold: true } as const;
  const summary = wb.addWorksheet("Summary");
  const s = computeStats(trades);
  summary.addRow(["Metric", "Value"]);
  summary.addRow(["Total trades", s.count]);
  summary.addRow(["Win rate", s.winRate == null ? "" : s.winRate / 100]);
  summary.addRow(["Net P&L", s.net]);
  summary.addRow(["Profit factor", s.profitFactor == null ? "" : s.profitFactor]);
  summary.getCell("B3").numFmt = "0.0%";
  summary.getCell("B4").numFmt = "#,##0.00";
  summary.getCell("B5").numFmt = "0.00";
  summary.addRow([]);
  const head = summary.addRow(["Account", "Trades", "Win rate", "Net P&L"]);
  const byAccount = [...new Set(trades.map((t) => t.accountId))];
  for (const id of byAccount) {
    const a = computeStats(trades.filter((t) => t.accountId === id));
    const r = summary.addRow([name.get(id) ?? id, a.count, a.winRate == null ? "" : a.winRate / 100, a.net]);
    r.getCell(3).numFmt = "0.0%";
    r.getCell(4).numFmt = "#,##0.00";
    r.getCell(4).font = { color: { argb: argb(a.net >= 0 ? profit : loss) } };
  }
  for (const row of [summary.getRow(1), head]) {
    row.font = { ...bold, color: { argb: "FFFFFFFF" } };
    row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }; });
  }
  summary.getColumn(1).width = 24;
  [2, 3, 4].forEach((i) => { summary.getColumn(i).width = 14; });
  summary.getColumn(2).alignment = { horizontal: "right" };

  const fill = (ws: ReturnType<typeof wb.addWorksheet>, list: Trade[]) => {
    ws.addRow([...COLUMNS]);
    for (const t of list) {
      ws.addRow([
        name.get(t.accountId) ?? t.accountId, t.no, t.symbol, t.side, t.qty, t.entryTime, t.entryPrice,
        t.exitTime, t.exitPrice, t.pnl, t.returnPct == null ? null : t.returnPct / 100,
        t.commission, t.sl ?? null, t.tp ?? null, t.status,
      ]);
    }
    const h = ws.getRow(1);
    h.font = { ...bold, color: { argb: "FFFFFFFF" } };
    h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
    // returnPct is stored in percent units (1.25 = 1.25%), so it is divided by 100 above for Excel's % format.
    for (const col of ["entry_price", "exit_price", "pnl", "commission", "sl", "tp"]) ws.getColumn(COLUMNS.indexOf(col as typeof COLUMNS[number]) + 1).numFmt = "#,##0.00";
    ws.getColumn(COLUMNS.indexOf("return_pct") + 1).numFmt = "0.00%";
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const v = row.getCell(PNL_COL).value;
      if (typeof v === "number" && v !== 0) {
        row.getCell(PNL_COL).fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint(v > 0 ? profit : loss) } };
        row.getCell(PNL_COL).font = { color: { argb: argb(v > 0 ? profit : loss) }, bold: true };
      }
    });
    COLUMNS.forEach((c, i) => {
      let w = c.length;
      ws.getColumn(i + 1).eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        const len = typeof val === "number" ? val.toFixed(2).length : String(val ?? "").length;
        if (len > w) w = len;
      });
      ws.getColumn(i + 1).width = Math.min(40, w + 3);
    });
  };

  fill(wb.addWorksheet("Trades"), trades);
  if (accounts.length > 1) {
    for (const id of byAccount) {
      fill(wb.addWorksheet(sheetName(name.get(id) ?? id, used)), trades.filter((t) => t.accountId === id));
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
