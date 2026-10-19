// Scheduling only: decides WHEN to pull. Never touches sync data, conflict rules or analytics.
export const BASE_MS = 30_000;
export const IDLE_MS = 60_000;
export const IDLE_AFTER_MS = 5 * 60_000;
export const MIN_GAP_MS = 15_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

export interface DelayInput {
  hidden: boolean;
  online: boolean;
  /** Consecutive failed pulls (0 after a success). */
  errorCount: number;
  /** Time since the last local or remote change. */
  idleMs: number;
  /** Timestamp of the last pull (0 = never). */
  lastPullMs: number;
  now: number;
  /** Focus / visible / online trigger: pull as soon as the 15 s gap allows. */
  focus?: boolean;
}

/** Milliseconds until the next pull, or 'pause' (hidden or offline: no timer at all). */
export function nextDelay(i: DelayInput): { delayMs: number } | "pause" {
  if (i.hidden || !i.online) return "pause";
  const since = Math.max(0, i.now - i.lastPullMs);
  if (i.focus && i.errorCount === 0) return { delayMs: Math.max(0, MIN_GAP_MS - since) };
  const base = i.errorCount > 0
    ? Math.min(BASE_MS * 2 ** (i.errorCount - 1), MAX_BACKOFF_MS)
    : i.idleMs >= IDLE_AFTER_MS ? IDLE_MS : BASE_MS;
  return { delayMs: Math.max(0, base - since, MIN_GAP_MS - since) };
}

export interface PullResult { ok: boolean; changed: boolean }
export interface Puller {
  /** Call on any local activity: returns to the 30 s cadence. */
  touch(): void;
  stop(): void;
}

/** Timer + visibility/focus/online wiring around nextDelay. `pull` returns null when skipped (busy). */
export function startPuller(pull: (focus: boolean) => Promise<PullResult | null>, opts: { periodic?: boolean; label?: string } = {}): Puller {
  const periodic = opts.periodic !== false;
  let errors = 0, lastPull = Date.now(), lastActivity = Date.now(), timer: ReturnType<typeof setTimeout> | undefined, focusNext = false, stopped = false;
  const log: number[] = [];
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const schedule = (focus = false) => {
    clear();
    if (stopped || (!periodic && !focus)) return;
    const d = nextDelay({ hidden: document.hidden, online: navigator.onLine, errorCount: errors, idleMs: Date.now() - lastActivity, lastPullMs: lastPull, now: Date.now(), focus });
    if (d === "pause") return;
    focusNext = focus;
    timer = setTimeout(run, d.delayMs);
  };
  const run = async () => {
    timer = undefined;
    if (document.hidden || !navigator.onLine) return;
    let r: PullResult | null = null;
    try { r = await pull(focusNext); } catch { r = { ok: false, changed: false }; }
    lastPull = Date.now();
    if (r) { errors = r.ok ? 0 : errors + 1; if (r.changed) lastActivity = lastPull; }
    if (import.meta.env?.DEV) { // dev-only: pulls per minute
      log.push(lastPull); while (log.length && log[0] < lastPull - 60_000) log.shift();
      console.debug(`[sync${opts.label ? ":" + opts.label : ""}] pulls/min: ${log.length}`);
    }
    schedule();
  };
  const onVis = () => (document.hidden ? clear() : schedule(true));
  const onFocus = () => schedule(true);
  const onOnline = () => { errors = 0; schedule(true); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", clear);
  schedule();
  return {
    touch() { lastActivity = Date.now(); if (!document.hidden && periodic) schedule(); },
    stop() {
      stopped = true; clear();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus); window.removeEventListener("online", onOnline); window.removeEventListener("offline", clear);
    },
  };
}
