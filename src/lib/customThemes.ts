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

export const MAX_CUSTOM = 10;

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
  if (ct) return { base: ct.base, look: ct.look };
  return { base: deviceTheme, look: DEFAULT_LOOK };
}

function nextFreeId(customs: CustomTheme[]): string {
  const used = new Set(customs.map((c) => c.id));
  for (let n = 1; n <= MAX_CUSTOM + 1; n++) {
    if (!used.has(`ct_${n}`)) return `ct_${n}`;
  }
  return `ct_${Date.now()}`;
}

export function nextFreeNumber(customs: CustomTheme[]): number {
  const used = new Set<number>();
  for (const c of customs) {
    const m = c.name.match(/(\d+)\s*$/);
    if (m) used.add(Number(m[1]));
  }
  for (let n = 1; n <= MAX_CUSTOM + 1; n++) {
    if (!used.has(n)) return n;
  }
  return customs.length + 1;
}

export function createOnFirstEdit(
  base: Theme, look: ThemeLook, customs: CustomTheme[], name: string,
): { created: CustomTheme; customs: CustomTheme[] } | null {
  if (customs.length >= MAX_CUSTOM) return null;
  const id = nextFreeId(customs);
  const created: CustomTheme = { id, name, base, look: { ...look, custom: { ...look.custom } } };
  return { created, customs: [...customs, created] };
}

export function migrateIfNeeded(
  oldLook: ThemeLook, base: Theme, customs: CustomTheme[], name: string,
): { created: CustomTheme; customs: CustomTheme[] } | null {
  if (isDefaultLook(oldLook)) return null;
  if (customs.length >= MAX_CUSTOM) return null;
  const id = nextFreeId(customs);
  const created: CustomTheme = { id, name, base, look: { ...oldLook, custom: { ...oldLook.custom } } };
  return { created, customs: [...customs, created] };
}

export function duplicateTheme(
  customs: CustomTheme[], sourceId: string, name: string,
): { duplicated: CustomTheme; customs: CustomTheme[] } | null {
  if (customs.length >= MAX_CUSTOM) return null;
  const source = customs.find((c) => c.id === sourceId);
  if (!source) return null;
  const id = nextFreeId(customs);
  const duplicated: CustomTheme = {
    id, name, base: source.base,
    look: { ...source.look, custom: { ...source.look.custom } },
  };
  return { duplicated, customs: [...customs, duplicated] };
}

export function deleteTheme(
  customs: CustomTheme[], id: string,
): { customs: CustomTheme[]; fallbackBase: Theme } {
  const ct = customs.find((c) => c.id === id);
  return { customs: customs.filter((c) => c.id !== id), fallbackBase: ct?.base ?? "dark" };
}

export function renameTheme(customs: CustomTheme[], id: string, name: string): CustomTheme[] {
  return customs.map((c) => (c.id === id ? { ...c, name } : c));
}

export function updateLook(customs: CustomTheme[], id: string, patch: Partial<ThemeLook>): CustomTheme[] {
  return customs.map((c) => (c.id === id ? { ...c, look: { ...c.look, ...patch } } : c));
}
