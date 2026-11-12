// Whether the customer turned the "glass" icon style on, read from the same resolved look Ambient.tsx reads.
// Normal (the default): icons stay plain. Glass: sidebar, header and page-action icons become coloured GlassIcon tiles,
// and `fill` (from the transparency slider) says how much colour the tile keeps.
import { glassTileFill } from "./lib/lighting";
import { useLook } from "./useLook";
import type { Theme } from "./types";

export function useIconGlass(): { glass: boolean; fill: number } {
  // The device theme is only the fallback for a customer with no custom theme; the page already mirrors it here.
  const device = (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) as Theme | null;
  const { light, resolved } = useLook(device === "light" || device === "black" ? device : "dark");
  const glass = light.iconStyle === "glass";
  return { glass, fill: glass ? glassTileFill(light.iconTransparency, resolved.base) : 1 };
}
