// GLORIA_RPG: the reveal shown the next time the player opens Gloria after a scheduled update changed their hero
// (including the very first Savage -> real hero). A dark vignette, slow golden rays, a ring burst and rising pixel
// sparks around the new hero's portrait, then the name, tier and a Continue button.
//
// It floats over the whole game screen (absolute, inside GloriaPage's full-screen container) and is never trapped:
// Continue, Skip, a click on the backdrop and Escape all dismiss it. Escape is caught in the capture phase and
// stopped there, like GloriaWelcomeModal, so GloriaPage's own Escape handler (exit game) does not also fire.
// Every animation is CSS in gloria.css (.gz-reveal-*); with reduced motion everything simply appears.
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";
import { CHARACTER_DESC, GloriaPortrait, TIER_STYLE } from "./gloriaCharacterUi";
import { heroT } from "./gloriaHeroText";
import { CHARACTER_INFO, LEVEL_TEXT } from "./gloriaText";
import "./gloria.css";

export type RevealKind = "change" | "starter" | "first";

interface Props {
  character: GloriaCharacterId;
  previous: GloriaCharacterId | null;
  kind: RevealKind;
  lang: Lang;
  onDismiss: () => void;
}

// Pixel sparks: fixed positions (percent of the card box) so the scene is the same every time. [x, y, size, delay ms]
const SPARKS: [number, number, number, number][] = [
  [8, 62, 5, 1000], [18, 30, 4, 1250], [28, 78, 6, 1100], [40, 12, 4, 1400], [60, 8, 5, 1150], [72, 26, 4, 1350],
  [84, 66, 6, 1050], [92, 40, 4, 1300], [14, 48, 4, 1500], [50, 86, 5, 1200], [78, 82, 4, 1450], [34, 44, 3, 1600],
];

export default function GloriaHeroReveal({ character, previous, kind, lang, onDismiss }: Props) {
  const t = heroT(lang);
  const titleId = useId();
  const descId = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const info = CHARACTER_INFO[character];
  const tier = TIER_STYLE[info.level];
  const kicker = kind === "starter" ? t("revealStarter") : kind === "first" ? t("revealFirst") : t("revealChange");

  // Focus Continue on open; hand focus back on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | SVGElement | null;
    continueRef.current?.focus({ preventScroll: true });
    return () => {
      if (prev?.isConnected) prev.focus?.({ preventScroll: true });
    };
  }, []);

  // Escape dismisses (and nothing else); Tab cycles Skip <-> Continue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onDismissRef.current();
      } else if (e.key === "Tab") {
        e.preventDefault();
        (document.activeElement === continueRef.current ? skipRef : continueRef).current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="gz-reveal-backdrop absolute inset-0 z-[60] flex items-center justify-center overflow-hidden p-4 text-stone-100"
      style={{ background: `radial-gradient(ellipse at 50% 45%, ${tier.ring}33 0%, rgba(8,6,4,0.93) 58%, rgba(0,0,0,0.97) 100%)` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      {/* slow golden rays behind the hero */}
      <div
        className="gz-reveal-rays pointer-events-none absolute left-1/2 top-[44%] h-[150vmax] w-[150vmax] rounded-full opacity-30"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${tier.ring}00 0deg 10deg, ${tier.ring}55 10deg 14deg)`,
          WebkitMaskImage: "radial-gradient(circle, #000 0%, transparent 42%)",
          maskImage: "radial-gradient(circle, #000 0%, transparent 42%)",
        }}
        aria-hidden
      />

      <button
        ref={skipRef}
        type="button"
        onClick={onDismiss}
        className="absolute end-3 top-3 z-10 flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-xs font-bold text-stone-300 backdrop-blur-sm transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        {t("revealSkip")} <X size={14} aria-hidden />
      </button>

      <div className="relative flex max-w-md flex-col items-center text-center">
        <p
          className="gz-reveal-kicker mb-6 text-[11px] uppercase leading-relaxed sm:text-xs"
          style={{
            background: "linear-gradient(135deg, #facc15, #f59e0b)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontFamily: lang === "ar" ? undefined : "'Press Start 2P', 'Courier New', monospace",
            letterSpacing: lang === "ar" ? "0.05em" : "0.14em",
            fontWeight: lang === "ar" ? 800 : undefined,
          }}
        >
          {kicker}
        </p>

        {/* portrait + burst + sparks */}
        <div className="relative flex h-[220px] w-[220px] items-center justify-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="gz-reveal-ring pointer-events-none absolute inset-6 rounded-full border-2"
              style={{ borderColor: tier.ring, ["--d" as string]: `${900 + i * 220}ms` }}
              aria-hidden
            />
          ))}
          <span className="gz-reveal-flash pointer-events-none absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, #fff7d6, ${tier.ring}00 65%)` }} aria-hidden />
          {SPARKS.map(([x, y, s, d], i) => (
            <span
              key={i}
              className="gz-reveal-spark pointer-events-none absolute"
              style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, background: i % 3 === 0 ? "#fef3c7" : tier.ring, ["--d" as string]: `${d}ms`, imageRendering: "pixelated" }}
              aria-hidden
            />
          ))}
          <div className="gz-reveal-hero">
            <GloriaPortrait id={character} level={info.level} size={168} glow />
          </div>
        </div>

        <h2 id={titleId} className="gz-reveal-name mt-5 font-heading text-3xl font-bold leading-tight text-stone-50 sm:text-4xl" style={{ textShadow: `0 0 24px ${tier.ring}99` }}>
          {info.name[lang]}
        </h2>

        <div className="gz-reveal-meta mt-2 flex flex-col items-center gap-2">
          <span className={`rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1 ${tier.badge}`}>{LEVEL_TEXT[info.level][lang]}</span>
          <p id={descId} className="max-w-xs text-sm leading-relaxed text-stone-300">
            {CHARACTER_DESC[character][lang]}
          </p>
          {kind === "change" && previous && (
            <p className="text-xs text-stone-500">
              {lang === "ar" ? "كان سابقاً" : lang === "fr" ? "Auparavant" : "Previously"}{" "}
              <span className="font-semibold text-stone-400">{CHARACTER_INFO[previous].name[lang]}</span>
            </p>
          )}
        </div>

        <button
          ref={continueRef}
          type="button"
          onClick={onDismiss}
          className="gz-reveal-cta mt-7 rounded-full border border-amber-400/50 bg-amber-500/15 px-8 py-2.5 text-sm font-bold text-amber-200 transition hover:bg-amber-500/30 hover:text-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          {t("revealContinue")}
        </button>
      </div>
    </div>
  );
}
