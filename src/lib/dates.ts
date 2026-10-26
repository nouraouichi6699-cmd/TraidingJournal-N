// Day-first dates (29/12/2026) for the date fields, whatever the browser's language. Covered by dates.test.ts.
/** "YYYY-MM-DD" as the field shows it: 29/12/2026 ("" when it is not a date). */
export const dayFirst = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : "");
/** "29/12/2026" (also with - . or spaces) as "2026-12-29"; null when it is not a real day. */
export function parseDay(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, t = new Date(`${iso}T00:00:00Z`);
  return t.getUTCFullYear() === y && t.getUTCMonth() + 1 === mo && t.getUTCDate() === d ? iso : null;
}
/** What the user typed, with the slashes put in: "2912" → "29/12", "29122026" → "29/12/2026". */
export const shape = (raw: string) => {
  const g = raw.replace(/\D/g, "").slice(0, 8);
  return g.length > 4 ? `${g.slice(0, 2)}/${g.slice(2, 4)}/${g.slice(4)}` : g.length > 2 ? `${g.slice(0, 2)}/${g.slice(2)}` : g;
};
