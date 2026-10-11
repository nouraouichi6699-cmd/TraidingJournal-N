import { useEffect, useRef } from "react";
import { supabase, SYNC_KEYS } from "./lib/supabase";

const snapshot = () => {
  const o: Record<string, unknown> = {};
  for (const k of SYNC_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) o[k] = JSON.parse(v);
    } catch {}
  }
  return o;
};

/** Pull the user's cloud data into localStorage (before the app mounts). Returns true when ready. */
export async function pullCloud(userId: string): Promise<void> {
  const { data, error } = await supabase.from("user_data").select("data").eq("user_id", userId).maybeSingle();
  if (error) return; // offline / table missing: fall back to local data
  const remote = (data?.data ?? {}) as Record<string, unknown>;
  const hasRemote = SYNC_KEYS.some((k) => k in remote);
  if (hasRemote) {
    for (const k of SYNC_KEYS) {
      try {
        if (k in remote) localStorage.setItem(k, JSON.stringify(remote[k]));
        else localStorage.removeItem(k);
      } catch {}
    }
  } else {
    // first login: upload whatever this browser already has
    await supabase.from("user_data").upsert({ user_id: userId, data: snapshot(), updated_at: new Date().toISOString() });
  }
}

/** Push local changes to the cloud shortly after they happen. */
export function useCloudSync(userId: string) {
  const last = useRef<string>(JSON.stringify(snapshot()));
  useEffect(() => {
    const id = window.setInterval(async () => {
      const cur = JSON.stringify(snapshot());
      if (cur === last.current) return;
      const { error } = await supabase.from("user_data").upsert({ user_id: userId, data: JSON.parse(cur), updated_at: new Date().toISOString() });
      if (!error) last.current = cur;
    }, 2500);
    return () => window.clearInterval(id);
  }, [userId]);
}
