// The strategy library: the trading strategies most used today, in five groups, for the Strategies page. Each one has
// its facts (level, styles, markets, timeframes, sessions, search words) and a small diagram drawn from data; the words
// are in strategyText.{en,ar,fr}.ts. Diagram prices run from 0 to 100 and time runs in slots, one candle per slot.

export type Group = "liquidity" | "levels" | "volume" | "sessions" | "waves";
export type Style = "scalp" | "day" | "swing";
export type Market = "fx" | "gold" | "indices" | "crypto" | "stocks" | "futures";
export type Session = "asia" | "london" | "ny" | "any";
/** A candle: open, high, low, close. */
export type K = [number, number, number, number];
/** A point: slot, price. */
export type P = [number, number];
export type Tone = "gold" | "muted" | "demand" | "supply" | "gap" | "range";
/** Text shown on a diagram: as is, or a word of the reader's language when it starts with "@" (see DIAGRAM_WORDS). */
type Label = string;

export interface Zone { u0: number; u1: number; p0: number; p1: number; tone: Tone; t?: Label; at?: number; lu?: number } // lu: slot of the label
export interface Level { p: number; u0?: number; u1?: number; t?: Label; tone?: Tone; at?: number; lu?: number; below?: boolean } // lu: label in the chart at this slot
export interface Mark { u: number; p: number; t: Label; tone?: Tone; at?: number; anchor?: "start" | "middle" | "end" }
export interface Diagram {
  n: number;                 // slots across
  rng?: [number, number];    // prices shown (default 0–100)
  k?: K[];                   // candles: candle i stands in slot i
  big?: K;                   // one wide candle at the right: the bar the small ones build
  line?: P[];                // a swing path
  line2?: P[];               // a second market, under a split
  split?: number;            // price of the line between two panels
  zones?: Zone[];
  lv?: Level[];
  tx?: Mark[];
  segs?: { a: P; b: P; t?: Label; at?: number }[]; // dashed guides (divergences, ratios)
  tri?: P[][];               // shaded triangles (harmonic legs)
  bands?: { u0: number; u1: number; t: Label }[];  // sessions and time windows
  vlines?: { u: number; t: Label }[];               // an event in time (a news release)
  curves?: { pts: P[]; tone: Tone; dash?: boolean; t?: Label }[];
  profile?: { p0: number; step: number; v: number[] }; // volume at price, lowest bucket first
  delta?: number[];          // one value per candle, in a lower panel
  /** A trade: from slot u (to u1), entry, stop and target prices. */
  trade?: { u: number; u1?: number; e: number; s: number; t: number };
}

export type Id =
  | "ict" | "silver-bullet" | "po3" | "ict-2022" | "unicorn" | "mmxm" | "turtle-soup" | "smt" | "smc" | "crt"
  | "supply-demand" | "msnr" | "snr" | "breakout-retest"
  | "order-flow" | "volume-profile" | "vwap" | "wyckoff"
  | "orb" | "london-breakout" | "asian-range" | "news"
  | "elliott" | "fibonacci" | "harmonics" | "chart-patterns" | "price-action";

export interface Strategy {
  id: Id;
  name: string;              // the same in every language
  short: string;             // for chips (the journal, the reports)
  group: Group;
  level: 1 | 2 | 3;          // beginner, intermediate, advanced
  styles: Style[];
  markets: Market[];
  tf: string[];              // MT5 timeframe names
  sessions: Session[];
  aka: string;               // other names, for the search
  dia: Diagram;
}

export interface StrategyText {
  tag: string;               // one line under the name
  idea: string;
  concepts: [string, string][];
  check: string[];
  stop: string;
  target: string;
  mistakes: string[];
  k?: string;                // more search words in this language
}

export const GROUPS: Group[] = ["liquidity", "levels", "volume", "sessions", "waves"];

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Candles along straight legs from each [slot, price] to the next, one per slot. The wicks are short and set by the
 *  slot, so a diagram is the same on every visit; `w` gives a candle its own high or low (a raid, a rejection). */
export function walk(pts: P[], w: Record<number, { h?: number; l?: number }> = {}): K[] {
  const k: K[] = [];
  for (let s = 0; s + 1 < pts.length; s++) {
    const [u0, p0] = pts[s], [u1, p1] = pts[s + 1];
    for (let u = u0; u < u1; u++) {
      const o = p0 + ((p1 - p0) * (u - u0)) / (u1 - u0), c = p0 + ((p1 - p0) * (u + 1 - u0)) / (u1 - u0);
      const up = 0.5 + ((u * 5) % 4) * 0.3, dn = 0.5 + ((u * 3 + 1) % 4) * 0.3;
      k.push([r1(o), r1(w[u]?.h ?? Math.max(o, c) + up), r1(w[u]?.l ?? Math.min(o, c) - dn), r1(c)]);
    }
  }
  return k;
}
/** A zig-zag path: one leg per slot, [slot 0 price, slot 1 price, …]. */
const zz = (...p: number[]): P[] => p.map((v, i) => [i, v]);
export const hi = (k: K[], a: number, b = a) => Math.max(...k.slice(a, b + 1).map((c) => c[1]));
export const lo = (k: K[], a: number, b = a) => Math.min(...k.slice(a, b + 1).map((c) => c[2]));
/** The fair value gap around candle i: between the wicks of candles i−1 and i+1, drawn from candle i−1 on. */
export function gapAt(k: K[], i: number, t: Label = "FVG", at = i + 1): Zone {
  const up = k[i][3] > k[i][0];
  return { u0: i - 0.5, u1: k.length, p0: up ? k[i - 1][1] : k[i + 1][1], p1: up ? k[i + 1][2] : k[i - 1][2], tone: "gap", t, at };
}
/** The box around candles a..b (a base, a range), drawn from candle a to slot `to`. */
const box = (k: K[], a: number, b: number, tone: Tone, t?: Label, to = k.length, at = b + 1): Zone => ({ u0: a, u1: to, p0: lo(k, a, b), p1: hi(k, a, b), tone, t, at });

/** Point of control and value area (about 70% of the volume, grown from the POC toward the bigger side). */
export function valueArea(pr: { p0: number; step: number; v: number[] }) {
  const { v, p0, step } = pr, total = v.reduce((a, b) => a + b, 0);
  const poc = v.indexOf(Math.max(...v));
  let a = poc, b = poc, sum = v[poc];
  while (sum < total * 0.7) {
    const dn = a > 0 ? v[a - 1] : -1, up = b < v.length - 1 ? v[b + 1] : -1;
    if (up >= dn) sum += v[++b]; else sum += v[--a];
  }
  return { poc: p0 + poc * step, val: p0 + a * step - step / 2, vah: p0 + b * step + step / 2, a, b };
}

/** VWAP and its 1 and 2 standard deviation bands along candles, with the volume of each. */
export function vwapOf(k: K[], vol: number[]) {
  let pv = 0, v = 0, p2v = 0;
  return k.map((c, i) => {
    const tp = (c[1] + c[2] + c[3]) / 3;
    pv += tp * vol[i]; v += vol[i]; p2v += tp * tp * vol[i];
    const m = pv / v, sd = Math.sqrt(Math.max(0, p2v / v - m * m));
    return { u: i + 0.5, m, sd };
  });
}

// ---- the diagrams -------------------------------------------------------------------------------------------------

const ictK = walk(zz(90, 97, 91, 82, 86, 75, 64, 54, 44, 36, 40, 43, 38, 34, 38, 50, 56, 52, 47, 55, 64, 74, 85, 95, 98), { 12: { l: 27 } });
const ictGap = gapAt(ictK, 14);
const ict: Diagram = {
  n: ictK.length, k: ictK,
  lv: [{ p: hi(ictK, 0), t: "BSL", at: 1 }, { p: lo(ictK, 8, 9), u0: 8, u1: 13, t: "SSL", at: 9 }, { p: hi(ictK, 10, 11), u0: 10.5, u1: 15.5, tone: "gold", at: 15 }],
  tx: [{ u: 12.5, p: 22, t: "@sweep", at: 13 }, { u: 11.3, p: hi(ictK, 10, 11) + 4, t: "MSS", tone: "gold", at: 15 }],
  zones: [{ ...ictGap, lu: 15.6 }],
  trade: { u: 17, e: ictGap.p1, s: 26, t: hi(ictK, 0) },
};

const sbK = walk(zz(86, 92, 84, 76, 78, 69, 64, 58, 61, 57, 55, 58, 67, 72, 68, 63, 71, 79, 87, 94, 92), { 9: { l: 49 } });
const sbGap = gapAt(sbK, 11);
const silverBullet: Diagram = {
  n: sbK.length, k: sbK, bands: [{ u0: 8, u1: 15, t: "10:00–11:00 NY" }],
  lv: [{ p: hi(sbK, 0), t: "BSL", at: 1 }, { p: lo(sbK, 6), u0: 6, u1: 10, at: 7 }],
  tx: [{ u: 9.5, p: 44, t: "@sweep", at: 10 }],
  zones: [sbGap],
  trade: { u: 14, e: r1((sbGap.p0 + sbGap.p1) / 2), s: 48, t: hi(sbK, 0) },
};

const po3K = walk(zz(60, 62, 59, 61.5, 58.5, 61, 55, 49, 47, 53, 62, 70, 68, 77, 84, 82, 88), { 7: { l: 42 } });
const po3: Diagram = {
  n: po3K.length + 4, k: po3K, big: [60, hi(po3K, 0, 15), lo(po3K, 0, 15), 88],
  lv: [{ p: 60, u1: po3K.length, t: "@open", at: 0 }],
  zones: [box(po3K, 0, 4, "range", undefined, 5)],
  tx: [{ u: 2.5, p: 68, t: "A", tone: "gold", at: 5 }, { u: 7.5, p: 36, t: "M", tone: "gold", at: 8 }, { u: 12.5, p: 92, t: "D", tone: "gold", at: 13 }, { u: 18, p: 97, t: "D1", at: 16 }],
};

const m22K = walk(zz(20, 12, 24, 33, 30, 41, 51, 58, 65, 60, 56, 61, 64, 61, 56, 45, 40, 45, 51, 42, 32, 21, 10, 13), { 11: { h: 69 } });
const m22Gap = gapAt(m22K, 14);
const ict2022: Diagram = {
  n: m22K.length, k: m22K,
  lv: [{ p: hi(m22K, 7), u0: 7, u1: 12, t: "BSL", at: 8 }, { p: lo(m22K, 0), t: "SSL", at: 1 }, { p: lo(m22K, 9), u0: 9, u1: 15.5, tone: "gold", at: 15 }],
  tx: [{ u: 11.5, p: 74, t: "@sweep", at: 12 }, { u: 10, p: 50, t: "MSS", tone: "gold", at: 15 }],
  zones: [m22Gap],
  trade: { u: 17, e: r1((m22Gap.p0 + m22Gap.p1) / 2), s: 70, t: lo(m22K, 0) },
};

const uniK = walk(zz(88, 82, 73, 64, 58, 52, 46, 51, 56, 52, 47, 44, 48, 60, 66, 61, 55, 64, 73, 82, 90, 88), { 10: { l: 39 } });
const uniGap = gapAt(uniK, 12), uniBB = { lo: uniK[7][0], hi: hi(uniK, 7) };
const unicorn: Diagram = {
  n: uniK.length, k: uniK,
  lv: [{ p: hi(uniK, 0), t: "BSL", at: 1 }, { p: lo(uniK, 5, 6), u0: 5, u1: 11, t: "SSL", at: 7 }],
  zones: [
    { u0: 7, u1: uniK.length, p0: uniBB.lo, p1: uniBB.hi, tone: "range", t: "BB", at: 9 },
    uniGap,
    { u0: 11.5, u1: uniK.length, p0: Math.max(uniBB.lo, uniGap.p0), p1: Math.min(uniBB.hi, uniGap.p1), tone: "gold", at: 14 },
  ],
  tx: [{ u: 10.5, p: 33, t: "@sweep", at: 11 }],
  trade: { u: 15, e: r1((Math.max(uniBB.lo, uniGap.p0) + Math.min(uniBB.hi, uniGap.p1)) / 2), s: 38, t: hi(uniK, 0) },
};

const mmxm: Diagram = {
  n: 26,
  line: [[0, 82], [1, 86], [2, 81], [3, 85], [5, 72], [6, 76], [8, 62], [9, 66], [11, 50], [12, 54], [14, 36], [16, 57], [17, 48], [19, 62], [20, 58], [22, 72], [23, 68], [25, 84]],
  zones: [{ u0: 0, u1: 3.5, p0: 80, p1: 87, tone: "range", at: 3 }],
  lv: [{ p: 54, u0: 12, u1: 16, tone: "gold", at: 16 }],
  tx: [{ u: 1.75, p: 76, t: "OC", at: 3 }, { u: 14, p: 30, t: "SMR", tone: "gold", at: 14 }, { u: 13.6, p: 58, t: "MSS", tone: "gold", at: 16 }, { u: 7.6, p: 82, t: "@sellside", at: 8 }, { u: 19.6, p: 82, t: "@buyside", at: 20 }],
  trade: { u: 17, e: 48, s: 34, t: 82 },
};

const tsK = walk(zz(42, 50, 60, 67, 60, 52, 47, 56, 65, 60, 67, 65, 59, 52, 45, 40, 43), { 2: { h: 72 }, 7: { h: 72 }, 10: { h: 75.5 } });
const turtleSoup: Diagram = {
  n: tsK.length, k: tsK,
  lv: [{ p: 72, u0: 2, t: "EQH", at: 8 }, { p: lo(tsK, 0), t: "SSL", at: 1 }],
  tx: [{ u: 10.5, p: 81, t: "@sweep", at: 11 }],
  trade: { u: 11, e: tsK[10][3], s: 76.5, t: lo(tsK, 0) },
};

const smt: Diagram = {
  n: 17, split: 50,
  line: [[0, 88], [2, 75], [4, 82], [7, 62], [9, 72], [12, 58], [14, 70], [17, 92]],
  line2: [[0, 38], [2, 26], [4, 32], [7, 12], [9, 24], [12, 17], [14, 28], [17, 44]],
  segs: [{ a: [7, 62], b: [12, 58], at: 12 }, { a: [7, 12], b: [12, 17], at: 12 }],
  tx: [{ u: 0.2, p: 96, t: "EURUSD", anchor: "start", at: 0 }, { u: 0.2, p: 46, t: "GBPUSD", anchor: "start", at: 0 }, { u: 12, p: 52, t: "LL", tone: "gold", at: 12 }, { u: 12, p: 10, t: "HL", tone: "gold", at: 12 }],
  trade: { u: 13, e: 64, s: 56, t: 90 },
};

const smc: Diagram = {
  n: 21,
  line: [[0, 88], [2, 72], [3, 78], [5, 60], [6, 67], [8, 48], [9, 56], [11, 40], [13, 62], [15, 47], [18, 72], [19, 67], [21, 82]],
  lv: [{ p: 72, u0: 2, u1: 3.6, at: 3 }, { p: 60, u0: 5, u1: 6.6, at: 6 }, { p: 48, u0: 8, u1: 10, at: 10 }, { p: 56, u0: 9, u1: 12.6, tone: "gold", at: 12 }],
  tx: [{ u: 2.8, p: 68, t: "BOS", at: 3 }, { u: 5.8, p: 56, t: "BOS", at: 6 }, { u: 9, p: 44, t: "BOS", at: 10 }, { u: 10.9, p: 60, t: "CHoCH", tone: "gold", at: 12 }, { u: 12.6, p: 36, t: "OB", tone: "demand", at: 13 }],
  zones: [{ u0: 10.5, u1: 21, p0: 40, p1: 47, tone: "demand", at: 13 }],
  trade: { u: 15, e: 47, s: 38.5, t: 78 },
};

const crtK: K[] = [[66, 79, 64, 77], [77, 80, 40, 44], [44, 50, 35, 48], [48, 82, 46, 79], [79, 81, 74, 76]];
const crt: Diagram = {
  n: 6, k: crtK,
  lv: [{ p: 80, u0: 1, t: "CRH", at: 2 }, { p: 40, u0: 1, t: "CRL", at: 2 }, { p: 60, u0: 1, t: "50%", at: 2 }],
  tx: [{ u: 1.5, p: 87, t: "1", tone: "gold", at: 2 }, { u: 2.5, p: 29, t: "2", tone: "gold", at: 3 }, { u: 3.5, p: 89, t: "3", tone: "gold", at: 4 }],
  trade: { u: 3, e: 48, s: 34, t: 80 },
};

const sdK = walk(zz(60, 66, 72, 73, 71.5, 72.5, 63, 55, 47, 41, 42.5, 40.5, 42, 51, 60, 58, 52, 44, 52, 61, 70, 71));
const supplyDemand: Diagram = {
  n: sdK.length, k: sdK,
  zones: [{ ...box(sdK, 2, 4, "supply", "@supply"), lu: 5.9 }, { ...box(sdK, 9, 11, "demand", "@demand"), lu: 12.85 }],
  trade: { u: 16, e: hi(sdK, 9, 11), s: r1(lo(sdK, 9, 11) - 1), t: lo(sdK, 2, 4) },
};

const qmK = walk(zz(36, 30, 40, 47, 53, 60, 55, 50, 47, 55, 63, 70, 72.5, 68, 60, 52, 43, 50, 57, 60, 53, 46, 38, 31, 33), { 5: { h: 63.5 }, 18: { h: 61 } });
const msnr: Diagram = {
  n: qmK.length, k: qmK,
  lv: [{ p: 60, u0: 4, t: "QML", tone: "gold", at: 6 }, { p: 30, u0: 1, t: "V", at: 2 }],
  tx: [{ u: 5.5, p: 68, t: "H", at: 6 }, { u: 7.5, p: 41, t: "L", at: 9 }, { u: 11.5, p: 79, t: "HH", at: 13 }, { u: 15.5, p: 37, t: "LL", at: 17 }],
  trade: { u: 19, e: 60, s: 75, t: 30 },
};

const srK = walk(zz(50, 58, 65, 68, 60, 52, 44, 52, 61, 67, 58, 49, 44, 51, 58, 64, 69, 68), { 3: { h: 71 }, 5: { l: 40 }, 9: { h: 70.5 }, 11: { l: 39.5 } });
const snr: Diagram = {
  n: srK.length, k: srK,
  zones: [{ u0: 0, u1: srK.length, p0: 38.5, p1: 42.5, tone: "demand", t: "@support", at: 7, lu: 6.9 }, { u0: 0, u1: srK.length, p0: 67.5, p1: 71.5, tone: "supply", t: "@resistance", at: 4, lu: 10.2 }],
  trade: { u: 12, e: srK[11][3], s: 37.5, t: 67.5 },
};

const brK = walk(zz(45, 52, 58, 51, 47, 55, 59, 54, 58, 70, 73, 67, 62, 69, 75, 80, 78), { 1: { h: 60.5 }, 5: { h: 60.5 }, 11: { l: 60 } });
const breakoutRetest: Diagram = {
  n: brK.length, k: brK,
  lv: [{ p: 60.5, u0: 1, tone: "gold", at: 6 }],
  tx: [{ u: 8.5, p: 76, t: "@break", at: 9 }, { u: 11.5, p: 54, t: "@retest", at: 12 }],
  trade: { u: 12, e: brK[11][3], s: 59, t: 76 },
};

const ofK = walk(zz(70, 64, 58, 52, 47, 44, 43.5, 44, 49, 56, 54, 61, 67), { 5: { l: 41.5 }, 6: { l: 41.8 } });
const orderFlow: Diagram = {
  n: ofK.length, k: ofK, delta: [-30, -35, -40, -42, -50, -85, -70, 45, 60, 10, 40, 35],
  lv: [{ p: 42, t: "VAL", at: 4 }, { p: 67, t: "POC", tone: "gold", at: 9 }],
  zones: [{ u0: 5, u1: 7, p0: 40.8, p1: 46, tone: "gold", t: "@absorption", at: 7 }],
  trade: { u: 8, e: ofK[7][3], s: 40.5, t: 67 },
};

const vpProfile = { p0: 20, step: 5, v: [2, 3, 5, 8, 5, 24, 28, 34, 27, 22, 4, 6, 8, 6, 3] };
const vpVA = valueArea(vpProfile);
const vpK = walk(zz(38, 35, 33, 37, 41, 45, 47, 44, 49, 54, 52, 58, 63, 67.5, 66));
const volumeProfile: Diagram = {
  n: 21, k: vpK, profile: vpProfile,
  lv: [{ p: vpVA.poc, t: "POC", tone: "gold", at: 0 }, { p: vpVA.vah, t: "VAH", at: 0 }, { p: vpVA.val, t: "VAL", at: 0 }],
  trade: { u: 7, u1: 14.5, e: vpK[6][3], s: 41, t: vpVA.vah },
};

const vwK = walk(zz(40, 47, 51, 49, 55, 59, 56, 53, 51, 56, 61, 65, 63, 68, 72, 70, 74));
const vwVol = [9, 6, 5, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
const vw = vwapOf(vwK, vwVol);
const vwap: Diagram = {
  n: vwK.length, k: vwK,
  curves: [
    { pts: vw.map((x) => [x.u, r1(x.m)]), tone: "gold", t: "VWAP" },
    { pts: vw.map((x) => [x.u, r1(x.m + x.sd)]), tone: "muted", dash: true, t: "+1σ" },
    { pts: vw.map((x) => [x.u, r1(x.m - x.sd)]), tone: "muted", dash: true, t: "−1σ" },
  ],
  tx: [{ u: 7.5, p: 44, t: "@retest", at: 8 }],
  trade: { u: 7, e: 51.2, s: r1(vw[7].m - 3), t: hi(vwK, 4, 5) },
};

const wyckoff: Diagram = {
  n: 26,
  line: [[0, 88], [2, 74], [3, 79], [5, 52], [7, 68], [9, 55], [11, 66], [13, 56], [15, 64], [17, 47], [18, 57], [19, 52], [21, 74], [23, 66], [26, 90]],
  zones: [{ u0: 5, u1: 20.4, p0: 52, p1: 68, tone: "range", at: 7 }],
  tx: [{ u: 5, p: 46, t: "SC", at: 5 }, { u: 7, p: 73, t: "AR", at: 7 }, { u: 9, p: 49, t: "ST", at: 9 }, { u: 17, p: 41, t: "Spring", tone: "gold", at: 17 }, { u: 19.2, p: 46, t: "Test", at: 19 }, { u: 21, p: 79, t: "SOS", at: 21 }, { u: 23, p: 60, t: "LPS", at: 23 }],
  trade: { u: 19, e: 52, s: 45.5, t: 84 },
};

const orbK = walk(zz(50, 56, 52, 55, 54, 55, 60, 58, 63, 67, 65, 70, 73, 72), { 6: { l: 56.9 } });
const orbHi = hi(orbK, 0, 2), orbLo = lo(orbK, 0, 2);
const orb: Diagram = {
  n: orbK.length, k: orbK, bands: [{ u0: 0, u1: 3, t: "09:30–09:45" }],
  lv: [{ p: orbHi, t: "ORH", tone: "gold", at: 3 }, { p: orbLo, t: "ORL", tone: "gold", at: 3 }],
  tx: [{ u: 5.5, p: 66, t: "@break", at: 6 }],
  trade: { u: 7, e: orbK[6][3], s: r1((orbHi + orbLo) / 2), t: r1(orbHi + 2 * (orbHi - orbLo)) },
};

const asia = [52, 53.5, 51.5, 53, 51, 52.5, 54, 52.5, 53.5, 52.5];
const asiaW = { 3: { l: 50 }, 5: { h: 55 } };
const lbK = walk(zz(...asia, 54.5, 56.5, 59, 61, 60, 63, 62), asiaW);
const lbBox = box(lbK, 0, 8, "range", undefined, 9, 9);
const londonBreakout: Diagram = {
  n: lbK.length, k: lbK, bands: [{ u0: 0, u1: 9, t: "@asia" }, { u0: 9, u1: lbK.length, t: "@london" }],
  zones: [lbBox],
  tx: [{ u: 10.5, p: 64, t: "@break", at: 11 }],
  trade: { u: 11, e: lbK[10][3], s: r1((lbBox.p0 + lbBox.p1) / 2), t: r1(lbBox.p1 + 1.5 * (lbBox.p1 - lbBox.p0)) },
};

const arK = walk(zz(...asia, 51, 51, 53.5, 56.5, 58.5, 57.5, 60.5, 59.5), { ...asiaW, 10: { l: 48.5 } });
const arBox = box(arK, 0, 8, "range", undefined, 9, 9);
const asianRange: Diagram = {
  n: arK.length, k: arK, bands: [{ u0: 0, u1: 9, t: "@asia" }, { u0: 9, u1: arK.length, t: "@london" }],
  zones: [arBox],
  lv: [{ p: 60, t: "PDH", at: 0 }],
  tx: [{ u: 10.5, p: 45.5, t: "@sweep", at: 11 }],
  trade: { u: 11, e: arK[10][3], s: 47.8, t: 60 },
};

const nwK = walk(zz(50, 51, 49.5, 50.5, 49.8, 50.6, 50, 58, 59.5, 57, 58.5, 62, 65, 68.5, 72, 70), { 6: { h: 66, l: 47 } });
const nwHi = hi(nwK, 7, 9), nwLo = lo(nwK, 7, 9);
const news: Diagram = {
  n: nwK.length, k: nwK, vlines: [{ u: 6, t: "@news 08:30" }],
  zones: [box(nwK, 7, 9, "range", undefined, 10, 10)],
  lv: [{ p: 72.5, t: "H4", at: 0 }],
  trade: { u: 10, e: r1(nwHi + 0.3), s: r1(nwLo - 0.5), t: 72.5 },
};

const elliott: Diagram = {
  n: 21,
  line: [[0, 20], [3, 42], [5, 30], [9, 78], [11, 64], [14, 88], [16, 72], [18, 80], [21, 58]],
  tx: [{ u: 3, p: 46, t: "1", tone: "gold", at: 3 }, { u: 5, p: 24, t: "2", tone: "gold", at: 5 }, { u: 9, p: 82, t: "3", tone: "gold", at: 9 }, { u: 11, p: 58, t: "4", tone: "gold", at: 11 },
    { u: 14, p: 92, t: "5", tone: "gold", at: 14 }, { u: 16, p: 66, t: "A", at: 16 }, { u: 18, p: 84, t: "B", at: 18 }, { u: 21, p: 52, t: "C", anchor: "end", at: 21 }],
  trade: { u: 5, u1: 9, e: 31, s: 19, t: r1(30 + 1.618 * 22) },
};

const fib = (r: number) => r1(80 - r * 58);
const fibonacci: Diagram = {
  n: 15,
  line: [[0, 22], [6, 80], [9, fib(0.705)], [14, 96]],
  lv: [{ p: 80, t: "0", at: 6 }, { p: fib(-0.27), t: "−0.27", at: 6 }, { p: fib(0.5), t: "0.5", at: 6 }, { p: fib(0.705), t: "0.705", tone: "gold", at: 6 }, { p: 22, t: "1", at: 6 }],
  zones: [{ u0: 6, u1: 15, p0: fib(0.79), p1: fib(0.62), tone: "gap", t: "OTE", at: 7 }],
  trade: { u: 9, e: fib(0.705), s: 21, t: 80 },
};

const gX = 16, gA = 82, gB = r1(gA - 0.618 * (gA - gX)), gC = r1(gB + 0.618 * (gA - gB)), gD = r1(gA - 0.786 * (gA - gX));
const harmonics: Diagram = {
  n: 19,
  line: [[0, gX], [5, gA], [8, gB], [11, gC], [15, gD], [19, 64]],
  tri: [[[0, gX], [5, gA], [8, gB]], [[8, gB], [11, gC], [15, gD]]],
  segs: [{ a: [0, gX], b: [8, gB], t: "0.618", at: 8 }, { a: [0, gX], b: [15, gD], t: "0.786", at: 15 }],
  zones: [{ u0: 13.5, u1: 17, p0: gD - 2.5, p1: gD + 3, tone: "gap", t: "PRZ", at: 15 }],
  tx: [{ u: 0, p: gX - 6, t: "X", anchor: "start", at: 0 }, { u: 5, p: gA + 4, t: "A", at: 5 }, { u: 8, p: gB - 6, t: "B", at: 8 }, { u: 11, p: gC + 4, t: "C", at: 11 }, { u: 15, p: gD - 9, t: "D", at: 15 }],
  trade: { u: 15, e: r1(gD + 0.4), s: 15, t: r1(gD + 0.618 * (gA - gD)) },
};

const chartPatterns: Diagram = {
  n: 21,
  line: [[0, 28], [3, 58], [5, 46], [8, 76], [10, 46], [13, 56], [15, 46], [16, 38], [17, 45], [21, 14]],
  lv: [{ p: 46, u0: 5, t: "@neckline", tone: "gold", at: 10, lu: 9.7, below: true }],
  tx: [{ u: 3, p: 62, t: "LS", at: 3 }, { u: 8, p: 80, t: "H", at: 8 }, { u: 13, p: 60, t: "RS", at: 13 }],
  trade: { u: 17, e: 45, s: 57.5, t: 16 },
};

const paK = walk(zz(72, 68, 63, 65, 58, 52, 54, 47, 48, 53, 57, 55, 61, 66, 70, 68), { 7: { l: 41, h: 49 } });
const priceAction: Diagram = {
  n: paK.length, k: paK,
  zones: [{ u0: 0, u1: paK.length, p0: 39.5, p1: 43, tone: "demand", t: "@support", at: 2 }],
  lv: [{ p: 70, t: "@resistance", at: 2 }],
  tx: [{ u: 7.5, p: 35, t: "Pin", tone: "gold", at: 8 }],
  trade: { u: 8, e: 49.5, s: 40, t: 70 },
};

// ---- the catalog --------------------------------------------------------------------------------------------------

export const STRATEGIES: Strategy[] = [
  { id: "ict", name: "ICT Concepts", short: "ICT", group: "liquidity", level: 3, styles: ["day", "swing"], markets: ["fx", "gold", "indices", "crypto"], tf: ["D1", "H4", "H1", "M15", "M5", "M1"], sessions: ["london", "ny"], aka: "inner circle trader michael huddleston fvg fair value gap order block ote kill zone killzone liquidity pd array premium discount", dia: ict },
  { id: "silver-bullet", name: "ICT Silver Bullet", short: "Silver Bullet", group: "liquidity", level: 2, styles: ["scalp", "day"], markets: ["indices", "fx", "gold"], tf: ["M15", "M5", "M1"], sessions: ["london", "ny"], aka: "silver bullet sb 10am 3am fvg time window", dia: silverBullet },
  { id: "po3", name: "ICT Power of 3 (AMD)", short: "Power of 3", group: "liquidity", level: 2, styles: ["day", "swing"], markets: ["indices", "fx", "gold", "crypto"], tf: ["D1", "H4", "H1", "M15"], sessions: ["asia", "london", "ny"], aka: "power of three po3 amd accumulation manipulation distribution judas swing midnight open", dia: po3 },
  { id: "ict-2022", name: "ICT 2022 Model", short: "ICT 2022", group: "liquidity", level: 2, styles: ["day"], markets: ["indices", "fx", "gold"], tf: ["H1", "M15", "M5", "M1"], sessions: ["london", "ny"], aka: "2022 mentorship model mss market structure shift displacement", dia: ict2022 },
  { id: "unicorn", name: "ICT Unicorn", short: "Unicorn", group: "liquidity", level: 3, styles: ["scalp", "day"], markets: ["indices", "fx", "gold"], tf: ["M15", "M5", "M1"], sessions: ["london", "ny"], aka: "unicorn model breaker block fvg overlap", dia: unicorn },
  { id: "mmxm", name: "ICT Market Maker Model", short: "MMXM", group: "liquidity", level: 3, styles: ["day", "swing"], markets: ["indices", "fx", "gold", "crypto"], tf: ["H4", "H1", "M15"], sessions: ["london", "ny"], aka: "mmxm mmbm mmsm market maker buy sell model smart money reversal smr original consolidation", dia: mmxm },
  { id: "turtle-soup", name: "Turtle Soup", short: "Turtle Soup", group: "liquidity", level: 2, styles: ["day", "swing"], markets: ["fx", "gold", "indices", "crypto", "stocks"], tf: ["H4", "H1", "M15", "M5"], sessions: ["any"], aka: "false breakout fakeout stop hunt liquidity raid linda raschke larry connors", dia: turtleSoup },
  { id: "smt", name: "SMT Divergence", short: "SMT", group: "liquidity", level: 3, styles: ["scalp", "day"], markets: ["fx", "indices", "crypto"], tf: ["H1", "M15", "M5"], sessions: ["london", "ny"], aka: "smart money technique correlation eurusd gbpusd nq es dxy divergence", dia: smt },
  { id: "smc", name: "SMC — Smart Money Concepts", short: "SMC", group: "liquidity", level: 2, styles: ["scalp", "day", "swing"], markets: ["fx", "gold", "indices", "crypto"], tf: ["H4", "H1", "M15", "M5", "M1"], sessions: ["london", "ny"], aka: "smart money bos choch order block inducement liquidity mitigation premium discount", dia: smc },
  { id: "crt", name: "CRT — Candle Range Theory", short: "CRT", group: "liquidity", level: 2, styles: ["day", "swing"], markets: ["fx", "gold", "indices", "crypto"], tf: ["D1", "H4", "H1", "M15"], sessions: ["any"], aka: "candle range theory crh crl range high low", dia: crt },
  { id: "supply-demand", name: "Supply & Demand", short: "Supply & Demand", group: "levels", level: 1, styles: ["day", "swing"], markets: ["fx", "gold", "indices", "crypto", "stocks"], tf: ["D1", "H4", "H1", "M15"], sessions: ["any"], aka: "s&d supply demand zone sam seiden rally base drop rbd dbr", dia: supplyDemand },
  { id: "msnr", name: "Malaysian SNR + QM", short: "MSNR / QM", group: "levels", level: 2, styles: ["day", "swing"], markets: ["fx", "gold", "indices", "crypto"], tf: ["H4", "H1", "M15"], sessions: ["any"], aka: "msnr malaysian support resistance quasimodo qm qml a level v level fresh", dia: msnr },
  { id: "snr", name: "Support & Resistance", short: "S/R", group: "levels", level: 1, styles: ["scalp", "day", "swing"], markets: ["fx", "gold", "indices", "crypto", "stocks"], tf: ["D1", "H4", "H1", "M15"], sessions: ["any"], aka: "s/r sr support resistance key level flip role reversal market structure round number", dia: snr },
  { id: "breakout-retest", name: "Breakout & Retest", short: "Break & Retest", group: "levels", level: 1, styles: ["scalp", "day", "swing"], markets: ["fx", "gold", "indices", "crypto", "stocks"], tf: ["H4", "H1", "M15", "M5"], sessions: ["any"], aka: "break and retest brt flip breakout", dia: breakoutRetest },
  { id: "order-flow", name: "Order Flow (Footprint · Delta)", short: "Order Flow", group: "volume", level: 3, styles: ["scalp", "day"], markets: ["futures", "indices", "gold", "crypto"], tf: ["M5", "M1"], sessions: ["london", "ny"], aka: "orderflow footprint delta cvd absorption imbalance dom tape reading bookmap exhaustion", dia: orderFlow },
  { id: "volume-profile", name: "Volume / Market Profile", short: "Volume Profile", group: "volume", level: 2, styles: ["day", "swing"], markets: ["futures", "indices", "gold", "crypto", "stocks"], tf: ["D1", "H1", "M30"], sessions: ["london", "ny"], aka: "volume profile market profile tpo poc value area vah val hvn lvn auction 80% rule initial balance", dia: volumeProfile },
  { id: "vwap", name: "VWAP / Anchored VWAP", short: "VWAP", group: "volume", level: 2, styles: ["scalp", "day"], markets: ["indices", "stocks", "futures", "gold", "crypto"], tf: ["M15", "M5", "M1"], sessions: ["london", "ny"], aka: "vwap avwap anchored volume weighted average price bands standard deviation", dia: vwap },
  { id: "wyckoff", name: "Wyckoff", short: "Wyckoff", group: "volume", level: 3, styles: ["day", "swing"], markets: ["fx", "gold", "indices", "crypto", "stocks"], tf: ["D1", "H4", "H1"], sessions: ["any"], aka: "wyckoff method accumulation distribution spring upthrust utad composite man sos lps", dia: wyckoff },
  { id: "orb", name: "ORB — 15-min Opening Range", short: "ORB 15m", group: "sessions", level: 1, styles: ["scalp", "day"], markets: ["indices", "stocks", "futures"], tf: ["M15", "M5", "M1"], sessions: ["london", "ny"], aka: "orb opening range breakout 15 minute candle first candle open 9:30", dia: orb },
  { id: "london-breakout", name: "London Breakout", short: "London Breakout", group: "sessions", level: 1, styles: ["day"], markets: ["fx", "gold"], tf: ["H1", "M15", "M5"], sessions: ["asia", "london"], aka: "london open breakout frankfurt asian box", dia: londonBreakout },
  { id: "asian-range", name: "Asian Range", short: "Asian Range", group: "sessions", level: 2, styles: ["day"], markets: ["fx", "gold", "indices"], tf: ["M15", "M5"], sessions: ["asia", "london"], aka: "asian session range asia high low sweep judas stop hunt", dia: asianRange },
  { id: "news", name: "News Trading", short: "News", group: "sessions", level: 3, styles: ["scalp", "day"], markets: ["fx", "gold", "indices", "crypto"], tf: ["M15", "M5", "M1"], sessions: ["london", "ny"], aka: "news nfp cpi fomc high impact economic calendar central bank", dia: news },
  { id: "elliott", name: "Elliott Waves", short: "Elliott", group: "waves", level: 3, styles: ["swing"], markets: ["fx", "gold", "indices", "crypto", "stocks"], tf: ["W1", "D1", "H4", "H1"], sessions: ["any"], aka: "elliott wave impulse correction abc ralph nelson elliott", dia: elliott },
  { id: "fibonacci", name: "Fibonacci / OTE", short: "Fibonacci", group: "waves", level: 1, styles: ["day", "swing"], markets: ["fx", "gold", "indices", "crypto", "stocks"], tf: ["H4", "H1", "M15"], sessions: ["any"], aka: "fibonacci fib retracement extension golden pocket 0.618 ote optimal trade entry", dia: fibonacci },
  { id: "harmonics", name: "Harmonic Patterns", short: "Harmonics", group: "waves", level: 3, styles: ["day", "swing"], markets: ["fx", "gold", "indices", "crypto"], tf: ["D1", "H4", "H1"], sessions: ["any"], aka: "harmonic gartley bat butterfly crab shark cypher xabcd scott carney prz", dia: harmonics },
  { id: "chart-patterns", name: "Chart Patterns", short: "Chart Patterns", group: "waves", level: 1, styles: ["day", "swing"], markets: ["fx", "gold", "indices", "crypto", "stocks"], tf: ["D1", "H4", "H1", "M15"], sessions: ["any"], aka: "head and shoulders double top double bottom triangle flag wedge pennant cup handle neckline", dia: chartPatterns },
  { id: "price-action", name: "Price Action (Candles)", short: "Price Action", group: "waves", level: 1, styles: ["scalp", "day", "swing"], markets: ["fx", "gold", "indices", "crypto", "stocks"], tf: ["D1", "H4", "H1", "M15"], sessions: ["any"], aka: "price action pin bar engulfing inside bar candlestick rejection naked chart", dia: priceAction },
];

/** For search: lower case, no accents or Arabic marks, one form of alef, ya and ta marbuta. */
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ًͯ-ٰٟـ]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي");

/** The strategies matching a query in any of the languages given (every word must match): by name or other names
 *  first, then by the line under the name and the concepts. */
export function searchStrategies(q: string, texts: Record<Id, StrategyText>[]): Strategy[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return STRATEGIES;
  const scored = STRATEGIES.map((s) => {
    const ts = texts.map((x) => x[s.id]);
    const head = norm(`${s.name} ${s.aka} ${ts.map((t) => t.k ?? "").join(" ")}`), body = norm(ts.map((t) => `${t.tag} ${t.concepts.map((c) => c[0]).join(" ")}`).join(" "));
    const all = words.every((w) => head.includes(w) || body.includes(w));
    return { s, score: !all ? 0 : words.every((w) => head.includes(w)) ? 2 : 1 };
  });
  return scored.filter((x) => x.score).sort((a, b) => b.score - a.score).map((x) => x.s);
}
