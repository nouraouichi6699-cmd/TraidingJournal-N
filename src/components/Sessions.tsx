import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import us from "flag-icons/flags/4x3/us.svg?url";
import gb from "flag-icons/flags/4x3/gb.svg?url";
import au from "flag-icons/flags/4x3/au.svg?url";
import jp from "flag-icons/flags/4x3/jp.svg?url";
import type { Key } from "../i18n";

// Open hours are local (Mon–Fri), approximate forex session hours.
const zones = [
  { key: "sessNY", tz: "America/New_York", flag: us, open: [8, 17] },
  { key: "sessLN", tz: "Europe/London", flag: gb, open: [8, 17] },
  { key: "sessSY", tz: "Australia/Sydney", flag: au, open: [7, 16] },
  { key: "sessTK", tz: "Asia/Tokyo", flag: jp, open: [9, 18] },
] as const;

function clock(tz: string, now: Date) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { text: `${g("hour")}:${g("minute")}`, hour: Number(g("hour")), weekday: g("weekday") };
}

export default function Sessions({ t }: { t: (k: Key) => string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-1.5" dir="ltr">
      <Clock size={18} strokeWidth={1.9} className="shrink-0 text-icon" aria-hidden />
      {zones.map((z) => {
        const c = clock(z.tz, now);
        const open = c.weekday !== "Sat" && c.weekday !== "Sun" && c.hour >= z.open[0] && c.hour < z.open[1];
        const name = t(z.key);
        return (
          <div
            key={z.key}
            className="flex items-center gap-1.5"
            title={`${name} · ${t(open ? "sessOpen" : "sessClosed")}`}
          >
            <img src={z.flag} alt={name} className="h-3.5 w-5 rounded-[2px] object-cover" />
            <span className="tnum text-sm font-semibold">{c.text}</span>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${open ? "bg-icon" : "bg-border"}`} />
          </div>
        );
      })}
    </div>
  );
}
