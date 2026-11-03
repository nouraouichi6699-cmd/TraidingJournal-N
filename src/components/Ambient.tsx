import { useLayoutEffect, useMemo } from "react";
import {
  cardSurface, DEFAULT_LIGHTING, fullColourBg, INK_VAR_NAMES,
  sessionNow, sessionTrio, SURFACE_VAR_NAMES, SWATCH,
  type Lighting, type Trio,
} from "../lib/lighting";
import { useActiveTheme, useReduceMotion, useSettings } from "../useSettings";
import { resolveTheme } from "../lib/customThemes";
import type { Theme } from "../types";

export default function Ambient({ theme }: { theme: Theme }) {
  const s = useSettings();
  const activeId = useActiveTheme();
  const resolved = resolveTheme(activeId, s.customThemes ?? [], theme);
  const light: Lighting = {
    ...DEFAULT_LIGHTING, ...resolved.look,
    playing: s.lighting?.playing ?? DEFAULT_LIGHTING.playing,
    recentColors: s.lighting?.recentColors ?? [],
  };
  const off = light.style === "off";

  const cardTint = light.cardColor === "session" ? sessionTrio(sessionNow(Date.now(), s.sessionBounds)).a
    : light.cardColor === "custom" ? light.cardSolid
      : (SWATCH[light.cardColor] ?? SWATCH.gold);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const clearInk = () => {
      delete root.dataset.cardInk;
      for (const name of INK_VAR_NAMES) root.style.removeProperty(name.replace("--", "--ink-"));
    };
    if (light.cardColor === "theme") {
      for (const name of SURFACE_VAR_NAMES) root.style.removeProperty(name);
      clearInk();
      return;
    }
    const { vars, inkVars, ink } = cardSurface(theme, cardTint, light.cardLevel);
    for (const name of SURFACE_VAR_NAMES) {
      if (name in vars) root.style.setProperty(name, vars[name]);
      else root.style.removeProperty(name);
    }
    if (ink === "dark" && inkVars) {
      root.dataset.cardInk = "dark";
      for (const [name, value] of Object.entries(inkVars)) {
        root.style.setProperty(name.replace("--", "--ink-"), value);
      }
    } else {
      clearInk();
    }
    return () => { for (const name of SURFACE_VAR_NAMES) root.style.removeProperty(name); clearInk(); };
  }, [theme, light.cardColor, cardTint, light.cardLevel]);

  if (off) return null;

  // Full colour: one static wash over the whole page.
  const trio: Trio = useMemo(
    () => (light.color === "session" ? sessionTrio(sessionNow(Date.now(), s.sessionBounds)) : light.custom),
    [light.color, light.custom, s.sessionBounds],
  );
  const tint = light.color === "session" ? trio.a
    : light.color === "solid" || light.color === "custom" ? light.solid
      : (SWATCH[light.color] ?? SWATCH.gold);
  const { color } = fullColourBg(theme, tint, light.level);
  return (
    <div
      aria-hidden="true" className="pointer-events-none fixed inset-0 z-0"
      style={{ background: color }}
    />
  );
}
