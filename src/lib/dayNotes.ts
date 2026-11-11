// One mood + one free-text note per calendar day, kept in the synced setting "mizan-day-notes"
// ({ [YYYY-MM-DD]: { mood?, note? } }), so a day's note written on one device shows on the others.
// A day with neither a mood nor a note has no entry. Pure helpers here; the React store is in useDayNotes.ts.
import type { Lang } from "../types";
export const DAY_NOTES_KEY = "mizan-day-notes";
export const MAX_DAY_NOTE = 2000;

/** The five fixed moods. The picker and every badge read this one list; the stored value is the id. */
export const MOODS = [
  { id: "happy", emoji: "😊" },
  { id: "neutral", emoji: "😐" },
  { id: "down", emoji: "😔" },
  { id: "angry", emoji: "😠" },
  { id: "tired", emoji: "😴" },
] as const;
export type MoodId = (typeof MOODS)[number]["id"];

export interface DayEntry { mood?: string; note?: string }
export type DayNotes = Record<string, DayEntry>;

export const moodEmoji = (id: string | undefined): string | undefined => MOODS.find((m) => m.id === id)?.emoji;

/** Parses the stored JSON, dropping anything that isn't a well-formed day entry. Never throws. */
export function parseDayNotes(raw: string | null): DayNotes {
  let v: unknown;
  try { v = JSON.parse(raw ?? "null"); } catch { return {}; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: DayNotes = {};
  for (const [day, e] of Object.entries(v as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !e || typeof e !== "object") continue;
    const { mood, note } = e as Record<string, unknown>;
    const entry: DayEntry = {};
    if (typeof mood === "string" && moodEmoji(mood)) entry.mood = mood;
    if (typeof note === "string" && note.trim()) entry.note = note.slice(0, MAX_DAY_NOTE);
    if (entry.mood || entry.note) out[day] = entry;
  }
  return out;
}

/** A new map with the day's entry patched: `mood: null` clears the mood, a blank note clears the note, and an
 *  entry left with neither is removed. Does not mutate `all`. */
export function applyDayEntry(all: DayNotes, day: string, patch: { mood?: string | null; note?: string }): DayNotes {
  const next: DayNotes = { ...all };
  const cur = next[day] ?? {};
  const entry: DayEntry = { ...cur };
  if (patch.mood !== undefined) { if (patch.mood && moodEmoji(patch.mood)) entry.mood = patch.mood; else delete entry.mood; }
  if (patch.note !== undefined) { if (patch.note.trim()) entry.note = patch.note.slice(0, MAX_DAY_NOTE); else delete entry.note; }
  if (entry.mood || entry.note) next[day] = entry; else delete next[day];
  return next;
}

export type DayBadge = { kind: "mood"; emoji: string } | { kind: "note" };
/** What a calendar cell shows for the day: its mood emoji, else a note glyph when there's only a note, else nothing. */
export function dayBadge(entry: DayEntry | undefined): DayBadge | null {
  if (!entry) return null;
  const emoji = moodEmoji(entry.mood);
  if (emoji) return { kind: "mood", emoji };
  return entry.note?.trim() ? { kind: "note" } : null;
}

type L3 = [string, string, string]; // en, ar, fr
const idx = (lang: Lang) => (lang === "en" ? 0 : lang === "ar" ? 1 : 2);
export const MOOD_NAMES: Record<MoodId, L3> = {
  happy: ["Happy", "سعيد", "Content"], neutral: ["Neutral", "عادي", "Neutre"], down: ["Down", "حزين", "Abattu"],
  angry: ["Angry", "غاضب", "En colère"], tired: ["Tired", "متعب", "Fatigué"],
};
export const MOOD_WORD: L3 = ["Mood", "المزاج", "Humeur"];
const HAS_NOTE: L3 = ["has a note", "فيه ملاحظة", "avec une note"];
export const moodName = (id: MoodId, lang: Lang): string => MOOD_NAMES[id][idx(lang)];

/** Accessible name for a day's calendar badge ("Mood: Happy · has a note"), or undefined when there's no badge. */
export function dayBadgeLabel(entry: DayEntry | undefined, lang: Lang): string | undefined {
  if (!entry) return undefined;
  const i = idx(lang), parts: string[] = [];
  if (moodEmoji(entry.mood)) parts.push(`${MOOD_WORD[i]}: ${MOOD_NAMES[entry.mood as MoodId][i]}`);
  if (entry.note?.trim()) parts.push(HAS_NOTE[i]);
  return parts.length ? parts.join(" · ") : undefined;
}
