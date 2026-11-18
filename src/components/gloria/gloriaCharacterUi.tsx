// GLORIA_RPG: the character visuals shared by the HUD, the guide's roster / detail / hero cards and the reveal:
// per-character icon, tier colours, descriptions, focus stat, and the portrait (sprite when the class has one,
// otherwise the tier medallion with its lucide icon). Before this file the HUD and the guide each carried their own
// copy of the icon and tier tables.
import { Crosshair, HeartPulse, Lock, Shield, Shuffle, Skull, Sparkles, Sword, WandSparkles, Zap } from "lucide-react";
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

/**
 * Characters that have art. This mirrors HERO_SHEETS in GloriaHeroSprite (the walking sprite on the land): a class
 * that gets a sheet there should get its idle-south frame listed here so its portrait becomes art too. Anyone else
 * (not drawn yet) renders as the tier medallion with its icon.
 */
const SPRITE_PORTRAITS: Partial<Record<GloriaCharacterId, string>> = {
  warrior: "/sprites/warrior/idle-south.png",
  savage: "/sprites/savage/idle-south.png",
  rogue: "/sprites/rogue/idle-south.png",
};

export const hasPortraitArt = (id: GloriaCharacterId) => !!SPRITE_PORTRAITS[id];

interface PortraitProps {
  id: GloriaCharacterId | null;
  level: GloriaCharacterLevel | null;
  /** Outer diameter in px. */
  size: number;
  /** Greyed silhouette with a lock badge. */
  locked?: boolean;
  /** Soft pulsing halo behind the portrait (the reveal, a legendary hero). */
  glow?: boolean;
  className?: string;
}

/** A round portrait: the character's sprite (crisp, pixelated) or tier medallion + icon, with a tier-coloured ring. */
export function GloriaPortrait({ id, level, size, locked, glow, className = "" }: PortraitProps) {
  const tier = locked ? { ...TIER_STYLE.none, ...LOCKED_STYLE } : TIER_STYLE[level ?? "none"];
  const Icon = id ? CHARACTER_ICON[id] : Sparkles;
  const art = id ? SPRITE_PORTRAITS[id] : undefined;
  const ring = Math.max(2, Math.round(size / 28));
  return (
    // The wrapper only sizes the portrait and carries the halo, so the halo can sit behind the medallion.
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden>
      {glow && !locked && <span className="gz-portrait-halo pointer-events-none absolute -inset-2 rounded-full" style={{ background: `radial-gradient(circle, ${tier.ring}66 40%, ${tier.ring}00 72%)` }} />}
      <span
        className="relative flex h-full w-full items-center justify-center rounded-full"
        style={{ background: tier.bg, boxShadow: `0 0 0 ${ring}px ${tier.ring}${locked ? "" : `, 0 0 ${Math.round(size / 3.5)}px ${tier.ring}55`}` }}
      >
      {art ? (
        <img
          src={art}
          alt=""
          draggable={false}
          // Native art is 48px; an integer-ish scale keeps the pixels square. The silhouette is the same sprite with
          // every colour crushed to black (brightness 0) and dimmed, so a locked class still has its outline.
          style={{
            width: size * 0.86,
            height: size * 0.86,
            imageRendering: "pixelated",
            objectFit: "contain",
            filter: locked ? "brightness(0) opacity(0.55)" : "drop-shadow(0 2px 2px rgba(0,0,0,0.5))",
          }}
        />
      ) : (
        <Icon size={Math.round(size * 0.5)} color={tier.fg} strokeWidth={1.8} />
      )}
      {locked && (
        <span
          className="absolute -bottom-0.5 -end-0.5 flex items-center justify-center rounded-full border border-stone-600 bg-stone-900 text-stone-300"
          style={{ width: Math.max(14, size * 0.36), height: Math.max(14, size * 0.36) }}
        >
          <Lock size={Math.max(8, Math.round(size * 0.2))} />
        </span>
      )}
      </span>
    </span>
  );
}
