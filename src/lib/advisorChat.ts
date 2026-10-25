// Advisor chat: the call to the "advisor" edge function (the journal summary it sends is journalContext, in advisor.ts).
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Lang } from "../types";

export type Turn = { role: "user" | "assistant"; content: string };
export type AskError = "notDeployed" | "noKey" | "signIn" | "busy" | "unreachable" | "failed";

// The model ends with a line "FOLLOW-UPS: q1 | q2 | q3"; the function splits it off (this repeats it for an older deploy).
const FOLLOW = /(?:^|\n)[ \t*_>#-]*(?:FOLLOW-?UPS?|Follow-ups|أسئلة المتابعة|Questions de suivi)\s*\**\s*[:：]\s*\**([\s\S]*)$/;
export function splitFollowups(raw: string): { answer: string; followups: string[] } {
  const m = FOLLOW.exec(raw);
  if (!m) return { answer: raw, followups: [] };
  const followups = m[1].split(/\s*\|\s*|\n+/).map((q) => q.replace(/^[\s\-*•\d.)]+/, "").replace(/\*\*/g, "").trim()).filter((q) => q && q.length <= 140).slice(0, 3);
  return { answer: raw.slice(0, m.index).trim(), followups };
}

/** The AI's answer through the "advisor" edge function (with up to three follow-up questions), or why there is none. */
export async function askAdvisor(question: string, lang: Lang, context: unknown, history: Turn[]): Promise<{ answer: string; followups: string[] } | { error: AskError }> {
  try {
    const { data, error } = await supabase.functions.invoke("advisor", { body: { question, lang, context, history: history.map(({ role, content }) => ({ role, content })) } });
    if (error) {
      const status = error instanceof FunctionsHttpError ? (error.context as Response | undefined)?.status : undefined;
      return { error: status === 404 ? "notDeployed" : status === 401 ? "signIn" : status === 503 ? "noKey" : status === 429 ? "busy" : status ? "failed" : "unreachable" };
    }
    if (!data?.ok || typeof data.answer !== "string") return { error: "failed" };
    const own = splitFollowups(data.answer), given = Array.isArray(data.followups) ? data.followups.filter((q: unknown): q is string => typeof q === "string" && !!q.trim()).slice(0, 3) : [];
    return { answer: own.answer, followups: given.length ? given : own.followups };
  } catch {
    return { error: "unreachable" };
  }
}
