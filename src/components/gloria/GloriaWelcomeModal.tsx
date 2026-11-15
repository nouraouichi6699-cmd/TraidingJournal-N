// GLORIA_RPG: the welcome card shown when the player clicks a land's entry gate -- the zone's icon and name, a few
// lines of flavour text (gloriaZones' flavorText, or the map blurb) and a "Begin exploring" button.
//
// It floats over the land (absolute, inside GloriaLandView's section) under the cloud curtain (.gz-tc is z-30).
// Closes on the button, the backdrop or Escape. Escape is caught in the capture phase and stopped there, so
// GloriaPage's own Escape handler (land → world map) doesn't also fire. Focus moves to the button on open, stays
// in the card while it is open, and goes back to whatever had it (the entry gate) on close.
import { useEffect, useId, useRef } from "react";
import type { Lang } from "../../types";
import { ZONE_ICON, zoneFlavorText, type ZoneVisual } from "./gloriaZones";
import "./gloria.css";

const BEGIN_TEXT: Record<Lang, string> = { en: "Begin exploring", ar: "ابدأ الاستكشاف", fr: "Commencer l'exploration" };

interface Props {
  zone: ZoneVisual;
  lang: Lang;
  onClose: () => void;
}

export default function GloriaWelcomeModal({ zone, lang, onClose }: Props) {
  const titleId = useId();
  const textId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus the button on open; hand focus back on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | SVGElement | null;
    buttonRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, []);

  // Escape closes the card (and nothing else); Tab can't leave it -- the button is its only control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        e.preventDefault();
        buttonRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      className="gz-welcome-backdrop absolute inset-0 z-[28] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="gz-welcome w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-gray-900/95 text-center text-stone-100 shadow-2xl shadow-black/70"
      >
        {/* the zone's colour as a band across the top */}
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${zone.accent}, ${zone.color}, ${zone.accent})` }} />
        <div className="px-6 pb-6 pt-5">
          <div
            className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full text-4xl"
            style={{ background: `radial-gradient(circle, ${zone.color}55, ${zone.color}11)`, boxShadow: `0 0 0 2px ${zone.color}88` }}
            aria-hidden
          >
            {ZONE_ICON[zone.theme]}
          </div>
          <h2 id={titleId} className="mb-2 text-xl font-bold text-amber-100">
            {zone.name[lang]}
          </h2>
          <p id={textId} className="mb-5 text-sm leading-relaxed text-stone-300">
            {zoneFlavorText(zone, lang)}
          </p>
          <button
            ref={buttonRef}
            type="button"
            onClick={onClose}
            className="gz-welcome-btn w-full rounded-full px-5 py-2.5 text-sm font-bold text-white transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            style={{ background: zone.color }}
          >
            {BEGIN_TEXT[lang]}
          </button>
        </div>
      </div>
    </div>
  );
}
