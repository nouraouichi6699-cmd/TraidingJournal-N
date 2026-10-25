// Building blocks shared by the Profile and Advisor pages: a section heading with its tone (icon tile, title, one line
// of help) and an accessible on/off switch coloured by the tone around it.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type Tone = "gold" | "sky" | "rose" | "amber" | "violet" | "emerald" | "indigo" | "slate" | "red";

export function SectionHead({ tone, icon: Icon, title, sub, aside }: { tone: Tone; icon: LucideIcon; title: string; sub?: string; aside?: ReactNode }) {
  return (
    <div className={`tone-${tone} flex flex-wrap items-start gap-3.5`}>
      <span className="tone-tile h-11 w-11 rounded-xl"><Icon size={20} strokeWidth={2} /></span>
      <div className="min-w-0 flex-1">
        <h2 className="font-heading text-lg font-semibold leading-snug">{title}</h2>
        {sub && <p className="mt-0.5 text-sm leading-relaxed text-muted">{sub}</p>}
      </div>
      {aside && <div className="basis-full sm:basis-auto">{aside}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className="switch" />;
}
