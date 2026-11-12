// Mood before / after each trade, kept in the synced setting "mizan-trade-mood"
// ({ [trade key]: { before?, after? } }). Uses the same five moods as the daily mood (dayNotes.MOODS).
// A trade with neither mood has no entry. Separate from the trade data and from mizan-trade-notes.
import { MOODS, type MoodId } from "./dayNotes";
const KEY = "mizan-trade-mood";

export interface TradeMood { before?: MoodId; after?: MoodId }
export type TradeMoods = Record<string, TradeMood>;

const isMood = (v: unknown): v is MoodId => typeof v === "string" && MOODS.some((m) => m.id === v);

/** Parses the stored JSON, dropping anything that isn't a well-formed entry. Never throws. */
export function parseTradeMoods(raw: string | null): TradeMoods {
  let v: unknown;
  try { v = JSON.parse(raw ?? "null"); } catch { return {}; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: TradeMoods = {};
  for (const [key, e] of Object.entries(v as Record<string, unknown>)) {
    if (!e || typeof e !== "object") continue;
    const { before, after } = e as Record<string, unknown>;
    const entry: TradeMood = {};
    if (isMood(before)) entry.before = before;
    if (isMood(after)) entry.after = after;
    if (entry.before || entry.after) out[key] = entry;
  }
  return out;
}

/** A new map with one side patched: `null` clears it; an entry left empty is removed. Does not mutate `all`. */
export function applyTradeMood(all: TradeMoods, tradeKey: string, when: "before" | "after", mood: MoodId | null): TradeMoods {
  const next: TradeMoods = { ...all };
  const entry: TradeMood = { ...next[tradeKey] };
  if (mood && isMood(mood)) entry[when] = mood; else delete entry[when];
  if (entry.before || entry.after) next[tradeKey] = entry; else delete next[tradeKey];
  return next;
}

export const readMoods = (): TradeMoods => {
  try { return parseTradeMoods(localStorage.getItem(KEY)); } catch { return {}; }
};

export const moodOf = (tradeKey: string): TradeMood => readMoods()[tradeKey] ?? {};

export function saveMood(tradeKey: string, when: "before" | "after", mood: MoodId | null) {
  try { localStorage.setItem(KEY, JSON.stringify(applyTradeMood(readMoods(), tradeKey, when, mood))); } catch { /* storage full or blocked: stays on screen only */ }
}
