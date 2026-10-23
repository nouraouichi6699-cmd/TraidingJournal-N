// Advisor: plain-language advice from the journal. Each piece names a habit seen in the closed trades, the evidence,
// what to do, and what it would have changed on the same history: through the What-if simulator for rules it can replay
// (so rules interact as they would have), by resizing or removing the trades concerned otherwise. A rule chosen on the
// past fits the past, so each piece is also checked on both halves of the history (by entry time).
import type { Trade } from "../types";
import { metrics } from "./dashStats";
import { NO_RULES, simulate, type Level, type Rules, type SimInput } from "./whatif";

export type Topic = "discipline" | "timing" | "symbols" | "direction" | "exits" | "behaviour" | "risk";
export type Kind = "fix" | "strength" | "watch";
export type Proof = "strong" | "medium" | "weak";
export interface Advice {
  id: string; kind: Kind; topic: Topic;
  n: number; // trades behind the finding
  impact: number | null; // money gained on this history by following it
  halves: [number, number] | null; // the same gain (or result, for a strength) on each half of the history
  proof: Proof;
  rules: Partial<Rules> | null; // What-if preset that replays it
  data: Record<string, number | string>; // numbers for the text
}
export interface Plan { advice: Advice[]; plan: { rules: Partial<Rules>; impact: number; ids: string[] } | null; trades: number; exitsCovered: number }

export const MIN_TRADES = 10; // below this the advisor says nothing
const MIN_GROUP = 5; // trades in a weekday / hours / symbol group
const isClosed = (t: Trade) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl);
const ms = (w: string | null) => (w ? Date.parse(`${w.slice(0, 16)}Z`) : NaN);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Two significant digits: 137 -> 140, 1,234 -> 1,200, 8.7 -> 9. */
export const nice = (v: number) => { const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(v) || 1)) - 1); return Math.max(p, Math.round(v / p) * p); };
const weekday = (w: string) => (new Date(`${w.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
const hourOf = (t: Trade) => Number((t.entryTime ?? t.exitTime ?? "").slice(11, 13));
const proofOf = (n: number, h: [number, number] | null): Proof => { const both = !!h && h[0] > 0 && h[1] > 0; return both && n >= 20 ? "strong" : both || n >= 20 ? "medium" : "weak"; };
const stat = (ts: Trade[]) => { const p = ts.map((t) => t.pnl as number); return { n: ts.length, net: sum(p), wr: ts.length ? (p.filter((x) => x > 0).length / ts.length) * 100 : 0 }; };

/** Advice for the closed trades of `inputs` (with their price paths), most valuable first. */
export function advise(inputs: SimInput[]): Plan {
  const all = inputs.filter((x) => isClosed(x.trade)).sort((a, b) => (a.trade.entryTime ?? a.trade.exitTime ?? "").localeCompare(b.trade.entryTime ?? b.trade.exitTime ?? "") || a.trade.no - b.trade.no);
  const trades = all.map((x) => x.trade);
  const withPath = all.filter((x) => x.path && x.k != null && x.k > 0);
  if (all.length < MIN_TRADES) return { advice: [], plan: null, trades: all.length, exitsCovered: withPath.length };
  const half = all.length >> 1, parts: [SimInput[], SimInput[]] = [all.slice(0, half), all.slice(half)];
  const wins = trades.filter((t) => (t.pnl as number) > 0), losses = trades.filter((t) => (t.pnl as number) < 0);
  const avgWin = wins.length ? sum(wins.map((t) => t.pnl as number)) / wins.length : 0, avgLoss = losses.length ? -sum(losses.map((t) => t.pnl as number)) / losses.length : 0;
  const minGain = Math.max(avgLoss, 1); // worth at least one average losing trade
  const out: Advice[] = [];
  const replay = (xs: SimInput[], r: Partial<Rules>) => { const s = simulate(xs, { ...NO_RULES, ...r }); return { gain: s.sim.net - s.actual.net, rows: s.rows, changed: s.exits.changed }; };
  const ruleAdvice = (id: string, topic: Topic, r: Partial<Rules>, data: Advice["data"], minAffected = 3) => {
    const s = replay(all, r), skipped = s.rows.filter((x) => x.skip), n = skipped.length + s.changed;
    if (n < minAffected || s.gain < minGain - 1e-9) return null;
    const halves = parts.map((p) => replay(p, r).gain) as [number, number];
    const avg = skipped.length ? sum(skipped.map((x) => x.trade.pnl as number)) / skipped.length : 0;
    return { id, kind: "fix" as const, topic, n, impact: s.gain, halves, proof: proofOf(n, halves), rules: r, data: { ...data, k: n, avg } };
  };
  const best = (xs: (Advice | null)[]) => xs.filter((x): x is Advice => !!x).sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))[0] ?? null;

  // ----- discipline (daily rules, replayed with their causal order)
  out.push(best([2, 3, 4].map((n) => ruleAdvice("streak", "discipline", { streak: n }, { n }))) as Advice);
  out.push(best([1, 2, 3, 4, 5].map((n) => ruleAdvice("maxDay", "discipline", { maxDay: n }, { n }))) as Advice);
  if (avgLoss > 0) out.push(best([1, 1.5, 2, 3].map((m) => { const v = nice(avgLoss * m); return ruleAdvice("dayLoss", "discipline", { dayLoss: v }, { v }); })) as Advice);
  if (avgWin > 0) out.push(best([1, 2, 3].map((m) => { const v = nice(avgWin * m); return ruleAdvice("dayGain", "discipline", { dayGain: v }, { v }); })) as Advice);

  // ----- groups that lose money: weekday, entry hours, symbol, direction
  const group = (id: string, topic: Topic, pick: (t: Trade) => boolean, r: Partial<Rules>, data: Advice["data"]) => {
    const g = stat(trades.filter(pick));
    if (g.n < MIN_GROUP || g.net >= 0) return null;
    const a = ruleAdvice(id, topic, r, { ...data, n: g.n, net: g.net, wr: g.wr }, MIN_GROUP);
    return a && { ...a, n: g.n };
  };
  out.push(best(Array.from({ length: 7 }, (_, d) => group("weekday", "timing", (t) => weekday(t.entryTime ?? t.exitTime ?? "") === d, { skipDays: [d] }, { d }))) as Advice);
  const windows: (Advice | null)[] = [];
  for (let w = 1; w <= 4; w++) for (let h = 0; h < 24; h++) {
    const end = (h + w) % 24, inside = (t: Trade) => { const x = hourOf(t); return h < end ? x >= h && x < end : x >= h || x < end; };
    const g = stat(trades.filter(inside));
    if (g.n >= MIN_GROUP && g.net < 0 && -g.net >= minGain) windows.push({ id: "hours", kind: "fix", topic: "timing", n: g.n, impact: -g.net, halves: null, proof: "weak", rules: { hours: [end, h] }, data: { a: h, b: end, n: g.n, net: g.net, wr: g.wr } });
  }
  const win = best(windows); // the costliest window; then its own replay and halves
  if (win) { const r = ruleAdvice("hours", "timing", win.rules as Partial<Rules>, win.data, MIN_GROUP); if (r) out.push({ ...r, n: win.n }); }
  const symbols = [...new Set(trades.map((t) => t.symbol))];
  if (symbols.length > 1) out.push(best(symbols.map((s) => group("symbol", "symbols", (t) => t.symbol === s, { skipSymbols: [s] }, { s }))) as Advice);
  for (const side of ["long", "short"] as const) {
    const other = side === "long" ? "short" : "long", o = stat(trades.filter((t) => t.side === other));
    if (o.n >= MIN_GROUP && o.net > 0) { const a = group("side", "direction", (t) => t.side === side, { side: other }, { side, other }); if (a && a.n >= 8) out.push(a); }
  }

  // ----- exits, from the price paths (stops and targets can only close a trade earlier)
  if (withPath.length >= MIN_TRADES) {
    const r = withPath.filter((x) => x.trade.sl != null && (x.trade.sl as number) > 0).length >= withPath.length / 2;
    const lv = (v: number): Level => ({ v, unit: r ? "R" : "money" });
    if (avgLoss > 0 || r) out.push(best((r ? [0.5, 0.75, 1, 1.5] : [0.5, 0.75, 1, 1.5].map((m) => nice(avgLoss * m))).map((v) => ruleAdvice("stop", "exits", { sl: lv(v) }, { v, unit: lv(v).unit }))) as Advice);
    if (avgWin > 0 || r) out.push(best((r ? [1, 1.5, 2, 3] : [0.5, 1, 1.5, 2].map((m) => nice(avgWin * m))).map((v) => ruleAdvice("target", "exits", { tp: lv(v) }, { v, unit: lv(v).unit }))) as Advice);
  }

  // ----- behaviour after a loss: bigger size, quick re-entry
  const prevLoss = new Map<string, { loss: boolean; gap: number }>(); // trade key -> was the last trade closed before its entry (same account) a loss
  const byAcc = new Map<string, Trade[]>();
  for (const t of trades) byAcc.set(t.accountId, [...(byAcc.get(t.accountId) ?? []), t]);
  for (const list of byAcc.values()) {
    const closedOrder = [...list].filter((t) => t.exitTime).sort((a, b) => (a.exitTime as string).localeCompare(b.exitTime as string));
    for (const t of list) {
      const at = ms(t.entryTime);
      let last: Trade | null = null;
      for (const c of closedOrder) { if (c === t) continue; if (ms(c.exitTime) <= at) last = c; else break; }
      if (last) prevLoss.set(t.key, { loss: (last.pnl as number) < 0, gap: (at - ms(last.exitTime)) / 6e4 });
    }
  }
  const usual = new Map<string, number>();
  for (const [k, ts] of byKeyGroups(trades)) usual.set(k, median(ts.map((t) => t.qty)));
  const flagged = (ts: Trade[]) => ts.filter((t) => prevLoss.get(t.key)?.loss && t.qty / (usual.get(`${t.accountId}|${t.symbol}`) || t.qty) >= 1.25);
  const resize = (ts: Trade[]) => sum(flagged(ts).map((t) => (t.pnl as number) * ((usual.get(`${t.accountId}|${t.symbol}`) as number) / t.qty - 1)));
  const big = flagged(trades);
  if (big.length >= MIN_GROUP) {
    const impact = resize(trades);
    if (impact >= minGain) {
      const halves = parts.map((p) => resize(p.map((x) => x.trade))) as [number, number];
      out.push({ id: "revenge", kind: "fix", topic: "behaviour", n: big.length, impact, halves, proof: proofOf(big.length, halves), rules: null, data: { x: sum(big.map((t) => t.qty / (usual.get(`${t.accountId}|${t.symbol}`) as number))) / big.length, n: big.length, net: stat(big).net } });
    }
  }
  const RUSH = 10, quick = (ts: Trade[]) => ts.filter((t) => { const p = prevLoss.get(t.key); return !!p && p.loss && p.gap >= 0 && p.gap <= RUSH; });
  const fast = stat(quick(trades));
  if (fast.n >= MIN_GROUP && -fast.net >= minGain) {
    const halves = parts.map((p) => -stat(quick(p.map((x) => x.trade))).net) as [number, number];
    out.push({ id: "rush", kind: "fix", topic: "behaviour", n: fast.n, impact: -fast.net, halves, proof: proofOf(fast.n, halves), rules: null, data: { m: RUSH, n: fast.n, net: fast.net, wr: fast.wr } });
  }

  // ----- to watch: holding losers, trading without a stop
  const held = (ts: Trade[]) => ts.map((t) => (ms(t.exitTime) - ms(t.entryTime)) / 6e4).filter((m) => Number.isFinite(m) && m >= 0);
  const hw = held(wins), hl = held(losses);
  if (hw.length >= MIN_GROUP && hl.length >= MIN_GROUP) {
    const aw = sum(hw) / hw.length, al = sum(hl) / hl.length;
    if (aw > 0 && al / aw >= 1.5) out.push({ id: "holdLosers", kind: "watch", topic: "risk", n: hw.length + hl.length, impact: null, halves: null, proof: proofOf(hw.length + hl.length, null), rules: null, data: { x: al / aw, lw: aw, ll: al } });
  }
  const noSl = trades.filter((t) => !(t.sl != null && t.sl > 0)), lostNo = noSl.filter((t) => (t.pnl as number) < 0), lostSl = losses.filter((t) => t.sl != null && t.sl > 0);
  if (noSl.length / trades.length >= 0.5 && lostNo.length >= 3) {
    const a = -stat(lostNo).net / lostNo.length, b = lostSl.length ? -stat(lostSl).net / lostSl.length : null;
    if (b == null || a > 1.2 * b) out.push({ id: "noStop", kind: "watch", topic: "risk", n: noSl.length, impact: null, halves: null, proof: proofOf(noSl.length, null), rules: null, data: { p: (noSl.length / trades.length) * 100, a, ...(b != null ? { b } : {}) } });
  }

  // ----- strengths: the groups that carry the results
  const strong: Advice[] = [];
  const halvesOf = (pick: (t: Trade) => boolean) => parts.map((p) => stat(p.map((x) => x.trade).filter(pick)).net) as [number, number];
  const strength = (id: string, topic: Topic, pick: (t: Trade) => boolean, data: Advice["data"]) => {
    const g = stat(trades.filter(pick));
    if (g.n < MIN_GROUP || g.net <= 0) return;
    const halves = halvesOf(pick);
    strong.push({ id, kind: "strength", topic, n: g.n, impact: null, halves, proof: proofOf(g.n, halves), rules: null, data: { ...data, n: g.n, net: g.net, wr: g.wr } });
  };
  const top = <T,>(xs: T[], f: (x: T) => number) => [...xs].sort((a, b) => f(b) - f(a))[0];
  if (symbols.length > 1) { const s = top(symbols, (x) => stat(trades.filter((t) => t.symbol === x)).net); strength("bestSymbol", "symbols", (t) => t.symbol === s, { s }); }
  const d = top([0, 1, 2, 3, 4, 5, 6], (x) => { const g = stat(trades.filter((t) => weekday(t.entryTime ?? t.exitTime ?? "") === x)); return g.n >= MIN_GROUP ? g.net : -Infinity; });
  strength("bestDay", "timing", (t) => weekday(t.entryTime ?? t.exitTime ?? "") === d, { d });
  let bw: { h: number; w: number; net: number } | null = null;
  for (let w = 2; w <= 4; w++) for (let h = 0; h < 24; h++) {
    const end = (h + w) % 24, g = stat(trades.filter((t) => { const x = hourOf(t); return h < end ? x >= h && x < end : x >= h || x < end; }));
    if (g.n >= MIN_GROUP && g.net > 0 && (!bw || g.net > bw.net)) bw = { h, w, net: g.net };
  }
  if (bw) { const { h, w } = bw, end = (h + w) % 24; strength("bestHours", "timing", (t) => { const x = hourOf(t); return h < end ? x >= h && x < end : x >= h || x < end; }, { a: h, b: end }); }
  const sides = (["long", "short"] as const).map((s) => ({ s, g: stat(trades.filter((t) => t.side === s)) }));
  if (sides.every((x) => x.g.n >= MIN_GROUP)) { const s = top(sides, (x) => x.g.net).s; strength("bestSide", "direction", (t) => t.side === s, { side: s }); }

  const fixes = out.filter((x): x is Advice => !!x && x.kind === "fix").sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0));
  const watch = out.filter((x): x is Advice => !!x && x.kind === "watch");
  const strengths = strong.sort((a, b) => Number(b.data.net) - Number(a.data.net)).slice(0, 3);

  // ----- the plan: replayable fixes that are not weak, added one by one (best first) while each still adds at least
  // one average loss on top of the others; rules overlap, so the plan is replayed whole, not summed
  const merge = (r: Partial<Rules>, a: Partial<Rules>): Partial<Rules> => ({ ...r, ...a, skipDays: [...new Set([...(r.skipDays ?? []), ...(a.skipDays ?? [])])], skipSymbols: [...new Set([...(r.skipSymbols ?? []), ...(a.skipSymbols ?? [])])] });
  let plan = null as Plan["plan"];
  for (const a of fixes) {
    if (!a.rules || a.proof === "weak") continue;
    const rules = merge(plan?.rules ?? {}, a.rules), gain = replay(all, rules).gain;
    if (gain >= (plan?.impact ?? 0) + minGain - 1e-9) plan = { rules, impact: gain, ids: [...(plan?.ids ?? []), a.id] };
  }
  return { advice: [...fixes, ...watch, ...strengths], plan, trades: all.length, exitsCovered: withPath.length };
}

function byKeyGroups(trades: Trade[]): Map<string, Trade[]> {
  const m = new Map<string, Trade[]>();
  for (const t of trades) { const k = `${t.accountId}|${t.symbol}`; m.set(k, [...(m.get(k) ?? []), t]); }
  return m;
}

// ---------- summary for the chat ----------

const r2 = (x: number) => Math.round(x * 100) / 100;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const minutes = (t: Trade) => { const a = Date.parse(`${t.entryTime}Z`), b = Date.parse(`${t.exitTime}Z`); return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 6e4) : null; };
function groups(trades: Trade[], key: (t: Trade) => string) {
  const m = new Map<string, Trade[]>();
  for (const t of trades) { const k = key(t); m.set(k, [...(m.get(k) ?? []), t]); }
  return [...m].map(([k, ts]) => { const p = ts.map((t) => t.pnl as number); return { k, n: ts.length, net: r2(p.reduce((a, b) => a + b, 0)), wr: r2((p.filter((x) => x > 0).length / ts.length) * 100) }; });
}

/** What the AI gets: totals, results by symbol / side / weekday / entry hour / month, the advisor's findings, the last 40 trades. */
export function journalContext(trades: Trade[], plan: Plan, currency: string | null) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl)).sort((a, b) => (a.exitTime ?? "").localeCompare(b.exitTime ?? ""));
  const m = metrics(closed);
  const wd = (t: Trade) => DAYS[(new Date(`${(t.entryTime ?? t.exitTime ?? "").slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7];
  return {
    currency: currency ?? "mixed", trades: m.n, from: closed[0]?.exitTime?.slice(0, 10) ?? null, to: closed[closed.length - 1]?.exitTime?.slice(0, 10) ?? null,
    totals: { net: r2(m.net), winRate: m.winRate == null ? null : r2(m.winRate), profitFactor: m.pf == null ? null : r2(m.pf), avgWin: r2(m.avgWin), avgLoss: r2(m.avgLoss), maxDrawdown: r2(m.maxDD), withStopLoss: closed.filter((t) => t.sl != null && t.sl > 0).length },
    bySymbol: groups(closed, (t) => t.symbol), bySide: groups(closed, (t) => t.side), byWeekday: groups(closed, wd),
    byEntryHour: groups(closed, (t) => (t.entryTime ?? "").slice(11, 13)).sort((a, b) => a.k.localeCompare(b.k)), byMonth: groups(closed, (t) => (t.exitTime ?? "").slice(0, 7)),
    findings: plan.advice.map((a) => ({ id: a.id, kind: a.kind, trades: a.n, moneyEffect: a.impact == null ? null : r2(a.impact), evidence: a.proof, halves: a.halves?.map(r2) ?? null, data: Object.fromEntries(Object.entries(a.data).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v])) })),
    plan: plan.plan ? { rules: plan.plan.ids, moneyEffect: r2(plan.plan.impact) } : null,
    recent: closed.slice(-40).map((t) => ({ closed: t.exitTime, symbol: t.symbol, side: t.side, qty: t.qty, pnl: r2(t.pnl as number), minutes: minutes(t), stopLoss: t.sl != null && t.sl > 0 })),
  };
}
