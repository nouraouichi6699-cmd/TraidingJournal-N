// Which trading sessions are open right now. The hours below are local to each exchange and are read through Intl
// time zones, so daylight saving is handled for us wherever the viewer happens to be. The week follows New York,
// where it closes on Friday afternoon and opens again on Sunday afternoon.

export type SessionKey = "sessLN" | "sessNY" | "sessTK" | "sessSY";

const NY = "America/New_York";

const HOURS: Record<SessionKey, { zone: string; from: number; to: number }> = {
  sessLN: { zone: "Europe/London", from: 8, to: 17 },
  sessNY: { zone: NY, from: 8, to: 17 },
  sessTK: { zone: "Asia/Tokyo", from: 9, to: 18 },
  sessSY: { zone: "Australia/Sydney", from: 7, to: 16 },
};

const KEYS = Object.keys(HOURS) as SessionKey[];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// One formatter per zone, kept between calls: building them is by far the most expensive part of this.
const formatters = new Map<string, Intl.DateTimeFormat>();

const localIn = (zone: string, at: Date) => {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", hour12: false });
    formatters.set(zone, f);
  }
  const parts = f.formatToParts(at);
  const of = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Some engines write midnight as hour 24.
  return { hour: Number(of("hour")) % 24, day: DAYS.indexOf(of("weekday")) };
};

export interface MarketNow {
  /** The sessions whose hours are running, in the order of HOURS; empty on the weekend and between sessions. */
  open: SessionKey[];
  /** True over the weekend, when no session opens at all. */
  closed: boolean;
  /** The current UTC time as HH:MM, which is what the chip calls GMT. */
  gmt: string;
}

export function marketNow(at: Date = new Date()): MarketNow {
  const ny = localIn(NY, at);
  // Friday 17:00 to Sunday 17:00 in New York: the weekend.
  const closed = ny.day === 6 || (ny.day === 5 && ny.hour >= 17) || (ny.day === 0 && ny.hour < 17);
  const open = closed
    ? []
    : KEYS.filter((k) => {
      const { zone, from, to } = HOURS[k];
      const hour = zone === NY ? ny.hour : localIn(zone, at).hour;
      return hour >= from && hour < to;
    });
  const pad = (n: number) => String(n).padStart(2, "0");
  return { open, closed, gmt: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}` };
}
