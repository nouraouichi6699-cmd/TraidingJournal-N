import { useRef, useState } from "react";
import type { BalancePoint, Trade } from "./types";
import type { ParsedTrade } from "./lib/tradingview";

interface Store {
  trades: Trade[];
  balances: Record<string, BalancePoint[]>;
}

const KEY = "mizan-journal";

const load = (): Store => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (p && Array.isArray(p.trades) && p.balances && typeof p.balances === "object") return p;
  } catch {}
  return { trades: [], balances: {} };
};

export function useJournal() {
  const [store, setStore] = useState<Store>(load);
  // Always read the latest data here: several files can be imported in one go.
  const ref = useRef<Store>(store);

  const commit = (next: Store) => {
    ref.current = next;
    setStore(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  const importTrades = (accountId: string, incoming: ParsedTrade[]) => {
    const cur = ref.current;
    const trades = [...cur.trades];
    const index = new Map(trades.map((t, i) => [t.key, i]));
    let added = 0, updated = 0, skipped = 0;
    for (const { orderId, ...rest } of incoming) {
      const key = `${accountId}:${orderId ?? `${rest.symbol}-${rest.no}-${rest.entryTime}`}`;
      const trade: Trade = { ...rest, key, accountId };
      const i = index.get(key);
      if (i === undefined) {
        index.set(key, trades.length);
        trades.push(trade);
        added++;
      } else if (trades[i].status === "open" && trade.status === "closed") {
        trades[i] = trade;
        updated++;
      } else skipped++;
    }
    commit({ ...cur, trades });
    return { added, updated, skipped };
  };

  const importBalance = (accountId: string, points: BalancePoint[]) => {
    const cur = ref.current;
    const known = cur.balances[accountId] ?? [];
    const seen = new Set(known.map((p) => `${p.t}|${p.balance}`));
    const fresh = points.filter((p) => !seen.has(`${p.t}|${p.balance}`));
    const merged = [...known, ...fresh].sort((a, b) => a.t.localeCompare(b.t));
    commit({ ...cur, balances: { ...cur.balances, [accountId]: merged } });
    return { added: fresh.length };
  };

  const purgeAccount = (accountId: string) => {
    const cur = ref.current;
    const { [accountId]: _drop, ...balances } = cur.balances;
    commit({ trades: cur.trades.filter((t) => t.accountId !== accountId), balances });
  };

  return { trades: store.trades, balances: store.balances, importTrades, importBalance, purgeAccount };
}
