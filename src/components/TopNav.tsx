import {
  LayoutDashboard,
  CandlestickChart,
  BarChart3,
  NotebookPen,
  Settings,
  TrendingUp,
} from "lucide-react";
import { navItems } from "../data";

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
}

export default function TopNav({ active, onSelect }: Props) {
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
            تحليلات التداول
          </span>
        </div>

        <nav aria-label="القائمة الرئيسية">
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
                    <span>{item.label}</span>
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
