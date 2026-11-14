// GLORIA_RPG: one zone's medallion on the world map -- mini-scene, progress ring, name ribbon, state effects
// (fog + lock / pulsing "play me" glow / conquered shine + check), the boss alarm, and a hover tooltip.
import { useId, type KeyboardEvent } from "react";
import type { Lang } from "../../types";
import { Castle, LockGlyph, Palm, Peak, Pine, Rays, Ship, SkullGlyph, Throne, Volcano, wavePath } from "./gloriaArt";
import type { MapZone, ZoneTheme } from "./gloriaZones";
import { gt, ZONE_STATE_TEXT } from "./gloriaText";

const R_SCENE = 34;
const R_RING = 40;
const RING_LEN = 2 * Math.PI * R_RING;

const SKY: Record<ZoneTheme, [string, string]> = {
  oasis: ["#7dd3fc", "#fde68a"],
  forest: ["#86efac", "#14532d"],
  mountain: ["#bfdbfe", "#a8a29e"],
  sea: ["#38bdf8", "#075985"],
  castle: ["#93c5fd", "#e7e5e4"],
  volcano: ["#7f1d1d", "#1c1917"],
  throne: ["#fef9c3", "#a16207"],
};

/** The zone's miniature illustration, drawn in a circle of radius 34 around (0, 0). Also used by the side panel. */
export function ZoneScene({ theme }: { theme: ZoneTheme }) {
  const uid = useId().replace(/:/g, "");
  const clip = `gz-scene-clip-${uid}`, sky = `gz-scene-sky-${uid}`;
  return (
    <g className="gz-scene">
      <defs>
        <clipPath id={clip}>
          <circle r={R_SCENE} />
        </clipPath>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY[theme][0]} />
          <stop offset="1" stopColor={SKY[theme][1]} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x={-R_SCENE} y={-R_SCENE} width={R_SCENE * 2} height={R_SCENE * 2} fill={`url(#${sky})`} />
        {theme === "oasis" && (
          <>
            <circle cx={17} cy={-15} r={6} fill="#fef08a" />
            <ellipse cx={0} cy={30} rx={46} ry={20} fill="#e9c46a" />
            <ellipse cx={-8} cy={19} rx={17} ry={5} fill="#38bdf8" stroke="#0284c7" strokeWidth={0.8} />
            <Palm x={10} y={22} s={0.7} />
            <Palm x={-20} y={18} s={0.5} flip />
          </>
        )}
        {theme === "forest" && (
          <>
            <ellipse cx={0} cy={34} rx={46} ry={16} fill="#14532d" />
            <Pine x={-17} y={26} s={0.7} />
            <Pine x={15} y={28} s={0.8} />
            <Pine x={0} y={30} s={1} dark="#166534" light="#22c55e" />
          </>
        )}
        {theme === "mountain" && (
          <>
            <Peak x={-12} y={34} w={50} h={46} />
            <Peak x={14} y={36} w={52} h={58} />
          </>
        )}
        {theme === "sea" && (
          <>
            {[2, 12, 22].map((y, i) => (
              <path key={y} className={i % 2 ? "gz-wave-r" : "gz-wave"} d={wavePath(-80, 80, y, 16, 3)} fill="none" stroke="#e0f2fe" strokeWidth={1.4} opacity={0.75} />
            ))}
            <Ship x={0} y={6} s={0.85} />
          </>
        )}
        {theme === "castle" && (
          <>
            <ellipse cx={0} cy={36} rx={46} ry={14} fill="#4d7c0f" />
            <Castle x={0} y={28} s={0.34} />
          </>
        )}
        {theme === "volcano" && (
          <>
            <Volcano x={0} y={36} s={0.36} smoke={false} />
            {[0, 1, 2].map((i) => (
              <circle key={i} className="gz-smoke" style={{ animationDelay: `${-i * 1.6}s` }} cx={-1 + i * 2} cy={-18} r={4 + (i % 2) * 2} fill="#a8a29e" opacity={0.7} />
            ))}
          </>
        )}
        {theme === "throne" && (
          <>
            <Rays x={0} y={-4} r={50} n={12} color="#fffbeb" opacity={0.45} />
            <Throne x={0} y={30} s={0.42} />
          </>
        )}
      </g>
    </g>
  );
}

interface Props {
  mz: MapZone;
  lang: Lang;
  /** Plays the one-shot "conquered" celebration. */
  celebrate?: boolean;
  onOpen: (mz: MapZone) => void;
}

export default function GloriaZoneNode({ mz, lang, celebrate, onOpen }: Props) {
  const t = gt(lang);
  const { visual, state, done, total, bossReady } = mz;
  const { x, y } = visual.node;
  const name = visual.name[lang];
  const pct = total ? done / total : 0;
  const ringColor = state === "completed" ? "#facc15" : visual.color;
  const uid = useId().replace(/:/g, "");
  const shineClip = `gz-shine-${uid}`, fog = `gz-nfog-${uid}`;

  // Ribbon width follows the label; Arabic glyphs run a little narrower per character at this size.
  const ribbonW = Math.max(96, name.length * (lang === "ar" ? 7.2 : 7.6) + 30);
  const stateLabel = ZONE_STATE_TEXT[state][lang];
  const hint = state === "locked" ? t("explore") : bossReady ? t("bossAwaits") : t("enter");

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(mz);
    }
  };

  return (
    <g transform={`translate(${x} ${y})`}>
      <g
        className={`gz-node gz-node--${state} sfx-hover`}
        data-sfx="zone-hover"
        data-sfx-click="zone-open"
        role="button"
        tabIndex={0}
        aria-label={`${name}: ${stateLabel}, ${done}/${total} ${t("quests")}`}
        onClick={() => onOpen(mz)}
        onKeyDown={onKey}
      >
        <defs>
          <clipPath id={shineClip}>
            <circle r={R_SCENE} />
          </clipPath>
          <radialGradient id={fog}>
            <stop offset="0" stopColor="#e2e8f0" stopOpacity={0.75} />
            <stop offset="0.7" stopColor="#cbd5e1" stopOpacity={0.45} />
            <stop offset="1" stopColor="#94a3b8" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* generous invisible hit target */}
        <circle r={56} fill="transparent" />

        <g className="gz-node-body">
          {state === "active" && (
            <>
              <circle className="gz-pulse" r={46} fill="none" stroke={visual.color} strokeWidth={3} />
              <circle className="gz-pulse gz-pulse-2" r={46} fill="none" stroke={visual.color} strokeWidth={3} />
              <circle r={50} fill={visual.color} opacity={0.18} className="gz-glow" />
            </>
          )}
          {state === "completed" && <circle r={52} fill="#facc15" opacity={0.2} className="gz-glow" />}

          {/* medallion frame */}
          <circle r={46} fill="#1c1917" stroke={state === "locked" ? "#57534e" : "#ca8a04"} strokeWidth={2.5} />
          <circle className="gz-focus" r={50} fill="none" stroke="#f8fafc" strokeWidth={2} strokeDasharray="4 4" />
          <circle r={R_RING} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={5} />
          {total > 0 && (
            <circle
              r={R_RING}
              fill="none"
              stroke={ringColor}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={`${RING_LEN * pct} ${RING_LEN}`}
              transform="rotate(-90)"
              style={{ transition: "stroke-dasharray 1s ease" }}
            />
          )}

          <ZoneScene theme={visual.theme} />

          {state === "locked" && (
            <>
              <circle r={R_SCENE} fill={`url(#${fog})`} />
              <circle r={R_SCENE} fill="#0f172a" opacity={0.25} />
              <g transform="translate(0 -2) scale(1.5)">
                <LockGlyph />
              </g>
              <circle className="gz-twinkle" cx={-18} cy={-14} r={1.8} fill="#e0f2fe" />
              <circle className="gz-twinkle" style={{ animationDelay: "-1.3s" }} cx={20} cy={10} r={1.4} fill="#e0f2fe" />
            </>
          )}

          {state === "completed" && (
            <>
              <g clipPath={`url(#${shineClip})`}>
                <rect className="gz-shine" x={-8} y={-60} width={14} height={120} fill="#fff" opacity={0.35} />
              </g>
              <g transform="translate(31 -31)">
                <circle r={11} fill="#16a34a" stroke="#f0fdf4" strokeWidth={2} />
                <path d="M-5 0 L-1.5 3.5 L5.5 -4" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </>
          )}

          {bossReady && (
            <g transform="translate(-31 -31)">
              <circle className="gz-boss-ring" r={12} fill="none" stroke="#ef4444" strokeWidth={2} />
              <g className="gz-boss">
                <circle r={12} fill="#7f1d1d" stroke="#fca5a5" strokeWidth={1.5} />
                <SkullGlyph color="#fee2e2" />
              </g>
            </g>
          )}

          {state === "active" && (
            <g className="gz-marker">
              <g transform="translate(0 -64)">
                <path d="M0 -13 L10 0 L0 13 L-10 0 Z" fill="#facc15" stroke="#713f12" strokeWidth={1.5} />
                <text y={4.5} textAnchor="middle" fontSize={13} fontWeight={900} fill="#713f12">!</text>
              </g>
            </g>
          )}
        </g>

        {/* name ribbon + progress */}
        <g transform="translate(0 60)">
          <path
            d={`M${-ribbonW / 2 - 10} 2 L${-ribbonW / 2} -11 H${ribbonW / 2} L${ribbonW / 2 + 10} 2 L${ribbonW / 2} 13 H${-ribbonW / 2} Z`}
            fill={state === "locked" ? "#292524" : "#1c1917"}
            stroke={state === "locked" ? "#57534e" : "#ca8a04"}
            strokeWidth={1.5}
            opacity={0.95}
          />
          <text y={5.5} textAnchor="middle" fontSize={13} fontWeight={700} fill={state === "locked" ? "#a8a29e" : "#fef3c7"} style={{ letterSpacing: lang === "ar" ? 0 : "0.02em" }}>
            {name}
          </text>
          {total > 0 && (
            <g transform="translate(0 24)">
              <rect x={-20} y={-9} width={40} height={16} rx={8} fill="rgba(15,23,42,0.85)" stroke={ringColor} strokeWidth={1} />
              <text y={3} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#f8fafc" direction="ltr">
                {done}/{total}
              </text>
            </g>
          )}
        </g>

        {/* hover tooltip */}
        {/* CSS transforms replace an element's transform attribute, so every animated group is nested inside its positioned one. */}
        <g transform="translate(0 -122)">
          <g className="gz-tip">
          <rect x={-104} y={-30} width={208} height={58} rx={10} fill="rgba(15,23,42,0.94)" stroke={visual.color} strokeWidth={1.5} />
          <text y={-11} textAnchor="middle" fontSize={13} fontWeight={800} fill="#f8fafc">{name}</text>
          <text y={6} textAnchor="middle" fontSize={11} fill="#cbd5e1">
            {stateLabel} · {done}/{total} {t("quests")}
          </text>
          <text y={21} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={bossReady ? "#fca5a5" : "#facc15"}>{hint}</text>
          </g>
        </g>

        {celebrate && (
          <g pointerEvents="none">
            <circle className="gz-burst" r={50} fill="none" stroke="#facc15" strokeWidth={4} />
            <g className="gz-burst" style={{ animationDelay: "0.3s" }}>
              <Rays x={0} y={0} r={90} n={14} color="#fde047" opacity={0.55} />
            </g>
            <g transform="translate(0 -84)">
              <g className="gz-banner">
                <rect x={-62} y={-15} width={124} height={26} rx={13} fill="#facc15" stroke="#713f12" strokeWidth={1.5} />
                <text y={3.5} textAnchor="middle" fontSize={13} fontWeight={900} fill="#713f12">{t("conquered")}</text>
              </g>
            </g>
          </g>
        )}
      </g>
    </g>
  );
}
