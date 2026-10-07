export type TradeSide = "buy" | "sell";
export type TradeStatus = "win" | "loss";

export interface Trade {
  id: number;
  instrument: string;
  instrumentAr: string;
  side: TradeSide;
  sideAr: string;
  entry: number;
  exit: number;
  pnl: number;
  rMultiple: number;
  date: string;
  dateAr: string;
  status: TradeStatus;
}

export const instruments = [
  { value: "all", label: "كل الأدوات" },
  { value: "EURUSD", label: "يورو/دولار" },
  { value: "GBPUSD", label: "جنيه/دولار" },
  { value: "XAUUSD", label: "ذهب" },
  { value: "BTCUSD", label: "بيتكوين" },
  { value: "US100", label: "ناسداك 100" },
];

export const trades: Trade[] = [
  { id: 1, instrument: "EURUSD", instrumentAr: "يورو/دولار", side: "buy", sideAr: "شراء", entry: 1.0850, exit: 1.0920, pnl: 350, rMultiple: 1.2, date: "2026-09-28", dateAr: "٢٨ سبتمبر", status: "win" },
  { id: 2, instrument: "XAUUSD", instrumentAr: "ذهب", side: "sell", sideAr: "بيع", entry: 2655.0, exit: 2640.0, pnl: 580, rMultiple: 1.8, date: "2026-09-28", dateAr: "٢٨ سبتمبر", status: "win" },
  { id: 3, instrument: "BTCUSD", instrumentAr: "بيتكوين", side: "buy", sideAr: "شراء", entry: 64200, exit: 63800, pnl: -200, rMultiple: -0.6, date: "2026-09-29", dateAr: "٢٩ سبتمبر", status: "loss" },
  { id: 4, instrument: "GBPUSD", instrumentAr: "جنيه/دولار", side: "buy", sideAr: "شراء", entry: 1.2710, exit: 1.2785, pnl: 375, rMultiple: 1.4, date: "2026-09-29", dateAr: "٢٩ سبتمبر", status: "win" },
  { id: 5, instrument: "US100", instrumentAr: "ناسداك 100", side: "sell", sideAr: "بيع", entry: 20350, exit: 20280, pnl: 280, rMultiple: 0.9, date: "2026-09-30", dateAr: "٣٠ سبتمبر", status: "win" },
  { id: 6, instrument: "EURUSD", instrumentAr: "يورو/دولار", side: "sell", sideAr: "بيع", entry: 1.0945, exit: 1.0960, pnl: -150, rMultiple: -0.5, date: "2026-09-30", dateAr: "٣٠ سبتمبر", status: "loss" },
  { id: 7, instrument: "XAUUSD", instrumentAr: "ذهب", side: "buy", sideAr: "شراء", entry: 2642.0, exit: 2658.0, pnl: 640, rMultiple: 2.1, date: "2026-10-01", dateAr: "١ أكتوبر", status: "win" },
  { id: 8, instrument: "BTCUSD", instrumentAr: "بيتكوين", side: "buy", sideAr: "شراء", entry: 64100, exit: 64850, pnl: 475, rMultiple: 1.5, date: "2026-10-01", dateAr: "١ أكتوبر", status: "win" },
  { id: 9, instrument: "GBPUSD", instrumentAr: "جنيه/دولار", side: "sell", sideAr: "بيع", entry: 1.2800, exit: 1.2765, pnl: 350, rMultiple: 1.1, date: "2026-10-02", dateAr: "٢ أكتوبر", status: "win" },
  { id: 10, instrument: "US100", instrumentAr: "ناسداك 100", side: "buy", sideAr: "شراء", entry: 20290, exit: 20150, pnl: -350, rMultiple: -1.0, date: "2026-10-02", dateAr: "٢ أكتوبر", status: "loss" },
  { id: 11, instrument: "EURUSD", instrumentAr: "يورو/دولار", side: "buy", sideAr: "شراء", entry: 1.0875, exit: 1.0905, pnl: 300, rMultiple: 1.0, date: "2026-10-03", dateAr: "٣ أكتوبر", status: "win" },
  { id: 12, instrument: "XAUUSD", instrumentAr: "ذهب", side: "buy", sideAr: "شراء", entry: 2658.0, exit: 2672.0, pnl: 560, rMultiple: 1.7, date: "2026-10-03", dateAr: "٣ أكتوبر", status: "win" },
  { id: 13, instrument: "BTCUSD", instrumentAr: "بيتكوين", side: "sell", sideAr: "بيع", entry: 64900, exit: 64400, pnl: 250, rMultiple: 0.8, date: "2026-10-04", dateAr: "٤ أكتوبر", status: "win" },
  { id: 14, instrument: "GBPUSD", instrumentAr: "جنيه/دولار", side: "buy", sideAr: "شراء", entry: 1.2755, exit: 1.2730, pnl: -250, rMultiple: -0.8, date: "2026-10-04", dateAr: "٤ أكتوبر", status: "loss" },
  { id: 15, instrument: "US100", instrumentAr: "ناسداك 100", side: "buy", sideAr: "شراء", entry: 20160, exit: 20280, pnl: 600, rMultiple: 1.9, date: "2026-10-05", dateAr: "٥ أكتوبر", status: "win" },
  { id: 16, instrument: "EURUSD", instrumentAr: "يورو/دولار", side: "sell", sideAr: "بيع", entry: 1.0910, exit: 1.0885, pnl: 250, rMultiple: 0.9, date: "2026-10-05", dateAr: "٥ أكتوبر", status: "win" },
  { id: 17, instrument: "XAUUSD", instrumentAr: "ذهب", side: "sell", sideAr: "بيع", entry: 2672.0, exit: 2665.0, pnl: 280, rMultiple: 1.0, date: "2026-10-06", dateAr: "٦ أكتوبر", status: "win" },
  { id: 18, instrument: "BTCUSD", instrumentAr: "بيتكوين", side: "buy", sideAr: "شراء", entry: 64400, exit: 65200, pnl: 400, rMultiple: 1.3, date: "2026-10-06", dateAr: "٦ أكتوبر", status: "win" },
];

export const equityCurveData = [
  { label: "٢٨ سبتمبر", value: 10000 },
  { label: "٢٩ سبتمبر", value: 10420 },
  { label: "٣٠ سبتمبر", value: 10640 },
  { label: "١ أكتوبر", value: 11350 },
  { label: "٢ أكتوبر", value: 11700 },
  { label: "٣ أكتوبر", value: 12560 },
  { label: "٤ أكتوبر", value: 12760 },
  { label: "٥ أكتوبر", value: 13510 },
  { label: "٦ أكتوبر", value: 14190 },
];

export const kpiData = {
  netProfit: { value: 4190, sub: "هذا الشهر" },
  winRate: { value: 72.2, sub: "من ١٨ صفقة" },
  profitFactor: { value: 3.14, sub: "الأرباح/الخسائر" },
  avgR: { value: 1.05, sub: "متعدد المخاطرة" },
  maxDrawdown: { value: -5.8, sub: "أقصى تراجع" },
  totalTrades: { value: 18, sub: "آخر ٣٠ يوم" },
};

export const filterPeriods = [
  { value: "week", label: "أسبوع" },
  { value: "month", label: "شهر" },
  { value: "year", label: "سنة" },
  { value: "all", label: "الكل" },
];

export const navItems = [
  { id: "dashboard", label: "الرئيسية", labelEn: "Dashboard", icon: "LayoutDashboard" },
  { id: "trades", label: "الصفقات", labelEn: "Trades", icon: "CandlestickChart" },
  { id: "analytics", label: "التحليلات", labelEn: "Analytics", icon: "BarChart3" },
  { id: "journal", label: "اليوميات", labelEn: "Journal", icon: "NotebookPen" },
  { id: "settings", label: "الإعدادات", labelEn: "Settings", icon: "Settings" },
];

export const mobileNavItems = [
  { id: "dashboard", label: "الرئيسية", icon: "LayoutDashboard" },
  { id: "trades", label: "الصفقات", icon: "CandlestickChart" },
  { id: "analytics", label: "التحليلات", icon: "BarChart3" },
  { id: "settings", label: "الإعدادات", icon: "Settings" },
];
