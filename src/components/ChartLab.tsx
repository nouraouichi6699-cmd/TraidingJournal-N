import { useState } from "react";
import type { HeatCell, WhatIfRules } from "../lib/tradeLab";
import { fmt } from "../lib/stats";
import { currencySuffix, ltrNumbers } from "../lib/money";
import type { Key } from "../i18n";

const GREEN = "#22c55e", RED = "#f87171";
const SESSIONS = ["sessTK", "sessLN", "sessNY", "sessSY"] as const;

/** Rules of the What-if analysis (all optional; an empty rule set replays the real trades). */
export function WhatIfPanel({ rules, onChange, symbols, t, weekdays, currency }: { rules: WhatIfRules; onChange: (r: WhatIfRules) => void; symbols: string[]; t: (k: Key) => string; weekdays: string[]; currency: string | null }) {
  const set = (p: Partial<WhatIfRules>) => onChange({ ...rules, ...p });
  const flip = <T,>(arr: T[] | undefined, v: T) => ((arr ?? []).includes(v) ? (arr ?? []).filter((x) => x !== v) : [...(arr ?? []), v]);
  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${on ? "border-[var(--loss,#f87171)] bg-[color-mix(in_srgb,#f87171_16%,transparent)] text-[#f87171] line-through" : "border-border hover:border-icon"}`;
  const head = "mb-1.5 text-xs font-semibold text-muted";
  const select = "field !w-auto !py-1 text-sm";
  return (
    <div className="flex flex-col gap-3 p-1.5 text-sm">
      <div>
        <p className={head}>{t("chSkipDays")}</p>
        <div className="flex flex-wrap gap-1.5">{weekdays.map((d, i) => <button key={i} type="button" aria-pressed={rules.weekdays?.includes(i) ?? false} onClick={() => set({ weekdays: flip(rules.weekdays, i) })} className={chip(rules.weekdays?.includes(i) ?? false)}>{d}</button>)}</div>
      </div>
      <div>
        <p className={head}>{t("chSkipSessions")}</p>
        <div className="flex flex-wrap gap-1.5">{SESSIONS.map((s) => <button key={s} type="button" aria-pressed={rules.sessions?.includes(s) ?? false} onClick={() => set({ sessions: flip(rules.sessions, s) })} className={chip(rules.sessions?.includes(s) ?? false)}>{t(s as Key)}</button>)}</div>
      </div>
      {symbols.length > 1 && (
        <div>
          <p className={head}>{t("chSkipSymbols")}</p>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto" dir="ltr">{symbols.map((s) => <button key={s} type="button" aria-pressed={rules.symbols?.includes(s) ?? false} onClick={() => set({ symbols: flip(rules.symbols, s) })} className={chip(rules.symbols?.includes(s) ?? false)}>{s.replace(/^[^:]+:/, "")}</button>)}</div>
        </div>
      )}
      <label className="flex items-center justify-between gap-3">
        <span>{t("chDirection")}</span>
        <select className={select} value={rules.side ?? ""} onChange={(e) => set({ side: (e.target.value || null) as WhatIfRules["side"] })}>
          <option value="">{t("chBoth")}</option><option value="long">{t("long")}</option><option value="short">{t("short")}</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>{t("chMaxPerDay")}</span>
        <select className={select} value={rules.maxPerDay ?? 0} onChange={(e) => set({ maxPerDay: Number(e.target.value) })}>
          {[0, 1, 2, 3, 5].map((n) => <option key={n} value={n}>{n ? n : t("chOff")}</option>)}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>{t("chStopAfter")}</span>
        <select className={select} value={rules.stopAfterLosses ?? 0} onChange={(e) => set({ stopAfterLosses: Number(e.target.value) })}>
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n ? n : t("chOff")}</option>)}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>{t("chCapLoss")}</span>
        <span className="flex items-center gap-1" dir="ltr">
          <input type="number" min={0} step={10} value={rules.maxLoss ?? 0} onChange={(e) => set({ maxLoss: Math.max(0, Number(e.target.value) || 0) })} className="field !w-24 !py-1 text-end tnum" aria-label={t("chCapLoss")} />
          <span className="text-muted">{currencySuffix(currency).trim() || "$"}</span>
        </span>
      </label>
      <button type="button" onClick={() => onChange({})} className="self-end rounded-lg border border-border px-3 py-1 text-xs font-semibold hover:border-icon">{t("chReset")}</button>
    </div>
  );
}

/** Weekday x hour grid of closed trades (entry time). Colour: P&L (green / red), win rate (above / below 50%) or activity. */
export function Heatmap({ cells, mode, money, weekdays, t, rtl }: { cells: HeatCell[][]; mode: "net" | "win" | "n"; money: (n: number) => string; weekdays: string[]; t: (k: Key) => string; rtl?: boolean }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const flat = cells.flat();
  const maxAbs = Math.max(1e-9, ...flat.map((c) => Math.abs(c.net)));
  const maxN = Math.max(1, ...flat.map((c) => c.n));
  const bg = (c: HeatCell) => {
    if (!c.n) return "color-mix(in srgb, var(--text) 4%, transparent)";
    if (mode === "n") return `color-mix(in srgb, var(--icon) ${Math.round((0.12 + 0.88 * (c.n / maxN)) * 100)}%, transparent)`;
    const pos = mode === "net" ? c.net >= 0 : c.wins / c.n >= 0.5;
    const k = mode === "net" ? Math.sqrt(Math.min(1, Math.abs(c.net) / maxAbs)) : Math.min(1, Math.abs(c.wins / c.n - 0.5) * 2);
    return `color-mix(in srgb, ${pos ? GREEN : RED} ${Math.round((0.15 + 0.85 * k) * 100)}%, transparent)`;
  };
  const info = (d: number, h: number) => {
    const c = cells[d][h];
    const s = `${weekdays[d]} ${String(h).padStart(2, "0")}h · ${c.n} ${t("monthTrades")}${c.n ? ` · ${money(c.net)} · ${t("chHeatWin")} ${fmt((c.wins / c.n) * 100, 0)}%` : ""}`;
    return rtl ? ltrNumbers(s) : s;
  };
  return (
    <div dir="ltr">
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[640px] gap-[3px]" style={{ gridTemplateColumns: "44px repeat(24, minmax(0, 1fr))" }} onMouseLeave={() => setHover(null)}>
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[10px] text-muted tnum">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
          {cells.map((row, d) => [
            <span key={`l${d}`} className="flex items-center text-xs font-semibold text-muted">{weekdays[d]}</span>,
            ...row.map((c, h) => (
              <div key={`${d}-${h}`} role="img" aria-label={info(d, h)} title={info(d, h)} onMouseEnter={() => setHover({ d, h })}
                className="h-8 rounded-md transition-transform hover:scale-110 sm:h-9" style={{ background: bg(c), outline: hover?.d === d && hover?.h === h ? "2px solid var(--text)" : undefined }} />
            )),
          ])}
        </div>
      </div>
      <p className="mt-2 h-4 text-xs text-muted tnum" dir={rtl ? "rtl" : undefined} aria-live="polite">{hover ? info(hover.d, hover.h) : t("chHeatHint")}</p>
    </div>
  );
}
