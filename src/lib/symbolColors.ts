import { normalizeHex } from "./lighting";

/** Manual per-symbol colours: symbol -> "#rrggbb". A symbol that isn't in the map keeps its automatic, rank-based colour. */
export type SymbolColors = Record<string, string>;

/** The colour to paint a symbol with: the manual one if it has a valid one, otherwise `auto`. */
export function symbolColor(map: SymbolColors | undefined, symbol: string, auto: string): string {
  const h = map && Object.prototype.hasOwnProperty.call(map, symbol) ? normalizeHex(map[symbol]) : null;
  return h ?? auto;
}

/** The map with this symbol set to `hex`, or cleared (back to automatic) when `hex` is null or not a hex colour. Never mutates. */
export function withSymbolColor(map: SymbolColors | undefined, symbol: string, hex: string | null): SymbolColors {
  const { [symbol]: _old, ...rest } = map ?? {};
  const h = hex == null ? null : normalizeHex(hex);
  return h ? { ...rest, [symbol]: h } : rest;
}
