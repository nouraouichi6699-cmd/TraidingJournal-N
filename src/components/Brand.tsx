import { MessageCircle } from "lucide-react";
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

/** Discreet signature + feedback icon, fixed to the bottom-left corner. */
export function Watermark({ feedback }: { feedback: string }) {
  return (
    <div className="pointer-events-none fixed bottom-3 left-4 z-10 flex select-none flex-col items-start gap-1" dir="ltr">
      <span
        aria-hidden
        className="font-wordmark text-text/35"
        style={{ fontSize: 11, letterSpacing: "0.22em", fontWeight: 400 }}
      >
        BY NOUR AOUICHI
      </span>
      <button
        type="button"
        aria-label={feedback}
        className="group pointer-events-auto flex items-center gap-2 rounded-lg py-1 text-icon/60 hover:text-icon focus-visible:text-icon"
      >
        <MessageCircle size={16} strokeWidth={1.9} />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold opacity-0 transition-all duration-300 group-hover:max-w-[180px] group-hover:opacity-100 group-focus-visible:max-w-[180px] group-focus-visible:opacity-100">
          {feedback}
        </span>
      </button>
    </div>
  );
}
