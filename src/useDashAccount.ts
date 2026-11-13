import { useSyncExternalStore } from "react";
import { readSettings } from "./useSettings";

// The account the dashboard is filtered on ("all" = every account), shared so the header can show its badge. The
// dashboard owns the choice and publishes it here; this only mirrors it, starting from what the dashboard would start
// from (its saved filter, else the Settings default) so the header is right before the dashboard has mounted.
const FILTER = "mizan-dash-filter";
const start = (): string => {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER) || "{}")?.acc;
    if (typeof saved === "string" && saved) return saved;
  } catch { }
  return readSettings().defaultAccount || "all";
};
let acc = start();
const subs = new Set<() => void>();
export const setDashAccount = (id: string) => { if (id === acc) return; acc = id; subs.forEach((f) => f()); };
export function useDashAccount(): string {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => acc);
}
