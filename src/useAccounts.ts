import { useCallback, useState } from "react";
import type { Account } from "./types";

const KEY = "mizan-accounts";

const load = (): Account[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>(load);

  const persist = (next: Account[]) => {
    setAccounts(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  const add = useCallback(
    (a: Omit<Account, "id" | "createdAt">) =>
      persist([
        ...accounts,
        { ...a, id: crypto.randomUUID(), createdAt: Date.now() },
      ]),
    [accounts]
  );

  const remove = useCallback(
    (id: string) => persist(accounts.filter((a) => a.id !== id)),
    [accounts]
  );

  return { accounts, add, remove };
}
