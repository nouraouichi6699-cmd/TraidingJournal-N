// Advisor chat: the call to the "advisor" edge function (the journal summary it sends is journalContext, in advisor.ts).
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Lang } from "../types";

export type Turn = { role: "user" | "assistant"; content: string };
export type AskError = "notDeployed" | "noKey" | "signIn" | "busy" | "unreachable" | "failed";

/** The AI's answer through the "advisor" edge function, or why there is none. */
export async function askAdvisor(question: string, lang: Lang, context: unknown, history: Turn[]): Promise<{ answer: string } | { error: AskError }> {
  try {
    const { data, error } = await supabase.functions.invoke("advisor", { body: { question, lang, context, history } });
    if (error) {
      const status = error instanceof FunctionsHttpError ? (error.context as Response | undefined)?.status : undefined;
      return { error: status === 404 ? "notDeployed" : status === 401 ? "signIn" : status === 503 ? "noKey" : status === 429 ? "busy" : status ? "failed" : "unreachable" };
    }
    return data?.ok && typeof data.answer === "string" ? { answer: data.answer } : { error: "failed" };
  } catch {
    return { error: "unreachable" };
  }
}
