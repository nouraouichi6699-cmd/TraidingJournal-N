import { BadgeCheck } from "lucide-react";
import { makeT } from "../i18n";
import type { Lang, TradeMode } from "../types";

// The account-type seal. It only ever shows what the MT5 sync stored (accounts.trade_mode): a real account gets the green
// "Verified" check, a demo or contest account a red label, and an account MT5 never described gets nothing at all.
// There is deliberately no way to set it from the app; that is what makes "Verified" worth something.
const GREEN = "#22c55e", RED = "#ef4444";

export default function TradeModeBadge({ mode, lang, className = "" }: { mode?: TradeMode | null; lang: Lang; className?: string }) {
  if (!mode) return null;
  const t = makeT(lang);
  const real = mode === "real";
  const label = t(real ? "badgeVerified" : mode === "demo" ? "badgeDemo" : "badgeContest");
  const tone = real ? GREEN : RED;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-trade-mode={mode}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[11px] font-semibold leading-4 ${className}`}
      style={{ color: tone, background: `${tone}22`, borderColor: `${tone}66` }}
    >
      {real && <BadgeCheck size={12} strokeWidth={2.2} aria-hidden />}
      {label}
    </span>
  );
}
