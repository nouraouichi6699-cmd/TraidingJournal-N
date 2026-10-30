// Local test of the "mt5-sync" and "telegram" edge functions: both run in Node with an in-memory PostgREST, a fake
// Telegram API, a fake AI endpoint and a fake calendar feed. Run: npx tsx tests/functions/run.ts
import { createHash } from "node:crypto";

const REPO = new URL("../../supabase/functions", import.meta.url).href;
const SB = "https://proj.supabase.co", SR = "sr-test", TOKEN = "123:bot-token";
const ENV: Record<string, string> = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SR, SUPABASE_ANON_KEY: "anon", TELEGRAM_BOT_TOKEN: TOKEN, GEMINI_API_KEY: "gem-key" };
let fails = 0, passes = 0;
const ok = (cond: unknown, what: string) => { if (cond) passes++; else { fails++; console.log("  FAIL:", what); } };

// ---------- clock ----------
let voiceOut: unknown = { candidates: [{ content: { parts: [{ text: "Entered on the support  bounce,\nfelt calm." }] } }] };
const RealDate = Date;
let fake: number | null = null;
class FakeDate extends RealDate {
  constructor(...a: unknown[]) { if (a.length === 0 && fake != null) super(fake); else super(...(a as [])); }
  static now() { return fake ?? RealDate.now(); }
}
(globalThis as unknown as { Date: DateConstructor }).Date = FakeDate as unknown as DateConstructor;
const at = (iso: string) => { fake = RealDate.parse(iso); };

// ---------- in-memory PostgREST ----------
type Row = Record<string, any>;
const db: Record<string, Row[]> = { user_settings: [], accounts: [], trades: [], tg_state: [] };
const TS = new Set(["at", "updated_at", "synced_at", "deleted_at"]);
const val = (r: Row, k: string) => { const [path, last] = k.split("->>"), parts = path.split("->"); let v: any = r[parts[0]]; for (const q of parts.slice(1)) v = v?.[q]; if (last !== undefined) v = v?.[last]; return v === undefined ? null : v; };
function cmp(k: string, a: any, b: string) {
  if (a == null) return NaN;
  if (TS.has(k)) return RealDate.parse(a) - RealDate.parse(b);
  if (typeof a === "number") return a - Number(b);
  return String(a) < b ? -1 : String(a) > b ? 1 : 0;
}
function match(r: Row, k: string, f: string) {
  const v = val(r, k);
  if (f === "is.null") return v == null;
  if (f === "not.is.null") return v != null;
  const [op, ...rest] = f.split("."), x = rest.join(".");
  switch (op) {
    case "eq": return v != null && String(v) === x;
    case "neq": return String(v) !== x;
    case "lt": return cmp(k, v, x) < 0;
    case "lte": return cmp(k, v, x) <= 0;
    case "gt": return cmp(k, v, x) > 0;
    case "gte": return cmp(k, v, x) >= 0;
    case "like": return v != null && new RegExp(`^${x.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(String(v));
    case "in": { const list = x.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")); return list.includes(String(v)); }
  }
  throw new Error(`filter ${k}=${f}`);
}
const RES = new Set(["select", "order", "limit", "offset", "on_conflict"]);
function rest(url: URL, init: RequestInit): Response {
  const table = url.pathname.split("/").pop() as string;
  const T = db[table];
  if (!T) return new Response(JSON.stringify({ message: "no table" }), { status: 404 });
  const filters = [...url.searchParams.entries()].filter(([k]) => !RES.has(k));
  const pick = (rows: Row[]) => rows.filter((r) => filters.every(([k, f]) => match(r, k, f)));
  const method = (init.method ?? "GET").toUpperCase(), prefer = String((init.headers as Record<string, string>)?.prefer ?? "");
  if (method === "GET") {
    let out = pick(T);
    const order = url.searchParams.get("order");
    if (order) { const [c, d] = order.split("."); out = [...out].sort((a, b) => { const x = a[c], y = b[c]; if (x == null) return 1; if (y == null) return -1; const s = x < y ? -1 : x > y ? 1 : 0; return d === "desc" ? -s : s; }); }
    const off = Number(url.searchParams.get("offset") ?? 0), lim = Number(url.searchParams.get("limit") ?? 1e9);
    out = out.slice(off, off + lim);
    const sel = url.searchParams.get("select") ?? "*";
    if (sel !== "*") out = out.map((r) => Object.fromEntries(sel.split(",").map((c) => [c, r[c] ?? null])));
    return new Response(JSON.stringify(out), { status: 200 });
  }
  if (method === "POST") {
    const body = JSON.parse(String(init.body)), list: Row[] = Array.isArray(body) ? body : [body];
    const conflict = url.searchParams.get("on_conflict")?.split(",") ?? [];
    for (const x of list) {
      const old = conflict.length ? T.find((r) => conflict.every((c) => r[c] === x[c])) : undefined;
      const row = { deleted_at: null, ...x, updated_at: new Date().toISOString() };
      if (old && prefer.includes("merge-duplicates")) Object.assign(old, row);
      else T.push({ id: crypto.randomUUID(), ...row });
    }
    return new Response(prefer.includes("return=representation") ? JSON.stringify(list) : "", { status: 201 });
  }
  if (method === "PATCH") {
    const body = JSON.parse(String(init.body)), hit = pick(T);
    for (const r of hit) Object.assign(r, body, body.updated_at === null ? { updated_at: new Date().toISOString() } : {});
    return new Response(prefer.includes("return=representation") ? JSON.stringify(hit) : "", { status: 200 });
  }
  if (method === "DELETE") {
    const hit = new Set(pick(T));
    db[table] = T.filter((r) => !hit.has(r));
    return new Response("", { status: 204 });
  }
  return new Response("", { status: 405 });
}

// ---------- fake outside world ----------
type TgCall = { method: string; body: any };
const tgCalls: TgCall[] = [], aiCalls: any[] = [];
let hook: any = { url: "" };
let calEvents: any[] = [], calFetches = 0;
const handlers: ((r: Request) => Promise<Response>)[] = [];
const J = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
(globalThis as any).fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.origin === SB && url.pathname.startsWith("/rest/v1/")) {
    const auth = String((init.headers as Record<string, string>)?.authorization ?? "");
    if (auth !== `Bearer ${SR}`) return J({ message: "rls" }, 401);
    return rest(url, init);
  }
  if (url.origin === SB && url.pathname === "/auth/v1/user") {
    const a = new Headers(init.headers).get("authorization");
    return a === "Bearer user-token" ? J({ id: "u1" }) : J({ msg: "bad jwt" }, 401);
  }
  if (url.origin === SB && url.pathname === "/functions/v1/telegram") return handlers[1](new Request(url.href, { method: "POST", headers: init.headers, body: init.body }));
  if (url.hostname === "api.telegram.org") {
    const method = url.pathname.split("/").pop() as string, body = JSON.parse(String(init.body ?? "{}"));
    tgCalls.push({ method, body });
    if (method === "getMe") return J({ ok: true, result: { username: "MizanTestBot" } });
    if (method === "getWebhookInfo") return J({ ok: true, result: hook });
    if (method === "setWebhook") { hook = { url: body.url, allowed_updates: body.allowed_updates }; return J({ ok: true, result: true }); }
    if (method === "sendMessage") {
      if (body.chat_id === 999) return J({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }, 403);
      const urls = (body.reply_markup?.inline_keyboard ?? []).flat().map((b: { url: string }) => b.url);
      if (urls.some((u: string) => /localhost/.test(u))) return J({ ok: false, error_code: 400, description: "Bad Request: wrong HTTP URL" }, 400);
      return J({ ok: true, result: { message_id: tgCalls.length } });
    }
    if (method === "getFile") return J({ ok: true, result: { file_path: "voice/file_1.oga" } });
    return J({ ok: true });
  }
  if (url.hostname === "generativelanguage.googleapis.com" && url.pathname.endsWith(":generateContent")) { aiCalls.push(JSON.parse(String(init.body))); return J(voiceOut); }
  if (url.hostname === "generativelanguage.googleapis.com") { aiCalls.push(JSON.parse(String(init.body))); return J({ choices: [{ message: { content: "**Tip:** cut your Friday trades.\n\nKeep stops on every trade." } }] }); }
  if (url.hostname === "nfs.faireconomy.media") { calFetches++; return J(calEvents); }
  throw new Error(`unexpected fetch ${url.href}`);
};
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: (r: Request) => Promise<Response>) => { handlers.push(h); } };

// ---------- helpers ----------
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const KEY = "mzn_test_sync_key_1234567890";
const post = (i: number, body: unknown, headers: Record<string, string> = {}) => handlers[i](new Request("http://local/fn", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })).then((r) => r.json());
const sync = (now: string, positions: unknown[]) => post(0, { token: KEY, now, login: "12345678", server: "MetaQuotes-Demo", currency: "USD", balance: 10000, positions, final: true });
const app = (body: unknown) => post(1, body, { authorization: "Bearer user-token", apikey: "anon" });
const tick = () => post(1, { action: "tick" });
const sends = () => tgCalls.filter((c) => c.method === "sendMessage");
const lastSend = () => sends().at(-1)?.body;
const tgRow = () => db.user_settings.find((r) => r.key === "telegram" && r.user_id === "u1")!.value;
const closed = (id: string, open: string, close: string, profit: number, extra: Record<string, unknown> = {}) => ({ id, symbol: "XAUUSD", type: "buy", volume: 0.1, openTime: open, openPrice: 2400, closeTime: close, closePrice: 2401, sl: 2390, tp: 2420, commission: -0.5, swap: 0, profit, status: "closed", ...extra });
const opened = (id: string, open: string, sl = 0, extra: Record<string, unknown> = {}) => ({ id, symbol: "EURUSD", type: "sell", volume: 0.25, openTime: open, openPrice: 1.08, sl, tp: 0, status: "open", ...extra });
const unlock = () => { const r = db.tg_state.find((x) => x.id === "tick"); if (r) r.at = "1970-01-01T00:00:00Z"; };

async function main() {
  await import(`${REPO}/mt5-sync/index.ts`);
  await import(`${REPO}/telegram/index.ts`);
  const lib = await import(`${REPO}/telegram/index.ts`);
  ok(handlers.length === 2, "both functions registered");

  // ---- pure helpers ----
  ok(lib.lossStreak([{ pnl: -1 }, { pnl: -2 }, { pnl: 0 }, { pnl: -5 }]).n === 2, "streak stops at 0");
  ok(lib.lossStreak([{ pnl: null }, { pnl: -2 }]).n === 0, "streak: open/null ends it");
  ok(Math.abs(lib.lossStreak([{ pnl: -1.25 }, { pnl: -2.5 }, { pnl: 3 }]).sum - -3.75) < 0.01, "streak sum");
  ok([...lib.symCurrencies("EURUSD.m")].join() === "USD,EUR", "EURUSD.m currencies");
  ok([...lib.symCurrencies("XAUUSD")].join() === "USD", "gold -> USD");
  ok([...lib.symCurrencies("US30")].join() === "USD" && [...lib.symCurrencies("GER40")].join() === "EUR" && [...lib.symCurrencies("JP225")].join() === "JPY", "indices");
  ok([...lib.symCurrencies("FX:GBPJPY")].sort().join() === "GBP,JPY", "prefixed pair");
  ok([...lib.symCurrencies("AAPL")].length === 0, "a stock: none");
  const st = lib.tradeStats([{ symbol: "A", pnl: 10 }, { symbol: "B", pnl: -4 }, { symbol: "C", pnl: 0 }, { symbol: "D", pnl: null }]);
  ok(st.n === 3 && st.net === 6 && st.win === 33 && st.best.symbol === "A" && st.worst.symbol === "B", "trade stats");
  const lp = lib.localParts(RealDate.parse("2026-10-25T09:05:00Z"), "Africa/Tunis");
  ok(lp.date === "2026-10-25" && lp.hour === 10 && lp.wd === 0, `local parts Tunis ${JSON.stringify(lp)}`);
  const lp2 = lib.localParts(RealDate.parse("2026-10-24T23:30:00Z"), "Asia/Tokyo");
  ok(lp2.date === "2026-10-25" && lp2.hour === 8 && lp2.wd === 0, "local parts Tokyo");
  ok(lib.validTz("Africa/Tunis") === "Africa/Tunis" && lib.validTz("Mars/Base") === null && lib.validTz(5) === null, "tz check");
  ok(lib.addDays("2026-03-01", -1) === "2026-02-28" && lib.addDays("2026-12-31", 1) === "2027-01-01", "addDays");
  const hi = lib.highImpact([{ title: "NFP", country: "USD", date: "2026-10-24T08:30:00-04:00", impact: "High", forecast: "180K", previous: "150K" }, { title: "CPI", country: "EUR", date: "2026-10-24T10:00:00+01:00", impact: "Medium" }, { title: "x", country: "ALL", date: "bad", impact: "High" }]);
  ok(hi.length === 1 && hi[0].time === "2026-10-24T12:30:00.000Z" && hi[0].currency === "USD", "calendar: high impact only");
  const now0 = RealDate.parse("2026-10-24T12:15:00Z");
  ok(lib.newsDue(hi, now0, new Set(["USD"]), {}).length === 1, "news due 15 min ahead");
  ok(lib.newsDue(hi, now0 - 60 * 60e3, new Set(["USD"]), {}).length === 0, "news not 75 min ahead");
  ok(lib.newsDue(hi, RealDate.parse("2026-10-24T12:26:00Z"), new Set(["USD"]), {}).length === 0, "news not 4 min ahead");
  ok(lib.newsDue(hi, now0, new Set(["EUR"]), {}).length === 0, "news: other currency");
  ok(lib.newsDue(hi, now0, new Set(["USD"]), { [`news:2026-10-24:${hi[0].id}`]: "x" }).length === 0, "news: sent once");
  const due = lib.noSlDue([{ key: "a:1", symbol: "EURUSD", side: "long", qty: 1, entry_time: "2026-10-24T11:58" }, { key: "a:2", symbol: "EURUSD", side: "long", qty: 1, entry_time: "2026-10-24T11:59" }], RealDate.parse("2026-10-24T12:00Z"), {});
  ok(due.length === 1 && due[0].key === "a:1" && due[0].k === "nosl:2026-10-24:a:1", "no-SL after 2 minutes");
  ok(lib.brokerClock({ brokerNow: "2026-10-24T12:00", last: "2026-10-24T09:00:20.000Z" }, RealDate.parse("2026-10-24T09:00:20Z")) === RealDate.parse("2026-10-24T12:00:20Z"), "broker clock from sync");

  // ---- data ----
  db.accounts.push({ id: "acc1", user_id: "u1", name: "MT5 Demo", currency: "USD", login: "12345678", server: "MetaQuotes-Demo", start_balance: 10000, deleted_at: null });
  db.user_settings.push({ user_id: "u1", key: "mt5-sync:acc1", value: { hash: sha(KEY), created: "2026-10-01T00:00:00Z" }, deleted_at: null });
  db.user_settings.push({ user_id: "u1", key: "mizan-profile", value: { name: "Nour", timezone: "Africa/Tunis" }, deleted_at: null });
  db.user_settings.push({ user_id: "u1", key: "telegram", value: { chat: 555, name: "Nour", lang: "en", site: "https://nour.github.io/Mizan/", tz: "Africa/Tunis", sent: {} }, deleted_at: null });
  db.user_settings.push({ user_id: "u1", key: "mizan-challenges", value: [{ id: "ch1", accountId: "acc1", name: "FTMO 10k", start: "2026-10-01", size: 10000, target: 10, daily: 5, dailyBase: "size", max: 10, trailing: false, minDays: 4 }], deleted_at: null });

  // ---- 1. first sync: 3 recent losses, an old win, open trades with / without SL ----
  console.log("1. first sync");
  at("2026-10-24T09:00:20Z"); // broker 12:00 (UTC+3)
  let r = await sync("2026-10-24T12:00", [
    closed("900", "2026-10-22T09:00", "2026-10-22T10:00", 120),
    closed("901", "2026-10-24T09:30", "2026-10-24T10:00", -100),
    closed("902", "2026-10-24T10:10", "2026-10-24T10:40", -80),
    closed("903", "2026-10-24T11:00", "2026-10-24T11:30", -120),
    opened("950", "2026-10-24T11:50"),            // no SL for 10 min -> warn
    opened("951", "2026-10-24T11:59"),            // no SL for 1 min -> not yet
    opened("952", "2026-10-24T11:40", 1.085),     // has a SL
  ]);
  ok(r.ok && r.added === 7, `sync saved ${JSON.stringify(r)}`);
  const first = sends(), entries1 = first.filter((c) => c.body.text.startsWith("📥"));
  let m = first.find((c) => c.body.text.startsWith("📊"))?.body;
  ok(first.length === 4 && m?.chat_id === 555 && entries1.length === 3 && entries1.every((c) => !/Danger/.test(c.body.text)), `one trade message + 3 new-trade questions (${first.length})`);
  const c1 = first.length;
  console.log(m?.text.split("\n").map((l: string) => "   | " + l).join("\n"));
  ok(/🔴 XAUUSD long -100\.50\$/.test(m.text) && !/900|\+119\.50/.test(m.text), "recent closes only, with cents");
  ok(/3 losses in a row \(-302\$\)/.test(m.text), "streak alert with the run's total");
  ok(/EURUSD short 0\.25 has no stop loss \(open since 11:50\)/.test(m.text) && !/11:59/.test(m.text), "no-SL only after 2 minutes");
  const kb = m.reply_markup?.inline_keyboard ?? [];
  ok(kb.length === 3 && kb[0][0].url === "https://nour.github.io/Mizan/?trade=acc1%3A901" && /📝 Note · XAUUSD -100\.50\$/.test(kb[0][0].text), `note buttons ${JSON.stringify(kb[0])}`);
  ok(/half of today's loss limit/.test(m.text) || /loss limit/.test(m.text), "prop rule warnings still sent");
  let sent = tgRow().sent;
  ok(Object.keys(sent).some((k) => k === "streak:2026-10-24:acc1:903") && sent["nosl:2026-10-24:acc1:950"], `sent keys ${Object.keys(sent).join(" ")}`);

  // ---- 2. heartbeat 3 minutes later: same positions -> only the second no-SL ----
  console.log("2. heartbeat");
  at("2026-10-24T09:03:20Z");
  r = await sync("2026-10-24T12:03", [closed("903", "2026-10-24T11:00", "2026-10-24T11:30", -120), opened("950", "2026-10-24T11:50"), opened("951", "2026-10-24T11:59"), opened("952", "2026-10-24T11:40", 1.085)]);
  m = lastSend();
  ok(sends().length === c1 + 1 && /11:59/.test(m.text) && !/11:50/.test(m.text) && !/in a row/.test(m.text) && !m.reply_markup, `only the new no-SL: ${m?.text}`);

  // ---- 3. a 4th loss closes -> streak 4; then a win -> no streak ----
  console.log("3. 4th loss, then a win");
  at("2026-10-24T09:10:20Z");
  await sync("2026-10-24T12:10", [closed("904", "2026-10-24T12:01", "2026-10-24T12:09", -40), opened("950", "2026-10-24T11:50")]);
  m = lastSend();
  ok(/4 losses in a row \(-342\$\)/.test(m.text), `streak 4: ${m.text}`);
  at("2026-10-24T09:20:20Z");
  await sync("2026-10-24T12:20", [closed("905", "2026-10-24T12:11", "2026-10-24T12:19", 60), opened("950", "2026-10-24T11:50")]);
  m = lastSend();
  ok(/🟢 XAUUSD long \+59\.50\$/.test(m.text) && !/in a row/.test(m.text), "a win ends the run");
  const before = sends().length;
  at("2026-10-24T09:25:20Z");
  await sync("2026-10-24T12:25", [opened("950", "2026-10-24T11:50")]);
  ok(sends().length === before, "nothing new -> no message");

  // ---- 4. a localhost address: buttons refused -> sent again without them ----
  console.log("4. button fallback");
  tgRow().site = "http://localhost:5173/";
  at("2026-10-24T09:30:20Z");
  await sync("2026-10-24T12:30", [closed("906", "2026-10-24T12:21", "2026-10-24T12:29", 10)]);
  const two = sends().slice(-2);
  ok(two[0].body.reply_markup && !two[1].body.reply_markup && two[1].body.text === two[0].body.text, "retried without buttons");
  tgRow().site = "https://nour.github.io/Mizan/";

  // ---- 5. prefs off -> no streak / no-SL ----
  console.log("5. prefs");
  r = await app({ action: "prefs", lang: "en", prefs: { trades: true, rules: true, streak: false, nosl: false, stale: true, daily: true, weekly: true, news: true } });
  ok(r.ok && r.prefs.streak === false && r.prefs.news === true && Object.keys(r.prefs).length === 12, `prefs saved ${JSON.stringify(r.prefs)}`);
  at("2026-10-24T09:40:20Z");
  await sync("2026-10-24T12:40", [closed("907", "2026-10-24T12:31", "2026-10-24T12:35", -5), closed("908", "2026-10-24T12:36", "2026-10-24T12:38", -5), closed("909", "2026-10-24T12:38", "2026-10-24T12:39", -5), opened("960", "2026-10-24T12:30")]);
  m = lastSend();
  ok(!/in a row|no stop loss/.test(m.text), "streak and no-SL off");
  await app({ action: "prefs", lang: "en", prefs: {} });
  ok(Object.values(tgRow().prefs).every((v) => v === true), "empty prefs = all on");

  // ---- 6. info saves the site and time zone ----
  console.log("6. info");
  r = await app({ action: "info", lang: "en", site: "https://nour.github.io/Mizan/", tz: "Europe/Paris" });
  ok(r.ok && r.bot === "MizanTestBot" && tgRow().tz === "Europe/Paris" && tgRow().lang === "en", "info stores tz + lang");
  r = await app({ action: "info", lang: "en", site: "javascript:alert(1)", tz: "Nope/Zone" });
  ok(tgRow().site === "https://nour.github.io/Mizan/" && tgRow().tz === "Europe/Paris", "bad site / tz ignored");

  // ---- 7. tick: lock ----
  console.log("7. tick");
  r = await tick();
  ok(r.skipped === true, "no tg_state row -> skipped (migration not run)");
  db.tg_state.push({ id: "tick", at: "1970-01-01T00:00:00Z", value: null }, { id: "calendar", at: "1970-01-01T00:00:00Z", value: null });
  r = await tick();
  ok(r.ok && r.users === 1 && !r.skipped, `tick ran ${JSON.stringify(r)}`);
  r = await tick();
  ok(r.skipped === true, "second tick within 4 minutes -> skipped");

  // ---- 8. tick: MT5 silent for 2 hours with open trades ----
  console.log("8. stale");
  unlock();
  at("2026-10-24T11:45:00Z");
  let n0 = sends().length;
  r = await tick();
  m = lastSend();
  ok(sends().length === n0 + 1 && /no sync from MT5 since 10:40, with open trades \(4\)/.test(m.text), `stale: ${m?.text}`);
  unlock(); at("2026-10-24T11:55:00Z"); n0 = sends().length;
  await tick();
  ok(sends().length === n0, "stale sent once");

  // ---- 9. tick: no-SL check from the database when the sync is fresh ----
  console.log("9. no-SL from the tick");
  at("2026-10-24T12:00:20Z");
  await sync("2026-10-24T15:00", [opened("970", "2026-10-24T14:59"), opened("950", "2026-10-24T11:50")]); // 970: 1 min old
  const n1 = sends().length;
  unlock(); at("2026-10-24T12:04:00Z");
  await tick();
  m = lastSend();
  ok(sends().length === n1 + 1 && /open since 14:59/.test(m.text), `tick no-SL: ${m?.text}`);

  // ---- 10. tick: day summary just after the broker's midnight ----
  console.log("10. day summary");
  unlock(); at("2026-10-24T21:30:00Z"); // broker 00:30 (UTC+3) on the 25th
  db.user_settings.find((x) => x.key === "mt5-sync:acc1")!.value.last = "2026-10-24T21:29:00.000Z";
  db.user_settings.find((x) => x.key === "mt5-sync:acc1")!.value.brokerNow = "2026-10-25T00:29";
  n0 = sends().length;
  await tick();
  const day = sends().slice(n0).map((c) => c.body.text).find((t: string) => /Day summary/.test(t));
  console.log(String(day).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!day && /Sat,? (Oct 24|24 Oct)/.test(day) && /MT5 Demo: -290\$ · 9 trades · win rate 22%/.test(day) && /Best XAUUSD \+59\.50\$ · Worst XAUUSD -120\.50\$/.test(day), "day summary content");
  unlock(); at("2026-10-24T21:40:00Z"); n0 = sends().length;
  await tick();
  ok(!sends().slice(n0).some((c) => /Day summary/.test(c.body.text)), "day summary once");
  unlock(); at("2026-10-25T03:30:00Z"); // broker 06:30: out of the window, nothing for the 25th yet
  n0 = sends().length; await tick();
  ok(!sends().slice(n0).some((c) => /Day summary/.test(c.body.text)), "no day summary outside the window");

  // ---- 11. tick: the week on Sunday from 10:00 (Tunis), AI tip without account names / numbers ----
  console.log("11. week summary");
  unlock(); at("2026-10-25T08:30:00Z"); // 09:30 Tunis
  n0 = sends().length; await tick();
  ok(!sends().slice(n0).some((c) => /Your week/.test(c.body.text)), "not before 10:00");
  unlock(); at("2026-10-25T09:05:00Z"); // 10:05 Tunis
  n0 = sends().length; await tick();
  const wk = sends().slice(n0).map((c) => c.body.text).find((t: string) => /Your week/.test(t));
  console.log(String(wk).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!wk && /💡 Tip: cut your Friday trades\. Keep stops on every trade\./.test(wk), "week summary with a cleaned tip");
  const ai = JSON.stringify(aiCalls.at(-1));
  ok(aiCalls.length === 1 && !/MT5 Demo|12345678|acc1|u1/.test(ai) && /bySymbol/.test(ai), "AI gets no account name / number");
  unlock(); at("2026-10-25T09:15:00Z"); n0 = sends().length; await tick();
  ok(!sends().slice(n0).some((c) => /Your week/.test(c.body.text)) && aiCalls.length === 1, "week summary once");

  // ---- 12. tick: news 15 minutes ahead, USD only (the user trades gold and euro) ----
  console.log("12. news");
  calEvents = [
    { title: "Non-Farm Employment Change", country: "USD", date: "2026-10-26T08:30:00-04:00", impact: "High", forecast: "180K", previous: "150K" },
    { title: "Rate decision", country: "JPY", date: "2026-10-26T12:30:00Z", impact: "High" },
    { title: "Retail Sales", country: "USD", date: "2026-10-26T13:30:00Z", impact: "Medium" },
    { title: "CPI", country: "EUR", date: "2026-10-26T14:00:00Z", impact: "High", forecast: "", previous: "2.1%" },
  ];
  unlock(); at("2026-10-26T12:15:00Z"); calFetches = 0;
  n0 = sends().length; await tick();
  const nw = sends().slice(n0).map((c) => c.body.text).find((t: string) => /High-impact news/.test(t));
  console.log(String(nw).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!nw && /in 15 min/.test(nw) && /USD · Non-Farm Employment Change \(forecast 180K · previous 150K\)/.test(nw) && !/JPY/.test(nw), "news content");
  ok(/^📰.*\n1[34]:30 · USD/.test(nw), "news time in the user's zone (Paris)");
  unlock(); at("2026-10-26T12:20:00Z"); n0 = sends().length; await tick();
  ok(!sends().slice(n0).some((c) => /Non-Farm/.test(c.body.text)), "news once");
  unlock(); at("2026-10-26T13:47:00Z"); n0 = sends().length; await tick();
  ok(sends().slice(n0).some((c) => /EUR · CPI \(forecast — · previous 2\.1%\)/.test(c.body.text)), "EUR news for EURUSD");
  ok(calFetches === 2, `calendar read again only after an hour (${calFetches})`);

  // ---- 13. blocked bot -> unlinked ----
  console.log("13. blocked");
  tgRow().chat = 999; tgRow().sent = {};
  db.user_settings.find((x) => x.key === "mt5-sync:acc1")!.value.last = "2026-10-26T10:00:00.000Z";
  unlock(); at("2026-10-26T13:00:00Z");
  await tick();
  ok(tgRow().chat === null, "403 -> chat unlinked");


  // ---- 14. webhook: set again so button taps arrive ----
  console.log("14. webhook");
  hook = { url: `${SB}/functions/v1/telegram`, allowed_updates: ["message"] };
  let sets = tgCalls.filter((c) => c.method === "setWebhook").length;
  unlock(); at("2026-10-26T13:10:00Z"); await tick();
  const set = tgCalls.filter((c) => c.method === "setWebhook");
  ok(set.length === sets + 1 && set.at(-1)!.body.allowed_updates.includes("callback_query") && set.at(-1)!.body.drop_pending_updates === false, "webhook updated for button taps, pending kept");
  sets = set.length; unlock(); at("2026-10-26T13:20:00Z"); await tick();
  ok(tgCalls.filter((c) => c.method === "setWebhook").length === sets, "not set again");

  // ---- 15. a new trade: plan question + danger zone from the trader's own history ----
  console.log("15. new trade");
  tgRow().chat = 555; tgRow().sent = {};
  for (let i = 0; i < 9; i++) db.trades.push({ id: `h${i}`, user_id: "u1", key: `acc1:h${i}`, account_id: "acc1", symbol: "XAUUSD", side: "long", qty: 0.1, entry_time: `2026-10-${String(10 + i).padStart(2, "0")}T22:10`, exit_time: `2026-10-${String(10 + i).padStart(2, "0")}T22:40`, pnl: i < 7 ? -40 : 30, status: "closed", deleted_at: null });
  at("2026-10-26T19:06:20Z"); // broker 22:06
  db.user_settings.find((x) => x.key === "mt5-sync:acc1")!.value.last = "2026-10-26T19:00:00.000Z";
  n0 = sends().length;
  await sync("2026-10-26T22:06", [opened("980", "2026-10-26T22:05", 0, { symbol: "XAUUSD", type: "buy", volume: 0.1 }), opened("981", "2026-10-26T19:30", 1.07)]);
  const ent = sends().slice(n0);
  console.log(ent.map((c) => c.body.text).join("\n---\n").split("\n").map((l: string) => "   | " + l).join("\n"));
  ok(ent.length === 1, `one entry message (${ent.length})`);
  const e0 = ent[0]?.body;
  ok(/📥 MT5 Demo: new trade XAUUSD long 0\.1 \(22:05\)/.test(e0?.text) && /Danger zone: your trades on XAUUSD between 22:00 and 23:00 lost 7 of 9 \(-220\$\)/.test(e0?.text) && /Is it in your plan\?$/.test(e0?.text), "entry text");
  const row0 = e0?.reply_markup?.inline_keyboard?.[0] ?? [];
  ok(row0.length === 2 && row0[0].callback_data === "p1:acc1:980" && row0[1].callback_data === "p0:acc1:980", `plan buttons ${JSON.stringify(row0)}`);
  ok(!!tgRow().sent["entry:2026-10-26:acc1:980"], "entry remembered");
  n0 = sends().length;
  await sync("2026-10-26T22:07", [opened("980", "2026-10-26T22:05", 2390, { symbol: "XAUUSD", type: "buy", volume: 0.1 })]);
  ok(sends().length === n0, "no second entry message");

  // ---- 16. button taps ----
  console.log("16. taps");
  const secret = createHash("sha256").update(`mizan-webhook:${TOKEN}`).digest("hex").slice(0, 48);
  const tap = (chat: number, data: string, h = secret) => handlers[1](new Request("http://local/fn", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": h }, body: JSON.stringify({ update_id: 1, callback_query: { id: "cb", data, from: { id: chat }, message: { message_id: 77, chat: { id: chat, type: "private" } } } }) }));
  const plan = () => db.user_settings.find((x) => x.key === "mizan-trade-plan" && x.user_id === "u1")?.value;
  await tap(555, "p0:acc1:980");
  ok(plan()?.["acc1:980"] === false, "outside the plan saved");
  let ed = tgCalls.filter((c) => c.method === "editMessageReplyMarkup").at(-1)?.body, an = tgCalls.filter((c) => c.method === "answerCallbackQuery").at(-1)?.body;
  ok(ed?.message_id === 77 && /^● ❌/.test(ed.reply_markup.inline_keyboard[0][1].text) && !/●/.test(ed.reply_markup.inline_keyboard[0][0].text) && an?.text === "Saved ✓", "buttons show the choice");
  await tap(555, "p1:acc1:980");
  ok(plan()?.["acc1:980"] === true, "changed to in the plan");
  db.trades.push({ id: "x2", user_id: "u2", key: "acc2:1", account_id: "acc2", symbol: "EURUSD", side: "long", status: "closed", deleted_at: null });
  await tap(555, "p1:acc2:1");
  ok(!("acc2:1" in plan()), "someone else's trade: not saved");
  const nAns = tgCalls.filter((c) => c.method === "answerCallbackQuery").length;
  await tap(777, "p1:acc1:980");
  an = tgCalls.filter((c) => c.method === "answerCallbackQuery").at(-1)?.body;
  ok(tgCalls.filter((c) => c.method === "answerCallbackQuery").length === nAns + 1 && an.text === undefined, "unknown chat: answered, nothing saved");
  const bad = await tap(555, "p0:acc1:980", "wrong");
  ok(bad.status === 401 && plan()?.["acc1:980"] === true, "wrong secret refused");

  // ---- 16b. voice notes ----
  console.log("16b. voice notes");
  const voice = (chat: number, reply: unknown, extra: Record<string, unknown> = {}) => handlers[1](new Request("http://local/fn", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 9, message: { message_id: 50, chat: { id: chat, type: "private" }, from: { id: chat }, voice: { file_id: "F1", duration: 12, mime_type: "audio/ogg", file_size: 30000, ...extra }, ...(reply ? { reply_to_message: reply } : {}) } }) }));
  const planMsg = (k: string) => ({ message_id: 77, reply_markup: { inline_keyboard: [[{ text: "✅ In my plan", callback_data: `p1:${k}` }, { text: "❌ Outside my plan", callback_data: `p0:${k}` }]] } });
  const vrow = () => db.user_settings.find((x) => x.key === "mizan-trade-voice" && x.user_id === "u1")?.value;
  const nAi = aiCalls.length;
  await voice(555, planMsg("acc1:980"));
  ok(vrow()?.["acc1:980"]?.[0]?.t === "Entered on the support bounce, felt calm." && vrow()["acc1:980"][0].d === 12, "voice note saved with the trade");
  ok(aiCalls.length === nAi + 1 && aiCalls.at(-1).contents[0].parts[1].inline_data.mime_type === "audio/ogg" && tgCalls.some((c) => c.method === "getFile"), "audio fetched and sent to the AI");
  ok(/🎙️/.test(lastSend().text) && /XAUUSD/.test(lastSend().text) && /support bounce/.test(lastSend().text), "trader told, with the text");
  await voice(555, { message_id: 78, reply_markup: { inline_keyboard: [[{ text: "📝 Note", url: "https://mizan.app/?trade=acc1%3A980" }]] } });
  ok(vrow()["acc1:980"].length === 2, "a note button names the trade too; second note kept");
  await voice(555, null);
  ok(/reply to that trade's message/.test(lastSend().text), "not a reply: how to do it");
  await voice(555, { message_id: 79, reply_markup: { inline_keyboard: [[{ text: "📝", url: "https://mizan.app/?trade=acc1%3A980" }], [{ text: "📝", url: "https://mizan.app/?trade=acc1%3A981" }]] } });
  ok(/several trades/.test(lastSend().text), "several trades: ask which");
  await voice(555, planMsg("acc1:980"), { duration: 200 });
  ok(/3 minutes/.test(lastSend().text) && vrow()["acc1:980"].length === 2, "too long: refused");
  await voice(555, planMsg("acc2:1"));
  ok(/reply to that trade's message/.test(lastSend().text) && !vrow()["acc2:1"], "someone else's trade: not saved");
  voiceOut = { candidates: [] };
  await voice(555, planMsg("acc1:980"));
  ok(/couldn't turn/.test(lastSend().text) && vrow()["acc1:980"].length === 2, "no text: told, nothing saved");
  voiceOut = { candidates: [{ content: { parts: [{ text: "ok" }] } }] };
  const nS = sends().length;
  await voice(777, planMsg("acc1:980"));
  ok(sends().length === nS + 1 && !/🎙️/.test(lastSend().text), "unknown chat: no voice handling");

  // ---- 17. prefs: question off (warning only), then both off ----
  console.log("17. entry prefs");
  await app({ action: "prefs", lang: "en", prefs: { entry: false } });
  at("2026-10-26T19:16:20Z"); n0 = sends().length;
  await sync("2026-10-26T22:16", [opened("982", "2026-10-26T22:15", 2380, { symbol: "XAUUSD", type: "buy", volume: 0.2 })]);
  let e1 = sends().slice(n0)[0]?.body;
  ok(e1 && /Danger zone/.test(e1.text) && !/plan\?/.test(e1.text) && !e1.reply_markup, "warning only, no buttons");
  await app({ action: "prefs", lang: "en", prefs: { entry: false, danger: false } });
  at("2026-10-26T19:26:20Z"); n0 = sends().length;
  await sync("2026-10-26T22:26", [opened("983", "2026-10-26T22:25", 2380, { symbol: "XAUUSD", type: "buy", volume: 0.2 })]);
  ok(sends().length === n0, "both off: no message");
  await app({ action: "prefs", lang: "en", prefs: {} });
  at("2026-10-26T20:36:20Z"); n0 = sends().length; // 23:35: no history at that hour
  await sync("2026-10-26T23:36", [opened("984", "2026-10-26T23:35", 2380, { symbol: "EURUSD", type: "sell", volume: 0.3 })]);
  e1 = sends().slice(n0)[0]?.body;
  ok(e1 && !/Danger zone/.test(e1.text) && /plan\?/.test(e1.text), "no matching pattern: question only");

  // ---- 18. the plan in the week summary and the AI facts ----
  console.log("18. plan in the week");
  db.user_settings.find((x) => x.key === "mizan-trade-plan")!.value = { "acc1:905": true, "acc1:901": false, "acc1:902": false };
  tgRow().sent = {};
  unlock(); at("2026-10-25T09:05:00Z"); n0 = sends().length; await tick();
  const wk2 = sends().slice(n0).map((c) => c.body.text).find((t: string) => /Your week/.test(t));
  console.log(String(wk2).split("\n").map((l) => "   | " + l).join("\n"));
  ok(/📋 In your plan: 1 trade \+60\$ · outside it: 2 trades -181\$/.test(String(wk2)), "plan line in the week");
  const f = JSON.parse(aiCalls.at(-1).messages[1].content)[0];
  ok(f.inThePlan.trades === 1 && Math.abs(f.inThePlan.net - 59.5) < 0.01 && f.outsideThePlan.trades === 2 && Math.abs(f.outsideThePlan.net - -181) < 0.01, "plan in the AI facts");

  // ---- 19. danger rules ----
  const dd = (base: string, n: number) => new RealDate(RealDate.parse(`${base}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  // n trades, the first `lost` of them lost; one per day from `base` (every `step` days), at `hm`
  const H = (n: number, lost: number, pnl: number, hm = "22:10", sym = "XAUUSD", sd = "long", base = "2026-10-01", step = 1) =>
    Array.from({ length: n }, (_, i) => ({ symbol: sym, side: sd, pnl: i < lost ? -Math.abs(pnl) : Math.abs(pnl), entry_time: `${dd(base, i * step)}T${hm}` }));
  const X = { symbol: "XAUUSD", side: "long", entry_time: "2026-10-27T22:30" };
  ok(lib.dangerOf(X, H(5, 5, 10)) === null, "fewer than 6 trades: no warning");
  ok(lib.dangerOf(X, H(6, 4, 10))?.kind === "symHour", "4 of 6 lost over 6 days: warning");
  ok(lib.dangerOf(X, H(6, 3, 10)) === null, "half lost: no warning");
  ok(lib.dangerOf(X, H(6, 4, 30).map((t, i) => (i === 5 ? { ...t, pnl: 500 } : t))) === null, "net positive: no warning");
  ok(lib.dangerOf(X, H(6, 6, 10).map((t, i) => ({ ...t, entry_time: `2026-10-0${1 + (i % 2)}T22:10` }))) === null, "all on 2 days: no pattern");
  ok(lib.dangerOf(X, H(6, 6, 10).map((t, i) => ({ ...t, entry_time: `2026-10-0${1 + (i % 3)}T22:10` })))?.kind === "symHour", "over 3 days: pattern");
  const mix = [...H(6, 4, 10, "09:00", "XAUUSD", "long", "2026-10-01"), ...H(6, 6, 10, "09:00", "EURUSD", "long", "2026-10-08")];
  ok(lib.dangerOf({ symbol: "GBPUSD", side: "short", entry_time: "2026-10-28T09:15" }, mix)?.kind === "hour", "same hour, other symbols");
  const tue = H(6, 5, 10, "10:00", "USDJPY", "long", "2026-09-01", 7).map((t, i) => ({ ...t, entry_time: t.entry_time.replace("T10", `T${10 + i}`) })); // 6 Tuesdays, 6 hours
  ok(lib.dangerOf({ symbol: "GBPUSD", side: "short", entry_time: "2026-10-20T15:15" }, tue)?.kind === "day", "same weekday (Tuesday)");
  const sideOnly = [...H(6, 5, 10, "08:00", "XAUUSD", "short", "2026-10-01"), ...H(6, 0, 10, "08:00", "XAUUSD", "long", "2026-10-01")].map((t, i) => ({ ...t, entry_time: t.entry_time.replace("T08", `T${String(8 + (i % 6)).padStart(2, "0")}`) }));
  ok(lib.dangerOf({ symbol: "XAUUSD", side: "short", entry_time: "2026-10-28T20:00" }, sideOnly)?.kind === "sideSym", "only the short side is bad");
  ok(lib.dangerOf({ symbol: "XAUUSD", side: "long", entry_time: "2026-10-28T20:00" }, sideOnly) === null, "the long side is fine");


  // ---- 20. partner: invite, self, expiry, accept ----
  console.log("20. partner invite");
  const to = (chat: number) => sends().filter((c) => c.body.chat_id === chat);
  const say = (chat: number, text: string, from: Record<string, unknown> = {}) => handlers[1](new Request("http://local/fn", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 2, message: { message_id: 5, text, chat: { id: chat, type: "private" }, from: { id: chat, first_name: "Sami", language_code: "ar", ...from } } }) }));
  const press = (chat: number, data: string) => handlers[1](new Request("http://local/fn", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 3, callback_query: { id: "cb2", data, from: { id: chat, first_name: "Sami", language_code: "ar" }, message: { message_id: 90, chat: { id: chat, type: "private" } } } }) }));
  const newInvite = async () => { const r = await app({ action: "partnerInvite", lang: "en" }); return String(r.url ?? "").match(/start=partner_([A-Za-z0-9_-]+)$/)?.[1] ?? ""; };
  let code = await newInvite();
  ok(code.length === 24, `invite link (${code})`);
  await say(555, `/start partner_${code}`, { language_code: "en" });
  ok(/can't be your own partner/.test(to(555).at(-1)!.body.text), "own link refused");
  await say(888, `/start partner_${code}`);
  let pmsg = to(888).at(-1)!.body;
  ok(/^🤝 Nour يدعوك لتكون شريك الالتزام/.test(pmsg.text) && /دون أي مبالغ/.test(pmsg.text) && pmsg.reply_markup.inline_keyboard[0][0].callback_data === `pa:${code}` && pmsg.reply_markup.inline_keyboard[0][1].callback_data === `pd:${code}`, "invite shown to the partner in Arabic, with both buttons");
  const at0 = tgRow().pcodeAt; tgRow().pcodeAt = new Date(Date.now() - 8 * 864e5).toISOString(); // the fake clock, as the function sees it
  await say(888, `/start partner_${code}`);
  ok(/انتهت صلاحية هذه الدعوة/.test(to(888).at(-1)!.body.text), "old invite: expired");
  tgRow().pcodeAt = new Date().toISOString();
  await press(888, `pa:${code}`);
  ok(tgRow().partner?.chat === 888 && tgRow().partner?.name === "Sami" && tgRow().partner?.lang === "ar" && !tgRow().pcodeHash, `partner saved ${JSON.stringify(tgRow().partner)}`);
  ok(/^تم ✓ أصبحت شريك الالتزام لـ Nour/.test(to(888).at(-1)!.body.text) && /^🤝 Sami accepted/.test(to(555).at(-1)!.body.text), "both told");
  await say(888, `/start partner_${code}`);
  ok(/انتهت صلاحية/.test(to(888).at(-1)!.body.text), "the link works once");
  r = await app({ action: "info", lang: "en" });
  ok(r.partner?.name === "Sami", "the app sees the partner");
  await say(888, "hello");
  ok(/أنت شريك الالتزام لـ: Nour/.test(to(888).at(-1)!.body.text), "partner help");

  // ---- 21. rule breaks: no stop loss, trading on after 3 losses, a trade after the daily limit ----
  console.log("21. rule breaks");
  tgRow().sent = {};
  at("2026-10-27T07:00:20Z"); // broker 10:00
  let p0 = to(888).length, t0 = to(555).length;
  await sync("2026-10-27T10:00", [opened("990", "2026-10-27T09:57")]); // no SL for 3 minutes
  let pm = to(888).slice(p0).map((c) => c.body.text);
  console.log(pm.map((l: string) => "   | " + l).join("\n"));
  ok(pm.length === 1 && /^🤝 Nour كسر قاعدة: صفقة بلا وقف خسارة \(EURUSD، 09:57\)\. رسالة قصيرة منك قد تساعده\.$/.test(pm[0]) && !/\$|10000|12345678|MT5 Demo/.test(pm[0]), "partner: no stop loss, no amounts or account");
  ok(to(555).slice(t0).some((c) => /^🤝 Your partner Sami was told: a trade without a stop loss\.$/.test(c.body.text)), "trader told");
  p0 = to(888).length;
  await sync("2026-10-27T10:05", [opened("990", "2026-10-27T09:57"), opened("996", "2026-10-27T10:01")]);
  ok(to(888).length === p0, "one no-stop-loss message a day");
  at("2026-10-27T08:00:20Z"); // 11:00: three losses, past the 500$ daily limit
  await sync("2026-10-27T11:00", [closed("991", "2026-10-27T10:10", "2026-10-27T10:20", -200), closed("992", "2026-10-27T10:21", "2026-10-27T10:30", -200), closed("993", "2026-10-27T10:31", "2026-10-27T10:50", -200), opened("990", "2026-10-27T09:57", 1.09), opened("996", "2026-10-27T10:01", 1.09)]);
  p0 = to(888).length; t0 = to(555).length;
  at("2026-10-27T08:05:20Z");
  await sync("2026-10-27T11:05", [opened("994", "2026-10-27T11:04", 2390, { symbol: "XAUUSD", type: "buy" }), opened("990", "2026-10-27T09:57", 1.09), opened("996", "2026-10-27T10:01", 1.09)]);
  pm = to(888).slice(p0).map((c) => c.body.text);
  console.log(pm.map((l: string) => "   | " + l).join("\n"));
  ok(pm.length === 2 && pm.some((x) => /مواصلة التداول بعد 3 خسائر متتالية \(XAUUSD، 11:04\)/.test(x)) && pm.some((x) => /صفقة جديدة بعد بلوغ حد الخسارة اليومي \(XAUUSD، 11:04\)/.test(x)), "partner: streak and daily limit");
  ok(to(555).slice(t0).filter((c) => /^🤝 Your partner Sami was told/.test(c.body.text)).length === 2, "trader told twice");
  p0 = to(888).length;
  at("2026-10-27T08:10:20Z");
  await sync("2026-10-27T11:10", [opened("995", "2026-10-27T11:09", 2390, { symbol: "XAUUSD", type: "buy" })]);
  ok(to(888).length === p0, "each rule once a day");

  // ---- 22. the tick tells the partner too (the trader's own no-SL alert off) ----
  console.log("22. tick");
  await app({ action: "prefs", lang: "en", prefs: { nosl: false } });
  db.trades.push({ id: "t997", user_id: "u1", key: "acc1:997", account_id: "acc1", symbol: "GBPUSD", side: "short", qty: 0.5, entry_time: "2026-10-28T09:50", status: "open", sl: null, deleted_at: null });
  db.user_settings.find((x) => x.key === "mt5-sync:acc1")!.value.last = "2026-10-28T06:55:00.000Z";
  db.user_settings.find((x) => x.key === "mt5-sync:acc1")!.value.brokerNow = "2026-10-28T09:55";
  unlock(); at("2026-10-28T07:00:00Z"); p0 = to(888).length; t0 = to(555).length;
  await tick();
  ok(to(888).slice(p0).some((c) => /صفقة بلا وقف خسارة \(GBPUSD، 09:50\)/.test(c.body.text)) && !to(555).slice(t0).some((c) => /has no stop loss/.test(c.body.text)) && to(555).slice(t0).some((c) => /was told/.test(c.body.text)), "tick: partner told, trader's own alert off");
  await app({ action: "prefs", lang: "en", prefs: {} });

  // ---- 23. /leave, app removal, decline, blocked partner, /stop ----
  console.log("23. ending");
  await say(888, "/leave");
  ok(!tgRow().partner && /^لم تعد شريك الالتزام لـ: Nour/.test(to(888).at(-1)!.body.text) && /^Sami stopped being your accountability partner/.test(to(555).at(-1)!.body.text), "/leave");
  await say(888, "hello");
  ok(/not linked to Mizan|غير مربوطة/.test(to(888).at(-1)!.body.text), "after /leave: a stranger again");
  code = await newInvite(); await press(888, `pa:${code}`);
  r = await app({ action: "partnerRemove", lang: "en" });
  ok(r.ok && r.partner === null && !tgRow().partner && /^أنهى Nour شراكة الالتزام معك/.test(to(888).at(-1)!.body.text), "removed from the app");
  code = await newInvite(); await press(888, `pd:${code}`);
  ok(!tgRow().partner && !tgRow().pcodeHash && /لا مشكلة/.test(to(888).at(-1)!.body.text) && /^Sami declined/.test(to(555).at(-1)!.body.text), "declined");
  code = await newInvite(); await press(999, `pa:${code}`);
  ok(tgRow().partner?.chat === 999, "partner 999 saved");
  tgRow().sent = {};
  at("2026-10-29T07:00:20Z");
  await sync("2026-10-29T10:00", [opened("998", "2026-10-29T09:50")]);
  ok(!tgRow().partner && /can no longer receive messages/.test(to(555).at(-1)!.body.text), "blocked partner: partnership ended");
  code = await newInvite(); await press(888, `pa:${code}`);
  await say(555, "/stop", { language_code: "en" });
  ok(!tgRow().partner && tgRow().chat === null && /^أنهى Nour شراكة الالتزام معك/.test(to(888).at(-1)!.body.text), "/stop ends the partnership");


  // ---- 24. morning plan ----
  console.log("24. morning plan");
  const C = { id: "c", accountId: "a", name: "P1", start: "2026-10-01", size: 10000, target: 10, daily: 5, dailyBase: "size" as const, max: 10, trailing: false, minDays: 4, limitDays: 30 };
  const N = { bal: 10300, pnl: 300, todayPnl: -100, limit: 500, dailyUsed: 0.2, floor: 9000, overallUsed: 0, goal: 1000, days: 3 };
  const mp = lib.morningPlan(C, N, "2026-10-20");
  ok(mp && mp.dayRoom === 400 && mp.allRoom === 1300 && Math.abs(mp.risk - 133.33) < 0.01 && mp.left === 700 && mp.tdLeft === 9 && Math.abs(mp.pace - 77.78) < 0.01 && !mp.reached, `plan numbers ${JSON.stringify(mp)}`);
  ok(lib.morningPlan(C, { ...N, bal: 8990, pnl: -1010 }, "2026-10-20") === null, "under the floor: over");
  ok(lib.morningPlan(C, N, "2026-11-01") === null, "out of time: over");
  ok(lib.morningPlan(C, { ...N, pnl: 1000, days: 4 }, "2026-10-20") === null, "passed: over");
  ok(lib.morningPlan(C, { ...N, pnl: 1000, days: 3 }, "2026-10-20")?.reached === true, "target reached, days missing");
  const noLimit = lib.morningPlan({ ...C, limitDays: null, daily: null }, { ...N, limit: null }, "2026-10-20");
  ok(noLimit && noLimit.dayRoom === null && noLimit.risk !== null && Math.abs(noLimit.risk - 433.33) < 0.01 && noLimit.tdLeft === null && noLimit.pace === null, "no daily rule, no time limit");

  tgRow().chat = 555; tgRow().sent = {}; tgRow().partner = null;
  db.user_settings.find((x) => x.key === "mizan-challenges")!.value[0].limitDays = 60;
  const before8 = sends().length;
  unlock(); at("2026-11-02T06:55:00Z"); await tick(); // 07:55 Tunis
  ok(!sends().slice(before8).some((c) => /Morning plan/.test(c.body.text)), "not before 08:00");
  unlock(); at("2026-11-02T07:05:00Z"); n0 = sends().length; await tick(); // Monday 08:05
  const mo = sends().slice(n0).map((c) => c.body.text).find((t: string) => /Morning plan/.test(t));
  console.log(String(mo).split("\n").map((l) => "   | " + l).join("\n"));
  const net = db.trades.filter((x) => x.user_id === "u1" && x.account_id === "acc1" && x.status === "closed" && !x.deleted_at && x.entry_time >= "2026-10-01").reduce((a, x) => a + Number(x.pnl), 0);
  const room = 10000 + net - 9000, fmt = (v: number) => Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  ok(!!mo && /☀️ Morning plan · Mon, Nov 2/.test(mo) && mo.includes("🏁 FTMO 10k · MT5 Demo") && mo.includes(`• room today 500$ · overall room ${fmt(room)}$`) && mo.includes(`Max risk per trade: ${fmt(Math.min(500, room) / 3)}$`), `morning content (net ${net})`);
  ok(mo.includes(`Target: ${fmt(1000 - net)}$ left`) && /trading days left · about [\d,]+\$ a day/.test(mo), "target and pace");
  unlock(); at("2026-11-02T07:15:00Z"); n0 = sends().length; await tick();
  ok(!sends().slice(n0).some((c) => /Morning plan/.test(c.body.text)), "once a day");
  unlock(); at("2026-11-07T08:05:00Z"); n0 = sends().length; await tick(); // Saturday
  ok(!sends().slice(n0).some((c) => /Morning plan/.test(c.body.text)), "not on the weekend");

  // ---- 25. discipline score: the pure rule ----
  console.log("25. discipline score");
  const tr = (key: string, entry: string, exit: string | null, pnl: number | null, sl: number, acc = "a1") => ({ key, account_id: acc, symbol: "XAUUSD", side: "long", pnl, status: exit ? "closed" : "open", entry_time: entry, exit_time: exit, sl });
  const D = "2026-11-03";
  const day4 = [tr("k1", `${D} 09:00:00`, `${D} 09:30:00`, -10, 1), tr("k2", `${D} 09:40:00`, `${D} 10:00:00`, -10, 0), tr("k3", `${D} 10:10:00`, `${D} 10:20:00`, -10, 1), tr("k4", `${D} 10:30:00`, `${D} 11:00:00`, 5, 1)];
  const ch = { id: "c", accountId: "a1", name: "P1", start: "2026-11-01", size: 1000, target: 10, daily: 2, dailyBase: "size", max: 10, trailing: false, trailLock: true, minDays: 0, limitDays: null, consistency: null };
  const sc = lib.disciplineDay(day4, { k1: true, k2: false, k3: true }, [ch], D);
  ok(sc?.score === 67 && sc.n === 4 && sc.noSl === 1 && sc.out === 1 && sc.afterStreak === 1 && sc.afterLimit === 2, `mixed day: 67 (got ${JSON.stringify(sc)})`);
  ok(lib.disciplineDay(day4, {}, [], "2026-11-04") === null, "no trade that day: no score");
  ok(lib.disciplineDay([tr("k9", `${D} 09:00:00`, null, null, 1)], {}, [], D)?.score === 100, "one clean trade: 100");
  ok(lib.disciplineDay([tr("k9", `${D} 09:00:00`, null, null, 0)], { k9: false }, [], D)?.score === 33, "no SL, outside the plan: 33");
  ok(lib.disciplineDay([...day4.slice(0, 3).map((t) => ({ ...t, account_id: "a2" })), tr("k4", `${D} 10:30:00`, null, null, 1)], {}, [], D)?.afterStreak === 0, "losses on another account do not count");

  // ---- 26. discipline board in a group ----
  console.log("26. discipline board");
  const G = -1001234;
  const gmsg = (m: Record<string, unknown>, from = 555) => handlers[1](new Request("http://local/fn", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 11, message: { message_id: 3, chat: { id: G, type: "supergroup", title: "Gold traders" }, from: { id: from, language_code: "en" }, ...m } }) }));
  const gtap = (from: number, data: string) => handlers[1](new Request("http://local/fn", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 12, callback_query: { id: "g1", data, from: { id: from, language_code: "en" }, message: { message_id: 4, chat: { id: G, type: "supergroup", title: "Gold traders" } } } }) }));
  const grow = () => db.tg_state.find((r) => r.id === `grp:${G}`);
  const gsends = () => sends().filter((c) => c.body.chat_id === G);
  await gmsg({ text: "hello all" });
  ok(!grow() && !gsends().length, "ordinary group message: ignored");
  await gmsg({ new_chat_members: [{ id: 123, is_bot: true, username: "MizanTestBot" }] });
  ok(!!grow() && grow()!.value.members.length === 0 && grow()!.value.lang === "en", "bot added: board row");
  ok(/discipline board/.test(gsends().at(-1)?.body.text) && gsends().at(-1)?.body.reply_markup.inline_keyboard[0].map((b: { callback_data: string }) => b.callback_data).join() === "gj,gl", "intro with Join / Leave");
  await gtap(777, "gj");
  let ans = tgCalls.filter((c) => c.method === "answerCallbackQuery").at(-1)?.body;
  ok(/Link your Telegram/.test(ans.text) && ans.show_alert === true && grow()!.value.members.length === 0, "not linked: told how, not added");
  await gtap(555, "gj");
  ans = tgCalls.filter((c) => c.method === "answerCallbackQuery").at(-1)?.body;
  ok(/Joined/.test(ans.text) && grow()!.value.members.join() === "u1", "linked member joins");
  await gtap(555, "gj");
  ok(grow()!.value.members.length === 1, "joining twice keeps one entry");
  // u1 trades on Tuesday Nov 3 (broker day): one clean, one without SL and outside the plan
  db.trades.push({ id: "d1", user_id: "u1", key: "acc1:d1", account_id: "acc1", symbol: "XAUUSD", side: "long", status: "closed", pnl: 12, entry_time: "2026-11-03 10:00:00", exit_time: "2026-11-03 11:00:00", sl: 2390, deleted_at: null });
  db.trades.push({ id: "d2", user_id: "u1", key: "acc1:d2", account_id: "acc1", symbol: "XAUUSD", side: "long", status: "closed", pnl: -8, entry_time: "2026-11-03 12:00:00", exit_time: "2026-11-03 12:30:00", sl: null, deleted_at: null });
  db.user_settings.find((x) => x.key === "mizan-trade-plan" && x.user_id === "u1")!.value["acc1:d2"] = false;
  unlock(); at("2026-11-03T21:50:00Z"); let ng = gsends().length; await tick(); // 23:50 broker: not yet
  ok(gsends().length === ng, "before the broker's midnight: nothing");
  unlock(); at("2026-11-03T22:10:00Z"); ng = gsends().length; await tick(); // 00:10 broker, Wednesday
  const board = gsends().slice(ng)[0]?.body;
  console.log(String(board?.text).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!board && /Discipline board · Tue, Nov 3/.test(board.text) && /Nour · \d+/.test(board.text) && /without SL: 1/.test(board.text) && /outside the plan: 1/.test(board.text) && !/\$/.test(board.text), "daily board, no amounts");
  ok(board?.reply_markup?.inline_keyboard?.[0]?.length === 2, "board keeps the buttons");
  unlock(); at("2026-11-03T22:20:00Z"); ng = gsends().length; await tick();
  ok(gsends().length === ng, "once a day");
  unlock(); at("2026-11-08T08:30:00Z"); ng = gsends().length; await tick(); // Sunday 10:30 broker
  const rk = gsends().slice(ng).map((c) => c.body.text).find((t: string) => /ranking/.test(t));
  console.log(String(rk).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!rk && /🥇 Nour · \d+ \(\d+ days?\)/.test(rk), "Sunday ranking");
  unlock(); at("2026-11-08T08:40:00Z"); ng = gsends().length; await tick();
  ok(!gsends().slice(ng).some((c) => /ranking/.test(c.body.text)), "ranking once a week");
  await gtap(555, "gl");
  ok(grow()!.value.members.length === 0, "member leaves");
  await gmsg({ text: "/board@MizanTestBot" });
  ok(/discipline board/.test(gsends().at(-1)?.body.text), "/board shows the intro again");
  await gmsg({ left_chat_member: { id: 123, is_bot: true } });
  ok(!grow(), "bot removed: board forgotten");

  // ---- 27. coach ----
  console.log("27. coach");
  const CC = 4444;
  const cpress = (data: string) => handlers[1](new Request("http://local/fn", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 21, callback_query: { id: "c1", data, from: { id: CC, first_name: "Ali", language_code: "en" }, message: { message_id: 91, chat: { id: CC, type: "private" } } } }) }));
  const csay = (text: string) => say(CC, text, { first_name: "Ali", language_code: "en" });
  tgRow().partner = null; tgRow().sent = {};
  const ci = await app({ action: "coachInvite", lang: "en" });
  const ccode = String(ci.url).split("start=coach_")[1];
  ok(ci.ok && /t\.me\/MizanTestBot\?start=coach_/.test(ci.url) && !!tgRow().ccodeHash, "coach invite link");
  await say(555, `/start coach_${ccode}`, { language_code: "en" });
  ok(/your own coach/.test(lastSend().text), "own link refused");
  await csay(`/start coach_${ccode}`);
  const inv = lastSend();
  ok(inv.chat_id === CC && /invites you to be their trading coach/.test(inv.text) && inv.reply_markup.inline_keyboard[0][0].callback_data === `ca:${ccode}`, "coach sees the invite");
  let c0 = to(555).length;
  await cpress(`ca:${ccode}`);
  ok(tgRow().coach?.chat === CC && tgRow().coach.name === "Ali" && !tgRow().ccodeHash, "coach saved");
  ok(/You are Nour's coach/.test(to(CC).at(-1).body.text) && to(555).slice(c0).some((c) => /Ali accepted: they are now your coach/.test(c.body.text)), "both told");
  const info = await app({ action: "info", lang: "en" });
  ok(info.coach?.name === "Ali" && info.coach.prefs.nosl === true && info.coach.prefs.daily === true, "app sees the coach");
  await csay("hello");
  ok(/You coach: Nour/.test(lastSend().text), "coach help");
  // a rule break reaches the coach (no amounts), and the trader is told
  at("2026-11-09T07:00:20Z"); tgRow().sent = {};
  let k0 = to(CC).length; c0 = to(555).length;
  await sync("2026-11-09T10:00", [opened("995", "2026-11-09T09:57")]);
  const cm = to(CC).slice(k0).map((c) => c.body.text);
  ok(cm.length === 1 && /^🎓 Nour broke a rule: a trade without a stop loss \(EURUSD, 09:57\)\.$/.test(cm[0]), `coach alert: ${cm[0]}`);
  ok(to(555).slice(c0).some((c) => /^🎓 Your coach Ali was told: a trade without a stop loss\.$/.test(c.body.text)), "trader told about the coach");
  // the trader turns that alert off for the coach
  const cp = await app({ action: "coachPrefs", lang: "en", prefs: { nosl: false } });
  ok(cp.coach?.prefs.nosl === false && cp.coach.prefs.daily === true, "coach prefs saved");
  at("2026-11-10T07:00:20Z"); tgRow().sent = {}; k0 = to(CC).length;
  await sync("2026-11-10T10:00", [opened("996b", "2026-11-10T09:57")]);
  ok(to(CC).length === k0, "alert off: coach not told");
  // the daily digest after the broker's midnight
  unlock(); at("2026-11-09T22:10:00Z"); k0 = to(CC).length; await tick(); // broker 00:10 Tue Nov 10 -> Mon Nov 9
  const dg = to(CC).slice(k0).map((c) => c.body.text).find((t: string) => /Your traders/.test(t));
  console.log(String(dg).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!dg && /🎓 Your traders · Mon, Nov 9/.test(dg) && /Nour · \d+/.test(dg) && /without SL: 1/.test(dg) && !/\$/.test(dg), "daily digest, no amounts");
  unlock(); at("2026-11-09T22:20:00Z"); k0 = to(CC).length; await tick();
  ok(!to(CC).slice(k0).some((c) => /Your traders/.test(c.body.text)), "digest once a day");
  await app({ action: "coachPrefs", lang: "en", prefs: { nosl: false, daily: false } });
  unlock(); at("2026-11-10T22:10:00Z"); k0 = to(CC).length; await tick();
  ok(!to(CC).slice(k0).some((c) => /Your traders/.test(c.body.text)), "digest off: none");
  // /leave ends the coaching
  c0 = to(555).length;
  await csay("/leave");
  ok(!tgRow().coach && /no longer the coach of: Nour/.test(to(CC).at(-1).body.text) && to(555).slice(c0).some((c) => /Ali stopped being your coach/.test(c.body.text)), "/leave ends coaching");
  // decline
  const ci2 = await app({ action: "coachInvite", lang: "en" }), code2 = String(ci2.url).split("start=coach_")[1];
  c0 = to(555).length;
  await cpress(`cd:${code2}`);
  ok(!tgRow().coach && !tgRow().ccodeHash && /Nothing was shared/.test(to(CC).at(-1).body.text) && to(555).slice(c0).some((c) => /declined your coach invite/.test(c.body.text)), "decline");
  await cpress(`ca:${code2}`);
  ok(!tgRow().coach && /expired or was replaced/.test(to(CC).at(-1).body.text), "a used code does not work twice");
  // remove from the app
  const ci3 = await app({ action: "coachInvite", lang: "en" });
  await cpress(`ca:${String(ci3.url).split("start=coach_")[1]}`);
  ok(tgRow().coach?.chat === CC, "coach again");
  const rm = await app({ action: "coachRemove", lang: "en" });
  ok(rm.coach === null && !tgRow().coach && /Nour ended the coaching/.test(to(CC).at(-1).body.text), "removed from the app");

  // ---- 29. rules adopted in the Advisor ----
  console.log("29. adopted rules");
  ok(lib.ruleText({ skipSymbols: ["EURUSD"] }, "en", "USD") === "Leave EURUSD aside", "text: symbol");
  ok(lib.ruleText({ hours: [16, 14] }, "en", "USD") === "Avoid 14:00–16:00", `text: avoid hours (${lib.ruleText({ hours: [16, 14] }, "en", "USD")})`);
  ok(lib.ruleText({ hours: [9, 12] }, "en", "USD") === "Trade only 09:00–12:00", "text: trade only");
  ok(lib.ruleText({ hours: [16, 14] }, "ar", "USD") === "تجنّب \u206614:00–16:00\u2069", "text: arabic range kept left to right");
  ok(lib.ruleText({ dayLoss: 150 }, "en", "USD") === "Stop for the day once you are down 150$", "text: day loss");
  ok(lib.ruleText({ streak: 2 }, "ar", null) === "توقّف بعد خسارتين متتاليتين", "text: arabic streak");
  ok(lib.ruleText({ skipDays: [1] }, "en", null) === "No trading on Tuesday", "text: weekday (0 = Monday)");
  ok(lib.ruleText({ maxDay: 1, sl: { v: 1.5, unit: "R" } }, "fr", "EUR") === "Au plus 1 trade par jour · Stop loss à 1.5R", `text: two rules (${lib.ruleText({ maxDay: 1, sl: { v: 1.5, unit: "R" } }, "fr", "EUR")})`);
  const T0 = { n: 0, net: 0, run: 0 }, xa = { symbol: "XAUUSD", side: "long", entry_time: "2026-11-12T10:00" };
  ok(lib.ruleBroken({ skipSymbols: ["EURUSD"] }, { symbol: "EURUSD", side: "short", entry_time: "2026-11-12T15:01" }, T0), "broken: symbol");
  ok(!lib.ruleBroken({ skipSymbols: ["EURUSD"] }, xa, T0), "kept: other symbol");
  ok(lib.ruleBroken({ hours: [16, 14] }, { ...xa, entry_time: "2026-11-12 15:01:00" }, T0) && !lib.ruleBroken({ hours: [16, 14] }, xa, T0), "hours (both time formats)");
  ok(lib.ruleBroken({ skipDays: [3] }, xa, T0), "broken: Thursday off");
  ok(lib.ruleBroken({ side: "short" }, xa, T0) && !lib.ruleBroken({ side: "long" }, xa, T0), "side");
  ok(lib.ruleBroken({ maxDay: 2 }, xa, { ...T0, n: 2 }) && !lib.ruleBroken({ maxDay: 2 }, xa, { ...T0, n: 1 }), "at most 2 a day");
  ok(lib.ruleBroken({ streak: 2 }, xa, { n: 2, net: -40, run: 2 }), "losses in a row");
  ok(lib.ruleBroken({ dayLoss: 100 }, xa, { ...T0, net: -100 }) && !lib.ruleBroken({ dayLoss: 100 }, xa, { ...T0, net: -99 }), "daily loss");
  ok(!lib.ruleBroken({ sl: { v: 50, unit: "money" } }, xa, T0), "a stop rule is not about the entry");

  db.user_settings.push({ id: crypto.randomUUID(), user_id: "u1", key: "mizan-advisor-rules", deleted_at: null, updated_at: new Date().toISOString(), value: [
    { id: "symbol", topic: "symbols", rules: { skipSymbols: ["EURUSD"] }, data: { s: "EURUSD" }, at: "2026-11-01" },
    { id: "hours", topic: "timing", rules: { hours: [16, 14] }, data: { a: 14, b: 16 }, at: "2026-11-01" },
    { id: "weekday", topic: "timing", rules: { skipDays: [2] }, data: { d: 2 }, at: "2026-11-01" },
  ] });
  // the 08:00 message lists them, and says when today is a day off by one of them
  tgRow().chat = 555; tgRow().sent = {}; tgRow().prefs = {}; tgRow().partner = null; tgRow().coach = null;
  unlock(); at("2026-11-11T07:05:00Z"); n0 = sends().length; await tick(); // Wednesday 08:05 Tunis
  const mr = sends().slice(n0).map((c) => c.body.text).find((t: string) => /Morning plan/.test(t));
  console.log(String(mr).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!mr && mr.includes("📌 Your rules today") && mr.includes("⛔ No trading today: it is one of your rules.") && mr.includes("• Leave EURUSD aside") && mr.includes("• Avoid 14:00–16:00") && mr.includes("• No trading on Wednesday"), "morning: the rules");
  tgRow().sent = {}; tgRow().prefs = { morning: false };
  unlock(); at("2026-11-12T07:05:00Z"); n0 = sends().length; await tick(); // Thursday
  const mr2 = sends().slice(n0).map((c) => c.body.text).find((t: string) => /Morning plan/.test(t));
  ok(!!mr2 && mr2.includes("📌 Your rules today") && !mr2.includes("🏁") && !mr2.includes("No trading today"), "morning: the rules alone (challenges off), Thursday is not a day off");
  tgRow().sent = {}; tgRow().prefs = { morning: false, myRules: false };
  unlock(); at("2026-11-13T07:05:00Z"); n0 = sends().length; await tick();
  ok(!sends().slice(n0).some((c) => /Morning plan/.test(c.body.text)), "morning: both off, nothing");
  // a trade just opened that breaks rules says which
  tgRow().prefs = {}; tgRow().sent = {};
  at("2026-11-16T13:05:20Z"); n0 = sends().length; // Monday, broker 15:05 (UTC+2)
  await sync("2026-11-16T15:05", [opened("99101", "2026-11-16T15:01", 1.09)]); // EURUSD sell at 15:01
  const br = sends().slice(n0).map((c) => c.body.text).find((t: string) => /new trade EURUSD/.test(t));
  console.log(String(br).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!br && br.includes("⛔ This trade breaks your rule: Leave EURUSD aside") && br.includes("⛔ This trade breaks your rule: Avoid 14:00–16:00") && !br.includes("Wednesday"), "entry: the broken rules named");
  at("2026-11-17T08:05:20Z"); n0 = sends().length;
  await sync("2026-11-17T10:05", [opened("99102", "2026-11-17T10:01", 2390, { symbol: "XAUUSD", type: "buy", openPrice: 2400 })]); // Tuesday, inside the rules
  const ok1 = sends().slice(n0).map((c) => c.body.text).find((t: string) => /new trade XAUUSD/.test(t));
  ok(!!ok1 && !ok1.includes("breaks your rule"), "entry: inside the rules, no warning");
  tgRow().prefs = { myRules: false }; tgRow().sent = {};
  at("2026-11-19T13:05:20Z"); n0 = sends().length; // Thursday
  await sync("2026-11-19T15:05", [opened("99103", "2026-11-19T15:01", 1.09)]);
  const off1 = sends().slice(n0).map((c) => c.body.text).find((t: string) => /new trade EURUSD/.test(t));
  ok(!!off1 && !off1.includes("breaks your rule"), "entry: switch off, no warning");
  tgRow().prefs = { entry: false, danger: false }; tgRow().sent = {};
  at("2026-11-20T13:05:20Z"); n0 = sends().length; // Friday
  await sync("2026-11-20T15:05", [opened("99104", "2026-11-20T15:01", 1.09)]);
  const only = sends().slice(n0).map((c) => c.body.text).find((t: string) => /new trade EURUSD/.test(t));
  ok(!!only && only.includes("breaks your rule") && !only.includes("in your plan"), "entry: only the rule warning when the other entry alerts are off");
  const inf29 = await app({ action: "info", lang: "en" });
  ok(inf29.prefs?.myRules === true, `info: the new switch is on by default (${JSON.stringify(inf29.prefs)})`);


  // ---- 30. "My own rules" challenges ----
  console.log("30. own rules");
  const A30 = { maxTrades: 2 }, B30 = { maxTrades: 5 };
  ok(lib.ownAt({ own: B30, ownPast: [{ until: "2026-11-23T12:00", rules: A30 }] }, "2026-11-23T11:59").maxTrades === 2 && lib.ownAt({ own: B30, ownPast: [{ until: "2026-11-23T12:00", rules: A30 }] }, "2026-11-23T12:00").maxTrades === 5, "rules in force: the earlier set until it changed");
  ok(lib.ownAt({ own: A30, ownNext: { rules: B30, from: "2026-11-24T09:00" } }, "2026-11-24T09:00").maxTrades === 5, "a loosened set from its time on");
  const c30 = { n: 0, run: 0, day: 0, week: 0, month: 0, total: 0, lastLoss: null };
  ok(JSON.stringify(lib.ownBroken({ hours: [9, 17], avoid: ["GBPUSD"] }, { symbol: "GBPUSD", side: "long", qty: 1, entry_time: "2026-11-23 18:05:00" }, c30, 1e4)) === JSON.stringify(["avoid", "hours"]), "broken at entry: market and hours");
  ok(JSON.stringify(lib.ownBroken({ daily: { v: 1, unit: "pct" }, cool: 30, lots: 0.5 }, { symbol: "XAUUSD", side: "long", qty: 1, entry_time: "2026-11-23T10:20" }, { ...c30, day: -100, lastLoss: "2026-11-23T10:00" }, 1e4)) === JSON.stringify(["lots", "daily", "cool"]), "lots, the daily 1% reached, the pause");
  ok(lib.ownText("weekly", { weekly: { v: 250, unit: "money" } }, 1e4, "en", "USD") === "Stop for the week once you are down 250$", `text: weekly (${lib.ownText("weekly", { weekly: { v: 250, unit: "money" } }, 1e4, "en", "USD")})`);
  ok(lib.ownText("daily", { daily: { v: 1, unit: "pct" } }, 1e4, "en", "USD") === "Stop for the day once you are down 100$", "text: 1% of 10,000 in money");
  ok(lib.ownText("hours", { hours: [9, 17] }, 1e4, "ar", "USD") === "تداول فقط بين \u206609:00–17:00\u2069", "text: arabic hours kept left to right");
  ok(lib.ownText("only", { only: ["XAUUSD", "EURUSD"] }, 1e4, "fr", "EUR") === "Tradez seulement XAUUSD, EURUSD", "text: only (fr)");
  const pr = lib.asProp({ id: "o", accountId: "acc1", name: "x", start: "2026-11-01", size: 20000, target: null, daily: null, dailyBase: "size", max: null, trailing: false, minDays: 0, kind: "own", own: { daily: { v: 200, unit: "money" }, overall: { v: 5, unit: "pct" }, goal: { v: 1000, unit: "money" } } }, "2026-11-23T10:00");
  ok(pr.daily === 1 && pr.max === 5 && pr.target === 5 && pr.dailyBase === "size" && !pr.trailing, `as a prop challenge: 1% a day, 5% in all, goal 5% (${JSON.stringify([pr.daily, pr.max, pr.target])})`);
  const cx30 = lib.ownCtx([{ key: "a", symbol: "X", side: "long", pnl: -40, status: "closed", entry_time: "2026-11-23T09:10", exit_time: "2026-11-23T09:40" }, { key: "b", symbol: "X", side: "long", pnl: 25, status: "closed", entry_time: "2026-11-20T09:10", exit_time: "2026-11-20T09:40" }, { key: "c", symbol: "X", side: "long", pnl: null, status: "open", entry_time: "2026-11-23T10:00", exit_time: null }], "2026-11-01", "2026-11-23T10:05", "c");
  ok(cx30.n === 1 && cx30.run === 1 && cx30.day === -40 && cx30.week === -40 && cx30.month === -15 && cx30.total === -15 && cx30.lastLoss === "2026-11-23T09:40", `the day so far ${JSON.stringify(cx30)}`);

  db.user_settings = db.user_settings.filter((x) => x.key !== "mizan-advisor-rules");
  db.user_settings.find((x) => x.key === "mizan-challenges")!.value = [{ id: "own1", accountId: "acc1", name: "My rules", start: "2026-11-23", size: 10000, target: null, daily: null, dailyBase: "size", max: null, trailing: false, trailLock: true, minDays: 0, limitDays: null, consistency: null,
    kind: "own", own: { daily: { v: 100, unit: "money" }, overall: { v: 10, unit: "pct" }, maxTrades: 2, cool: 30, hours: [9, 17], daysOff: [4], avoid: ["GBPUSD"], onBreak: "day" }, signed: { name: "Nour", notify: true } }];
  tgRow().chat = 555; tgRow().prefs = {}; tgRow().sent = {}; tgRow().partner = { chat: 888, name: "Sami", lang: "ar", since: "2026-11-01" }; tgRow().coach = null;
  // the 08:00 message lists the rules and today's room
  unlock(); at("2026-11-23T07:05:00Z"); n0 = sends().length; await tick(); // Monday 08:05 Tunis
  const om = sends().slice(n0).map((c) => c.body.text).find((t: string) => /Morning plan/.test(t));
  console.log(String(om).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!om && om.includes("📌 My rules · MT5 Demo") && om.includes("• room today 100$ · overall room 1,000$") && om.includes("• Stop for the day once you are down 100$") && om.includes("• At most 2 trades a day") && om.includes("• Wait 30 min after a loss") && om.includes("• Trade only 09:00–17:00") && om.includes("• No trading on Friday") && om.includes("• Leave GBPUSD aside") && !om.includes("No trading today") && !om.includes("🏁"), "morning: the own rules and the room");
  tgRow().sent = {};
  unlock(); at("2026-11-27T07:05:00Z"); n0 = sends().length; await tick(); // Friday
  ok(sends().slice(n0).some((c) => /📌 My rules · MT5 Demo\n⛔ No trading today/.test(c.body.text)), "morning: Friday is a day off");
  // a clean entry, then a loss and a new trade 5 minutes later (the pause), then a third trade at 18h in an avoided market
  tgRow().sent = {};
  at("2026-11-23T08:05:20Z"); n0 = sends().length;
  await sync("2026-11-23T10:05", [opened("99201", "2026-11-23T10:01", 2390, { symbol: "XAUUSD", type: "buy", openPrice: 2400 })]);
  const e30a = sends().slice(n0).map((c) => c.body.text).find((t: string) => /new trade XAUUSD/.test(t));
  ok(!!e30a && !e30a.includes("breaks your rule"), "entry inside the rules: no warning");
  at("2026-11-23T08:40:20Z"); n0 = sends().length; const q0 = to(888).length;
  await sync("2026-11-23T10:40", [closed("99201", "2026-11-23T10:01", "2026-11-23T10:30", -60), opened("99202", "2026-11-23T10:35", 2390, { symbol: "XAUUSD", type: "buy", openPrice: 2400 })]);
  const out2 = sends().slice(n0).filter((c) => c.body.chat_id === 555).map((c) => c.body.text);
  console.log(out2.map((t: string) => t.split("\n").map((l) => "   | " + l).join("\n")).join("\n   ---\n"));
  ok(out2.some((t: string) => /new trade XAUUSD/.test(t) && t.includes("⛔ This trade breaks your rule: Wait 30 min after a loss")), "entry 5 minutes after a loss: the pause named");
  ok(out2.some((t: string) => /My rules/.test(t) && /half of today's loss limit used \(61\$ of 100\$\)/.test(t)), "the daily limit warns at half, as a prop challenge (60$ loss + 0.50$ commission)");
  const pm30 = to(888).slice(q0).map((c) => c.body.text);
  ok(pm30.length === 1 && /^🤝 Nour كسر قاعدة: قاعدته الخاصة «الاستراحة بعد الخسارة» \(XAUUSD، 10:35\)/.test(pm30[0]) && !/\$/.test(pm30[0]), `the partner hears of it, no amounts (${pm30[0]})`);
  ok(out2.some((t: string) => /Your partner Sami was told: your own rule “pause after a loss”/.test(t)), "the trader is told the partner knows");
  at("2026-11-23T16:05:20Z"); n0 = sends().length; const p1 = to(888).length;
  await sync("2026-11-23T18:05", [opened("99202", "2026-11-23T10:35", 2390, { symbol: "XAUUSD", type: "buy", openPrice: 2400 }), opened("99203", "2026-11-23T18:01", 1.3, { symbol: "GBPUSD" })]);
  const e3 = sends().slice(n0).map((c) => c.body.text).find((t: string) => /new trade GBPUSD/.test(t));
  console.log(String(e3).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!e3 && e3.includes("Leave GBPUSD aside") && e3.includes("Trade only 09:00–17:00") && e3.includes("At most 2 trades a day"), "the third trade: market, hours, trades a day");
  ok(to(888).length === p1, "the partner: once a day");
  tgRow().prefs = { myRules: false }; tgRow().sent = {};
  at("2026-11-24T16:05:20Z"); n0 = sends().length; const p2 = to(888).length;
  await sync("2026-11-24T18:05", [opened("99204", "2026-11-24T18:01", 1.3, { symbol: "GBPUSD" })]);
  const e4 = sends().slice(n0).map((c) => c.body.text).find((t: string) => /new trade GBPUSD/.test(t));
  ok(!!e4 && !e4.includes("breaks your rule") && to(888).length === p2 + 1, "my rules switched off: no warning for me, the signed contract still tells the partner");
  // ---- 31. "did you break any of your rules?" under a new trade ----
  console.log("31. rules question");
  const JS = JSON.stringify;
  tgRow().prefs = {}; tgRow().sent = {};
  const setting = (key: string) => db.user_settings.find((x) => x.key === key && x.user_id === "u1")?.value;
  const putSetting = (key: string, value: unknown) => { const r = db.user_settings.find((x) => x.key === key && x.user_id === "u1"); if (r) r.value = value; else db.user_settings.push({ user_id: "u1", key, value, updated_at: "2026-11-25T00:00:00Z", deleted_at: null, synced_at: "2026-11-25T00:00:00Z" }); };
  const S1 = { id: "c-aaaa1", name: "basic order_flow", rules: ["wait to break val & vah", "wait for absorption", "no trades on news"] };
  putSetting("mizan-rules-bot", { lang: "en", list: [S1] });
  at("2026-11-25T08:05:20Z"); n0 = sends().length;
  await sync("2026-11-25T10:05", [opened("99301", "2026-11-25T10:01", 1.07)]);
  const r1 = sends().slice(n0).map((c) => c.body).find((b) => /new trade EURUSD/.test(b.text));
  console.log(String(r1?.text).split("\n").map((l) => "   | " + l).join("\n"));
  ok(!!r1 && r1.text.includes("❓ Did you break any of your rules (basic order_flow)? Tap the ones you broke:") && r1.text.includes("1. wait to break val & vah") && r1.text.includes("3. no trades on news") && !r1.text.includes("Is it in your plan"), "one strategy: its rules asked, numbered");
  const kb1 = r1?.reply_markup?.inline_keyboard ?? [];
  ok(kb1.length === 3 && kb1[0][0].callback_data === "qn:acc1:99301" && kb1[1].map((b: { text: string }) => b.text).join() === "1,2,3" && kb1[1][2].callback_data === "qr2:acc1:99301" && kb1[2][0].callback_data === "qd:acc1:99301", `rule buttons ${JSON.stringify(kb1)}`);
  const lastEdit = () => tgCalls.filter((c) => c.method === "editMessageReplyMarkup").at(-1)?.body;
  const lastAns = () => tgCalls.filter((c) => c.method === "answerCallbackQuery").at(-1)?.body;
  await tap(555, "qr1:acc1:99301");
  ok(JS(setting("mizan-trade-rules")?.["acc1:99301"]?.b) === "[1]" && setting("mizan-trade-rules")["acc1:99301"].s === "c-aaaa1", "a rule tapped: kept as broken");
  ok(setting("mizan-trade-plan")?.["acc1:99301"] === false, "a rule broken: outside the plan, as before");
  ok(setting("mizan-trade-strategy")?.["acc1:99301"] === "c-aaaa1", "the trade is linked to the strategy");
  ok(lastEdit()?.reply_markup.inline_keyboard[1][1].text === "❌ 2" && lastAns()?.text === "Saved ✓", "the button shows it");
  await tap(555, "qr1:acc1:99301");
  ok(JS(setting("mizan-trade-rules")["acc1:99301"].b) === "[]" && !("acc1:99301" in setting("mizan-trade-plan")), "tapped again: unmarked, not answered yet");
  await tap(555, "qr2:acc1:99301"); await tap(555, "qr0:acc1:99301"); await tap(555, "qd:acc1:99301");
  ok(JS(setting("mizan-trade-rules")["acc1:99301"].b) === "[0,2]" && setting("mizan-trade-rules")["acc1:99301"].done === true && setting("mizan-trade-plan")["acc1:99301"] === false, "two rules, then done");
  ok(lastEdit()?.reply_markup.inline_keyboard.length === 1 && lastEdit().reply_markup.inline_keyboard[0][0].text === "❌ Broke 1, 3 · change" && lastEdit().reply_markup.inline_keyboard[0][0].callback_data === "qe:acc1:99301", "answered: one button with the answer");
  await tap(555, "qe:acc1:99301");
  ok(lastEdit()?.reply_markup.inline_keyboard[1].map((b: { text: string }) => b.text).join() === "❌ 1,2,❌ 3", "change: the question again, with the answer marked");
  await tap(555, "qn:acc1:99301");
  ok(JS(setting("mizan-trade-rules")["acc1:99301"].b) === "[]" && setting("mizan-trade-plan")["acc1:99301"] === true && lastEdit()?.reply_markup.inline_keyboard[0][0].text === "✅ No rule broken · change", "none broken: in the plan");
  const before31 = JS(setting("mizan-trade-rules"));
  await tap(555, "qr0:acc2:1");
  ok(JS(setting("mizan-trade-rules")) === before31, "someone else's trade: nothing saved");
  await voice(555, { message_id: 80, reply_markup: { inline_keyboard: [[{ text: "✅ No rule broken · change", callback_data: "qe:acc1:99301" }]] } });
  ok(vrow()?.["acc1:99301"]?.length === 1, "a voice note in reply to the rules question goes with its trade");

  // several strategies: which one first (the answer links the trade), then its rules
  const S2 = { id: "smc", name: "SMC", rules: ["HTF trend marked", "CHoCH in the zone"] };
  putSetting("mizan-rules-bot", { lang: "en", list: [S1, S2] });
  at("2026-11-25T09:05:20Z"); n0 = sends().length;
  await sync("2026-11-25T11:05", [opened("99302", "2026-11-25T11:02", 1.07)]);
  const r2 = sends().slice(n0).map((c) => c.body).find((b) => /new trade EURUSD/.test(b.text));
  ok(!!r2 && r2.text.endsWith("❓ Which strategy is this trade?") && JS(r2.reply_markup.inline_keyboard) === JS([[{ text: "basic order_flow", callback_data: "qs0:acc1:99302" }, { text: "SMC", callback_data: "qs1:acc1:99302" }]]), `which strategy ${JSON.stringify(r2?.reply_markup)}`);
  await tap(555, "qr0:acc1:99302");
  ok(lastAns()?.text === "Choose the strategy first." && !("acc1:99302" in setting("mizan-trade-rules")), "a rule before the strategy: asked to choose first");
  const tapText = (data: string, text: string) => handlers[1](new Request("http://local/fn", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 31, callback_query: { id: "cq31", data, from: { id: 555 }, message: { message_id: 81, text, chat: { id: 555, type: "private" } } } }) }));
  await tapText("qs1:acc1:99302", r2.text);
  const et = tgCalls.filter((c) => c.method === "editMessageText").at(-1)?.body;
  ok(!!et && et.message_id === 81 && /new trade EURUSD/.test(et.text) && et.text.includes("❓ Did you break any of your rules (SMC)?") && et.text.includes("2. CHoCH in the zone") && !et.text.includes("Which strategy"), "the strategy chosen: its rules in place of the question");
  ok(et?.reply_markup.inline_keyboard[1].map((b: { text: string }) => b.text).join() === "1,2", "and its rule buttons");
  ok(setting("mizan-trade-strategy")["acc1:99302"] === "smc" && setting("mizan-trade-rules")["acc1:99302"].s === "smc", "the trade linked to the chosen strategy");
  await tap(555, "qr1:acc1:99302"); await tap(555, "qd:acc1:99302");
  ok(JS(setting("mizan-trade-rules")["acc1:99302"].b) === "[1]" && setting("mizan-trade-plan")["acc1:99302"] === false, "its rule broken, saved");

  // no rules sent by the app: the question of before
  putSetting("mizan-rules-bot", { lang: "en", list: [{ id: "x", name: "no rules", rules: [] }] });
  at("2026-11-25T10:05:20Z"); n0 = sends().length;
  await sync("2026-11-25T12:05", [opened("99303", "2026-11-25T12:02", 1.07)]);
  const r3 = sends().slice(n0).map((c) => c.body).find((b) => /new trade EURUSD/.test(b.text));
  ok(!!r3 && /Is it in your plan\?$/.test(r3.text) && r3.reply_markup.inline_keyboard[0][0].callback_data === "p1:acc1:99303", "no rules: in my plan / outside my plan");

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
