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
  const used = new Set<string>(["trades"]);
  type Sheet = ReturnType<typeof wb.addWorksheet>;
  const solid = (color: string) => ({ type: "pattern", pattern: "solid", fgColor: { argb: color } }) as const;
  const headCell = (ws: Sheet, row: number, col: number, v: string) => {
    const c = ws.getCell(row, col);
    c.value = v;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = solid(HEADER_FILL);
  };

  // Writes a trades table whose header sits on row 1 and whose first column is `c0`, with the frozen header,
  // autofilter, number formats, pnl colouring and auto widths all scoped to that column range.
  const fill = (ws: Sheet, list: Trade[], c0 = 1) => {
    COLUMNS.forEach((c, i) => headCell(ws, 1, c0 + i, c));
    list.forEach((t, r) => {
      const vals = [
        name.get(t.accountId) ?? t.accountId, t.no, t.symbol, t.side, t.qty, t.entryTime, t.entryPrice,
        t.exitTime, t.exitPrice, t.pnl,
        // returnPct is stored in percent units (1.25 = 1.25%), so it is divided by 100 for Excel's % format.
        t.returnPct == null ? null : t.returnPct / 100,
        t.commission, t.sl ?? null, t.tp ?? null, t.status,
      ];
      vals.forEach((v, i) => { ws.getCell(r + 2, c0 + i).value = v; });
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: c0 }, to: { row: 1, column: c0 + COLUMNS.length - 1 } };
    const col = (n: (typeof COLUMNS)[number]) => c0 + COLUMNS.indexOf(n);
    for (let r = 2; r <= list.length + 1; r++) {
      for (const n of ["entry_price", "exit_price", "pnl", "commission", "sl", "tp"] as const) ws.getCell(r, col(n)).numFmt = "#,##0.00";
      ws.getCell(r, col("return_pct")).numFmt = "0.00%";
      const p = ws.getCell(r, c0 + PNL_COL - 1);
      const v = p.value;
      if (typeof v === "number" && v !== 0) {
        p.fill = solid(tint(v > 0 ? profit : loss));
        p.font = { color: { argb: argb(v > 0 ? profit : loss) }, bold: true };
      }
    }
    COLUMNS.forEach((c, i) => {
      let w = c.length;
      ws.getColumn(c0 + i).eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        const len = typeof val === "number" ? val.toFixed(2).length : String(val ?? "").length;
        if (len > w) w = len;
      });
      ws.getColumn(c0 + i).width = Math.min(40, w + 3);
    });
  };

  // One sheet: the summary block in columns A-D, two blank gap columns (E, F), then the trades table from G.
  const main = wb.addWorksheet("Trades");
  const s = computeStats(trades);
  const byAccount = [...new Set(trades.map((t) => t.accountId))];
  const put = (row: number, col: number, v: string | number | null, numFmt?: string) => {
    const c = main.getCell(row, col);
    c.value = v;
    if (numFmt) c.numFmt = numFmt;
    return c;
  };
  ["Metric", "Value"].forEach((h, i) => headCell(main, 1, 1 + i, h));
  put(2, 1, "Total trades"); put(2, 2, s.count);
  put(3, 1, "Win rate"); put(3, 2, s.winRate == null ? null : s.winRate / 100, "0.0%");
  put(4, 1, "Net P&L"); put(4, 2, s.net, "#,##0.00");
  put(5, 1, "Profit factor"); put(5, 2, s.profitFactor, "0.00");
  ["Account", "Trades", "Win rate", "Net P&L"].forEach((h, i) => headCell(main, 7, 1 + i, h));
  byAccount.forEach((id, i) => {
    const a = computeStats(trades.filter((t) => t.accountId === id));
    put(8 + i, 1, name.get(id) ?? id);
    put(8 + i, 2, a.count);
    put(8 + i, 3, a.winRate == null ? null : a.winRate / 100, "0.0%");
    put(8 + i, 4, a.net, "#,##0.00").font = { color: { argb: argb(a.net >= 0 ? profit : loss) } };
  });
  main.getColumn(1).width = 24;
  [2, 3, 4].forEach((i) => { main.getColumn(i).width = 14; });
  main.getColumn(5).width = 4;
  main.getColumn(6).width = 4;
  fill(main, trades, 7);

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
