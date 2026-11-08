// Which currencies a symbol's news matters for: both sides of a forex pair, or the single currency a metal, index,
// oil contract or USD/USDT-quoted crypto trades against. Pure and covered by symbolCurrencies.test.ts.

const OIL = new Set(["USOIL", "WTI", "XTI", "UKOIL", "BRENT"]);
const CRYPTO_BASES = new Set(["BTC", "ETH", "LTC", "XRP", "SOL", "BNB", "ADA", "DOGE", "DOT", "AVAX", "LINK", "TRX", "MATIC", "BCH", "XLM", "TON"]);
const INDEX_CCY: Record<string, string> = {
  US30: "USD", DJ30: "USD", NAS100: "USD", US100: "USD", SPX500: "USD", US500: "USD",
  GER40: "EUR", DE40: "EUR", DAX: "EUR",
  UK100: "GBP",
  JP225: "JPY",
  AUS200: "AUD",
};

/** The symbol with a broker suffix (".m", "pro", "_i", ...) removed: an optional separator plus trailing lowercase
 *  letters, stripped only when an uppercase/numeric base of its own comes before it. */
function baseSymbol(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/^([A-Z0-9]{2,})[._-]?[a-z]+$/);
  return (m ? m[1] : trimmed).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The currencies a symbol's news matters for, or null when the symbol is not recognised at all (its news zone is
 * then unavailable, rather than merely matching no events).
 */
export function symbolCurrencies(symbol: string): string[] | null {
  const base = baseSymbol(symbol);
  if (!base) return null;
  if (base.startsWith("XAU") || base.startsWith("XAG") || base.startsWith("XPT")) return ["USD"];
  if (OIL.has(base)) return ["USD"];
  if (base in INDEX_CCY) return [INDEX_CCY[base]];
  if (base.endsWith("USDT")) return ["USD"];
  if (base.endsWith("USD")) {
    const prefix = base.slice(0, -3);
    if (CRYPTO_BASES.has(prefix)) return ["USD"];
    if (/^[A-Z]{3}$/.test(prefix)) return [prefix, "USD"];
    return null;
  }
  if (/^[A-Z]{6}$/.test(base)) return [base.slice(0, 3), base.slice(3)];
  return null;
}
