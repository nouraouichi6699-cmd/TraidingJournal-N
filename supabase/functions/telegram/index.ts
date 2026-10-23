// Supabase Edge Function "telegram": Mizan alerts in Telegram.
//  - Telegram webhook (checked by the X-Telegram-Bot-Api-Secret-Token header): "/start <code>" links the chat to a Mizan
//    user, /status shows the prop challenges now, /stop unlinks.
//  - From the app (the user's session): info (bot name, link state; points the bot's webhook here once), link (a one-time
//    code for the t.me link, valid 30 minutes), test, unlink, prefs.
//  - From mt5-sync (service role): the trades the MT5 sync just closed -> one message with the trades and the prop-rule
//    warnings (half / 80% of a loss limit used, limit passed, target reached), each warning sent once.
// Stored in user_settings "telegram": { chat, name, lang, prefs, codeHash, codeAt, sent } (no bot token anywhere but here).
// Setup once: create a bot with @BotFather, add its token as the secret TELEGRAM_BOT_TOKEN, deploy with "Verify JWT" off.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
type Lang = "en" | "ar" | "fr";
type Prefs = { trades: boolean; rules: boolean };
type Tg = { chat?: number | null; name?: string | null; lang?: Lang; prefs?: Prefs; codeHash?: string | null; codeAt?: string | null; sent?: Record<string, string> };
type Ch = { id: string; accountId: string; name: string; start: string; size: number; target: number | null; daily: number | null; dailyBase: "size" | "dayStart"; max: number | null; trailing: boolean; trailLock?: boolean; minDays: number };
type TradeRow = { symbol: string; side: string; pnl: number | null; status: string; entry_time: string | null; exit_time: string | null };
type Acc = { id: string; name: string; currency: string | null };

const TXT: Record<string, Record<Lang, string>> = {
  linked: { en: "Connected ✓ Mizan alerts will come here. /status shows your challenges, /stop turns the alerts off.", ar: "تم الربط ✓ ستصلك تنبيهات ميزان هنا. ‏/status لعرض تحدياتك، و‏/stop لإيقاف التنبيهات.", fr: "Connecté ✓ Les alertes Mizan arriveront ici. /status montre vos challenges, /stop coupe les alertes." },
  badCode: { en: "This link has expired. In Mizan, open Profile › Telegram alerts and press Connect again.", ar: "انتهت صلاحية هذا الرابط. في ميزان افتح الملف الشخصي › تنبيهات تيليغرام واضغط «ربط» من جديد.", fr: "Ce lien a expiré. Dans Mizan, ouvrez Profil › Alertes Telegram et appuyez à nouveau sur Connecter." },
  unknown: { en: "This chat is not linked to Mizan yet. In Mizan, open Profile › Telegram alerts and press Connect.", ar: "هذه المحادثة غير مربوطة بميزان بعد. في ميزان افتح الملف الشخصي › تنبيهات تيليغرام واضغط «ربط».", fr: "Cette discussion n'est pas encore liée à Mizan. Dans Mizan, ouvrez Profil › Alertes Telegram et appuyez sur Connecter." },
  stopped: { en: "Alerts are off and this chat is unlinked. Connect again from Mizan any time.", ar: "أُوقفت التنبيهات وفُكّ ربط هذه المحادثة. يمكنك الربط من جديد من ميزان متى شئت.", fr: "Alertes coupées, discussion déliée. Reconnectez-vous depuis Mizan quand vous voulez." },
  help: { en: "/status: your prop challenges now\n/stop: turn the alerts off", ar: "‏/status: تحدياتك الآن\n‏/stop: إيقاف التنبيهات", fr: "/status : vos challenges maintenant\n/stop : couper les alertes" },
  test: { en: "Test from Mizan ✓ Alerts reach this chat.", ar: "رسالة تجريبية من ميزان ✓ التنبيهات تصل إلى هذه المحادثة.", fr: "Test depuis Mizan ✓ Les alertes arrivent dans cette discussion." },
  noChallenge: { en: "No prop challenge yet: add one in Mizan › Challenges.", ar: "لا يوجد تحدي تمويل بعد: أضف واحداً من ميزان › تحديات التمويل.", fr: "Aucun challenge prop : ajoutez-en un dans Mizan › Challenges." },
  long: { en: "long", ar: "شراء", fr: "long" },
  short: { en: "short", ar: "بيع", fr: "short" },
  more: { en: "+{n} more trades: {m}", ar: "و{n} صفقات أخرى: {m}", fr: "+{n} autres trades : {m}" },
  d50: { en: "⚠️ {c}: half of today's loss limit used ({u} of {l}). Room left today: {r}.", ar: "⚠️ {c}: استُعمل نصف حد خسارة اليوم ({u} من {l}). الهامش المتبقي اليوم: {r}.", fr: "⚠️ {c} : la moitié de la perte du jour utilisée ({u} sur {l}). Marge restante : {r}." },
  d80: { en: "🚨 {c}: 80% of today's loss limit used ({u} of {l}). Room left today: {r}.", ar: "🚨 {c}: استُعمل 80% من حد خسارة اليوم ({u} من {l}). الهامش المتبقي اليوم: {r}.", fr: "🚨 {c} : 80 % de la perte du jour utilisés ({u} sur {l}). Marge restante : {r}." },
  d100: { en: "⛔ {c}: today's loss limit is passed ({u} of {l}).", ar: "⛔ {c}: تم تجاوز حد خسارة اليوم ({u} من {l}).", fr: "⛔ {c} : limite de perte du jour dépassée ({u} sur {l})." },
  o50: { en: "⚠️ {c}: half of the overall loss limit used. Room left: {r} (floor {f}).", ar: "⚠️ {c}: استُعمل نصف حد الخسارة الكلية. الهامش المتبقي: {r} (الحد الأدنى {f}).", fr: "⚠️ {c} : la moitié de la perte max utilisée. Marge : {r} (plancher {f})." },
  o80: { en: "🚨 {c}: 80% of the overall loss limit used. Room left: {r} (floor {f}).", ar: "🚨 {c}: استُعمل 80% من حد الخسارة الكلية. الهامش المتبقي: {r} (الحد الأدنى {f}).", fr: "🚨 {c} : 80 % de la perte max utilisés. Marge : {r} (plancher {f})." },
  o100: { en: "⛔ {c}: the balance is under the overall loss floor ({f}).", ar: "⛔ {c}: الرصيد تحت حد الخسارة الكلية ({f}).", fr: "⛔ {c} : le solde est sous le plancher de perte max ({f})." },
  target: { en: "🏁 {c}: profit target reached ({p} of {g}).", ar: "🏁 {c}: تم بلوغ هدف الربح ({p} من {g}).", fr: "🏁 {c} : objectif de profit atteint ({p} sur {g})." },
  targetDays: { en: " Trading days: {d} of {m}.", ar: " أيام التداول: {d} من {m}.", fr: " Jours de trading : {d} sur {m}." },
  targetDaysMet: { en: " Trading days: {d} (minimum {m} met).", ar: " أيام التداول: {d} (تحقق الحد الأدنى {m}).", fr: " Jours de trading : {d} (minimum {m} atteint)." },
  stResult: { en: "Result: {p}", ar: "النتيجة: {p}", fr: "Résultat : {p}" },
  stTarget: { en: " of {g} target", ar: " من هدف {g}", fr: " sur un objectif de {g}" },
  stToday: { en: "Today: {t} (room {r} of {l})", ar: "اليوم: {t} (الهامش {r} من {l})", fr: "Aujourd'hui : {t} (marge {r} sur {l})" },
  stOverall: { en: "Overall room: {r} (floor {f})", ar: "هامش الخسارة الكلية: {r} (الحد الأدنى {f})", fr: "Marge totale : {r} (plancher {f})" },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const SYM: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹", KRW: "₩", TRY: "₺", RUB: "₽", ILS: "₪", NGN: "₦", PHP: "₱", UAH: "₴", VND: "₫", USDT: "₮" };
/** Money as in the app: en-US digits, the currency after the number; cents for single trades. LRM keeps it whole in Arabic. */
function money(v: number, o: { cents?: boolean; sign?: boolean; cur?: string | null; lang: Lang }) {
  const d = o.cents ? 2 : 0, body = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const c = (o.cur ?? "").trim().toUpperCase(), s = c ? SYM[c] ?? c : "", suffix = !s ? "" : /^[A-Z]{2,}$/.test(s) ? ` ${s}` : s;
  const out = `${!/[1-9]/.test(body) ? "" : v < 0 ? "-" : o.sign ? "+" : ""}${body}${suffix}`;
  return o.lang === "ar" ? `‎${out}‎` : out;
}
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const langOf = (x: unknown): Lang => (x === "ar" || x === "fr" ? x : "en");
const day = (s: string | null | undefined) => (s ?? "").slice(0, 10);

/** The challenge now: balance, today's closed result against the daily limit, room above the floor (as on the Challenges page). */
export function challengeNow(c: Ch, trades: TradeRow[], today: string) {
  const mine = trades.filter((t) => day(t.entry_time) >= c.start && day(t.entry_time) <= today);
  const closes = mine.filter((t) => t.status === "closed" && t.pnl != null && t.exit_time && day(t.exit_time) <= today).sort((a, b) => (a.exit_time as string).localeCompare(b.exit_time as string));
  let bal = c.size, peak = c.size, todayPnl = 0;
  for (const t of closes) { bal += Number(t.pnl); peak = Math.max(peak, bal); if (day(t.exit_time) === today) todayPnl += Number(t.pnl); }
  const allowed = c.max != null ? (c.size * c.max) / 100 : null;
  const floor = allowed == null ? null : c.trailing ? (c.trailLock !== false ? Math.min(c.size, peak - allowed) : peak - allowed) : c.size - allowed;
  const limit = c.daily == null ? null : ((c.dailyBase === "size" ? c.size : bal - todayPnl) * c.daily) / 100;
  return {
    bal, pnl: bal - c.size, todayPnl, limit, dailyUsed: limit ? Math.max(0, -todayPnl) / limit : 0,
    floor, overallUsed: floor != null && allowed ? 1 - (bal - floor) / allowed : 0, goal: c.target != null ? (c.size * c.target) / 100 : null,
    days: new Set(mine.map((t) => day(t.entry_time))).size,
  };
}
/** New warnings for a challenge (keys already in `sent` are skipped; the higher level of a rule covers the lower ones). */
export function warnings(c: Ch, n: ReturnType<typeof challengeNow>, today: string, sent: Record<string, string>, f: (k: string, v: Record<string, string | number>) => string, m: (v: number) => string) {
  const out: string[] = [], keys: string[] = [], name = c.name;
  const pick = (levels: [string, boolean][], text: (k: string) => string) => {
    const hit = levels.filter(([, on]) => on).map(([k]) => k);
    if (!hit.length || hit.every((k) => sent[k])) return;
    out.push(text(hit[hit.length - 1].split(":").pop() as string));
    keys.push(...hit);
  };
  if (n.limit != null && n.limit > 0) {
    const u = Math.max(0, -n.todayPnl), p = `${c.id}:${today}:`;
    pick([[`${p}d50`, n.dailyUsed >= 0.5], [`${p}d80`, n.dailyUsed >= 0.8], [`${p}d100`, n.dailyUsed > 1 + 1e-9]], (k) => f(k, { c: name, u: m(u), l: m(n.limit as number), r: m(Math.max(0, (n.limit as number) - u)) }));
  }
  if (n.floor != null) {
    const p = `${c.id}:`;
    pick([[`${p}o50`, n.overallUsed >= 0.5], [`${p}o80`, n.overallUsed >= 0.8], [`${p}o100`, n.bal < n.floor - 1e-9]], (k) => f(k, { c: name, r: m(Math.max(0, n.bal - (n.floor as number))), f: m(n.floor as number) }));
  }
  if (n.goal != null && n.pnl >= n.goal - 1e-9 && !sent[`${c.id}:target`]) {
    out.push(f("target", { c: name, p: m(n.pnl), g: m(n.goal) }) + (c.minDays > 0 ? f(n.days >= c.minDays ? "targetDaysMet" : "targetDays", { d: n.days, m: c.minDays }) : ""));
    keys.push(`${c.id}:target`);
  }
  return { out, keys };
}

const US_DST = (u: number) => { const y = new Date(u).getUTCFullYear(), sun = (m: number, k: number) => { const d = new Date(Date.UTC(y, m, 1)); return Date.UTC(y, m, 1 + ((7 - d.getUTCDay()) % 7) + 7 * (k - 1)); }; return u >= sun(2, 2) + 7 * 3600e3 && u < sun(10, 1) + 6 * 3600e3; };
/** The broker's day now: from the last MT5 sync (its server time against ours), else UTC+2 / UTC+3 in US summer time. */
function brokerToday(sync: { brokerNow?: string; last?: string } | undefined, now = Date.now()) {
  let off = (US_DST(now) ? 3 : 2) * 3600e3;
  if (sync?.brokerNow && sync.last) { const o = Date.parse(`${sync.brokerNow}Z`) - Date.parse(sync.last); if (Number.isFinite(o) && Math.abs(o) < 15 * 3600e3) off = Math.round(o / 1800e3) * 1800e3; }
  return new Date(now + off).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "", SB = Deno.env.get("SUPABASE_URL") ?? "", SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = (path: string, init: RequestInit = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SR, authorization: `Bearer ${SR}`, "content-type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
  const rows = async <T,>(path: string): Promise<T[]> => { const r = await db(path); return r.ok ? ((await r.json()) as T[]) : []; };
  const tg = (method: string, body: unknown) => fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const send = (chat: number, text: string) => tg("sendMessage", { chat_id: chat, text: text.slice(0, 4000) });
  const getTg = async (uid: string) => (await rows<{ value: Tg }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.telegram&deleted_at=is.null`))[0]?.value ?? null;
  const saveTg = (uid: string, value: Tg) => db("user_settings?on_conflict=user_id,key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, key: "telegram", value, updated_at: null, deleted_at: null }) });
  const secret = TOKEN ? (await sha256(`mizan-webhook:${TOKEN}`)).slice(0, 48) : "";
  const T = (k: string, lang: Lang, v: Record<string, string | number> = {}) => fill(TXT[k][lang], v);

  /** The status of every challenge of a user, for /status. */
  async function statusText(uid: string, lang: Lang) {
    const list = ((await rows<{ value: Ch[] }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-challenges&deleted_at=is.null`))[0]?.value ?? []).filter((c) => c && c.accountId);
    if (!list.length) return T("noChallenge", lang);
    const accs = await rows<Acc>(`accounts?select=id,name,currency&user_id=eq.${uid}&deleted_at=is.null`);
    const syncs = await rows<{ key: string; value: { brokerNow?: string; last?: string } }>(`user_settings?select=key,value&user_id=eq.${uid}&key=like.mt5-sync:*&deleted_at=is.null`);
    const parts: string[] = [];
    for (const c of list) {
      const a = accs.find((x) => x.id === c.accountId);
      if (!a) continue;
      const today = brokerToday(syncs.find((s) => s.key === `mt5-sync:${a.id}`)?.value);
      const trades = await rows<TradeRow>(`trades?select=symbol,side,pnl,status,entry_time,exit_time&user_id=eq.${uid}&account_id=eq.${a.id}&deleted_at=is.null&entry_time=gte.${c.start}`);
      const n = challengeNow(c, trades, today), m = (v: number, sign = false) => money(v, { sign, cur: a.currency, lang });
      parts.push([`🏁 ${a.name} · ${c.name}`, T("stResult", lang, { p: m(n.pnl, true) }) + (n.goal != null ? T("stTarget", lang, { g: m(n.goal) }) : ""),
        ...(n.limit != null ? [T("stToday", lang, { t: m(n.todayPnl, true), r: m(Math.max(0, n.limit + n.todayPnl)), l: m(n.limit) })] : []),
        ...(n.floor != null ? [T("stOverall", lang, { r: m(Math.max(0, n.bal - n.floor)), f: m(n.floor) })] : [])].join("\n"));
    }
    return parts.join("\n\n") || T("noChallenge", lang);
  }

  try {
    // ---- Telegram webhook ----
    if (req.headers.has("x-telegram-bot-api-secret-token")) {
      if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return json({ ok: false }, 401);
      const u = await req.json().catch(() => null), msg = u?.message, chat = msg?.chat?.id, text = typeof msg?.text === "string" ? msg.text.trim() : "";
      if (typeof chat !== "number" || msg?.chat?.type !== "private") return json({ ok: true });
      const userLang = langOf(String(msg?.from?.language_code ?? "").slice(0, 2));
      const linked = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>chat=eq.${chat}&deleted_at=is.null&limit=1`))[0];
      const lang = linked?.value.lang ?? userLang;
      const [cmd, arg] = text.split(/\s+/, 2);
      if (cmd === "/start" && arg) {
        const row = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>codeHash=eq.${await sha256(arg)}&deleted_at=is.null&limit=1`))[0];
        if (!row || !row.value.codeAt || Date.now() - Date.parse(row.value.codeAt) > 30 * 60e3) { await send(chat, T("badCode", userLang)); return json({ ok: true }); }
        if (linked && linked.user_id !== row.user_id) await saveTg(linked.user_id, { ...linked.value, chat: null }); // one chat, one Mizan user
        const name = [msg.from?.first_name, msg.from?.username ? `@${msg.from.username}` : null].filter(Boolean).join(" ").slice(0, 80) || null;
        await saveTg(row.user_id, { ...row.value, chat, name, codeHash: null, codeAt: null });
        await send(chat, T("linked", row.value.lang ?? userLang));
      } else if (!linked) await send(chat, T("unknown", userLang));
      else if (cmd === "/stop") { await saveTg(linked.user_id, { ...linked.value, chat: null }); await send(chat, T("stopped", lang)); }
      else if (cmd === "/status") await send(chat, await statusText(linked.user_id, lang));
      else await send(chat, T("help", lang));
      return json({ ok: true });
    }

    const body = await req.json().catch(() => null);
    const auth = req.headers.get("authorization") ?? "";

    // ---- from mt5-sync (service role): trades the sync just closed ----
    if (body?.action === "sync") {
      if (!SR || auth !== `Bearer ${SR}`) return json({ ok: false, error: "forbidden" }, 403);
      if (!TOKEN) return json({ ok: false, error: "noToken" }, 503);
      const uid = String(body.uid ?? ""), accountId = String(body.accountId ?? ""), now = typeof body.now === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.now) ? body.now : null;
      const t = await getTg(uid);
      if (!t?.chat || !now) return json({ ok: true, sent: 0 });
      const lang = t.lang ?? "en", prefs: Prefs = { trades: true, rules: true, ...(t.prefs ?? {}) }, today = now.slice(0, 10);
      const acc = (await rows<Acc>(`accounts?select=id,name,currency&id=eq.${accountId}&user_id=eq.${uid}&deleted_at=is.null`))[0];
      if (!acc) return json({ ok: true, sent: 0 });
      const lines: string[] = [];
      if (prefs.trades) {
        const since = new Date(Date.parse(`${now}Z`) - 3 * 3600e3).toISOString().slice(0, 16); // broker clock, as the trade times
        const recent = (Array.isArray(body.closed) ? body.closed : []).filter((x: TradeRow) => typeof x?.exit_time === "string" && x.exit_time >= since && Number.isFinite(Number(x.pnl)))
          .sort((a: TradeRow, b: TradeRow) => (a.exit_time as string).localeCompare(b.exit_time as string)) as TradeRow[];
        const m = (v: number) => money(v, { cents: true, sign: true, cur: acc.currency, lang });
        for (const x of recent.slice(0, 5)) lines.push(`${Number(x.pnl) > 0 ? "🟢" : Number(x.pnl) < 0 ? "🔴" : "⚪"} ${x.symbol} ${T(x.side === "short" ? "short" : "long", lang)} ${m(Number(x.pnl))}`);
        if (recent.length > 5) lines.push(T("more", lang, { n: recent.length - 5, m: m(recent.slice(5).reduce((s, x) => s + Number(x.pnl), 0)) }));
      }
      const sent = { ...(t.sent ?? {}) }, newKeys: string[] = [], alerts: string[] = [];
      if (prefs.rules) {
        const list = ((await rows<{ value: Ch[] }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-challenges&deleted_at=is.null`))[0]?.value ?? []).filter((c) => c?.accountId === accountId);
        if (list.length) {
          const trades = await rows<TradeRow>(`trades?select=symbol,side,pnl,status,entry_time,exit_time&user_id=eq.${uid}&account_id=eq.${accountId}&deleted_at=is.null`);
          const m = (v: number) => money(v, { cur: acc.currency, lang });
          for (const c of list) {
            const w = warnings({ ...c, name: `${acc.name} · ${c.name}` }, challengeNow(c, trades, today), today, sent, (k, v) => T(k, lang, v), m);
            alerts.push(...w.out); newKeys.push(...w.keys);
          }
        }
      }
      if (!lines.length && !alerts.length) return json({ ok: true, sent: 0 });
      const text = [lines.length ? `📊 ${acc.name}\n${lines.join("\n")}` : "", alerts.join("\n\n")].filter(Boolean).join("\n\n");
      const r = await send(t.chat, text);
      if (r.ok && newKeys.length) {
        const cut = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10);
        for (const k of Object.keys(sent)) { const d = k.match(/:(\d{4}-\d{2}-\d{2}):/)?.[1]; if (d && d < cut) delete sent[k]; }
        for (const k of newKeys) sent[k] = today;
        await saveTg(uid, { ...t, sent });
      }
      return json({ ok: r.ok, sent: r.ok ? 1 : 0 });
    }

    // ---- from the app (the user's session) ----
    const who = await fetch(`${SB}/auth/v1/user`, { headers: { authorization: auth, apikey: req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "" }, signal: AbortSignal.timeout(10000) });
    if (!who.ok) return json({ ok: false, error: "signIn" }, 401);
    const uid = ((await who.json()) as { id?: string }).id ?? "";
    if (!uid) return json({ ok: false, error: "signIn" }, 401);
    if (!TOKEN) return json({ ok: false, error: "noToken" }, 503);
    const lang = langOf(body?.lang), cur = (await getTg(uid)) ?? {};
    const state = (v: Tg) => ({ linked: !!v.chat, name: v.name ?? null, prefs: { trades: true, rules: true, ...(v.prefs ?? {}) } });

    switch (body?.action) {
      case "info": {
        const me = await (await tg("getMe", {})).json().catch(() => null);
        if (!me?.ok) return json({ ok: false, error: "badToken" }, 502);
        // point the bot here (once): Telegram then sends every message for the bot to this function
        const hook = `${SB}/functions/v1/telegram`, info = await (await tg("getWebhookInfo", {})).json().catch(() => null);
        if (info?.result?.url !== hook || /401|403/.test(info?.result?.last_error_message ?? "")) await tg("setWebhook", { url: hook, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
        if (cur.lang !== lang) await saveTg(uid, { ...cur, lang });
        return json({ ok: true, bot: me.result.username, ...state(cur) });
      }
      case "link": {
        const code = b64url(crypto.getRandomValues(new Uint8Array(18)));
        await saveTg(uid, { ...cur, lang, codeHash: await sha256(code), codeAt: new Date().toISOString() });
        const me = await (await tg("getMe", {})).json().catch(() => null);
        return me?.ok ? json({ ok: true, url: `https://t.me/${me.result.username}?start=${code}` }) : json({ ok: false, error: "badToken" }, 502);
      }
      case "test": {
        if (!cur.chat) return json({ ok: false, error: "notLinked" }, 409);
        const r = await send(cur.chat, T("test", cur.lang ?? lang));
        return json({ ok: r.ok }, r.ok ? 200 : 502);
      }
      case "unlink": {
        if (cur.chat) await send(cur.chat, T("stopped", cur.lang ?? lang)).catch(() => null);
        await saveTg(uid, { ...cur, chat: null, name: null, codeHash: null, codeAt: null });
        return json({ ok: true, ...state({}) });
      }
      case "prefs": {
        const p = body?.prefs ?? {}, next = { ...cur, lang, prefs: { trades: p.trades !== false, rules: p.rules !== false } };
        await saveTg(uid, next);
        return json({ ok: true, ...state(next) });
      }
      default:
        return json({ ok: false, error: "bad request" }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
