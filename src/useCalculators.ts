// What the calculators share outside their page: the position-size state used both by the header's dropdown and by
// the Calculators page (same "mizan-size-calc" key, so both show the same values, kept in step while both are open),
// and the event that opens the page on a given calculator from anywhere, the way "mizan-open-settings" opens Settings.
import { useEffect, useMemo, useRef, useState } from "react";
import { readSettings } from "./useSettings";
import type { Account, BalancePoint, Trade } from "./types";
import type { CashFlow } from "./lib/cashflow";
import { currentBalance } from "./lib/balance";
import { challengeState, readChallenges } from "./lib/challenge";
import { parseNum, positionSize, symbolSpec } from "./lib/calcCore";
import { todayFor } from "./components/challengeUi";

/** Asking the app to open the Calculators page, on one calculator (its key) or on the list (no key). */
export const OPEN_CALCULATOR = "mizan-open-calculator";
export interface CalcNav { key?: string | null }
export const openCalculator = (key?: string | null) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<CalcNav>(OPEN_CALCULATOR, { detail: { key: key ?? null } }));
};

const KEY = "mizan-size-calc";
export type SizeSaved = { acc: string; mode: "pct" | "amt"; pct: string; amt: string; sym: string; contracts: Record<string, string>; rates: Record<string, string> };
// The default risk comes from Settings, which itself defaults to the "1" this used to hardcode. Anything already
// saved here wins, so a calculator in use is never reset by the setting.
const load = (): SizeSaved => { const pct = readSettings().riskPct || "1"; try { return { acc: "", mode: "pct", pct, amt: "", sym: "", contracts: {}, rates: {}, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { acc: "", mode: "pct", pct, amt: "", sym: "", contracts: {}, rates: {} }; } };
// Every mounted copy: when one saves, the others read the stored values again.
const copies = new Set<() => void>();

export interface SizeData { accounts: Account[]; trades: Trade[]; balances: Record<string, BalancePoint[]>; flows: CashFlow[] }
export interface SizeOpts {
  /** A balance to use instead of the account's (typed, or edited on the page). Left out: the account's current balance. */
  balance?: number;
  /** Off: no prop-challenge safe risk (the page's manual mode). */
  journal?: boolean;
  /** The currency when there is no account (the page's manual mode). */
  cur?: string;
}

/** The position size calculator's state and result. Entry and stop belong to each copy; everything else is saved. */
export function useSizeCalc({ accounts, trades, balances, flows }: SizeData, opts: SizeOpts = {}) {
  const [s, setS] = useState<SizeSaved>(load);
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const self = useRef<() => void>(() => setS(load()));
  useEffect(() => {
    const me = self.current;
    copies.add(me);
    return () => { copies.delete(me); };
  }, []);
  const save = (p: Partial<SizeSaved>) => setS((o) => {
    const n = { ...o, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* storage blocked */ }
    queueMicrotask(() => copies.forEach((f) => f !== self.current && f()));
    return n;
  });

  const acc = accounts.find((a) => a.id === s.acc) ?? accounts[0];
  const mine = useMemo(() => (acc ? trades.filter((t) => t.accountId === acc.id).sort((a, b) => (b.entryTime ?? "").localeCompare(a.entryTime ?? "")) : []), [acc, trades]);
  const symbols = useMemo(() => [...new Set(mine.map((t) => t.symbol).filter(Boolean))].slice(0, 30), [mine]);
  const sym = s.sym || symbols[0] || "";
  const cur = (acc?.currency || opts.cur || "USD").toUpperCase();
  const journal = opts.journal !== false;

  const r = useMemo(() => {
    if (!acc && opts.balance === undefined) return null;
    const bal = opts.balance !== undefined ? opts.balance : acc ? currentBalance(acc, trades, balances[acc.id] ?? [], flows) : NaN;
    const sp = symbolSpec(sym);
    const contract = sp.contract ?? parseNum(s.contracts[sym.toUpperCase()] ?? "");
    const e = parseNum(entry), st = parseNum(stop);
    const res = positionSize({ balance: bal, mode: s.mode, pct: parseNum(s.pct), amt: parseNum(s.amt), spec: sp, contract, entry: e, stop: st, cur, rate: parseNum(s.rates[`${sp.quote}${cur}`] ?? "") });
    // prop challenges on this account that are still running: a third of the room left before a rule breaks
    const today = todayFor(acc);
    const safe = !journal || !acc ? null : readChallenges().filter((c) => c.accountId === acc.id).map((c) => ({ c, st: challengeState(c, trades, today) }))
      .filter((x) => x.st.status === "active" && x.st.risk).map((x) => ({ name: x.c.name, v: (x.st.risk as { amount: number }).amount / 3 }))
      .sort((a, b) => a.v - b.v)[0] ?? null;
    return { bal, sp, contract, ...res, safe, e, st };
  }, [acc, trades, balances, flows, sym, s, entry, stop, cur, journal, opts.balance]);

  return { s, save, acc, symbols, sym, cur, entry, setEntry, stop, setStop, r };
}
