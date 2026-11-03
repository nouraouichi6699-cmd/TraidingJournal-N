import { useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import { setNumberLocale } from "./lib/numberFormat";
import { setBreakEvenRange } from "./lib/outcome";
import { DEFAULT_LIGHTING, type Lighting } from "./lib/lighting";
import { DEFAULT_BOUNDS, setAnalysisSettings, type BrokerClock, type DayStart, type SessionBounds } from "./lib/tradingTime";
import { DEFAULT_LOOK, extractLook, migrateIfNeeded, nextFreeNumber, type CustomTheme } from "./lib/customThemes";
import { stT } from "./i18n";
import type { Lang } from "./types";

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

  // ---- what the analytics read out of a trade's times ----
  /** Where the broker stamps its times, for any account without one of its own. */
  brokerClock: BrokerClock;
  /** Per-account overrides of the above. */
  brokerByAccount: Record<string, BrokerClock>;
  /** Where a trading day begins when trades are grouped by day. */
  dayStart: DayStart;
  /** The UTC hours the analysis sessions change at. */
  sessionBounds: SessionBounds;
  /** A trade whose result is this size or smaller counts as break-even. 0 keeps today's win/loss split. */
  breakEven: number;

  // ---- money across accounts in different currencies ----
  /** Off keeps today's behaviour: amounts are summed exactly as they are stored. */
  unifyCurrency: boolean;
  /** The currency the all-accounts views report in when unifyCurrency is on. */
  baseCurrency: string;
  /** Units of <code> per 1 base, the way Frankfurter quotes them. Typed in by hand or fetched. */
  rates: Record<string, number>;
  /** The day the fetched rates are from, as the service reports it. */
  ratesDate: string;

  /** The light behind the app. Absent in settings saved before it existed, which read as the defaults. */
  lighting: Lighting;

  /** User-created themes. Each carries its own look; playing and recentColors stay global in lighting. */
  customThemes: CustomTheme[];
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
  brokerClock: { kind: "none" },
  brokerByAccount: {},
  dayStart: "midnight",
  sessionBounds: DEFAULT_BOUNDS,
  breakEven: 0,
  unifyCurrency: false,
  baseCurrency: "USD",
  rates: {},
  ratesDate: "",
  lighting: DEFAULT_LIGHTING,
  customThemes: [],
};

export type { BrokerClock, DayStart, SessionBounds };
export type { Lighting };
export type { CustomTheme };

/** Where a link into Settings wants to land. */
export interface SettingsStart { section: string; topic?: string }

/** Asking the app to open Settings at one place, the way the other cross-screen nudges are sent. */
export const OPEN_SETTINGS = "mizan-open-settings";
export const openSettings = (section: string, topic?: string) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<SettingsStart>(OPEN_SETTINGS, { detail: { section, topic } }));
};

export const FONT_PX: Record<FontSize, string> = { small: "15px", normal: "16px", large: "17.5px" };
const LOCALE: Record<NumberFormat, string> = { dot: "en-US", space: "fr-FR" };

const KEY = "mizan-settings";
const subs = new Set<() => void>();

const read = (): Settings => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULTS;
    const saved = raw as Partial<Settings>;
    return {
      ...DEFAULTS, ...saved,
      lighting: { ...DEFAULT_LIGHTING, ...(saved.lighting ?? {}) },
      customThemes: Array.isArray(saved.customThemes) ? saved.customThemes : [],
    };
  } catch {
    return DEFAULTS;
  }
};

let current = read();

// ---- per-device active theme (not synced) ----
const AT_KEY = "mizan-active-theme";
let currentActiveTheme = "";
try { currentActiveTheme = localStorage.getItem(AT_KEY) ?? ""; } catch {}

export const readActiveTheme = (): string => currentActiveTheme;

export function setActiveTheme(id: string) {
  currentActiveTheme = id;
  try { localStorage.setItem(AT_KEY, id); } catch {}
  subs.forEach((f) => f());
}

export function useActiveTheme(): string {
  useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => currentActiveTheme,
    () => currentActiveTheme,
  );
  return currentActiveTheme;
}

/** Everything outside React that a setting controls: the number locale, and the two attributes the CSS reads. */
function apply(s: Settings) {
  setNumberLocale(LOCALE[s.numberFormat] ?? LOCALE.dot);
  // The analytics read these through tradingTime, which keeps its own copy so the pure files need no React.
  setBreakEvenRange(s.breakEven ?? 0);
  setAnalysisSettings({
    bounds: s.sessionBounds ?? DEFAULT_BOUNDS,
    dayStart: s.dayStart ?? "midnight",
    clock: s.brokerClock ?? { kind: "none" },
    byAccount: s.brokerByAccount ?? {},
  });
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

  // Migration: first load after the update. Each device checks independently before sync runs.
  try {
    if (localStorage.getItem(AT_KEY) === null) {
      const customs = current.customThemes;
      if (customs.length > 0) {
        // Another device already migrated and synced. Activate the first custom theme.
        currentActiveTheme = customs[0].id;
        localStorage.setItem(AT_KEY, customs[0].id);
      } else {
        const oldLook = extractLook(current.lighting);
        const deviceTheme = (localStorage.getItem("mizan-theme") ?? "dark") as "dark" | "light" | "black";
        const lang = (localStorage.getItem("mizan-lang") ?? "en") as Lang;
        const L = stT(lang);
        const n = nextFreeNumber(customs);
        const name = L("myThemeN").replace("{n}", String(n));
        const result = migrateIfNeeded(oldLook, deviceTheme, customs, name);
        if (result) {
          current = {
            ...current,
            customThemes: result.customs,
            lighting: { ...current.lighting, ...DEFAULT_LOOK },
          };
          currentActiveTheme = result.created.id;
          localStorage.setItem(AT_KEY, result.created.id);
          localStorage.setItem(KEY, JSON.stringify(current));
        } else {
          currentActiveTheme = "";
          localStorage.setItem(AT_KEY, "");
        }
      }
    } else {
      currentActiveTheme = localStorage.getItem(AT_KEY) ?? "";
    }
  } catch { /* storage errors are not fatal */ }

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
