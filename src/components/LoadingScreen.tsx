import { useEffect, useMemo, useRef, useState } from "react";
import { useReduceMotion } from "../useSettings";
import { CITIES, VIEW_BOX, WORLD_PATH, type CityGroup } from "./worldMap";
import { marketNow, type MarketNow, type SessionKey } from "../lib/sessions";
import { loadingPhrases, type Key } from "../i18n";
import type { Lang } from "../types";

const BG = "#0b0b0c";
const LAND = "#1c1c1b";
const STRIPE = "#2a2a28";
const COAST = "#4d4c46";
const GOLD = "#F5B83D";
const INK = "#e9e4d8";
// The session colours: Europe light blue, the Americas a soft red, Asia yellow.
const COLOR: Record<CityGroup, string> = { eu: "#85B7EB", am: "#F08A84", as: "#F7D154" };

const PULSE_MS = 1000; // one city lights up a second
const PULSE_LIFE = 1400; // how long its ring and flare last
const ARC_MS = 1800; // the gold arc draws, then fades away
const ARC_DRAW = 0.42; // the share of that time spent drawing
const PHRASE_MS = 4500;
const RINGS = 3; // fixed pools, so the number of elements never grows
const ARCS = 3;
const OPEN_BIAS = 0.8; // how often the city that pulses belongs to a session that is open

const SESSION_GROUP: Record<SessionKey, CityGroup> = { sessLN: "eu", sessNY: "am", sessTK: "as", sessSY: "as" };

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  /** "full" is the whole screen; "compact" is the phrase alone, for a page that is still loading its code. */
  variant?: "full" | "compact";
}

/** The three languages of one phrase at once, changing together. */
function Phrases({ compact }: { compact?: boolean }) {
  const n = loadingPhrases.en.length;
  const [i, setI] = useState(() => Math.floor(Math.random() * n));
  useEffect(() => {
    const id = window.setInterval(() => setI((v) => v + 1), PHRASE_MS);
    return () => window.clearInterval(id);
  }, []);
  const k = i % n;
  // All three lines share one size, which shrinks together on a narrow screen.
  const size = { fontSize: "clamp(12px, 3.3vw, 15px)" };
  return (
    <div
      key={k}
      className={`ld-phrase flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 px-5 py-3 text-center leading-snug ${compact ? "" : "backdrop-blur-sm"}`}
      style={{ background: "rgba(0,0,0,.42)", color: INK }}
    >
      <p lang="ar" dir="rtl" style={size}>{loadingPhrases.ar[k]}</p>
      <p lang="en" dir="ltr" style={size}>{loadingPhrases.en[k]}</p>
      <p lang="fr" dir="ltr" style={size}>{loadingPhrases.fr[k]}</p>
    </div>
  );
}

function Chip({ t, market }: { t: (k: Key) => string; market: MarketNow }) {
  const names = market.open.map((k) => t(k)).join(" + ");
  const state = market.closed ? t("marketClosed") : market.open.length ? `${names} ${t("sessionsOpen")}` : t("betweenSessions");
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5" style={{ background: "rgba(0,0,0,.42)", color: INK, fontSize: "clamp(10px, 2.6vw, 12px)" }}>
      <span className="flex items-center gap-1">
        {market.open.length === 0
          ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: COAST }} />
          : market.open.map((k) => <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ background: COLOR[SESSION_GROUP[k]] }} />)}
      </span>
      <span>{market.gmt} GMT · {state}</span>
    </div>
  );
}

/** ميزان over its beam, and the Latin name under it. Stays in the same corner in every language. */
function Wordmark() {
  return (
    <div className="flex flex-col items-end gap-1">
      <div style={{ fontFamily: "'Aref Ruqaa', serif", color: GOLD, fontSize: "clamp(25px, 6.6vw, 38px)", lineHeight: 1.05 }}>
        <span className="ld-ar inline-block">ميزان</span>
      </div>
      <div className="ld-wobble" style={{ width: "clamp(78px, 20vw, 118px)" }}>
        <div className="ld-beam relative h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD} 22%, ${GOLD} 78%, transparent)` }}>
          <span className="ld-pivot absolute" style={{ left: "50%", top: "50%", marginLeft: -3.5, marginTop: -3.5, width: 7, height: 7, background: GOLD }} />
        </div>
      </div>
      {/* The negative end margin takes back the trailing letter-space, so the word ends flush with the beam. */}
      <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 500, color: GOLD, fontSize: "clamp(9px, 2.4vw, 14px)", letterSpacing: "0.45em", marginInlineEnd: "-0.45em" }}>
        {[..."MIZAN"].map((ch, i) => (
          <span key={i} className="ld-rise inline-block" style={{ animationDelay: `${1.3 + i * 0.07}s` }}>{ch}</span>
        ))}
      </div>
    </div>
  );
}

function Byline() {
  return (
    <div className="ld-by" style={{ fontFamily: "'Parisienne', cursive", color: GOLD, lineHeight: 1.15 }}>
      <span style={{ fontSize: "clamp(10px, 2.6vw, 14px)", opacity: 0.85 }}>by </span>
      <span style={{ fontSize: "clamp(15px, 4vw, 22px)" }}>Nour Aouichi</span>
    </div>
  );
}

function WorldMap({ market, still }: { market: MarketNow; still: boolean }) {
  const open = useMemo(() => new Set(market.open), [market.open]);
  const ringRefs = useRef<(SVGCircleElement | null)[]>([]);
  const arcRefs = useRef<(SVGPathElement | null)[]>([]);
  const flareRefs = useRef<(SVGCircleElement | null)[]>([]);
  // What the loop reads and writes. It lives in a ref so a frame never re-renders React.
  const loop = useRef({
    openIds: [] as number[],
    city: -1,
    slot: 0,
    arcSlot: 0,
    last: 0,
    started: false,
    rings: Array.from({ length: RINGS }, () => ({ city: -1, start: 0 })),
    arcs: Array.from({ length: ARCS }, () => ({ start: 0, len: 0 })),
  });

  // The cities of the open sessions, which is where most pulses should land.
  useEffect(() => {
    loop.current.openIds = CITIES.map((c, i) => (open.has(c.session) ? i : -1)).filter((i) => i >= 0);
  }, [open]);

  useEffect(() => {
    if (still) return;
    const st = loop.current;
    let raf = 0;

    const pick = () => {
      const pool = st.openIds.length && Math.random() < OPEN_BIAS ? st.openIds : CITIES.map((_, i) => i);
      const choice = pool.filter((i) => i !== st.city);
      return (choice.length ? choice : pool)[Math.floor(Math.random() * (choice.length || pool.length))];
    };

    const begin = (now: number) => {
      const next = pick();
      const ring = st.rings[st.slot];
      // Reusing a slot: put the city it was lighting back to rest first.
      if (ring.city >= 0) {
        const old = flareRefs.current[ring.city];
        if (old) old.style.opacity = "0";
      }
      ring.city = next;
      ring.start = now;
      const el = ringRefs.current[st.slot];
      if (el) {
        el.setAttribute("cx", String(CITIES[next].x));
        el.setAttribute("cy", String(CITIES[next].y));
        el.setAttribute("stroke", COLOR[CITIES[next].group]);
      }
      st.slot = (st.slot + 1) % RINGS;
      // A gold arc from the city that pulsed before this one.
      if (st.city >= 0 && st.city !== next) {
        const a = CITIES[st.city], b = CITIES[next];
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
        let nx = -dy / dist, ny = dx / dist;
        if (ny > 0) { nx = -nx; ny = -ny; } // always bow towards the top, so arcs read as flight paths
        const bow = Math.min(dist * 0.22, 72);
        const path = arcRefs.current[st.arcSlot];
        if (path) {
          path.setAttribute("d", `M${a.x},${a.y}Q${(a.x + b.x) / 2 + nx * bow},${(a.y + b.y) / 2 + ny * bow} ${b.x},${b.y}`);
          const len = path.getTotalLength();
          path.style.strokeDasharray = String(len);
          path.style.strokeDashoffset = String(len);
          st.arcs[st.arcSlot] = { start: now, len };
        }
        st.arcSlot = (st.arcSlot + 1) % ARCS;
      }
      st.city = next;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!st.started) { st.started = true; st.last = now - PULSE_MS; }
      if (now - st.last >= PULSE_MS) { st.last = now; begin(now); }

      for (let i = 0; i < RINGS; i++) {
        const r = st.rings[i], el = ringRefs.current[i];
        if (!el || r.city < 0) continue;
        const p = (now - r.start) / PULSE_LIFE;
        if (p >= 1) {
          el.style.opacity = "0";
          const flare = flareRefs.current[r.city];
          if (flare) flare.style.opacity = "0";
          r.city = -1;
          continue;
        }
        el.setAttribute("r", String(2 + p * 16));
        el.style.opacity = String((1 - p) * 0.75);
        const flare = flareRefs.current[r.city];
        // The dot flares up quickly, then eases back down.
        if (flare) flare.style.opacity = String(p < 0.18 ? p / 0.18 : 1 - (p - 0.18) / 0.82);
      }

      for (let i = 0; i < ARCS; i++) {
        const a = st.arcs[i], el = arcRefs.current[i];
        if (!el || !a.len) continue;
        const p = (now - a.start) / ARC_MS;
        if (p >= 1) { el.style.opacity = "0"; a.len = 0; continue; }
        el.style.strokeDashoffset = String(p < ARC_DRAW ? a.len * (1 - p / ARC_DRAW) : 0);
        el.style.opacity = String(p < ARC_DRAW ? 0.9 : 0.9 * (1 - (p - ARC_DRAW) / (1 - ARC_DRAW)));
      }
    };

    raf = requestAnimationFrame(frame);
    // Nothing to draw while the tab is in the background.
    const onVisible = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        st.started = false;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [still]);

  return (
    <svg viewBox={VIEW_BOX} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
      <defs>
        <pattern id="ld-stripe" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke={STRIPE} strokeWidth="1.3" />
        </pattern>
        {(Object.keys(COLOR) as CityGroup[]).map((g) => (
          <radialGradient key={g} id={`ld-halo-${g}`}>
            <stop offset="0%" stopColor={COLOR[g]} stopOpacity="0.5" />
            <stop offset="55%" stopColor={COLOR[g]} stopOpacity="0.1" />
            <stop offset="100%" stopColor={COLOR[g]} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <path d={WORLD_PATH} fill={LAND} />
      <path d={WORLD_PATH} fill="url(#ld-stripe)" />
      <path d={WORLD_PATH} fill="none" stroke={COAST} strokeWidth={0.7} vectorEffect="non-scaling-stroke" />

      {/* The arcs sit under the cities, so a light is never covered by a line. */}
      {Array.from({ length: ARCS }, (_, i) => (
        <path key={i} ref={(el) => { arcRefs.current[i] = el; }} fill="none" stroke={GOLD} strokeWidth={0.9} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0} />
      ))}

      {CITIES.map((c, i) => {
        const lit = open.has(c.session);
        return (
          <g key={c.id}>
            <circle cx={c.x} cy={c.y} r={11} fill={`url(#ld-halo-${c.group})`} opacity={lit ? 1 : 0} style={{ transition: "opacity .7s ease" }} />
            <circle cx={c.x} cy={c.y} r={1.8} fill={COLOR[c.group]} opacity={lit ? 0.95 : 0.3} style={{ transition: "opacity .7s ease" }} />
            <circle ref={(el) => { flareRefs.current[i] = el; }} cx={c.x} cy={c.y} r={3.4} fill={COLOR[c.group]} opacity={0} />
          </g>
        );
      })}

      {Array.from({ length: RINGS }, (_, i) => (
        <circle key={i} ref={(el) => { ringRefs.current[i] = el; }} r={0} fill="none" strokeWidth={0.9} vectorEffect="non-scaling-stroke" opacity={0} />
      ))}
    </svg>
  );
}

export default function LoadingScreen({ t, lang, variant = "full" }: Props) {
  const reduce = useReduceMotion();
  const [market, setMarket] = useState(() => marketNow());
  useEffect(() => {
    if (variant !== "full") return;
    const id = window.setInterval(() => setMarket(marketNow()), 15000);
    return () => window.clearInterval(id);
  }, [variant]);

  if (variant === "compact")
    return (
      <div role="status" aria-busy="true" className="flex items-center justify-center p-10">
        <span className="sr-only">{t("loadingData")}</span>
        <div aria-hidden="true"><Phrases compact /></div>
      </div>
    );

  // dir stays ltr whatever the language, so the two corners keep their sides; only the Arabic phrase turns around.
  return (
    <div role="status" aria-busy="true" dir="ltr" lang={lang} className="relative h-full w-full overflow-hidden" style={{ background: BG }}>
      <span className="sr-only">{t("loadingData")}</span>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col">
        <div className="pointer-events-none absolute left-4 top-4 sm:left-7 sm:top-6"><Byline /></div>
        <div className="pointer-events-none absolute right-4 top-4 sm:right-7 sm:top-6"><Wordmark /></div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-2 pt-20 sm:px-8 sm:pt-28">
          <WorldMap market={market} still={!!reduce} />
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2.5 px-4 pb-6 sm:gap-3 sm:pb-8">
          <Chip t={t} market={market} />
          <Phrases />
        </div>
      </div>
    </div>
  );
}
