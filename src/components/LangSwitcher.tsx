import { Languages } from "lucide-react";
import type { Lang } from "../types";

interface Props {
  lang: Lang;
  onChange: (l: Lang) => void;
}

export default function LangSwitcher({ lang, onChange }: Props) {
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
      role="radiogroup"
      aria-label="تبديل اللغة"
    >
      <button
        role="radio"
        aria-checked={lang === "ar"}
        aria-label="العربية"
        onClick={() => onChange("ar")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-small transition-colors ${
          lang === "ar" ? "bg-primary text-white" : "text-muted hover:bg-bg"
        }`}
        style={{ minHeight: "36px", minWidth: "36px" }}
      >
        <Languages size={16} />
        <span>ع</span>
      </button>
      <button
        role="radio"
        aria-checked={lang === "en"}
        aria-label="English"
        onClick={() => onChange("en")}
        className={`rounded-lg px-3 py-2 text-small transition-colors ${
          lang === "en" ? "bg-primary text-white" : "text-muted hover:bg-bg"
        }`}
        style={{ minHeight: "36px", minWidth: "36px" }}
      >
        EN
      </button>
    </div>
  );
}
