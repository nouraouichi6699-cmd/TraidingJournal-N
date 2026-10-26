// Common market symbols by group, for the pickers (brokers name some differently or add a suffix: any symbol can be
// typed in). Pure data and a search, covered by symbols.test.ts.
export type SymbolGroup = "fx" | "metals" | "indices" | "energy" | "crypto";
export const SYMBOLS: { group: SymbolGroup; list: string[] }[] = [
  { group: "fx", list: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURGBP", "EURJPY", "EURCHF", "EURAUD", "EURCAD", "EURNZD", "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD", "GBPNZD",
    "AUDJPY", "AUDCHF", "AUDCAD", "AUDNZD", "CADJPY", "CADCHF", "CHFJPY", "NZDJPY", "NZDCHF", "NZDCAD", "USDSEK", "USDNOK", "USDDKK", "USDPLN", "USDHUF", "USDCZK", "USDTRY", "USDZAR", "USDMXN",
    "USDSGD", "USDHKD", "USDCNH", "EURTRY", "EURPLN", "EURSEK", "EURNOK", "EURHUF", "EURCZK", "GBPTRY"] },
  { group: "metals", list: ["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD", "XAUEUR", "XAGEUR", "XAUGBP", "XAUAUD"] },
  { group: "indices", list: ["US30", "NAS100", "US100", "SPX500", "US500", "US2000", "GER40", "UK100", "FRA40", "EU50", "ESP35", "ITA40", "SWI20", "NETH25", "JP225", "AUS200", "HK50", "CHINA50", "USDX", "VIX"] },
  { group: "energy", list: ["USOIL", "UKOIL", "WTI", "BRENT", "NGAS"] },
  { group: "crypto", list: ["BTCUSD", "ETHUSD", "LTCUSD", "XRPUSD", "SOLUSD", "BNBUSD", "ADAUSD", "DOGEUSD", "DOTUSD", "AVAXUSD", "LINKUSD", "TRXUSD", "MATICUSD", "BCHUSD", "XLMUSD", "TONUSD"] },
];
/** A typed symbol cleaned up: letters, digits and . _ # - only; the name in upper case, a broker's suffix as typed
 *  ("xauusd.m" → "XAUUSD.m"), since rules compare symbols exactly as the platform writes them. */
export const cleanSymbol = (s: string) => {
  const t = s.trim().replace(/[^A-Za-z0-9._#-]/g, "").slice(0, 20), i = t.search(/[._#-]/);
  return i < 0 ? t.toUpperCase() : t.slice(0, i).toUpperCase() + t.slice(i);
};
/** The symbols matching `q` (anywhere in the name, ignoring case and separators): the trader's own first, then each
 *  group without the ones already listed. */
export function searchSymbols(q: string, mine: string[]): { group: "mine" | SymbolGroup; list: string[] }[] {
  const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, ""), k = key(q);
  const hit = (s: string) => !k || key(s).includes(k);
  const seen = new Set<string>(), out: { group: "mine" | SymbolGroup; list: string[] }[] = [];
  const own = [...new Set(mine)].filter(hit);
  own.forEach((s) => seen.add(s));
  if (own.length) out.push({ group: "mine", list: own });
  for (const g of SYMBOLS) {
    const list = g.list.filter((s) => !seen.has(s) && hit(s));
    if (list.length) out.push({ group: g.group, list });
  }
  return out;
}
