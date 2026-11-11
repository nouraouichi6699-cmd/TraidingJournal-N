import { useSyncExternalStore } from "react";
import { applyDayEntry, DAY_NOTES_KEY, parseDayNotes, type DayNotes } from "./lib/dayNotes";

// Reactive view of the synced "mizan-day-notes" setting. The snapshot is re-parsed only when the stored string
// changes, so a value pulled in by settingsSync is picked up on the next render, like mizan-trade-notes.
const subs = new Set<() => void>();
let lastRaw: string | null | undefined;
let lastVal: DayNotes = {};

function rawNow(): string | null {
  try { return localStorage.getItem(DAY_NOTES_KEY); } catch { return null; }
}
function snapshot(): DayNotes {
  const raw = rawNow();
  if (raw !== lastRaw) { lastRaw = raw; lastVal = parseDayNotes(raw); }
  return lastVal;
}

export const readDayNotes = (): DayNotes => snapshot();

export function setDayEntry(day: string, patch: { mood?: string | null; note?: string }) {
  const next = applyDayEntry(snapshot(), day, patch);
  try {
    // Always written (even as "{}"): a removed key would never sync, so a cleared day would come back from another device.
    localStorage.setItem(DAY_NOTES_KEY, JSON.stringify(next));
  } catch { /* storage full or blocked: the entry stays on screen only */ }
  lastRaw = rawNow(); lastVal = next;
  subs.forEach((f) => f());
}

export function useDayNotes(): DayNotes {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, snapshot, snapshot);
}
