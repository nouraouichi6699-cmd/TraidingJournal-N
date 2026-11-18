// GLORIA_RPG: the player's hero, assigned on a schedule and persisted.
//
// What changed from the old behaviour: the hero used to be derived fresh from the current month's trades on every
// render. Now it is READ from gloria_player_stats (active_character + snapshot) and only RECOMPUTED when a
// scheduled update is due -- >= 7 days since the last one, or a new calendar month (see gloriaHeroSchedule.ts for
// the due-check and why it runs on open rather than in a background job). Every scheduled update is appended to
// gloria_character_history (the trophy case).
//
// A player with no closed trades gets the free starter, Savage. The first scheduled update that finds trade history
// replaces it with whatever pickCharacter() says, and flags a reveal (character_reveal_pending) for the next time
// Gloria is open, which the UI clears through acknowledgeReveal().
//
// Like the other Gloria services, trades/accounts come in as arguments (the journal already holds them); nothing
// here queries the trades table.
import { supabase } from "../lib/supabase";
import type { Account, Trade } from "../types";
import type { GloriaHeroUpdateKind, GloriaCharacterHistoryRow, GloriaPlayerHeroColumns, GloriaRadarStats } from "../types/gloria";
import { analyzeMonth, mostRecentTradingMonth, saveMonthAssignment, type GloriaCharacterId, type GloriaMonthlyStats, type HeroReason } from "./gloriaCharacterService";
import { CHARACTER_PATHS, STARTER_CHARACTER } from "./gloriaCharacterRules";
import { dueUpdate } from "./gloriaHeroSchedule";

/** The numbers (and verdict) that justified a pick; stored next to it so the explanation never depends on re-deriving it. */
export interface GloriaHeroSnapshot {
  month: string;
  stats: GloriaMonthlyStats;
  radar: GloriaRadarStats;
  elfMeter: number;
  secondary: GloriaCharacterId | null;
  reason: HeroReason;
}

export interface GloriaHeroState {
  character: GloriaCharacterId | null;
  isStarter: boolean;
  /** When the last scheduled update ran (null: none yet). */
  checkedAt: string | null;
  /** null for the starter (nothing was analysed) and before the first sync. */
  snapshot: GloriaHeroSnapshot | null;
  revealPending: boolean;
  previousCharacter: GloriaCharacterId | null;
}

export interface GloriaHeroHistoryEntry {
  id: string;
  character: GloriaCharacterId;
  secondary: GloriaCharacterId | null;
  previous: GloriaCharacterId | null;
  kind: GloriaHeroUpdateKind;
  changed: boolean;
  assignedAt: string;
  snapshot: GloriaHeroSnapshot | null;
}

export interface GloriaHeroData {
  state: GloriaHeroState;
  history: GloriaHeroHistoryEntry[];
  /** Set when this call ran a scheduled update. */
  updated: GloriaHeroUpdateKind | null;
}

const COLUMNS = "user_id, active_character, active_character_snapshot, character_checked_at, is_starter_character, character_reveal_pending, previous_character";
const HISTORY_LIMIT = 400;

const asCharacter = (v: unknown): GloriaCharacterId | null => (typeof v === "string" && v in CHARACTER_PATHS ? (v as GloriaCharacterId) : null);
const asSnapshot = (v: unknown): GloriaHeroSnapshot | null => {
  const o = v as Partial<GloriaHeroSnapshot> | null;
  return o && typeof o === "object" && o.stats && o.radar && o.reason ? (o as GloriaHeroSnapshot) : null;
};

const stateFromRow = (r: Partial<GloriaPlayerHeroColumns> | null): GloriaHeroState => ({
  character: asCharacter(r?.active_character),
  isStarter: !!r?.is_starter_character,
  checkedAt: r?.character_checked_at ?? null,
  snapshot: asSnapshot(r?.active_character_snapshot),
  revealPending: !!r?.character_reveal_pending,
  previousCharacter: asCharacter(r?.previous_character),
});

const historyFromRow = (r: GloriaCharacterHistoryRow): GloriaHeroHistoryEntry | null => {
  const character = asCharacter(r.character_id);
  if (!character) return null;
  return {
    id: r.id,
    character,
    secondary: asCharacter(r.secondary_id),
    previous: asCharacter(r.previous_id),
    kind: r.kind,
    changed: r.changed,
    assignedAt: r.assigned_at,
    snapshot: asSnapshot(r.stats_snapshot),
  };
};

async function readState(userId: string): Promise<GloriaHeroState> {
  const { data, error } = await supabase.from("gloria_player_stats").select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return stateFromRow(data as Partial<GloriaPlayerHeroColumns> | null);
}

export async function getHeroHistory(userId: string): Promise<GloriaHeroHistoryEntry[]> {
  const { data, error } = await supabase
    .from("gloria_character_history")
    .select("*")
    .eq("user_id", userId)
    .order("assigned_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;
  return ((data ?? []) as GloriaCharacterHistoryRow[]).map(historyFromRow).filter((e): e is GloriaHeroHistoryEntry => !!e);
}

/** Creates the player's stats row if it does not exist yet. ignoreDuplicates, so racing the quests hook's own
 *  getOrCreatePlayerStats never raises a unique_violation for either side. */
async function ensureRow(userId: string): Promise<void> {
  const { error } = await supabase.from("gloria_player_stats").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw error;
}

/** Reads the stored hero and history without running any update. */
export async function loadHero(userId: string): Promise<GloriaHeroData> {
  const [state, history] = await Promise.all([readState(userId), getHeroHistory(userId)]);
  return { state, history, updated: null };
}

/**
 * The scheduled update: if one is due, recompute, persist and log it; otherwise return the stored hero untouched.
 * Safe to call on every open (and twice at once): the write is conditional on character_checked_at still holding
 * the value this call read, so when two callers race exactly one wins and logs history; the other just reloads.
 */
export async function syncHero(userId: string, trades: Trade[], accounts: Account[] = [], now: Date = new Date()): Promise<GloriaHeroData> {
  await ensureRow(userId);
  const before = await readState(userId);

  // A row with a timestamp but no character is inconsistent (partial write); treat it as never assigned.
  const due = before.character ? dueUpdate(before.checkedAt, now) : "initial";
  if (!due) return loadHero(userId);

  const month = mostRecentTradingMonth(trades);
  const analysis = analyzeMonth(trades, month, accounts);

  let character: GloriaCharacterId, secondary: GloriaCharacterId | null = null, isStarter: boolean, snapshot: GloriaHeroSnapshot | null;
  if (analysis) {
    character = analysis.primary;
    secondary = analysis.secondary;
    isStarter = false;
    snapshot = { month, stats: analysis.stats, radar: analysis.radar, elfMeter: analysis.elfMeter, secondary, reason: analysis.reason };
  } else if (before.character && !before.isStarter) {
    // The history that earned this hero has gone (trades deleted): keep the hero, never demote to the starter.
    character = before.character;
    secondary = before.snapshot?.secondary ?? null;
    isStarter = false;
    snapshot = before.snapshot;
  } else {
    character = STARTER_CHARACTER;
    isStarter = true;
    snapshot = null;
  }

  const changed = character !== before.character;
  // "initial" only ever describes the very first assignment; a later update is weekly or monthly.
  const kind: GloriaHeroUpdateKind = !before.character ? (isStarter ? "starter" : "initial") : due === "monthly" ? "monthly" : "weekly";

  const patch = {
    active_character: character,
    active_character_snapshot: snapshot,
    character_checked_at: now.toISOString(),
    is_starter_character: isStarter,
    character_reveal_pending: changed ? true : before.revealPending,
    previous_character: changed ? before.character : before.previousCharacter,
  };
  let q = supabase.from("gloria_player_stats").update(patch).eq("user_id", userId);
  q = before.checkedAt ? q.eq("character_checked_at", before.checkedAt) : q.is("character_checked_at", null);
  const { data: won, error } = await q.select("user_id");
  if (error) throw error;
  if (!won?.length) return loadHero(userId); // another tab/device ran this update first

  // From here the hero is durably stored; the log and the per-month record are best-effort extras.
  const { error: logErr } = await supabase.from("gloria_character_history").insert({
    user_id: userId,
    character_id: character,
    secondary_id: secondary,
    previous_id: before.character,
    kind,
    changed,
    assigned_at: patch.character_checked_at,
    stats_snapshot: snapshot ?? {},
  });
  if (logErr) console.error("[gloria] could not log the hero update", logErr);
  if (analysis) {
    try {
      await saveMonthAssignment(userId, month, analysis);
    } catch (e) {
      console.error("[gloria] could not save the month's assignment", e);
    }
  }

  const data = await loadHero(userId);
  return { ...data, updated: kind };
}

/** The player has seen the reveal (or skipped it): stop showing it. */
export async function acknowledgeReveal(userId: string): Promise<void> {
  const { error } = await supabase.from("gloria_player_stats").update({ character_reveal_pending: false }).eq("user_id", userId);
  if (error) throw error;
}

/**
 * Which characters the player owns: the free starter, the current hero, and every hero they have ever been assigned.
 * Everyone else is shown locked in the roster.
 */
export function unlockedCharacters(state: GloriaHeroState, history: GloriaHeroHistoryEntry[]): Set<GloriaCharacterId> {
  const set = new Set<GloriaCharacterId>([STARTER_CHARACTER]);
  if (state.character) set.add(state.character);
  for (const h of history) set.add(h.character);
  return set;
}
