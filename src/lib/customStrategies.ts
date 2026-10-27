// The trader's own strategies: a name, a color, the indicators and tools it uses and, if they like, an entry
// checklist, a stop, a target and notes. Kept in the synced setting "mizan-custom-strategies" so they follow the trader
// to every device. Their ids start with "c-", so they never meet the library's.
import { TOOL_BY_ID } from "./tools";

export type CustomId = `c-${string}`;
export interface CustomStrategy { id: CustomId; name: string; color: string; tools: string[]; check: string[]; stop: string; target: string; notes: string; at: number }

export const CUSTOM_KEY = "mizan-custom-strategies";
export const COLORS = ["#f5b83d", "#22c55e", "#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#f87171", "#2dd4bf", "#facc15", "#60a5fa", "#c084fc", "#94a3b8"];
export const LIMITS = { name: 40, check: 12, line: 200, field: 500, notes: 2000 };

export const isCustomId = (v: unknown): v is CustomId => typeof v === "string" && /^c-[a-z0-9]{4,24}$/.test(v);
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max).trim() : "");

/** A strategy made safe to keep: unknown tools left out, texts cut to size, empty lines dropped, a color always set. */
export function cleanCustom(v: unknown): CustomStrategy | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>, name = str(o.name, LIMITS.name);
  if (!isCustomId(o.id) || !name) return null;
  return {
    id: o.id, name,
    color: isHex(o.color) ? o.color.toLowerCase() : COLORS[0],
    tools: Array.isArray(o.tools) ? [...new Set(o.tools.filter((t): t is string => typeof t === "string" && TOOL_BY_ID.has(t)))] : [],
    check: Array.isArray(o.check) ? o.check.map((x) => str(x, LIMITS.line)).filter(Boolean).slice(0, LIMITS.check) : [],
    stop: str(o.stop, LIMITS.field), target: str(o.target, LIMITS.field), notes: str(o.notes, LIMITS.notes),
    at: typeof o.at === "number" && Number.isFinite(o.at) ? o.at : 0,
  };
}

export function readCustom(): CustomStrategy[] {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "null");
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>(), out: CustomStrategy[] = [];
    for (const c of v.map(cleanCustom)) if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
    return out;
  } catch {
    return [];
  }
}
const write = (list: CustomStrategy[]) => {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mizan-strategies")); // see myStrategies.CHANGED
};

/** Black or white, whichever reads better on a color. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16), luma = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luma > 0.55 ? "#0b0b0b" : "#ffffff";
}

export const newCustomId = (): CustomId => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Saves a strategy, new or edited (cleaned first; a strategy with no name is not kept). */
export function saveCustom(c: CustomStrategy): CustomStrategy[] {
  const ok = cleanCustom(c), list = readCustom();
  if (!ok) return list;
  const next = list.some((x) => x.id === ok.id) ? list.map((x) => (x.id === ok.id ? ok : x)) : [...list, ok];
  write(next);
  return next;
}

/** Takes a strategy out of the list (myStrategies.deleteCustom also unlinks its trades). */
export function removeCustom(id: CustomId): CustomStrategy[] {
  const next = readCustom().filter((x) => x.id !== id);
  write(next);
  return next;
}
