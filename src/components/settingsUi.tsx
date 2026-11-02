// Building blocks of the Settings page: a glass tile, a row inside it, the lamp that every on/off setting uses, the
// pill group that every one-of-N choice uses, the three theme previews and the session ribbon. Kept apart from
// SettingsView so that page stays a list of sections rather than a wall of markup, the same way profileUi.tsx serves
// Profile. Nothing here knows what any setting means.
import { useRef, useState, type ReactNode } from "react";
import { Lightbulb } from "lucide-react";
import { SESSION_COLORS } from "../lib/sessionColors";
import type { SessionBounds } from "../lib/tradingTime";

/** The only colours in the page that are not theme variables; see lib/sessionColors.ts for why. */
const THEME_CARDS: { id: "dark" | "light" | "black"; bg: string; surface: string; primary: string }[] = [
  // Mirrors the three blocks in index.css. Kept here as literals because a preview has to show a theme's colours
  // while the page itself is wearing a different one, which rules out the variables.
  { id: "dark", bg: "#061126", surface: "#0b1c3d", primary: "#e6b84a" },
  { id: "light", bg: "#f3f5fa", surface: "#ffffff", primary: "#0a1f5c" },
  { id: "black", bg: "#000000", surface: "#0a0a0a", primary: "#f5b83d" },
];

export function Tile({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`mz-glass flex flex-col gap-4 rounded-3xl p-4 sm:p-5 ${wide ? "sm:col-span-full" : ""}`}>
      <h3 className="font-heading text-sm font-semibold leading-snug">{title}</h3>
      {children}
    </section>
  );
}

/** A setting inside a tile: what it is on the one side, the control on the other. */
export function Row({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <span className="min-w-0 flex-1 basis-40">
        <span className="block text-sm font-medium">{label}</span>
        {sub && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{sub}</span>}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** A line of explanation on its own, with no control. */
export function Note({ text, tip }: { text: string; tip?: boolean }) {
  return (
    <p
      className={`text-xs leading-relaxed ${tip ? "rounded-2xl px-3 py-2.5 text-text" : "text-muted"}`}
      style={tip ? { background: "var(--primary-tint)", border: "1px solid color-mix(in srgb, var(--primary) 28%, transparent)" } : undefined}
    >
      {text}
    </p>
  );
}

/** An on/off setting. Lit means the thing happens. */
export function Lamp({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const [rings, setRings] = useState(0);
  // Alternating the two class names is what makes the ring replay on every toggle.
  const ring = rings === 0 ? "" : rings % 2 ? "mz-ring-a" : "mz-ring-b";
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={() => { onChange(!on); setRings((n) => n + 1); }}
      className={`mz-lamp ${on ? "mz-lamp-on" : ""} ${ring} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-50`}
    >
      <Lightbulb size={20} strokeWidth={2} />
    </button>
  );
}

export interface PillOption<T extends string> { v: T; label: string }

/**
 * A one-of-N choice. It keeps the radio-group behaviour the old Choice had — one stop in the tab order, arrows to
 * move between the options — and follows the writing direction, so in Arabic the left arrow goes to the next pill.
 */
export function Pills<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: PillOption<T>[]; label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  const move = (from: number, step: number) => {
    const to = (from + step + options.length) % options.length;
    onChange(options[to].v);
    refs.current[to]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o, i) => {
        const here = value === o.v;
        return (
          <button
            key={o.v} type="button" role="radio" aria-checked={here} tabIndex={here ? 0 : -1}
            ref={(el) => { refs.current[i] = el; }}
            onClick={() => onChange(o.v)}
            onKeyDown={(e) => {
              const back = e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft");
              const fwd = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
              if (!back && !fwd) return;
              e.preventDefault();
              move(i, fwd ? 1 : -1);
            }}
            className={`min-h-[44px] rounded-full border px-3.5 text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${here ? "border-primary bg-primary font-bold text-on-primary" : "border-border font-medium text-text hover:bg-primary-tint"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The three themes as little pictures of themselves: page, sidebar, top bar, and a bar of the theme's own gold. */
export function ThemeCards({ value, onChange, label, names }: {
  value: string; onChange: (v: "dark" | "light" | "black") => void; label: string; names: Record<string, string>;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
      {THEME_CARDS.map((c) => {
        const here = value === c.id;
        return (
          <button
            key={c.id} type="button" role="radio" aria-checked={here} tabIndex={here ? 0 : -1}
            onClick={() => onChange(c.id)}
            className={`flex flex-col gap-2 rounded-2xl border p-2 text-start transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${here ? "border-primary" : "border-border hover:border-primary/50"}`}
            style={here ? { boxShadow: "0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent)" } : undefined}
          >
            <span aria-hidden="true" className="flex h-16 gap-1 overflow-hidden rounded-xl p-1.5" style={{ background: c.bg }} dir="ltr">
              <span className="w-1/4 rounded-md" style={{ background: c.surface }} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="h-2.5 rounded" style={{ background: c.surface }} />
                <span className="h-2 w-2/3 rounded" style={{ background: c.primary }} />
              </span>
            </span>
            <span className="truncate text-xs font-medium">{names[c.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The day as one 0-24 UTC bar, cut where the sessions hand over. Widths come straight from the boundaries. */
export function SessionRibbon({ bounds, names }: { bounds: SessionBounds; names: Record<string, string> }) {
  const parts: { key: keyof typeof SESSION_COLORS; from: number; to: number }[] = [
    { key: "sessTK", from: 0, to: bounds.tokyo },
    { key: "sessLN", from: bounds.tokyo, to: bounds.london },
    { key: "sessNY", from: bounds.london, to: bounds.newYork },
    { key: "sessSY", from: bounds.newYork, to: 24 },
  ];
  return (
    <div aria-hidden="true" dir="ltr" className="flex flex-col gap-1.5">
      <div className="flex h-9 overflow-hidden rounded-xl border border-border">
        {parts.map((p) => {
          const span = Math.max(0, p.to - p.from);
          if (!span) return null;
          return (
            <span
              key={p.key}
              className="grid place-items-center overflow-hidden whitespace-nowrap px-1 text-[11px] font-semibold"
              style={{ width: `${(span / 24) * 100}%`, background: SESSION_COLORS[p.key], color: "#101010" }}
            >
              {span >= 3 ? names[p.key] : ""}
            </span>
          );
        })}
      </div>
      <div className="tnum flex justify-between text-[10px] text-muted">
        {[0, 6, 12, 18, 24].map((h) => <span key={h}>{String(h).padStart(2, "0")}</span>)}
      </div>
    </div>
  );
}
