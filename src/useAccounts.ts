import { useRef, useState } from "react";
import type { Account } from "./types";

const KEY = "mizan-accounts";

const load = (): Account[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>(load);
  // Latest list, readable synchronously (several files may be imported in one go).
  const ref = useRef<Account[]>(accounts);

  const commit = (next: Account[]) => {
    ref.current = next;
    setAccounts(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  const add = (a: Omit<Account, "id" | "createdAt">): Account => {
    const acc: Account = { ...a, id: crypto.randomUUID(), createdAt: Date.now() };
    commit([...ref.current, acc]);
    return acc;
  };

  const remove = (id: string) => commit(ref.current.filter((a) => a.id !== id));

  /**
   * Finds the MT5 account an imported report belongs to (by account number),
   * adopts an MT5 account that has no number yet, or creates a new one.
   */
  const resolveMt5 = (info: {
    login: string | null;
    currency: string | null;
    server: string | null;
    deposit: number | null;
    preferId?: string;
  }): { account: Account; created: boolean } => {
    const list = ref.current;
    const mt5 = list.filter((a) => a.platform === "mt5");
    const byLogin = info.login ? mt5.find((a) => a.login === info.login) : undefined;
    if (byLogin) return { account: byLogin, created: false };

    const adoptable = mt5.find((a) => a.id === info.preferId && !a.login) ?? mt5.find((a) => !a.login);
    if (adoptable) {
      const next = {
        ...adoptable,
        ...(info.login ? { login: info.login } : {}),
        ...(info.server ? { server: info.server } : {}),
        ...(info.currency ? { currency: info.currency } : {}),
      };
      commit(list.map((a) => (a.id === adoptable.id ? next : a)));
      return { account: next, created: false };
    }

    const account = add({
      platform: "mt5",
      name: info.login ? `MT5 ${info.login}` : "MetaTrader 5",
      currency: info.currency ?? "USD",
      startBalance: info.deposit ?? 0,
      ...(info.login ? { login: info.login } : {}),
      ...(info.server ? { server: info.server } : {}),
    });
    return { account, created: true };
  };

  return { accounts, add, remove, resolveMt5 };
}
