// Supabase Edge Function "market": daily price history for Reports > Benchmark & Market.
// Browsers cannot read these sites directly (CORS), so this is a narrow proxy: only Yahoo Finance's chart API and Stooq's
// CSV download (a fallback: since 2026 Stooq often answers servers with a bot check), only daily bars, only plain ticker
// characters and ISO dates. It returns the provider's raw text and the app parses it (src/lib/benchmark.ts, covered by
// tests). Deploy once: supabase functions deploy market
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SAFE = /^[A-Za-z0-9^=.\-]{1,24}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
// Yahoo rejects default library user agents; a browser one is accepted.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { provider, ticker, from, to } = await req.json();
    if (!["stooq", "yahoo"].includes(provider) || !SAFE.test(ticker ?? "") || !DATE.test(from ?? "") || !DATE.test(to ?? "")) return json({ ok: false, error: "bad request" }, 400);
    const p1 = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000), p2 = Math.floor(Date.parse(`${to}T23:59:59Z`) / 1000);
    const url = provider === "yahoo"
      ? `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.replace(/\^/g, "%5E")}?interval=1d&period1=${p1}&period2=${p2}`
      : `https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker.toLowerCase())}&i=d&d1=${from.replaceAll("-", "")}&d2=${to.replaceAll("-", "")}`;
    const get = (u: string) => fetch(u, { headers: { "User-Agent": UA, Accept: provider === "yahoo" ? "application/json,text/plain,*/*" : "text/csv,*/*" }, signal: AbortSignal.timeout(15000) });
    let r = await get(url);
    if (provider === "yahoo" && (r.status === 429 || r.status >= 500)) { // busy: wait, then the second host
      await new Promise((ok) => setTimeout(ok, 1500));
      r = await get(url.replace("://query1.", "://query2."));
    }
    const raw = await r.text();
    return json({ ok: r.ok, status: r.status, provider, raw: raw.length > 3_000_000 ? "" : raw });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
