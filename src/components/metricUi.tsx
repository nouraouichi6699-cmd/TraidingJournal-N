// Shared presentational pieces for the Reports metric tabs (Overview, Trade outcomes).
import type { ReactNode } from "react";
import { AlertTriangle, Info, LayoutGrid, List } from "lucide-react";

export type View = "grid" | "list";
export interface Item { id: string; label: string; tip: string; reason?: string; value: string; color?: string; bar?: number | null }

export const cardBg = { background: "var(--gauge-bg)" };

export function Tip({ id, label, tip, reason }: { id: string; label: string; tip: string; reason?: string }) {
  const tid = `tip-${id}`;
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={label} aria-describedby={tid} className="inline-flex rounded outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]">
        {reason ? <AlertTriangle size={12} className="text-primary" /> : <Info size={12} className="text-muted" />}
      </button>
      <span id={tid} role="tooltip" className="pointer-events-none absolute start-0 top-full z-20 mt-1 hidden w-56 rounded-lg border border-border bg-surface p-2 text-[11px] font-normal leading-snug text-text shadow-xl group-focus-within:block group-hover:block">
        {tip}{reason && <span className="mt-1 block text-primary">{reason}</span>}
      </span>
    </span>
  );
}

export function ViewHeader({ title, sub, badge, view, onView, gridLabel, listLabel }: { title: string; sub: string; badge: string; view: View; onView: (v: View) => void; gridLabel: string; listLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-heading text-xl font-bold text-primary">{title}</h2>
        <p className="text-sm text-muted">{sub}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-border bg-primary-tint px-3 py-1 text-xs font-semibold text-primary">{badge}</span>
        <div className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1">
          {([["grid", <LayoutGrid size={15} key="g" />, gridLabel], ["list", <List size={15} key="l" />, listLabel]] as const).map(([k, ic, lb]) => (
            <button key={k} title={lb} aria-label={lb} aria-pressed={view === k} onClick={() => onView(k)} className={`rounded-lg p-1.5 transition ${view === k ? "bg-primary-tint text-primary" : "text-muted hover:text-text"}`}>{ic}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MetricSection({ icon, title, subtitle, view, items, top }: { icon: ReactNode; title: string; subtitle: string; view: View; items: Item[]; top?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border p-5" style={cardBg}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-tint text-primary">{icon}</span>
        <div><div className="font-heading text-sm font-semibold text-primary">{title}</div><div className="text-xs text-muted">{subtitle}</div></div>
      </div>
      {top && <div className="mb-4">{top}</div>}
      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((m) => (
            <div key={m.id} className="rounded-xl border border-border p-3 transition hover:-translate-y-0.5 hover:border-[var(--primary)]" style={{ background: "color-mix(in srgb, var(--text) 4%, transparent)" }}>
              <div className="flex items-center gap-1.5 text-xs text-muted"><span className="truncate">{m.label}</span><Tip id={m.id} label={m.label} tip={m.tip} reason={m.reason} /></div>
              <div className="tnum mt-1.5 text-xl font-bold" style={{ color: m.color }}><span dir="ltr">{m.value}</span></div>
              {m.bar != null && (
                <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--gauge-track)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, m.bar))}%`, background: "var(--gauge-arc)" }} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 text-muted">{m.label}<Tip id={m.id} label={m.label} tip={m.tip} reason={m.reason} /></span>
              <span dir="ltr" className="tnum font-semibold" style={{ color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
