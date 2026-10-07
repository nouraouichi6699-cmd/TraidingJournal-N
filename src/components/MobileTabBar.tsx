import {
  LayoutDashboard,
  CandlestickChart,
  BarChart3,
  Settings,
} from "lucide-react";
import { mobileNavItems } from "../data";
import type { Lang } from "../types";

const iconMap: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  CandlestickChart,
  BarChart3,
  Settings,
};

interface Props {
  active: string;
  onSelect: (id: string) => void;
  lang: Lang;
}

export default function MobileTabBar({ active, onSelect, lang }: Props) {
  return (
    <nav
      className="mobile-only fixed bottom-0 inset-x-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md"
      aria-label={lang === "ar" ? "شريط التنقل السفلي" : "Bottom navigation"}
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="flex items-stretch justify-around">
        {mobileNavItems.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive = active === item.id;
          const label = lang === "ar" ? item.labelAr : item.label;
          return (
            <li key={item.id} className="flex-1">
              <button
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
                className={`flex w-full flex-col items-center gap-1 pt-2.5 pb-1.5 transition-colors ${
                  isActive ? "text-primary" : "text-muted"
                }`}
                style={{ minHeight: "56px" }}
              >
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  fill={isActive ? "currentColor" : "none"}
                />
                <span className="font-medium" style={{ fontSize: "11px" }}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
