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
  { value: "all", label: "All Instruments", labelAr: "كل الأدوات" },
  { value: "EURUSD", label: "EUR/USD", labelAr: "يورو/دولار" },
  { value: "GBPUSD", label: "GBP/USD", labelAr: "جنيه/دولار" },
  { value: "XAUUSD", label: "Gold", labelAr: "ذهب" },
  { value: "BTCUSD", label: "Bitcoin", labelAr: "بيتكوين" },
  { value: "US100", label: "Nasdaq 100", labelAr: "ناسداك 100" },
];

export const trades: Trade[] = [
  { id: 1, instrument: "EURUSD", instrumentAr: "يورو/دولار", side: "buy", sideAr: "شراء", entry: 1.085, exit: 1.092, pnl: 350, rMultiple: 1.2, date: "2026-09-28", dateAr: "٢٨ سبتمبر", status: "win" },
  { id: 2, instrument: "XAUUSD", instrumentAr: "ذهب", side: "sell", sideAr: "بيع", entry: 2655, exit: 2640, pnl: 580, rMultiple: 1.8, date: "2026-09-28", dateAr: "٢٨ سبتمبر", status: "win" },
  { id: 3, instrument: "BTCUSD", instrumentAr: "بيتكوين", side: "buy", sideAr: "شراء", entry: 64200, exit: 63800, pnl: -200, rMultiple: -0.6, date: "2026-09-29", dateAr: "٢٩ سبتمبر", status: "loss" },
  { id: 4, instrument: "GBPUSD", instrumentAr: "جنيه/دولار", side: "buy", sideAr: "شراء", entry: 1.271, exit: 1.2785, pnl: 375, rMultiple: 1.4, date: "2026-09-29", dateAr: "٢٩ سبتمبر", status: "win" },
  { id: 5, instrument: "US100", instrumentAr: "ناسداك 100", side: "sell", sideAr: "بيع", entry: 20350, exit: 20280, pnl: 280, rMultiple: 0.9, date: "2026-09-30", dateAr: "٣٠ سبتمبر", status: "win" },
  { id: 6, instrument: "EURUSD", instrumentAr: "يورو/دولار", side: "sell", sideAr: "بيع", entry: 1.0945, exit: 1.096, pnl: -150, rMultiple: -0.5, date: "2026-09-30", dateAr: "٣٠ سبتمبر", status: "loss" },
  { id: 7, instrument: "XAUUSD", instrumentAr: "ذهب", side: "buy", sideAr: "شراء", entry: 2642, exit: 2658, pnl: 640, rMultiple: 2.1, date: "2026-10-01", dateAr: "١ أكتوبر", status: "win" },
  { id: 8, instrument: "BTCUSD", instrumentAr: "بيتكوين", side: "buy", sideAr: "شراء", entry: 64100, exit: 64850, pnl: 475, rMultiple: 1.5, date: "2026-10-01", dateAr: "١ أكتوبر", status: "win" },
  { id: 9, instrument: "GBPUSD", instrumentAr: "جنيه/دولار", side: "sell", sideAr: "بيع", entry: 1.28, exit: 1.2765, pnl: 350, rMultiple: 1.1, date: "2026-10-02", dateAr: "٢ أكتوبر", status: "win" },
  { id: 10, instrument: "US100", instrumentAr: "ناسداك 100", side: "buy", sideAr: "شراء", entry: 20290, exit: 20150, pnl: -350, rMultiple: -1, date: "2026-10-02", dateAr: "٢ أكتوبر", status: "loss" },
  { id: 11, instrument: "EURUSD", instrumentAr: "يورو/دولار", side: "buy", sideAr: "شراء", entry: 1.0875, exit: 1.0905, pnl: 300, rMultiple: 1, date: "2026-10-03", dateAr: "٣ أكتوبر", status: "win" },
  { id: 12, instrument: "XAUUSD", instrumentAr: "ذهب", side: "buy", sideAr: "شراء", entry: 2658, exit: 2672, pnl: 560, rMultiple: 1.7, date: "2026-10-03", dateAr: "٣ أكتوبر", status: "win" },
  { id: 13, instrument: "BTCUSD", instrumentAr: "بيتكوين", side: "sell", sideAr: "بيع", entry: 64900, exit: 64400, pnl: 250, rMultiple: 0.8, date: "2026-10-04", dateAr: "٤ أكتوبر", status: "win" },
  { id: 14, instrument: "GBPUSD", instrumentAr: "جنيه/دولار", side: "buy", sideAr: "شراء", entry: 1.2755, exit: 1.273, pnl: -250, rMultiple: -0.8, date: "2026-10-04", dateAr: "٤ أكتوبر", status: "loss" },
  { id: 15, instrument: "US100", instrumentAr: "ناسداك 100", side: "buy", sideAr: "شراء", entry: 20160, exit: 20280, pnl: 600, rMultiple: 1.9, date: "2026-10-05", dateAr: "٥ أكتوبر", status: "win" },
  { id: 16, instrument: "EURUSD", instrumentAr: "يورو/دولار", side: "sell", sideAr: "بيع", entry: 1.091, exit: 1.0885, pnl: 250, rMultiple: 0.9, date: "2026-10-05", dateAr: "٥ أكتوبر", status: "win" },
  { id: 17, instrument: "XAUUSD", instrumentAr: "ذهب", side: "sell", sideAr: "بيع", entry: 2672, exit: 2665, pnl: 280, rMultiple: 1, date: "2026-10-06", dateAr: "٦ أكتوبر", status: "win" },
  { id: 18, instrument: "BTCUSD", instrumentAr: "بيتكوين", side: "buy", sideAr: "شراء", entry: 64400, exit: 65200, pnl: 400, rMultiple: 1.3, date: "2026-10-06", dateAr: "٦ أكتوبر", status: "win" },
];

export const equityCurveData = [
  { label: "Sep 28", labelAr: "٢٨ سبتمبر", value: 10000 },
  { label: "Sep 29", labelAr: "٢٩ سبتمبر", value: 10420 },
  { label: "Sep 30", labelAr: "٣٠ سبتمبر", value: 10640 },
  { label: "Oct 1", labelAr: "١ أكتوبر", value: 11350 },
  { label: "Oct 2", labelAr: "٢ أكتوبر", value: 11700 },
  { label: "Oct 3", labelAr: "٣ أكتوبر", value: 12560 },
  { label: "Oct 4", labelAr: "٤ أكتوبر", value: 12760 },
  { label: "Oct 5", labelAr: "٥ أكتوبر", value: 13510 },
  { label: "Oct 6", labelAr: "٦ أكتوبر", value: 14190 },
];

export const kpiData = {
  netProfit: { value: 4190, sub: "This month", subAr: "هذا الشهر" },
  winRate: { value: 72.2, sub: "of 18 trades", subAr: "من ١٨ صفقة" },
  profitFactor: { value: 3.14, sub: "Profit/Loss", subAr: "الأرباح/الخسائر" },
  avgR: { value: 1.05, sub: "Risk multiple", subAr: "متعدد المخاطرة" },
  maxDrawdown: { value: -5.8, sub: "Max drawdown", subAr: "أقصى تراجع" },
  totalTrades: { value: 18, sub: "Last 30 days", subAr: "آخر ٣٠ يوم" },
};

export const filterPeriods = [
  { value: "week", label: "Week", labelAr: "أسبوع" },
  { value: "month", label: "Month", labelAr: "شهر" },
  { value: "year", label: "Year", labelAr: "سنة" },
  { value: "all", label: "All", labelAr: "الكل" },
];

export const navItems = [
  { id: "dashboard", label: "Dashboard", labelAr: "الرئيسية", icon: "LayoutDashboard" },
  { id: "trades", label: "Trades", labelAr: "الصفقات", icon: "CandlestickChart" },
  { id: "analytics", label: "Analytics", labelAr: "التحليلات", icon: "BarChart3" },
  { id: "journal", label: "Journal", labelAr: "اليوميات", icon: "NotebookPen" },
  { id: "settings", label: "Settings", labelAr: "الإعدادات", icon: "Settings" },
];

export const mobileNavItems = [
  { id: "dashboard", label: "Dashboard", labelAr: "الرئيسية", icon: "LayoutDashboard" },
  { id: "trades", label: "Trades", labelAr: "الصفقات", icon: "CandlestickChart" },
  { id: "analytics", label: "Analytics", labelAr: "التحليلات", icon: "BarChart3" },
  { id: "settings", label: "Settings", labelAr: "الإعدادات", icon: "Settings" },
];
