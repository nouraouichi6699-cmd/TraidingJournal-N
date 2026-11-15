// GLORIA_RPG: challenge display pieces shared by the zone side panel (GloriaZonePanel) and the full land view
// (GloriaLandView) -- the progress bar, the XP chip, status icons, and the per-zone challenge split.
import { Check, Lock, Swords, X } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaQuestStatus } from "../../types/gloria";
import { challengeText, type MapZone } from "./gloriaZones";

export const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const STATUS_ICON: Record<GloriaQuestStatus, typeof Lock> = { locked: Lock, active: Swords, completed: Check, failed: X };

export function Bar({ value, target, color }: { value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/25 ring-1 ring-inset ring-white/5">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      {target > 0 && (
        <span dir="ltr" className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
          {num(Math.min(value, target))}/{num(target)}
        </span>
      )}
    </div>
  );
}

export function XpChip({ xp, big }: { xp: number; big?: boolean }) {
  return (
    <span dir="ltr" className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 font-bold text-amber-400 ring-1 ring-amber-400/30 ${big ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]"}`}>
      +{xp} XP
    </span>
  );
}

/** Splits a zone's challenges into regular + boss and resolves its localized copy. */
export function zoneDetail(mz: MapZone, lang: Lang) {
  const { visual, zone } = mz;
  const ar = lang === "ar";
  return {
    regular: mz.challenges.filter((c) => !c.challenge.isBossChallenge),
    boss: mz.challenges.find((c) => c.challenge.isBossChallenge) ?? null,
    bossName: zone ? (ar ? zone.bossNameAr || zone.bossName : zone.bossName) : null,
    text: (en: string, arText: string) => challengeText(ar ? arText || en : en, zone, visual, lang),
    zoneFill: `linear-gradient(90deg, ${visual.color}, ${visual.accent})`,
  };
}
