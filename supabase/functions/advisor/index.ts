// Supabase Edge Function "advisor": answers a trader's question about their own journal (Advisor page chat) with a free AI
// model: Google Gemini's free tier by default, through its OpenAI-compatible endpoint.
// The app sends the question, the last turns of the conversation and a compact summary of the trades (totals, breakdowns,
// the advisor's findings, recent trades; no account numbers). The function checks that the caller is a signed-in user of
// this project, then calls the model with the key kept in the project's secrets, so the key never reaches a browser.
// Setup once: secret GEMINI_API_KEY (free key from aistudio.google.com; Edge Functions > Secrets), deploy, and turn
// "Verify JWT" off (the function checks the user itself).
// Optional secrets: AI_MODEL (default gemini-3.5-flash-lite: the free model with the most requests a day), and AI_BASE_URL +
// AI_API_KEY for any other OpenAI-compatible provider (e.g. https://api.groq.com/openai/v1 or https://openrouter.ai/api/v1).
// Every header the Supabase SDK may send (as @supabase/supabase-js/cors), so the browser's preflight never fails.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region, x-retry-count, traceparent, tracestate, baggage", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const LANGS: Record<string, string> = { en: "English", ar: "Arabic", fr: "French" };
const system = (lang: string) => `You are the trading advisor inside Mizan, a trading journal. You answer the trader's questions about their own trading, using only the journal summary given in <journal> (JSON: totals; results by symbol, side, weekday, entry hour and month; the advisor's findings with the money they would have changed on this history; recent trades).
- Answer in ${LANGS[lang] ?? "English"}.
- Be concrete: quote numbers from the journal (money in the account currency, win rates, trade counts). Never invent data; when the journal cannot answer, say what is missing.
- Stay on the trader's own process: risk, discipline, timing, exits, habits. Do not predict markets and do not tell them to buy or sell an asset: you are not a financial advisor.
- Be short and practical: about 180 words at most, short paragraphs or "- " bullets; when the answer has several parts, give each a short "## " heading.
- End the answer with one clear next step, on its own line starting with the bold label "**Next step:**" written in ${LANGS[lang] ?? "English"}.
- These are past trades: a finding backed by fewer than 20 trades is weak evidence, say so when it matters.
- After the answer, add one last line that starts exactly with "FOLLOW-UPS:" (in English, whatever the language) followed by three short questions (at most 10 words each, in ${LANGS[lang] ?? "English"}) the trader could ask you next about their own trading, separated by " | ". Nothing after that line.`;
// The last line of the answer: three follow-up questions for the app to offer as buttons.
const FOLLOW = /(?:^|\n)[ \t*_>#-]*(?:FOLLOW-?UPS?|Follow-ups|أسئلة المتابعة|Questions de suivi)\s*\**\s*[:：]\s*\**([\s\S]*)$/;
function splitFollowups(raw: string): { answer: string; followups: string[] } {
  const m = FOLLOW.exec(raw);
  if (!m) return { answer: raw, followups: [] };
  const followups = m[1].split(/\s*\|\s*|\n+/).map((q) => q.replace(/^[\s\-*•\d.)]+/, "").replace(/\*\*/g, "").trim()).filter((q) => q && q.length <= 140).slice(0, 3);
  return { answer: raw.slice(0, m.index).trim(), followups };
}

type Turn = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const key = Deno.env.get("AI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ ok: false, error: "noKey" }, 503);
    // only signed-in users of this project: their access token must be accepted by Supabase Auth
    const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { authorization: req.headers.get("authorization") ?? "", apikey: req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
      signal: AbortSignal.timeout(10000),
    });
    if (!who.ok) return json({ ok: false, error: "signIn" }, 401);
    const { question, lang = "en", context, history } = await req.json();
    if (typeof question !== "string" || !question.trim() || question.length > 1000) return json({ ok: false, error: "bad request" }, 400);
    const journal = JSON.stringify(context ?? {});
    if (journal.length > 60000) return json({ ok: false, error: "too big" }, 413);
    // earlier turns, oldest first, starting with the user and alternating (the summary goes with the new question only)
    let turns: Turn[] = (Array.isArray(history) ? history : []).filter((m: Turn) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.length <= 4000).slice(-6);
    while (turns.length && turns[0].role !== "user") turns = turns.slice(1);
    if (turns.length && turns[turns.length - 1].role === "user") turns = turns.slice(0, -1);
    const messages = [{ role: "system", content: system(lang) }, ...turns, { role: "user", content: `<journal>${journal}</journal>\n\n${question.trim()}` }];
    const base = (Deno.env.get("AI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("AI_MODEL") || "gemini-3.5-flash-lite", messages }),
      signal: AbortSignal.timeout(60000),
    });
    const out = await r.json().catch(() => null);
    const err = Array.isArray(out) ? out[0]?.error : out?.error; // Gemini wraps some errors in a list
    if (r.status === 429) return json({ ok: false, error: "busy" }, 429); // the free daily quota is used up
    if (!r.ok) return json({ ok: false, error: err?.status ?? err?.code ?? err?.type ?? `status ${r.status}` }, 502);
    const { answer, followups } = splitFollowups(String(out?.choices?.[0]?.message?.content ?? "").trim());
    return json({ ok: !!answer, answer, followups, usage: out?.usage ?? null });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
