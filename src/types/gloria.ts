// GLORIA_RPG types, mirroring the schema in supabase/migrations/20261114_gloria_rpg.sql.
// Character/zone/challenge content is placeholder seed data pending the real design sheet.

export type GloriaCharacterLevel = "negative" | "neutral" | "positive" | "legendary";
export type GloriaStatFocus = "precision" | "speed" | "defense" | "wisdom" | "recovery" | "intelligence" | "power";
export type GloriaZoneDifficulty = "easy" | "medium" | "hard" | "extreme";
export type GloriaChallengeCategory = "streak" | "target" | "discipline" | "stats" | "tools" | "special";
export type GloriaQuestStatus = "locked" | "active" | "completed" | "failed";
export type GloriaXpSourceType = "challenge" | "daily" | "boss" | "bonus";
export type GloriaRank = "beginner" | "intermediate" | "advanced" | "expert" | "master" | "legend";

/** total_xp thresholds for each GloriaRank; the first rank whose threshold the total meets or exceeds wins. */
export const GLORIA_RANK_THRESHOLDS: Record<GloriaRank, number> = {
  beginner: 0,
  intermediate: 500,
  advanced: 1500,
  expert: 4000,
  master: 10000,
  legend: 25000,
};

export interface GloriaRadarStats {
  precision: number;
  speed: number;
  defense: number;
  wisdom: number;
  recovery: number;
  intelligence: number;
  power: number;
}

export interface GloriaCharacter {
  id: string;
  name: string;
  nameAr: string;
  level: GloriaCharacterLevel;
  minWinRate: number;
  maxDrawdown: number;
  minRr: number;
  requiredBehavior: string;
  description: string;
  descriptionAr: string;
  icon: string;
  statFocus: GloriaStatFocus;
}

export interface GloriaCharacterAssignment {
  id: string;
  userId: string;
  characterId: string;
  month: string; // ISO date (first of month)
  isPrimary: boolean;
  assignedAt: string;
  statsSnapshot: Record<string, unknown>;
}

export interface GloriaZone {
  id: string;
  name: string;
  nameAr: string;
  difficulty: GloriaZoneDifficulty;
  orderIndex: number;
  bossName: string;
  bossNameAr: string;
  unlockCondition: string;
  reward: string;
}

export interface GloriaChallenge {
  id: string;
  zoneId: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  category: GloriaChallengeCategory;
  conditionType: string;
  conditionValue: Record<string, unknown>;
  xpReward: number;
  difficulty: GloriaZoneDifficulty;
  isBossChallenge: boolean;
}

export interface GloriaQuestProgress {
  id: string;
  userId: string;
  challengeId: string;
  status: GloriaQuestStatus;
  startedAt: string | null;
  completedAt: string | null;
  currentValue: number;
  targetValue: number;
  updatedAt: string;
}

export interface GloriaXpLogEntry {
  id: string;
  userId: string;
  xpAmount: number;
  sourceType: GloriaXpSourceType;
  sourceId: string | null;
  earnedAt: string;
}

export interface GloriaPlayerStats {
  id: string;
  userId: string;
  totalXp: number;
  currentRank: GloriaRank;
  currentZoneId: string | null;
  elfMeter: number;
  radarStats: Partial<GloriaRadarStats>;
  updatedAt: string;
}

// --- Raw Supabase row shapes (snake_case, as the DB returns them) ---------------------------------------------

export interface GloriaCharacterRow {
  id: string;
  name: string;
  name_ar: string;
  level: GloriaCharacterLevel;
  min_win_rate: number;
  max_drawdown: number;
  min_rr: number;
  required_behavior: string;
  description: string;
  description_ar: string;
  icon: string;
  stat_focus: GloriaStatFocus;
}

export interface GloriaCharacterAssignmentRow {
  id: string;
  user_id: string;
  character_id: string;
  month: string;
  is_primary: boolean;
  assigned_at: string;
  stats_snapshot: Record<string, unknown>;
}

export interface GloriaZoneRow {
  id: string;
  name: string;
  name_ar: string;
  difficulty: GloriaZoneDifficulty;
  order_index: number;
  boss_name: string;
  boss_name_ar: string;
  unlock_condition: string;
  reward: string;
}

export interface GloriaChallengeRow {
  id: string;
  zone_id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  category: GloriaChallengeCategory;
  condition_type: string;
  condition_value: Record<string, unknown>;
  xp_reward: number;
  difficulty: GloriaZoneDifficulty;
  is_boss_challenge: boolean;
}

export interface GloriaQuestProgressRow {
  id: string;
  user_id: string;
  challenge_id: string;
  status: GloriaQuestStatus;
  started_at: string | null;
  completed_at: string | null;
  current_value: number;
  target_value: number;
  updated_at: string;
}

export interface GloriaXpLogRow {
  id: string;
  user_id: string;
  xp_amount: number;
  source_type: GloriaXpSourceType;
  source_id: string | null;
  earned_at: string;
}

export interface GloriaPlayerStatsRow {
  id: string;
  user_id: string;
  total_xp: number;
  current_rank: GloriaRank;
  current_zone_id: string | null;
  elf_meter: number;
  radar_stats: Partial<GloriaRadarStats>;
  updated_at: string;
}
