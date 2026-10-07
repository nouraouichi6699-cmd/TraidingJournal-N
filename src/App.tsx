import { useState, useEffect } from "react";
import { TrendingUp, Bell, Search } from "lucide-react";
import type { Theme, Lang } from "./types";
import ThemeToggle from "./components/ThemeToggle";
import LangSwitcher from "./components/LangSwitcher";
import TopNav from "./components/TopNav";
import MobileTabBar from "./components/MobileTabBar";
import KpiRow from "./components/KpiRow";
import EquityChart from "./components/EquityChart";
import Filters from "./components/Filters";
import TradesTable from "./components/TradesTable";

export default function App() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [lang, setLang] = useState<Lang>("ar");
  const [activeNav, setActiveNav] = useState("dashboard");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  }, [lang]);

  useEffect(() => {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
    }
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav active={activeNav} onSelect={setActiveNav} />

      <main
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8"
        style={{
          paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
        }}
      >
        <div className="mobile-only mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background: "linear-gradient(135deg, var(--primary), var(--primary-2))",
              }}
            >
              <TrendingUp size={22} className="text-white" />
            </div>
            <span className="font-heading font-bold" style={{ fontSize: "18px" }}>
              تحليلات التداول
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="الإشعارات"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-muted"
            >
              <Bell size={20} />
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-heading" style={{ fontSize: "30px", fontWeight: "700", lineHeight: "1.3" }}>
                {lang === "ar" ? "نظرة عامة على الأداء" : "Performance Overview"}
              </h1>
              <p className="mt-1 text-small text-muted" style={{ fontSize: "14px" }}>
                {lang === "ar"
                  ? "تحليل أداء التداول لشهر أكتوبر ٢٠٢٦"
                  : "Trading performance analysis for October 2026"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                aria-label="بحث"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:text-text"
              >
                <Search size={20} />
              </button>
              <LangSwitcher lang={lang} onChange={setLang} />
              <ThemeToggle theme={theme} onChange={setTheme} />
            </div>
          </div>

          <Filters />
        </div>

        <div className="mb-6">
          <KpiRow />
        </div>

        <div className="mb-6">
          <EquityChart />
        </div>

        <div className="mb-6">
          <TradesTable />
        </div>
      </main>

      <MobileTabBar active={activeNav} onSelect={setActiveNav} />
    </div>
  );
}
