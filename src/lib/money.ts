import type { Account } from "../types";

/** Display symbol for a currency code; codes without a common symbol are shown as the code. */
const SYM: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹", KRW: "₩", TRY: "₺", RUB: "₽", ILS: "₪", NGN: "₦", PHP: "₱", UAH: "₴", VND: "₫", USDT: "₮" };
export const currencySymbol = (code?: string | null): string => { const c = (code ?? "").trim().toUpperCase(); return c ? SYM[c] ?? c : ""; };
/** What goes after the number: "$" glued, a bare code with a space (" TND"), or nothing. */
export const currencySuffix = (code?: string | null): string => { const s = currencySymbol(code); return !s ? "" : /^[A-Z]{2,}$/.test(s) ? ` ${s}` : s; };

/**
 * Keeps each number with its sign and unit in reading order inside right-to-left (Arabic) text: after Arabic letters the bidi
 * algorithm moves a trailing "$" or "%" to the other side ("59$" shows as "$59"). Wraps every "-1,234.5$", "38.6%", "+0.11R",
 * "14h" or "1,234 TND" in an LTR isolate (U+2066 ... U+2069). Digits inside words (NAS100) are left alone; safe to apply twice.
 */
export const ltrNumbers = (s: string): string =>
  s.replace(/(?<![\u2066\w.,+\-\u2212])[+\-\u2212]?\d(?:[\d.,:/-]*\d)?(?: [A-Z]{2,}(?![A-Za-z])|[$€£¥₹₩₺₽₪₦₱₴₫₮%Rh](?![A-Za-z]))?/g, (m) => `\u2066${m}\u2069`);

/** The currency shared by all given accounts, or null when they differ (mixed totals get no symbol rather than a wrong one). */
export const commonCurrency = (accounts: Pick<Account, "currency">[]): string | null => {
  const set = new Set(accounts.map((a) => (a.currency || "").trim().toUpperCase()).filter(Boolean));
  return set.size === 1 ? [...set][0] : null;
};

/**
 * Money for display, currency after the number: "10,000$", "+1,706$", "-18.16$", "250 TND".
 *  - cents=false (summaries: cards, reports, charts): rounded to whole units.
 *  - cents=true (trade-level rows): two decimals.
 *  - sign=true adds "+" to positive values. A value that rounds to zero never shows a sign ("0$", not "-0$").
 * Rounding happens here only; calculations keep full precision.
 */
export function fmtMoney(v: number, o: { cents?: boolean; sign?: boolean; currency?: string | null } = {}): string {
  if (!Number.isFinite(v)) return "-";
  const d = o.cents ? 2 : 0;
  const body = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const zero = !/[1-9]/.test(body);
  return `${zero ? "" : v < 0 ? "-" : o.sign ? "+" : ""}${body}${currencySuffix(o.currency)}`;
}
