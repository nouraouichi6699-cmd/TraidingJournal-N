// The trader's own strategies and the strategy of each trade, kept in synced settings so they follow the trader to
// every device: "mizan-my-strategies" (ids, in the order added) and "mizan-trade-strategy" ({ trade key: id }).
// A strategy used on a trade joins the trader's own. Unknown ids (a strategy no longer in the library) are left out.
import { STRATEGIES, type Id } from "./strategies";
import type { Trade } from "../types";

export const MINE_KEY = "mizan-my-strategies", LINK_KEY = "mizan-trade-strategy";
const KNOWN = new Set<string>(STRATEGIES.map((s) => s.id));
const isId = (v: unknown): v is Id => typeof v === "string" && KNOWN.has(v);

const read = (k: string): unknown => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked: kept on screen only */ } };

export function readMine(): Id[] {
  const v = read(MINE_KEY);
  return Array.isArray(v) ? [...new Set(v.filter(isId))] : [];
}

/** Adds a strategy to the trader's own (at the end) or takes it out. */
export function setMine(id: Id, on: boolean): Id[] {
  const rest = readMine().filter((x) => x !== id), next = on ? [...rest, id] : rest;
  write(MINE_KEY, next);
  return next;
}

export function readLinks(): Record<string, Id> {
  const v = read(LINK_KEY);
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, id]) => isId(id))) as Record<string, Id>;
}

/** Links a trade to a strategy, or unlinks it with null. */
export function linkTrade(key: string, id: Id | null): Record<string, Id> {
  const all = readLinks();
  if (id) all[key] = id; else delete all[key];
  write(LINK_KEY, all);
  if (id && !readMine().includes(id)) setMine(id, true);
  return all;
}

export interface StrategyResults { linked: number; closed: number; wins: number; net: number; winRate: number | null }

/** The results of the trades linked to a strategy: closed trades, wins, net P&L. */
export function resultsOf(id: Id, trades: Trade[], links: Record<string, Id>): StrategyResults {
  const mine = trades.filter((t) => links[t.key] === id), closed = mine.filter((t) => t.status === "closed" && t.pnl != null);
  const wins = closed.filter((t) => (t.pnl as number) > 0).length;
  return { linked: mine.length, closed: closed.length, wins, net: closed.reduce((a, t) => a + (t.pnl as number), 0), winRate: closed.length ? (wins / closed.length) * 100 : null };
}
