// What the calculators share outside their page: the position-size state used both by the header's dropdown and by
// the Calculators page (same "mizan-size-calc" key, so both show the same values, kept in step while both are open),
// and the event that opens the page on a given calculator from anywhere, the way "mizan-open-settings" opens Settings.
import { useEffect, useMemo, useRef, useState } from "react";
import { readSettings } from "./useSettings";
import type { Account, BalancePoint, Trade } from "./types";
import type { CashFlow } from "./lib/cashflow";
import { currentBalance } from "./lib/balance";
import { challengeState, readChallenges } from "./lib/challenge";
import { lotsFromBalanceRule, parseNum, pipSizeFor, pipsToDistance, positionSize, symbolSpec, type DistUnit } from "./lib/calcCore";
import { todayFor } from "./components/challengeUi";

/** Asking the app to open the Charts view (from calculator links). */
export const OPEN_CHARTS = "mizan-open-charts";
export const openCharts = () => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_CHARTS)); };

/** Asking the app to open the Calculators page, on one calculator (its key) or on the list (no key). */
export const OPEN_CALCULATOR = "mizan-open-calculator";
export interface CalcNav { key?: string | null }
export const openCalculator = (key?: string | null) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<CalcNav>(OPEN_CALCULATOR, { detail: { key: key ?? null } }));
};

const KEY = "mizan-size-calc";
/** `unit`: the stop typed in pips (the default) or as entry and stop prices. `pipSizes`: the pip size typed per symbol
 *  (anything but forex), shared with the other calculators that count in pips. */
export type SizeSaved = { acc: string; mode: "pct" | "amt" | "balance"; pct: string; amt: string; unitAmt: string; lotsPerUnit: string; sym: string; contracts: Record<string, string>; rates: Record<string, string>; unit: DistUnit; pipSizes: Record<string, string> };
// The default risk comes from Settings, which itself defaults to the "1" this used to hardcode. Anything already
// saved here wins, so a calculator in use is never reset by the setting.
const fresh = (pct: string): SizeSaved => ({ acc: "", mode: "pct", pct, amt: "", unitAmt: "1000", lotsPerUnit: "0.01", sym: "", contracts: {}, rates: {}, unit: "pips", pipSizes: {} });
const load = (): SizeSaved => { const pct = readSettings().riskPct || "1"; try { return { ...fresh(pct), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return fresh(pct); } };
// Every mounted copy: when one saves, the others read the stored values again.
const copies = new Set<() => void>();
const useCopy = (reload: () => void) => {
  const self = useRef(reload);
  useEffect(() => {
    const me = self.current;
    copies.add(me);
    return () => { copies.delete(me); };
  }, []);
  return () => queueMicrotask(() => copies.forEach((f) => f !== self.current && f()));
};

/**
 * The pip sizes typed per symbol, read from and written to the size calculator's saved state so Position size,
 * Risk/Reward and Profit and loss share them. A write touches only this map: nothing else of the size calculator
 * (its risk, its symbol) gets saved by another calculator.
 */
export function usePipSizes(): [Record<string, string>, (sym: string, v: string) => void] {
  const [map, setMap] = useState<Record<string, string>>(() => load().pipSizes);
  const tell = useCopy(() => setMap(load().pipSizes));
  const set = (sym: string, v: string) => {
    let raw: Record<string, unknown> = {};
    try { const p = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (p && typeof p === "object") raw = p; } catch { /* unreadable: start over */ }
    const pipSizes = { ...(raw.pipSizes && typeof raw.pipSizes === "object" ? (raw.pipSizes as Record<string, string>) : map), [sym.toUpperCase()]: v };
    try { localStorage.setItem(KEY, JSON.stringify({ ...raw, pipSizes })); } catch { /* storage blocked */ }
    setMap(pipSizes);
    tell();
  };
  return [map, set];
}

/**
 * The contract sizes typed per symbol (those the app does not know), the same map Position size saves, so a size typed
 * in either place is found in the other. A write touches only this map.
 */
export function useContracts(): [Record<string, string>, (sym: string, v: string) => void] {
  const [map, setMap] = useState<Record<string, string>>(() => load().contracts ?? {});
  const tell = useCopy(() => setMap(load().contracts ?? {}));
  const set = (sym: string, v: string) => {
    let raw: Record<string, unknown> = {};
    try { const p = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (p && typeof p === "object") raw = p; } catch { /* unreadable: start over */ }
    const contracts = { ...(raw.contracts && typeof raw.contracts === "object" ? (raw.contracts as Record<string, string>) : map), [sym.toUpperCase()]: v };
    try { localStorage.setItem(KEY, JSON.stringify({ ...raw, contracts })); } catch { /* storage blocked */ }
    setMap(contracts);
    tell();
  };
  return [map, set];
}

export interface SizeData { accounts: Account[]; trades: Trade[]; balances: Record<string, BalancePoint[]>; flows: CashFlow[] }
export interface SizeOpts {
  /** A balance to use instead of the account's (typed, or edited on the page). Left out: the account's current balance. */
  balance?: number;
  /** Off: no prop-challenge safe risk (the page's manual mode). */
  journal?: boolean;
  /** The currency when there is no account (the page's manual mode). */
  cur?: string;
}

/** The position size calculator's state and result. Entry and stop (or the stop in pips, and the current price) belong
 *  to each copy; everything else is saved, the Pips | Price choice included. */
export function useSizeCalc({ accounts, trades, balances, flows }: SizeData, opts: SizeOpts = {}) {
  const [s, setS] = useState<SizeSaved>(load);
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [stopPips, setStopPips] = useState("");
  const [price, setPrice] = useState("");
  const tell = useCopy(() => setS(load()));
  const save = (p: Partial<SizeSaved>) => setS((o) => {
    const n = { ...o, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* storage blocked */ }
    tell();
    return n;
  });

  const acc = accounts.find((a) => a.id === s.acc) ?? accounts[0];
  const mine = useMemo(() => (acc ? trades.filter((t) => t.accountId === acc.id).sort((a, b) => (b.entryTime ?? "").localeCompare(a.entryTime ?? "")) : []), [acc, trades]);
  const symbols = useMemo(() => [...new Set(mine.map((t) => t.symbol).filter(Boolean))].slice(0, 30), [mine]);
  const sym = s.sym || symbols[0] || "";
  const cur = (acc?.currency || opts.cur || "USD").toUpperCase();
  const journal = opts.journal !== false;
  const inPips = s.unit !== "price";

  const r = useMemo(() => {
    if (!acc && opts.balance === undefined) return null;
    const bal = opts.balance !== undefined ? opts.balance : acc ? currentBalance(acc, trades, balances[acc.id] ?? [], flows) : NaN;
    const sp = symbolSpec(sym);
    const contract = sp.contract ?? parseNum(s.contracts[sym.toUpperCase()] ?? "");
    const e = parseNum(entry), st = parseNum(stop);
    // in pips: the stop's distance from the pip size (forex's own, else the one typed for this symbol)
    const pip = pipSizeFor(sp, s.pipSizes?.[sym.toUpperCase()]), sPips = parseNum(stopPips), px = parseNum(price);
    const byPips = inPips ? { dist: pipsToDistance(sPips, pip), price: px, pip } : {};
    const res = positionSize({ balance: bal, mode: s.mode === "balance" ? "amt" : s.mode, pct: parseNum(s.pct), amt: parseNum(s.amt), spec: sp, contract, entry: e, stop: st, cur, rate: parseNum(s.rates[`${sp.quote}${cur}`] ?? ""), ...byPips });
    // prop challenges on this account that are still running: a third of the room left before a rule breaks
    const today = todayFor(acc);
    const safe = !journal || !acc ? null : readChallenges().filter((c) => c.accountId === acc.id).map((c) => ({ c, st: challengeState(c, trades, today) }))
      .filter((x) => x.st.status === "active" && x.st.risk).map((x) => ({ name: x.c.name, v: (x.st.risk as { amount: number }).amount / 3 }))
      .sort((a, b) => a.v - b.v)[0] ?? null;
    if (s.mode === "balance") {
      // lots from the balance alone; the risk at that size is a side note when a stop happens to be filled
      const lots = lotsFromBalanceRule(bal, parseNum(s.unitAmt), parseNum(s.lotsPerUnit));
      const side = Number.isFinite(lots) && res.perLot > 0 ? lots * res.perLot : NaN;
      return { bal, sp, contract, ...res, ok: Number.isFinite(lots), lots, real: side, safe: null, e, st, pip, sPips, px };
    }
    return { bal, sp, contract, ...res, safe, e, st, pip, sPips, px };
  }, [acc, trades, balances, flows, sym, s, entry, stop, stopPips, price, inPips, cur, journal, opts.balance]);

  /** The pip size field for this symbol: what was typed for it, else its default (gold 0.1, silver 0.01, others empty). */
  const symKey = sym.toUpperCase();
  const pipField = s.pipSizes?.[symKey] ?? (r && Number.isFinite(r.pip) ? String(r.pip) : "");
  const setPipField = (v: string) => save({ pipSizes: { ...(s.pipSizes ?? {}), [symKey]: v } });

  return { s, save, acc, symbols, sym, cur, inPips, entry, setEntry, stop, setStop, stopPips, setStopPips, price, setPrice, pipField, setPipField, r };
}
