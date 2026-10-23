import { createClient } from "@supabase/supabase-js";

// Both values are public by design (protected by Row Level Security).
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? "https://lfdddmcktywktnrkthbx.supabase.co";
const key = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_YfWaHqtMmfi6c46CvhWpKQ_9SDpZg85";

export const supabase = createClient(SUPABASE_URL, key);

