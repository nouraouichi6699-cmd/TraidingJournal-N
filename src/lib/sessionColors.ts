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
