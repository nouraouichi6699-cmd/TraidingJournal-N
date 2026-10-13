import { useEffect, useRef, useState } from "react";
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
    timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const hour = Number(g("hour"));
  return { text: `${g("hour")}:${g("minute")}`, hour, weekday: g("weekday"), secOfDay: hour * 3600 + Number(g("minute")) * 60 + Number(g("second")) };
}

const SOON = 15 * 60; // glow + countdown during the last quarter hour before an open

export default function Sessions({ t }: { t: (k: Key) => string }) {
  const [now, setNow] = useState(() => new Date());
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!pinned) return;
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setPinned(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [pinned]);

  const rows = zones.map((z) => {
    const c = clock(z.tz, now);
    const trading = c.weekday !== "Sat" && c.weekday !== "Sun";
    const open = trading && c.hour >= z.open[0] && c.hour < z.open[1];
    const until = z.open[0] * 3600 - c.secOfDay;
    const soon = trading && until > 0 && until <= SOON ? until : null;
    return { z, c, open, soon, name: t(z.key) };
  });
  const openRows = rows.filter((r) => r.open);
  const soonRow = rows.filter((r) => r.soon != null).sort((a, b) => a.soon! - b.soon!)[0];
  const showAll = pinned || hover;
  const mmss = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

  const chip = (r: (typeof rows)[number]) => (
    <div key={r.z.key} className="flex items-center gap-1.5">
      <img src={r.z.flag} alt="" className="h-3.5 w-5 rounded-[2px] object-cover" />
      <span className="text-sm font-semibold">{r.name}</span>
      <span className="tnum text-sm font-semibold text-icon">{r.c.text}</span>
    </div>
  );

  return (
    <div ref={box} className="relative" dir="ltr" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        aria-expanded={showAll}
        aria-label={t("sessAll")}
        onClick={() => setPinned(!pinned)}
        className={`flex items-center gap-3 rounded-xl border bg-surface px-3 py-1.5 ${
          soonRow ? "sess-soon border-icon" : openRows.length ? "border-icon" : "border-border"
        }`}
      >
        <Clock size={18} strokeWidth={1.9} className="shrink-0 text-icon" aria-hidden />
        {soonRow ? (
          <div className="flex items-center gap-2">
            <img src={soonRow.z.flag} alt="" className="h-3.5 w-5 rounded-[2px] object-cover" />
            <span className="text-sm font-bold text-icon">{t("sessSoon").replace("{n}", soonRow.name)}</span>
            <span className="tnum text-sm font-bold">{mmss(soonRow.soon!)}</span>
          </div>
        ) : openRows.length ? (
          openRows.map(chip)
        ) : (
          <span className="text-sm text-muted">{t("sessNone")}</span>
        )}
      </button>

      {showAll && (
        <div className="absolute start-0 top-full z-50 mt-2 w-72 rounded-xl border border-icon/40 bg-surface p-2 shadow-xl">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold text-muted">{t("sessAll")}</p>
          {rows.map((r) => (
            <div key={r.z.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
              <img src={r.z.flag} alt="" className="h-3.5 w-5 rounded-[2px] object-cover" />
              <span className="flex-1 font-medium">{r.name}</span>
              <span className="tnum font-semibold">{r.c.text}</span>
              <span className={`w-16 text-end text-xs ${r.open ? "font-bold text-icon" : r.soon != null ? "text-icon" : "text-muted"}`}>
                {r.open ? t("sessOpenShort") : r.soon != null ? mmss(r.soon) : t("sessClosedShort")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
