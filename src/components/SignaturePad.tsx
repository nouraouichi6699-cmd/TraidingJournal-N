// A signature drawn by hand (mouse, finger or pen), kept as one small SVG path in a 600 × 200 box, and its picture.
import { useRef, useState } from "react";
import { Eraser } from "lucide-react";

export const SIG_W = 600, SIG_H = 200;
type Pt = [number, number];
/** The strokes as one path: smooth curves through the midpoints of the points, whole units of the box. */
export function sigPath(strokes: Pt[][]): string {
  return strokes.filter((s) => s.length).map((s) => {
    if (s.length === 1) return `M${s[0][0]} ${s[0][1]}l0.1 0`; // a dot
    let d = `M${s[0][0]} ${s[0][1]}`;
    for (let i = 1; i < s.length - 1; i++) d += `Q${s[i][0]} ${s[i][1]} ${Math.round((s[i][0] + s[i + 1][0]) / 2)} ${Math.round((s[i][1] + s[i + 1][1]) / 2)}`;
    const l = s[s.length - 1];
    return `${d}L${l[0]} ${l[1]}`;
  }).join("");
}

/** A saved signature. */
export function Signature({ d, className = "h-16 w-48" }: { d: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${SIG_W} ${SIG_H}`} className={className} role="img" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SignaturePad({ onChange, label, hint, clearLabel }: { onChange: (d: string) => void; label: string; hint: string; clearLabel: string }) {
  const box = useRef<SVGSVGElement>(null), strokes = useRef<Pt[][]>([]), drawing = useRef(false);
  const [d, setD] = useState("");
  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = (box.current as SVGSVGElement).getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * SIG_W), Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * SIG_H)];
  };
  const add = (p: Pt) => {
    const s = strokes.current[strokes.current.length - 1], q = s[s.length - 1];
    if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) >= 3) s.push(p); // skip the jitter
  };
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokes.current.push([at(e)]);
    setD(sigPath(strokes.current));
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    const ev = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e];
    for (const x of ev.length ? ev : [e]) add(at(x));
    setD(sigPath(strokes.current));
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(sigPath(strokes.current));
  };
  const clear = () => { strokes.current = []; setD(""); onChange(""); };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-dashed border-border bg-surface">
        <svg ref={box} viewBox={`0 0 ${SIG_W} ${SIG_H}`} className="block aspect-[3/1] w-full cursor-crosshair touch-none select-none" role="img" aria-label={label}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
          <line x1={40} x2={SIG_W - 40} y1={SIG_H - 45} y2={SIG_H - 45} stroke="var(--border)" strokeWidth={2} strokeDasharray="6 6" />
          <path d={d} fill="none" stroke="var(--primary)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!d && <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted">{hint}</span>}
      </div>
      {d && <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-muted hover:text-text"><Eraser size={13} />{clearLabel}</button>}
    </div>
  );
}
