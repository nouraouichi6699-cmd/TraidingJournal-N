// GLORIA_RPG: wires the challenge engine into whatever trades/accounts the rest of the app is already using.
// Pass it useJournal().trades and useAccounts().accounts directly -- it does not read its own copy of either,
// so there is exactly one source of truth for trade data. Every trade the app has is in scope, demo and
// contest accounts included (Account.tradeMode is never read here or in the gloria services) -- the game is
// meant to work the same way on a demo account as a real one, which is also what makes it testable with one.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Account, Trade } from "../types";
import type { GloriaChallenge, GloriaPlayerStats, GloriaQuestProgress, GloriaZone } from "../types/gloria";
import { evaluateAllChallenges, getChallenges, getQuestProgress, getZones } from "../services/gloriaChallengeService";
import { getOrCreatePlayerStats } from "../services/gloriaPlayerService";

// Trades change on every import/edit; waiting this long before re-checking challenges keeps a burst of edits
// (an import of hundreds of rows) from re-running the full engine after each one.
const DEBOUNCE_MS = 1200;

const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Unwraps the error shapes this hook actually sees. A Supabase/PostgREST failure is a plain {message, code,
 * details, hint} object, NOT an Error instance -- `e instanceof Error ? e.message : String(e)` silently falls
 * through to String()'s useless default for it ("[object Object]"), which is exactly what reached the error
 * banner. This always surfaces a real, readable message (plus the Postgres error code when there is one, e.g.
 * "(42501)" for an RLS violation) instead.
 */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const rec = e as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message) return typeof rec.code === "string" ? `${rec.message} (${rec.code})` : rec.message;
    try {
      return JSON.stringify(e);
    } catch {
      /* circular or otherwise unserializable: fall through to String() below */
    }
  }
  return String(e);
}

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

  const tradesRef = useRef(trades);
  const accountsRef = useRef(accounts);
  tradesRef.current = trades;
  accountsRef.current = accounts;

  const loadProgress = async (uid: string) => {
    const [pg, stats] = await Promise.all([getQuestProgress(uid), getOrCreatePlayerStats(uid)]);
    setProgress(pg);
    setPlayerStats(stats);
  };

  // At most one evaluation in flight at a time. Without this, the first-load effect's immediate call and the
  // debounced re-evaluate effect (both scheduled on mount) can overlap on a slow connection -- a first-ever run
  // does several sequential round trips (seed every quest row, then read back XP/stats/character), easily past
  // the 1200ms debounce. Two concurrent evaluateAllChallenges calls for the same user then race to insert the
  // same seed rows, and one of them loses with a real Postgres error -- which used to abort before the quest
  // rows the OTHER call had already saved were ever reloaded, so the player saw an error banner over a map that
  // still looked untouched. A trailing call is queued (not dropped) so a trade change that arrives mid-evaluation
  // still gets picked up once the in-flight one finishes.
  const inFlight = useRef<Promise<void> | null>(null);
  const pending = useRef(false);

  const runEvaluation = (uid: string): Promise<void> => {
    if (inFlight.current) {
      pending.current = true;
      return inFlight.current;
    }
    setEvaluating(true);
    const run = (async () => {
      try {
        await evaluateAllChallenges(uid, tradesRef.current, accountsRef.current);
        await loadProgress(uid);
        setError(null);
      } catch (e) {
        setError(describeError(e));
      } finally {
        setEvaluating(false);
        inFlight.current = null;
        if (pending.current) {
          pending.current = false;
          void runEvaluation(uid);
        }
      }
    })();
    inFlight.current = run;
    return run;
  };

  // First load for this user: zones/challenges reference data, plus an immediate evaluation (this is also what
  // creates the player's quest rows the first time they open the feature).
  //
  // Deliberately gated only by the dependency array below, never by a ref that marks "already started for this
  // userId" -- that ref used to be set synchronously, before the first await, and React 18 StrictMode (dev only)
  // mounts every effect, cleans it up, and mounts it again, synchronously, before any of that first mount's
  // awaited work settles. The ref was already pointing at this userId by the time the surviving second mount
  // ran, so it bailed out immediately and never fetched anything, while the first (cancelled) mount's fetch
  // completed later but had its own `cancelled` flag set, so it skipped every state update including
  // `setLoading(false)` -- "Unrolling the map..." forever, with nothing left to ever clear it. getChallenges/
  // getZones are cheap, read-only, and safe to issue twice back-to-back (the StrictMode-only cost), and
  // runEvaluation's single-flight guard already coalesces a duplicate evaluation call, so nothing here actually
  // needs the ref's protection.
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
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
        if (!cancelled) setError(describeError(e));
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
  // If this fires while the first load above is still in flight, runEvaluation's single-flight guard joins it
  // instead of starting a second, overlapping evaluation.
  useEffect(() => {
    if (!userId) return;
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
