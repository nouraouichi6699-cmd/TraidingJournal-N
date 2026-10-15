import type { Trade } from "../types";

export const dayKey = (t: Trade) => (t.exitTime || t.entryTime || "").slice(0, 10);
const sortKey = (t: Trade) => t.exitTime || t.entryTime || "";
const wk = (d: string) => {
  const dt = new Date(d + "T00:00:00Z");
  return new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
};

export interface Day { d: string; pnl: number; n: number }
export function byDay(closed: Trade[]): Day[] {
  const m: Record<string, Day> = {};
  for (const t of closed) {
    const d = dayKey(t); if (!d) continue;
    (m[d] ||= { d, pnl: 0, n: 0 }).pnl += t.pnl as number; m[d].n++;
  }
  return Object.values(m).sort((a, b) => a.d.localeCompare(b.d));
}

export interface Score { key: "win" | "pf" | "avg" | "rec" | "dd" | "con"; v: number }
export interface Metrics {
  n: number; net: number; wins: number; losses: number; winRate: number | null;
  avgWin: number; avgLoss: number; ratio: number | null; pf: number | null;
  dayWinRate: number | null; days: Day[]; cum: { d: string; v: number }[];
  maxDD: number; recovery: number | null; score: Score[] | null; overall: number | null;
}

export function metrics(closed: Trade[]): Metrics {
  const p = (t: Trade) => t.pnl as number;
  const w = closed.filter((t) => p(t) > 0), l = closed.filter((t) => p(t) < 0);
  const gw = w.reduce((s, t) => s + p(t), 0), gl = Math.abs(l.reduce((s, t) => s + p(t), 0));
  const net = gw - gl;
  const avgWin = w.length ? gw / w.length : 0, avgLoss = l.length ? gl / l.length : 0;
  const ratio = avgLoss ? avgWin / avgLoss : null;
  const pf = gl ? gw / gl : null;
  const days = byDay(closed);
  const dayWinRate = days.length ? (days.filter((d) => d.pnl > 0).length / days.length) * 100 : null;
  let run = 0;
  const cum = days.map((d) => ({ d: d.d, v: (run += d.pnl) }));
  // drawdown over the trade sequence
  let eq = 0, peak = 0, maxDD = 0;
  for (const t of [...closed].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))) { eq += p(t); peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq); }
  const recovery = maxDD ? net / maxDD : null;
  const winRate = closed.length ? (w.length / closed.length) * 100 : null;

  let score: Score[] | null = null, overall: number | null = null;
  if (closed.length >= 5) {
    const weeks: Record<string, number> = {};
    for (const d of days) weeks[wk(d.d)] = (weeks[wk(d.d)] || 0) + d.pnl;
    const wv = Object.values(weeks);
    const cl = (x: number) => Math.max(0, Math.min(100, x));
    score = [
      { key: "win", v: cl(winRate ?? 0) },
      { key: "pf", v: pf == null ? (gw > 0 ? 100 : 0) : cl((pf / 2.6) * 100) },
      { key: "avg", v: ratio == null ? (gw > 0 ? 100 : 0) : cl((ratio / 2.6) * 100) },
      { key: "rec", v: net <= 0 ? 0 : maxDD === 0 ? 100 : cl(((net / maxDD) / 4) * 100) },
      { key: "dd", v: gw <= 0 ? 0 : cl(100 - (maxDD / gw) * 100) },
      { key: "con", v: wv.length ? (wv.filter((x) => x > 0).length / wv.length) * 100 : 0 },
    ];
    overall = score.reduce((s, x) => s + x.v, 0) / score.length;
  }
  return { n: closed.length, net, wins: w.length, losses: l.length, winRate, avgWin, avgLoss, ratio, pf, dayWinRate, days, cum, maxDD, recovery, score, overall };
}
