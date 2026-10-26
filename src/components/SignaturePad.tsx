// A signature drawn by hand (mouse, finger or pen) in ink: the line thins where the hand moves fast, thickens where it
// slows, follows a pen's pressure, and tapers at both ends (perfect-freehand draws each stroke as a filled outline).
// Kept compact in a 600 × 200 box: "v2;" then each stroke, "m" (mouse, finger) or "p" (pen) and its points "x,y[,pressure]".
import { useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { getStroke } from "perfect-freehand";

export const SIG_W = 600, SIG_H = 200;
type Stroke = { pen: boolean; pts: number[][] }; // [x, y] or [x, y, pressure 0..1]

const INK = { size: 5.5, thinning: 0.5, smoothing: 0.75, streamline: 0.6, start: { taper: 24, cap: true }, end: { taper: 34, cap: true } };
const mid = (a: number, b: number) => (a + b) / 2;
/** A stroke's outline as a closed path of smooth curves. */
/** The pressure of each point, smoothed: a pen's own, else from the hand's speed (slow = 1, fast = 0.3), so the width
 *  changes gently instead of jumping from one point to the next. */
function inked(s: Stroke): number[][] {
  let v = 0, p = s.pen ? s.pts[0][2] ?? 0.5 : 0.7;
  return s.pts.map((q, i) => {
    if (i) { const a = s.pts[i - 1]; v = 0.8 * v + 0.2 * Math.hypot(q[0] - a[0], q[1] - a[1]); }
    const want = s.pen ? q[2] ?? 0.5 : 1 - 0.7 * Math.min(1, v / 14);
    p = i ? 0.7 * p + 0.3 * want : want;
    return [q[0], q[1], p];
  });
}
function outline(s: Stroke, last = true): string {
  const p = getStroke(inked(s), { ...INK, simulatePressure: false, last });
  if (p.length < 4) return "";
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(p[0][0])} ${f(p[0][1])}Q${f(p[1][0])} ${f(p[1][1])} ${f(mid(p[1][0], p[2][0]))} ${f(mid(p[1][1], p[2][1]))}T`;
  for (let i = 2; i < p.length - 1; i++) d += `${f(mid(p[i][0], p[i + 1][0]))} ${f(mid(p[i][1], p[i + 1][1]))} `;
  return `${d}Z`;
}
export const encodeSig = (strokes: Stroke[]) => (strokes.length ? `v2;${strokes.map((s) => (s.pen ? "p" : "m") + s.pts.map((q) => (s.pen ? `${q[0]},${q[1]},${Math.round((q[2] ?? 0.5) * 100)}` : `${q[0]},${q[1]}`)).join(" ")).join(";")}` : "");
export function decodeSig(v: string): Stroke[] {
  return v.slice(3).split(";").filter(Boolean).map((s) => {
    const pen = s[0] === "p";
    return { pen, pts: s.slice(1).split(" ").map((q) => q.split(",").map(Number)).filter((q) => q.length >= 2 && q.every(Number.isFinite)).map((q) => (pen ? [q[0], q[1], (q[2] ?? 50) / 100] : [q[0], q[1]])) };
  });
}

/** A saved signature (ink, or an older one kept as a plain line). */
export function Signature({ d, className = "h-16 w-48" }: { d: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${SIG_W} ${SIG_H}`} className={className} role="img" aria-hidden="true">
      {d.startsWith("v2;") ? decodeSig(d).map((s, i) => <path key={i} d={outline(s)} fill="var(--primary)" />)
        : <path d={d} fill="none" stroke="var(--primary)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export default function SignaturePad({ onChange, label, hint, clearLabel }: { onChange: (d: string) => void; label: string; hint: string; clearLabel: string }) {
  const box = useRef<SVGSVGElement>(null), strokes = useRef<Stroke[]>([]), drawing = useRef(false);
  const [paths, setPaths] = useState<string[]>([]);
  const at = (e: { clientX: number; clientY: number; pressure: number }, pen: boolean): number[] => {
    const r = (box.current as SVGSVGElement).getBoundingClientRect();
    const k = (v: number, size: number) => Math.round(Math.max(0, Math.min(1, v)) * 10 * size) / 10; // tenths of a unit: whole units make the edge wobble
    const x = k((e.clientX - r.left) / r.width, SIG_W), y = k((e.clientY - r.top) / r.height, SIG_H);
    return pen ? [x, y, e.pressure || 0.5] : [x, y];
  };
  const redraw = () => setPaths(strokes.current.map((s, i) => outline(s, !(drawing.current && i === strokes.current.length - 1))));
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const pen = e.pointerType === "pen";
    strokes.current.push({ pen, pts: [at(e, pen)] });
    redraw();
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    const s = strokes.current[strokes.current.length - 1];
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    for (const x of evs.length ? evs : [e]) {
      const p = at(x, s.pen), q = s.pts[s.pts.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 2.5) s.pts.push(p); // points too close make the edge of the ink wobble
    }
    redraw();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    redraw();
    onChange(encodeSig(strokes.current));
  };
  const clear = () => { strokes.current = []; setPaths([]); onChange(""); };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-dashed border-border bg-surface">
        <svg ref={box} viewBox={`0 0 ${SIG_W} ${SIG_H}`} className="block aspect-[3/1] w-full cursor-crosshair touch-none select-none" role="img" aria-label={label}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
          <line x1={40} x2={SIG_W - 40} y1={SIG_H - 45} y2={SIG_H - 45} stroke="var(--border)" strokeWidth={2} strokeDasharray="6 6" />
          {paths.map((d, i) => <path key={i} d={d} fill="var(--primary)" />)}
        </svg>
        {!paths.length && <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted">{hint}</span>}
      </div>
      {paths.length > 0 && <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-muted hover:text-text"><Eraser size={13} />{clearLabel}</button>}
    </div>
  );
}
