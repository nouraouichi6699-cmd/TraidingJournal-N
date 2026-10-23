// MT5 auto-sync keys. The MizanSync Expert Advisor (public/MizanSync.mq5) sends trades to the "mt5-sync" edge function
// with a key made here. Only the key's SHA-256 hash is stored (user_settings "mt5-sync:<account id>"); the key is shown once.
// updated_at null lets the database clock order the writes (sync_guard), so a key made or removed here always wins.
import { supabase } from "./supabase";

export type SyncKey = { created: string; last?: string; login?: string | null; sent?: number };

const name = (accountId: string) => `mt5-sync:${accountId}`;
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/** A new random key: "mzn_" + 32 random bytes in base64url. */
export function makeKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return `mzn_${btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/** The account's key state: null when it has none, undefined when it could not be read. */
export async function readSyncKey(uid: string, accountId: string): Promise<SyncKey | null | undefined> {
  const { data, error } = await supabase.from("user_settings").select("value").eq("user_id", uid).eq("key", name(accountId)).is("deleted_at", null).maybeSingle();
  if (error) return undefined;
  const v = data?.value as (SyncKey & { hash?: string }) | null | undefined;
  return v && typeof v.hash === "string" ? { created: v.created, last: v.last, login: v.login, sent: v.sent } : null;
}

/** Makes a new key for the account (an older key stops working) and returns it, or null when it could not be saved. */
export async function createSyncKey(uid: string, accountId: string): Promise<string | null> {
  const key = makeKey();
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: uid, key: name(accountId), value: { hash: await sha256(key), created: new Date().toISOString() }, updated_at: null, deleted_at: null },
    { onConflict: "user_id,key" },
  );
  return error ? null : key;
}

/** Removes the account's key: the Expert Advisor can no longer send trades. */
export async function removeSyncKey(uid: string, accountId: string): Promise<boolean> {
  const { error } = await supabase.from("user_settings").delete().eq("user_id", uid).eq("key", name(accountId));
  return !error;
}
