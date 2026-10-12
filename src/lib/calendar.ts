export type Impact = "high" | "medium" | "low" | "none" | "holiday";
export interface Ev { id: string; ts: number; cur: string; title: string; impact: Impact; prev: string; fc: string; actual?: string }

export const MAJORS = ["AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "NZD", "USD"];
export const REGIONS: Record<string, string[]> = {
  G20: ["USD", "EUR", "GBP", "JPY", "CNY", "CAD", "AUD", "INR", "BRL", "MXN", "KRW", "RUB", "SAR", "TRY", "ZAR", "ARS", "IDR"],
  Asia: ["JPY", "CNY", "INR", "KRW", "SGD", "HKD", "IDR", "THB", "MYR", "PHP", "TWD", "VND"],
  "Middle East": ["AED", "SAR", "QAR", "KWD", "ILS", "TRY", "EGP", "BHD", "OMR", "JOD"],
  Europe: ["EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "RUB"],
  Americas: ["USD", "CAD", "MXN", "BRL", "ARS", "CLP", "COP", "PEN"],
  Africa: ["ZAR", "EGP", "NGN", "KES", "MAD", "GHS", "TND", "DZD"],
};
/** Currency → ISO-3166 country code used for the round flag. */
export const FLAG: Record<string, string> = {
  USD: "us", EUR: "eu", GBP: "gb", JPY: "jp", AUD: "au", CAD: "ca", CHF: "ch", CNY: "cn", NZD: "nz", AED: "ae", ARS: "ar",
  BRL: "br", CZK: "cz", DKK: "dk", EGP: "eg", HKD: "hk", HUF: "hu", IDR: "id", ILS: "il", INR: "in", KRW: "kr", MXN: "mx",
  NOK: "no", PLN: "pl", RUB: "ru", SAR: "sa", SEK: "se", SGD: "sg", THB: "th", TRY: "tr", ZAR: "za",
};
export const flagCodes = Object.values(FLAG);

/** GMT offsets from -12:00 to +14:00, in minutes. */
export const OFFSETS: number[] = Array.from({ length: 27 }, (_, i) => (i - 12) * 60);
export const offLabel = (m: number) => `GMT${m < 0 ? "-" : "+"}${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
export const browserOffset = () => {
  const m = -new Date().getTimezoneOffset();
  return OFFSETS.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
};

const p2 = (n: number) => String(n).padStart(2, "0");
/** A Date whose UTC getters read as wall-clock time in the chosen offset. */
export const shift = (ts: number, off: number) => new Date(ts + off * 60000);
export const dayKey = (ts: number, off: number) => { const d = shift(ts, off); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };
export const hhmm = (ts: number, off: number) => { const d = shift(ts, off); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
export const clock = (ts: number, off: number) => { const d = shift(ts, off); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; };
export const keyToDate = (k: string) => new Date(`${k}T00:00:00Z`);
export const addDays = (k: string, n: number) => { const d = keyToDate(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekStart = (k: string) => { const d = keyToDate(k); return addDays(k, -((d.getUTCDay() + 6) % 7)); }; // Monday

export function timeLeft(ts: number, now: number): { text: string; live: boolean; done: boolean } {
  const d = ts - now;
  if (d <= 0) return d > -30 * 60000 ? { text: "live", live: true, done: false } : { text: "released", live: false, done: true };
  const mins = Math.floor(d / 60000);
  if (mins >= 2880) return { text: `${Math.floor(mins / 1440)}d`, live: false, done: false };
  if (mins >= 1440) return { text: `1d ${Math.floor((mins - 1440) / 60)}h`, live: false, done: false };
  return { text: mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${Math.max(1, mins)}min`, live: false, done: false };
}

export const isSpeech = (t: string) => /\b(speaks?|speech|testifies|testimony|press conference|remarks|hearing)\b/i.test(t);
export const isRate = (t: string) => /(interest rate|rate statement|cash rate|bank rate|policy rate|funds rate|rate decision|monetary policy|refinancing)/i.test(t);

const num = (s: string | undefined) => {
  if (!s) return NaN;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};
/** green = better than consensus, red = worse, gray = equal / unknown. */
export function verdict(e: Ev): "better" | "worse" | "equal" | "none" {
  const a = num(e.actual), f = num(e.fc);
  if (isNaN(a) || isNaN(f)) return "none";
  if (a === f) return "equal";
  const lowerIsBetter = /(unemployment|jobless|claims)/i.test(e.title);
  return (a > f) !== lowerIsBetter ? "better" : "worse";
}

export type Kind = "rate" | "inflation" | "jobs" | "gdp" | "pmi" | "retail" | "speech" | "trade" | "confidence" | "holiday" | "other";
export function kindOf(e: Ev): Kind {
  const t = e.title;
  if (e.impact === "holiday" || /holiday/i.test(t)) return "holiday";
  if (isSpeech(t)) return "speech";
  if (isRate(t)) return "rate";
  if (/(cpi|ppi|inflation|price index|pce)/i.test(t)) return "inflation";
  if (/(employment|payroll|nfp|unemployment|jobless|claims|jobs|wage|earnings)/i.test(t)) return "jobs";
  if (/\bgdp\b/i.test(t)) return "gdp";
  if (/(pmi|ism|manufacturing|services|industrial|production)/i.test(t)) return "pmi";
  if (/(retail sales|consumer spending)/i.test(t)) return "retail";
  if (/(trade balance|current account|exports|imports)/i.test(t)) return "trade";
  if (/(confidence|sentiment|survey|expectations|ifo|zew)/i.test(t)) return "confidence";
  return "other";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function toCsv(rows: Ev[], off: number): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = ["Date", "Time", "Currency", "Event", "Impact", "Previous", "Consensus", "Actual"].join(",");
  return [head, ...rows.map((e) => [dayKey(e.ts, off), hhmm(e.ts, off), e.cur, q(e.title), e.impact, q(e.prev), q(e.fc), q(e.actual ?? "")].join(","))].join("\n");
}
export function toXml(rows: Ev[], off: number): string {
  const items = rows
    .map((e) => `  <event>\n    <date>${dayKey(e.ts, off)}</date>\n    <time>${hhmm(e.ts, off)}</time>\n    <currency>${e.cur}</currency>\n    <title>${esc(e.title)}</title>\n    <impact>${e.impact}</impact>\n    <previous>${esc(e.prev)}</previous>\n    <consensus>${esc(e.fc)}</consensus>\n    <actual>${esc(e.actual ?? "")}</actual>\n  </event>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<calendar timezone="${offLabel(off)}">\n${items}\n</calendar>\n`;
}
export function download(name: string, mime: string, data: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
