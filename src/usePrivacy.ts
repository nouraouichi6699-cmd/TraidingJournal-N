import { useSyncExternalStore } from "react";

// Privacy mode: hides balances, P&L and account numbers everywhere. Per device, never synced.
const KEY = "mizan-privacy";
let hidden = false;
try { hidden = localStorage.getItem(KEY) === "1"; } catch {}
const subs = new Set<() => void>();

export function setPrivacy(v: boolean) {
  hidden = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {}
  subs.forEach((f) => f());
}

export function usePrivacy() {
  const h = useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => hidden,
  );
  return { hidden: h, toggle: () => setPrivacy(!hidden) };
}
