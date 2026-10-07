import {
  LayoutDashboard,
  CandlestickChart,
  BarChart3,
  Settings,
} from "lucide-react";
import { mobileNavItems } from "../data";

const iconMap: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  CandlestickChart,
  BarChart3,
  Settings,
};

interface Props {
  active: string;
  onSelect: (id: string) => void;
}

export default function MobileTabBar({ active, onSelect }: Props) {
  return (
    <nav
      className="mobile-only fixed bottom-0 inset-x-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md"
      aria-label="شريط التنقل السفلي"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="flex items-stretch justify-around">
        {mobileNavItems.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive = active === item.id;
          return (
            <li key={item.id} className="flex-1">
              <button
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
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
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
