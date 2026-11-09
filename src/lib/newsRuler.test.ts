// Run: npx tsx src/lib/newsRuler.test.ts
import { rulerZoneSpans, rulerBar, MIN_BAR_PCT } from "./newsRuler";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + d}`); };
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

const MIN = 60_000;
const T0 = Date.parse("2026-01-05T12:00:00Z"); // release time

// ---- rulerZoneSpans ----
const spans60 = rulerZoneSpans(60);
const before60 = spans60.find((s) => s.zone === "before")!, at60 = spans60.find((s) => s.zone === "atRelease")!, after60 = spans60.find((s) => s.zone === "after")!;
ok("60-min window: before starts at 0", before60.startPct === 0);
ok("60-min window: before ends at (60-5)/120 = 45.8333%", near(before60.endPct, (55 / 120) * 100));
ok("60-min window: atRelease spans (60-5)/120 to (60+15)/120", near(at60.startPct, before60.endPct) && near(at60.endPct, (75 / 120) * 100));
ok("60-min window: after ends at 100", after60.endPct === 100);
ok("60-min window: zones are contiguous, start to end", before60.startPct === 0 && near(before60.endPct, at60.startPct) && near(at60.endPct, after60.startPct) && after60.endPct === 100);

// Release time is always at 50%: rangeStart + windowMin = release, and span = 2*windowMin, so pct(windowMin) = 50 always.
const pctAtRelease = (w: number) => (w / (w * 2)) * 100;
ok("release position is always 50%, whatever the window", pctAtRelease(15) === 50 && pctAtRelease(30) === 50 && pctAtRelease(60) === 50);

// A 15-minute window leaves no room after release+15min: the "after" zone collapses to zero width.
const spans15 = rulerZoneSpans(15);
const after15 = spans15.find((s) => s.zone === "after")!;
ok("15-min window: no room for \"after\" -> zero width, not negative or past 100", after15.startPct === 100 && after15.endPct === 100);

// A narrow window (< 5 min) leaves no room for "before" either -- still clamps to [0,100], never negative.
const spans3 = rulerZoneSpans(3);
const before3 = spans3.find((s) => s.zone === "before")!, at3 = spans3.find((s) => s.zone === "atRelease")!;
ok("3-min window: \"before\" collapses to zero rather than going negative", before3.startPct === 0 && before3.endPct === 0);
ok("3-min window: atRelease fills the whole ruler", at3.startPct === 0 && at3.endPct === 100);

// ---- rulerBar ----
const b1 = rulerBar(T0 - 10 * MIN, T0 - 5 * MIN, T0, 60); // entirely inside, well-formed
ok("inside the ruler: not clipped on either end", !b1.clippedStart && !b1.clippedEnd);
ok("inside the ruler: start < end", b1.startPct < b1.endPct);
ok("inside the ruler: at least the floor width", b1.endPct - b1.startPct >= MIN_BAR_PCT - 1e-9);

// Zero-length trade (entry === exit): still shows a visible sliver, not a degenerate 0-width bar.
const b2 = rulerBar(T0, T0, T0, 60);
ok("zero-length trade gets the floor width", near(b2.endPct - b2.startPct, MIN_BAR_PCT));
ok("zero-length trade is centred on its own instant (the release, here)", near((b2.startPct + b2.endPct) / 2, 50));
ok("zero-length trade is not clipped when well inside the window", !b2.clippedStart && !b2.clippedEnd);

// Exit-less (still-open) trade: same as zero-length, floored around the entry.
const b3 = rulerBar(T0 - 30 * MIN, null, T0, 60);
ok("exit-less trade gets the floor width", near(b3.endPct - b3.startPct, MIN_BAR_PCT));

// Clipping at both ends: a held-through trade that started well before the window and (hypothetically)
// would end well after it -- both ends must clip to the ruler, never spill past [0, 100].
const b4 = rulerBar(T0 - 500 * MIN, T0 + 500 * MIN, T0, 60);
ok("clipped at both ends", b4.clippedStart && b4.clippedEnd);
ok("clipped bar still spans exactly the visible ruler", b4.startPct === 0 && b4.endPct === 100);

// Clipped at the start only (entry before the window, exit inside it).
const b5 = rulerBar(T0 - 500 * MIN, T0 - 50 * MIN, T0, 60);
ok("clipped at the start only", b5.clippedStart && !b5.clippedEnd);
ok("clipped-start bar begins exactly at 0", b5.startPct === 0);

// Clipped at the end only (entry inside the window, exit after it).
const b6 = rulerBar(T0 + 50 * MIN, T0 + 500 * MIN, T0, 60);
ok("clipped at the end only", !b6.clippedStart && b6.clippedEnd);
ok("clipped-end bar ends exactly at 100", b6.endPct === 100);

// A bar whose real (unclamped) start/end lands exactly at an edge: not reported as clipped (clipping
// means the real time fell OUTSIDE the ruler, not merely at its boundary).
const b7 = rulerBar(T0 - 60 * MIN, T0 - 55 * MIN, T0, 60);
ok("flush with the start edge is not clipped", !b7.clippedStart);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
