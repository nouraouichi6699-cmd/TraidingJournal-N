import { Moon, Sun, BookOpen } from "lucide-react";
import type { Theme } from "../types";

interface Props {
  theme: Theme;
  onChange: (t: Theme) => void;
}

const themes: { value: Theme; label: string; icon: typeof Moon }[] = [
  { value: "dark", label: "إميرالد", icon: Moon },
  { value: "light", label: "نعناع", icon: Sun },
  { value: "cream", label: "ورقي", icon: BookOpen },
];

export default function ThemeToggle({ theme, onChange }: Props) {
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
      role="radiogroup"
      aria-label="تبديل المظهر"
    >
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={`المظهر: ${label}`}
          onClick={() => onChange(value)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-small transition-colors ${
            theme === value
              ? "bg-primary text-white"
              : "text-muted hover:bg-bg"
          }`}
          style={{ minHeight: "36px", minWidth: "36px" }}
        >
          <Icon size={16} className={theme === value ? "text-white" : "text-muted"} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
