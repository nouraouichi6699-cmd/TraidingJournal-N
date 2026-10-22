// Supabase Edge Function "advisor": answers a trader's question about their own journal with Claude (Advisor page chat).
// The app sends the question, the last turns of the conversation and a compact summary of the trades (totals, breakdowns,
// the advisor's findings, recent trades; no account numbers). The function checks that the caller is a signed-in user of
// this project, then calls the Claude API with the key kept in the project's secrets, so the key never reaches a browser.
// Setup once: secret ANTHROPIC_API_KEY (Edge Functions > Secrets), deploy, and turn "Verify JWT" off (the function checks
// the user itself). Optional secret ADVISOR_MODEL: claude-sonnet-5-5 by default, claude-haiku-5-5 costs much less.
// Every header the Supabase SDK may send (as @supabase/supabase-js/cors), so the browser's preflight never fails.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region, x-retry-count, traceparent, tracestate, baggage", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const LANGS: Record<string, string> = { en: "English", ar: "Arabic", fr: "French" };
const system = (lang: string) => `You are the trading advisor inside Mizan, a trading journal. You answer the trader's questions about their own trading, using only the journal summary given in <journal> (JSON: totals; results by symbol, side, weekday, entry hour and month; the advisor's findings with the money they would have changed on this history; recent trades).
- Answer in ${LANGS[lang] ?? "English"}.
- Be concrete: quote numbers from the journal (money in the account currency, win rates, trade counts). Never invent data; when the journal cannot answer, say what is missing.
- Stay on the trader's own process: risk, discipline, timing, exits, habits. Do not predict markets and do not tell them to buy or sell an asset: you are not a financial advisor.
- Be short and practical: about 180 words at most, short paragraphs or "- " bullets, and end with one clear next step.
- These are past trades: a finding backed by fewer than 20 trades is weak evidence, say so when it matters.`;

type Turn = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
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
    const messages = [...turns, { role: "user", content: `<journal>${journal}</journal>\n\n${question.trim()}` }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("ADVISOR_MODEL") || "claude-sonnet-5-5", max_tokens: 800, system: system(lang), messages }),
      signal: AbortSignal.timeout(60000),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) return json({ ok: false, error: out?.error?.type ?? `status ${r.status}` }, 502);
    const answer = ((out?.content ?? []) as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
    return json({ ok: !!answer, answer, usage: out?.usage ?? null });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
