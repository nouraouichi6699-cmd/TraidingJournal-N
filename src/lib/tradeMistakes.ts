// Mistake tags per trade, kept in the synced setting "mizan-trade-mistakes" ({ [trade key]: tag id[] }).
// A trade can have zero or several tags; a trade with none has no entry. Separate from the trade data and notes.
import type { Lang } from "../types";
const KEY = "mizan-trade-mistakes";

/** The fixed tag set. The stored value is the id; labels are en / ar / fr. */
export const MISTAKES = [
  { id: "fomo", label: { en: "FOMO", ar: "الخوف من الفوات", fr: "FOMO" } },
  { id: "moved-sl", label: { en: "Moved stop loss", ar: "حرّكت وقف الخسارة", fr: "Stop loss déplacé" } },
  { id: "no-sl", label: { en: "No stop loss", ar: "بدون وقف خسارة", fr: "Pas de stop loss" } },
  { id: "oversized", label: { en: "Oversized position", ar: "حجم مركز كبير", fr: "Position trop grosse" } },
  { id: "revenge", label: { en: "Revenge trade", ar: "صفقة انتقام", fr: "Trade de revanche" } },
  { id: "ignored-plan", label: { en: "Ignored the plan", ar: "تجاهلت الخطة", fr: "Plan ignoré" } },
  { id: "overtraded", label: { en: "Overtraded", ar: "إفراط في التداول", fr: "Surtrading" } },
  { id: "chased", label: { en: "Chased price", ar: "طاردت السعر", fr: "Poursuite du prix" } },
  { id: "held-long", label: { en: "Held too long", ar: "أبقيتها طويلاً", fr: "Gardé trop longtemps" } },
  { id: "closed-early", label: { en: "Closed too early", ar: "أغلقتها مبكراً", fr: "Clôturé trop tôt" } },
] as const satisfies readonly { id: string; label: Record<Lang, string> }[];
export type MistakeId = (typeof MISTAKES)[number]["id"];

export type TradeMistakes = Record<string, MistakeId[]>;

const isTag = (v: unknown): v is MistakeId => typeof v === "string" && MISTAKES.some((m) => m.id === v);

/** Parses the stored JSON: unknown tags and duplicates dropped, empty entries removed. Never throws. */
export function parseTradeMistakes(raw: string | null): TradeMistakes {
  let v: unknown;
  try { v = JSON.parse(raw ?? "null"); } catch { return {}; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: TradeMistakes = {};
  for (const [key, e] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(e)) continue;
    const tags = [...new Set(e.filter(isTag))];
    if (tags.length) out[key] = tags;
  }
  return out;
}

/** A new map with the tag toggled on/off for the trade; an emptied list is removed. Does not mutate `all`. */
export function toggleTradeMistake(all: TradeMistakes, tradeKey: string, tag: MistakeId): TradeMistakes {
  const next: TradeMistakes = { ...all };
  const cur = next[tradeKey] ?? [];
  const tags = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
  if (tags.length) next[tradeKey] = tags; else delete next[tradeKey];
  return next;
}

export const readMistakes = (): TradeMistakes => {
  try { return parseTradeMistakes(localStorage.getItem(KEY)); } catch { return {}; }
};

export const mistakesOf = (tradeKey: string): MistakeId[] => readMistakes()[tradeKey] ?? [];

/** Toggles one tag and persists; returns the trade's new tag list. */
export function toggleMistake(tradeKey: string, tag: MistakeId): MistakeId[] {
  const next = toggleTradeMistake(readMistakes(), tradeKey, tag);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked: stays on screen only */ }
  return next[tradeKey] ?? [];
}
