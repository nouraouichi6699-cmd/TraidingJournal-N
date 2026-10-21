import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase";

const KEY = "mizan-interests";

interface Store { keys: string[]; read: string[]; lead: number }
export interface NewsLike { id: string; title: string; sources: string[]; category: string; date: string; impact?: { assets: { sym: string }[] } }
export interface EventLike { id: string; time: string; currency: string; title: string }
export interface Notice { id: string; kind: "news" | "event" | "edge"; title: string; sub: string; time: number; soon: boolean; unread: boolean }

const load = (): Store => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      keys: Array.isArray(p.keys) ? p.keys.filter((k: unknown) => typeof k === "string") : [],
      read: Array.isArray(p.read) ? p.read : [],
      lead: Number.isFinite(p.lead) && p.lead > 0 ? p.lead : 30,
    };
  } catch {
    return { keys: [], read: [], lead: 30 };
  }
};

/** The topic a news story follows: its first (main) asset, else its category. */
export const newsKey = (n: Pick<NewsLike, "category" | "impact">) => (n.impact?.assets?.[0] ? `asset:${n.impact.assets[0].sym}` : `cat:${n.category}`);
export const evKey = (e: Pick<EventLike, "currency" | "title">) => `ev:${e.currency}|${e.title}`;

const newsMatches = (n: NewsLike, keys: string[]) =>
  keys.some((k) => (k.startsWith("asset:") ? !!n.impact?.assets?.some((a) => `asset:${a.sym}` === k) : k === `cat:${n.category}`));
const evMatches = (e: EventLike, keys: string[]) => keys.some((k) => k.startsWith("ev:") && k.toLowerCase() === evKey(e).toLowerCase());

/** `extra`: notices computed elsewhere (trading edge alerts); they share the read / unread state and the bell. Pass a memoized array. */
export function useInterests(extra: Omit<Notice, "unread">[] = []) {
  const [store, setStore] = useState<Store>(load);
  const [news, setNews] = useState<NewsLike[]>([]);
  const [events, setEvents] = useState<EventLike[]>([]);
  const [now, setNow] = useState(Date.now());
  const [ready, setReady] = useState(false);
  const announced = useRef<Set<string> | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  const persist = useCallback((next: Store) => {
    storeRef.current = next;
    setStore(next);
    try { localStorage.setItem(KEY, JSON.stringify({ ...next, read: next.read.slice(-400) })); } catch {}
  }, []);

  const fetchAll = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.functions.invoke("NEWS").catch(() => ({ data: null })),
      supabase.functions.invoke("NEWS", { body: { type: "calendar" } }).catch(() => ({ data: null })),
    ]);
    if (Array.isArray(a.data?.items)) setNews(a.data.items);
    if (Array.isArray(b.data?.events)) setEvents(b.data.events);
    setReady(true);
  }, []);

  useEffect(() => {
    void fetchAll();
    const f = window.setInterval(fetchAll, 5 * 60e3);
    const n = window.setInterval(() => setNow(Date.now()), 30e3);
    const onBack = () => { if (!document.hidden) void fetchAll(); };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => { window.clearInterval(f); window.clearInterval(n); window.removeEventListener("focus", onBack); document.removeEventListener("visibilitychange", onBack); };
  }, [fetchAll]);

  const notices = useMemo<Notice[]>(() => {
    const out: Notice[] = [];
    const read = new Set(store.read);
    for (const n of news) {
      const t = +new Date(n.date);
      if (!newsMatches(n, store.keys) || now - t > 72 * 36e5) continue;
      const id = `n:${n.id}`;
      out.push({ id, kind: "news", title: n.title, sub: n.sources.join(" · "), time: t, soon: false, unread: !read.has(id) });
    }
    for (const e of events) {
      const t = +new Date(e.time);
      if (!evMatches(e, store.keys) || t < now - 30 * 60e3 || t > now + 7 * 864e5) continue;
      const soon = t > now && t - now <= store.lead * 60e3;
      const id = `c:${e.id}${soon ? ":soon" : ""}`;
      out.push({ id, kind: "event", title: `${e.currency} · ${e.title}`, sub: "", time: t, soon, unread: !read.has(id) });
    }
    for (const x of extra) out.push({ ...x, unread: !read.has(x.id) });
    const rank = { edge: 0, event: 1, news: 2 } as const; // trading alerts first, then upcoming events, then news
    return out.sort((a, b) => (a.kind === b.kind ? (a.kind === "event" ? a.time - b.time : b.time - a.time) : rank[a.kind] - rank[b.kind]));
  }, [news, events, store, now, extra]);

  const unread = notices.filter((n) => n.unread).length;

  // Browser notification for stories/events that arrive after the first load.
  useEffect(() => {
    if (!ready) return;
    if (announced.current === null) { announced.current = new Set(notices.map((n) => n.id)); return; }
    for (const n of notices) {
      if (!n.unread || announced.current.has(n.id)) continue;
      announced.current.add(n.id);
      try { if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Mizan", { body: n.title }); } catch {}
    }
  }, [notices, ready]);

  const has = useCallback((k: string) => store.keys.some((x) => x.toLowerCase() === k.toLowerCase()), [store.keys]);

  const toggle = useCallback((k: string) => {
    const s = storeRef.current;
    if (s.keys.some((x) => x.toLowerCase() === k.toLowerCase())) return persist({ ...s, keys: s.keys.filter((x) => x.toLowerCase() !== k.toLowerCase()) });
    // Baseline: everything that already exists for this topic starts as "read", so only NEW items ring the bell.
    const seen: string[] = [];
    const keys = [k];
    for (const n of news) if (newsMatches(n, keys)) seen.push(`n:${n.id}`);
    for (const e of events) if (evMatches(e, keys)) seen.push(`c:${e.id}`, `c:${e.id}:soon`);
    persist({ ...s, keys: [...s.keys, k], read: Array.from(new Set([...s.read, ...seen])) });
    try { if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission(); } catch {}
  }, [news, events, persist]);

  const markRead = useCallback((id: string) => { const s = storeRef.current; if (!s.read.includes(id)) persist({ ...s, read: [...s.read, id] }); }, [persist]);
  const markAllRead = useCallback(() => {
    const s = storeRef.current;
    persist({ ...s, read: Array.from(new Set([...s.read, ...notices.map((n) => n.id)])) });
  }, [notices, persist]);
  const setLead = useCallback((lead: number) => persist({ ...storeRef.current, lead: Math.max(1, Math.round(lead) || 30) }), [persist]);

  return { keys: store.keys, lead: store.lead, notices, unread, has, toggle, markRead, markAllRead, setLead };
}
export type Interests = ReturnType<typeof useInterests>;
