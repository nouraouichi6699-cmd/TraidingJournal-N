// GLORIA_RPG: the adventure world map. A hand-drawn map image as background, with SVG zone medallions,
// journey roads, fog overlays and celebration effects layered on top.
//
// The image (`/gloria-map.jpg`) is a static illustrated world map. The interactive layer is a single SVG
// whose viewBox matches the image's native pixel dimensions (832 × 1248), so percentage-based zone
// positions translate 1:1 between the image and the overlay.
import { memo, type ReactNode } from "react";
import type { Lang } from "../../types";
import GloriaZoneNode from "./GloriaZoneNode";
import type { MapZone, ZoneMapState } from "./gloriaZones";
import "./gloria.css";

const VB_W = 832;
const VB_H = 1248;
const VB = `0 0 ${VB_W} ${VB_H}`;

// ---- journey road between consecutive zones -----------------------------------------------------------

/** Control points for the curved road between consecutive zones (index = zone order minus 2). */
const ROAD_CTRL: [number, number][] = [
  [480, 910],   // 1→2: Solmara → Verdantia
  [150, 680],   // 2→3: Verdantia → Aurelia (sweeps far left)
  [160, 360],   // 3→4: Aurelia → Heartlands (arcs through left coast)
  [620, 340],   // 4→5: Heartlands → Drakemar (bows far right)
  [520, 240],   // 5→6: Drakemar → Frostfell (long diagonal)
  [350, 130],   // 6→7: Frostfell → Throne
];

function Road({ from, to, ctrl, target, source }: { from: [number, number]; to: [number, number]; ctrl: [number, number]; target: ZoneMapState; source: ZoneMapState }) {
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

// ---- fog over locked zones ---------------------------------------------------------------------------

const FOG_ZONES: Record<string, { cx: number; cy: number; rx: number; ry: number }> = {
  oasis:    { cx: 416, cy: 1060, rx: 180, ry: 120 },
  forest:   { cx: 365, cy: 755,  rx: 190, ry: 120 },
  mountain: { cx: 62,  cy: 460,  rx: 170, ry: 120 },
  sea:      { cx: 400, cy: 365,  rx: 160, ry: 120 },
  castle:   { cx: 735, cy: 395,  rx: 150, ry: 110 },
  volcano:  { cx: 135, cy: 200,  rx: 170, ry: 130 },
  throne:   { cx: 416, cy: 110,  rx: 160, ry: 100 },
};

function Fog({ theme }: { theme: string }) {
  const f = FOG_ZONES[theme];
  if (!f) return null;
  return (
    <g pointerEvents="none">
      <ellipse className="gz-fog" cx={f.cx} cy={f.cy} rx={f.rx} ry={f.ry} fill="url(#gz-fog)" />
      <ellipse className="gz-fog gz-fog-b" cx={f.cx - f.rx * 0.35} cy={f.cy + f.ry * 0.15} rx={f.rx * 0.6} ry={f.ry * 0.55} fill="url(#gz-fog)" />
      <ellipse className="gz-fog" style={{ animationDelay: "-5s" }} cx={f.cx + f.rx * 0.35} cy={f.cy - f.ry * 0.2} rx={f.rx * 0.55} ry={f.ry * 0.5} fill="url(#gz-fog)" />
      <circle className="gz-twinkle" cx={f.cx - f.rx * 0.3} cy={f.cy - f.ry * 0.25} r={2.4} fill="#f0f9ff" />
      <circle className="gz-twinkle" style={{ animationDelay: "-1.6s" }} cx={f.cx + f.rx * 0.4} cy={f.cy + f.ry * 0.1} r={2} fill="#f0f9ff" />
    </g>
  );
}

// ---- main component ----------------------------------------------------------------------------------

interface Props {
  zones: MapZone[];
  lang: Lang;
  onOpenZone: (mz: MapZone) => void;
  celebrate?: ReadonlySet<number>;
  reveal?: ReadonlySet<number>;
  overlay?: ReactNode;
}

export default function GloriaMapView({ zones, lang, onOpenZone, celebrate, reveal, overlay }: Props) {
  return (
    <div className="gz-root w-full overflow-x-auto">
      <div
        className="gz-map-frame relative mx-auto aspect-[2/3] w-full min-w-[360px] overflow-hidden rounded-2xl border border-border shadow-xl"
        style={{
          maxWidth: "max(420px, calc((100vh - 12.5rem) * 0.667))",
          backgroundImage: "url(/gloria-map.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Interactive SVG overlay: zone nodes, roads, fog — all on top of the background image */}
        <svg viewBox={VB} className="absolute inset-0 h-full w-full" role="group" aria-label="GLORIA world map">
          <defs>
            <radialGradient id="gz-fog">
              <stop offset="0" stopColor="#1c1917" stopOpacity={0.75} />
              <stop offset="0.55" stopColor="#292524" stopOpacity={0.5} />
              <stop offset="1" stopColor="#44403c" stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* journey road */}
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

          {/* fog over locked zones */}
          {zones.filter((mz) => mz.state === "locked").map((mz) => <Fog key={mz.visual.theme} theme={mz.visual.theme} />)}

          {/* zone medallions */}
          {zones.map((mz) => (
            <GloriaZoneNode key={mz.visual.theme} mz={mz} lang={lang} celebrate={celebrate?.has(mz.visual.order)} onOpen={onOpenZone} />
          ))}
        </svg>

        {overlay && <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">{overlay}</div>}
      </div>
    </div>
  );
}
