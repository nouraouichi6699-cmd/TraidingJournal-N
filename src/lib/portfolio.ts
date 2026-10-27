// Portfolio analytics for Reports > Portfolio: contribution and concentration by account / symbol, combined drawdown and
// who caused it, account correlation, diversification, risk contribution, position overlap, exposure / leverage and
// historical VaR / ES. Same conventions as the Overview (stats.ts): realised P&L of closed trades on their close date,
// recorded cash flows move the balance but are never gains or drawdowns, daily returns use weekdays plus weekend days
// that have trades.
import type { Account, Trade } from "../types";
import { signed, type CashFlow } from "./cashflow";

const DAY = 864e5, MIN = 6e4;
const norm = (s: string) => s.trim().replace(" ", "T").slice(0, 16);
/** Stored wall time ("YYYY-MM-DD HH:MM[:SS]" / "YYYY-MM-DDTHH:MM") read as UTC, to the minute. */
const ms = (s: string | null | undefined) => { if (!s) return null; let x = norm(s); if (x.length === 10) x += "T00:00"; const v = Date.parse(`${x}Z`); return Number.isFinite(v) ? v : null; };
const dayOf = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const isClosed = (t: Trade) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && !!dayOf(t.exitTime);
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const cov = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / (a.length - 1); };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (sorted: number[], p: number) => { const k = (sorted.length - 1) * p, f = Math.floor(k), c = Math.ceil(k); return sorted[f] + (sorted[c] - sorted[f]) * (k - f); };

export const MIN_DAYS = 20;
export interface Share { key: string; name: string; pnl: number; pct: number | null } // pct: percentage points of the portfolio return
export interface Conc { hhi: number; eff: number; n: number } // Herfindahl index of |P&L| shares (0-1), 1 / HHI, components
export interface Drawdown { amount: number; pct: number; peak: string | null; trough: string | null; shares: { key: string; name: string; pnl: number; share: number }[] }
// missing: positions that could not be valued, as "SYMBOL (account)" when the portfolio has several accounts
export interface Exposure { maxGross: number; maxNet: number; avgGross: number; avgNet: number; maxLev: number | null; avgLev: number | null; valued: string[]; missing: string[] }
export interface Portfolio {
  selected: number; active: number; traded: number; start: number; closed: number; // traded: accounts with closed trades
  accounts: Share[]; symbols: Share[]; // best first
  accConc: Conc | null; symConc: Conc | null;
  strategies: Share[]; stratConc: Conc | null; // only the trades linked to a strategy
  dd: Drawdown | null; // null without a positive start balance or closed trades
  days: number; // trading days in the daily series
  corr: { avg: number | null; max: { a: string; b: string; v: number } | null; pairs: number };
  divRatio: number | null;
  risk: { by: "account" | "symbol"; key: string; name: string; share: number } | null;
  overlap: { share: number | null; maxOpen: number };
  exposure: Exposure | null;
  var95: number | null; es95: number | null; balance: number; // VaR / ES as daily returns in % (negative = loss); end balance
}

const conc = (s: Share[]): Conc | null => {
  const tot = s.reduce((a, x) => a + Math.abs(x.pnl), 0);
  if (!s.length || !(tot > 0)) return null;
  const hhi = s.reduce((a, x) => a + (Math.abs(x.pnl) / tot) ** 2, 0);
  return { hhi, eff: 1 / hhi, n: s.length };
};

/**
 * Value of a 1.0 price move for 1 lot (or unit), in account money, per account and symbol ("account|symbol") from closed
 * trades: median of (P&L + commission) ÷ (price move × quantity × direction). No contract sizes needed (FX 100,000,
 * gold 100 oz, index CFDs differ by broker, hence per account). Swap is not stored, so overnight trades can bend it a
 * little; the median keeps outliers out.
 */
export function pointValues(trades: Trade[]): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const t of trades) {
    if (!isClosed(t) || t.exitPrice == null || !(t.qty > 0) || !(t.entryPrice > 0) || !(t.exitPrice > 0) || t.exitPrice === t.entryPrice) continue;
    const v = ((t.pnl as number) + (t.commission || 0)) / ((t.exitPrice - t.entryPrice) * t.qty * (t.side === "long" ? 1 : -1));
    const k = `${t.accountId}|${t.symbol}`;
    if (Number.isFinite(v) && v > 0) by.set(k, [...(by.get(k) ?? []), v]);
  }
  return new Map([...by].map(([k, v]) => [k, median(v)]));
}

/**
 * `trades`: trades of the period; `accounts`: the selected accounts with their balance at the start of the period (those
 * with trades form the portfolio, as on the Overview); `flows`: recorded cash flows of the period; `history`: all trades,
 * used only to measure point values; `now`: end of still-open positions.
 */
export function portfolioStats(trades: Trade[], accounts: Account[], flows: CashFlow[], history: Trade[] = trades, now = Date.now(), strategyOf?: (t: Trade) => string | undefined): Portfolio {
  const closed = trades.filter(isClosed).sort((a, b) => (a.exitTime as string).localeCompare(b.exitTime as string) || a.no - b.no);
  const act = accounts.filter((a) => trades.some((t) => t.accountId === a.id));
  const ids = act.map((a) => a.id), name = (id: string) => accounts.find((a) => a.id === id)?.name || id;
  const start = act.reduce((s, a) => s + (a.startBalance || 0), 0);
  const fl = flows.filter((f) => ids.includes(f.accountId) && dayOf(f.t) && Number.isFinite(f.amount) && f.amount !== 0);
  const pnl = (t: Trade) => t.pnl as number;

  // ----- contribution: P&L ÷ starting capital, so the parts add up to the portfolio's total return
  const shares = (keys: string[], key: (t: Trade) => string, label: (k: string) => string): Share[] => {
    const m = new Map<string, number>(keys.map((k) => [k, 0]));
    for (const t of closed) m.set(key(t), (m.get(key(t)) ?? 0) + pnl(t));
    return [...m].map(([k, v]) => ({ key: k, name: label(k), pnl: v, pct: start > 0 ? (v / start) * 100 : null })).sort((a, b) => b.pnl - a.pnl || a.name.localeCompare(b.name));
  };
  const accShares = shares(ids, (t) => t.accountId, name);
  const symShares = shares([], (t) => t.symbol, (s) => s);
  const stratShares = strategyOf ? shares([], (t) => strategyOf(t) ?? "", (s) => s).filter((s) => s.key) : [];

  // ----- combined balance drawdown (as the Overview): flows are excluded, start balance is the first peak
  let dd: Drawdown | null = null;
  if (start > 0 && closed.length) {
    const steps = [
      ...closed.map((t) => ({ k: norm(t.exitTime as string), d: pnl(t), f: 0, o: 1, acc: t.accountId })),
      ...fl.map((f) => ({ k: norm(f.t), d: signed(f), f: signed(f), o: 0, acc: f.accountId })), // a flow comes first at the same time
    ].sort((a, b) => a.k.localeCompare(b.k) || a.o - b.o);
    let bal = start, prev = start, idx = 1, iPeak = 1, maxPct = 0, cum = 0, aPeak = start, aPeakAt = -1, maxAmt = 0, from = -1, to = -1;
    steps.forEach((s, i) => {
      bal += s.d; cum += s.f;
      if (prev > 0) idx *= 1 + (bal - prev - s.f) / prev;
      prev = bal;
      if (idx >= iPeak) iPeak = idx; else if (iPeak > 0) maxPct = Math.max(maxPct, (iPeak - idx) / iPeak);
      const a = bal - cum; // balance without the flows: money won or lost by trading
      if (a >= aPeak) { aPeak = a; aPeakAt = i; } else if (aPeak - a > maxAmt) { maxAmt = aPeak - a; from = aPeakAt; to = i; }
    });
    const by = new Map<string, number>();
    if (maxAmt > 0) for (let i = from + 1; i <= to; i++) if (steps[i].o === 1) by.set(steps[i].acc, (by.get(steps[i].acc) ?? 0) + steps[i].d);
    dd = {
      amount: maxAmt, pct: maxPct * 100, peak: maxAmt > 0 ? (from >= 0 ? steps[from].k : null) : null, trough: maxAmt > 0 ? steps[to].k : null,
      shares: [...by].map(([k, v]) => ({ key: k, name: name(k), pnl: v, share: (-v / maxAmt) * 100 })).sort((a, b) => b.share - a.share || a.name.localeCompare(b.name)),
    };
  }

  // ----- daily series (as the Overview's Sharpe): weekdays from the first to the last trading day + weekend days with trades
  const pDay = new Map<string, number>(), aDay = new Map<string, Map<string, number>>(), sDay = new Map<string, Map<string, number>>();
  const add = (m: Map<string, Map<string, number>>, k: string, d: string, v: number) => { const x = m.get(k) ?? new Map<string, number>(); x.set(d, (x.get(d) ?? 0) + v); m.set(k, x); };
  for (const t of closed) { const d = dayOf(t.exitTime)!; pDay.set(d, (pDay.get(d) ?? 0) + pnl(t)); add(aDay, t.accountId, d, pnl(t)); add(sDay, t.symbol, d, pnl(t)); }
  const fDay = new Map<string, number>(), afDay = new Map<string, Map<string, number>>();
  for (const f of fl) { const d = dayOf(f.t)!; fDay.set(d, (fDay.get(d) ?? 0) + signed(f)); add(afDay, f.accountId, d, signed(f)); }
  const keys = [...pDay.keys()].sort();
  const grid: string[] = [], r: number[] = [];
  const ar = new Map<string, (number | null)[]>(ids.map((id) => [id, []]));
  let balance = start + fl.reduce((s, f) => s + signed(f), 0) + closed.reduce((s, t) => s + pnl(t), 0);
  if (keys.length && start > 0) {
    let bal = start + [...fDay].reduce((s, [d, v]) => (d < keys[0] ? s + v : s), 0);
    const ab = new Map(act.map((a) => [a.id, (a.startBalance || 0) + [...(afDay.get(a.id) ?? [])].reduce((s, [d, v]) => (d < keys[0] ? s + v : s), 0)]));
    for (let u = Date.parse(`${keys[0]}T00:00:00Z`), end = Date.parse(`${keys[keys.length - 1]}T00:00:00Z`); u <= end; u += DAY) {
      const d = new Date(u).toISOString().slice(0, 10), wd = new Date(u).getUTCDay(), pl = pDay.get(d) ?? 0;
      bal += fDay.get(d) ?? 0;
      for (const id of ids) ab.set(id, (ab.get(id) as number) + (afDay.get(id)?.get(d) ?? 0));
      const skip = (wd === 0 || wd === 6) && !pDay.has(d);
      if (!skip && bal > 0) {
        grid.push(d); r.push(pl / bal);
        for (const id of ids) { const b = ab.get(id) as number; ar.get(id)!.push(b > 0 ? (aDay.get(id)?.get(d) ?? 0) / b : null); }
      }
      bal += pl;
      for (const id of ids) ab.set(id, (ab.get(id) as number) + (aDay.get(id)?.get(d) ?? 0));
    }
  }

  // ----- account correlation: daily returns over the days both accounts were trading (first to last close of each)
  const span = new Map(ids.map((id) => { const d = closed.filter((t) => t.accountId === id).map((t) => dayOf(t.exitTime) as string); return [id, d.length ? [d[0], d[d.length - 1]] : null] as const; }));
  const pairs: { a: string; b: string; v: number }[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const sa = span.get(ids[i]), sb = span.get(ids[j]);
    if (!sa || !sb) continue;
    const lo = sa[0] > sb[0] ? sa[0] : sb[0], hi = sa[1] < sb[1] ? sa[1] : sb[1], x: number[] = [], y: number[] = [];
    grid.forEach((d, k) => { const p = ar.get(ids[i])![k], q = ar.get(ids[j])![k]; if (d >= lo && d <= hi && p != null && q != null) { x.push(p); y.push(q); } });
    if (x.length < MIN_DAYS) continue;
    const sx = sd(x), sy = sd(y);
    if (sx > 0 && sy > 0) pairs.push({ a: name(ids[i]), b: name(ids[j]), v: cov(x, y) / (sx * sy) });
  }
  const maxPair = pairs.reduce<(typeof pairs)[number] | null>((m, p) => (!m || p.v > m.v ? p : m), null);

  // ----- diversification ratio and risk contribution on daily P&L (money adds up exactly across components)
  const series = (m: Map<string, Map<string, number>>, k: string) => grid.map((d) => m.get(k)?.get(d) ?? 0);
  const pSeries = grid.map((d) => pDay.get(d) ?? 0);
  const accIds = ids.filter((id) => aDay.has(id));
  let divRatio: number | null = null;
  if (grid.length >= MIN_DAYS && accIds.length >= 2) {
    const sp = sd(pSeries), parts = accIds.map((id) => sd(series(aDay, id)));
    if (sp > 0 && parts.filter((x) => x > 0).length >= 2) divRatio = parts.reduce((s, x) => s + x, 0) / sp;
  }
  let risk: Portfolio["risk"] = null;
  const by: "account" | "symbol" = accIds.length >= 2 ? "account" : "symbol", comps = by === "account" ? accIds : [...sDay.keys()].sort();
  if (grid.length >= MIN_DAYS && comps.length >= 2) {
    const vp = cov(pSeries, pSeries);
    if (vp > 0) for (const c of comps) {
      const share = (cov(series(by === "account" ? aDay : sDay, c), pSeries) / vp) * 100;
      if (!risk || share > risk.share) risk = { by, key: c, name: by === "account" ? name(c) : c, share };
    }
  }

  // ----- historical VaR / ES (95%) of the portfolio's daily returns
  let var95: number | null = null, es95: number | null = null;
  if (r.length >= MIN_DAYS) {
    const s = [...r].sort((x, y) => x - y), q = pct(s, 0.05), tail = s.filter((x) => x <= q);
    var95 = q * 100; es95 = mean(tail) * 100;
  }

  // ----- positions over time: overlap, exposure and leverage
  const pv = pointValues(history);
  type Pos = { s: number; e: number; n: number | null; sign: number };
  const pos: Pos[] = [], unvalued = new Set<string>();
  for (const t of trades) {
    const s = ms(t.entryTime);
    let e = t.status === "closed" ? ms(t.exitTime) : now;
    if (s == null || e == null || e < s) continue;
    e = Math.max(e, s + MIN); // within one minute still counts as open
    const v = pv.get(`${t.accountId}|${t.symbol}`), n = v != null && t.entryPrice > 0 && t.qty > 0 ? v * t.entryPrice * t.qty : null;
    if (n == null) unvalued.add(act.length > 1 ? `${t.symbol} (${name(t.accountId)})` : t.symbol);
    pos.push({ s, e, n, sign: t.side === "long" ? 1 : -1 });
  }
  const eqEv = [
    ...closed.map((t) => ({ t: ms(t.exitTime), v: pnl(t) })),
    ...fl.map((f) => ({ t: ms(norm(f.t)), v: signed(f) })),
  ].filter((x): x is { t: number; v: number } => x.t != null).sort((a, b) => a.t - b.t);
  const opens = [...pos].sort((a, b) => a.s - b.s), closes = [...pos].sort((a, b) => a.e - b.e);
  const times = [...new Set([...pos.flatMap((p) => [p.s, p.e]), ...eqEv.map((x) => x.t)])].sort((a, b) => a - b);
  let io = 0, ic = 0, ie = 0, gross = 0, net = 0, count = 0, valued = 0, eq = start, maxOpen = 0;
  let maxGross = 0, maxNet = 0, maxLev: number | null = null, tIn = 0, t2 = 0, tV = 0, sG = 0, sN = 0, sL = 0, tL = 0;
  times.forEach((t, k) => {
    for (; ic < closes.length && closes[ic].e <= t; ic++) { const p = closes[ic]; count--; if (p.n != null) { valued--; gross -= p.n; net -= p.sign * p.n; } }
    for (; ie < eqEv.length && eqEv[ie].t <= t; ie++) eq += eqEv[ie].v;
    for (; io < opens.length && opens[io].s <= t; io++) { const p = opens[io]; count++; if (p.n != null) { valued++; gross += p.n; net += p.sign * p.n; } }
    if (valued <= 0) { gross = 0; net = 0; } // no rounding residue when flat
    maxOpen = Math.max(maxOpen, count);
    if (valued > 0) {
      if (gross > maxGross) maxGross = gross;
      if (Math.abs(net) > Math.abs(maxNet)) maxNet = net;
      if (eq > 0) maxLev = Math.max(maxLev ?? 0, gross / eq);
    }
    const dt = k + 1 < times.length ? times[k + 1] - t : 0;
    if (count >= 1) tIn += dt;
    if (count >= 2) t2 += dt;
    if (valued > 0) { tV += dt; sG += gross * dt; sN += net * dt; if (eq > 0) { sL += (gross / eq) * dt; tL += dt; } }
  });
  const syms = [...new Set(trades.map((t) => t.symbol))].sort();
  const exposure: Exposure | null = tV > 0 ? {
    maxGross, maxNet, avgGross: sG / tV, avgNet: sN / tV, maxLev, avgLev: tL > 0 ? sL / tL : null,
    valued: syms.filter((s) => ![...unvalued].some((u) => u === s || u.startsWith(`${s} (`))), missing: [...unvalued].sort(),
  } : null;

  return {
    selected: accounts.length, active: act.length, traded: accIds.length, start, closed: closed.length,
    accounts: accShares, symbols: symShares, accConc: conc(accShares), symConc: conc(symShares),
    strategies: stratShares, stratConc: conc(stratShares),
    dd, days: grid.length,
    corr: { avg: pairs.length ? mean(pairs.map((p) => p.v)) : null, max: maxPair, pairs: pairs.length },
    divRatio, risk,
    overlap: { share: tIn > 0 ? (t2 / tIn) * 100 : null, maxOpen },
    exposure, var95, es95, balance,
  };
}
