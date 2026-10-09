import { useState, useEffect } from "react";
import { Bell, Search } from "lucide-react";
import type { Theme, Lang } from "./types";
import ThemeToggle from "./components/ThemeToggle";
import LangSwitcher from "./components/LangSwitcher";
import Brand, { ByLine } from "./components/Brand";
import TopNav from "./components/TopNav";
import MobileTabBar from "./components/MobileTabBar";
import KpiRow from "./components/KpiRow";
import EquityChart from "./components/EquityChart";
import Filters from "./components/Filters";
import TradesTable from "./components/TradesTable";

export default function App() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [lang, setLang] = useState<Lang>("en");
  const [activeNav, setActiveNav] = useState("dashboard");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  }, [lang]);

  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav active={activeNav} onSelect={setActiveNav} lang={lang} />

      <main
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8"
        style={{
          paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
        }}
      >
        <div className="mobile-only mb-6 flex items-center justify-between gap-3">
          <Brand size="sm" />
          <div className="flex items-center gap-3">
            <ByLine />
            <button
              aria-label={t("Notifications", "الإشعارات")}
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
                {t("Performance Overview", "نظرة عامة على الأداء")}
              </h1>
              <p className="mt-1 text-small text-muted" style={{ fontSize: "14px" }}>
                {t("Trading performance analysis for October 2026", "تحليل أداء التداول لشهر أكتوبر ٢٠٢٦")}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                aria-label={t("Search", "بحث")}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:text-text"
              >
                <Search size={20} />
              </button>
              <LangSwitcher lang={lang} onChange={setLang} />
              <ThemeToggle theme={theme} onChange={setTheme} lang={lang} />
            </div>
          </div>

          <Filters lang={lang} />
        </div>

        <div className="mb-6">
          <KpiRow lang={lang} />
        </div>

        <div className="mb-6">
          <EquityChart lang={lang} />
        </div>

        <div className="mb-6">
          <TradesTable lang={lang} />
        </div>
      </main>

      <MobileTabBar active={activeNav} onSelect={setActiveNav} lang={lang} />
    </div>
  );
}
