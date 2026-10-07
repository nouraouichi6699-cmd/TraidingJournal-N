import {
  LayoutDashboard,
  CandlestickChart,
  BarChart3,
  NotebookPen,
  Settings,
  TrendingUp,
} from "lucide-react";
import { navItems } from "../data";
import type { Lang } from "../types";

const iconMap: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  CandlestickChart,
  BarChart3,
  NotebookPen,
  Settings,
};

interface Props {
  active: string;
  onSelect: (id: string) => void;
  lang: Lang;
}

export default function TopNav({ active, onSelect, lang }: Props) {
  return (
    <header
      className="desktop-only sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, var(--primary), var(--primary-2))",
            }}
          >
            <TrendingUp size={22} className="text-white" />
          </div>
          <span className="font-heading font-bold" style={{ fontSize: "20px" }}>
            {lang === "ar" ? "تحليلات التداول" : "Trading Analytics"}
          </span>
        </div>

        <nav aria-label={lang === "ar" ? "القائمة الرئيسية" : "Main navigation"}>
          <ul className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = iconMap[item.icon];
              const isActive = active === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onSelect(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-small transition-all ${
                      isActive
                        ? "bg-primary-tint text-primary font-semibold"
                        : "text-muted hover:text-text hover:bg-bg"
                    }`}
                    style={{ minHeight: "44px" }}
                  >
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 2.5 : 1.75}
                      fill={isActive ? "currentColor" : "none"}
                      className={isActive ? "text-primary" : ""}
                    />
                    <span>{lang === "ar" ? item.labelAr : item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
