// The monthly "trading log" workbook: one sheet per calendar month that has trades (newest month first), each with a
// stats box, a risk reference table and that month's trades. Built entirely in the browser, parallel to (and separate
// from) tradesToXlsx; it only borrows the same blue-header look. exceljs is loaded on demand.
import type { Account, BalancePoint, Trade } from "../types";
import type { CashFlow } from "./cashflow";
import { currentBalance } from "./balance";
import { defaultPipSize, pipSizeFor, SIZE_STATE_KEY, symbolSpec } from "./calcCore";
import { themeColors } from "./exportTrades";
import { tradeOutcomeOf } from "./outcome";
import { pipSize as guessPipSize } from "./pips";
import { computeStats } from "./stats";
import { sharedTradeMode, tradeModeWord } from "./tradeMode";

const BODY_PT = 10;
const PRICE = "#,##0.00###";
const MONEY = "#,##0.00";
const PIPS = "#,##0.0";
/** Risk per pip the reference table works out, in the account currency. */
const RISK_LEVELS = [1, 2];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11" -> "November 2026". */
const monthTitle = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1] ?? m.slice(5, 7)} ${m.slice(0, 4)}`;
const monthOf = (t: Trade) => (/^\d{4}-(0[1-9]|1[0-2])/.test(t.entryTime ?? "") ? (t.entryTime as string).slice(0, 7) : null);
const dateOf = (t: Trade) => (/^\d{4}-\d{2}-\d{2}/.test(t.entryTime ?? "") ? (t.entryTime as string).slice(0, 10) : null);
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;

/** The pip sizes the user typed in the calculators (symbol -> text), for symbols that have no built-in size. */
function typedPipSizes(): Record<string, string> {
  try {
    const p = JSON.parse(localStorage.getItem(SIZE_STATE_KEY) ?? "{}")?.pipSizes;
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Signed pips of a closed trade: the price move in the trade's direction (profit positive, adverse negative), in the
 * symbol's pip size, from symbolSpec + pipSizeFor: forex its spec's (0.0001, JPY pairs 0.01), gold 0.1, silver 0.01.
 * A size typed in the calculators only counts for a symbol with no built-in size (indices, oil ...): for the others it
 * would silently rescale every pip (a stray 0.01 for gold made 6.58 of price read as 658 pips). A symbol with no size
 * at all falls back to the journal's own pipSize guess, so this agrees with the pips shown in the journal.
 * Null for an open trade.
 */
export function pipsFor(t: Pick<Trade, "symbol" | "side" | "entryPrice" | "exitPrice" | "status">, typed: Record<string, string> = {}): number | null {
  if (t.status !== "closed" || t.exitPrice == null || !Number.isFinite(t.entryPrice) || !Number.isFinite(t.exitPrice)) return null;
  const sp = symbolSpec(t.symbol);
  let size = pipSizeFor(sp, defaultPipSize(sp) == null ? typed[t.symbol.toUpperCase()] : undefined);
  if (!(size > 0)) size = guessPipSize(t.symbol);
  const move = t.side === "long" ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice;
  return Math.round((move / size) * 10) / 10;
}

/**
 * `balances` and `flows` are the app's imported balance history and cash flows; with them the risk table uses the
 * account's real current balance, without them its starting balance plus realised P&L. `trades` is the full history of
 * the chosen scope; months come from the entry date.
 */
export async function tradesToStreamLog(
  trades: Trade[],
  accounts: Account[],
  balances: Record<string, BalancePoint[]> = {},
  flows: CashFlow[] = [],
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const { profit, loss } = themeColors();
  const typed = typedPipSizes();
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mizan";
  wb.created = new Date();

  // Same visual language as the profile statement: blue header bands, white bold text, light-blue banding.
  const INK = "FF111827";
  const BLUE = "FF2F5597";
  const BAND = "FFD9E1F2";
  const WHITE = "FFFFFFFF";
  const GOLD = "FFFFC000";
  const GREEN = "FF22C55E", BLUE_KIND = "FF3B82F6", ORANGE = "FFF97316"; // account-type: Verified / Demo+Contest / Unverified
  type Sheet = ReturnType<typeof wb.addWorksheet>;
  const solid = (color: string) => ({ type: "pattern", pattern: "solid", fgColor: { argb: color } }) as const;
  const RIGHT = { horizontal: "right" } as const;
  const headCell = (ws: Sheet, row: number, col: number, v: string, right = false) => {
    const c = ws.getCell(row, col);
    c.value = v;
    c.font = { bold: true, color: { argb: WHITE } };
    c.fill = solid(BLUE);
    c.alignment = { horizontal: right ? "right" : "left", vertical: "middle", wrapText: true };
  };

  const scopeIds = [...new Set(trades.map((t) => t.accountId))];
  const scopeAccounts = scopeIds.map((id) => accounts.find((a) => a.id === id)).filter((a): a is Account => !!a);
  const who = scopeIds.length === 1 ? (name.get(scopeIds[0]) ?? scopeIds[0]) : "All accounts";
  // The account type is only what the MT5 sync stored on the account; several accounts show one only when they all agree.
  const tradeMode = sharedTradeMode(scopeAccounts);
  const kindWord = tradeModeWord(tradeMode);
  // The real balance: each account's latest (imported snapshots, cash flows and realised P&L), summed over the scope.
  const balance = scopeAccounts.reduce((s, a) => s + currentBalance(a, trades.filter((t) => t.accountId === a.id), balances[a.id] ?? [], flows), 0);

  const months = [...new Set(trades.map(monthOf).filter((m): m is string => m != null))].sort().reverse();
  const COLS = ["Contract", "Date", "Long/Short", "Entry price", "Exit price", "Pip", "W/L/BE"];
  // Side by side on one sheet: stats and risk in columns A-D, two gap columns, the trades table from column G. The
  // header row (HDR) is shared by the stats box and the trades table.
  const C0 = 7, HDR = 3, LAST = C0 + COLS.length - 1;
  const WIDTHS = [16, 13, 13, 13, 3, 3, 16, 13, 12, 13, 13, 11, 10];

  for (const m of months) {
    const ws = wb.addWorksheet(monthTitle(m));
    const stamp = (t: Trade) => (t.entryTime ?? "").replace("T", " ");
    const list = trades.filter((t) => monthOf(t) === m).sort((a, b) => (stamp(a) < stamp(b) ? 1 : stamp(a) > stamp(b) ? -1 : 0));
    const rows = list.map((t) => {
      const outcome = t.status === "closed" && t.pnl != null ? tradeOutcomeOf(t) : null;
      return { t, pip: pipsFor(t, typed), outcome };
    });
    const s = computeStats(list);
    const be = s.closed - s.wins - s.losses;
    const sumPips = (keep: (p: number) => boolean) => Math.round(rows.reduce((sum, r) => sum + (r.pip != null && keep(r.pip) ? r.pip : 0), 0) * 10) / 10;
    const winPips = sumPips((p) => p > 0);
    const losePips = sumPips((p) => p < 0);
    const totalPips = Math.round(rows.reduce((sum, r) => sum + (r.pip ?? 0), 0) * 10) / 10; // the net: winning + losing

    WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Title row: "MIZAN" in gold at the left, "Account name : <name>" over the trades table, the account type beside it
    // ("Verified" green / "Demo"+"Contest" blue / "Unverified" orange, matching the UI badge) and
    // "date : <export date>" at the far right. Row 2 keeps the month, since the title no longer carries it.
    const TITLE_END = LAST - 3; // the last three columns (K:M) hold the date
    const KIND_COL = TITLE_END; // J: the account type
    ws.mergeCells(1, 1, 1, C0 - 1);
    const brand = ws.getCell(1, 1);
    brand.value = "MIZAN";
    brand.font = { bold: true, size: 26, color: { argb: GOLD } };
    brand.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.mergeCells(1, C0, 1, KIND_COL - 1);
    const title = ws.getCell(1, C0);
    title.value = `Account name : ${who}`;
    title.font = { bold: true, size: 14, color: { argb: WHITE } };
    title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    const kind = ws.getCell(1, KIND_COL);
    kind.value = kindWord; // always "Verified" / "Demo" / "Contest" / "Unverified"
    kind.font = { bold: true, size: 12, color: { argb: tradeMode === "real" ? GREEN : tradeMode ? BLUE_KIND : ORANGE } };
    kind.alignment = { vertical: "middle", horizontal: "center" };
    ws.mergeCells(1, TITLE_END + 1, 1, LAST);
    const when = ws.getCell(1, TITLE_END + 1);
    when.value = `date : ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
    when.font = { bold: true, size: 12, color: { argb: WHITE } };
    when.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    for (let c = 1; c <= LAST; c++) ws.getCell(1, c).fill = solid(BLUE);
    ws.getRow(1).height = 36;
    ws.mergeCells(2, 1, 2, LAST);
    const month = ws.getCell(2, 1);
    month.value = monthTitle(m);
    month.font = { bold: true, color: { argb: "FF6B7280" } };
    month.alignment = { horizontal: "left", indent: 1 };

    // Stats box (A:B).
    const SH = HDR;
    headCell(ws, SH, 1, "Stats");
    headCell(ws, SH, 2, "Month", true);
    const stat: [string, number | null, string][] = [
      ["Total trades", s.count, "0"],
      ["W", s.wins, "0"],
      ["L", s.losses, "0"],
      ["BE", be, "0"],
      ["Win rate", s.winRate == null ? null : s.winRate / 100, "0.0%"],
      ["Winning pips", winPips, PIPS],
      ["Losing pips", losePips, PIPS],
      ["Total pips", totalPips, PIPS],
    ];
    const pipTone: Record<string, number> = { "Winning pips": winPips, "Losing pips": losePips, "Total pips": totalPips };
    stat.forEach(([label, v, fmt], i) => {
      const r = SH + 1 + i;
      const l = ws.getCell(r, 1);
      l.value = label;
      l.font = { bold: true, color: { argb: INK } };
      const c = ws.getCell(r, 2);
      c.value = v;
      c.numFmt = fmt;
      c.alignment = RIGHT;
      c.font = { bold: true, color: { argb: label in pipTone && pipTone[label] !== 0 ? argb(pipTone[label] > 0 ? profit : loss) : INK } };
      if (i % 2 === 0) for (let k = 1; k <= 2; k++) ws.getCell(r, k).fill = solid(BAND);
    });

    // Risk reference (A:D): what the month's pips are worth at a few risk-per-pip levels, against the real balance.
    const RB = SH + stat.length + 2;
    const hasBal = Number.isFinite(balance) && balance > 0;
    ws.getCell(RB, 1).value = "Account balance";
    ws.getCell(RB, 1).font = { bold: true, color: { argb: INK } };
    const bc = ws.getCell(RB, 2);
    bc.value = hasBal ? balance : null;
    bc.numFmt = MONEY;
    bc.alignment = RIGHT;
    bc.font = { bold: true, color: { argb: INK } };
    for (let k = 1; k <= 4; k++) ws.getCell(RB, k).fill = solid(BAND);
    const RH = RB + 1;
    ["Risk per pip", "Amount ($)", "% of balance", "Pips to margin call"].forEach((hd, i) => headCell(ws, RH, 1 + i, hd, i > 0));
    ws.getRow(RH).height = 30;
    RISK_LEVELS.forEach((risk, i) => {
      const r = RH + 1 + i;
      const amount = totalPips * risk;
      const vals: [string | number | null, string | undefined][] = [
        [`$${risk} / pip`, undefined],
        [amount, MONEY],
        [hasBal ? amount / balance : null, "0.00%"],
        [hasBal ? balance / risk : null, PIPS],
      ];
      vals.forEach(([v, fmt], k) => {
        const c = ws.getCell(r, 1 + k);
        c.value = v;
        if (fmt) c.numFmt = fmt;
        if (k > 0) c.alignment = RIGHT;
        c.font = { name: "Calibri", size: BODY_PT, bold: k === 0, ...(k === 1 && amount !== 0 ? { color: { argb: argb(amount > 0 ? profit : loss) } } : {}) };
        if (i % 2 === 1) c.fill = solid(BAND);
      });
    });

    // The trades table, to the right of the stats and risk blocks, on the shared header row.
    const TH = HDR;
    COLS.forEach((hd, i) => headCell(ws, TH, C0 + i, hd, i === 3 || i === 4 || i === 5));
    const bold = (color: string) => ({ name: "Calibri", size: BODY_PT, bold: true, color: { argb: argb(color) } });
    rows.forEach(({ t, pip, outcome }, i) => {
      const r = TH + 1 + i;
      const vals: (string | number | null)[] = [
        t.symbol, dateOf(t), t.side === "long" ? "Long" : "Short", t.entryPrice, t.exitPrice, pip,
        outcome == null ? null : outcome === "win" ? "W" : outcome === "loss" ? "L" : "BE",
      ];
      vals.forEach((v, k) => {
        const c = ws.getCell(r, C0 + k);
        c.value = v;
        c.font = { name: "Calibri", size: BODY_PT };
        if (k === 3 || k === 4) { c.numFmt = PRICE; c.alignment = RIGHT; }
        if (k === 5) { c.numFmt = PIPS; c.alignment = RIGHT; }
        if (k === 6) c.alignment = { horizontal: "center" };
        if (i % 2 === 1) c.fill = solid(BAND);
      });
      if (pip != null && pip !== 0) ws.getCell(r, C0 + 5).font = bold(pip > 0 ? profit : loss);
      if (outcome === "win" || outcome === "loss") ws.getCell(r, C0 + 6).font = bold(outcome === "win" ? profit : loss);
    });
    if (rows.length) ws.autoFilter = { from: { row: TH, column: C0 }, to: { row: TH, column: LAST } };
    ws.views = [{ state: "frozen", ySplit: HDR }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
