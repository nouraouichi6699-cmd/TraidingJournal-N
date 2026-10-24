// Supabase Edge Function "mt5-sync": receives the positions sent by the MizanSync Expert Advisor running in MetaTrader 5
// and writes them as trades of one Mizan account. The EA authenticates with the account's sync key: the app stores only its
// SHA-256 hash, in user_settings under "mt5-sync:<account id>", so the key itself is never kept anywhere.
// Trades get the same key as the MT5 report import ("<account id>:<position id>"), so importing the report later adds no
// duplicates. Closed trades already in the journal are not rewritten, and trades the user deleted stay deleted.
// An account without a starting balance gets one from MT5 (MizanSync 1.02+): the balance now minus the result of its
// trades, so the journal's balance matches MT5. A balance set by the user or by a report import is never touched.
// Setup once: deploy, and turn "Verify JWT" off (an EA has no Supabase session; the sync key is checked here).
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const WHEN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, ID = /^\d{1,20}$/;
const r2 = (x: number) => Math.round(x * 100) / 100;

type Pos = { id: string; symbol: string; type: "buy" | "sell"; volume: number; openTime: string; openPrice: number; closeTime?: string | null; closePrice?: number | null; sl?: number; tp?: number; commission?: number; swap?: number; profit?: number; status: "open" | "closed" };
const valid = (p: Pos) => !!p && ID.test(String(p.id)) && typeof p.symbol === "string" && p.symbol.length > 0 && p.symbol.length <= 40 && (p.type === "buy" || p.type === "sell")
  && Number.isFinite(p.volume) && p.volume > 0 && WHEN.test(p.openTime ?? "") && Number.isFinite(p.openPrice) && (p.status === "open" || (p.status === "closed" && WHEN.test(p.closeTime ?? "") && Number.isFinite(p.closePrice)));

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const SB = Deno.env.get("SUPABASE_URL"), SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const db = (path: string, init: RequestInit = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SR, authorization: `Bearer ${SR}`, "content-type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (token.length < 20 || token.length > 200) return json({ ok: false, error: "badToken" }, 401);
    const positions: Pos[] = Array.isArray(body.positions) ? body.positions : [];
    if (positions.length > 2000) return json({ ok: false, error: "too many positions in one request" }, 413);

    // whose key is it
    const hash = await sha256(token);
    const found = await db(`user_settings?select=user_id,key,value&key=like.mt5-sync:*&value->>hash=eq.${hash}&deleted_at=is.null&limit=1`);
    const row = found.ok ? ((await found.json()) as { user_id: string; key: string; value: Record<string, unknown> }[])[0] : undefined;
    if (!row) return json({ ok: false, error: "badToken" }, 401);
    const uid = row.user_id, accountId = row.key.slice("mt5-sync:".length);
    const acc = ((await (await db(`accounts?select=id,login,server,start_balance&id=eq.${accountId}&user_id=eq.${uid}&deleted_at=is.null`)).json()) as { id: string; login: string | null; server: string | null; start_balance: number | null }[])[0];
    if (!acc) return json({ ok: false, error: "noAccount" }, 404);
    const login = body.login == null ? "" : String(body.login).replace(/\D/g, "").slice(0, 20);
    if (acc.login && login && acc.login !== login) return json({ ok: false, error: "wrongAccount", expected: acc.login }, 409);

    const good = positions.filter(valid), now = new Date().toISOString();
    const brokerNow = typeof body.now === "string" && WHEN.test(body.now) ? body.now : null; // the EA's server time (MizanSync 1.01+)
    const closedNow: { key: string; symbol: string; side: string; pnl: number; status: string; entry_time: string; exit_time: string }[] = [];
    const keys = good.map((p) => `${accountId}:${p.id}`);
    // what the journal already has (closed trades are final; deleted ones stay deleted)
    const have = new Map<string, { status: string; deleted_at: string | null }>();
    for (let i = 0; i < keys.length; i += 150) {
      const list = keys.slice(i, i + 150).map((k) => `"${k}"`).join(",");
      const r = await db(`trades?select=key,status,deleted_at&user_id=eq.${uid}&key=in.(${encodeURIComponent(list)})`);
      if (r.ok) for (const t of (await r.json()) as { key: string; status: string; deleted_at: string | null }[]) have.set(t.key, t);
    }
    const last = ((await (await db(`trades?select=no&user_id=eq.${uid}&account_id=eq.${accountId}&order=no.desc.nullslast&limit=1`)).json()) as { no: number | null }[])[0]?.no ?? 0;
    let next = Number(last) || 0, added = 0, updated = 0, skipped = 0;
    const rows = [...good].sort((a, b) => a.openTime.localeCompare(b.openTime) || a.id.localeCompare(b.id)).flatMap((p) => {
      const key = `${accountId}:${p.id}`, old = have.get(key);
      if (old && (old.deleted_at || old.status === "closed")) { skipped++; return []; }
      old ? updated++ : added++;
      const closed = p.status === "closed", com = Number(p.commission) || 0, swap = Number(p.swap) || 0, profit = Number(p.profit) || 0;
      if (closed) closedNow.push({ key, symbol: p.symbol, side: p.type === "buy" ? "long" : "short", pnl: r2(profit + com + swap), status: "closed", entry_time: p.openTime, exit_time: p.closeTime as string });
      return [{
        user_id: uid, key, account_id: accountId, ...(old ? {} : { no: ++next }), symbol: p.symbol, side: p.type === "buy" ? "long" : "short", qty: p.volume,
        entry_time: p.openTime, entry_price: p.openPrice, exit_time: closed ? p.closeTime : null, exit_price: closed ? p.closePrice : null,
        pnl: closed ? r2(profit + com + swap) : null, return_pct: null, commission: r2(Math.abs(com)), sl: Number(p.sl) > 0 ? p.sl : null, tp: Number(p.tp) > 0 ? p.tp : null,
        status: p.status, updated_at: now,
      }];
    });
    // rows with and without "no" go in separate requests (an upsert batch must share its columns)
    for (const part of [rows.filter((r) => "no" in r), rows.filter((r) => !("no" in r))]) {
      for (let i = 0; i < part.length; i += 200) {
        const w = await db("trades?on_conflict=user_id,key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(part.slice(i, i + 200)) });
        if (!w.ok) return json({ ok: false, error: `save failed: ${(await w.text()).slice(0, 200)}` }, 500);
      }
    }
    // remember the MT5 login on the account, and when this key last synced (shown on the Import page).
    // updated_at null = the database's clock (sync_guard); the hash filter leaves a key replaced meanwhile untouched.
    if (!acc.login && login) await db(`accounts?id=eq.${accountId}&user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ login, server: typeof body.server === "string" ? body.server.slice(0, 80) : acc.server, updated_at: null }) });
    // starting balance from MT5: only on the last request of a sync (all trades written), only when unset or set by us before
    let startAuto = typeof row.value.startAuto === "number" ? row.value.startAuto : null;
    const balance = Number(body.balance), cur = Number(acc.start_balance) || 0;
    if (body.final === true && Number.isFinite(balance) && balance > 0 && (cur === 0 || (startAuto != null && Math.abs(cur - startAuto) < 0.005))) {
      let sum = 0, ok = true;
      for (let o = 0; ok; o += 1000) {
        const r = await db(`trades?select=pnl&user_id=eq.${uid}&account_id=eq.${accountId}&status=eq.closed&deleted_at=is.null&order=key.asc&limit=1000&offset=${o}`);
        if (!r.ok) { ok = false; sum = NaN; break; }
        const part = (await r.json()) as { pnl: number | null }[];
        for (const t of part) sum += Number(t.pnl) || 0;
        if (part.length < 1000) break;
      }
      const start = r2(balance - sum);
      if (Number.isFinite(start) && start > 0 && Math.abs(start - cur) >= 0.005) {
        const w = await db(`accounts?id=eq.${accountId}&user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ start_balance: start, updated_at: null }) });
        if (w.ok) startAuto = start;
      }
    }
    await db(`user_settings?user_id=eq.${uid}&key=eq.${encodeURIComponent(row.key)}&value->>hash=eq.${hash}`, { method: "PATCH", body: JSON.stringify({ value: { ...row.value, last: now, login: login || null, sent: good.length, ...(brokerNow ? { brokerNow } : {}), ...(startAuto != null ? { startAuto } : {}) }, updated_at: null }) });
    // Telegram alerts (function "telegram"), only for users who linked a chat; a missing function or bot changes nothing here.
    // Open positions without a stop loss go too (not the ones deleted from the journal): it warns once they are 2 minutes old.
    const openNoSl = good.filter((p) => p.status === "open" && !(Number(p.sl) > 0) && !have.get(`${accountId}:${p.id}`)?.deleted_at)
      .map((p) => ({ key: `${accountId}:${p.id}`, symbol: p.symbol, side: p.type === "buy" ? "long" : "short", qty: p.volume, entry_time: p.openTime }));
    // Positions first seen now (opened in the last 30 minutes): the "in your plan?" question and the danger-zone warning.
    const opened = brokerNow ? good.filter((p) => p.status === "open" && !have.has(`${accountId}:${p.id}`) && Date.parse(`${brokerNow}Z`) - Date.parse(`${p.openTime}Z`) <= 30 * 60e3)
      .map((p) => ({ key: `${accountId}:${p.id}`, symbol: p.symbol, side: p.type === "buy" ? "long" : "short", qty: p.volume, entry_time: p.openTime })) : [];
    if ((closedNow.length || openNoSl.length || opened.length) && brokerNow) {
      const linked = await db(`user_settings?select=key&user_id=eq.${uid}&key=eq.telegram&value->>chat=not.is.null&deleted_at=is.null`);
      if (linked.ok && ((await linked.json()) as unknown[]).length)
        await fetch(`${SB}/functions/v1/telegram`, { method: "POST", headers: { authorization: `Bearer ${SR}`, apikey: SR, "content-type": "application/json" }, body: JSON.stringify({ action: "sync", uid, accountId, now: brokerNow, closed: closedNow, open: openNoSl, opened }), signal: AbortSignal.timeout(8000) }).catch(() => null);
    }
    return json({ ok: true, added, updated, skipped, ignored: positions.length - good.length });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
