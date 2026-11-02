// The four sessions' colours, shared by the Settings session ribbon and, later, the lighting panel.
//
// These are the only colours in the app that are not theme variables, on purpose: a session has to read as the same
// session in Navy, Ivory and Black, so its colour cannot follow the theme. The loading screen's map is a different
// thing — it colours cities by continent, where Sydney shares Asia's yellow — so it cannot be reused here.
import type { SessionKey } from "./tradingTime";

export const SESSION_COLORS: Record<SessionKey, string> = {
  sessTK: "#ffd84d", // Tokyo, yellow
  sessLN: "#7fd4ff", // London, light blue
  sessNY: "#ff5a6e", // New York, red
  sessSY: "#4dffa0", // Sydney, green
};

/**
 * Each session's three shades, for the ambient lighting: the bright lower part, the middle, and the tips. The first
 * of each is the same colour the ribbon uses above, so a session reads the same in both places.
 */
export const SESSION_TRIO: Record<SessionKey, { a: string; b: string; c: string }> = {
  sessTK: { a: "#ffd84d", b: "#ffb347", c: "#ff7a59" }, // Tokyo
  sessLN: { a: "#7fd4ff", b: "#4aa8ff", c: "#9b7bff" }, // London
  sessNY: { a: "#ff5a6e", b: "#ff3d8b", c: "#b44dff" }, // New York
  sessSY: { a: "#4dffa0", b: "#38d8ff", c: "#7b6bff" }, // Sydney
};
