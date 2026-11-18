// GLORIA_RPG: the player's persisted hero (see services/gloriaHeroService). Runs the scheduled-update check once per
// open of Gloria -- NOT on every trade change, which is the whole point: between the weekly / new-month updates the
// hero stays what is stored, however the trades move. Pass useJournal().trades and useAccounts().accounts directly,
// like useGloriaQuests.
//
// A failure (typically: the 20261118 migration has not been applied yet) is reported in `error` and never throws;
// the rest of Gloria keeps working and the hero falls back to the free starter so the game is not left without one.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account, Trade } from "../types";
import { acknowledgeReveal, syncHero, unlockedCharacters, type GloriaHeroData, type GloriaHeroHistoryEntry, type GloriaHeroState } from "../services/gloriaHeroService";
import { STARTER_CHARACTER } from "../services/gloriaCharacterRules";
import type { GloriaCharacterId } from "../services/gloriaCharacterService";

const EMPTY_STATE: GloriaHeroState = { character: null, isStarter: false, checkedAt: null, snapshot: null, revealPending: false, previousCharacter: null };

export interface GloriaHero {
  /** The hero to show everywhere (HUD, land sprite). The starter while loading or when the schedule is unavailable. */
  character: GloriaCharacterId;
  state: GloriaHeroState;
  history: GloriaHeroHistoryEntry[];
  unlocked: ReadonlySet<GloriaCharacterId>;
  loading: boolean;
  /** Readable message when the schedule could not load/run; null otherwise. */
  error: string | null;
  /** True when a change happened that the player has not seen the reveal for yet. */
  revealPending: boolean;
  dismissReveal: () => void;
}

export function useGloriaHero(userId: string | null | undefined, trades: Trade[], accounts: Account[]): GloriaHero {
  const [data, setData] = useState<GloriaHeroData | null>(null);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const tradesRef = useRef(trades);
  const accountsRef = useRef(accounts);
  tradesRef.current = trades;
  accountsRef.current = accounts;

  // Once per user per mount. Deliberately not dependent on `trades`: see the header. The `cancelled` closure (not a
  // ref) gates the state writes, which keeps this safe under React 18 StrictMode's mount/cleanup/mount; syncHero's
  // conditional write makes the doubled call harmless on the server side too.
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDismissed(false);
    syncHero(userId, tradesRef.current, accountsRef.current)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[gloria] hero schedule failed", e);
        const rec = e as { message?: unknown } | null;
        setError(typeof rec?.message === "string" ? rec.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const state = data?.state ?? EMPTY_STATE;
  const history = useMemo(() => data?.history ?? [], [data]);
  const unlocked = useMemo(() => unlockedCharacters(state, history), [state, history]);
  const revealPending = !!state.character && state.revealPending && !dismissed;

  const dismissReveal = useCallback(() => {
    setDismissed(true);
    if (!userId) return;
    void acknowledgeReveal(userId).catch((e) => console.error("[gloria] could not clear the reveal flag", e));
  }, [userId]);

  return useMemo(
    () => ({ character: state.character ?? STARTER_CHARACTER, state, history, unlocked, loading, error, revealPending, dismissReveal }),
    [state, history, unlocked, loading, error, revealPending, dismissReveal],
  );
}
