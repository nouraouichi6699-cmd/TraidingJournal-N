// GLORIA_RPG: the character visuals shared by the HUD, the guide's roster / detail / hero cards and the reveal:
// per-character icon, tier colours, descriptions, focus stat, and the portraits.
//
// Portraits come from public/gloria-portraits/<id>-portrait.jpg: 1248x832 landscape POSTERS with a title, motto and
// trait text baked in. They are used two ways:
//   - GloriaPortrait: a small round thumbnail that crops the poster to the character's face with plain CSS (size +
//     offset from PORTRAIT_FACE below), so the baked-in text never shows and the crop can be re-tuned here without
//     regenerating any asset.
//   - GloriaPoster: the whole poster, uncropped, for a character's detail page (tap to enlarge).
// The animated overworld sprite (GloriaHeroSprite) is a separate thing and does not use any of this.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, HeartPulse, Lock, Shield, Shuffle, Skull, Sparkles, Sword, WandSparkles, X, Zap } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaCharacterLevel, GloriaStatFocus } from "../../types/gloria";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";

type L = Record<Lang, string>;

export const CHARACTER_ICON: Record<GloriaCharacterId, typeof Sword> = {
  savage: Skull,
  rogue: Shuffle,
  warrior: Sword,
  sniper: Crosshair,
  tank: Shield,
  healer: HeartPulse,
  mage: WandSparkles,
  assassin: Zap,
  elf: Sparkles,
};

/** Mirrors gloria_characters.description / description_ar (supabase/migrations/20261114_gloria_characters_reseed.sql). */
export const CHARACTER_DESC: Record<GloriaCharacterId, L> = {
  savage: { en: "Trades on raw emotion, no plan, no limits.", ar: "يتداول بدافع العاطفة الخام، بلا خطة وبلا حدود.", fr: "Trade à l'émotion brute, sans plan ni limites." },
  rogue: { en: "Still breaking even, no clear edge yet.", ar: "لا يزال عند نقطة التعادل، بلا ميزة واضحة بعد.", fr: "Toujours à l'équilibre, sans avantage clair pour l'instant." },
  warrior: { en: "Executes often and keeps the plan under volume.", ar: "ينفذ بكثافة وثبات، صفقة بعد صفقة.", fr: "Exécute souvent et tient son plan malgré le volume." },
  sniper: { en: "Few shots, each one chosen with precision.", ar: "صفقات قليلة، كل واحدة مختارة بدقة.", fr: "Peu de tirs, chacun choisi avec précision." },
  tank: { en: "Puts capital first, barely dents the drawdown.", ar: "يضع حماية رأس المال فوق كل شيء.", fr: "Le capital d'abord, un drawdown à peine entamé." },
  healer: { en: "Came back from a losing month with renewed discipline.", ar: "عاد بعد شهر خاسر بانضباط متجدد.", fr: "Revenu d'un mois perdant avec une discipline renouvelée." },
  mage: { en: "Reads many markets at once, edge backed by numbers.", ar: "يقرأ أسواقاً متعددة في آن واحد، بميزة تدعمها الأرقام.", fr: "Lit plusieurs marchés à la fois, un avantage prouvé par les chiffres." },
  assassin: { en: "Fast, precise strikes with high conviction.", ar: "ضربات سريعة ودقيقة بثقة عالية.", fr: "Des frappes rapides et précises, avec conviction." },
  elf: { en: "Edge, risk and emotion, all finally in balance.", ar: "الميزة والمخاطرة والعاطفة، كلها في توازن تام أخيراً.", fr: "Avantage, risque et émotion, enfin en équilibre." },
};

/** Mirrors gloria_characters.stat_focus: the radar axis each character is built around. */
export const CHARACTER_FOCUS: Record<GloriaCharacterId, GloriaStatFocus> = {
  savage: "power",
  rogue: "wisdom",
  warrior: "speed",
  sniper: "precision",
  tank: "defense",
  healer: "recovery",
  mage: "intelligence",
  assassin: "speed",
  elf: "precision",
};

export interface TierStyle { ring: string; bg: string; fg: string; badge: string }

export const TIER_STYLE: Record<GloriaCharacterLevel | "none", TierStyle> = {
  negative: { ring: "#ef4444", bg: "radial-gradient(circle at 35% 30%, #7f1d1d, #1c1917)", fg: "#fecaca", badge: "bg-red-500/15 text-red-300 ring-red-500/40" },
  neutral: { ring: "#94a3b8", bg: "radial-gradient(circle at 35% 30%, #475569, #1e293b)", fg: "#e2e8f0", badge: "bg-slate-400/15 text-slate-300 ring-slate-400/40" },
  positive: { ring: "#22c55e", bg: "radial-gradient(circle at 35% 30%, #166534, #052e16)", fg: "#dcfce7", badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40" },
  legendary: { ring: "#facc15", bg: "radial-gradient(circle at 35% 30%, #a16207, #422006)", fg: "#fef9c3", badge: "bg-amber-400/15 text-amber-300 ring-amber-400/50" },
  none: { ring: "#57534e", bg: "radial-gradient(circle at 35% 30%, #44403c, #1c1917)", fg: "#a8a29e", badge: "bg-stone-500/15 text-stone-300 ring-stone-500/40" },
};

/** Locked characters: the same medallion shape, drained of colour. */
const LOCKED_STYLE = { ring: "#44403c", bg: "radial-gradient(circle at 35% 30%, #292524, #0c0a09)", fg: "#57534e" };

export const posterUrl = (id: GloriaCharacterId) => `/gloria-portraits/${id}-portrait.jpg`;
const POSTER_ASPECT = 1248 / 832;

/**
 * Where each character's face sits in its poster, as a percentage of the image (x from the left, y from the top).
 * The thumbnail crop is centred here. All nine posters share one layout (character centre-to-right of centre, title
 * text down the left edge, taglines on the far right), so these only differ by a few points; nudge a value to
 * re-frame a thumbnail.
 */
export const PORTRAIT_FACE: Record<GloriaCharacterId, { x: number; y: number }> = {
  warrior: { x: 46, y: 22 },
  savage: { x: 55, y: 24 },
  rogue: { x: 56, y: 26 },
  sniper: { x: 49, y: 22 },
  tank: { x: 53, y: 22 },
  healer: { x: 60, y: 24 },
  mage: { x: 48, y: 24 },
  assassin: { x: 50, y: 24 },
  elf: { x: 60, y: 24 },
};

/** Fraction of the poster's height the square thumbnail shows: tighter on tiny avatars so a face still reads. */
const cropZoom = (size: number) => (size <= 30 ? 0.46 : size <= 64 ? 0.58 : 0.66);

/** Dimensions + offset (px) that put the face centre in the middle of a `size` square, never exposing past an edge. */
function cropBox(id: GloriaCharacterId, size: number) {
  const h = size / cropZoom(size);
  const w = h * POSTER_ASPECT;
  const { x, y } = PORTRAIT_FACE[id];
  const left = Math.min(0, Math.max(size - w, size / 2 - (x / 100) * w));
  const top = Math.min(0, Math.max(size - h, size / 2 - (y / 100) * h));
  return { w, h, left, top };
}

/** Locked: the same face, but grey and dark enough to read as a figure hidden behind the lock, not as a broken image. */
const LOCKED_FILTER = "grayscale(1) brightness(0.5) contrast(1.15)";

type LoadState = "loading" | "ready" | "failed";

/** Tracks an <img>'s load, including one the browser had cached before React attached onLoad. */
function useImageState(id: string | null) {
  const [state, setState] = useState<LoadState>("loading");
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setState("loading");
    const el = ref.current;
    if (el?.complete) setState(el.naturalWidth > 0 ? "ready" : "failed");
  }, [id]);
  return { state, ref, onLoad: () => setState("ready"), onError: () => setState("failed") };
}

interface PortraitProps {
  id: GloriaCharacterId | null;
  level: GloriaCharacterLevel | null;
  /** Outer diameter in px. */
  size: number;
  /** Greyed, darkened portrait with a lock badge. */
  locked?: boolean;
  /** Soft pulsing halo behind the portrait (the reveal, a legendary hero). */
  glow?: boolean;
  className?: string;
}

/**
 * A round portrait thumbnail: the character's poster cropped to the face, inside a tier-coloured ring. While the
 * image loads (or if it fails) the tier medallion with the character's icon shows instead, so a slow or missing file
 * never leaves a blank hole and the box never changes size.
 */
export function GloriaPortrait({ id, level, size, locked, glow, className = "" }: PortraitProps) {
  const tier = locked ? { ...TIER_STYLE.none, ...LOCKED_STYLE } : TIER_STYLE[level ?? "none"];
  const Icon = id ? CHARACTER_ICON[id] : Sparkles;
  const ring = Math.max(2, Math.round(size / 28));
  const img = useImageState(id);
  const box = id ? cropBox(id, size) : null;
  return (
    // The wrapper only sizes the portrait and carries the halo, so the halo can sit behind the medallion.
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden>
      {glow && !locked && <span className="gz-portrait-halo pointer-events-none absolute -inset-2 rounded-full" style={{ background: `radial-gradient(circle, ${tier.ring}66 40%, ${tier.ring}00 72%)` }} />}
      <span
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full"
        style={{ background: tier.bg, boxShadow: `0 0 0 ${ring}px ${tier.ring}${locked ? "" : `, 0 0 ${Math.round(size / 3.5)}px ${tier.ring}55`}` }}
      >
        {img.state !== "ready" && <Icon size={Math.round(size * 0.5)} color={tier.fg} strokeWidth={1.8} />}
        {id && box && img.state !== "failed" && (
          <img
            ref={img.ref}
            src={posterUrl(id)}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            onLoad={img.onLoad}
            onError={img.onError}
            className="absolute max-w-none select-none"
            style={{ width: box.w, height: box.h, left: box.left, top: box.top, opacity: img.state === "ready" ? 1 : 0, transition: "opacity 250ms", filter: locked ? LOCKED_FILTER : undefined }}
          />
        )}
        {/* a faint inner shade keeps the photo from looking pasted onto the ring */}
        <span className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35), inset 0 -6px 10px rgba(0,0,0,0.25)" }} />
        {locked && (
          <span
            className="absolute bottom-[6%] end-[6%] flex items-center justify-center rounded-full border border-stone-600 bg-stone-900/95 text-stone-300"
            style={{ width: Math.max(14, size * 0.36), height: Math.max(14, size * 0.36) }}
          >
            <Lock size={Math.max(8, Math.round(size * 0.2))} />
          </span>
        )}
      </span>
    </span>
  );
}

interface PosterProps {
  id: GloriaCharacterId;
  /** Accessible name; the poster's own text is part of the image. */
  label: string;
  locked?: boolean;
  enlargeLabel: string;
  closeLabel: string;
  lockedLabel: string;
  tierRing: string;
}

/**
 * The whole poster, uncropped, text and all: the hero image of a character's detail page. The 3:2 box is reserved
 * up front (no layout jump) and shows the tier medallion until the file arrives. Tap it to see the poster at full
 * size, where its small print is readable. A locked character's poster is shown muted (not hidden) with a lock chip.
 */
export function GloriaPoster({ id, label, locked, enlargeLabel, closeLabel, lockedLabel, tierRing }: PosterProps) {
  const [open, setOpen] = useState(false);
  const img = useImageState(id);
  const Icon = CHARACTER_ICON[id];
  const filter = locked ? "grayscale(0.9) brightness(0.5)" : undefined;
  return (
    <>
      <button
        type="button"
        onClick={() => img.state === "ready" && setOpen(true)}
        disabled={img.state !== "ready"}
        aria-label={`${label}. ${enlargeLabel}`}
        className="group relative block w-full overflow-hidden rounded-2xl border-2 bg-black/40 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 enabled:cursor-zoom-in"
        style={{ aspectRatio: "3 / 2", borderColor: locked ? "#44403c" : tierRing, boxShadow: locked ? undefined : `0 0 18px ${tierRing}33` }}
      >
        {img.state !== "ready" && (
          <span className="absolute inset-0 flex items-center justify-center" style={{ background: TIER_STYLE.none.bg }} aria-hidden>
            <Icon size={44} color={TIER_STYLE.none.fg} strokeWidth={1.5} className={img.state === "loading" ? "animate-pulse" : ""} />
          </span>
        )}
        {img.state !== "failed" && (
          <img
            ref={img.ref}
            src={posterUrl(id)}
            alt=""
            draggable={false}
            decoding="async"
            onLoad={img.onLoad}
            onError={img.onError}
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            style={{ opacity: img.state === "ready" ? 1 : 0, filter }}
          />
        )}
        {locked && img.state === "ready" && (
          <span className="absolute end-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-stone-500/60 bg-black/75 px-2.5 py-1 text-[11px] font-bold text-stone-200 backdrop-blur-sm">
            <Lock size={12} aria-hidden /> {lockedLabel}
          </span>
        )}
      </button>
      {open && <PosterViewer id={id} label={label} closeLabel={closeLabel} filter={filter} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Full-size poster over the whole game screen. Click, Escape or the close button dismiss it (Escape is stopped here
 *  so it does not also close the guide or leave the land). Portalled to <body> to escape the guide's transforms. */
function PosterViewer({ id, label, closeLabel, filter, onClose }: { id: GloriaCharacterId; label: string; closeLabel: string; filter?: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (prev?.isConnected) prev.focus?.({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="gz-welcome-backdrop fixed inset-0 z-[130] flex cursor-zoom-out items-center justify-center bg-black/90 p-3 sm:p-6"
      onClick={onClose}
    >
      <img src={posterUrl(id)} alt={label} className="gz-welcome max-h-full max-w-full rounded-xl object-contain shadow-2xl shadow-black" style={{ filter }} />
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute end-3 top-3 rounded-full border border-white/20 bg-black/60 p-2 text-stone-200 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        <X size={18} />
      </button>
    </div>,
    document.body,
  );
}
