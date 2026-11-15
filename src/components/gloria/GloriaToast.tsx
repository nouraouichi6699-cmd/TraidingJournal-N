// GLORIA_RPG: a short notice at the bottom-centre of the land view (e.g. "Defeat the boss first!" on the locked
// exit gate). It slides up and fades in, holds, then slides down and fades out over `duration`, after which it
// calls onDone. Dismissal runs on a timer, not on animationend, so it still goes away when reduced motion turns the
// animation off. Give it a fresh `key` to restart it when the same message is triggered again.
//
// On phones it sits above the circular mini-map (bottom-start), which would otherwise squeeze it; on wider
// screens it drops to the bottom edge, between the mini-map and the guide button. The HUD bar lives below the
// land view, so the bottom of the land is already above it.
import { useEffect, useRef, type CSSProperties } from "react";
import "./gloria.css";

interface Props {
  message: string;
  /** Total time on screen, in ms. */
  duration?: number;
  onDone?: () => void;
  dir?: "ltr" | "rtl";
}

export default function GloriaToast({ message, duration = 2000, onDone, dir }: Props) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current?.(), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[132px] z-[26] flex justify-center px-4 md:bottom-8">
      <div
        role="status"
        aria-live="polite"
        dir={dir}
        className="gz-toast rounded-full border border-white/10 bg-black/85 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-black/50 backdrop-blur-sm"
        style={{ "--gz-toast-ms": `${duration}ms` } as CSSProperties}
      >
        {message}
      </div>
    </div>
  );
}
