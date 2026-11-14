// GLORIA_RPG map geometry: wobbly "hand-drawn" closed shapes and a seeded random, all computed once at module
// load. The wobble lives in the path data itself instead of an feTurbulence/feDisplacementMap filter, because a
// filter under animated SVG content would be re-run on every repainted frame.

export type Pt = [number, number];

/** Deterministic PRNG (mulberry32), so scattered trees/tufts land in the same spots on every render. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BlobOpts {
  /** Superellipse exponent: 2 = ellipse, higher = squarer. */
  exp?: number;
  /** Max relative wobble of the outline (0.05 = +-5%). */
  amp?: number;
  seed?: number;
  samples?: number;
  /** Local outward bumps: angle in radians (0 = right, PI/2 = down), relative amount, angular width. */
  bulges?: { angle: number; amount: number; width: number }[];
}

const angDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

export function blobPoints(cx: number, cy: number, rx: number, ry: number, o: BlobOpts = {}): Pt[] {
  const { exp = 2, amp = 0.05, seed = 1, samples = 48, bulges = [] } = o;
  const pts: Pt[] = [];
  for (let i = 0; i < samples; i++) {
    const th = (i / samples) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const base = 1 / Math.pow(Math.pow(Math.abs(c), exp) + Math.pow(Math.abs(s), exp), 1 / exp);
    let k = 1 + amp * (0.5 * Math.sin(5 * th + seed) + 0.3 * Math.sin(9 * th + seed * 2.3) + 0.2 * Math.sin(17 * th + seed * 4.1));
    for (const b of bulges) k += b.amount * Math.exp(-(angDist(th, b.angle) ** 2) / (b.width * b.width));
    pts.push([cx + rx * base * c * k, cy + ry * base * s * k]);
  }
  return pts;
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Closed Catmull-Rom spline through the points, as cubic Bezier path data. */
export function smoothClosedPath(pts: Pt[]): string {
  const n = pts.length;
  const p = (i: number) => pts[(i + n) % n];
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

export const blob = (cx: number, cy: number, rx: number, ry: number, o?: BlobOpts) => smoothClosedPath(blobPoints(cx, cy, rx, ry, o));

/** Even-odd point-in-polygon, for scattering decorations inside a shape. */
export function inside(pt: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// ---- the continent -------------------------------------------------------------------------------------

export const LAND_CENTER: Pt = [600, 408];
export const LAND_POINTS = blobPoints(LAND_CENTER[0], LAND_CENTER[1], 530, 372, {
  exp: 3,
  amp: 0.05,
  seed: 3,
  samples: 84,
  // a raised northern peak for the throne, a southern cape under the oasis, and an eastern headland by the sea
  bulges: [
    { angle: -Math.PI / 2, amount: 0.05, width: 0.28 },
    { angle: 2.45, amount: 0.06, width: 0.32 },
    { angle: -0.2, amount: 0.03, width: 0.25 },
  ],
});
export const LAND_PATH = smoothClosedPath(LAND_POINTS);
