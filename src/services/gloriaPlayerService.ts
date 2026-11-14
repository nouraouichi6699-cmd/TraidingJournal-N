// GLORIA_RPG: the player's overall progress row (XP, rank, elf meter, radar) in gloria_player_stats.
import { supabase } from "../lib/supabase";
import type { Account, Trade } from "../types";
import type { GloriaPlayerStats, GloriaPlayerStatsRow, GloriaRank } from "../types/gloria";
import { GLORIA_RANK_THRESHOLDS } from "../types/gloria";
import { calculateElfMeter, calculateMonthlyStats, calculateRadarStats } from "./gloriaCharacterService";

const fromRow = (r: GloriaPlayerStatsRow): GloriaPlayerStats => ({
  id: r.id,
  userId: r.user_id,
  totalXp: r.total_xp,
  currentRank: r.current_rank,
  currentZoneId: r.current_zone_id,
  elfMeter: r.elf_meter,
  radarStats: r.radar_stats,
  updatedAt: r.updated_at,
});

/** The highest rank whose XP threshold the total meets or exceeds. */
export function getRank(totalXp: number): GloriaRank {
  const ranked = (Object.entries(GLORIA_RANK_THRESHOLDS) as [GloriaRank, number][]).sort((a, b) => b[1] - a[1]);
  return ranked.find(([, threshold]) => totalXp >= threshold)?.[0] ?? "beginner";
}

export async function getOrCreatePlayerStats(userId: string): Promise<GloriaPlayerStats> {
  const { data, error } = await supabase.from("gloria_player_stats").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) return fromRow(data as GloriaPlayerStatsRow);

  const { data: created, error: insErr } = await supabase
    .from("gloria_player_stats")
    .insert({ user_id: userId, total_xp: 0, current_rank: "beginner", elf_meter: 0, radar_stats: {} })
    .select()
    .single();
  if (insErr) throw insErr;
  return fromRow(created as GloriaPlayerStatsRow);
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

/** Recalculates total_xp, current_rank, elf_meter and radar_stats from the XP log and the given month's trades (defaults to this month), and persists the result. */
export async function updatePlayerStats(userId: string, allTrades: Trade[], accounts: Account[] = [], month: string = currentMonth()): Promise<GloriaPlayerStats> {
  const { data: xpRows, error: xpErr } = await supabase.from("gloria_xp_log").select("xp_amount").eq("user_id", userId);
  if (xpErr) throw xpErr;
  const totalXp = (xpRows ?? []).reduce((sum, r) => sum + (r.xp_amount as number), 0);

  const stats = calculateMonthlyStats(allTrades, month, accounts);
  const radarStats = calculateRadarStats(stats);
  const elfMeter = calculateElfMeter(radarStats);

  const { data: updated, error: upErr } = await supabase
    .from("gloria_player_stats")
    .upsert({ user_id: userId, total_xp: totalXp, current_rank: getRank(totalXp), elf_meter: elfMeter, radar_stats: radarStats }, { onConflict: "user_id" })
    .select()
    .single();
  if (upErr) throw upErr;
  return fromRow(updated as GloriaPlayerStatsRow);
}
