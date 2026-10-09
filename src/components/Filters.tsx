import { filterPeriods } from "../data";
import { useState } from "react";
import type { Lang } from "../types";

interface Props {
  lang: Lang;
}

export default function Filters({ lang }: Props) {
  const [period, setPeriod] = useState("month");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
        role="radiogroup"
        aria-label={lang === "ar" ? "الفترة الزمنية" : "Time period"}
      >
        {filterPeriods.map((p) => (
          <button
            key={p.value}
            role="radio"
            aria-checked={period === p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-lg px-4 py-2 text-small transition-all ${
              period === p.value
                ? "bg-primary text-on-primary font-semibold"
                : "text-muted hover:text-text hover:bg-bg"
            }`}
            style={{ minHeight: "36px", minWidth: "44px" }}
          >
            {lang === "ar" ? p.labelAr : p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
