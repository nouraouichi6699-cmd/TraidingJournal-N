import { ShieldCheck, ShieldX, ShieldQuestion } from "lucide-react";
import { makeT } from "../i18n";
import type { Lang, TradeMode } from "../types";

// The account-type seal. It reflects what the MT5 sync stored (accounts.trade_mode), never a user setting:
//   real     → green  "Verified"   ShieldCheck  (confirmed by MT5)
//   demo     → blue   "Demo"       ShieldX      (reported as demo)
//   contest  → blue   "Contest"    ShieldX      (reported as contest)
//   unknown  → orange "Unverified" ShieldQuestion (MT5 hasn't reported yet, or non-MT5 account)
// The badge always shows; the orange "Unverified" state is what makes the green "Verified" meaningful.
// There is deliberately no way to set trade_mode from the app.

export default function TradeModeBadge({ mode, lang, className = "" }: { mode?: TradeMode | null; lang: Lang; className?: string }) {
  const t = makeT(lang);
  const real = mode === "real";
  const known = mode === "demo" || mode === "contest";
  const label = t(real ? "badgeVerified" : mode === "demo" ? "badgeDemo" : mode === "contest" ? "badgeContest" : "badgeUnverified");
  const colorCls = real
    ? "bg-green-500/15 text-green-500 border-green-500/30"
    : known
    ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
    : "bg-orange-500/15 text-orange-500 border-orange-500/30";
  const Icon = real ? ShieldCheck : known ? ShieldX : ShieldQuestion;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-trade-mode={mode ?? "unknown"}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[11px] font-semibold leading-4 ${colorCls} ${className}`}
    >
      <Icon size={12} strokeWidth={2.2} aria-hidden />
      {label}
    </span>
  );
}
