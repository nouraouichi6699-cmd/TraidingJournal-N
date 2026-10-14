import { createClient } from "@supabase/supabase-js";

// Both values are public by design (protected by Row Level Security).
const url = import.meta.env.VITE_SUPABASE_URL ?? "https://lfdddmcktywktnrkthbx.supabase.co";
const key = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_YfWaHqtMmfi6c46CvhWpKQ_9SDpZg85";

export const supabase = createClient(url, key);

export const SYNC_KEYS = ["mizan-accounts", "mizan-journal", "mizan-profile", "mizan-news", "mizan-calendar", "mizan-interests", "mizan-journal-cols", "mizan-charts", "mizan-dashboard"] as const;
