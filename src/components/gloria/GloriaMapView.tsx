// GLORIA_RPG: the adventure world map. Three stacked SVGs share one 1200x800 viewBox:
//   ocean -- water, rolling waves, surf along the coast (full-width animation, kept on its own cheap layer)
//   world -- the continent, the seven lands, the journey road and the zone medallions
//   sky   -- drifting clouds and the vignette (full-width animation again, own layer, never takes clicks)
// Splitting them means the big always-moving pieces never force the detailed terrain to repaint.
import { memo, type ReactNode } from "react";
import type { Lang } from "../../types";
import { blob, blobPoints, inside, LAND_CENTER, LAND_PATH, rng, smoothClosedPath, type Pt } from "./gloriaGeo";
import { Castle, Hut, Palm, Peak, Pine, Rays, Ship, Throne, Volcano, wavePath } from "./gloriaArt";
import GloriaZoneNode from "./GloriaZoneNode";
import type { MapZone, ZoneMapState, ZoneTheme } from "./gloriaZones";
import "./gloria.css";

const VB = "0 0 1200 800";
const layer = "pointer-events-none absolute inset-0 h-full w-full";

// ---- static geometry (module scope: computed once) ---------------------------------------------------

const BIOME: Record<ZoneTheme, { c: Pt; rx: number; ry: number; seed: number; fill: string; edge: string }> = {
  oasis: { c: [228, 612], rx: 128, ry: 72, seed: 11, fill: "#e9d8a6", edge: "#84cc16" },
  forest: { c: [565, 588], rx: 172, ry: 82, seed: 4, fill: "#14532d", edge: "#166534" },
  mountain: { c: [935, 556], rx: 152, ry: 96, seed: 8, fill: "#6b5e55", edge: "#57534e" },
  sea: { c: [975, 335], rx: 128, ry: 88, seed: 5, fill: "#e9d8a6", edge: "#d6c08a" },
  castle: { c: [630, 372], rx: 122, ry: 72, seed: 2, fill: "#65a30d", edge: "#4d7c0f" },
  volcano: { c: [262, 312], rx: 128, ry: 108, seed: 9, fill: "#3b2323", edge: "#1c1917" },
  throne: { c: [620, 128], rx: 128, ry: 82, seed: 6, fill: "#a16207", edge: "#713f12" },
};
const BIOME_PATH = Object.fromEntries(
  (Object.keys(BIOME) as ZoneTheme[]).map((k) => {
    const b = BIOME[k];
    return [k, blob(b.c[0], b.c[1], b.rx, b.ry, { amp: 0.09, seed: b.seed, samples: 36 })];
  }),
) as Record<ZoneTheme, string>;

const SEA_POINTS = blobPoints(975, 335, 112, 74, { amp: 0.07, seed: 5, samples: 36 });
const SEA_PATH = smoothClosedPath(SEA_POINTS);

const FOG: Record<ZoneTheme, { c: Pt; rx: number; ry: number }> = {
  oasis: { c: [225, 625], rx: 160, ry: 100 },
  forest: { c: [560, 600], rx: 200, ry: 115 },
  mountain: { c: [935, 560], rx: 180, ry: 125 },
  sea: { c: [975, 335], rx: 150, ry: 115 },
  castle: { c: [632, 350], rx: 150, ry: 120 },
  volcano: { c: [262, 300], rx: 160, ry: 140 },
  throne: { c: [620, 125], rx: 160, ry: 105 },
};

// Forest trees: scattered inside the forest biome, clear of the medallion, drawn back-to-front.
const FOREST_POLY = blobPoints(BIOME.forest.c[0], BIOME.forest.c[1], BIOME.forest.rx - 14, BIOME.forest.ry - 12, { amp: 0.09, seed: BIOME.forest.seed, samples: 36 });
const FOREST_TREES = (() => {
  const r = rng(42);
  const out: { x: number; y: number; s: number; v: number }[] = [];
  for (let i = 0; i < 160 && out.length < 34; i++) {
    const x = 400 + r() * 330, y = 520 + r() * 150;
    if (!inside([x, y], FOREST_POLY)) continue;
    if (Math.hypot(x - 545, y - 655) < 66) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.y - y) < 20)) continue;
    out.push({ x, y, s: 0.75 + r() * 0.55, v: Math.floor(r() * 3) });
  }
  return out.sort((a, b) => a.y - b.y);
})();
const PINE_SHADES: [string, string][] = [
  ["#14532d", "#16a34a"],
  ["#166534", "#22c55e"],
  ["#052e16", "#15803d"],
];

// Grass tufts and stray trees across the open land, kept off every biome.
const LAND_INNER = blobPoints(LAND_CENTER[0], LAND_CENTER[1], 500, 345, { exp: 3, amp: 0.05, seed: 3, samples: 84 });
const TUFTS = (() => {
  const r = rng(7);
  const biomes = (Object.keys(BIOME) as ZoneTheme[]).map((k) => BIOME[k]);
  const out: Pt[] = [];
  for (let i = 0; i < 400 && out.length < 70; i++) {
    const p: Pt = [80 + r() * 1040, 40 + r() * 730];
    if (!inside(p, LAND_INNER)) continue;
    if (biomes.some((b) => ((p[0] - b.c[0]) / (b.rx + 10)) ** 2 + ((p[1] - b.c[1]) / (b.ry + 10)) ** 2 < 1)) continue;
    out.push(p);
  }
  return out;
})();

const CLOUDS = [
  { y: 46, s: 1.25, dur: 120, delay: -10 },
  { y: 98, s: 0.85, dur: 95, delay: -55 },
  { y: 30, s: 0.7, dur: 140, delay: -90 },
  { y: 140, s: 1.05, dur: 110, delay: -30 },
  { y: 70, s: 0.95, dur: 130, delay: -115 },
];

// ---- layers -------------------------------------------------------------------------------------------

const OceanLayer = memo(function OceanLayer() {
  return (
    <svg viewBox={VB} className={layer} style={{ willChange: "transform" }} aria-hidden>
      <defs>
        <radialGradient id="gz-ocean" cx="50%" cy="50%" r="75%">
          <stop offset="0" stopColor="var(--gz-ocean-1)" />
          <stop offset="1" stopColor="var(--gz-ocean-2)" />
        </radialGradient>
      </defs>
      <rect width={1200} height={800} fill="url(#gz-ocean)" />
      {Array.from({ length: 24 }, (_, i) => {
        const y = 18 + i * 33;
        return (
          <path
            key={y}
            className={`${i % 2 ? "gz-wave-r" : "gz-wave"}${i % 3 === 0 ? " gz-wave-slow" : ""}`}
            d={wavePath(-80 + (i % 2) * 20, 1300, y, 40, 3.5)}
            fill="none"
            stroke="#e0f2fe"
            strokeWidth={1.3}
            strokeLinecap="round"
            opacity={0.14 + (i % 3) * 0.04}
          />
        );
      })}
      {/* surf: the land in the world layer covers the inner half of these strokes */}
      <path d={LAND_PATH} fill="none" stroke="#e0f2fe" strokeOpacity={0.14} strokeWidth={26} />
      <path className="gz-foam" d={LAND_PATH} fill="none" stroke="#f8fafc" strokeOpacity={0.6} strokeWidth={9} strokeDasharray="18 12" strokeLinecap="round" />
      {/* far-off islets, a passing ship, and the compass rose */}
      {([[62, 470, 16], [1164, 600, 20], [1150, 170, 12]] as const).map(([x, y, r]) => (
        <g key={x}>
          <ellipse cx={x} cy={y + 3} rx={r + 8} ry={r * 0.5 + 6} fill="#f8fafc" opacity={0.2} />
          <path d={blob(x, y, r, r * 0.55, { amp: 0.12, seed: x, samples: 14 })} fill="#e9d8a6" stroke="#a16207" strokeWidth={1} />
          <Palm x={x + 2} y={y + 1} s={0.5} />
        </g>
      ))}
      <Ship x={62} y={112} s={1.1} />
      <Ship x={1122} y={74} s={0.8} />
      <g transform="translate(1112 722)" opacity={0.85}>
        <circle r={34} fill="none" stroke="#fde68a" strokeWidth={1.5} strokeDasharray="2 4" />
        <circle r={26} fill="rgba(7,42,64,0.6)" stroke="#fde68a" strokeWidth={1.2} />
        <path d="M0 -30 L6 0 L0 30 L-6 0 Z" fill="#fde68a" />
        <path d="M-30 0 L0 6 L30 0 L0 -6 Z" fill="#ca8a04" />
        <text y={-38} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fde68a">N</text>
      </g>
    </svg>
  );
});

function Fog({ theme }: { theme: ZoneTheme }) {
  const f = FOG[theme];
  const [cx, cy] = f.c;
  return (
    <g pointerEvents="none">
      <ellipse className="gz-fog" cx={cx} cy={cy} rx={f.rx} ry={f.ry} fill="url(#gz-fog)" />
      <ellipse className="gz-fog gz-fog-b" cx={cx - f.rx * 0.35} cy={cy + f.ry * 0.15} rx={f.rx * 0.6} ry={f.ry * 0.55} fill="url(#gz-fog)" />
      <ellipse className="gz-fog" style={{ animationDelay: "-5s" }} cx={cx + f.rx * 0.35} cy={cy - f.ry * 0.2} rx={f.rx * 0.55} ry={f.ry * 0.5} fill="url(#gz-fog)" />
      <circle className="gz-twinkle" cx={cx - f.rx * 0.3} cy={cy - f.ry * 0.25} r={2.4} fill="#f0f9ff" />
      <circle className="gz-twinkle" style={{ animationDelay: "-1.6s" }} cx={cx + f.rx * 0.4} cy={cy + f.ry * 0.1} r={2} fill="#f0f9ff" />
    </g>
  );
}

function OasisTerrain() {
  return (
    <>
      <ellipse cx={200} cy={600} rx={50} ry={19} fill="#38bdf8" stroke="#0284c7" strokeWidth={1.5} />
      <path className="gz-shimmer" d="M175 597 h18 M205 604 h16 M188 609 h10" stroke="#f0f9ff" strokeWidth={1.6} strokeLinecap="round" />
      {[[146, 596, 1], [170, 576, 0.85], [252, 588, 0.95], [116, 640, 0.8], [228, 572, 0.7]].map(([x, y, s], i) => (
        <Palm key={i} x={x} y={y} s={s} flip={i % 2 === 1} />
      ))}
      <Hut x={300} y={600} />
      <Hut x={328} y={622} s={0.9} />
      <Hut x={296} y={636} s={0.85} />
      <circle cx={318} cy={598} r={2} fill="#f97316" className="gz-lava" />
    </>
  );
}

function ForestTerrain() {
  return (
    <>
      {FOREST_TREES.map((t, i) => (
        <Pine key={i} x={t.x} y={t.y} s={t.s} dark={PINE_SHADES[t.v][0]} light={PINE_SHADES[t.v][1]} />
      ))}
    </>
  );
}

function MountainTerrain() {
  return (
    <>
      <Peak x={850} y={585} w={115} h={108} />
      <Peak x={1028} y={588} w={128} h={132} />
      <Peak x={936} y={574} w={155} h={168} />
      <Peak x={990} y={602} w={72} h={60} snow={false} rock="#8a7f76" />
      <Peak x={876} y={606} w={66} h={52} snow={false} rock="#8a7f76" />
    </>
  );
}

function SeaTerrain() {
  return (
    <>
      <path d={SEA_PATH} fill="url(#gz-sea)" stroke="#0369a1" strokeWidth={1.5} />
      <g clipPath="url(#gz-sea-clip)">
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} className={i % 2 ? "gz-wave-r" : "gz-wave"} d={wavePath(840, 1140, 270 + i * 19, 28, 3)} fill="none" stroke="#e0f2fe" strokeWidth={1.4} opacity={0.5} />
        ))}
      </g>
      <Ship x={898} y={292} />
      {/* a kraken stirs */}
      <path className="gz-sway" d="M1052 390 q-6 -24 6 -40 q10 -12 4 -24 q12 8 4 26 q-8 16 0 38 Z" fill="#0f766e" stroke="#134e4a" strokeWidth={1.2} />
      <path d="M1040 392 q12 -6 26 0" fill="none" stroke="#e0f2fe" strokeWidth={1.4} opacity={0.7} />
      <polygon points="1068,300 1078,286 1090,302" fill="#57534e" stroke="#292524" strokeWidth={1} />
    </>
  );
}

function CastleTerrain() {
  return (
    <>
      <path d="M615 452 Q618 430 635 402" fill="none" stroke="#a8a29e" strokeWidth={9} strokeLinecap="round" />
      <path d="M615 452 Q618 430 635 402" fill="none" stroke="#78716c" strokeWidth={9} strokeDasharray="3 5" />
      <Castle x={635} y={400} s={0.78} />
    </>
  );
}

function VolcanoTerrain() {
  return (
    <>
      {["M168 360 l18 -8 l10 6 l16 -10", "M330 372 l-14 -10 l-12 4", "M220 402 l14 -8 l12 4 l10 -6"].map((d) => (
        <path key={d} className="gz-lava" d={d} fill="none" stroke="#f97316" strokeWidth={2} strokeLinecap="round" />
      ))}
      <Volcano x={262} y={378} s={0.95} />
    </>
  );
}

function ThroneTerrain() {
  return (
    <>
      <Rays x={620} y={104} r={165} n={18} />
      <circle className="gz-glow" cx={620} cy={108} r={74} fill="url(#gz-aura)" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={588 + i * 4} y={152 + i * 6} width={64 - i * 8} height={6} rx={1} fill={i % 2 ? "#ca8a04" : "#a16207"} stroke="#713f12" strokeWidth={0.8} />
      ))}
      <Throne x={620} y={152} s={0.8} />
    </>
  );
}

const TERRAIN: Record<ZoneTheme, () => ReactNode> = {
  oasis: OasisTerrain,
  forest: ForestTerrain,
  mountain: MountainTerrain,
  sea: SeaTerrain,
  castle: CastleTerrain,
  volcano: VolcanoTerrain,
  throne: ThroneTerrain,
};

/** Control points for the curved road between consecutive zones (index = order of the zone it leads to, minus 2). */
const ROAD_CTRL: Pt[] = [
  [390, 640],
  [725, 720],
  [1050, 520],
  [800, 330],
  [450, 540],
  [400, 255],
];

function Road({ from, to, ctrl, target, source }: { from: Pt; to: Pt; ctrl: Pt; target: ZoneMapState; source: ZoneMapState }) {
  const d = `M${from[0]} ${from[1]} Q${ctrl[0]} ${ctrl[1]} ${to[0]} ${to[1]}`;
  if (target === "locked") {
    return (
      <g>
        <path d={d} fill="none" stroke="#0f172a" strokeOpacity={0.35} strokeWidth={5} strokeLinecap="round" strokeDasharray="1 11" />
        <path d={d} fill="none" stroke="#e7e5e4" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 11" />
      </g>
    );
  }
  const travelled = source === "completed" && target === "completed";
  return (
    <g>
      <path d={d} fill="none" stroke="#451a03" strokeOpacity={0.6} strokeWidth={9} strokeLinecap="round" />
      <path d={d} fill="none" stroke={travelled ? "#facc15" : "#fde68a"} strokeWidth={5} strokeLinecap="round" />
      {target === "active" && <path className="gz-march" d={d} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={2.4} strokeLinecap="round" strokeDasharray="7 21" />}
    </g>
  );
}

interface Props {
  zones: MapZone[];
  lang: Lang;
  onOpenZone: (mz: MapZone) => void;
  /** Zone orders to play the one-shot conquest celebration on. */
  celebrate?: ReadonlySet<number>;
  /** Zone orders just lifted out of the fog, to fade their colour in. */
  reveal?: ReadonlySet<number>;
  /** Overlay (e.g. a loading or error notice) shown centred over the map. */
  overlay?: ReactNode;
}

export default function GloriaMapView({ zones, lang, onOpenZone, celebrate, reveal, overlay }: Props) {
  return (
    <div className="gz-root w-full overflow-x-auto">
      <div
        className="gz-map-frame relative mx-auto aspect-[3/2] w-full min-w-[720px] overflow-hidden rounded-2xl border border-border shadow-xl"
        style={{ maxWidth: "max(720px, calc((100vh - 12.5rem) * 1.5))" }}
      >
        <OceanLayer />

        <svg viewBox={VB} className="absolute inset-0 h-full w-full" role="group" aria-label="GLORIA world map">
          <defs>
            <radialGradient id="gz-land" cx="50%" cy="45%" r="65%">
              <stop offset="0" stopColor="#65a30d" />
              <stop offset="0.7" stopColor="#4d7c0f" />
              <stop offset="1" stopColor="#3f6212" />
            </radialGradient>
            <linearGradient id="gz-sea" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#06b6d4" />
              <stop offset="1" stopColor="#0ea5e9" />
            </linearGradient>
            <clipPath id="gz-sea-clip">
              <path d={SEA_PATH} />
            </clipPath>
            <radialGradient id="gz-fog">
              <stop offset="0" stopColor="#e2e8f0" stopOpacity={0.85} />
              <stop offset="0.55" stopColor="#cbd5e1" stopOpacity={0.55} />
              <stop offset="1" stopColor="#94a3b8" stopOpacity={0} />
            </radialGradient>
            <radialGradient id="gz-aura">
              <stop offset="0" stopColor="#fef08a" stopOpacity={0.9} />
              <stop offset="1" stopColor="#fef08a" stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* the continent: drop shadow, sand beach, grass, a sketchy second outline */}
          <path d={LAND_PATH} fill="#000" opacity={0.32} transform="translate(8 12)" />
          <path d={LAND_PATH} fill="#e9d8a6" stroke="#a16207" strokeWidth={1.5} />
          <path d={LAND_PATH} fill="url(#gz-land)" transform={`translate(${LAND_CENTER[0]} ${LAND_CENTER[1]}) scale(0.972) translate(${-LAND_CENTER[0]} ${-LAND_CENTER[1]})`} />
          <path d={LAND_PATH} fill="none" stroke="#3f2d12" strokeOpacity={0.35} strokeWidth={0.8} transform="translate(-2 1.5)" />
          {TUFTS.map(([x, y], i) => (
            <path key={i} d={`M${x - 4} ${y} l2 -5 l2 5 l2 -6 l2 6`} fill="none" stroke={i % 3 ? "#3f6212" : "#84cc16"} strokeWidth={1.2} strokeLinejoin="round" opacity={0.8} />
          ))}

          {/* the seven lands */}
          {zones.map((mz) => {
            const theme = mz.visual.theme;
            const b = BIOME[theme];
            const Art = TERRAIN[theme];
            const cls = mz.state === "locked" ? "gz-terrain gz-terrain--locked" : reveal?.has(mz.visual.order) ? "gz-terrain gz-terrain--reveal" : "gz-terrain";
            return (
              <g key={theme} className={cls}>
                <path d={BIOME_PATH[theme]} fill={b.fill} stroke={b.edge} strokeWidth={3} strokeLinejoin="round" opacity={0.95} />
                <Art />
              </g>
            );
          })}

          {/* the journey road */}
          {zones.slice(1).map((mz, i) => (
            <Road
              key={mz.visual.theme}
              from={[zones[i].visual.node.x, zones[i].visual.node.y]}
              to={[mz.visual.node.x, mz.visual.node.y]}
              ctrl={ROAD_CTRL[i]}
              source={zones[i].state}
              target={mz.state}
            />
          ))}

          {zones.filter((mz) => mz.state === "locked").map((mz) => <Fog key={mz.visual.theme} theme={mz.visual.theme} />)}

          {zones.map((mz) => (
            <GloriaZoneNode key={mz.visual.theme} mz={mz} lang={lang} celebrate={celebrate?.has(mz.visual.order)} onOpen={onOpenZone} />
          ))}
        </svg>

        <SkyLayer />

        {overlay && <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">{overlay}</div>}
      </div>
    </div>
  );
}

const SkyLayer = memo(function SkyLayer() {
  return (
    <svg viewBox={VB} className={layer} style={{ willChange: "transform" }} aria-hidden>
      <defs>
        <radialGradient id="gz-vignette" cx="50%" cy="50%" r="72%">
          <stop offset="0.6" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.45} />
        </radialGradient>
      </defs>
      {CLOUDS.map((c, i) => (
        <g key={i} transform={`translate(0 ${c.y})`}>
          <g className="gz-cloud" style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
            <g transform={`scale(${c.s})`} opacity={0.85}>
              <ellipse cx={10} cy={22} rx={70} ry={14} fill="#0f172a" opacity={0.12} />
              <ellipse cx={0} cy={8} rx={58} ry={18} fill="#f8fafc" />
              <ellipse cx={-26} cy={0} rx={28} ry={20} fill="#f8fafc" />
              <ellipse cx={14} cy={-8} rx={32} ry={24} fill="#ffffff" />
              <ellipse cx={42} cy={4} rx={24} ry={16} fill="#f1f5f9" />
            </g>
          </g>
        </g>
      ))}
      <rect width={1200} height={800} fill="url(#gz-vignette)" />
    </svg>
  );
});
