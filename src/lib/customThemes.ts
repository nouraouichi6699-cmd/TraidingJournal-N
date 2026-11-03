import type { Theme } from "../types";
import { DEFAULT_LIGHTING, type CardColor, type LightColor, type LightSpeed, type LightStyle, type Trio } from "./lighting";

/** The per-theme look: everything that changes how the lighting and cards look. playing and recentColors are global. */
export interface ThemeLook {
  style: LightStyle;
  color: LightColor;
  custom: Trio;
  solid: string;
  level: number;
  speed: LightSpeed;
  cardColor: CardColor;
  cardSolid: string;
  cardLevel: number;
}

export interface CustomTheme {
  id: string;
  name: string;
  base: Theme;
  look: ThemeLook;
}

export const MY_THEME_ID = "ct_1";

export const DEFAULT_LOOK: ThemeLook = {
  style: DEFAULT_LIGHTING.style,
  color: DEFAULT_LIGHTING.color,
  custom: DEFAULT_LIGHTING.custom,
  solid: DEFAULT_LIGHTING.solid,
  level: DEFAULT_LIGHTING.level,
  speed: DEFAULT_LIGHTING.speed,
  cardColor: DEFAULT_LIGHTING.cardColor,
  cardSolid: DEFAULT_LIGHTING.cardSolid,
  cardLevel: DEFAULT_LIGHTING.cardLevel,
};

const BUILT_INS: readonly string[] = ["dark", "light", "black"];

export function isBuiltIn(id: string): id is Theme {
  return BUILT_INS.includes(id);
}

export function looksEqual(a: ThemeLook, b: ThemeLook): boolean {
  return a.style === b.style && a.color === b.color
    && a.custom.a === b.custom.a && a.custom.b === b.custom.b && a.custom.c === b.custom.c
    && a.solid === b.solid && a.level === b.level && a.speed === b.speed
    && a.cardColor === b.cardColor && a.cardSolid === b.cardSolid && a.cardLevel === b.cardLevel;
}

export function isDefaultLook(look: ThemeLook): boolean {
  return looksEqual(look, DEFAULT_LOOK);
}

export function extractLook(l: {
  style: LightStyle; color: LightColor; custom: Trio; solid: string;
  level: number; speed: LightSpeed; cardColor: CardColor; cardSolid: string; cardLevel: number;
}): ThemeLook {
  return {
    style: l.style, color: l.color, custom: { ...l.custom }, solid: l.solid,
    level: l.level, speed: l.speed,
    cardColor: l.cardColor, cardSolid: l.cardSolid, cardLevel: l.cardLevel,
  };
}

export function resolveTheme(
  activeId: string, customs: CustomTheme[], deviceTheme: Theme,
): { base: Theme; look: ThemeLook } {
  if (!activeId || isBuiltIn(activeId)) {
    return { base: isBuiltIn(activeId) ? activeId : deviceTheme, look: DEFAULT_LOOK };
  }
  const ct = customs.find((c) => c.id === activeId);
  if (ct) {
    const look = { ...ct.look };
    if (look.style !== "full" && look.style !== "off") look.style = "off";
    return { base: ct.base, look };
  }
  return { base: deviceTheme, look: DEFAULT_LOOK };
}

/** Get the single "My theme", or null if none exists. */
export function getMyTheme(customs: CustomTheme[]): CustomTheme | null {
  return customs.length > 0 ? customs[0] : null;
}

/** Create "My theme" from a built-in base and a look. Returns the new array. */
export function createMyTheme(
  base: Theme, look: ThemeLook, name: string,
): { created: CustomTheme; customs: CustomTheme[] } {
  const created: CustomTheme = { id: MY_THEME_ID, name, base, look: { ...look, custom: { ...look.custom } } };
  return { created, customs: [created] };
}

/** Delete "My theme". Returns the empty array and the base to fall back to. */
export function deleteMyTheme(customs: CustomTheme[]): { customs: CustomTheme[]; fallbackBase: Theme } {
  const ct = customs[0];
  return { customs: [], fallbackBase: ct?.base ?? "dark" };
}

export function updateLook(customs: CustomTheme[], id: string, patch: Partial<ThemeLook>): CustomTheme[] {
  return customs.map((c) => (c.id === id ? { ...c, look: { ...c.look, ...patch } } : c));
}

/** Migrate old multi-theme arrays: keep only the first (or the active one), rename it, give it the canonical id. */
export function migrateToSingle(customs: CustomTheme[], activeId: string, name: string): CustomTheme[] {
  if (customs.length === 0) return [];
  const pick = customs.find((c) => c.id === activeId) ?? customs[0];
  return [{ ...pick, id: MY_THEME_ID, name }];
}
