/** External account flows (not trading P&L). `amount` is positive for deposit/withdrawal/credit; an adjustment may be signed. */
export type CashFlowType = "deposit" | "withdrawal" | "credit" | "adjustment";
export interface CashFlow { id: string; accountId: string; t: string; type: CashFlowType; amount: number }

/** Effect of a flow on the account balance. */
export const signed = (f: CashFlow): number => (f.type === "withdrawal" ? -Math.abs(f.amount) : f.type === "adjustment" ? f.amount : Math.abs(f.amount));
const valid = (f: CashFlow) => Number.isFinite(f.amount) && !!f.t && f.amount !== 0;

export interface FlowTotals { totDep: number; totWd: number; netDep: number; credits: number; netFlow: number; depN: number; wdN: number; credN: number; avgDep: number | null; avgWd: number | null }
/**
 * netDep = deposits - withdrawals. credits = credits + adjustments (adjustments may be negative).
 * netFlow (external) = deposits - withdrawals + credits; adjustments move the balance but are not external money.
 */
export function flowTotals(flows: CashFlow[]): FlowTotals {
  const f = flows.filter(valid);
  const dep = f.filter((x) => x.type === "deposit"), wd = f.filter((x) => x.type === "withdrawal"), cr = f.filter((x) => x.type === "credit"), adj = f.filter((x) => x.type === "adjustment");
  const sum = (a: CashFlow[]) => a.reduce((s, x) => s + Math.abs(x.amount), 0);
  const totDep = sum(dep), totWd = sum(wd), credit = sum(cr), adjust = adj.reduce((s, x) => s + x.amount, 0);
  return { totDep, totWd, netDep: totDep - totWd, credits: credit + adjust, netFlow: totDep - totWd + credit, depN: dep.length, wdN: wd.length, credN: cr.length + adj.length, avgDep: dep.length ? totDep / dep.length : null, avgWd: wd.length ? totWd / wd.length : null };
}

export interface Pnl { t: string; pnl: number }
/**
 * Time-weighted return (%): the period is split at every external flow, each sub-period return is
 * (value before the flow) / (value after the previous flow) - 1, and sub-returns are compounded.
 * Credits count as external money; adjustments do not (they are treated as performance). Returns null when the start value is not positive.
 */
export function timeWeightedReturn(start: number, pnls: Pnl[], flows: CashFlow[]): number | null {
  if (!(start > 0)) return null;
  const ev = [
    ...flows.filter(valid).map((f) => ({ t: f.t, kind: 0 as const, v: f.type === "adjustment" ? 0 : signed(f), adj: f.type === "adjustment" ? f.amount : 0 })), // flows first on equal timestamps
    ...pnls.map((p) => ({ t: p.t, kind: 1 as const, v: 0, adj: p.pnl })),
  ].sort((a, b) => a.t.localeCompare(b.t) || a.kind - b.kind);
  let base = start, bal = start, growth = 1;
  for (const e of ev) {
    if (e.kind === 1 || e.adj !== 0) bal += e.adj; // trading P&L / adjustments change value, not the base
    if (e.v !== 0) {
      if (!(base > 0)) return null;
      growth *= bal / base;
      bal += e.v; base = bal;
      if (!(base > 0)) return null;
    }
  }
  growth *= bal / base;
  return Number.isFinite(growth) ? (growth - 1) * 100 : null;
}

/** Annualised return (%) from a time-weighted return over `days` calendar days. Null for a total loss or a span under `minDays`. */
export function annualise(twrPct: number | null, days: number, minDays = 30): number | null {
  if (twrPct == null || !(days >= minDays) || twrPct <= -100) return null;
  const v = (Math.pow(1 + twrPct / 100, 365 / days) - 1) * 100;
  return Number.isFinite(v) ? v : null;
}
