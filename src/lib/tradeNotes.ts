// One free-text note per trade (why it was taken, how it felt), kept in the synced setting "mizan-trade-notes"
// ({ [trade key]: text }), so a note written on one device shows on the others. An emptied note is removed.
const KEY = "mizan-trade-notes";
const MAX = 2000;

export function readNotes(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export const noteOf = (tradeKey: string) => readNotes()[tradeKey] ?? "";

export function saveNote(tradeKey: string, text: string) {
  const all = readNotes();
  if (text.trim()) all[tradeKey] = text.slice(0, MAX);
  else delete all[tradeKey];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked: the note stays on screen only */ }
}
