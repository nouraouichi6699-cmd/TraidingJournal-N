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
}

export interface Series {
  /** Mutated in place: the chart reads it every frame, so it is never copied. */
  readonly candles: Candle[];
  /** A small move inside the candle that is still forming. */
  tick: () => void;
  /** Close the forming candle and open a new one. */
  roll: () => void;
  /** A character was typed: finish a small candle, then open a fresh one behind it. */
  key: () => void;
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

  const key = () => {
    // A small candle that leans upwards more often than not.
    const from = price;
    const size = STEP * (1.6 + r() * 2.4);
    const c = shaped(from, from + (r() > 0.42 ? size : -size * 0.7), STEP * 1.1, 0.3 + r() * 0.35);
    push(c);
    price = c.c;
    roll();
  };

  return { candles, tick, roll, key };
}
