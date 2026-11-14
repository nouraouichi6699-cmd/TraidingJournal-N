// GLORIA_RPG main screen: player HUD on top, the adventure map below, and the zone panel sliding in over it.
// Trades/accounts come from the app's single journal (passed in), never from a separate query.
//
// TODO(gloria-demo-testing): `trades`/`accounts` below are whatever App.tsx passes in -- today that is
// `journal.trades`/the full `accounts` list, with NO filtering by Account.tradeMode ("demo" | "contest" | "real").
// That is deliberate: this feature is meant to come alive on a demo account while testing, exactly like it would
// for a real one, so do not add a tradeMode/trade_mode filter here, in useGloriaQuests, or in the gloria
// services -- that would be the one change that silently breaks demo-account testing again. The evaluators
// already cope with a small trade count (partial progress, not a hard "all or nothing"), and the hero/radar/Elf
// Meter snapshot now resolves to the most recent month that actually has a closed trade (mostRecentTradingMonth
// in gloriaCharacterService.ts) rather than the literal calendar month, so a handful of demo trades dated last
// week still light up the HUD instead of showing "Unawakened" until the month turns over.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import type { Account, Lang, Trade } from "../types";
import type { GloriaRadarStats } from "../types/gloria";
import { useGloriaQuests } from "../hooks/useGloriaQuests";
import { calculateElfMeter, calculateMonthlyStats, calculateRadarStats, determineCharacters, mostRecentTradingMonth } from "../services/gloriaCharacterService";
import { getRank } from "../services/gloriaPlayerService";
import GloriaPlayerHUD from "../components/gloria/GloriaPlayerHUD";
import GloriaMapView from "../components/gloria/GloriaMapView";
import GloriaZonePanel from "../components/gloria/GloriaZonePanel";
import { buildMapZones, type MapZone, type ZoneMapState } from "../components/gloria/gloriaZones";
import { gt } from "../components/gloria/gloriaText";

const EMPTY_RADAR: GloriaRadarStats = { precision: 0, speed: 0, defense: 0, wisdom: 0, recovery: 0, intelligence: 0, power: 0 };
const CELEBRATE_MS = 6000;

// Which state each zone was in the last time this player saw the map, so a conquest (or a land coming out of the
// fog) is celebrated exactly once. Per-device convenience only; losing it just replays a celebration.
const seenKey = (userId: string) => `mizan-gloria-seen-${userId}`;
function readSeen(userId: string): Record<number, ZoneMapState> | null {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return raw ? (JSON.parse(raw) as Record<number, ZoneMapState>) : {};
  } catch {
    return null;
  }
}
function writeSeen(userId: string, seen: Record<number, ZoneMapState>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    /* storage unavailable: celebrations simply replay */
  }
}

interface Props {
  userId: string;
  lang: Lang;
  trades: Trade[];
  accounts: Account[];
}

export default function GloriaPage({ userId, lang, trades, accounts }: Props) {
  const t = gt(lang);
  const quests = useGloriaQuests(userId, trades, accounts);
  const { zones, challenges, progress, playerStats, loading, evaluating, error, refresh } = quests;

  const mapZones = useMemo(() => buildMapZones(zones, challenges, progress), [zones, challenges, progress]);

  // This month's hero, radar and Elf Meter, computed live from the same pure functions -- and the same month
  // resolution -- that gloriaPlayerService persists with, so this preview and the persisted snapshot agree.
  const hero = useMemo(() => {
    const month = mostRecentTradingMonth(trades);
    const stats = calculateMonthlyStats(trades, month, accounts);
    if (!stats.totalTrades) return { character: null, radar: EMPTY_RADAR, elfMeter: 0 };
    const radar = calculateRadarStats(stats);
    const elfMeter = calculateElfMeter(radar);
    return { character: determineCharacters(stats, radar, elfMeter)?.primary ?? null, radar, elfMeter };
  }, [trades, accounts]);

  const totalXp = playerStats?.totalXp ?? 0;
  const rank = playerStats?.currentRank ?? getRank(totalXp);

  const [openOrder, setOpenOrder] = useState<number | null>(null);
  const open = openOrder != null ? mapZones.find((z) => z.visual.order === openOrder) ?? null : null;
  const prev = openOrder != null ? mapZones.find((z) => z.visual.order === openOrder - 1) ?? null : null;
  const onOpenZone = useCallback((mz: MapZone) => setOpenOrder(mz.visual.order), []);
  const onClose = useCallback(() => setOpenOrder(null), []);

  const [celebrate, setCelebrate] = useState<ReadonlySet<number>>(new Set());
  const [reveal, setReveal] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    // Only trust a real, error-free load that has quest rows; a failed load would otherwise record every zone as
    // locked and replay every conquest next time.
    if (loading || error || !progress.length) return;
    const seen = readSeen(userId);
    if (!seen) return;
    const conquered = new Set<number>(), revealed = new Set<number>();
    for (const z of mapZones) {
      const before = seen[z.visual.order];
      if (z.state === "completed" && before !== "completed") conquered.add(z.visual.order);
      else if (z.state === "active" && before === "locked") revealed.add(z.visual.order);
    }
    writeSeen(userId, Object.fromEntries(mapZones.map((z) => [z.visual.order, z.state])));
    if (conquered.size) setCelebrate(conquered);
    if (revealed.size) setReveal(revealed);
  }, [mapZones, loading, error, progress.length, userId]);

  // Its own effect, so a later re-evaluation re-running the one above can't cancel the reset.
  useEffect(() => {
    if (!celebrate.size && !reveal.size) return;
    const timer = window.setTimeout(() => {
      setCelebrate(new Set());
      setReveal(new Set());
    }, CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [celebrate, reveal]);

  return (
    <div className="flex flex-col gap-3">
      <GloriaPlayerHUD
        lang={lang}
        character={hero.character}
        totalXp={totalXp}
        rank={rank}
        elfMeter={hero.elfMeter}
        radar={hero.radar}
        evaluating={evaluating}
        onRefresh={refresh}
      />

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-loss">
          <TriangleAlert size={16} className="shrink-0" />
          <span className="font-semibold">{t("error")}</span>
          <span className="truncate text-xs opacity-80">{error}</span>
        </div>
      )}

      <GloriaMapView
        zones={mapZones}
        lang={lang}
        onOpenZone={onOpenZone}
        celebrate={celebrate}
        reveal={reveal}
        overlay={
          loading ? (
            <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-amber-100">
              <Loader2 size={16} className="animate-spin" /> {t("loading")}
            </div>
          ) : null
        }
      />

      <GloriaZonePanel mz={open} prev={prev} lang={lang} onClose={onClose} />
    </div>
  );
}
