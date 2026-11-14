import { makeT } from "../i18n";
import { tradeModeTooltip } from "../lib/tradeMode";
import type { Lang, TradeMode } from "../types";

// The account-type seal. It reflects what the MT5 sync stored (accounts.trade_mode), never a user setting:
//   real     → green  "Verified"   shield+check  (confirmed by MT5)
//   demo     → blue   "Demo"       play circle   (reported as demo)
//   contest  → blue   "Contest"    trophy        (reported as contest)
//   unknown  → orange "Unverified" shield+X      (MT5 hasn't reported yet, or non-MT5 account)
// The badge always shows; the orange "Unverified" state is what makes the green "Verified" meaningful.
// There is deliberately no way to set trade_mode from the app.

const SV = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };

const IconVerified = () => (
  <svg {...SV}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const IconContest = () => (
  <svg {...SV}>
    <line x1="8" x2="16" y1="21" y2="21" />
    <line x1="12" x2="12" y1="17" y2="21" />
    <path d="M7 4h10v7a5 5 0 0 1-10 0V4z" />
    <path d="M5 9H2.5a2.5 2.5 0 0 1 0-5H7" />
    <path d="M19 9h2.5a2.5 2.5 0 0 0 0-5H17" />
  </svg>
);

const IconDemo = () => (
  <svg {...SV}>
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" />
  </svg>
);

const IconUnverified = () => (
  <svg {...SV}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="9.5" y1="9.5" x2="14.5" y2="14.5" />
    <line x1="14.5" y1="9.5" x2="9.5" y2="14.5" />
  </svg>
);

export default function TradeModeBadge({ mode, lang, showMessage = false, className = "" }: { mode?: TradeMode | null; lang: Lang; showMessage?: boolean; className?: string }) {
  const t = makeT(lang);
  const real = mode === "real";
  const known = mode === "demo" || mode === "contest";
  const unverified = !mode;
  const label = t(real ? "badgeVerified" : mode === "demo" ? "badgeDemo" : mode === "contest" ? "badgeContest" : "badgeUnverified");
  const message = tradeModeTooltip(mode);
  const colorCls = real
    ? "bg-green-500/15 text-green-500 border-green-500/30"
    : known
    ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
    : "bg-orange-500/15 text-orange-500 border-orange-500/30";
  const Icon = real ? IconVerified : mode === "contest" ? IconContest : mode === "demo" ? IconDemo : IconUnverified;

  // showMessage=false (dropdown): badge only, no extras.
  // showMessage=true + verified/demo/contest: badge with hover tooltip.
  // showMessage=true + null (Unverified): badge + always-visible inline alert text.
  const badge = (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-trade-mode={mode ?? "unknown"}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[11px] font-semibold leading-4 ${colorCls} ${className}`}
    >
      <Icon />
      {label}
    </span>
  );

  if (!showMessage) return badge;

  if (unverified) {
    return (
      <>
        {badge}
        <span className="ms-2 text-xs text-zinc-400 dark:text-zinc-500">{message}</span>
      </>
    );
  }

  // Verified / Demo / Contest: hover tooltip only.
  return (
    <span className="group relative inline-flex items-center">
      {badge}
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ms-2 hidden max-w-[280px] w-max -translate-y-1/2 whitespace-normal rounded-lg bg-zinc-900 px-3 py-2 text-xs font-normal leading-normal text-white shadow-lg group-hover:block">
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-e-zinc-900" />
        {message}
      </span>
    </span>
  );
}
