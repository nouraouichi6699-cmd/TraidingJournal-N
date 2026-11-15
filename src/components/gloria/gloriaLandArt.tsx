// GLORIA_RPG land art: small pixel-art SVG pieces for the objects in a land (see gloriaLands / GloriaLandCanvas).
//
// Every piece is drawn around (x, y) = the centre of its tile, out of plain rects / circles / ellipses, with
// crisp edges so it reads as pixel art. Each casts a soft shadow ellipse. `seed` (optional) varies colours so no
// two trees in a forest look the same.
//
// LandArtDefs must be rendered once inside the same <svg> (it holds the shared glow gradients).

interface ArtProps {
  x: number;
  y: number;
  seed?: number;
}

const CRISP = { shapeRendering: "crispEdges" as const };
const SHADOW = "rgba(0,0,0,0.32)";

// Canopy shade sets: [dark, base, highlight].
const CANOPY = [
  ["#1f5a24", "#2e7d32", "#43a047"],
  ["#1b5e20", "#388e3c", "#4caf50"],
  ["#24572a", "#2f7a3a", "#4a9a4f"],
  ["#1d4f2a", "#2b6e3a", "#3f8f4a"],
  ["#2a5a1f", "#3b7d2a", "#55a03c"],
  ["#1a4d33", "#276b47", "#3a8c5e"],
];
const TRUNK = ["#6b4423", "#5d3a1e", "#73492a"];

const pick = <T,>(list: T[], seed: number, salt = 0) => list[Math.abs(Math.floor(seed * 7 + salt * 13)) % list.length];
/** Small seeded integer offset in [-span, span]. */
const wob = (seed: number, salt: number, span: number) => ((Math.floor(seed * 31 + salt * 17) % (span * 2 + 1)) + span * 2 + 1) % (span * 2 + 1) - span;

export function LandArtDefs() {
  return (
    <defs>
      <radialGradient id="gz-torch-glow">
        <stop offset="0%" stopColor="#fde68a" stopOpacity={0.9} />
        <stop offset="40%" stopColor="#f59e0b" stopOpacity={0.45} />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="gz-firefly-glow">
        <stop offset="0%" stopColor="#fef9c3" stopOpacity={1} />
        <stop offset="35%" stopColor="#bef264" stopOpacity={0.6} />
        <stop offset="100%" stopColor="#bef264" stopOpacity={0} />
      </radialGradient>
    </defs>
  );
}

function Tree({ x, y, seed = 0, canopy, trunkW, trunkH }: ArtProps & { canopy: number; trunkW: number; trunkH: number }) {
  const [dark, base, light] = pick(CANOPY, seed);
  const r = canopy + wob(seed, 1, canopy > 8 ? 1 : 0);
  const cy = y + 6 - trunkH - r + 3; // canopy sits on top of the trunk
  const hx = wob(seed, 2, 2);
  return (
    <g>
      <ellipse cx={x} cy={y + 7} rx={r + 1} ry={Math.max(2, r / 3)} fill={SHADOW} />
      <rect x={x - trunkW / 2} y={y + 6 - trunkH} width={trunkW} height={trunkH} fill={pick(TRUNK, seed, 3)} {...CRISP} />
      <circle cx={x + r * 0.3} cy={cy + r * 0.3} r={r * 0.75} fill={dark} {...CRISP} />
      <circle cx={x} cy={cy} r={r} fill={base} {...CRISP} />
      <circle cx={x - r * 0.4 + hx} cy={cy - r * 0.3} r={r * 0.5} fill={light} {...CRISP} />
      <rect x={x - r * 0.55 + hx} y={cy - r * 0.6} width={2} height={2} fill="#ffffff" opacity={0.18} {...CRISP} />
    </g>
  );
}

export function TreeLarge(p: ArtProps) {
  return <Tree {...p} canopy={12} trunkW={4} trunkH={8} />;
}

export function TreeMedium(p: ArtProps) {
  return <Tree {...p} canopy={9} trunkW={3} trunkH={7} />;
}

export function TreeSmall(p: ArtProps) {
  return <Tree {...p} canopy={5} trunkW={2} trunkH={5} />;
}

export function Bush({ x, y, seed = 0 }: ArtProps) {
  const [dark, base, light] = pick(CANOPY, seed, 1);
  return (
    <g>
      <ellipse cx={x} cy={y + 6} rx={10} ry={3} fill={SHADOW} />
      <ellipse cx={x + 2} cy={y + 2} rx={9} ry={5} fill={dark} {...CRISP} />
      <ellipse cx={x} cy={y} rx={8} ry={5} fill={base} {...CRISP} />
      <ellipse cx={x - 3} cy={y - 2} rx={4} ry={2.5} fill={light} {...CRISP} />
    </g>
  );
}

export function Rock({ x, y }: ArtProps) {
  return (
    <g>
      <ellipse cx={x} cy={y + 6} rx={10} ry={3} fill={SHADOW} />
      <rect x={x - 8} y={y - 2} width={16} height={8} fill="#6b7280" {...CRISP} />
      <circle cx={x - 2} cy={y - 2} r={6} fill="#78818d" {...CRISP} />
      <circle cx={x + 4} cy={y} r={4} fill="#6b7280" {...CRISP} />
      <rect x={x - 5} y={y - 6} width={4} height={2} fill="#9ca3af" {...CRISP} />
      <rect x={x - 8} y={y + 4} width={16} height={2} fill="#4b5563" {...CRISP} />
    </g>
  );
}

export function RockSmall({ x, y }: ArtProps) {
  return (
    <g>
      <ellipse cx={x} cy={y + 3} rx={5} ry={1.5} fill={SHADOW} />
      <rect x={x - 3} y={y - 1} width={6} height={4} fill="#78818d" {...CRISP} />
      <rect x={x - 2} y={y - 2} width={3} height={1} fill="#9ca3af" {...CRISP} />
    </g>
  );
}

export function Mushroom({ x, y, seed = 0 }: ArtProps) {
  const cap = pick(["#dc2626", "#ea580c", "#b91c1c"], seed);
  return (
    <g>
      <ellipse cx={x} cy={y + 5} rx={5} ry={1.5} fill={SHADOW} />
      <rect x={x - 1.5} y={y - 1} width={3} height={6} fill="#f5f5f4" {...CRISP} />
      <circle cx={x} cy={y - 2} r={4.5} fill={cap} {...CRISP} />
      <rect x={x - 3} y={y - 4} width={1.5} height={1.5} fill="#fff" {...CRISP} />
      <rect x={x + 1} y={y - 5} width={1.5} height={1.5} fill="#fff" {...CRISP} />
    </g>
  );
}

const PETALS = ["#f9a8d4", "#fde047", "#ffffff", "#c4b5fd", "#fb7185"];

export function Flower({ x, y, seed = 0 }: ArtProps) {
  const spots = [
    [-5, -2],
    [3, -4],
    [5, 3],
    [-2, 4],
  ];
  return (
    <g>
      <ellipse cx={x} cy={y + 5} rx={8} ry={2} fill="rgba(0,0,0,0.18)" />
      {spots.map(([dx, dy], i) => (
        <g key={i}>
          <rect x={x + dx - 0.5} y={y + dy + 1} width={1} height={3} fill="#2e7d32" {...CRISP} />
          <circle cx={x + dx} cy={y + dy} r={1.8} fill={pick(PETALS, seed, i)} {...CRISP} />
          <rect x={x + dx - 0.5} y={y + dy - 0.5} width={1} height={1} fill="#ca8a04" {...CRISP} />
        </g>
      ))}
    </g>
  );
}

export function Torch({ x, y }: ArtProps) {
  return (
    <g>
      <circle className="gz-torch-glow" cx={x} cy={y - 10} r={16} fill="url(#gz-torch-glow)" />
      <ellipse cx={x} cy={y + 7} rx={4} ry={1.5} fill={SHADOW} />
      <rect x={x - 1.5} y={y - 8} width={3} height={15} fill="#5d3a1e" {...CRISP} />
      <rect x={x - 3} y={y - 9} width={6} height={2} fill="#3f2a17" {...CRISP} />
      <rect x={x - 2} y={y - 14} width={4} height={5} fill="#f59e0b" {...CRISP} />
      <rect x={x - 1} y={y - 16} width={2} height={4} fill="#fde68a" {...CRISP} />
    </g>
  );
}

export function Log({ x, y }: ArtProps) {
  return (
    <g>
      <ellipse cx={x} cy={y + 5} rx={14} ry={3} fill={SHADOW} />
      <rect x={x - 12} y={y - 3} width={24} height={8} rx={3} fill="#7c4f2a" {...CRISP} />
      <rect x={x - 12} y={y - 3} width={24} height={2} fill="#9a6a3c" {...CRISP} />
      <circle cx={x + 11} cy={y + 1} r={4} fill="#c49a6c" {...CRISP} />
      <circle cx={x + 11} cy={y + 1} r={2} fill="none" stroke="#8b5e34" strokeWidth={1} {...CRISP} />
    </g>
  );
}

export function Stump({ x, y }: ArtProps) {
  return (
    <g>
      <ellipse cx={x} cy={y + 5} rx={9} ry={3} fill={SHADOW} />
      <rect x={x - 6} y={y - 2} width={12} height={6} fill="#6b4423" {...CRISP} />
      <ellipse cx={x} cy={y - 2} rx={6} ry={3} fill="#c49a6c" {...CRISP} />
      <ellipse cx={x} cy={y - 2} rx={3.5} ry={1.8} fill="none" stroke="#8b5e34" strokeWidth={0.8} />
      <rect x={x - 0.5} y={y - 2.5} width={1} height={1} fill="#8b5e34" {...CRISP} />
    </g>
  );
}

const WOOD = "#8b5e34";
const WOOD_DARK = "#5d3a1e";

export function FenceH({ x, y }: ArtProps) {
  return (
    <g>
      <rect x={x - 16} y={y + 5} width={32} height={2} fill="rgba(0,0,0,0.22)" {...CRISP} />
      <rect x={x - 16} y={y - 5} width={32} height={3} fill={WOOD} {...CRISP} />
      <rect x={x - 16} y={y + 1} width={32} height={3} fill={WOOD} {...CRISP} />
      <rect x={x - 13} y={y - 8} width={4} height={14} fill={WOOD_DARK} {...CRISP} />
      <rect x={x + 9} y={y - 8} width={4} height={14} fill={WOOD_DARK} {...CRISP} />
    </g>
  );
}

export function FenceV({ x, y }: ArtProps) {
  return (
    <g>
      <rect x={x + 3} y={y - 16} width={2} height={32} fill="rgba(0,0,0,0.22)" {...CRISP} />
      <rect x={x - 3} y={y - 16} width={3} height={32} fill={WOOD} {...CRISP} />
      <rect x={x - 3} y={y - 13} width={6} height={4} fill={WOOD_DARK} {...CRISP} />
      <rect x={x - 3} y={y + 9} width={6} height={4} fill={WOOD_DARK} {...CRISP} />
    </g>
  );
}
