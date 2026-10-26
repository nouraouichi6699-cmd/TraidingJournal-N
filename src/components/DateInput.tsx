// A date field that reads day first (29/12/2026) whatever the browser's language: typed (the slashes come by themselves)
// or picked on the browser's calendar. The value stays "YYYY-MM-DD".
import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { dayFirst, parseDay, shape } from "../lib/dates";

export { dayFirst };

export default function DateInput({ value, onChange, min, max, className = "field", wrapClass = "", label, calendarLabel = "Calendar", required }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; className?: string; wrapClass?: string; label?: string; calendarLabel?: string; required?: boolean;
}) {
  const [text, setText] = useState(dayFirst(value));
  const pick = useRef<HTMLInputElement>(null);
  useEffect(() => setText(dayFirst(value)), [value]);
  const ok = (iso: string | null) => !!iso && (!min || iso >= min) && (!max || iso <= max);
  const type = (raw: string) => {
    const s = shape(raw), iso = parseDay(s);
    setText(s);
    if (ok(iso) && iso !== value) onChange(iso as string);
  };
  const open = () => {
    const el = pick.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  const wrong = text.length === 10 && !ok(parseDay(text)); // a full date that is not one (or out of range); none while typing
  return (
    <span className={`relative flex min-w-0 ${wrapClass}`}>
      <input type="text" inputMode="numeric" dir="ltr" placeholder="DD/MM/YYYY" aria-label={label} aria-invalid={wrong || undefined} required={required} value={text}
        onChange={(e) => type(e.target.value)} onBlur={() => { if (!ok(parseDay(text))) setText(dayFirst(value)); }}
        className={`${className} w-full min-w-0 pe-10 ${wrong ? "!border-[var(--loss)]" : ""}`} />
      <button type="button" aria-label={calendarLabel} title={calendarLabel} onClick={open} className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted hover:text-text"><CalendarDays size={16} /></button>
      <input ref={pick} type="date" value={value} min={min} max={max} tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.value && onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 end-0 h-px w-px opacity-0" />
    </span>
  );
}
