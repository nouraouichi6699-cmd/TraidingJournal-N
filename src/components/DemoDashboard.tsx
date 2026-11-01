// Dev-only: the dashboard filled with invented trades under the name CLIENT, so the picture on the login screen can
// be taken without ever showing real data. Reached with ?demo=1 while `npm run dev` is running; main.tsx only pulls
// this module in then, so it is never part of a production build.
//
// It makes no Supabase call, starts no sync, and before anything renders it swaps localStorage for a Map that lives
// in memory. Whatever the dashboard stores while you are in here (its card layout, the sidebar width) goes nowhere
// near the real journal, and closing the tab leaves nothing behind. Take the picture in a private window anyway.
import { useEffect, useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import DashboardView from "./DashboardView";
import SizeCalc from "./SizeCalc";
import { Watermark } from "./Brand";
import { makeT } from "../i18n";
import { rng } from "../lib/chartAnalytics";
import type { Interests } from "../useInterests"; // a type, so this never imports the module itself
import type { Account, BalancePoint, Lang, Theme, Trade } from "../types";
import type { CashFlow } from "../lib/cashflow";

function sandboxStorage() {
  const map = new Map<string, string>();
  const mem: Storage = {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
  try {
    Object.defineProperty(window, "localStorage", { configurable: true, value: mem });
  } catch {
    // Some browser refuses to let it be replaced: a private window still keeps this apart from the real data.
  }
}
sandboxStorage();

const SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "US30", "NAS100", "USDJPY", "BTCUSD"];
const DAY = 86400e3;

function demoData(seed = 7) {
  const r = rng(seed);
  const now = Date.now();
  const accounts: Account[] = [
    { id: "d1", platform: "mt5", name: "Prop · 100K", currency: "USD", startBalance: 100000, createdAt: now - 180 * DAY },
    { id: "d2", platform: "tradingview", name: "Personal", currency: "USD", startBalance: 25000, createdAt: now - 120 * DAY },
  ];

  const trades: Trade[] = [];
  const balances: Record<string, BalancePoint[]> = {};
  for (const a of accounts) {
    let equity = a.startBalance;
    const points: BalancePoint[] = [];
    const n = 140 + Math.floor(r() * 60);
    for (let i = 0; i < n; i++) {
      const t0 = now - (n - i) * (DAY / 2.4) - r() * DAY * 0.3;
      const win = r() < 0.57;
      const risk = equity * (0.004 + r() * 0.009);
      const pnl = Math.round((win ? risk * (1.1 + r() * 1.7) : -risk * (0.6 + r() * 0.7)) * 100) / 100;
      const side = r() < 0.55 ? "long" : "short";
      const entry = 100 + r() * 2300;
      const qty = Math.round((0.1 + r() * 1.8) * 100) / 100;
      equity += pnl;
      trades.push({
        key: `${a.id}-${i}`, accountId: a.id, no: i + 1,
        symbol: SYMBOLS[Math.floor(r() * SYMBOLS.length)], side, qty,
        entryTime: new Date(t0).toISOString().slice(0, 19).replace("T", " "),
        entryPrice: Math.round(entry * 100) / 100,
        exitTime: new Date(t0 + (0.4 + r() * 6) * 3600e3).toISOString().slice(0, 19).replace("T", " "),
        exitPrice: Math.round((entry + (side === "long" ? 1 : -1) * (pnl / Math.max(qty, 0.1)) * 0.01) * 100) / 100,
        pnl, returnPct: Math.round((pnl / equity) * 10000) / 100,
        commission: Math.round(r() * 7 * 100) / 100,
        status: "closed",
      });
      points.push({ t: new Date(t0).toISOString().slice(0, 10), balance: Math.round(equity * 100) / 100 });
    }
    balances[a.id] = points;
  }

  const flows: CashFlow[] = [
    { id: "f1", accountId: "d1", t: new Date(now - 90 * DAY).toISOString().slice(0, 10), type: "deposit", amount: 10000 },
    { id: "f2", accountId: "d2", t: new Date(now - 40 * DAY).toISOString().slice(0, 10), type: "withdrawal", amount: 2500 },
  ];

  return { accounts, trades, balances, flows };
}

// Nothing in here is followed, so the bell is simply quiet.
const noInterests = {
  keys: [], lead: 30, notices: [], unread: 0,
  has: () => false, toggle: () => { }, markRead: () => { }, markAllRead: () => { }, setLead: () => { },
} as unknown as Interests;

export default function DemoDashboard() {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("dark");
  const [{ accounts, trades, balances, flows }] = useState(() => demoData());
  const t = makeT(lang);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  }, [theme, lang]);

  const nothing = () => { };
  return (
    <div className="min-h-screen bg-bg text-text">
      <Header
        lang={lang} t={t} theme={theme} name="CLIENT" avatar={null} onLang={setLang} onTheme={setTheme}
        onProfile={nothing} onSettings={nothing} onNews={nothing} onCalendar={nothing} onDashboard={nothing} onCharts={nothing}
        interests={noInterests}
        calc={<SizeCalc lang={lang} accounts={accounts} trades={trades} balances={balances} flows={flows} />}
      />
      <div className="flex">
        <Sidebar t={t} lang={lang} view="dashboard" onView={nothing} />
        <main className="min-w-0 flex-1 p-4">
          <DashboardView t={t} lang={lang} accounts={accounts} trades={trades} flows={flows} />
        </main>
      </div>
      <Watermark feedback={t("feedback")} />
    </div>
  );
}
