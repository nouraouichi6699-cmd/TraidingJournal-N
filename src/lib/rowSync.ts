import { supabase } from "./supabase";
import type { Account, BalancePoint, Trade } from "../types";

// Row-based, local-first sync for accounts / trades / balance points.
// localStorage stays the instant cache; per-row metadata decides what to push and what wins on pull.
const ACC = "mizan-accounts", JNL = "mizan-journal", META = "mizan-sync-meta", CUR = "mizan-sync-cursor", UID = "mizan-sync-uid";
import { startPuller, type PullResult } from "./syncSchedule";
export const PULLED = "mizan-sync-pulled";
const DAY = 864e5;

type Tbl = "accounts" | "trades" | "balance_points";
type Row = Record<string, unknown>;
type M = { u: number; d: number; h: string; p: 0 | 1 }; // updated ms, deleted ms, hash, pending push
type Meta = Record<Tbl, Record<string, M>>;
type Journal = { trades: Trade[]; balances: Record<string, BalancePoint[]> };

const rd = <T,>(k: string, f: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? f; } catch { return f; } };
const wr = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const hash = (r: Row) => JSON.stringify(r, (_, v) => (v === undefined ? null : v));
const local = () => {
  const j = rd<Journal>(JNL, { trades: [], balances: {} });
  return { accounts: rd<Account[]>(ACC, []), trades: j.trades ?? [], balances: j.balances ?? {} };
};

const n = (v: unknown) => (v == null ? null : Number(v));
const accTo = (a: Account): Row => ({ id: a.id, platform: a.platform, name: a.name, currency: a.currency, start_balance: a.startBalance, login: a.login ?? null, server: a.server ?? null, created_at_ms: a.createdAt ?? 0 });
const accFrom = (r: Row): Account => ({ id: r.id as string, platform: r.platform as Account["platform"], name: r.name as string, currency: r.currency as string, startBalance: Number(r.start_balance), ...(r.login ? { login: r.login as string } : {}), ...(r.server ? { server: r.server as string } : {}), createdAt: Number(r.created_at_ms ?? 0) });
const trTo = (t: Trade): Row => ({ key: t.key, account_id: t.accountId, no: t.no, symbol: t.symbol, side: t.side, qty: t.qty, entry_time: t.entryTime, entry_price: t.entryPrice, exit_time: t.exitTime, exit_price: t.exitPrice, pnl: t.pnl, return_pct: t.returnPct, commission: t.commission, sl: t.sl ?? null, tp: t.tp ?? null, status: t.status });
const trFrom = (r: Row): Trade => ({ key: r.key as string, accountId: r.account_id as string, no: Number(r.no), symbol: r.symbol as string, side: r.side as Trade["side"], qty: Number(r.qty), entryTime: r.entry_time as string | null, entryPrice: Number(r.entry_price), exitTime: r.exit_time as string | null, exitPrice: n(r.exit_price), pnl: n(r.pnl), returnPct: n(r.return_pct), commission: Number(r.commission), sl: n(r.sl), tp: n(r.tp), status: r.status as Trade["status"] });
const bpTo = (a: string, p: BalancePoint): Row => ({ account_id: a, t: p.t, balance: p.balance });

const TBLS: Tbl[] = ["accounts", "trades", "balance_points"]; // push order matters (foreign keys)
const CONFLICT: Record<Tbl, string> = { accounts: "id", trades: "user_id,key", balance_points: "user_id,account_id,t" };
const idOf = (t: Tbl, r: Row) => (t === "accounts" ? (r.id as string) : t === "trades" ? (r.key as string) : `${r.account_id}|${r.t}`);
const list = (t: Tbl): [string, Row][] => {
  const l = local();
  if (t === "accounts") return l.accounts.map((a) => [a.id, accTo(a)]);
  if (t === "trades") return l.trades.map((x) => [x.key, trTo(x)]);
  return Object.entries(l.balances).flatMap(([a, ps]) => ps.map((p): [string, Row] => [`${a}|${p.t}`, bpTo(a, p)]));
};

const emptyMeta = (): Meta => ({ accounts: {}, trades: {}, balance_points: {} });
const loadMeta = (): Meta => ({ ...emptyMeta(), ...rd<Partial<Meta>>(META, {}) });

/** Detect local changes (edits, inserts, deletes) since the last scan and mark them pending. */
function scan(meta: Meta) {
  const now = Date.now();
  for (const t of TBLS) {
    const seen = new Set<string>();
    for (const [id, row] of list(t)) {
      seen.add(id);
      const h = hash(row), m = meta[t][id];
      if (!m || m.h !== h || m.d) meta[t][id] = { u: now, d: 0, h, p: 1 };
    }
    for (const [id, m] of Object.entries(meta[t])) {
      if (seen.has(id)) continue;
      if (!m.d) meta[t][id] = { u: now, d: now, h: "", p: 1 };
      else if (!m.p && now - m.d > 30 * DAY) delete meta[t][id]; // forget old tombstones
    }
  }
}

/** Merge remote rows into localStorage; a remote row wins only if it is newer than the local one. */
function applyRemote(t: Tbl, rows: Row[], meta: Meta): boolean {
  const l = local();
  const accs = new Map(l.accounts.map((a) => [a.id, a]));
  const trs = new Map(l.trades.map((x) => [x.key, x]));
  const bps = new Map(Object.entries(l.balances).flatMap(([a, ps]) => ps.map((p): [string, [string, BalancePoint]] => [`${a}|${p.t}`, [a, p]])));
  const alive = new Set(l.accounts.map((a) => a.id));
  let changed = false;
  for (const r of rows) {
    if (t !== "accounts" && !alive.has(r.account_id as string)) continue; // never resurrect rows of a deleted account
    const id = idOf(t, r), m = meta[t][id], u = Date.parse(r.updated_at as string);
    if (m && u <= m.u) continue;
    const del = !!r.deleted_at;
    let h = "";
    if (t === "accounts") { if (del) accs.delete(id); else { const a = accFrom(r); accs.set(id, a); h = hash(accTo(a)); } }
    else if (t === "trades") { if (del) trs.delete(id); else { const x = trFrom(r); trs.set(id, x); h = hash(trTo(x)); } }
    else if (del) bps.delete(id); else { const p = { t: r.t as string, balance: Number(r.balance) }; bps.set(id, [r.account_id as string, p]); h = hash(bpTo(r.account_id as string, p)); }
    meta[t][id] = { u, d: del ? u : 0, h, p: 0 };
    changed = true;
  }
  if (!changed) return false;
  if (t === "accounts") wr(ACC, [...accs.values()]);
  else {
    const balances: Record<string, BalancePoint[]> = {};
    for (const [a, p] of bps.values()) (balances[a] ||= []).push(p);
    for (const a of Object.keys(balances)) balances[a].sort((x, y) => x.t.localeCompare(y.t));
    wr(JNL, { trades: [...trs.values()], balances });
  }
  return true;
}

let pullOk = false;
async function pull(uid: string, meta: Meta): Promise<boolean> {
  pullOk = false;
  const cur = rd<Partial<Record<Tbl, string>>>(CUR, {});
  let any = false;
  for (const t of TBLS) {
    let since = cur[t] ? new Date(Date.parse(cur[t]!) - 5000).toISOString() : null; // overlap guards against late commits
    for (;;) {
      let q = supabase.from(t).select("*").eq("user_id", uid).order("synced_at", { ascending: true }).limit(1000);
      if (since) q = q.gt("synced_at", since);
      const { data, error } = await q;
      if (error) return any;
      const rows = (data ?? []) as Row[];
      if (rows.length) {
        if (applyRemote(t, rows, meta)) any = true;
        cur[t] = since = rows[rows.length - 1].synced_at as string;
      }
      if (rows.length < 1000) break;
    }
  }
  wr(CUR, cur); wr(META, meta);
  pullOk = true;
  return any;
}

async function push(uid: string, meta: Meta): Promise<void> {
  for (const t of TBLS) {
    const pending = Object.entries(meta[t]).filter(([, m]) => m.p);
    if (!pending.length) continue;
    const live = new Map(list(t));
    // Live rows: upsert in chunks (conflict keys make duplicate imports harmless).
    const ups = pending.filter(([id, m]) => !m.d && live.has(id));
    for (let i = 0; i < ups.length; i += 500) {
      const chunk = ups.slice(i, i + 500);
      const payload = chunk.map(([id, m]) => ({ user_id: uid, ...live.get(id)!, updated_at: new Date(m.u).toISOString(), deleted_at: null }));
      const { error } = await supabase.from(t).upsert(payload, { onConflict: CONFLICT[t] });
      if (error) return;
      for (const [id] of chunk) meta[t][id].p = 0;
    }
    // Tombstones: soft-delete by key, grouped by deletion time (rows are gone locally).
    const dels = pending.filter(([, m]) => m.d);
    const groups = new Map<number, string[]>();
    for (const [id, m] of dels) (groups.get(m.d) ?? groups.set(m.d, []).get(m.d)!).push(id);
    for (const [d, ids] of groups) {
      const stamp = { deleted_at: new Date(d).toISOString(), updated_at: new Date(d).toISOString() };
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        let q = supabase.from(t).update(stamp).eq("user_id", uid);
        if (t === "accounts") q = q.in("id", chunk);
        else if (t === "trades") q = q.in("key", chunk);
        else {
          const byAcc = new Map<string, string[]>();
          for (const id of chunk) { const [a, ts] = [id.slice(0, id.indexOf("|")), id.slice(id.indexOf("|") + 1)]; (byAcc.get(a) ?? byAcc.set(a, []).get(a)!).push(ts); }
          for (const [a, tsList] of byAcc) { const { error } = await supabase.from(t).update(stamp).eq("user_id", uid).eq("account_id", a).in("t", tsList); if (error) return; }
          for (const id of chunk) meta[t][id].p = 0;
          continue;
        }
        const { error } = await q;
        if (error) return;
        for (const id of chunk) meta[t][id].p = 0;
      }
    }
  }
  wr(META, meta);
}

// Reconcile: drop local rows that were synced before but no longer exist in the cloud (hard-deleted elsewhere).
// Rows pending push (offline edits, new rows) are never removed. Any request error aborts without removing anything.
let lastRec = 0;
const RCOLS: Record<Tbl, string> = { accounts: "id", trades: "key", balance_points: "id,account_id,t" };
const ROWID: Record<Tbl, string> = { accounts: "id", trades: "key", balance_points: "id" };
async function reconcile(uid: string, meta: Meta): Promise<boolean> {
  if (Date.now() - lastRec < 60000) return false;
  const remote: Record<Tbl, Set<string>> = { accounts: new Set(), trades: new Set(), balance_points: new Set() };
  for (const t of TBLS) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(t).select(RCOLS[t]).eq("user_id", uid).is("deleted_at", null).order(ROWID[t]).range(from, from + 999);
      if (error || !data) return false;
      for (const r of data as unknown as Row[]) remote[t].add(idOf(t, r));
      if (data.length < 1000) break;
    }
  }
  lastRec = Date.now();
  const gone = (t: Tbl, id: string) => { const m = meta[t][id]; return !!m && !m.p && !m.d && !remote[t].has(id); };
  const l = local();
  const accounts = l.accounts.filter((a) => !gone("accounts", a.id));
  const trades = l.trades.filter((x) => !gone("trades", x.key));
  const balances: Record<string, BalancePoint[]> = {};
  for (const [a, ps] of Object.entries(l.balances)) { const keep = ps.filter((p) => !gone("balance_points", `${a}|${p.t}`)); if (keep.length) balances[a] = keep; }
  const changed = accounts.length !== l.accounts.length || trades.length !== l.trades.length || JSON.stringify(balances) !== JSON.stringify(l.balances);
  for (const t of TBLS) for (const id of Object.keys(meta[t])) if (gone(t, id)) delete meta[t][id];
  if (changed) { wr(ACC, accounts); wr(JNL, { trades, balances }); wr(META, meta); }
  return changed;
}

let running = false, paused = false;
export const syncPaused = () => paused;
export const resumeSync = () => { paused = false; };
/** Stop background sync and wait for an in-flight cycle (used before wiping cloud data). */
export async function haltSync() { paused = true; for (let i = 0; i < 50 && running; i++) await new Promise((r) => setTimeout(r, 100)); }
async function cycle(uid: string, first: boolean, focus = false, doPull = true): Promise<PullResult | null> {
  if (running || paused) return null;
  running = true;
  try {
    const meta = loadMeta();
    let changed = false;
    if (first || focus) {
      changed = await pull(uid, meta); // adopt cloud rows before judging local ones
      if (pullOk && (await reconcile(uid, meta))) changed = true; // before any push, so stale data is never re-uploaded
    }
    scan(meta); wr(META, meta);
    await push(uid, meta);
    if (!first && !focus && doPull) changed = await pull(uid, meta);
    if (changed) window.dispatchEvent(new Event(PULLED));
    return { ok: pullOk, changed };
  } catch { return { ok: false, changed: false }; } finally { running = false; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Accounts with non-uuid ids get fresh uuids (trades and balances follow). */
function fixIds() {
  const l = local();
  const map = new Map(l.accounts.filter((a) => !UUID.test(a.id)).map((a) => [a.id, crypto.randomUUID()]));
  if (!map.size) return;
  wr(ACC, l.accounts.map((a) => (map.has(a.id) ? { ...a, id: map.get(a.id)! } : a)));
  wr(JNL, {
    trades: l.trades.map((t) => { const nid = map.get(t.accountId); return nid ? { ...t, accountId: nid, key: nid + t.key.slice(t.accountId.length) } : t; }),
    balances: Object.fromEntries(Object.entries(l.balances).map(([a, v]) => [map.get(a) ?? a, v])),
  });
}

/** Run before the app mounts: drop another user's leftovers, then first sync. */
export async function initialSync(uid: string): Promise<void> {
  if (rd<string | null>(UID, null) !== uid) { for (const k of [ACC, JNL, META, CUR]) { try { localStorage.removeItem(k); } catch {} } wr(UID, uid); }
  fixIds();
  await cycle(uid, true);
}

/** Background loop: pushes stay on the 2.5 s tick; pulls are scheduled by syncSchedule (30 s, paused when hidden, backoff). */
export function startRowSync(uid: string): () => void {
  const raw = () => { try { return (localStorage.getItem(ACC) ?? "") + (localStorage.getItem(JNL) ?? ""); } catch { return ""; } };
  let last = raw();
  const puller = startPuller((focus) => (navigator.onLine ? cycle(uid, false, focus) : Promise.resolve(null)), { label: "rows" });
  const id = window.setInterval(() => {
    const r = raw();
    if (r !== last) { last = r; puller.touch(); if (navigator.onLine) void cycle(uid, false, false, false); }
  }, 2500);
  return () => { clearInterval(id); puller.stop(); };
}
