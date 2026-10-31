// The candle series behind the login screen. It is invented, not market data: a random walk dressed as XAUUSD 5m,
// so the screen has something alive on it without reaching for a price feed. Nothing here touches React.
import { rng } from "./chartAnalytics";

const START = 2648.4; // a plausible gold level to start the walk from
const STEP = 0.26; // the size of one simulated move
const MAX = 72; // how many candles are kept; older ones fall off the left

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  /** 0..1, drawn as the volume bar under the candle. */
  v: number;
  /** Set on the breakout candle, which is drawn with a glow. */
  glow?: boolean;
}

export type Move = "key" | "bull" | "breakout" | "reject";

export interface Series {
  /** Mutated in place: the chart reads it every frame, so it is never copied. */
  readonly candles: Candle[];
  /** A small move inside the candle that is still forming. */
  tick: () => void;
  /** Close the forming candle and open a new one. */
  roll: () => void;
  /** Finish a candle of a given character, then open a fresh one behind it. */
  add: (move: Move) => void;
}

export function createSeries(seed = 20251031): Series {
  const r = rng(seed);
  const candles: Candle[] = [];
  let price = START;

  const push = (c: Candle) => {
    candles.push(c);
    if (candles.length > MAX) candles.shift();
  };

  const shaped = (from: number, to: number, wick: number, v: number): Candle => ({
    o: from,
    c: to,
    h: Math.max(from, to) + wick * (0.2 + r() * 0.8),
    l: Math.min(from, to) - wick * (0.2 + r() * 0.8),
    v,
  });

  // A history, so the chart is never empty on the first frame.
  for (let i = 0; i < MAX; i++) {
    const to = price + (r() - 0.48) * STEP * 5;
    push(shaped(price, to, STEP, 0.25 + r() * 0.5));
    price = to;
  }

  const tick = () => {
    const last = candles[candles.length - 1];
    if (!last) return;
    last.c += (r() - 0.5) * STEP;
    last.h = Math.max(last.h, last.c);
    last.l = Math.min(last.l, last.c);
    last.v = Math.min(1, last.v + 0.02);
    price = last.c;
  };

  const roll = () => push({ o: price, h: price, l: price, c: price, v: 0.18 + r() * 0.22 });

  const add = (move: Move) => {
    const from = price;
    let c: Candle;
    if (move === "reject") {
      // Price is pushed up, thrown back, and closes below where it opened: a long upper wick over a red body.
      const to = from - STEP * 4;
      c = { o: from, c: to, h: from + STEP * 11, l: to - STEP * 0.8, v: 0.85 + r() * 0.15 };
    } else if (move === "breakout") {
      const to = from + STEP * 26;
      c = { o: from, c: to, h: to + STEP * 2.2, l: from - STEP * 0.7, v: 1, glow: true };
    } else if (move === "bull") {
      const to = from + STEP * (7 + r() * 4);
      c = shaped(from, to, STEP * 1.2, 0.72 + r() * 0.28);
    } else {
      // A keystroke: a small candle that leans upwards more often than not.
      const size = STEP * (1.6 + r() * 2.4);
      const to = from + (r() > 0.42 ? size : -size * 0.7);
      c = shaped(from, to, STEP * 1.1, 0.3 + r() * 0.35);
    }
    push(c);
    price = c.c;
    roll();
  };

  return { candles, tick, roll, add };
}
