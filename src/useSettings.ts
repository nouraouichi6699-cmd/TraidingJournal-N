import { useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import { setNumberLocale } from "./lib/numberFormat";

// The settings page's own store. One synced key so the whole lot travels together (settingsSync pushes it like the
// other user_settings rows). Theme, language and the live privacy toggle are not in here: they keep the per-device
// keys they have always used, and this page only drives their existing setters.

export type WeekStart = "mon" | "sun";
export type FontSize = "small" | "normal" | "large";
/** "dot" is 1,234.56; "space" is 1 234,56. */
export type NumberFormat = "dot" | "space";

export interface Settings {
  weekStart: WeekStart;
  /** Start every visit with balances hidden. The toggle in the header stays per-device either way. */
  privacyAtOpen: boolean;
  /** Treated exactly like the system's "reduce motion", on top of it. */
  reduceMotion: boolean;
  fontSize: FontSize;
  numberFormat: NumberFormat;
  /** The account the dashboard opens on; "all" is every account, as its filter already means. */
  defaultAccount: string;
  /** The size calculator's starting risk, as a percent string, which is how it stores it. */
  riskPct: string;
}

// Every default is what the app did before this page existed, so switching nothing changes nothing.
export const DEFAULTS: Settings = {
  weekStart: "mon",
  privacyAtOpen: false,
  reduceMotion: false,
  fontSize: "normal",
  numberFormat: "dot",
  defaultAccount: "all",
  riskPct: "1",
};

export const FONT_PX: Record<FontSize, string> = { small: "15px", normal: "16px", large: "17.5px" };
const LOCALE: Record<NumberFormat, string> = { dot: "en-US", space: "fr-FR" };

const KEY = "mizan-settings";
const subs = new Set<() => void>();

const read = (): Settings => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return raw && typeof raw === "object" ? { ...DEFAULTS, ...(raw as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

let current = read();

/** Everything outside React that a setting controls: the number locale, and the two attributes the CSS reads. */
function apply(s: Settings) {
  setNumberLocale(LOCALE[s.numberFormat] ?? LOCALE.dot);
  try {
    const root = document.documentElement;
    root.setAttribute("data-font", s.fontSize);
    if (s.reduceMotion) root.setAttribute("data-reduce-motion", "1");
    else root.removeAttribute("data-reduce-motion");
  } catch { /* no document: nothing to style */ }
}

/** Called once before the app mounts, and again after a sync pulls a newer copy from another device. */
export function loadSettings() {
  current = read();
  apply(current);
  subs.forEach((f) => f());
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked */ }
  apply(current);
  subs.forEach((f) => f());
}

export const readSettings = () => current;

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => current,
    () => current,
  );
}

/** The system's preference or ours, whichever asks for less movement. */
export function useReduceMotion(): boolean {
  const system = useReducedMotion();
  return useSettings().reduceMotion || !!system;
}
