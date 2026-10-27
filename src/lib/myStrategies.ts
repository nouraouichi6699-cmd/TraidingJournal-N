// The trader's own strategies and the strategy of each trade, kept in synced settings so they follow the trader to
// every device: "mizan-my-strategies" (ids, in the order added) and "mizan-trade-strategy" ({ trade key: id }).
// An id is a library strategy or one the trader made (lib/customStrategies). A strategy used on a trade joins the
// trader's own. Readers leave out ids that no longer exist; writers keep links to the trader's strategies even before
// those arrive from another device.
import { STRATEGIES, type Id } from "./strategies";
import { isCustomId, readCustom, removeCustom, type CustomId, type CustomStrategy } from "./customStrategies";
import type { Trade } from "../types";

export type AnyId = Id | CustomId;
export const MINE_KEY = "mizan-my-strategies", LINK_KEY = "mizan-trade-strategy";
const LIBRARY = new Set<string>(STRATEGIES.map((s) => s.id));
const valid = (v: unknown): v is AnyId => (typeof v === "string" && LIBRARY.has(v)) || isCustomId(v);
const known = () => { const c = new Set<string>(readCustom().map((x) => x.id)); return (v: AnyId) => LIBRARY.has(v) || c.has(v); };

const read = (k: string): unknown => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked: kept on screen only */ } };
const rawMine = (): AnyId[] => { const v = read(MINE_KEY); return Array.isArray(v) ? [...new Set(v.filter(valid))] : []; };
const rawLinks = (): Record<string, AnyId> => {
  const v = read(LINK_KEY);
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, id]) => valid(id))) as Record<string, AnyId>;
};

export function readMine(): AnyId[] {
  const ok = known();
  return rawMine().filter(ok);
}

/** Adds a strategy to the trader's own (at the end) or takes it out. */
export function setMine(id: AnyId, on: boolean): AnyId[] {
  const rest = rawMine().filter((x) => x !== id);
  write(MINE_KEY, on ? [...rest, id] : rest);
  return readMine();
}

export function readLinks(): Record<string, AnyId> {
  const ok = known();
  return Object.fromEntries(Object.entries(rawLinks()).filter(([, id]) => ok(id)));
}

/** Links a trade to a strategy, or unlinks it with null. */
export function linkTrade(key: string, id: AnyId | null): Record<string, AnyId> {
  const all = rawLinks();
  if (id) all[key] = id; else delete all[key];
  write(LINK_KEY, all);
  if (id && !rawMine().includes(id)) setMine(id, true);
  return readLinks();
}

/** Deletes one of the trader's own strategies: out of their list and off every trade linked to it (the trades stay). */
export function deleteCustom(id: CustomId) {
  removeCustom(id);
  write(LINK_KEY, Object.fromEntries(Object.entries(rawLinks()).filter(([, v]) => v !== id)));
  write(MINE_KEY, rawMine().filter((x) => x !== id));
}

/** What to show for a strategy id: its name, a short name for chips, and the color of the trader's own. */
export interface Shown { id: AnyId; name: string; short: string; color?: string }
export function shownOf(id: AnyId, custom: CustomStrategy[]): Shown | undefined {
  const s = STRATEGIES.find((x) => x.id === id);
  if (s) return { id, name: s.name, short: s.short };
  const c = custom.find((x) => x.id === id);
  return c ? { id, name: c.name, short: c.name, color: c.color } : undefined;
}

export interface StrategyResults { linked: number; closed: number; wins: number; net: number; winRate: number | null }

/** The results of the trades linked to a strategy: closed trades, wins, net P&L. */
export function resultsOf(id: AnyId, trades: Trade[], links: Record<string, AnyId>): StrategyResults {
  const mine = trades.filter((t) => links[t.key] === id), closed = mine.filter((t) => t.status === "closed" && t.pnl != null);
  const wins = closed.filter((t) => (t.pnl as number) > 0).length;
  return { linked: mine.length, closed: closed.length, wins, net: closed.reduce((a, t) => a + (t.pnl as number), 0), winRate: closed.length ? (wins / closed.length) * 100 : null };
}
