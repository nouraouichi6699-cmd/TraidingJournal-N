import type { Lang } from "../types";

export default function Brand({ lang }: { lang: Lang }) {
  const isAr = lang === "ar";
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo.png"
        alt=""
        height={40}
        style={{ height: 40, width: "auto", borderRadius: 8, background: "#fff", padding: 2 }}
      />
      <span
        className={isAr ? "font-wordmark-ar" : "font-wordmark"}
        style={{ color: "var(--accent)", fontSize: isAr ? 26 : 22, lineHeight: 1 }}
      >
        {isAr ? "ميزان" : "MIZAN"}
      </span>
    </div>
  );
}

/** Discreet signature, fixed to the bottom-left corner of the viewport. */
export function Watermark() {
  return (
    <div
      aria-hidden
      dir="ltr"
      className="font-wordmark pointer-events-none fixed bottom-3 left-4 z-10 select-none text-text/35"
      style={{ fontSize: 11, letterSpacing: "0.22em", fontWeight: 400 }}
    >
      BY NOUR AOUICHI
    </div>
  );
}
