// The look the customer is wearing right now: the active theme resolved, with the lighting settings on top of it.
// Ambient.tsx draws it; useIconGlass.ts reads it so the icons follow the same `iconStyle`.
import { DEFAULT_LIGHTING, type Lighting } from "./lib/lighting";
import { resolveTheme } from "./lib/customThemes";
import { useActiveTheme, useSettings } from "./useSettings";
import type { Theme } from "./types";

export function useLook(theme: Theme) {
  const s = useSettings();
  const activeId = useActiveTheme();
  const resolved = resolveTheme(activeId, s.customThemes ?? [], theme);
  const light: Lighting = {
    ...DEFAULT_LIGHTING, ...resolved.look,
    playing: s.lighting?.playing ?? DEFAULT_LIGHTING.playing,
    recentColors: s.lighting?.recentColors ?? [],
  };
  return { light, resolved };
}
