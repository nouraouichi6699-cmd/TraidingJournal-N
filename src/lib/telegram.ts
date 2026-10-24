// Telegram alerts: calls to the "telegram" edge function (the bot token lives only there).
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Lang } from "../types";

export const TG_PREFS = { trades: true, rules: true, streak: true, nosl: true, stale: true, daily: true, weekly: true, news: true, entry: true, danger: true, morning: true };
export type TgPrefs = typeof TG_PREFS;
export type TgPartner = { name: string | null; since: string };
export type TgState = { linked: boolean; name: string | null; prefs: TgPrefs; partner?: TgPartner | null };
export type TgError = "notDeployed" | "noToken" | "badToken" | "signIn" | "notLinked" | "unreachable" | "failed";

async function call<T>(body: Record<string, unknown>): Promise<T | { error: TgError }> {
  try {
    const { data, error } = await supabase.functions.invoke("telegram", { body });
    if (error) {
      const res = error instanceof FunctionsHttpError ? (error.context as Response | undefined) : undefined, st = res?.status;
      let code: unknown;
      try { code = (await res?.json())?.error; } catch { /* no body */ }
      return { error: st === 404 ? "notDeployed" : st === 401 ? "signIn" : st === 503 ? "noToken" : code === "badToken" ? "badToken" : code === "notLinked" ? "notLinked" : st ? "failed" : "unreachable" };
    }
    return data?.ok ? (data as T) : { error: "failed" };
  } catch {
    return { error: "unreachable" };
  }
}
/** The bot's name and the link state; the first call also points the bot's webhook at the function. It also sends the
 *  app's address (the "note" buttons under trade alerts open it) and the browser's time zone. */
export const tgInfo = (lang: Lang) => call<TgState & { bot: string }>({ action: "info", lang, site: `${location.origin}${import.meta.env.BASE_URL}`, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
/** A one-time t.me link (valid 30 minutes): pressing Start in Telegram links the chat. */
export const tgLink = (lang: Lang) => call<{ url: string }>({ action: "link", lang });
export const tgTest = (lang: Lang) => call<{ ok: true }>({ action: "test", lang });
export const tgUnlink = (lang: Lang) => call<TgState>({ action: "unlink", lang });
export const tgPrefs = (lang: Lang, prefs: TgPrefs) => call<TgState>({ action: "prefs", lang, prefs });
/** A one-time t.me invite for an accountability partner (7 days; a new one replaces the last). */
export const tgPartnerInvite = (lang: Lang) => call<{ url: string }>({ action: "partnerInvite", lang });
export const tgPartnerRemove = (lang: Lang) => call<TgState>({ action: "partnerRemove", lang });
/** The partner now and whether an invite is still open, read from the user's own settings row. */
export async function tgPartnerNow(): Promise<{ partner: TgPartner | null; pending: boolean } | null> {
  const { data, error } = await supabase.from("user_settings").select("value").eq("key", "telegram").is("deleted_at", null).maybeSingle();
  if (error) return null;
  const v = data?.value as { partner?: { chat?: number; name?: string | null; since?: string } | null; pcodeHash?: string | null } | null | undefined;
  return { partner: v?.partner?.chat ? { name: v.partner.name ?? null, since: v.partner.since ?? "" } : null, pending: !!v?.pcodeHash };
}
/** Whether a chat is linked right now, read from the user's own settings row (no call to Telegram). */
export async function tgLinked(): Promise<{ linked: boolean; name: string | null } | null> {
  const { data, error } = await supabase.from("user_settings").select("value").eq("key", "telegram").is("deleted_at", null).maybeSingle();
  if (error) return null;
  const v = data?.value as { chat?: number | null; name?: string | null } | null | undefined;
  return { linked: !!v?.chat, name: v?.name ?? null };
}
