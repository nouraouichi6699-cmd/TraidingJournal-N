import type { Trade } from "../types";

export interface Activity {
  trades: number;
  tradingDays: number;
  eligibleDays: number;
  freq: number;
  perDay: number;
  perWeek: number;
  perMonth: number;
  maxDay: number;
  weekday: number[]; // Mon..Sun counts
  hour: number[]; // 0..23
  topWeekday: number;
  topHour: number;
  vol: { total: number; avg: number; max: number };
  long: number;
  short: number;
  days: Record<string, number>;
  first: string;
  last: string;
}

const utc = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};

export function computeActivity(trades: Trade[]): Activity | null {
  const ts = trades.filter((t) => t.entryTime && t.entryTime.length >= 13);
  if (!ts.length) return null;
  const days: Record<string, number> = {};
  const weekday = Array(7).fill(0);
  const hour = Array(24).fill(0);
  let total = 0, max = 0, long = 0, short = 0;
  for (const t of ts) {
    const d = t.entryTime!.slice(0, 10);
    days[d] = (days[d] || 0) + 1;
    weekday[(new Date(utc(d)).getUTCDay() + 6) % 7]++;
    hour[Number(t.entryTime!.slice(11, 13))]++;
    total += t.qty || 0;
    max = Math.max(max, t.qty || 0);
    if (t.side === "long") long++; else short++;
  }
  const keys = Object.keys(days).sort();
  const first = keys[0], last = keys[keys.length - 1];
  const span = (utc(last) - utc(first)) / 864e5 + 1;
  let eligible = 0;
  for (let i = 0; i < span; i++) {
    const wd = new Date(utc(first) + i * 864e5).getUTCDay();
    if (wd !== 0 && wd !== 6) eligible++;
  }
  eligible = Math.max(eligible, keys.length);
  const n = ts.length;
  const top = (a: number[]) => a.indexOf(Math.max(...a));
  return {
    trades: n, tradingDays: keys.length, eligibleDays: eligible, freq: keys.length / eligible,
    perDay: n / keys.length, perWeek: n / Math.max(span / 7, 1), perMonth: n / Math.max(span / 30.4375, 1),
    maxDay: Math.max(...Object.values(days)), weekday, hour, topWeekday: top(weekday), topHour: top(hour),
    vol: { total, avg: total / n, max }, long, short, days, first, last,
  };
}
