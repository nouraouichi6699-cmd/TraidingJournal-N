export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else cell += c;
  }
  endRow();
  return rows;
}

/** Parses "1 321,03 USD", "+0,11%", "-3.41", "1,234.56" → number, or null. */
export function parseNum(s?: string): number | null {
  if (s == null) return null;
  let v = s.replace(/−/g, "-").replace(/[\s  %+A-Za-z€$£]/g, "");
  if (v === "" || v === "-" || v === "—") return null;
  if (v.includes(",") && v.includes(".")) v = v.replace(/,/g, "");
  else if (v.includes(",")) v = v.replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = {
  janv: 1, jan: 1, janvier: 1, january: 1,
  fevr: 2, fev: 2, feb: 2, fevrier: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avr: 4, apr: 4, avril: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juil: 7, jul: 7, juillet: 7, july: 7,
  aout: 8, aug: 8, august: 8,
  sept: 9, sep: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12,
};

const pad = (n: number | string) => String(n).padStart(2, "0");
const monthOf = (name: string) =>
  MONTHS[name.normalize("NFD").replace(/[̀-ͯ.]/g, "").toLowerCase()];

/** Returns "YYYY-MM-DDTHH:mm" (no timezone, as exported) or null. */
export function parseDate(s?: string): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  // 7 oct. 2026, 14:50
  m = t.match(/^(\d{1,2})\s+([^\s,\d]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const mo = monthOf(m[2]);
    if (mo) return `${m[3]}-${pad(mo)}-${pad(m[1])}T${pad(m[4])}:${m[5]}`;
  }
  // Oct 7, 2026, 2:50 PM
  m = t.match(/^([^\s,\d]+)\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    const mo = monthOf(m[1]);
    if (mo) {
      let h = Number(m[4]);
      if (m[6]) h = (h % 12) + (m[6].toUpperCase() === "PM" ? 12 : 0);
      return `${m[3]}-${pad(mo)}-${pad(m[2])}T${pad(h)}:${m[5]}`;
    }
  }
  return null;
}
