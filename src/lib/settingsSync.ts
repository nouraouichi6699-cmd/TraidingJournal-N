import { supabase } from "./supabase";
import { syncPaused } from "./rowSync";
import { startPuller } from "./syncSchedule";

// Per-key, last-write-wins sync of small user settings (profile, dashboard, charts, interests, journal columns).
// Remote values are applied at startup (before the app mounts); local edits are pushed in the background.
const KEYS = ["mizan-profile", "mizan-dashboard-v2", "mizan-charts", "mizan-interests", "mizan-journal-cols", "mizan-challenges"];
const META = "mizan-sync-meta-settings", CUR = "mizan-sync-cursor-settings";

type M = { u: number; h: string; p: 0 | 1 }; // updated ms, content hash, pending push
type Meta = Record<string, M>;

const rd = <T,>(k: string, f: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? f; } catch { return f; } };
const wr = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v);
const hash = (v: unknown) => { const s = JSON.stringify(canon(v)); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return `${s.length}:${h}`; };
const value = (k: string): unknown => { try { const r = localStorage.getItem(k); return r === null ? undefined : JSON.parse(r); } catch { return undefined; } };

/** Mark keys whose content changed since the last scan as pending. */
function scan(meta: Meta) {
  const now = Date.now();
  for (const k of KEYS) {
    const v = value(k);
    if (v === undefined) continue;
    const h = hash(v);
    if (!meta[k] || meta[k].h !== h) meta[k] = { u: now, h, p: 1 };
  }
}

async function push(uid: string, meta: Meta) {
  const pending = KEYS.filter((k) => meta[k]?.p && value(k) !== undefined);
  if (!pending.length) return;
  const rows = pending.map((k) => ({ user_id: uid, key: k, value: value(k), updated_at: new Date(meta[k].u).toISOString(), deleted_at: null }));
  const { error } = await supabase.from("user_settings").upsert(rows, { onConflict: "user_id,key" });
  if (error) return;
  for (const k of pending) meta[k].p = 0;
  wr(META, meta);
}

/** Apply remote values that are newer than the local ones. */
let pullOk = false;
async function pull(uid: string, meta: Meta) {
  pullOk = false;
  const cur = rd<string | null>(CUR, null);
  let q = supabase.from("user_settings").select("*").eq("user_id", uid).order("synced_at", { ascending: true });
  if (cur) q = q.gt("synced_at", new Date(Date.parse(cur) - 5000).toISOString()); // overlap guards against late commits
  const { data, error } = await q;
  if (error || !data) return;
  for (const r of data as { key: string; value: unknown; updated_at: string; deleted_at: string | null; synced_at: string }[]) {
    const u = Date.parse(r.updated_at);
    if (!KEYS.includes(r.key) || r.deleted_at || (meta[r.key] && u <= meta[r.key].u)) continue;
    wr(r.key, r.value);
    meta[r.key] = { u, h: hash(r.value), p: 0 };
  }
  pullOk = true;
  if (data.length) wr(CUR, (data[data.length - 1] as { synced_at: string }).synced_at);
  wr(META, meta);
}


// Reconcile: drop local settings that were synced before but no longer exist in the cloud (wiped elsewhere).
// Keys pending push are kept; any request error aborts without removing anything.
let lastRec = 0;
async function reconcile(uid: string, meta: Meta) {
  if (Date.now() - lastRec < 60000) return;
  const { data, error } = await supabase.from("user_settings").select("key").eq("user_id", uid).is("deleted_at", null);
  if (error || !data) return;
  lastRec = Date.now();
  const remote = new Set((data as { key: string }[]).map((r) => r.key));
  for (const k of KEYS) {
    if (meta[k] && !meta[k].p && !remote.has(k)) { try { localStorage.removeItem(k); } catch {} delete meta[k]; }
  }
  wr(META, meta);
}

/** Run before the app mounts. Local edits made since the last scan are judged first, so they are not overwritten. */
export async function initialSettingsSync(uid: string): Promise<void> {
  try {
    const meta = rd<Meta>(META, {});
    scan(meta); wr(META, meta);
    await pull(uid, meta);
    if (pullOk) await reconcile(uid, meta); // before push: stale data must not be re-uploaded
    await push(uid, meta);
  } catch {}
}

let settingsBusy = () => false;
/** Resolves once no settings push is in flight. */
export async function settingsIdle() { for (let i = 0; i < 50 && settingsBusy(); i++) await new Promise((r) => setTimeout(r, 100)); }

/** Background push of local setting edits. */
export function startSettingsSync(uid: string): () => void {
  const raw = () => KEYS.map((k) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } }).join("|");
  let last = raw(), busy = false;
  settingsBusy = () => busy;
  const id = window.setInterval(async () => {
    const r = raw();
    if (r === last || busy || syncPaused() || !navigator.onLine) return;
    busy = true;
    try { const meta = rd<Meta>(META, {}); scan(meta); wr(META, meta); await push(uid, meta); last = r; } catch {} finally { busy = false; }
  }, 2500);
  // Settings are pulled on focus / reconnect only (as before), now gated to once per 15 s.
  const puller = startPuller(async () => {
    if (busy || syncPaused() || !navigator.onLine) return null;
    busy = true;
    try { const meta = rd<Meta>(META, {}); scan(meta); wr(META, meta); await pull(uid, meta); const ok = pullOk; if (pullOk) await reconcile(uid, meta); await push(uid, meta); return { ok, changed: false }; } catch { return { ok: false, changed: false }; } finally { busy = false; }
  }, { periodic: false, label: "settings" });
  return () => { window.clearInterval(id); puller.stop(); };
}
