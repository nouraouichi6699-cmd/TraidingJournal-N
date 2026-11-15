// GLORIA_RPG: the circular mini-map radar in the land view's bottom-start corner. It shows the real world map
// (`/gloria-map.jpg`) with a pulsing dot at the current zone; clicking it travels back to the world map.
//
// The portrait map (832×1248) is cropped into a square circle with object-fit: cover. Setting object-position to
// the zone's own percentage makes the crop slide with the zone, and the dot then sits at that same percentage of
// the circle -- so the dot always lands on the zone's spot in the visible crop.
import { forwardRef } from "react";
import type { Lang } from "../../types";
import type { MapZone } from "./gloriaZones";

const MAP_W = 832;
const MAP_H = 1248;
/** Keep the dot inside the circle (as a fraction of the diameter, measured from the centre). */
const MAX_DOT_RADIUS = 0.42;

const WORLD_MAP_TEXT: Record<Lang, string> = { en: "World Map", ar: "خريطة العالم", fr: "Carte du monde" };

interface Props {
  mz: MapZone;
  lang: Lang;
  onWorldMap: () => void;
}

const GloriaMiniMap = forwardRef<HTMLButtonElement, Props>(function GloriaMiniMap({ mz, lang, onWorldMap }, ref) {
  const { node, color } = mz.visual;
  const px = node.x / MAP_W;
  const py = node.y / MAP_H;

  // Pull dots near the rim back inside the circle.
  let dx = px - 0.5;
  let dy = py - 0.5;
  const r = Math.hypot(dx, dy);
  if (r > MAX_DOT_RADIUS) {
    dx *= MAX_DOT_RADIUS / r;
    dy *= MAX_DOT_RADIUS / r;
  }
  const dotX = (0.5 + dx) * 100;
  const dotY = (0.5 + dy) * 100;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onWorldMap}
      aria-label={WORLD_MAP_TEXT[lang]}
      title={`${WORLD_MAP_TEXT[lang]} (Esc)`}
      className="gz-minimap group absolute bottom-4 start-4 z-10 h-[100px] w-[100px] rounded-full transition-transform duration-200 hover:scale-105 focus-visible:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400 md:h-[140px] md:w-[140px]"
    >
      <span
        className="absolute inset-0 overflow-hidden rounded-full border-[3px] border-[#1a1a2e] transition-colors duration-200 group-hover:border-amber-400 group-focus-visible:border-amber-400"
        style={{ boxShadow: "0 0 12px rgba(0,0,0,0.8)" }}
      >
        <img
          src="/gloria-map.jpg"
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
          style={{ objectPosition: `${px * 100}% ${py * 100}%` }}
        />
        {/* the inset amber glow, drawn over the image (an inset shadow on the frame itself would sit under it) */}
        <span className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 8px rgba(245,158,11,0.3)" }} />
        {/* current zone */}
        <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${dotX}%`, top: `${dotY}%` }} aria-hidden>
          <span className="gz-minimap-ping absolute inset-0 rounded-full" style={{ background: color }} />
          <span className="absolute inset-0 rounded-full ring-1 ring-black/60" style={{ background: color, boxShadow: `0 0 6px ${color}, 0 0 2px #fff` }} />
        </span>
      </span>
      {/* compass */}
      <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1a1a2e] px-1 text-xs font-bold leading-4 text-amber-300/70" aria-hidden>
        N
      </span>
    </button>
  );
});

export default GloriaMiniMap;
