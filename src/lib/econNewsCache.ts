// Native IndexedDB cache for the dashboard P&L calendar's economic-news rows, keyed per user per
// month so stale-while-revalidate can paint instantly and filter toggles never need a refetch.
// Browser-only glue; the testable rules (key shape, month range, eviction, merge) live in econCache.ts.
import type { StoredEconEvent } from "./econEvents";
import { ECON_CACHE_MAX_MONTHS, econCacheKey, monthsToEvict } from "./econCache";

const DB_NAME = "mizan-econ-cache";
const DB_VERSION = 1;
const STORE = "months";

export interface EconCacheEntry {
  key: string;
  userId: string;
  month: string; // YYYY-MM
  savedAt: number;
  ff: StoredEconEvent[];
  mt5: StoredEconEvent[];
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" }).createIndex("userId", "userId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function listMonthsForUser(db: IDBDatabase, userId: string): Promise<EconCacheEntry[]> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).index("userId").getAll(userId);
      req.onsuccess = () => resolve((req.result as EconCacheEntry[]) ?? []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** Cached rows for one user's one month, or null if there's none (or IndexedDB is unavailable). */
export async function getCachedEconMonth(userId: string, month: string): Promise<EconCacheEntry | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(econCacheKey(userId, month));
      req.onsuccess = () => resolve((req.result as EconCacheEntry) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Saves one user's month, then evicts that user's oldest months beyond the 14-month cap. Never throws. */
export async function putCachedEconMonth(entry: EconCacheEntry): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  const months = (await listMonthsForUser(db, entry.userId)).map((e) => e.month);
  const evict = monthsToEvict(months, ECON_CACHE_MAX_MONTHS);
  if (!evict.length) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const m of evict) store.delete(econCacheKey(entry.userId, m));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Drops every cached month for a user, e.g. on sign-out so the next person on this device never sees their rows. */
export async function clearEconCacheForUser(userId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const months = (await listMonthsForUser(db, userId)).map((e) => e.month);
  if (!months.length) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const m of months) store.delete(econCacheKey(userId, m));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
