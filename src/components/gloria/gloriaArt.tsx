// GLORIA_RPG: hand-drawn SVG art primitives shared by the world map and the zone medallions. Each piece is drawn
// around its own base point (x, y) and scaled by `s`, so the same palm tree works at map size and medallion size.
// Animated parts carry the gz-* classes from gloria.css; nothing here runs JS per frame.

interface At { x: number; y: number; s?: number }
const at = ({ x, y, s = 1 }: At) => `translate(${x} ${y}) scale(${s})`;

/** A horizontal sine-ish wave from x0 to x1 along y, built from quadratic segments. */
export function wavePath(x0: number, x1: number, y: number, len = 40, amp = 4): string {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`;
  return d;
}

export function Pine({ dark = "#14532d", light = "#16a34a", ...p }: At & { dark?: string; light?: string }) {
  return (
    <g transform={at(p)}>
      <rect x={-2.5} y={-4} width={5} height={8} rx={1} fill="#5b3a1e" />
      {[
        [14, -2, -26],
        [11, -13, -36],
        [7.5, -24, -45],
      ].map(([w, base, top]) => (
        <g key={top}>
          <polygon points={`${-w},${base} 0,${top} ${w},${base}`} fill={dark} stroke="#052e16" strokeWidth={1} strokeLinejoin="round" />
          <polygon points={`${-w + 2},${base - 1} 0,${top + 3} 0,${base - 1}`} fill={light} />
        </g>
      ))}
    </g>
  );
}

// Palm fronds are static geometry: computed once here, not per render.
const FROND_ANGLES = [172, 138, 96, 52, 12];
const frond = (a: number, len: number, tx: number, ty: number) => {
  const r = (a * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  const ex = tx + len * c, ey = ty - len * sn * 0.55 + 7;
  return `M${tx} ${ty} Q${tx + len * 0.55 * c} ${ty - len * 0.55 * sn - 9} ${ex} ${ey} Q${tx + len * 0.45 * c} ${ty - len * 0.4 * sn + 1} ${tx} ${ty}Z`;
};
const PALM_TX = 6, PALM_TY = -40;
const FRONDS = FROND_ANGLES.map((a) => frond(a, 24, PALM_TX, PALM_TY));

export function Palm({ flip = false, ...p }: At & { flip?: boolean }) {
  return (
    <g transform={`${at(p)}${flip ? " scale(-1 1)" : ""}`}>
      <path d={`M0 0 Q3 -20 ${PALM_TX} ${PALM_TY}`} fill="none" stroke="#a16207" strokeWidth={4.5} strokeLinecap="round" />
      <path d={`M0 0 Q3 -20 ${PALM_TX} ${PALM_TY}`} fill="none" stroke="#78350f" strokeWidth={4.5} strokeDasharray="1.5 4" />
      <g className="gz-sway">
        {FRONDS.map((d, i) => (
          <path key={i} d={d} fill={i % 2 ? "#22c55e" : "#16a34a"} stroke="#14532d" strokeWidth={0.8} />
        ))}
      </g>
      <circle cx={PALM_TX - 1.5} cy={PALM_TY + 2} r={2} fill="#78350f" />
      <circle cx={PALM_TX + 2} cy={PALM_TY + 3} r={2} fill="#78350f" />
    </g>
  );
}

export function Hut(p: At) {
  return (
    <g transform={at(p)}>
      <rect x={-10} y={-12} width={20} height={12} fill="#d6a86a" stroke="#7c4a1e" strokeWidth={1} />
      <polygon points="-13,-11 0,-24 13,-11" fill="#b45309" stroke="#7c2d12" strokeWidth={1} strokeLinejoin="round" />
      <rect x={-3} y={-7} width={6} height={7} fill="#5b3a1e" />
    </g>
  );
}

export function Peak({ w, h, snow = true, rock = "#78716c", shade = "#57534e", ...p }: At & { w: number; h: number; snow?: boolean; rock?: string; shade?: string }) {
  const P = (fx: number, fy: number) => `${fx * w},${fy * h}`;
  return (
    <g transform={at(p)}>
      <polygon points={[P(-0.5, 0), P(-0.2, -0.55), P(-0.12, -0.5), P(0, -1), P(0.12, -0.62), P(0.2, -0.66), P(0.5, 0)].join(" ")} fill={rock} stroke="#292524" strokeWidth={1.2} strokeLinejoin="round" />
      <polygon points={[P(0, -1), P(0.12, -0.62), P(0.2, -0.66), P(0.5, 0), P(0.08, 0), P(0.04, -0.45)].join(" ")} fill={shade} />
      {snow && (
        <polygon
          points={[P(0, -1), P(-0.065, -0.74), P(-0.03, -0.7), P(0, -0.77), P(0.04, -0.7), P(0.075, -0.76)].join(" ")}
          fill="#f5f5f4"
          stroke="#d6d3d1"
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}

export function Ship(p: At) {
  return (
    <g transform={at(p)}>
      <g className="gz-bob">
        <path d="M-18 0 L18 0 L12 8 L-12 8 Z" fill="#78350f" stroke="#451a03" strokeWidth={1} strokeLinejoin="round" />
        <line x1={0} y1={0} x2={0} y2={-30} stroke="#451a03" strokeWidth={2} />
        <path d="M1.5 -28 Q15 -16 1.5 -4 Z" fill="#f5f5f4" stroke="#a8a29e" strokeWidth={0.8} />
        <path d="M-1.5 -24 Q-11 -15 -1.5 -6 Z" fill="#e7e5e4" stroke="#a8a29e" strokeWidth={0.8} />
        <polygon className="gz-flag" points="0,-30 9,-27.5 0,-25" fill="#ef4444" />
      </g>
    </g>
  );
}

export function Castle(p: At) {
  const towers: [number, number, number][] = [
    [-70, 24, 70],
    [46, 24, 70],
    [-16, 32, 95],
  ];
  return (
    <g transform={at(p)}>
      {/* curtain wall + crenellations */}
      <rect x={-60} y={-40} width={120} height={40} fill="#a8a29e" stroke="#57534e" strokeWidth={1.5} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={-60 + i * 10 + 2} y={-46} width={6} height={6} fill="#a8a29e" stroke="#57534e" strokeWidth={1} />
      ))}
      {[-48, -30, 26, 40].map((x, i) => (
        <path key={x} d={`M${x} ${-30 + (i % 2) * 12} h10`} stroke="#78716c" strokeWidth={1} />
      ))}
      {/* gold wall banners */}
      {[-42, 34].map((x) => (
        <path key={x} d={`M${x} -38 h9 v18 l-4.5 -4 l-4.5 4 Z`} fill="#eab308" stroke="#a16207" strokeWidth={0.8} />
      ))}
      {/* towers + cone roofs + flags */}
      {towers.map(([x, w, h], i) => (
        <g key={i}>
          <rect x={x} y={-h} width={w} height={h} fill="#d6d3d1" stroke="#57534e" strokeWidth={1.5} />
          <rect x={x + w / 2 - 2.5} y={-h + 12} width={5} height={9} rx={2.5} fill="#fbbf24" opacity={0.85} />
          <polygon points={`${x - 4},${-h} ${x + w / 2},${-h - (i === 2 ? 34 : 28)} ${x + w + 4},${-h}`} fill="#475569" stroke="#1e293b" strokeWidth={1.2} strokeLinejoin="round" />
          <line x1={x + w / 2} y1={-h - (i === 2 ? 34 : 28)} x2={x + w / 2} y2={-h - (i === 2 ? 52 : 42)} stroke="#292524" strokeWidth={1.5} />
          <polygon
            className="gz-flag"
            style={{ animationDelay: `${-i * 0.45}s` }}
            points={`${x + w / 2},${-h - (i === 2 ? 52 : 42)} ${x + w / 2 + (i === 2 ? 18 : 13)},${-h - (i === 2 ? 47 : 38.5)} ${x + w / 2},${-h - (i === 2 ? 42 : 35)}`}
            fill="#eab308"
            stroke="#a16207"
            strokeWidth={0.6}
          />
        </g>
      ))}
      {/* gate */}
      <path d="M-12 0 L-12 -20 Q0 -32 12 -20 L12 0 Z" fill="#292524" stroke="#57534e" strokeWidth={1.5} />
      {[-6, 0, 6].map((x) => (
        <line key={x} x1={x} y1={-25} x2={x} y2={0} stroke="#78716c" strokeWidth={1} />
      ))}
    </g>
  );
}

export function Volcano({ smoke = true, ...p }: At & { smoke?: boolean }) {
  return (
    <g transform={at(p)}>
      <path d="M-120 0 C-80 -40 -45 -110 -22 -146 L22 -146 C45 -110 80 -40 120 0 Z" fill="#44403c" stroke="#1c1917" strokeWidth={2} strokeLinejoin="round" />
      <path d="M8 -146 L22 -146 C45 -110 80 -40 120 0 L30 0 C40 -50 20 -110 8 -146 Z" fill="#292524" />
      <ellipse className="gz-glow" cx={0} cy={-150} rx={40} ry={18} fill="#f97316" opacity={0.5} />
      <ellipse cx={0} cy={-146} rx={22} ry={6} fill="#f97316" stroke="#7c2d12" strokeWidth={1.5} />
      <ellipse className="gz-lava" cx={0} cy={-147} rx={13} ry={3} fill="#fde047" />
      {["M-8 -143 Q-20 -100 -38 -70 Q-50 -45 -62 -18", "M10 -143 Q22 -105 30 -80 Q40 -50 56 -24", "M1 -142 Q-2 -118 6 -100"].map((d) => (
        <g key={d}>
          <path className="gz-lava" d={d} fill="none" stroke="#ef4444" strokeWidth={5} strokeLinecap="round" />
          <path className="gz-lava-flow" d={d} fill="none" stroke="#fde047" strokeWidth={1.6} strokeLinecap="round" strokeDasharray="6 12" />
        </g>
      ))}
      {smoke &&
        [0, 1, 2, 3].map((i) => (
          <circle key={i} className="gz-smoke" style={{ animationDelay: `${-i * 1.25}s` }} cx={-4 + i * 3} cy={-162} r={10 + (i % 2) * 4} fill="#a8a29e" opacity={0.7} />
        ))}
    </g>
  );
}

export function Throne(p: At) {
  return (
    <g transform={at(p)}>
      <rect x={-40} y={-8} width={80} height={8} fill="#a16207" stroke="#713f12" strokeWidth={1} />
      <rect x={-32} y={-16} width={64} height={8} fill="#ca8a04" stroke="#713f12" strokeWidth={1} />
      <path d="M-22 -16 L-22 -70 Q-22 -86 -10 -90 L0 -102 L10 -90 Q22 -86 22 -70 L22 -16 Z" fill="#eab308" stroke="#a16207" strokeWidth={2} strokeLinejoin="round" />
      <rect x={-14} y={-76} width={28} height={42} rx={6} fill="#991b1b" stroke="#7f1d1d" strokeWidth={1} />
      <rect x={-30} y={-46} width={8} height={22} rx={2} fill="#ca8a04" stroke="#a16207" strokeWidth={1} />
      <rect x={22} y={-46} width={8} height={22} rx={2} fill="#ca8a04" stroke="#a16207" strokeWidth={1} />
      <rect x={-26} y={-34} width={52} height={10} rx={3} fill="#ca8a04" stroke="#a16207" strokeWidth={1.2} />
      {/* the balance (mizan) crowning the throne */}
      <line x1={0} y1={-102} x2={0} y2={-120} stroke="#fef08a" strokeWidth={2} />
      <line x1={-17} y1={-116} x2={17} y2={-116} stroke="#fef08a" strokeWidth={2} strokeLinecap="round" />
      {[-17, 17].map((x) => (
        <g key={x}>
          <path d={`M${x} -116 L${x - 6} -106 M${x} -116 L${x + 6} -106`} stroke="#fef08a" strokeWidth={0.8} />
          <path d={`M${x - 7} -106 Q${x} -100 ${x + 7} -106 Z`} fill="#fef08a" />
        </g>
      ))}
      <circle cx={0} cy={-121} r={2.5} fill="#fef08a" />
      <circle className="gz-twinkle" cx={-10} cy={-60} r={2} fill="#fff" />
      <circle className="gz-twinkle" style={{ animationDelay: "-1.4s" }} cx={12} cy={-82} r={1.6} fill="#fff" />
    </g>
  );
}

/** Light rays fanning from a point; the group slowly rotates. */
export function Rays({ x, y, r, n = 16, color = "#fef08a", opacity = 0.2 }: { x: number; y: number; r: number; n?: number; color?: string; opacity?: number }) {
  const half = Math.PI / n / 2;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return `M0 0 L${r * Math.cos(a - half)} ${r * Math.sin(a - half)} L${r * Math.cos(a + half)} ${r * Math.sin(a + half)}Z`;
  }).join(" ");
  return (
    <g transform={`translate(${x} ${y})`}>
      <path className="gz-rays" d={pts} fill={color} opacity={opacity} />
    </g>
  );
}

export function SkullGlyph({ color = "#fff" }: { color?: string }) {
  return (
    <g>
      <circle cx={0} cy={-1.5} r={6} fill={color} />
      <rect x={-3.6} y={2.5} width={7.2} height={4.5} rx={1} fill={color} />
      <circle cx={-2.3} cy={-1.8} r={1.7} fill="#450a0a" />
      <circle cx={2.3} cy={-1.8} r={1.7} fill="#450a0a" />
      <path d="M0 1 l-0.9 1.6 h1.8 Z" fill="#450a0a" />
      <path d="M-1.6 4.2 v2.4 M0 4.2 v2.4 M1.6 4.2 v2.4" stroke="#450a0a" strokeWidth={0.6} />
    </g>
  );
}

export function LockGlyph() {
  return (
    <g>
      <path d="M-6 -2 V-7 a6 6 0 0 1 12 0 V-2" fill="none" stroke="#e7e5e4" strokeWidth={2.6} />
      <rect x={-9} y={-2.5} width={18} height={14} rx={2.5} fill="#d6d3d1" stroke="#57534e" strokeWidth={1} />
      <circle cx={0} cy={3} r={2} fill="#44403c" />
      <rect x={-0.8} y={3.5} width={1.6} height={4} fill="#44403c" />
    </g>
  );
}
