// Trade path engine. Expected values: worked by hand for the handmade path (checked by an independent Python script),
// ground truth for the broker clock (the trades are generated with a known clock). Run: npx tsx src/lib/path.test.ts
import type { Trade } from "../types";
import { barAt, barMinutes, detectModel, dstOn, parseIntradayCsv, parseYahooIntraday, pathStats, tradePath, wallToUtc, type IBar, type PathRow } from "./path";

let pass = 0, fail = 0;
const near = (a: number | null | undefined, b: number | null, tol = 1e-9) => (a == null || b == null ? a === b : Math.abs(a - b) <= tol);
const t = (name: string, got: number | null | undefined, exp: number | null, tol = 1e-9) => { const ok = near(got, exp, tol); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${got}, expected ${exp}`}`); };
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
const U = (s: string) => Date.parse(`${s}Z`);

console.log("-- Clock");
is("US daylight saving 2026: 8 Mar 07:00 UTC to 1 Nov 06:00 UTC", !dstOn("us", U("2026-03-08T06:59")) && dstOn("us", U("2026-03-08T07:00")) && dstOn("us", U("2026-11-01T05:59")) && !dstOn("us", U("2026-11-01T06:00")));
is("EU daylight saving 2026: 29 Mar 01:00 UTC to 25 Oct 01:00 UTC", !dstOn("eu", U("2026-03-29T00:59")) && dstOn("eu", U("2026-03-29T01:00")) && dstOn("eu", U("2026-10-25T00:59")) && !dstOn("eu", U("2026-10-25T01:00")));
t("UTC+2 / +3 (US): summer wall 12:00 = 09:00 UTC", wallToUtc({ base: 2, dst: "us" }, U("2026-07-01T12:00")), U("2026-07-01T09:00"));
t("UTC+2 / +3 (US): winter wall 12:00 = 10:00 UTC", wallToUtc({ base: 2, dst: "us" }, U("2026-01-15T12:00")), U("2026-01-15T10:00"));
t("UTC-5 / -4 (US): summer wall 12:00 = 16:00 UTC", wallToUtc({ base: -5, dst: "us" }, U("2026-07-01T12:00")), U("2026-07-01T16:00"));

console.log("-- One trade (handmade 1-minute path)");
const raw: [number, number, number, number][] = [[100, 100.5, 99.8, 100.15], [100.2, 100.3, 99.5, 99.6], [99.6, 99.9, 99.2, 99.4], [99.4, 99.7, 99.3, 99.6], [99.6, 100.4, 99.6, 100.3],
  [100.3, 101.2, 100.2, 101.0], [101.0, 101.1, 100.4, 100.5], [100.5, 100.6, 99.9, 100.0], [100.0, 100.4, 99.95, 100.3], [100.3, 100.5, 100.1, 100.4]];
const s0 = U("2026-10-01T10:00"), e0 = U("2026-10-01T10:10");
const bars: IBar[] = [{ t: s0 - 6e4, o: 100, h: 100, l: 100, c: 100 }, ...raw.map(([o, h, l, c], i) => ({ t: s0 + i * 6e4, o, h, l, c })), { t: e0, o: 100.4, h: 103, l: 97, c: 100 }];
const L = tradePath({ side: "long", entryPrice: 100.05, exitPrice: 100.45 }, s0, e0, bars, 1)!; // the broker quotes 0.05 above the data
// expected values: independent minute-by-minute Python script (scratch path_expect.py)
t("long: final move (broker prices)", L.final, 0.4); t("long: MFE", L.mfe, 1.2); t("long: MAE", L.mae, 0.8);
t("long: minutes to MFE (middle of its bar)", L.tMfe, 5.5); t("long: minutes to MAE", L.tMae, 2.5);
t("long: early favourable (first quarter)", L.eFav, 0.5); t("long: early adverse", L.eAdv, 0.8);
t("long: minutes below breakeven", L.below, 3); t("long: minutes in profit", L.fav, 6); t("long: area below (move x minutes)", L.area, 1.4);
t("long: minutes to breakeven", L.tBe, 1); t("long: recovery from MAE", L.recMae, 2); t("long: breakeven crossings", L.cross, 2);
t("long: stagnation minutes", L.stag, 6); t("long: minutes near breakeven (10% of range)", L.near, 2); t("long: duration", L.dur, 10);
t("long: floating sd", L.sd, 0.4871971994081161);
const S = tradePath({ side: "short", entryPrice: 100, exitPrice: 100.4 }, s0, e0, bars, 1)!;
t("short: final", S.final, -0.4); t("short: MFE", S.mfe, 0.8); t("short: MAE", S.mae, 1.2); t("short: minutes to MFE", S.tMfe, 2.5); t("short: minutes to MAE", S.tMae, 5.5);
t("short: early favourable", S.eFav, 0.8); t("short: early adverse", S.eAdv, 0.5); t("short: minutes below", S.below, 6); t("short: minutes in profit", S.fav, 3);
t("short: area below", S.area, 2.65); t("short: minutes to breakeven", S.tBe, 2); t("short: recovery from MAE", S.recMae, 2); t("short: crossings", S.cross, 2);
t("short: stagnation", S.stag, 6); t("short: near breakeven", S.near, 2); t("short: floating sd", S.sd, 0.4871971994081161);
// running records [minute, move]: independent Python script (scratch rec_expect.py)
const arr = (name: string, got: number[] | undefined, exp: number[]) => is(name, !!got && got.length === exp.length && got.every((v, i) => Math.abs(v - exp[i]) <= 1e-9), `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`);
arr("long: records of new bests", L.fx, [0.5, 0.5, 5.5, 1.2]); arr("long: records of new worsts", L.ax, [0.5, 0.2, 1.5, 0.5, 2.5, 0.8]);
arr("short: records of new bests", S.fx, [0.5, 0.2, 1.5, 0.5, 2.5, 0.8]); arr("short: records of new worsts", S.ax, [0.5, 0.5, 5.5, 1.2]);
arr("exit beyond every bar high: the exit is the last record", tradePath({ side: "long", entryPrice: 100.05, exitPrice: 101.45 }, s0, e0, bars, 1)!.fx, [0.5, 0.5, 5.5, 1.2, 10, 1.4]);
is("3 bars give a path, 2 bars do not", tradePath({ side: "long", entryPrice: 100, exitPrice: 100.2 }, s0, s0 + 3 * 6e4, bars, 1) !== null && tradePath({ side: "long", entryPrice: 100, exitPrice: 100.2 }, s0 + 30e3, s0 + 90e3, bars, 1) === null);
is("gap in the data: no path", tradePath({ side: "long", entryPrice: 100, exitPrice: 100.4 }, s0, e0, bars.filter((_, i) => i < 3 || i > 6), 1) === null);
is("bar lookup", barAt(bars, 1, s0 + 61e3)?.o === 100.2 && barAt(bars, 1, e0 + 6e4) === null);

console.log("-- Broker clock from entry prices");
// minute prices from a smooth function; trades placed on a UTC+2 / +3 (US) clock, gold quoted 15 above the data
const P = (u: number, c0: number, k: number) => c0 * (1 + 0.004 * Math.sin((2 * Math.PI * u) / (1440 * 3.7) + k) + 0.0015 * Math.sin((2 * Math.PI * u) / 211 + 1.3 + k) + 0.0004 * Math.sin((2 * Math.PI * u) / 17 + 0.7));
const mk = (from: string, days: number, c0: number, k: number): IBar[] => { const out: IBar[] = []; const m0 = U(from) / 6e4; for (let m = m0; m < m0 + days * 1440; m++) { const o = P(m, c0, k), c = P(m + 1, c0, k), w = c0 * 0.00005 * (1 + Math.sin(m * 0.37)); out.push({ t: m * 6e4, o, h: Math.max(o, c) + w, l: Math.min(o, c) - w, c }); } return out; };
const data = { EURUSD: [...mk("2026-02-09T00:00", 3, 1.08, 0), ...mk("2026-07-06T00:00", 3, 1.08, 0)], XAUUSD: [...mk("2026-02-09T00:00", 3, 2400, 2), ...mk("2026-07-06T00:00", 3, 2400, 2)] };
const clock = { base: 2, dst: "us" as const };
const entries = ["2026-02-10T09:13", "2026-02-10T15:41", "2026-02-11T11:07", "2026-07-07T10:22", "2026-07-07T17:55", "2026-07-08T13:31", "2026-02-11T04:48", "2026-07-08T21:16"].flatMap((w) =>
  (["EURUSD", "XAUUSD"] as const).map((symbol) => { const u = wallToUtc(clock, U(w)); return { wall: U(w), symbol, price: P(u / 6e4, symbol === "EURUSD" ? 1.08 : 2400, symbol === "EURUSD" ? 0 : 2) + (symbol === "XAUUSD" ? 15 : 0) }; }));
const look = (e: { symbol: string }) => ({ bars: data[e.symbol as keyof typeof data], minutes: 1 });
const det = detectModel(entries, look);
is("clock found: UTC+2, +3 in US summer", det?.model.base === 2 && det.model.dst === "us", JSON.stringify(det));
is("clock: confident, every entry matched", !!det?.confident && det.n === 16, JSON.stringify(det));
// one hourly-bar entry inside the 3 weeks when US clocks have moved and European ones have not (26 March), among many
// 1-minute entries from July, when both clocks agree: per bar set, and every entry's fit, decide
const hourly = (b: IBar[]) => { const out: IBar[] = []; for (let i = 0; i + 60 <= b.length; i += 60) { const g = b.slice(i, i + 60); out.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[59].c }); } return out; };
const sets: Record<string, { bars: IBar[]; minutes: number }> = { m1: { bars: mk("2026-07-06T00:00", 3, 1.08, 0), minutes: 1 }, h1: { bars: hourly([...mk("2026-03-23T00:00", 5, 1.08, 0), ...mk("2026-05-04T00:00", 5, 1.08, 0)]), minutes: 60 } };
const at = (w: string, g: string) => { const u = wallToUtc(clock, U(w)); return { wall: U(w), symbol: "EURUSD", g, price: P(u / 6e4, 1.08, 0) }; };
const mixed = [...["2026-07-06T10:07", "2026-07-06T15:33", "2026-07-07T09:12", "2026-07-07T13:48", "2026-07-07T18:21", "2026-07-08T08:05", "2026-07-08T12:44", "2026-07-08T16:16", "2026-07-06T19:52", "2026-07-07T11:29", "2026-07-08T14:37", "2026-07-06T12:03"].map((w) => at(w, "m1")),
  ...["2026-05-04T11:20", "2026-05-05T14:40", "2026-05-06T10:15", "2026-05-07T16:45", "2026-03-26T12:30"].map((w) => at(w, "h1"))];
const dg = detectModel(mixed, (e) => sets[e.g as string]);
is("US against EU clock told apart by one March entry on hourly bars", dg?.model.base === 2 && dg.model.dst === "us", JSON.stringify(dg));
const shuffled = entries.map((x, i) => ({ ...x, price: x.price * (1 + 0.002 * Math.sin(i * 12.9898)) }));
const bad = detectModel(shuffled, look);
is("prices that match no time: not confident", !bad || !bad.confident, JSON.stringify(bad));

console.log("-- Averages over trades");
const tr = (no: number, pnl: number, side: "long" | "short", en: string, ex: string): Trade => ({ key: `A:${no}`, accountId: "A", no, symbol: "X", side, qty: 1, entryTime: en, entryPrice: 100, exitTime: ex, exitPrice: 100, pnl, returnPct: null, commission: 0, status: "closed" });
const rows: PathRow[] = [
  { trade: tr(1, 40, "long", "2026-10-01T10:00", "2026-10-01T10:10"), path: L, k: 100, bal: 10000, atr: 2 },
  { trade: tr(2, -40, "short", "2026-10-01T10:00", "2026-10-01T10:10"), path: S, k: 100, bal: 10040, atr: null },
  { trade: tr(3, 25, "long", "2026-10-02T09:00", "2026-10-02T11:00"), path: null, k: null, bal: null, atr: null },
];
const st = pathStats(rows);
// expected values: independent Python script (scratch path_expect.py)
const E = { covered: 2, avgMfe: 100, medMfe: 100, avgMae: 100, mfePct: 0.998406374501992, maePct: 0.9976095617529881, mfeAtr: 0.6, maeAtr: 0.4, eFav: 65, eAdv: 65, amp: 200, tMfe: 4, tMae: 4,
  avgCap: 0, giveback: 100, givebackPct: 100, closeLoc: 50, velocity: 10.714285714285714, winCap: 33.33333333333373, loseRec: 66.66666666666627,
  tBelow: 4.5, tBelowPct: 45, tBe: 1.5, tBePct: 15, tPeak: 5.5, tPeakClose: 6, postPeak: 60, tFav: 4.5, recMae: 2, cross: 2, stag: 6, nearBe: 2, area: 3.3750000000000093 };
for (const [k, v] of Object.entries(E)) t(`stats ${k}`, (st as unknown as Record<string, number>)[k], v, 1e-9);
t("stats vol (floating sd in money)", st.vol, 48.71971994081161, 1e-9);

console.log("-- Parsers");
{ const y = parseYahooIntraday(JSON.stringify({ chart: { result: [{ meta: { gmtoffset: 0 }, timestamp: [1782900000, 1782900060, 1782900120], indicators: { quote: [{ open: [1.1, null, 1.12], high: [1.11, 1.2, 1.13], low: [1.09, 1.1, 1.11], close: [1.1, 1.15, 1.12] }] } }] } }));
  is("Yahoo intraday: 2 bars, UTC ms, the empty one dropped", y.length === 2 && y[0].t === 1782900000000 && y[1].t === 1782900120000, JSON.stringify(y)); }
{ const m = parseIntradayCsv("<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\n2026.10.01\t10:00:00\t100\t100.5\t99.8\t100.2\t12\n2026.10.01\t10:01:00\t100.2\t100.3\t99.5\t99.6\t9\n2026.10.01\t10:02:00\t99.6\t99.9\t99.2\t99.4\t7\n2026.10.01\t10:04:00\t99.6\t100.4\t99.6\t100.3\t3\n");
  is("MT5 bar export: 4 bars, 1-minute, broker clock", m.bars.length === 4 && m.minutes === 1 && m.bars[0].t === U("2026-10-01T10:00") && m.bars[3].c === 100.3, JSON.stringify(m)); }
is("bar size: most common gap", barMinutes([0, 5, 10, 15, 30].map((x) => ({ t: x * 6e4, o: 1, h: 1, l: 1, c: 1 }))) === 5);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
