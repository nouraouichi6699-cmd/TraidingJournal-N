import { useSyncExternalStore } from "react";

// Dashboard edit mode (pencil in the header). Session only.
let editing = false;
const subs = new Set<() => void>();
export const setDashEdit = (v: boolean) => { editing = v; subs.forEach((f) => f()); };
export function useDashEdit() {
  const e = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => editing);
  return { editing: e, toggle: () => setDashEdit(!editing), set: setDashEdit };
}
