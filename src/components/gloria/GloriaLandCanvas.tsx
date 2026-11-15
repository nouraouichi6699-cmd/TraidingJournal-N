// GLORIA_RPG: draws a LandDefinition (gloriaLands) as one pixel-art SVG, in four layers:
//   1. terrain tiles  2. terrain details (grass blades, pebbles, ripples)  3. objects, depth-sorted by row
//   4. ambient fireflies.
// All variation is a deterministic hash of the tile position, so the land never "reshuffles" between renders.
// Not interactive yet -- purely a scene.
import { useMemo, type ComponentType, type ReactNode } from "react";
import { hash2, TILE, type LandDefinition, type LandObject, type LandObjectType, type TerrainType } from "./gloriaLands";
import {
  Bush,
  FenceH,
  FenceV,
  Flower,
  LandArtDefs,
  Log,
  Mushroom,
  Rock,
  RockSmall,
  Stump,
  Torch,
  TreeLarge,
  TreeMedium,
  TreeSmall,
} from "./gloriaLandArt";

const PAD = 16;
const CRISP = { shapeRendering: "crispEdges" as const };

const ART: Record<LandObjectType, ComponentType<{ x: number; y: number; seed?: number }>> = {
  treeLarge: TreeLarge,
  treeMedium: TreeMedium,
  treeSmall: TreeSmall,
  bush: Bush,
  rock: Rock,
  rockSmall: RockSmall,
  mushroom: Mushroom,
  flower: Flower,
  torch: Torch,
  log: Log,
  stump: Stump,
  fenceH: FenceH,
  fenceV: FenceV,
};

function tileShade(land: LandDefinition, t: TerrainType, col: number, row: number): string {
  const shades = land.palette[t];
  return shades[Math.floor(hash2(col, row, 10) * shades.length)];
}

/** Layer 2: tiny pixel details on a tile. */
function tileDetails(t: TerrainType, col: number, row: number, x: number, y: number): ReactNode[] {
  const out: ReactNode[] = [];
  const h = (salt: number) => hash2(col, row, salt);
  if (t === "grass" || t === "forest") {
    const blades = Math.floor(h(20) * 3) + (t === "grass" ? 1 : 0);
    for (let i = 0; i < blades; i++) {
      const bx = x + 3 + Math.floor(h(21 + i) * (TILE - 6));
      const by = y + 3 + Math.floor(h(31 + i) * (TILE - 8));
      const tall = 2 + Math.floor(h(41 + i) * 2);
      const color = t === "grass" ? "#6cb04f" : "#3f8a35";
      out.push(<rect key={`b${col}-${row}-${i}`} x={bx} y={by} width={1} height={tall} fill={color} {...CRISP} />);
      if (h(51 + i) > 0.5) out.push(<rect key={`c${col}-${row}-${i}`} x={bx + 2} y={by + 1} width={1} height={tall - 1} fill={color} {...CRISP} />);
    }
  } else if (t === "dirt") {
    const pebbles = Math.floor(h(20) * 3);
    for (let i = 0; i < pebbles; i++) {
      const px = x + 4 + Math.floor(h(21 + i) * (TILE - 8));
      const py = y + 4 + Math.floor(h(31 + i) * (TILE - 8));
      out.push(<rect key={`p${col}-${row}-${i}`} x={px} y={py} width={2} height={2} fill={h(41 + i) > 0.5 ? "#7a5a36" : "#b89064"} {...CRISP} />);
    }
  } else if (t === "water") {
    if (h(20) > 0.25) {
      const rx = x + 4 + Math.floor(h(21) * (TILE - 14));
      const ry = y + 6 + Math.floor(h(31) * (TILE - 12));
      out.push(
        <rect
          key={`r${col}-${row}`}
          className="gz-shimmer-slow"
          style={{ animationDelay: `${(h(41) * 3).toFixed(2)}s` }}
          x={rx}
          y={ry}
          width={6 + Math.floor(h(51) * 4)}
          height={1}
          fill="#bfe3ff"
          {...CRISP}
        />,
      );
    }
  } else if (t === "sand" && h(20) > 0.5) {
    out.push(<rect key={`s${col}-${row}`} x={x + 6 + Math.floor(h(21) * 18)} y={y + 6 + Math.floor(h(31) * 18)} width={2} height={1} fill="#8f7748" {...CRISP} />);
  }
  return out;
}

const objectPos = (o: LandObject) => ({ x: o.col * TILE + TILE / 2 + (o.dx ?? 0), y: o.row * TILE + TILE / 2 + (o.dy ?? 0) });

export default function GloriaLandCanvas({ land }: { land: LandDefinition }) {
  const w = land.cols * TILE;
  const h = land.rows * TILE;

  const { tiles, details, objects } = useMemo(() => {
    const tiles: ReactNode[] = [];
    const details: ReactNode[] = [];
    land.terrain.forEach((line, row) =>
      line.forEach((t, col) => {
        const x = col * TILE;
        const y = row * TILE;
        tiles.push(<rect key={`${col}-${row}`} x={x} y={y} width={TILE} height={TILE} fill={tileShade(land, t, col, row)} {...CRISP} />);
        details.push(...tileDetails(t, col, row, x, y));
      }),
    );
    // Depth sort: lower on screen = drawn later = on top.
    const objects = [...land.objects]
      .map((o) => ({ o, ...objectPos(o) }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(({ o, x, y }, i) => {
        const Art = ART[o.type];
        return <Art key={`${o.type}-${o.col}-${o.row}-${i}`} x={x} y={y} seed={o.seed} />;
      });
    return { tiles, details, objects };
  }, [land]);

  return (
    <svg
      viewBox={`${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      style={{ imageRendering: "pixelated" }}
      role="img"
      aria-label={land.id}
    >
      <LandArtDefs />
      <rect x={-PAD} y={-PAD} width={w + PAD * 2} height={h + PAD * 2} fill="#0a0f08" />
      <g>{tiles}</g>
      <g>{details}</g>
      <g>{objects}</g>
      {/* darken the forest rim so the clearing reads as the focus */}
      <rect x={0} y={0} width={w} height={h} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={6} />
      <g aria-hidden>
        {land.fireflies.map((f, i) => (
          <g key={i} className="gz-firefly" style={{ animationDelay: `${i * 1.3}s`, animationDuration: `${5 + i * 0.9}s` }}>
            <circle cx={f.col * TILE + TILE / 2} cy={f.row * TILE + TILE / 2} r={7} fill="url(#gz-firefly-glow)" />
            <rect x={f.col * TILE + TILE / 2 - 1} y={f.row * TILE + TILE / 2 - 1} width={2} height={2} fill="#fefce8" {...CRISP} />
          </g>
        ))}
      </g>
    </svg>
  );
}
