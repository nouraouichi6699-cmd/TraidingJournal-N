import { useState } from "react";
import { setSettings, useSettings } from "../useSettings";
import type { EconImpact } from "../lib/econEvents";
import type { Lang } from "../types";

type L = Record<Lang, string>;
const TR = (en: string, ar: string, fr: string): L => ({ en, ar, fr });

// Shared with the dashboard calendar: both read/write settings.econImpacts and settings.econCurrencies,
// so toggling a chip here or there changes both views.
export const CAL_IMPACTS: EconImpact[] = ["high", "medium", "low"];
export const CAL_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY"];

export function EconFilterChips({ lang, extra }: { lang: Lang; extra?: React.ReactNode }) {
  const settings = useSettings();
  const [showCurPicker, setShowCurPicker] = useState(false);
  const impLabel: Record<EconImpact, string> = { high: TR("H", "م", "H")[lang], medium: TR("M", "و", "M")[lang], low: TR("L", "م", "F")[lang] };

  const toggleImpact = (imp: EconImpact) => {
    const cur = settings.econImpacts;
    setSettings({ econImpacts: cur.includes(imp) ? cur.filter((i) => i !== imp) : [...cur, imp] });
  };
  const toggleCurrency = (cur: string) => {
    const list = settings.econCurrencies;
    setSettings({ econCurrencies: list.includes(cur) ? list.filter((c) => c !== cur) : [...list, cur] });
  };

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1" role="group" aria-label={TR("Economic event filters", "فلاتر الأحداث الاقتصادية", "Filtres événements économiques")[lang]}>
      {CAL_IMPACTS.map((imp) => {
        const on = settings.econImpacts.includes(imp);
        return (
          <button
            key={imp}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleImpact(imp)}
            aria-pressed={on}
            className="rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase transition"
            style={{
              borderColor: on ? `var(--impact-${imp})` : "var(--border)",
              color: on ? "#0a1a3f" : "var(--muted)",
              background: on ? `var(--impact-${imp})` : "transparent",
              boxShadow: on ? `0 0 0 1px var(--impact-${imp})` : "none",
            }}
          >
            {impLabel[imp]}
          </button>
        );
      })}
      <div className="relative">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowCurPicker((v) => !v)}
          aria-expanded={showCurPicker}
          aria-label={TR("Currency filter", "فلتر العملات", "Filtre devises")[lang]}
          className="rounded-full border border-border px-1.5 py-0.5 text-[9px] font-semibold text-muted transition hover:text-text"
        >
          {settings.econCurrencies.length === CAL_CURRENCIES.length
            ? TR("All cur.", "كل العملات", "Toutes")[lang]
            : `${settings.econCurrencies.length} cur.`}
        </button>
        {showCurPicker && (
          <div
            className="absolute start-0 top-full z-50 mt-1 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-2 shadow-xl"
            style={{ minWidth: "160px" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {CAL_CURRENCIES.map((cur) => {
              const on = settings.econCurrencies.includes(cur);
              return (
                <button
                  key={cur}
                  type="button"
                  onClick={() => toggleCurrency(cur)}
                  aria-pressed={on}
                  className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold transition"
                  style={{
                    borderColor: on ? "var(--icon)" : "var(--border)",
                    color: on ? "var(--icon)" : "var(--muted)",
                    background: on ? "var(--primary-tint)" : "transparent",
                  }}
                >
                  {cur}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {extra}
    </div>
  );
}
