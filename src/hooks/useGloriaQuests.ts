// GLORIA_RPG: wires the challenge engine into whatever trades/accounts the rest of the app is already using.
// Pass it useJournal().trades and useAccounts().accounts directly -- it does not read its own copy of either,
// so there is exactly one source of truth for trade data.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Account, Trade } from "../types";
import type { GloriaChallenge, GloriaPlayerStats, GloriaQuestProgress, GloriaZone } from "../types/gloria";
import { evaluateAllChallenges, getChallenges, getQuestProgress, getZones } from "../services/gloriaChallengeService";
import { getOrCreatePlayerStats } from "../services/gloriaPlayerService";

// Trades change on every import/edit; waiting this long before re-checking challenges keeps a burst of edits
// (an import of hundreds of rows) from re-running the full engine after each one.
const DEBOUNCE_MS = 1200;

const todayKey = () => new Date().toISOString().slice(0, 10);

export interface GloriaQuestsState {
  challenges: GloriaChallenge[];
  zones: GloriaZone[];
  progress: GloriaQuestProgress[];
  playerStats: GloriaPlayerStats | null;
  currentZone: GloriaZone | null;
  completedToday: GloriaChallenge[];
  xpEarnedToday: number;
  loading: boolean;
  evaluating: boolean;
  error: string | null;
  /** Forces an immediate re-evaluation, bypassing the debounce (e.g. a "check now" button). */
  refresh: () => void;
}

export function useGloriaQuests(userId: string | null | undefined, trades: Trade[], accounts: Account[]): GloriaQuestsState {
  const [challenges, setChallenges] = useState<GloriaChallenge[]>([]);
  const [zones, setZones] = useState<GloriaZone[]>([]);
  const [progress, setProgress] = useState<GloriaQuestProgress[]>([]);
  const [playerStats, setPlayerStats] = useState<GloriaPlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const readyFor = useRef<string | null>(null);
  const tradesRef = useRef(trades);
  const accountsRef = useRef(accounts);
  tradesRef.current = trades;
  accountsRef.current = accounts;

  const loadProgress = async (uid: string) => {
    const [pg, stats] = await Promise.all([getQuestProgress(uid), getOrCreatePlayerStats(uid)]);
    setProgress(pg);
    setPlayerStats(stats);
  };

  const runEvaluation = async (uid: string) => {
    setEvaluating(true);
    try {
      await evaluateAllChallenges(uid, tradesRef.current, accountsRef.current);
      await loadProgress(uid);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEvaluating(false);
    }
  };

  // First load for this user: zones/challenges reference data, plus an immediate evaluation (this is also what
  // creates the player's quest rows the first time they open the feature).
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    if (readyFor.current === userId) return;
    readyFor.current = userId;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [cs, zs] = await Promise.all([getChallenges(), getZones()]);
        if (cancelled) return;
        setChallenges(cs);
        setZones(zs);
        await runEvaluation(userId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Re-evaluate (debounced) whenever the trades or accounts the app is using change, or refresh() is called.
  useEffect(() => {
    if (!userId || readyFor.current !== userId) return;
    const timer = setTimeout(() => void runEvaluation(userId), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, trades, accounts, tick]);

  const refresh = () => setTick((t) => t + 1);

  const currentZone = useMemo(() => zones.find((z) => z.id === playerStats?.currentZoneId) ?? null, [zones, playerStats]);

  const completedToday = useMemo(() => {
    const today = todayKey();
    const byId = new Map(challenges.map((c) => [c.id, c]));
    return progress
      .filter((p) => p.status === "completed" && (p.completedAt ?? "").slice(0, 10) === today)
      .map((p) => byId.get(p.challengeId))
      .filter((c): c is GloriaChallenge => !!c);
  }, [progress, challenges]);

  const xpEarnedToday = useMemo(() => completedToday.reduce((sum, c) => sum + c.xpReward, 0), [completedToday]);

  return { challenges, zones, progress, playerStats, currentZone, completedToday, xpEarnedToday, loading, evaluating, error, refresh };
}
