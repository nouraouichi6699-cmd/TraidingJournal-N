import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, keyToDate } from "../lib/calendar";
import type { Lang } from "../types";

interface Props { lang: Lang; value: { from: string; to: string }; today: string; onChange: (v: { from: string; to: string }) => void; onClose: () => void; labels: { cancel: string; apply: string } }

/** Month grid; first click sets the start, second click the end (single day = click the same day twice). */
export default function RangePicker({ lang, value, today, onChange, onClose, labels }: Props) {
  const [month, setMonth] = useState(value.from.slice(0, 7));
  const [from, setFrom] = useState<string | null>(value.from);
  const [to, setTo] = useState<string | null>(value.to);
  const first = `${month}-01`;
  const lead = (keyToDate(first).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const title = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(keyToDate(first));
  const wd = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: "narrow", timeZone: "UTC" }).format(keyToDate(addDays("2026-10-05", i))));
  const step = (n: number) => { const d = keyToDate(first); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };

  const pick = (k: string) => {
    if (from && !to) {
      if (k < from) { setTo(from); setFrom(k); } else setTo(k);
    } else { setFrom(k); setTo(null); }
  };
  const inRange = (k: string) => from !== null && to !== null && k >= from && k <= to;

  return (
    <div className="absolute end-0 top-full z-30 mt-2 w-[280px] rounded-2xl border border-border bg-surface p-3 shadow-2xl" role="dialog">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="icon-btn !h-8 !w-8 directional-icon" onClick={() => step(-1)} aria-label="previous month"><ChevronLeft size={16} className="text-icon" /></button>
        <span className="text-sm font-semibold capitalize">{title}</span>
        <button type="button" className="icon-btn !h-8 !w-8 directional-icon" onClick={() => step(1)} aria-label="next month"><ChevronRight size={16} className="text-icon" /></button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {wd.map((w, i) => <span key={i} className="py-1 text-muted">{w}</span>)}
        {cells.map((k, i) =>
          k ? (
            <button
              key={k} type="button" onClick={() => pick(k)}
              className={`mx-auto h-8 w-8 rounded-full text-sm tnum ${k === from || k === to ? "bg-primary font-bold text-on-primary" : inRange(k) ? "bg-primary-tint text-icon" : "hover:bg-primary-tint"} ${k === today && k !== from && k !== to ? "ring-1 ring-icon" : ""}`}
            >
              {+k.slice(8)}
            </button>
          ) : <span key={`e${i}`} />,
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm">{labels.cancel}</button>
        <button type="button" disabled={!from} onClick={() => { if (from) { onChange({ from, to: to ?? from }); onClose(); } }} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary disabled:opacity-50">{labels.apply}</button>
      </div>
    </div>
  );
}
