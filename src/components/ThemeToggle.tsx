import { Moon, Sun, BookOpen } from "lucide-react";
import type { Theme, Lang } from "../types";

interface Props {
  theme: Theme;
  onChange: (t: Theme) => void;
  lang: Lang;
}

const themes: { value: Theme; label: string; labelAr: string; icon: typeof Moon }[] = [
  { value: "dark", label: "Emerald", labelAr: "إميرالد", icon: Moon },
  { value: "light", label: "Mint", labelAr: "نعناع", icon: Sun },
  { value: "cream", label: "Paper", labelAr: "ورقي", icon: BookOpen },
];

export default function ThemeToggle({ theme, onChange, lang }: Props) {
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
      role="radiogroup"
      aria-label={lang === "ar" ? "تبديل المظهر" : "Switch theme"}
    >
      {themes.map(({ value, label, labelAr, icon: Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={lang === "ar" ? `المظهر: ${labelAr}` : `Theme: ${label}`}
          onClick={() => onChange(value)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-small transition-colors ${
            theme === value
              ? "bg-primary text-white"
              : "text-muted hover:bg-bg"
          }`}
          style={{ minHeight: "36px", minWidth: "36px" }}
        >
          <Icon size={16} className={theme === value ? "text-white" : "text-muted"} />
          <span className="hidden sm:inline">{lang === "ar" ? labelAr : label}</span>
        </button>
      ))}
    </div>
  );
}
