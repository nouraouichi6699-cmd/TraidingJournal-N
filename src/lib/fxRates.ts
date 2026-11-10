// The currency converter's rates: fetched when the calculator opens, kept on this device with a time and the source of
// each rate. Only GET requests to three public, keyless hosts; nothing about the user is sent.
import { frankfurterUrl } from "./fx";
import { FX_CURRENCIES, FX_FROM_ERAPI, mergeFx, parseCoingeckoBtc, parseErApiUsd, parseFrankfurterUsd, type FxStore } from "./calculators";

export const FX_KEY = "mizan-fx-rates";
const ERAPI_URL = "https://open.er-api.com/v6/latest/USD";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function loadFx(): FxStore | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FX_KEY) ?? "null");
    if (!isRec(v) || typeof v.at !== "number" || !isRec(v.live)) return null;
    const live: FxStore["live"] = {}, manual: FxStore["manual"] = {};
    for (const [c, e] of Object.entries(v.live)) if (isRec(e) && typeof e.rate === "number" && typeof e.src === "string") live[c] = { rate: e.rate, src: e.src };
    if (isRec(v.manual)) for (const [c, n] of Object.entries(v.manual)) if (typeof n === "number") manual[c] = n;
    return { at: v.at, live, manual };
  } catch { return null; }
}

export function saveFx(s: FxStore): void {
  try { localStorage.setItem(FX_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

const getJson = async (url: string): Promise<unknown> => {
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

/** Fetches every source, folds what came back into `prev` and returns it with whether anything arrived. A source that fails leaves its currencies as they were. */
export async function refreshFx(prev: FxStore | null): Promise<{ store: FxStore; ok: boolean }> {
  const live: FxStore["live"] = {};
  const ecb = FX_CURRENCIES.filter((c) => c !== "USD" && c !== "BTC" && !FX_FROM_ERAPI.includes(c));
  const [fk, er, cg] = await Promise.allSettled([getJson(frankfurterUrl("USD", ecb)), getJson(ERAPI_URL), getJson(COINGECKO_URL)]);
  if (fk.status === "fulfilled") for (const [c, rate] of Object.entries(parseFrankfurterUsd(fk.value))) live[c] = { rate, src: "Frankfurter (ECB)" };
  if (er.status === "fulfilled") { const m = parseErApiUsd(er.value); for (const c of FX_FROM_ERAPI) if (m[c]) live[c] = { rate: m[c], src: "open.er-api.com" }; }
  if (cg.status === "fulfilled") { const b = parseCoingeckoBtc(cg.value); if (b) live.BTC = { rate: b, src: "CoinGecko" }; }
  const ok = Object.keys(live).length > 0;
  const store = ok ? mergeFx(prev, live, Date.now()) : prev ?? { at: 0, live: {}, manual: {} };
  if (ok) saveFx(store);
  return { store, ok };
}
