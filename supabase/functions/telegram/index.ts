// Supabase Edge Function "telegram": Mizan alerts in Telegram.
//  - Telegram webhook (checked by the X-Telegram-Bot-Api-Secret-Token header): "/start <code>" links the chat to a Mizan
//    user, /status shows the prop challenges now, /stop unlinks.
//  - From the app (the user's session): info (bot name, link state; points the bot's webhook here once), link (a one-time
//    code for the t.me link, valid 30 minutes), test, unlink, prefs.
//  - From mt5-sync (service role): the trades the MT5 sync just closed -> one message with the trades (each with a "note"
//    button that opens it in Mizan), the prop-rule warnings (half / 80% of a loss limit used, limit passed, target
//    reached), 3+ losses in a row, and open trades still without a stop loss after 2 minutes; each warning sent once.
//    Trades just opened get a message each: "in my plan / outside my plan" buttons (a tap is saved in the synced setting
//    "mizan-trade-plan") and, when the trade matches the trader's worst pattern (symbol, hour, weekday, side), a warning.
//  - Voice notes: a voice note sent in reply to a trade's message (its plan or note button names the trade) is turned
//    into text by the AI model and kept with the trade in the synced setting "mizan-trade-voice" (shown in Mizan).
//  - Coach: like the partner, from a one-time invite ("coach_<code>"); one coach can follow many traders. The coach gets
//    the same rule alerts (the trader picks which) and, after the broker's midnight, one message with each trader's
//    discipline score and broken rules. Never amounts or accounts. /leave ends the partner and coach roles of a chat.
//  - Discipline board: the bot added to a Telegram group posts a Join / Leave board; each day after the broker's midnight
//    it posts every member's discipline score out of 100 (stop loss on each trade, trades in the plan, no trade after 3
//    losses in a row, none after a challenge's daily loss limit), and on Sunday the week's ranking. Never amounts or
//    accounts. Kept in tg_state rows "grp:<chat id>"; members opt in themselves (their Telegram linked to Mizan).
//  - Accountability partner: the app makes a one-time invite link (7 days); the partner sees what they would get and
//    accepts or declines with buttons, /leave stops it. When the trader breaks a rule (a trade left without a stop loss,
//    a new trade after 3+ losses in a row today, a new trade after a challenge's daily loss limit), the partner gets one
//    message per rule per day, never amounts or account details, and the trader is told.
//  - "tick" (pg_cron every 5 minutes, migration 20261024_telegram_tick.sql; no key needed: it only sends what is due and
//    runs at most every 4 minutes): MT5 sync stopped for an hour with open trades, yesterday's summary just after the
//    broker's midnight, the week's summary on Sunday from 10:00 (with a tip from the AI model, no account names or
//    numbers sent to it), high-impact news 15 minutes ahead for the currencies the user trades, and on weekdays from
//    08:00 the morning plan of each running challenge (room, a safe risk per trade, the pace to the target) and the rules
//    the trader adopted in the Advisor (synced setting "mizan-advisor-rules") and of their "My own rules" challenges; a
//    trade just opened that breaks one of those rules is named in its message (and, when the trader signed the contract
//    with that wish, the partner and the coach hear of it, without amounts). The loss limits of an own-rules challenge
//    warn at 50%, 80% and past them like a prop challenge's.
// Stored in user_settings "telegram": { chat, name, lang, prefs, codeHash, codeAt, sent, site, tz } (no bot token anywhere
// but here). Setup once: create a bot with @BotFather, add its token as the secret TELEGRAM_BOT_TOKEN, deploy with
// "Verify JWT" off; for the scheduled alerts run the migration once. The weekly tip uses GEMINI_API_KEY (as "advisor").
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
type Lang = "en" | "ar" | "fr";
const PREFS = { trades: true, rules: true, streak: true, nosl: true, stale: true, daily: true, weekly: true, news: true, entry: true, danger: true, morning: true, myRules: true };
type Prefs = typeof PREFS;
const prefsOf = (p?: Partial<Prefs> | null): Prefs => ({ ...PREFS, ...(p ?? {}) });
type Partner = { chat: number; name: string | null; lang: Lang; since: string };
const COACH = { nosl: true, streak: true, limit: true, daily: true }; // what the coach gets, chosen by the trader
type Coach = Partner & { prefs?: Partial<typeof COACH> };
type Tg = { chat?: number | null; name?: string | null; lang?: Lang; prefs?: Partial<Prefs>; codeHash?: string | null; codeAt?: string | null; sent?: Record<string, string>; site?: string | null; tz?: string | null;
  partner?: Partner | null; pcodeHash?: string | null; pcodeAt?: string | null; coach?: Coach | null; ccodeHash?: string | null; ccodeAt?: string | null };
type Rule = "nosl" | "streak" | "limit" | "own";
type Ch = { id: string; accountId: string; name: string; start: string; size: number; target: number | null; daily: number | null; dailyBase: "size" | "dayStart"; max: number | null; trailing: boolean; trailLock?: boolean; minDays: number; limitDays?: number | null;
  kind?: "self" | "own"; own?: ORules; ownNext?: { rules: ORules; from: string }; ownPast?: { until: string; rules: ORules }[]; signed?: { name?: string; notify?: boolean } };
/** The rules of a "My own rules" challenge (the app's lib/ownRules.ts): limits in money or % of the size; times and the
 *  changes of the rules on the broker's clock. */
type Lim = { v: number; unit: "money" | "pct" };
type ORules = { daily?: Lim; weekly?: Lim; monthly?: Lim; overall?: Lim; perTrade?: Lim; lots?: number; sl?: boolean; maxTrades?: number; streak?: number; lock?: Lim; cool?: number;
  hours?: [number, number]; daysOff?: number[]; only?: string[]; avoid?: string[]; side?: "long" | "short"; goal?: Lim; onBreak?: "warn" | "day" | "end" };
type TradeRow = { key?: string; symbol: string; side: string; pnl: number | null; status: string; entry_time: string | null; exit_time: string | null; sl?: number | null };
type OpenRow = { key: string; symbol: string; side: string; qty: number; entry_time: string };
type Acc = { id: string; name: string; currency: string | null };
type Grp = { title?: string; lang?: Lang; members: string[]; day?: string; week?: string };
type DayTrade = TradeRow & { key: string; account_id: string };
type Sync = { brokerNow?: string; last?: string };
type Btn = { text: string; url?: string; callback_data?: string };
type Hist = { symbol: string; side: string; pnl: number | null; entry_time: string | null };
type Danger = { kind: "symHour" | "sideSym" | "sym" | "hour" | "day"; n: number; lost: number; net: number };
type Cal = { id: string; time: string; currency: string; title: string; forecast: string; previous: string };
type Level = { v: number; unit: "money" | "R" };
/** A rule adopted in the Advisor: the What-if rules it stands for (only those set), from day `at` (YYYY-MM-DD). */
type WRules = { streak?: number | null; dayLoss?: number | null; dayGain?: number | null; maxDay?: number | null; skipDays?: number[]; hours?: [number, number] | null; skipSymbols?: string[]; side?: "both" | "long" | "short"; sl?: Level | null; tp?: Level | null };
type MyRule = { id: string; rules: WRules; at: string };

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
  note: { en: "📝 Note · {s}", ar: "📝 ملاحظة · {s}", fr: "📝 Note · {s}" },
  entry: { en: "📥 {a}: new trade {s} {d} {q} ({h})", ar: "📥 {a}: صفقة جديدة {s} {d} {q} ({h})", fr: "📥 {a} : nouveau trade {s} {d} {q} ({h})" },
  ask: { en: "Is it in your plan?", ar: "هل هي ضمن خطتك؟", fr: "Est-il dans votre plan ?" },
  planYes: { en: "✅ In my plan", ar: "✅ ضمن خطتي", fr: "✅ Dans mon plan" },
  planNo: { en: "❌ Outside my plan", ar: "❌ خارج خطتي", fr: "❌ Hors de mon plan" },
  planSaved: { en: "Saved ✓", ar: "حُفظ ✓", fr: "Enregistré ✓" },
  gIntro: { en: "📋 Mizan discipline board\nEach day I post a discipline score out of 100 for every member who joins: a stop loss on every trade, trades in the plan, stopping after 3 losses in a row, and respecting a challenge's daily loss limit. Never amounts or account details.\nTo join, link your Telegram to Mizan first (Profile › Telegram alerts), then tap Join.", ar: "📋 لوحة الانضباط من ميزان\nكل يوم أنشر درجة انضباط من 100 لكل عضو ينضم، تُحسب من: وقف الخسارة في كل صفقة، والصفقات ضمن الخطة، والتوقف بعد 3 خسائر متتالية، واحترام حد الخسارة اليومي في التحديات. بلا أي مبالغ أو تفاصيل حسابات.\nللانضمام: اربط تيليغرام بميزان أولاً (الحساب الشخصي › تنبيهات تيليغرام)، ثم اضغط «انضمام».", fr: "📋 Tableau de discipline Mizan\nChaque jour, je publie une note de discipline sur 100 pour chaque membre inscrit : un stop loss sur chaque trade, des trades dans le plan, l'arrêt après 3 pertes d'affilée et le respect de la limite de perte journalière des challenges. Jamais de montants ni de détails de compte.\nPour rejoindre : liez d'abord votre Telegram à Mizan (Profil › Alertes Telegram), puis appuyez sur Rejoindre." },
  gJoin: { en: "✅ Join", ar: "✅ انضمام", fr: "✅ Rejoindre" },
  gLeave: { en: "Leave", ar: "مغادرة", fr: "Quitter" },
  gJoined: { en: "Joined ✓ Your score will be posted here each day.", ar: "تم الانضمام ✓ ستُنشر درجتك هنا كل يوم.", fr: "Inscrit ✓ Votre note sera publiée ici chaque jour." },
  gLeft: { en: "Done: you are off the board.", ar: "تم: لم تعد في اللوحة.", fr: "C'est fait : vous n'êtes plus sur le tableau." },
  gLink: { en: "Link your Telegram to Mizan first: Profile › Telegram alerts.", ar: "اربط تيليغرام بميزان أولاً: الحساب الشخصي › تنبيهات تيليغرام.", fr: "Liez d'abord votre Telegram à Mizan : Profil › Alertes Telegram." },
  gDay: { en: "📋 Discipline board · {d}", ar: "📋 لوحة الانضباط · {d}", fr: "📋 Tableau de discipline · {d}" },
  gWeek: { en: "🏆 Discipline ranking of the week · {d}", ar: "🏆 ترتيب الانضباط للأسبوع · {d}", fr: "🏆 Classement de discipline de la semaine · {d}" },
  gNone: { en: "no trades", ar: "لم يتداول", fr: "aucun trade" },
  fNoSl: { en: "without SL: {k}", ar: "بلا وقف خسارة: {k}", fr: "sans SL : {k}" },
  fOut: { en: "outside the plan: {k}", ar: "خارج الخطة: {k}", fr: "hors plan : {k}" },
  fStreak: { en: "traded on after 3 losses", ar: "واصل بعد 3 خسائر", fr: "a continué après 3 pertes" },
  fLimit: { en: "traded after the daily limit", ar: "تداول بعد الحد اليومي", fr: "a tradé après la limite du jour" },
  vSaved: { en: "🎙️ Voice note saved with your {s} trade ✓\n\n“{t}”", ar: "🎙️ حُفظت الملاحظة الصوتية مع صفقة {s} ✓\n\n«{t}»", fr: "🎙️ Note vocale enregistrée avec votre trade {s} ✓\n\n« {t} »" },
  vReply: { en: "To keep a voice note with a trade, send it as a reply to that trade's message (swipe the message, or hold it and tap Reply).", ar: "لحفظ ملاحظة صوتية مع صفقة، أرسلها ردّاً على رسالة تلك الصفقة: اسحب الرسالة، أو اضغط عليها مطولاً ثم «رد».", fr: "Pour garder une note vocale avec un trade, envoyez-la en réponse au message de ce trade (glissez le message, ou appuyez longuement puis Répondre)." },
  vMany: { en: "This message has several trades: reply to the “new trade” message of the one you mean.", ar: "هذه الرسالة فيها أكثر من صفقة: أرسل الملاحظة ردّاً على رسالة «صفقة جديدة» الخاصة بالصفقة التي تقصدها.", fr: "Ce message contient plusieurs trades : répondez au message « nouveau trade » de celui que vous visez." },
  vLong: { en: "Voice notes can be up to 3 minutes long.", ar: "مدة الملاحظة الصوتية حتى 3 دقائق.", fr: "Les notes vocales peuvent durer jusqu'à 3 minutes." },
  vFail: { en: "I couldn't turn this voice note into text. Try again, or write the note in Mizan.", ar: "تعذّر تحويل هذه الملاحظة الصوتية إلى نص. أعد المحاولة، أو اكتب الملاحظة في ميزان.", fr: "Impossible de transformer cette note vocale en texte. Réessayez, ou écrivez la note dans Mizan." },
  dsymHour: { en: "⚠️ Danger zone: your trades on {s} between {h1} and {h2} lost {l} of {n} ({p}).", ar: "⚠️ منطقة خطر: صفقاتك على {s} بين {h1} و{h2} خسرت {l} من {n} ({p}).", fr: "⚠️ Zone de danger : vos trades sur {s} entre {h1} et {h2} ont perdu {l} sur {n} ({p})." },
  dsideSym: { en: "⚠️ Danger zone: your {d} trades on {s} lost {l} of {n} ({p}).", ar: "⚠️ منطقة خطر: صفقات {d} عندك على {s} خسرت {l} من {n} ({p}).", fr: "⚠️ Zone de danger : vos trades {d} sur {s} ont perdu {l} sur {n} ({p})." },
  dsym: { en: "⚠️ Danger zone: your trades on {s} lost {l} of {n} ({p}).", ar: "⚠️ منطقة خطر: صفقاتك على {s} خسرت {l} من {n} ({p}).", fr: "⚠️ Zone de danger : vos trades sur {s} ont perdu {l} sur {n} ({p})." },
  dhour: { en: "⚠️ Danger zone: your trades opened between {h1} and {h2} lost {l} of {n} ({p}).", ar: "⚠️ منطقة خطر: صفقاتك المفتوحة بين {h1} و{h2} خسرت {l} من {n} ({p}).", fr: "⚠️ Zone de danger : vos trades ouverts entre {h1} et {h2} ont perdu {l} sur {n} ({p})." },
  dday: { en: "⚠️ Danger zone: your trades on {w} lost {l} of {n} ({p}).", ar: "⚠️ منطقة خطر: صفقاتك يوم {w} خسرت {l} من {n} ({p}).", fr: "⚠️ Zone de danger : vos trades du {w} ont perdu {l} sur {n} ({p})." },
  planLine: { en: "📋 In your plan: {i} · outside it: {o}", ar: "📋 ضمن خطتك: {i} · خارجها: {o}", fr: "📋 Dans votre plan : {i} · hors plan : {o}" },
  pInvite: { en: "🤝 {n} invites you to be their trading accountability partner. You will get a short message when they break one of their rules: a trade without a stop loss, trading on after 3 losses in a row, or a new trade after their daily loss limit. Never amounts or account details.", ar: "🤝 {n} يدعوك لتكون شريك الالتزام في تداوله. ستصلك رسالة قصيرة إذا كسر إحدى قواعده: صفقة بلا وقف خسارة، أو مواصلة التداول بعد ثلاث خسائر متتالية، أو صفقة جديدة بعد بلوغ حد خسارته اليومي. دون أي مبالغ أو تفاصيل حساب.", fr: "🤝 {n} vous invite à être son partenaire de discipline. Vous recevrez un court message quand il enfreint une de ses règles : un trade sans stop loss, continuer après 3 pertes d'affilée, ou un nouveau trade après sa limite de perte du jour. Jamais de montants ni de détails de compte." },
  pAccept: { en: "✅ Accept", ar: "✅ أقبل", fr: "✅ J'accepte" },
  pDecline: { en: "❌ No thanks", ar: "❌ لا شكراً", fr: "❌ Non merci" },
  pAccepted: { en: "Done ✓ You are {n}'s accountability partner. /leave stops it at any time.", ar: "تم ✓ أصبحت شريك الالتزام لـ {n}. ‏/leave لإيقاف ذلك متى شئت.", fr: "C'est fait ✓ Vous êtes le partenaire de discipline de {n}. /leave pour arrêter à tout moment." },
  pNow: { en: "🤝 {p} accepted: they are now your accountability partner.", ar: "🤝 قبل {p}: أصبح شريك الالتزام لك.", fr: "🤝 {p} a accepté : c'est maintenant votre partenaire de discipline." },
  pDeclined: { en: "No problem. Nothing was shared.", ar: "لا مشكلة. لم تتم مشاركة أي شيء.", fr: "Pas de souci. Rien n'a été partagé." },
  pDeclinedT: { en: "{p} declined your partner invite.", ar: "رفض {p} دعوتك لشراكة الالتزام.", fr: "{p} a refusé votre invitation de partenaire." },
  pExpired: { en: "This invite has expired or was replaced. Ask for a new one.", ar: "انتهت صلاحية هذه الدعوة أو استُبدلت. اطلب دعوة جديدة.", fr: "Cette invitation a expiré ou a été remplacée. Demandez-en une nouvelle." },
  pSelf: { en: "You can't be your own partner: send this link to a friend.", ar: "لا يمكنك أن تكون شريك نفسك: أرسل هذا الرابط لصديق.", fr: "Vous ne pouvez pas être votre propre partenaire : envoyez ce lien à un ami." },
  pLeft: { en: "You are no longer the accountability partner of: {n}.", ar: "لم تعد شريك الالتزام لـ: {n}.", fr: "Vous n'êtes plus le partenaire de discipline de : {n}." },
  pLeftT: { en: "{p} stopped being your accountability partner.", ar: "أوقف {p} شراكة الالتزام معك.", fr: "{p} n'est plus votre partenaire de discipline." },
  pEnded: { en: "{n} ended the accountability partnership.", ar: "أنهى {n} شراكة الالتزام معك.", fr: "{n} a mis fin au partenariat de discipline." },
  pGone: { en: "{p} can no longer receive messages from the bot: the partnership ended.", ar: "لم يعد {p} يستقبل رسائل البوت، فانتهت الشراكة.", fr: "{p} ne reçoit plus les messages du bot : le partenariat est terminé." },
  pHelp: { en: "You are the accountability partner of: {n}. /leave stops it.", ar: "أنت شريك الالتزام لـ: {n}. ‏/leave لإيقاف ذلك.", fr: "Vous êtes le partenaire de discipline de : {n}. /leave pour arrêter." },
  cInvite: { en: "🎓 {n} invites you to be their trading coach. Each day you will get their discipline score out of 100 and the rules they broke, and a short alert when they break one (a trade without a stop loss, trading on after 3 losses in a row, a new trade after the daily loss limit). Never amounts or account details.", ar: "🎓 {n} يدعوك لتكون مدرّبه في التداول. ستصلك كل يوم درجة انضباطه من 100 والقواعد التي كسرها، وتنبيه قصير عندما يكسر قاعدة (صفقة بلا وقف خسارة، أو مواصلة التداول بعد 3 خسائر متتالية، أو صفقة جديدة بعد بلوغ حد الخسارة اليومي). بلا أي مبالغ أو تفاصيل حسابات.", fr: "🎓 {n} vous invite à être son coach de trading. Chaque jour, vous recevrez sa note de discipline sur 100 et les règles enfreintes, et une courte alerte quand il en enfreint une (un trade sans stop loss, continuer après 3 pertes d'affilée, un nouveau trade après la limite de perte du jour). Jamais de montants ni de détails de compte." },
  cAccepted: { en: "Done ✓ You are {n}'s coach. /leave stops it at any time.", ar: "تم ✓ أصبحت مدرّب {n}. ‏/leave لإيقاف ذلك متى شئت.", fr: "C'est fait ✓ Vous êtes le coach de {n}. /leave pour arrêter à tout moment." },
  cNow: { en: "🎓 {p} accepted: they are now your coach.", ar: "🎓 قبل {p}: أصبح مدرّبك.", fr: "🎓 {p} a accepté : c'est maintenant votre coach." },
  cDeclinedT: { en: "{p} declined your coach invite.", ar: "رفض {p} دعوتك ليكون مدرّبك.", fr: "{p} a refusé votre invitation de coach." },
  cSelf: { en: "You can't be your own coach: send this link to your coach.", ar: "لا يمكنك أن تكون مدرّب نفسك: أرسل هذا الرابط لمدرّبك.", fr: "Vous ne pouvez pas être votre propre coach : envoyez ce lien à votre coach." },
  cLeft: { en: "You are no longer the coach of: {n}.", ar: "لم تعد مدرّباً لـ: {n}.", fr: "Vous n'êtes plus le coach de : {n}." },
  cLeftT: { en: "{p} stopped being your coach.", ar: "توقف {p} عن تدريبك.", fr: "{p} n'est plus votre coach." },
  cEnded: { en: "{n} ended the coaching.", ar: "أنهى {n} التدريب معك.", fr: "{n} a mis fin au coaching." },
  cGone: { en: "{p} can no longer receive messages from the bot: the coaching ended.", ar: "لم يعد {p} يستقبل رسائل البوت، فانتهى التدريب.", fr: "{p} ne reçoit plus les messages du bot : le coaching est terminé." },
  cHelp: { en: "You coach: {n}. /leave stops it.", ar: "أنت مدرّب: {n}. ‏/leave لإيقاف ذلك.", fr: "Vous coachez : {n}. /leave pour arrêter." },
  cRule: { en: "🎓 {n} broke a rule: {r} ({s}, {h}).", ar: "🎓 {n} كسر قاعدة: {r} ({s}، {h}).", fr: "🎓 {n} a enfreint une règle : {r} ({s}, {h})." },
  cTold: { en: "🎓 Your coach {p} was told: {r}.", ar: "🎓 أُبلغ مدرّبك {p}: {r}.", fr: "🎓 Votre coach {p} a été prévenu : {r}." },
  cDay: { en: "🎓 Your traders · {d}", ar: "🎓 متداولوك · {d}", fr: "🎓 Vos traders · {d}" },
  rnosl: { en: "a trade without a stop loss", ar: "صفقة بلا وقف خسارة", fr: "un trade sans stop loss" },
  rstreak: { en: "trading on after {k} losses in a row", ar: "مواصلة التداول بعد {k} خسائر متتالية", fr: "continuer après {k} pertes d'affilée" },
  rlimit: { en: "a new trade after the daily loss limit", ar: "صفقة جديدة بعد بلوغ حد الخسارة اليومي", fr: "un nouveau trade après la limite de perte du jour" },
  bRule: { en: "🤝 {n} broke a rule: {r} ({s}, {h}). A short message from you can help.", ar: "🤝 {n} كسر قاعدة: {r} ({s}، {h}). رسالة قصيرة منك قد تساعده.", fr: "🤝 {n} a enfreint une règle : {r} ({s}, {h}). Un petit message de votre part peut l'aider." },
  tTold: { en: "🤝 Your partner {p} was told: {r}.", ar: "🤝 أُبلغ شريكك {p}: {r}.", fr: "🤝 Votre partenaire {p} a été prévenu : {r}." },
  mHead: { en: "☀️ Morning plan · {d}", ar: "☀️ خطة الصباح · {d}", fr: "☀️ Plan du matin · {d}" },
  myHead: { en: "📌 Your rules today", ar: "📌 قواعدك اليوم", fr: "📌 Vos règles aujourd'hui" },
  noTrading: { en: "⛔ No trading today: it is one of your rules.", ar: "⛔ لا تداول اليوم: هذه إحدى قواعدك.", fr: "⛔ Pas de trading aujourd'hui : c'est une de vos règles." },
  breaks: { en: "⛔ This trade breaks your rule: {r}", ar: "⛔ هذه الصفقة تكسر قاعدتك: {r}", fr: "⛔ Ce trade enfreint votre règle : {r}" },
  oWeek: { en: "Stop for the week once you are down {v}", ar: "توقّف لبقية الأسبوع عندما تخسر {v}", fr: "Arrêtez la semaine dès {v} de perte" },
  oMonth: { en: "Stop for the month once you are down {v}", ar: "توقّف لبقية الشهر عندما تخسر {v}", fr: "Arrêtez le mois dès {v} de perte" },
  oAll: { en: "Stop once you are down {v} in all", ar: "توقّف عندما تبلغ خسارتك الكلية {v}", fr: "Arrêtez dès {v} de perte au total" },
  oTrade: { en: "Lose at most {v} on one trade", ar: "لا تخسر أكثر من {v} في الصفقة الواحدة", fr: "Pas plus de {v} de perte par trade" },
  oLots: { en: "At most {v} lots a trade", ar: "{v} لوت كحد أقصى للصفقة", fr: "Au plus {v} lots par trade" },
  oSl: { en: "A stop loss on every trade", ar: "وقف خسارة لكل صفقة", fr: "Un stop loss sur chaque trade" },
  oCool: { en: "Wait {v} min after a loss", ar: "انتظر {v} دقيقة بعد كل خسارة", fr: "Attendez {v} min après une perte" },
  oOnly: { en: "Trade only {v}", ar: "تداول فقط {v}", fr: "Tradez seulement {v}" },
  rown: { en: "their own rule “{k}”", ar: "قاعدته الخاصة «{k}»", fr: "sa propre règle « {k} »" },
  rownMe: { en: "your own rule “{k}”", ar: "قاعدتك الخاصة «{k}»", fr: "votre propre règle « {k} »" },
  mDay: { en: "room today {r}", ar: "الهامش اليوم {r}", fr: "marge du jour {r}" },
  mAll: { en: "overall room {r}", ar: "الهامش الكلي {r}", fr: "marge totale {r}" },
  mRisk: { en: "Max risk per trade: {r} (3 losses in a row stay inside your limits)", ar: "أقصى مخاطرة للصفقة: {r} (حتى ثلاث خسائر متتالية تبقيك داخل حدودك)", fr: "Risque max par trade : {r} (3 pertes d'affilée restent dans vos limites)" },
  mLeft: { en: "Target: {l} left", ar: "الهدف: بقي {l}", fr: "Objectif : reste {l}" },
  mPace: { en: " · {t} trading days left · about {p} a day", ar: " · بقي {t} {w} للتداول · نحو {p} في اليوم", fr: " · {t} jours de trading restants · environ {p} par jour" },
  mReached: { en: "Target reached ✓: trade small until the minimum days are met ({d} of {m})", ar: "تم بلوغ الهدف ✓: تداول بحجم صغير حتى تكتمل الأيام الدنيا ({d} من {m})", fr: "Objectif atteint ✓ : tradez petit jusqu'au minimum de jours ({d} sur {m})" },
  mDays: { en: "Trading days: {d} of {m}", ar: "أيام التداول: {d} من {m}", fr: "Jours de trading : {d} sur {m}" },
  streak: { en: "🛑 {a}: {n} losses in a row ({s}). Stop and take a break before the next trade.", ar: "🛑 {a}: {n} خسائر متتالية ({s}). توقف وخذ استراحة قبل الصفقة القادمة.", fr: "🛑 {a} : {n} pertes d'affilée ({s}). Arrêtez-vous et faites une pause avant le prochain trade." },
  nosl: { en: "⚠️ {a}: {s} {d} {q} has no stop loss (open since {h}).", ar: "⚠️ {a}: صفقة {s} {d} {q} بلا وقف خسارة (مفتوحة منذ {h}).", fr: "⚠️ {a} : {s} {d} {q} sans stop loss (ouvert depuis {h})." },
  stale: { en: "📡 {a}: no sync from MT5 since {t}, with open trades ({n}). Is MT5 closed or is the computer asleep?", ar: "📡 {a}: لم تصل مزامنة من MT5 منذ {t}، وما زالت صفقات مفتوحة ({n}). هل أُغلق MT5 أو نام الحاسوب؟", fr: "📡 {a} : aucune synchro MT5 depuis {t}, avec des trades ouverts ({n}). MT5 est-il fermé ou l'ordinateur en veille ?" },
  dayHead: { en: "📅 Day summary · {d}", ar: "📅 ملخص اليوم · {d}", fr: "📅 Bilan du jour · {d}" },
  weekHead: { en: "🗓️ Your week · {d}", ar: "🗓️ أسبوعك · {d}", fr: "🗓️ Votre semaine · {d}" },
  sumLine: { en: "{a}: {p} · {n} {w} · win rate {r}%", ar: "{a}: {p} · {n} {w} · نسبة الفوز {r}%", fr: "{a} : {p} · {n} {w} · taux de réussite {r} %" },
  bestWorst: { en: "Best {b} · Worst {w}", ar: "الأفضل {b} · الأسوأ {w}", fr: "Meilleur {b} · Pire {w}" },
  newsHead: { en: "📰 High-impact news in {m} min", ar: "📰 خبر قوي بعد {m} دقيقة", fr: "📰 Annonce majeure dans {m} min" },
  newsFc: { en: " (forecast {f} · previous {p})", ar: " (المتوقع {f} · السابق {p})", fr: " (prévision {f} · précédent {p})" },
  newsTail: { en: "Check your open trades and stops.", ar: "راجع صفقاتك المفتوحة ووقف الخسارة.", fr: "Vérifiez vos trades ouverts et vos stops." },
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

/** The morning numbers of a running challenge: room today and overall, a risk per trade that keeps 3 losses in a row
 *  inside both limits, what is left of the target and the pace over the weekdays left. Null once it is over (under the
 *  floor, out of time, or passed: target and minimum days met). */
export function morningPlan(c: Ch, n: ReturnType<typeof challengeNow>, today: string) {
  const at = (d: string) => Date.parse(`${d}T00:00:00Z`), used = Math.round((at(today) - at(c.start)) / 864e5) + 1; // calendar days, today included
  if (n.floor != null && n.bal < n.floor - 1e-9) return null;
  if (c.limitDays != null && c.limitDays > 0 && used > c.limitDays) return null;
  const reached = n.goal != null && n.pnl >= n.goal - 1e-9;
  if (reached && n.days >= c.minDays) return null;
  const dayRoom = n.limit != null ? Math.max(0, n.limit + n.todayPnl) : null, allRoom = n.floor != null ? Math.max(0, n.bal - n.floor) : null;
  const rooms = [dayRoom, allRoom].filter((x): x is number => x != null);
  const left = n.goal != null ? Math.max(0, n.goal - n.pnl) : null;
  let tdLeft: number | null = null;
  if (c.limitDays != null && c.limitDays > 0) {
    tdLeft = 0;
    for (let d = at(today), end = at(c.start) + (c.limitDays - 1) * 864e5; d <= end; d += 864e5) { const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6) tdLeft++; }
  }
  return { dayRoom, allRoom, risk: rooms.length ? Math.min(...rooms) / 3 : null, left, reached, tdLeft, pace: left != null && tdLeft ? left / tdLeft : null, days: n.days, minDays: c.minDays };
}
/** Losses in a row at the top of closed trades listed newest first (a trade at 0 or better ends the run). */
export function lossStreak(newestFirst: { pnl: number | null }[]) {
  let n = 0, sum = 0;
  for (const t of newestFirst) { const p = Number(t.pnl); if (t.pnl == null || !(p < 0)) break; n++; sum += p; }
  return { n, sum };
}
/** One trader's discipline on broker day `d` (trades entered that day): the score out of 100 is the mean of the rules that
 *  apply (stop loss set, in the plan when answered, no entry after 3 losses in a row that day on the account, none after a
 *  challenge's daily loss limit was reached); null without a trade that day. `trades` must reach back to the challenges' start. */
export function disciplineDay(trades: DayTrade[], plan: Record<string, boolean>, chs: Ch[], d: string) {
  const entered = trades.filter((t) => day(t.entry_time) === d && t.entry_time);
  if (!entered.length) return null;
  const n = entered.length, noSl = entered.filter((t) => !(Number(t.sl) > 0)).length;
  const answered = entered.filter((t) => typeof plan[t.key] === "boolean"), out = answered.filter((t) => plan[t.key] === false).length;
  let afterStreak = 0, afterLimit = 0, limitRule = false;
  for (const t of entered) {
    const before = trades.filter((x) => x.account_id === t.account_id && x.status === "closed" && x.pnl != null && x.exit_time && day(x.exit_time) === d && x.exit_time < (t.entry_time as string))
      .sort((a, b) => (b.exit_time as string).localeCompare(a.exit_time as string));
    if (lossStreak(before).n >= 3) afterStreak++;
    const lim = chs.filter((c) => c.accountId === t.account_id && c.daily != null && c.start <= d);
    if (lim.length) limitRule = true;
    const lost = -before.reduce((a, x) => a + Number(x.pnl), 0);
    if (lim.some((c) => { const v = challengeNow(c, trades.filter((x) => x.account_id === c.accountId), d).limit; return v != null && v > 0 && lost >= v - 1e-9; })) afterLimit++;
  }
  const parts = [1 - noSl / n, ...(answered.length ? [1 - out / answered.length] : []), 1 - afterStreak / n, ...(limitRule ? [1 - afterLimit / n] : [])];
  return { score: Math.round((100 * parts.reduce((a, b) => a + b, 0)) / parts.length), n, noSl, out, afterStreak, afterLimit };
}
const naive = (s: string) => Date.parse(`${s.replace(" ", "T").slice(0, 16)}Z`); // a journal time (broker clock) as UTC ms
/** Open trades still without a stop loss 2 minutes after the entry (both on the broker clock), not warned about yet. */
export function noSlDue(open: OpenRow[], brokerNow: number, sent: Record<string, string>) {
  return open.filter((x) => typeof x?.key === "string" && typeof x.symbol === "string" && typeof x.entry_time === "string" && brokerNow - naive(x.entry_time) >= 2 * 60e3)
    .map((x) => ({ ...x, k: `nosl:${x.entry_time.slice(0, 10)}:${x.key}` }))
    .filter((x) => !sent[x.k]);
}
/** The worst pattern of the trader's own closed trades that a new trade matches (same symbol and entry hour, same side on
 *  the symbol, the symbol, the entry hour, the weekday; broker clock): at least 6 trades over 3 days or more (one bad day
 *  is not a pattern), two thirds or more of them lost, and a net loss. The most specific pattern wins a tie. */
export function dangerOf(x: { symbol: string; side: string; entry_time: string }, hist: Hist[]): Danger | null {
  const hour = (s: string) => Number(s.replace(" ", "T").slice(11, 13)), wd = (s: string) => new Date(naive(s)).getUTCDay();
  const xh = hour(x.entry_time), xd = wd(x.entry_time);
  const closed = hist.filter((t) => t.pnl != null && Number.isFinite(Number(t.pnl)) && typeof t.entry_time === "string");
  const groups: [Danger["kind"], (t: Hist) => boolean][] = [
    ["symHour", (t) => t.symbol === x.symbol && hour(t.entry_time as string) === xh],
    ["sideSym", (t) => t.symbol === x.symbol && t.side === x.side],
    ["sym", (t) => t.symbol === x.symbol],
    ["hour", (t) => hour(t.entry_time as string) === xh],
    ["day", (t) => wd(t.entry_time as string) === xd],
  ];
  let best: Danger | null = null;
  for (const [kind, test] of groups) {
    const l = closed.filter(test), n = l.length, lost = l.filter((t) => Number(t.pnl) < 0).length, net = l.reduce((a, t) => a + Number(t.pnl), 0);
    if (n < 6 || lost / n < 2 / 3 - 1e-9 || net >= 0 || new Set(l.map((t) => (t.entry_time as string).slice(0, 10))).size < 3) continue;
    if (!best || lost / n > best.lost / best.n + 1e-9) best = { kind, n, lost, net };
  }
  return best;
}
const WEEKDAY: Record<Lang, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  fr: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
};
/** An adopted Advisor rule in words (the app's wording, short); a time range is kept left to right in Arabic. */
export function ruleText(r: WRules, lang: Lang, cur: string | null): string {
  const L = (en: string, ar: string, fr: string) => (lang === "ar" ? ar : lang === "fr" ? fr : en);
  const m = (v: number) => money(v, { cur, lang }), lv = (l: Level) => (l.unit === "R" ? `${l.v}R` : m(l.v));
  const hhm = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;
  const range = (a: number, b: number) => (lang === "ar" ? `\u2066${hhm(a)}–${hhm(b)}\u2069` : `${hhm(a)}–${hhm(b)}`);
  const out: string[] = [];
  if (r.streak != null) { const n = r.streak; out.push(L(`Stop after ${n} losses in a row`, `توقّف بعد ${n === 2 ? "خسارتين متتاليتين" : n <= 10 ? `${n} خسائر متتالية` : `${n} خسارة متتالية`}`, `Arrêtez après ${n} pertes d'affilée`)); }
  if (r.maxDay != null) { const n = r.maxDay; out.push(L(`At most ${n} trade${n === 1 ? "" : "s"} a day`, `${n === 1 ? "صفقة واحدة" : n === 2 ? "صفقتان" : n <= 10 ? `${n} صفقات` : `${n} صفقة`} كحد أقصى في اليوم`, `Au plus ${n} trade${n === 1 ? "" : "s"} par jour`)); }
  if (r.dayLoss != null) out.push(L(`Stop for the day once you are down ${m(r.dayLoss)}`, `توقّف لبقية اليوم عندما تخسر ${m(r.dayLoss)}`, `Arrêtez la journée dès ${m(r.dayLoss)} de perte`));
  if (r.dayGain != null) out.push(L(`Stop for the day once you are up ${m(r.dayGain)}`, `توقّف لبقية اليوم عندما تربح ${m(r.dayGain)}`, `Arrêtez la journée dès ${m(r.dayGain)} de gain`));
  if (r.skipDays?.length) { const d = r.skipDays.map((x) => WEEKDAY[lang][(x + 1) % 7]).join(lang === "ar" ? "، " : ", "); out.push(L(`No trading on ${d}`, `لا تداول يوم ${d}`, `Pas de trading le ${d}`)); }
  if (r.hours && r.hours[0] !== r.hours[1]) { const [a, b] = r.hours; out.push(a < b ? L(`Trade only ${range(a, b)}`, `تداول فقط بين ${range(a, b)}`, `Tradez seulement ${range(a, b)}`) : L(`Avoid ${range(b, a)}`, `تجنّب ${range(b, a)}`, `Évitez ${range(b, a)}`)); }
  if (r.skipSymbols?.length) { const x = r.skipSymbols.join(", "); out.push(L(`Leave ${x} aside`, `اترك ${x} جانباً`, `Mettez ${x} de côté`)); }
  if (r.side && r.side !== "both") out.push(L(`Only ${r.side === "long" ? "longs" : "shorts"}`, `اكتفِ بصفقات ${r.side === "long" ? "الشراء" : "البيع"}`, `Seulement les ${r.side === "long" ? "achats" : "ventes"}`));
  if (r.sl) out.push(L(`Stop loss at ${lv(r.sl)}`, `وقف خسارة عند ${lv(r.sl)}`, `Stop loss à ${lv(r.sl)}`));
  if (r.tp) out.push(L(`Take profit at ${lv(r.tp)}`, `جني الربح عند ${lv(r.tp)}`, `Take profit à ${lv(r.tp)}`));
  return out.join(" · ");
}
/** Whether a trade just opened breaks an adopted rule, after the day's trades so far (opened before it, closed today: their
 *  result and the losses in a row at the end). A stop or target rule is about the exit, not about taking the trade. */
export function ruleBroken(r: WRules, x: { symbol: string; side: string; entry_time: string }, today: { n: number; net: number; run: number }) {
  const t = x.entry_time.replace(" ", "T"), h = Number(t.slice(11, 13)), wd = (new Date(`${t.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7;
  if (r.skipSymbols?.includes(x.symbol)) return true;
  if (r.side && r.side !== "both" && r.side !== x.side) return true;
  if (r.skipDays?.includes(wd)) return true;
  if (r.hours) { const [a, b] = r.hours; if (a !== b && !(a < b ? h >= a && h < b : h >= a || h < b)) return true; }
  if (r.maxDay != null && today.n >= r.maxDay) return true;
  if (r.streak != null && today.run >= r.streak) return true;
  if (r.dayLoss != null && today.net <= -r.dayLoss + 1e-9) return true;
  if (r.dayGain != null && today.net >= r.dayGain - 1e-9) return true;
  return false;
}
// ---------- "My own rules" challenges (as the app's lib/ownRules.ts) ----------
const OKEYS = ["daily", "weekly", "monthly", "overall", "perTrade", "lots", "sl", "maxTrades", "streak", "lock", "cool", "hours", "daysOff", "only", "avoid", "side"] as const;
type OKey = (typeof OKEYS)[number];
const ONAME: Record<OKey, Record<Lang, string>> = {
  daily: { en: "daily loss limit", ar: "حد الخسارة اليومية", fr: "perte max du jour" }, weekly: { en: "weekly loss limit", ar: "حد الخسارة الأسبوعية", fr: "perte max de la semaine" },
  monthly: { en: "monthly loss limit", ar: "حد الخسارة الشهرية", fr: "perte max du mois" }, overall: { en: "overall loss limit", ar: "حد الخسارة الكلية", fr: "perte max totale" },
  perTrade: { en: "max loss per trade", ar: "أقصى خسارة للصفقة", fr: "perte max par trade" }, lots: { en: "max volume", ar: "أقصى حجم", fr: "volume max" },
  sl: { en: "a stop loss on every trade", ar: "وقف خسارة لكل صفقة", fr: "un stop loss sur chaque trade" }, maxTrades: { en: "trades a day", ar: "عدد الصفقات في اليوم", fr: "trades par jour" },
  streak: { en: "losses in a row", ar: "الخسائر المتتالية", fr: "pertes d'affilée" }, lock: { en: "profit lock", ar: "قفل الربح", fr: "verrou de gain" },
  cool: { en: "pause after a loss", ar: "الاستراحة بعد الخسارة", fr: "pause après une perte" }, hours: { en: "trading hours", ar: "ساعات التداول", fr: "heures de trading" },
  daysOff: { en: "a day off", ar: "يوم الراحة", fr: "jour de repos" }, only: { en: "allowed markets", ar: "الأسواق المسموحة", fr: "marchés autorisés" },
  avoid: { en: "an avoided market", ar: "سوق يتجنّبه", fr: "marché évité" }, side: { en: "direction", ar: "الاتجاه", fr: "sens" },
};
const lim = (l: Lim | undefined, size: number) => (l && Number.isFinite(l.v) && l.v > 0 ? (l.unit === "pct" ? (size * l.v) / 100 : l.v) : null);
const tm = (s: string | null | undefined) => (s ? s.trim().replace(" ", "T").slice(0, 16) : "");
/** The own rules in force at `at` (broker clock): an earlier set until it changed, a loosened set from its time on. */
export const ownAt = (c: Pick<Ch, "own" | "ownNext" | "ownPast">, at: string): ORules => {
  for (const p of c.ownPast ?? []) if (at < p.until) return p.rules;
  return (c.ownNext && c.ownNext.from <= at ? c.ownNext.rules : c.own) ?? {};
};
export type OCtx = { n: number; run: number; day: number; week: number; month: number; total: number; lastLoss: string | null };
/** The day so far before a trade at `at` (trades opened today before it, losses in a row today, the closed result today,
 *  this week from Monday, this month and since `start`, the last losing exit), leaving the trade `skip` out. */
export function ownCtx(trades: TradeRow[], start: string, at: string, skip?: string): OCtx {
  const d = at.slice(0, 10), wd = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7, wk = addDays(d, -wd), mo = d.slice(0, 7);
  const mine = trades.filter((t) => tm(t.entry_time).slice(0, 10) >= start && t.key !== skip);
  const shut = mine.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(Number(t.pnl)) && t.exit_time && tm(t.exit_time) <= at).sort((a, b) => tm(a.exit_time).localeCompare(tm(b.exit_time)));
  const sum = (f: (x: string) => boolean) => Math.round(shut.filter((t) => f(tm(t.exit_time).slice(0, 10))).reduce((a, t) => a + Number(t.pnl), 0) * 100) / 100;
  const todays = shut.filter((t) => tm(t.exit_time).slice(0, 10) === d);
  let run = 0;
  for (let i = todays.length - 1; i >= 0 && Number(todays[i].pnl) < 0; i--) run++;
  const loss = [...shut].reverse().find((t) => Number(t.pnl) < 0);
  return { n: mine.filter((t) => tm(t.entry_time).slice(0, 10) === d && tm(t.entry_time) < at).length, run, day: sum((x) => x === d), week: sum((x) => x >= wk && x <= d), month: sum((x) => x.slice(0, 7) === mo), total: sum(() => true), lastLoss: loss ? tm(loss.exit_time) : null };
}
/** The own rules a trade breaks as it opens (as lib/ownRules entryBreaks): market, side, volume, day, hour, and the limits
 *  already reached. A missing stop loss is the no-SL alert's, 2 minutes later. */
export function ownBroken(r: ORules, x: { symbol: string; side: string; qty?: number | null; entry_time: string }, c: OCtx, size: number): OKey[] {
  const out: OKey[] = [], at = tm(x.entry_time), h = Number(at.slice(11, 13)), wd = (new Date(`${at.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7;
  const hit = (l: Lim | undefined, v: number) => { const m = lim(l, size); return m != null && v <= -m + 1e-9; };
  if (r.only?.length && !r.only.includes(x.symbol)) out.push("only");
  if (r.avoid?.includes(x.symbol)) out.push("avoid");
  if (r.side && r.side !== x.side) out.push("side");
  if (r.lots != null && x.qty != null && Number(x.qty) > r.lots + 1e-9) out.push("lots");
  if (r.daysOff?.includes(wd)) out.push("daysOff");
  if (r.hours) { const [a, b] = r.hours; if (a !== b && !(a < b ? h >= a && h < b : h >= a || h < b)) out.push("hours"); }
  if (r.maxTrades != null && c.n >= r.maxTrades) out.push("maxTrades");
  if (r.streak && c.run >= r.streak) out.push("streak");
  if (hit(r.daily, c.day)) out.push("daily");
  if (hit(r.weekly, c.week)) out.push("weekly");
  if (hit(r.monthly, c.month)) out.push("monthly");
  if (hit(r.overall, c.total)) out.push("overall");
  const lk = lim(r.lock, size);
  if (lk != null && c.day >= lk - 1e-9) out.push("lock");
  if (r.cool && c.lastLoss && (Date.parse(`${at}Z`) - Date.parse(`${c.lastLoss}Z`)) / 6e4 < r.cool) out.push("cool");
  return out;
}
/** One own rule in words (the morning list, the entry warning): the What-if wording where there is one. */
export function ownText(k: OKey, r: ORules, size: number, lang: Lang, cur: string | null): string {
  const m = (l?: Lim) => money(lim(l, size) ?? 0, { cur, lang }), T = (key: string, l: Lang, v: Record<string, string | number> = {}) => fill(TXT[key][l], v);
  switch (k) {
    case "daily": return ruleText({ dayLoss: lim(r.daily, size) }, lang, cur);
    case "lock": return ruleText({ dayGain: lim(r.lock, size) }, lang, cur);
    case "maxTrades": return ruleText({ maxDay: r.maxTrades }, lang, cur);
    case "streak": return ruleText({ streak: r.streak }, lang, cur);
    case "hours": return ruleText({ hours: r.hours }, lang, cur);
    case "daysOff": return ruleText({ skipDays: r.daysOff }, lang, cur);
    case "avoid": return ruleText({ skipSymbols: r.avoid }, lang, cur);
    case "side": return ruleText({ side: r.side }, lang, cur);
    case "weekly": return T("oWeek", lang, { v: m(r.weekly) });
    case "monthly": return T("oMonth", lang, { v: m(r.monthly) });
    case "overall": return T("oAll", lang, { v: m(r.overall) });
    case "perTrade": return T("oTrade", lang, { v: m(r.perTrade) });
    case "lots": return T("oLots", lang, { v: String(r.lots) });
    case "sl": return T("oSl", lang);
    case "cool": return T("oCool", lang, { v: String(r.cool) });
    case "only": return T("oOnly", lang, { v: (r.only ?? []).join(", ") });
  }
}
/** The keys of the rules that are set, in order. */
export const ownKeys = (r: ORules): OKey[] => OKEYS.filter((k) => { const v = r[k]; return Array.isArray(v) ? v.length > 0 : typeof v === "object" ? lim(v as Lim, 1) != null : v != null && v !== false; });
/** An own-rules challenge as a prop one, for the loss-limit alerts, the morning room and /status: its daily and overall
 *  limits and its goal as % of the size, in force at `at`. */
export function asProp(c: Ch, at: string): Ch {
  if (c.kind !== "own") return c;
  const r = ownAt(c, at), pc = (l?: Lim) => { const v = lim(l, c.size); return v != null && c.size > 0 ? (v / c.size) * 100 : null; };
  return { ...c, daily: pc(r.daily), dailyBase: "size", max: pc(r.overall), trailing: false, target: pc(r.goal), minDays: 0, limitDays: null };
}
const newest = <T extends { entry_time: string }>(l: T[]) => l.reduce((a, b) => (b.entry_time > a.entry_time ? b : a)); // the latest entry
const CURS = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNY"];
const IDX: [RegExp, string][] = [[/^(US|NAS|SPX|SP500|DJ|DOW|WS30)/, "USD"], [/^(GER|DE[0-9]|DAX|EU50|EUSTX|STOXX|FRA|ESP|IT[0-9]|NETH)/, "EUR"], [/^(UK|FTSE)/, "GBP"], [/^(JP|NIK)/, "JPY"], [/^(AUS|ASX)/, "AUD"], [/^(HK|CHINA|CN)/, "CNY"],
  [/^(XAU|XAG|XPT|XPD|GOLD|SILVER|BTC|ETH|WTI|BRENT|XTI|XBR|OIL|USOIL|UKOIL)/, "USD"]];
/** Calendar currencies a symbol moves with: both sides of a pair, else an index's country, else USD for metals, oil and crypto. */
export function symCurrencies(sym: string) {
  const s = sym.toUpperCase().replace(/^[^:]+:/, "").replace(/[^A-Z0-9]/g, "");
  const out = new Set(CURS.filter((c) => s.includes(c)));
  if (!out.size) for (const [re, c] of IDX) if (re.test(s)) { out.add(c); break; }
  return out;
}
/** Count, net, win rate (%), best and worst of closed trades. */
export function tradeStats<T extends { pnl: number | null }>(list: T[]) {
  const c = list.filter((t) => t.pnl != null && Number.isFinite(Number(t.pnl)));
  let net = 0, wins = 0, best = c[0], worst = c[0];
  for (const t of c) { const p = Number(t.pnl); net += p; if (p > 0) wins++; if (p > Number(best.pnl)) best = t; if (p < Number(worst.pnl)) worst = t; }
  return { n: c.length, net, win: c.length ? Math.round((100 * wins) / c.length) : 0, best, worst };
}
export function validTz(tz: unknown) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
}
/** The user's local date, hour and weekday (0 = Sunday) at `ms`. */
export function localParts(ms: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** High-impact events of the public weekly calendar feed (the one the "news" function reads). */
export function highImpact(rows: unknown): Cal[] {
  if (!Array.isArray(rows)) return [];
  const out: Cal[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const d = new Date(String(r?.date ?? "")), title = String(r?.title ?? "").trim(), cur = String(r?.country ?? "").trim().toUpperCase();
    if (!title || isNaN(+d) || !/^[A-Z]{3}$/.test(cur) || String(r?.impact ?? "").toLowerCase() !== "high") continue;
    out.push({ id: `${d.toISOString()}|${cur}|${title}`, time: d.toISOString(), currency: cur, title: title.slice(0, 120), forecast: String(r?.forecast ?? "").slice(0, 20), previous: String(r?.previous ?? "").slice(0, 20) });
  }
  return out;
}
/** Events 5 to 15 minutes ahead for these currencies, not sent yet (the 5-minute tick sees each one once or twice). */
export function newsDue(cal: Cal[], now: number, curs: Set<string>, sent: Record<string, string>) {
  return cal.filter((e) => curs.has(e.currency) && Date.parse(e.time) - now > 5 * 60e3 && Date.parse(e.time) - now <= 15.5 * 60e3 && !sent[`news:${e.time.slice(0, 10)}:${e.id}`])
    .sort((a, b) => a.time.localeCompare(b.time));
}
const r2 = (x: number) => Math.round(x * 100) / 100;
/** What the weekly tip is built from, per account currency: totals, symbols, weekdays, entry hours. No account names or numbers. */
export function weekFacts(trades: (TradeRow & { account_id: string })[], curOf: Map<string, string | null>, plan: Record<string, boolean> = {}) {
  const by = new Map<string, TradeRow[]>();
  for (const t of trades) { const c = curOf.get(t.account_id) || "?"; by.set(c, [...(by.get(c) ?? []), t]); }
  return [...by].map(([currency, list]) => {
    const s = tradeStats(list), wins = list.filter((t) => Number(t.pnl) > 0), losses = list.filter((t) => Number(t.pnl) < 0);
    const avg = (l: TradeRow[]) => (l.length ? r2(l.reduce((a, t) => a + Number(t.pnl), 0) / l.length) : null);
    const group = (f: (t: TradeRow) => string) => {
      const m = new Map<string, { n: number; net: number }>();
      for (const t of list) { const k = f(t), g = m.get(k) ?? { n: 0, net: 0 }; g.n++; g.net += Number(t.pnl); m.set(k, g); }
      return Object.fromEntries([...m].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, g]) => [k, { trades: g.n, net: r2(g.net) }]));
    };
    let run = 0, worstRun = 0;
    for (const t of [...list].sort((a, b) => (a.exit_time ?? "").localeCompare(b.exit_time ?? ""))) { run = Number(t.pnl) < 0 ? run + 1 : 0; worstRun = Math.max(worstRun, run); }
    const planned = (v: boolean) => { const l = list.filter((t) => t.key && plan[t.key] === v); return { trades: l.length, net: r2(l.reduce((a, t) => a + Number(t.pnl), 0)) }; };
    return {
      currency, trades: s.n, net: r2(s.net), winRatePct: s.win, avgWin: avg(wins), avgLoss: avg(losses), withoutStopLoss: list.filter((t) => !(Number(t.sl) > 0)).length, mostLossesInARow: worstRun,
      inThePlan: planned(true), outsideThePlan: planned(false),
      bySymbol: group((t) => t.symbol), byWeekday: group((t) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(naive(t.entry_time ?? t.exit_time ?? "")).getUTCDay()] ?? "?"),
      byEntryHour: group((t) => `${(t.entry_time ?? "").replace(" ", "T").slice(11, 13) || "?"}h`),
    };
  });
}
/** One short tip for next week from the AI model (GEMINI_API_KEY, as the "advisor" function); "" without a key or an answer. */
async function weekTip(lang: Lang, facts: unknown) {
  const key = Deno.env.get("AI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
  if (!key) return "";
  const base = (Deno.env.get("AI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
  const language = lang === "ar" ? "Arabic" : lang === "fr" ? "French" : "English";
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("AI_MODEL") || "gemini-3.5-flash-lite",
        messages: [
          { role: "system", content: `You coach a trader in a short Telegram message. From last week's numbers (JSON), give ONE specific, practical tip for next week, in ${language}, in at most 2 short sentences. Use only the numbers given. No greeting, no title, no markdown.` },
          { role: "user", content: JSON.stringify(facts) },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const out = await r.json().catch(() => null);
    return r.ok ? String(out?.choices?.[0]?.message?.content ?? "").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim().slice(0, 400) : "";
  } catch {
    return "";
  }
}

/** The words of a voice note, from the Gemini API (audio in); "" without a key or an answer. Uses GEMINI_API_KEY, or
 *  AI_API_KEY when AI_BASE_URL is not set (the default base is Gemini's). */
async function transcribe(audio: Uint8Array, mime: string) {
  const other = !!Deno.env.get("AI_BASE_URL"), key = Deno.env.get("GEMINI_API_KEY") || (other ? "" : Deno.env.get("AI_API_KEY"));
  if (!key) return "";
  let bin = "";
  for (let i = 0; i < audio.length; i += 0x8000) bin += String.fromCharCode(...audio.subarray(i, i + 0x8000));
  const model = (!other && Deno.env.get("AI_MODEL")) || "gemini-3.5-flash-lite";
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: "Transcribe this trader's voice note word for word, in the language it is spoken (Arabic, including Tunisian or other dialects, French or English). Return only the transcript, with no comment." },
          { inline_data: { mime_type: mime, data: btoa(bin) } },
        ] }],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(45000),
    });
    const out = await r.json().catch(() => null);
    const parts: { text?: string }[] = r.ok ? out?.candidates?.[0]?.content?.parts ?? [] : [];
    return parts.map((p) => p.text ?? "").join(" ").replace(/\s+/g, " ").trim().slice(0, 2000);
  } catch {
    return "";
  }
}
type Voice = { t: string; at: string; d: number };

const US_DST = (u: number) => { const y = new Date(u).getUTCFullYear(), sun = (m: number, k: number) => { const d = new Date(Date.UTC(y, m, 1)); return Date.UTC(y, m, 1 + ((7 - d.getUTCDay()) % 7) + 7 * (k - 1)); }; return u >= sun(2, 2) + 7 * 3600e3 && u < sun(10, 1) + 6 * 3600e3; };
/** The broker's clock now (as UTC ms): from the last MT5 sync (its server time against ours), else UTC+2 / UTC+3 in US summer time. */
export function brokerClock(sync: Sync | undefined, now = Date.now()) {
  let off = (US_DST(now) ? 3 : 2) * 3600e3;
  if (sync?.brokerNow && sync.last) { const o = Date.parse(`${sync.brokerNow}Z`) - Date.parse(sync.last); if (Number.isFinite(o) && Math.abs(o) < 15 * 3600e3) off = Math.round(o / 1800e3) * 1800e3; }
  return now + off;
}
const brokerToday = (sync: Sync | undefined, now = Date.now()) => new Date(brokerClock(sync, now)).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "", SB = Deno.env.get("SUPABASE_URL") ?? "", SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = (path: string, init: RequestInit = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SR, authorization: `Bearer ${SR}`, "content-type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
  const rows = async <T,>(path: string): Promise<T[]> => { const r = await db(path); return r.ok ? ((await r.json()) as T[]) : []; };
  const tg = (method: string, body: unknown) => fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  /** One message, with rows of buttons below it. Telegram refuses some URLs (localhost): then it goes without them. */
  const send = async (chat: number, text: string, kb: Btn[][] = []) => {
    const base = { chat_id: chat, text: text.slice(0, 4000) };
    const r = await tg("sendMessage", kb.length ? { ...base, reply_markup: { inline_keyboard: kb } } : base);
    return r.ok || !kb.length ? r : tg("sendMessage", base);
  };
  const getTg = async (uid: string) => (await rows<{ value: Tg }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.telegram&deleted_at=is.null`))[0]?.value ?? null;
  const saveTg = (uid: string, value: Tg) => db("user_settings?on_conflict=user_id,key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, key: "telegram", value, updated_at: null, deleted_at: null }) });
  const secret = TOKEN ? (await sha256(`mizan-webhook:${TOKEN}`)).slice(0, 48) : "";
  const T = (k: string, lang: Lang, v: Record<string, string | number> = {}) => fill(TXT[k][lang], v);
  /** Keep the keys of what was just sent, and forget the keys dated more than 7 days before `today`. The row is read
   *  again first, so what another call saved meanwhile (its keys, the user's choices) is kept. */
  const remember = async (uid: string, t: Tg, sent: Record<string, string>, keys: string[], today: string) => {
    const cur = (await getTg(uid)) ?? t, all = { ...(cur.sent ?? {}), ...sent }, cut = addDays(today, -7);
    for (const k of Object.keys(all)) { const d = k.match(/:(\d{4}-\d{2}-\d{2}):/)?.[1]; if (d && d < cut) delete all[k]; }
    for (const k of keys) all[k] = today;
    return saveTg(uid, { ...cur, sent: all });
  };
  const side = (s: string, lang: Lang) => T(s === "short" ? "short" : "long", lang);
  const noSlLine = (a: Acc, x: OpenRow, lang: Lang) => T("nosl", lang, { a: a.name, s: x.symbol, d: side(x.side, lang), q: Number(x.qty).toLocaleString("en-US"), h: x.entry_time.replace(" ", "T").slice(11, 16) });
  const site = (t: Tg) => (typeof t.site === "string" && /^https?:\/\/\S+$/.test(t.site) ? t.site : null);
  // "in my plan" / "outside my plan" under a new trade; the chosen one gets a dot (callback data: p1:<trade key>, 64 bytes max)
  const planButtons = (key: string, lang: Lang, chosen?: boolean): Btn[] => [
    { text: `${chosen === true ? "● " : ""}${T("planYes", lang)}`, callback_data: `p1:${key}` },
    { text: `${chosen === false ? "● " : ""}${T("planNo", lang)}`, callback_data: `p0:${key}` },
  ];
  const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  const dangerLine = (d: Danger, x: OpenRow, lang: Lang, a: Acc) => {
    const h = Number(x.entry_time.replace(" ", "T").slice(11, 13));
    return T(`d${d.kind}`, lang, { s: x.symbol, d: side(x.side, lang), w: WEEKDAY[lang][new Date(naive(x.entry_time)).getUTCDay()], h1: hh(h), h2: hh(h + 1), l: d.lost, n: d.n, p: money(d.net, { cur: a.currency, lang }) });
  };
  /** The rules the trader adopted in the Advisor (synced from the app). */
  const myRules = async (uid: string): Promise<MyRule[]> => ((await rows<{ value: MyRule[] | null }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-advisor-rules&deleted_at=is.null`))[0]?.value ?? [])
    .filter((r) => r && typeof r.id === "string" && r.rules && typeof r.rules === "object" && typeof r.at === "string").slice(0, 20);
  /** The trader's name as the partner sees it: the Mizan profile name, else the first word of their Telegram name. */
  const traderName = async (uid: string, t: Tg) => {
    const p = (await rows<{ value: { name?: unknown } | null }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-profile&deleted_at=is.null`))[0]?.value?.name;
    return (typeof p === "string" && p.trim() ? p.trim() : (t.name ?? "").split(" @")[0] || "Mizan").slice(0, 60);
  };
  /** A broken rule: the partner, and the coach when the trader allows that rule, get one message per rule per day (no
   *  amounts, no account) and the trader a line saying so. Returns the keys to remember. Whoever blocked the bot is let go. */
  const tellPartner = async (uid: string, t: Tg, rule: Rule, x: { symbol: string; entry_time: string }, day: string, sent: Record<string, string>, k: number | string = 3) => {
    const keys: string[] = [], why = (l: Lang, me = false) => (rule === "own" ? T(me ? "rownMe" : "rown", l, { k: ONAME[k as OKey]?.[l] ?? String(k) }) : T(`r${rule}`, l, { k }));
    for (const role of ["partner", "coach"] as const) {
      const p = t[role], key = `${role}:${day}:${rule}`;
      if (!p?.chat || sent[key] || (role === "coach" && t.coach?.prefs?.[rule] === false)) continue;
      const res = await send(p.chat, T(role === "partner" ? "bRule" : "cRule", p.lang, { n: await traderName(uid, t), r: why(p.lang), s: x.symbol, h: x.entry_time.replace(" ", "T").slice(11, 16) }));
      if (res.status === 403) {
        await saveTg(uid, { ...((await getTg(uid)) ?? t), [role]: null });
        if (t.chat) await send(t.chat, T(role === "partner" ? "pGone" : "cGone", t.lang ?? "en", { p: p.name ?? "" }));
        continue;
      }
      if (!res.ok) continue;
      if (t.chat) await send(t.chat, T(role === "partner" ? "tTold" : "cTold", t.lang ?? "en", { p: p.name ?? "", r: why(t.lang ?? "en", true) }));
      sent[key] = day; // the rest of this call does not tell twice
      keys.push(key);
    }
    return keys;
  };
  /** Points the bot here, for messages and button taps (set again when it was set before the buttons existed). */
  const ensureHook = async () => {
    const hook = `${SB}/functions/v1/telegram`, w = (await (await tg("getWebhookInfo", {})).json().catch(() => null))?.result;
    if (!w || w.url !== hook || /401|403/.test(w.last_error_message ?? "") || !(w.allowed_updates ?? []).includes("callback_query"))
      await tg("setWebhook", { url: hook, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: !w || w.url !== hook });
  };

  /** Each member's discipline score on the given broker days (see disciplineDay), with the name others see. */
  const scoresFor = (uids: string[], days: string[]) => Promise.all(uids.slice(0, 50).map(async (uid) => {
    const chs = ((await rows<{ value: Ch[] }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-challenges&deleted_at=is.null`))[0]?.value ?? []).filter((c) => c?.accountId).map((c) => asProp(c, `${days[days.length - 1]}T23:59`)).filter((c) => c.daily != null);
    const from = [addDays(days[0], -3), ...chs.map((c) => c.start)].sort()[0];
    const trades = await rows<DayTrade>(`trades?select=key,account_id,symbol,side,pnl,status,entry_time,exit_time,sl&user_id=eq.${uid}&deleted_at=is.null&entry_time=gte.${from}&limit=5000`);
    const plan = (await rows<{ value: Record<string, boolean> | null }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-trade-plan&deleted_at=is.null`))[0]?.value ?? {};
    return { uid, name: await traderName(uid, (await getTg(uid)) ?? ({} as Tg)), scores: days.map((d) => disciplineDay(trades, plan, chs, d)) };
  }));
  /** One line per trader, best score first: score and broken rules, or "no trades". */
  const boardLines = (list: { name: string; s: ReturnType<typeof disciplineDay> }[], lang: Lang) => [...list].sort((a, z) => (z.s?.score ?? -1) - (a.s?.score ?? -1)).map(({ name, s }) =>
    !s ? `⚪ ${name} · ${T("gNone", lang)}` : [`${s.score >= 80 ? "🟢" : s.score >= 50 ? "🟡" : "🔴"} ${name} · ${s.score}`, ...(s.noSl ? [T("fNoSl", lang, { k: s.noSl })] : []), ...(s.out ? [T("fOut", lang, { k: s.out })] : []), ...(s.afterStreak ? [T("fStreak", lang)] : []), ...(s.afterLimit ? [T("fLimit", lang)] : [])].join(" · "));
  const dayLabel = (d: string, lang: Lang) => new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : lang, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  /** A group's discipline board: yesterday's scores after the broker's midnight (standard broker clock, UTC+2/+3), and on
   *  Sunday from 10:00 the ranking of the 7 days before. Each is posted once (the day / week is kept in the group's row). */
  const tickGroup = async (id: string, g: Grp) => {
    const chat = Number(id.slice(4)), members = Array.isArray(g.members) ? g.members : [];
    if (!members.length || !Number.isFinite(chat)) return 0;
    const b = new Date(brokerClock(undefined)), today = b.toISOString().slice(0, 10), hour = b.getUTCHours(), yday = addDays(today, -1);
    const daily = hour < 12 && g.day !== yday, week = b.getUTCDay() === 0 && hour >= 10 && g.week !== today;
    if (!daily && !week) return 0;
    const lang = g.lang ?? "en";
    const days = week ? Array.from({ length: 7 }, (_, i) => addDays(today, i - 7)) : [yday];
    const per = await scoresFor(members, days);
    await db(`tg_state?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ value: { ...g, ...(daily ? { day: yday } : {}), ...(week ? { week: today } : {}) } }) });
    const kb = [[{ text: T("gJoin", lang), callback_data: "gj" }, { text: T("gLeave", lang), callback_data: "gl" }]];
    const out: { text: string; kb: Btn[][] }[] = [];
    if (daily && per.some((p) => p.scores[p.scores.length - 1])) out.push({ kb, text: [T("gDay", lang, { d: dayLabel(yday, lang) }), ...boardLines(per.map((p) => ({ name: p.name, s: p.scores[p.scores.length - 1] })), lang)].join("\n") });
    if (week) {
      const daysW = (k: number) => (lang === "ar" ? (k === 1 ? "يوم واحد" : k === 2 ? "يومان" : `${k} أيام`) : lang === "fr" ? `${k} jour${k > 1 ? "s" : ""}` : `${k} day${k > 1 ? "s" : ""}`);
      const rank = per.map((p) => { const sc = p.scores.filter((x): x is NonNullable<typeof x> => !!x); return { name: p.name, k: sc.length, avg: sc.length ? Math.round(sc.reduce((a, x) => a + x.score, 0) / sc.length) : -1 }; })
        .filter((r) => r.k).sort((a, z) => z.avg - a.avg || z.k - a.k);
      if (rank.length) out.push({ kb: [], text: [T("gWeek", lang, { d: `${dayLabel(days[0], lang)} – ${dayLabel(days[6], lang)}` }), ...rank.map((r, i) => `${["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} ${r.name} · ${r.avg} (${daysW(r.k)})`)].join("\n") });
    }
    let sentN = 0;
    for (const m of out) {
      const r = await send(chat, m.text, m.kb);
      if (r.ok) sentN++;
      else if (r.status === 403 || r.status === 400) { await db(`tg_state?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); break; } // the bot was removed from the group
    }
    return sentN;
  };
  /** A coach's day: after the broker's midnight, one message with yesterday's score of each trader they coach (who
   *  allow it), once a day (kept in tg_state "coach:<chat>"). A coach who blocked the bot is let go. */
  const tickCoach = async (chat: number, lang: Lang, uids: string[]) => {
    const id = `coach:${chat}`, st = (await rows<{ value: { day?: string } | null }>(`tg_state?select=value&id=eq.${encodeURIComponent(id)}`))[0]?.value ?? {};
    const b = new Date(brokerClock(undefined)), yday = addDays(b.toISOString().slice(0, 10), -1);
    if (b.getUTCHours() >= 12 || st.day === yday) return 0;
    const per = await scoresFor(uids, [yday]);
    await db("tg_state?on_conflict=id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id, value: { ...st, day: yday } }) });
    if (!per.some((p) => p.scores[0])) return 0;
    const r = await send(chat, [T("cDay", lang, { d: dayLabel(yday, lang) }), ...boardLines(per.map((p) => ({ name: p.name, s: p.scores[0] })), lang)].join("\n"));
    if (r.status === 403) for (const uid of uids) {
      const t = await getTg(uid);
      if (t?.coach?.chat !== chat) continue;
      await saveTg(uid, { ...t, coach: null });
      if (t.chat) await send(t.chat, T("cGone", t.lang ?? "en", { p: t.coach.name ?? "" }));
    }
    return r.ok ? 1 : 0;
  };

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
      const n = challengeNow(asProp(c, `${today}T23:59`), trades, today), m = (v: number, sign = false) => money(v, { sign, cur: a.currency, lang });
      parts.push([`🏁 ${a.name} · ${c.name}`, T("stResult", lang, { p: m(n.pnl, true) }) + (n.goal != null ? T("stTarget", lang, { g: m(n.goal) }) : ""),
        ...(n.limit != null ? [T("stToday", lang, { t: m(n.todayPnl, true), r: m(Math.max(0, n.limit + n.todayPnl)), l: m(n.limit) })] : []),
        ...(n.floor != null ? [T("stOverall", lang, { r: m(Math.max(0, n.bal - n.floor)), f: m(n.floor) })] : [])].join("\n"));
    }
    return parts.join("\n\n") || T("noChallenge", lang);
  }

  /** The high-impact calendar, cached in tg_state for an hour (the public feed must not be read too often). */
  async function loadCalendar(): Promise<Cal[]> {
    const row = (await rows<{ at: string; value: Cal[] | null }>("tg_state?select=at,value&id=eq.calendar"))[0];
    if (row?.value && Date.now() - Date.parse(row.at) < 3600e3) return row.value;
    try {
      const r = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { headers: { "User-Agent": "Mozilla/5.0 (compatible; MizanAlerts/1.0)" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(String(r.status));
      const ev = highImpact(await r.json());
      await db("tg_state?id=eq.calendar", { method: "PATCH", body: JSON.stringify({ at: new Date().toISOString(), value: ev }) });
      return ev;
    } catch {
      return row?.value ?? [];
    }
  }

  /** Everything due now for one linked chat (sync stopped, no stop loss, day and week summaries, news); messages sent. */
  async function tickUser(uid: string, t: Tg, calendar: () => Promise<Cal[]>) {
    const chat = t.chat as number, lang = t.lang ?? "en", prefs = prefsOf(t.prefs), now = Date.now();
    const accs = await rows<Acc>(`accounts?select=id,name,currency&user_id=eq.${uid}&deleted_at=is.null`);
    if (!accs.length) return 0;
    const syncs = await rows<{ key: string; value: Sync }>(`user_settings?select=key,value&user_id=eq.${uid}&key=like.mt5-sync:*&deleted_at=is.null`);
    const syncOf = (id: string) => syncs.find((s) => s.key === `mt5-sync:${id}`)?.value;
    const profileTz = (await rows<{ value: { timezone?: string } | null }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-profile&deleted_at=is.null`))[0]?.value?.timezone;
    const tz = validTz(profileTz) ?? validTz(t.tz) ?? "UTC", loc = lang === "ar" ? "ar-u-nu-latn" : lang;
    const hm = (ms: number) => new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(ms));
    const dayName = (d: string) => new Intl.DateTimeFormat(loc, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
    const sent = { ...(t.sent ?? {}) }, out: { text: string; keys: string[] }[] = [], quiet: string[] = [], partnerTodo: { x: OpenRow; day: string }[] = [];
    const word = (n: number) => (lang === "ar" ? (n >= 3 && n <= 10 ? "صفقات" : "صفقة") : n === 1 ? "trade" : "trades");
    let planMap: Record<string, boolean> | null = null; // the "in my plan" answers, read once when a summary needs them
    const plan = async () => (planMap ??= (await rows<{ value: Record<string, boolean> | null }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-trade-plan&deleted_at=is.null`))[0]?.value ?? {});
    const block = (a: Acc, list: TradeRow[], pl: Record<string, boolean>) => {
      const s = tradeStats(list), m = (v: number, cents = false) => money(v, { cents, sign: true, cur: a.currency, lang });
      const part = (v: boolean) => { const l = list.filter((x) => x.key && pl[x.key] === v); return `${l.length} ${word(l.length)} ${m(l.reduce((sum, x) => sum + Number(x.pnl), 0))}`; };
      return [T("sumLine", lang, { a: a.name, p: m(s.net), n: s.n, w: word(s.n), r: s.win }),
        ...(s.n > 1 ? [T("bestWorst", lang, { b: `${s.best.symbol} ${m(Number(s.best.pnl), true)}`, w: `${s.worst.symbol} ${m(Number(s.worst.pnl), true)}` })] : []),
        ...(list.some((x) => x.key && x.key in pl) ? [T("planLine", lang, { i: part(true), o: part(false) })] : [])].join("\n");
    };

    for (const a of accs) {
      const st = syncOf(a.id), last = Date.parse(st?.last ?? "");
      if (!st || !Number.isFinite(last)) continue;
      // MT5 has not synced for an hour while the journal shows open trades (once per silence)
      if (prefs.stale && now - last > 3600e3) {
        const k = `stale:${(st.last as string).slice(0, 10)}:${a.id}:${st.last}`;
        if (!sent[k]) {
          const open = await rows<{ key: string }>(`trades?select=key&user_id=eq.${uid}&account_id=eq.${a.id}&status=eq.open&deleted_at=is.null&limit=200`);
          const d = localParts(last, tz).date; // the day too, when it was not today
          if (open.length) out.push({ text: T("stale", lang, { a: a.name, t: d !== localParts(now, tz).date ? `${dayName(d)} ${hm(last)}` : hm(last), n: open.length }), keys: [k] });
        }
      }
      // no stop loss, when MT5 synced lately (the sync itself also checks; this one does not wait for the EA's next send)
      if ((prefs.nosl || t.partner?.chat || t.coach?.chat) && now - last <= 15 * 60e3) {
        const open = await rows<OpenRow>(`trades?select=key,symbol,side,qty,entry_time&user_id=eq.${uid}&account_id=eq.${a.id}&status=eq.open&sl=is.null&deleted_at=is.null&limit=50`);
        const due = noSlDue(open, brokerClock(st, now), sent).slice(0, 5);
        if (prefs.nosl && due.length) out.push({ text: due.map((x) => noSlLine(a, x, lang)).join("\n"), keys: due.map((x) => x.k) });
        if (due.length) partnerTodo.push({ x: newest(due), day: new Date(brokerClock(st, now)).toISOString().slice(0, 10) });
      }
    }

    // yesterday's summary, in the 3 hours after the broker's midnight (trade times are on the broker's clock)
    if (prefs.daily) {
      const parts: string[] = [], keys: string[] = [];
      let label = "";
      for (const a of accs) {
        const bc = brokerClock(syncOf(a.id), now), today = new Date(bc).toISOString().slice(0, 10), d = addDays(today, -1), k = `daily:${d}:${a.id}`;
        if (new Date(bc).getUTCHours() >= 3 || sent[k]) continue;
        const list = await rows<TradeRow>(`trades?select=key,symbol,side,pnl,status,entry_time,exit_time&user_id=eq.${uid}&account_id=eq.${a.id}&status=eq.closed&deleted_at=is.null&exit_time=gte.${d}&exit_time=lt.${today}&limit=2000`);
        if (!list.length) { quiet.push(k); continue; }
        parts.push(block(a, list, await plan())); keys.push(k); label = d;
      }
      if (parts.length) out.push({ text: [T("dayHead", lang, { d: dayName(label) }), ...parts].join("\n\n"), keys });
    }

    // the week, on Sunday from 10:00 the user's time, with one tip from the AI model (no account names or numbers sent)
    if (prefs.weekly) {
      const lp = localParts(now, tz), k = `weekly:${lp.date}:`;
      if (lp.wd === 0 && lp.hour >= 10 && !sent[k]) {
        const from = addDays(lp.date, -7);
        const list = await rows<TradeRow & { account_id: string }>(`trades?select=key,account_id,symbol,side,pnl,status,entry_time,exit_time,sl&user_id=eq.${uid}&status=eq.closed&deleted_at=is.null&exit_time=gte.${from}&exit_time=lt.${lp.date}&limit=5000`);
        if (!list.length) quiet.push(k);
        else {
          const pl = await plan();
          const parts = accs.map((a) => ({ a, l: list.filter((x) => x.account_id === a.id) })).filter((x) => x.l.length).map((x) => block(x.a, x.l, pl));
          const tip = await weekTip(lang, weekFacts(list, new Map(accs.map((a) => [a.id, a.currency])), pl));
          out.push({ text: [T("weekHead", lang, { d: `${dayName(from)} – ${dayName(addDays(lp.date, -1))}` }), ...parts, ...(tip ? [`💡 ${tip}`] : [])].join("\n\n"), keys: [k] });
        }
      }
    }

    // the morning plan of each running challenge and the rules adopted in the Advisor, on weekdays from 08:00 the user's time
    if (prefs.morning || prefs.myRules) {
      const lp = localParts(now, tz), k = `morning:${lp.date}:`;
      if (lp.wd >= 1 && lp.wd <= 5 && lp.hour >= 8 && lp.hour < 12 && !sent[k]) {
        const every = prefs.morning || prefs.myRules ? ((await rows<{ value: Ch[] }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-challenges&deleted_at=is.null`))[0]?.value ?? []).filter((c) => c?.accountId) : [];
        const chs = prefs.morning ? every.filter((c) => c.kind !== "own") : [], owns = prefs.myRules ? every.filter((c) => c.kind === "own") : [];
        const parts: string[] = [];
        for (const c of chs) {
          const a = accs.find((x) => x.id === c.accountId), today = brokerToday(syncOf(c.accountId), now);
          if (!a || c.start > today) continue;
          const trades = await rows<TradeRow>(`trades?select=symbol,side,pnl,status,entry_time,exit_time&user_id=eq.${uid}&account_id=eq.${a.id}&deleted_at=is.null&entry_time=gte.${c.start}`);
          const p = morningPlan(c, challengeNow(c, trades, today), today);
          if (!p) continue;
          const m0 = (v: number) => money(v, { cur: a.currency, lang });
          const room = [p.dayRoom != null ? T("mDay", lang, { r: m0(p.dayRoom) }) : "", p.allRoom != null ? T("mAll", lang, { r: m0(p.allRoom) }) : ""].filter(Boolean).join(" · ");
          parts.push([`🏁 ${c.name} · ${a.name}`, ...(room ? [`• ${room}`] : []), ...(p.risk != null ? [`• ${T("mRisk", lang, { r: m0(p.risk) })}`] : []),
            ...(p.reached ? [`• ${T("mReached", lang, { d: p.days, m: p.minDays })}`] : p.left != null ? [`• ${T("mLeft", lang, { l: m0(p.left) })}${p.tdLeft && p.pace != null ? T("mPace", lang, { t: p.tdLeft, p: m0(p.pace), w: p.tdLeft >= 3 && p.tdLeft <= 10 ? "أيام" : p.tdLeft <= 2 ? "يوم" : "يوماً" }) : ""}`] : []),
            ...(!p.reached && p.minDays > 0 && p.days < p.minDays ? [`• ${T("mDays", lang, { d: p.days, m: p.minDays })}`] : [])].join("\n"));
        }
        const mine = prefs.myRules ? await myRules(uid) : [];
        if (mine.length) {
          const wd = (lp.wd + 6) % 7, cur = accs[0]?.currency ?? null; // the rules' weekdays: 0 = Monday
          parts.push([T("myHead", lang), ...(mine.some((r) => r.rules.skipDays?.includes(wd)) ? [T("noTrading", lang)] : []), ...mine.map((r) => `• ${ruleText(r.rules, lang, cur)}`)].join("\n"));
        }
        for (const c of owns) {
          const a = accs.find((x) => x.id === c.accountId), at = new Date(brokerClock(syncOf(c.accountId), now)).toISOString().slice(0, 16), today = at.slice(0, 10);
          if (!a || c.start > today) continue;
          const r = ownAt(c, at), keys = ownKeys(r), wd = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
          if (!keys.length) continue;
          const p = r.daily || r.overall ? morningPlan(asProp(c, at), challengeNow(asProp(c, at), await rows<TradeRow>(`trades?select=symbol,side,pnl,status,entry_time,exit_time&user_id=eq.${uid}&account_id=eq.${a.id}&deleted_at=is.null&entry_time=gte.${c.start}`), today), today) : null;
          const m0 = (v: number) => money(v, { cur: a.currency, lang });
          const room = p ? [p.dayRoom != null ? T("mDay", lang, { r: m0(p.dayRoom) }) : "", p.allRoom != null ? T("mAll", lang, { r: m0(p.allRoom) }) : ""].filter(Boolean).join(" · ") : "";
          parts.push([`📌 ${c.name} · ${a.name}`, ...(r.daysOff?.includes(wd) ? [T("noTrading", lang)] : []), ...(room ? [`• ${room}`] : []), ...keys.map((k) => `• ${ownText(k, r, c.size, lang, a.currency)}`)].join("\n"));
        }
        if (parts.length) out.push({ text: [T("mHead", lang, { d: dayName(lp.date) }), ...parts].join("\n\n"), keys: [k] });
        else quiet.push(k);
      }
    }

    // high-impact news 5 to 15 minutes ahead, for the currencies of the symbols traded in the last 30 days
    if (prefs.news) {
      const syms = await rows<{ symbol: string }>(`trades?select=symbol&user_id=eq.${uid}&deleted_at=is.null&entry_time=gte.${addDays(new Date(now).toISOString().slice(0, 10), -30)}&limit=2000`);
      const curs = new Set(syms.flatMap((x) => [...symCurrencies(x.symbol)]));
      const due = curs.size ? newsDue(await calendar(), now, curs, sent) : [];
      if (due.length) {
        const lines = due.slice(0, 6).map((e) => `${hm(Date.parse(e.time))} · ${e.currency} · ${e.title}${e.forecast || e.previous ? T("newsFc", lang, { f: e.forecast || "—", p: e.previous || "—" }) : ""}`);
        out.push({ text: [T("newsHead", lang, { m: Math.max(1, Math.round((Date.parse(due[0].time) - now) / 60e3)) }), ...lines, T("newsTail", lang)].join("\n"), keys: due.map((e) => `news:${e.time.slice(0, 10)}:${e.id}`) });
      }
    }

    let n = 0;
    const keys = [...quiet];
    for (const m of out) {
      const r = await send(chat, m.text);
      if (r.ok) { n++; keys.push(...m.keys); }
      else if (r.status === 403) { await saveTg(uid, { ...t, chat: null }); return n; } // the user blocked the bot: unlink
    }
    for (const d of partnerTodo) { const k = await tellPartner(uid, t, "nosl", d.x, d.day, sent); n += k.length; keys.push(...k); }
    if (keys.length) await remember(uid, t, sent, keys, new Date(now).toISOString().slice(0, 10));
    return n;
  }

  try {
    // ---- Telegram webhook ----
    if (req.headers.has("x-telegram-bot-api-secret-token")) {
      if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return json({ ok: false }, 401);
      const u = await req.json().catch(() => null);
      // a tap on "in my plan" / "outside my plan": saved in the user's synced setting "mizan-trade-plan" ({ [trade key]: boolean })
      const cq = u?.callback_query;
      // the answer to a partner or coach invite: "pa:/pd:<code>" (partner), "ca:/cd:<code>" (coach), accept or decline
      const pm = cq ? String(cq.data ?? "").match(/^([pc])([ad]):([A-Za-z0-9_-]{10,40})$/) : null;
      if (cq && pm && typeof cq.message?.chat?.id === "number") {
        const role = pm[1] === "p" ? "partner" : "coach", hk = pm[1] === "p" ? "pcodeHash" : "ccodeHash", ak = pm[1] === "p" ? "pcodeAt" : "ccodeAt", px = pm[1];
        const qChat = cq.message.chat.id as number, pLang = langOf(String(cq.from?.language_code ?? "").slice(0, 2));
        const inv = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>${hk}=eq.${await sha256(pm[3])}&deleted_at=is.null&limit=1`))[0];
        await tg("editMessageReplyMarkup", { chat_id: qChat, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
        const at = inv?.value[ak];
        if (!inv?.value.chat || !at || Date.now() - Date.parse(at) > 7 * 864e5 || inv.value.chat === qChat) await send(qChat, T("pExpired", pLang));
        else {
          const pname = String(cq.from?.first_name || (cq.from?.username ? `@${cq.from.username}` : "") || "—").slice(0, 60), tname = await traderName(inv.user_id, inv.value);
          const old = inv.value[role];
          if (pm[2] === "a") {
            if (old?.chat && old.chat !== qChat) await send(old.chat, T(`${px}Ended`, old.lang, { n: tname })); // one of each: the new one replaces the old
            const who: Coach = { chat: qChat, name: pname, lang: pLang, since: new Date().toISOString(), ...(role === "coach" && inv.value.coach?.prefs ? { prefs: inv.value.coach.prefs } : {}) };
            await saveTg(inv.user_id, { ...inv.value, [role]: who, [hk]: null, [ak]: null });
            await send(qChat, T(`${px}Accepted`, pLang, { n: tname }));
            await send(inv.value.chat, T(`${px}Now`, inv.value.lang ?? "en", { p: pname }));
          } else {
            await saveTg(inv.user_id, { ...inv.value, [hk]: null, [ak]: null });
            await send(qChat, T("pDeclined", pLang));
            await send(inv.value.chat, T(`${px}DeclinedT`, inv.value.lang ?? "en", { p: pname }));
          }
        }
        await tg("answerCallbackQuery", { callback_query_id: cq.id });
        return json({ ok: true });
      }
      if (cq && /^g[jl]$/.test(String(cq.data ?? "")) && typeof cq.message?.chat?.id === "number") { // discipline board: join / leave
        const gid = `grp:${cq.message.chat.id}`, g = (await rows<{ value: Grp }>(`tg_state?select=value&id=eq.${encodeURIComponent(gid)}`))[0]?.value;
        const who = typeof cq.from?.id === "number" ? (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>chat=eq.${cq.from.id}&deleted_at=is.null&limit=1`))[0] : undefined;
        const l = who?.value.lang ?? langOf(String(cq.from?.language_code ?? "").slice(0, 2));
        if (who) {
          const base: Grp = g ?? { title: String(cq.message.chat.title ?? "").slice(0, 80), lang: l, members: [] };
          const members = (base.members ?? []).filter((x) => x !== who.user_id).concat(cq.data === "gj" ? [who.user_id] : []);
          await db("tg_state?on_conflict=id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: gid, value: { ...base, members } }) });
        }
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: T(!who ? "gLink" : cq.data === "gj" ? "gJoined" : "gLeft", l), show_alert: !who });
        return json({ ok: true });
      }
      if (cq) {
        const qChat = cq.message?.chat?.id, m = String(cq.data ?? "").match(/^p([01]):(.{3,61})$/);
        const who = typeof qChat === "number" ? (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>chat=eq.${qChat}&deleted_at=is.null&limit=1`))[0] : undefined;
        const qLang = who?.value.lang ?? "en";
        let saved = false;
        if (who && m && (await rows<{ key: string }>(`trades?select=key&user_id=eq.${who.user_id}&key=eq.${encodeURIComponent(m[2])}&limit=1`)).length) {
          const cur = (await rows<{ value: Record<string, boolean> | null }>(`user_settings?select=value&user_id=eq.${who.user_id}&key=eq.mizan-trade-plan&deleted_at=is.null`))[0]?.value ?? {};
          const w = await db("user_settings?on_conflict=user_id,key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: who.user_id, key: "mizan-trade-plan", value: { ...cur, [m[2]]: m[1] === "1" }, updated_at: null, deleted_at: null }) });
          saved = w.ok;
          if (saved) await tg("editMessageReplyMarkup", { chat_id: qChat, message_id: cq.message?.message_id, reply_markup: { inline_keyboard: [planButtons(m[2], qLang, m[1] === "1")] } });
        }
        await tg("answerCallbackQuery", { callback_query_id: cq.id, ...(saved ? { text: T("planSaved", qLang) } : {}) });
        return json({ ok: true });
      }
      const msg = u?.message, chat = msg?.chat?.id, text = typeof msg?.text === "string" ? msg.text.trim() : "";
      if (typeof chat === "number" && (msg?.chat?.type === "group" || msg?.chat?.type === "supergroup")) {
        // the bot added to a group (or asked with /board): the discipline board is set up there; removed: forgotten
        const botId = Number(TOKEN.split(":")[0]), gid = `grp:${chat}`, glang = langOf(String(msg.from?.language_code ?? "").slice(0, 2));
        const g = (await rows<{ value: Grp }>(`tg_state?select=value&id=eq.${encodeURIComponent(gid)}`))[0]?.value;
        const save = (id: string, value: Grp) => db("tg_state?on_conflict=id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id, value }) });
        if (typeof msg.migrate_to_chat_id === "number") { if (g) { await save(`grp:${msg.migrate_to_chat_id}`, g); await db(`tg_state?id=eq.${encodeURIComponent(gid)}`, { method: "DELETE" }); } }
        else if (msg.left_chat_member?.id === botId) await db(`tg_state?id=eq.${encodeURIComponent(gid)}`, { method: "DELETE" });
        else if ((msg.new_chat_members ?? []).some((x: { id?: number }) => x.id === botId) || msg.group_chat_created || msg.supergroup_chat_created || /^\/(board|start)(@\w+)?$/i.test(text)) {
          const lang = g?.lang ?? glang;
          if (!g) await save(gid, { title: String(msg.chat.title ?? "").slice(0, 80), lang, members: [] });
          await send(chat, T("gIntro", lang), [[{ text: T("gJoin", lang), callback_data: "gj" }, { text: T("gLeave", lang), callback_data: "gl" }]]);
        }
        return json({ ok: true });
      }
      if (typeof chat !== "number" || msg?.chat?.type !== "private") return json({ ok: true });
      const userLang = langOf(String(msg?.from?.language_code ?? "").slice(0, 2));
      const linked = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>chat=eq.${chat}&deleted_at=is.null&limit=1`))[0];
      const lang = linked?.value.lang ?? userLang;
      const [cmd, arg] = text.split(/\s+/, 2);
      // the traders this chat is the accountability partner of (a partner needs no Mizan account)
      const partnerOf = () => rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->partner->>chat=eq.${chat}&deleted_at=is.null`);
      const coachOf = () => rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->coach->>chat=eq.${chat}&deleted_at=is.null`);
      const audio = msg?.voice ?? msg?.audio;
      if (linked && audio?.file_id) {
        // a voice note in reply to a trade's message: that message's plan or note button names the trade
        const btns = ((msg.reply_to_message?.reply_markup?.inline_keyboard ?? []) as { callback_data?: string; url?: string }[][]).flat();
        const keyOf = (b: { callback_data?: string; url?: string }) => { const m = String(b.callback_data ?? "").match(/^p[01]:(.+)$/); if (m) return m[1]; try { return b.url ? new URL(b.url).searchParams.get("trade") : null; } catch { return null; } };
        const keys = [...new Set(btns.map(keyOf).filter((k): k is string => !!k))];
        if (keys.length !== 1) { await send(chat, T(keys.length ? "vMany" : "vReply", lang)); return json({ ok: true }); }
        if (Number(audio.duration ?? 0) > 180 || Number(audio.file_size ?? 0) > 20e6) { await send(chat, T("vLong", lang)); return json({ ok: true }); }
        const tr = (await rows<{ key: string; symbol: string }>(`trades?select=key,symbol&user_id=eq.${linked.user_id}&key=eq.${encodeURIComponent(keys[0])}&limit=1`))[0];
        if (!tr) { await send(chat, T("vReply", lang)); return json({ ok: true }); }
        let words = "";
        try {
          const path = (await (await tg("getFile", { file_id: audio.file_id })).json().catch(() => null))?.result?.file_path;
          const file = path ? await fetch(`https://api.telegram.org/file/bot${TOKEN}/${path}`, { signal: AbortSignal.timeout(20000) }) : null;
          if (file?.ok) words = await transcribe(new Uint8Array(await file.arrayBuffer()), String(audio.mime_type || "audio/ogg"));
        } catch { /* no text: told below */ }
        if (!words) { await send(chat, T("vFail", lang)); return json({ ok: true }); }
        const cur = (await rows<{ value: Record<string, Voice[]> | null }>(`user_settings?select=value&user_id=eq.${linked.user_id}&key=eq.mizan-trade-voice&deleted_at=is.null`))[0]?.value ?? {};
        const list = [...(cur[tr.key] ?? []), { t: words, at: new Date().toISOString(), d: Math.round(Number(audio.duration ?? 0)) }].slice(-5);
        const value = Object.fromEntries([...Object.entries(cur).filter(([k]) => k !== tr.key), [tr.key, list]].slice(-300)); // the 300 latest trades
        const w = await db("user_settings?on_conflict=user_id,key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: linked.user_id, key: "mizan-trade-voice", value, updated_at: null, deleted_at: null }) });
        await send(chat, w.ok ? T("vSaved", lang, { s: tr.symbol, t: words }) : T("vFail", lang));
        return json({ ok: true });
      }
      const invite = cmd === "/start" ? arg?.match(/^(partner|coach)_(.+)$/) : null;
      if (invite) { // an invite link: show what the partner or coach would get, then ask
        const px = invite[1] === "partner" ? "p" : "c", code = invite[2];
        const inv = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>${px}codeHash=eq.${await sha256(code)}&deleted_at=is.null&limit=1`))[0];
        const at = px === "p" ? inv?.value.pcodeAt : inv?.value.ccodeAt;
        if (!inv?.value.chat || !at || Date.now() - Date.parse(at) > 7 * 864e5) await send(chat, T("pExpired", userLang));
        else if (inv.value.chat === chat) await send(chat, T(`${px}Self`, userLang));
        else await send(chat, T(`${px}Invite`, userLang, { n: await traderName(inv.user_id, inv.value) }), [[{ text: T("pAccept", userLang), callback_data: `${px}a:${code}` }, { text: T("pDecline", userLang), callback_data: `${px}d:${code}` }]]);
        return json({ ok: true });
      }
      if (cmd === "/leave") { // stop being a partner and a coach, for everyone
        const done: string[] = [];
        for (const [role, list] of [["partner", await partnerOf()], ["coach", await coachOf()]] as const) {
          const names: string[] = [];
          for (const r of list) {
            names.push(await traderName(r.user_id, r.value));
            await saveTg(r.user_id, { ...r.value, [role]: null });
            if (r.value.chat) await send(r.value.chat, T(role === "partner" ? "pLeftT" : "cLeftT", r.value.lang ?? "en", { p: r.value[role]?.name ?? "" }));
          }
          if (names.length) done.push(T(role === "partner" ? "pLeft" : "cLeft", userLang, { n: names.join(", ") }));
        }
        if (done.length) { await send(chat, done.join("\n")); return json({ ok: true }); }
      }
      if (cmd === "/start" && arg) {
        const row = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>codeHash=eq.${await sha256(arg)}&deleted_at=is.null&limit=1`))[0];
        if (!row || !row.value.codeAt || Date.now() - Date.parse(row.value.codeAt) > 30 * 60e3) { await send(chat, T("badCode", userLang)); return json({ ok: true }); }
        if (linked && linked.user_id !== row.user_id) await saveTg(linked.user_id, { ...linked.value, chat: null }); // one chat, one Mizan user
        const name = [msg.from?.first_name, msg.from?.username ? `@${msg.from.username}` : null].filter(Boolean).join(" ").slice(0, 80) || null;
        await saveTg(row.user_id, { ...row.value, chat, name, codeHash: null, codeAt: null });
        await send(chat, T("linked", row.value.lang ?? userLang));
      } else if (!linked) {
        const mine = await partnerOf(), coached = await coachOf(), names = (l: { user_id: string; value: Tg }[]) => Promise.all(l.map((r) => traderName(r.user_id, r.value))).then((x) => x.join(", "));
        const help = [...(mine.length ? [T("pHelp", userLang, { n: await names(mine) })] : []), ...(coached.length ? [T("cHelp", userLang, { n: await names(coached) })] : [])];
        await send(chat, help.length ? help.join("\n") : T("unknown", userLang));
      } else if (cmd === "/stop") { // the alerts stop, and so do the partnership and the coaching
        if (linked.value.partner?.chat) await send(linked.value.partner.chat, T("pEnded", linked.value.partner.lang, { n: await traderName(linked.user_id, linked.value) }));
        if (linked.value.coach?.chat) await send(linked.value.coach.chat, T("cEnded", linked.value.coach.lang, { n: await traderName(linked.user_id, linked.value) }));
        await saveTg(linked.user_id, { ...linked.value, chat: null, partner: null, coach: null });
        await send(chat, T("stopped", lang));
      }
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
      const lang = t.lang ?? "en", prefs = prefsOf(t.prefs), today = now.slice(0, 10);
      const acc = (await rows<Acc>(`accounts?select=id,name,currency&id=eq.${accountId}&user_id=eq.${uid}&deleted_at=is.null`))[0];
      if (!acc) return json({ ok: true, sent: 0 });
      const closed = Array.isArray(body.closed) ? (body.closed as TradeRow[]) : [];
      const since = new Date(Date.parse(`${now}Z`) - 3 * 3600e3).toISOString().slice(0, 16); // broker clock, as the trade times
      const recent = closed.filter((x) => typeof x?.exit_time === "string" && x.exit_time >= since && Number.isFinite(Number(x.pnl)))
        .sort((a, b) => (a.exit_time as string).localeCompare(b.exit_time as string));
      const lines: string[] = [], buttons: Btn[] = [], url = site(t);
      if (prefs.trades) {
        const m = (v: number) => money(v, { cents: true, sign: true, cur: acc.currency, lang });
        for (const x of recent.slice(0, 5)) {
          lines.push(`${Number(x.pnl) > 0 ? "🟢" : Number(x.pnl) < 0 ? "🔴" : "⚪"} ${x.symbol} ${side(x.side, lang)} ${m(Number(x.pnl))}`);
          if (url && typeof x.key === "string") buttons.push({ text: T("note", lang, { s: `${x.symbol} ${m(Number(x.pnl))}` }), url: `${url}?trade=${encodeURIComponent(x.key)}` });
        }
        if (recent.length > 5) lines.push(T("more", lang, { n: recent.length - 5, m: m(recent.slice(5).reduce((s, x) => s + Number(x.pnl), 0)) }));
      }
      const sent = { ...(t.sent ?? {}) }, newKeys: string[] = [], alerts: string[] = [];
      // 3+ losses in a row on this account, the last one just closed (each new loss of the run warns again)
      if (prefs.streak && recent.some((x) => Number(x.pnl) < 0)) {
        const last = await rows<TradeRow>(`trades?select=key,pnl,exit_time&user_id=eq.${uid}&account_id=eq.${accountId}&status=eq.closed&deleted_at=is.null&order=exit_time.desc&limit=30`);
        const s = lossStreak(last), k = s.n >= 3 && last[0]?.key && (last[0].exit_time ?? "") >= since ? `streak:${today}:${last[0].key}` : "";
        if (k && !sent[k]) { alerts.push(T("streak", lang, { a: acc.name, n: s.n, s: money(s.sum, { cur: acc.currency, lang }) })); newKeys.push(k); }
      }
      // open trades still without a stop loss 2 minutes after the entry (once per trade); the partner hears of it too
      const todo: { rule: Rule; x: OpenRow; k?: number | string }[] = [];
      if ((prefs.nosl || t.partner?.chat || t.coach?.chat) && Array.isArray(body.open)) {
        const due = noSlDue(body.open as OpenRow[], Date.parse(`${now}Z`), sent).slice(0, 5);
        if (prefs.nosl) for (const x of due) { alerts.push(noSlLine(acc, x, lang)); newKeys.push(x.k); }
        if (due.length) todo.push({ rule: "nosl", x: newest(due) });
      }
      // a new trade after 3+ losses in a row today, or after a challenge's daily loss limit was reached: for the partner
      const newOne = (t.partner?.chat || t.coach?.chat) && Array.isArray(body.opened) ? (body.opened as OpenRow[]).find((x) => typeof x?.symbol === "string" && typeof x.entry_time === "string" && Date.parse(`${now}Z`) - naive(x.entry_time) <= 30 * 60e3) : undefined;
      if (newOne) {
        const last = await rows<TradeRow>(`trades?select=key,pnl,exit_time&user_id=eq.${uid}&account_id=eq.${accountId}&status=eq.closed&deleted_at=is.null&order=exit_time.desc&limit=30`);
        const s = lossStreak(last.filter((x) => day(x.exit_time) === today)); // losses in a row today
        if (s.n >= 3) todo.push({ rule: "streak", x: newOne, k: s.n });
        const chs = ((await rows<{ value: Ch[] }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-challenges&deleted_at=is.null`))[0]?.value ?? []).filter((c) => c?.accountId === accountId).map((c) => asProp(c, now)).filter((c) => c.daily != null);
        if (chs.length) {
          const all = await rows<TradeRow>(`trades?select=symbol,side,pnl,status,entry_time,exit_time&user_id=eq.${uid}&account_id=eq.${accountId}&deleted_at=is.null`);
          if (chs.some((c) => { const n = challengeNow(c, all, today); return n.limit != null && n.limit > 0 && -n.todayPnl >= n.limit - 1e-9; })) todo.push({ rule: "limit", x: newOne });
        }
      }
      if (prefs.rules && closed.length) {
        const list = ((await rows<{ value: Ch[] }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-challenges&deleted_at=is.null`))[0]?.value ?? []).filter((c) => c?.accountId === accountId).map((c) => asProp(c, now));
        if (list.length) {
          const trades = await rows<TradeRow>(`trades?select=symbol,side,pnl,status,entry_time,exit_time&user_id=eq.${uid}&account_id=eq.${accountId}&deleted_at=is.null`);
          const m = (v: number) => money(v, { cur: acc.currency, lang });
          for (const c of list) {
            const w = warnings({ ...c, name: `${acc.name} · ${c.name}` }, challengeNow(c, trades, today), today, sent, (k, v) => T(k, lang, v), m);
            alerts.push(...w.out); newKeys.push(...w.keys);
          }
        }
      }
      // trades just opened (30 minutes at most): one message each, with the plan question and the danger-zone warning
      const entries: { text: string; kb: Btn[][]; k: string }[] = [];
      const opened = Array.isArray(body.opened) ? (body.opened as OpenRow[]) : [];
      const mine = prefs.myRules && opened.length ? (await myRules(uid)).filter((r) => r.at <= today) : [];
      const owns = opened.length && (prefs.myRules || t.partner?.chat || t.coach?.chat) ? ((await rows<{ value: Ch[] }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-challenges&deleted_at=is.null`))[0]?.value ?? []).filter((c) => c?.kind === "own" && c.accountId === accountId && c.start <= today) : [];
      if ((prefs.entry || prefs.danger || mine.length || owns.length) && opened.length) {
        const fresh = opened.filter((x) => typeof x?.key === "string" && x.key.length <= 60 && typeof x.symbol === "string" && typeof x.entry_time === "string"
          && Date.parse(`${now}Z`) - naive(x.entry_time) <= 30 * 60e3 && !sent[`entry:${x.entry_time.slice(0, 10)}:${x.key}`]).slice(0, 3);
        const hist = fresh.length && prefs.danger ? await rows<Hist>(`trades?select=symbol,side,pnl,entry_time&user_id=eq.${uid}&account_id=eq.${accountId}&status=eq.closed&deleted_at=is.null&order=exit_time.desc&limit=1000`) : [];
        // the day so far, for the daily rules: trades opened today, and those closed today (result, losses in a row)
        const opens = fresh.length && mine.length ? await rows<{ key: string; entry_time: string | null }>(`trades?select=key,entry_time&user_id=eq.${uid}&account_id=eq.${accountId}&deleted_at=is.null&entry_time=gte.${today}`) : [];
        const shut = fresh.length && mine.length ? await rows<TradeRow>(`trades?select=key,pnl,exit_time&user_id=eq.${uid}&account_id=eq.${accountId}&status=eq.closed&deleted_at=is.null&exit_time=gte.${today}&order=exit_time.asc&limit=500`) : [];
        const dayNet = shut.reduce((a, r) => a + Number(r.pnl ?? 0), 0);
        const since = owns.length ? owns.map((c) => c.start).sort()[0] : "";
        const ownTrades = fresh.length && owns.length ? await rows<TradeRow>(`trades?select=key,symbol,side,pnl,status,entry_time,exit_time&user_id=eq.${uid}&account_id=eq.${accountId}&deleted_at=is.null&entry_time=gte.${since}&limit=5000`) : [];
        let run = 0;
        for (let i = shut.length - 1; i >= 0 && Number(shut[i].pnl) < 0; i--) run++;
        for (const x of fresh) {
          const d = prefs.danger ? dangerOf(x, hist) : null;
          const n = opens.filter((r) => r.key !== x.key && (r.entry_time ?? "") < x.entry_time).length;
          const broke = mine.filter((r) => ruleBroken(r.rules, x, { n, net: dayNet, run })).map((r) => T("breaks", lang, { r: ruleText(r.rules, lang, acc.currency) }));
          for (const c of owns) {
            const at = tm(x.entry_time), r = ownAt(c, at), hits = ownBroken(r, x, ownCtx(ownTrades, c.start, at, x.key), c.size);
            if (prefs.myRules) broke.push(...hits.map((k) => T("breaks", lang, { r: ownText(k, r, c.size, lang, acc.currency) })));
            if (hits.length && c.signed?.notify) todo.push({ rule: "own", x, k: hits[0] }); // the contract: the partner and the coach hear of it
          }
          if (!prefs.entry && !d && !broke.length) continue;
          const head = T("entry", lang, { a: acc.name, s: x.symbol, d: side(x.side, lang), q: Number(x.qty).toLocaleString("en-US"), h: x.entry_time.replace(" ", "T").slice(11, 16) });
          entries.push({ text: [head, ...(d ? [dangerLine(d, x, lang, acc)] : []), ...broke, ...(prefs.entry ? [T("ask", lang)] : [])].join("\n"), kb: prefs.entry ? [planButtons(x.key, lang)] : [], k: `entry:${x.entry_time.slice(0, 10)}:${x.key}` });
        }
      }
      const keep: string[] = [];
      let n = 0;
      if (lines.length || alerts.length) {
        const text = [lines.length ? `📊 ${acc.name}\n${lines.join("\n")}` : "", alerts.join("\n\n")].filter(Boolean).join("\n\n");
        const r = await send(t.chat, text, buttons.map((b) => [b]));
        if (r.ok) { n++; keep.push(...newKeys); }
      }
      for (const e of entries) { const r = await send(t.chat, e.text, e.kb); if (r.ok) { n++; keep.push(e.k); } }
      for (const d of todo) { const k = await tellPartner(uid, t, d.rule, d.x, today, sent, d.k); n += k.length; keep.push(...k); }
      if (keep.length) await remember(uid, t, sent, keep, today);
      return json({ ok: true, sent: n });
    }

    // ---- pg_cron, every 5 minutes: what is due now for every linked chat ----
    if (body?.action === "tick") {
      if (!TOKEN) return json({ ok: false, error: "noToken" }, 503);
      // one run at a time and at most every 4 minutes, so the open call cannot be used to flood anyone
      const lock = await db(`tg_state?id=eq.tick&at=lt.${encodeURIComponent(new Date(Date.now() - 4 * 60e3).toISOString())}`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ at: new Date().toISOString() }) });
      if (!lock.ok || !((await lock.json()) as unknown[]).length) return json({ ok: true, skipped: true });
      await ensureHook().catch(() => null); // the plan buttons need button taps sent here: set once, without waiting for the app
      const users = await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>chat=not.is.null&deleted_at=is.null&limit=1000`);
      let calP: Promise<Cal[]> | null = null, n = 0;
      const calendar = () => (calP ??= loadCalendar()); // read once per tick, and only if someone needs it
      for (let i = 0; i < users.length; i += 5) {
        const part = await Promise.all(users.slice(i, i + 5).map((u) => tickUser(u.user_id, u.value, calendar).catch(() => 0))); // a failing user does not stop the others
        n += part.reduce((a, b) => a + b, 0);
      }
      const coached = await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->coach->>chat=not.is.null&deleted_at=is.null&limit=1000`);
      const byCoach = new Map<number, { lang: Lang; uids: string[] }>();
      for (const r of coached) { const c = r.value.coach; if (!c?.chat || c.prefs?.daily === false) continue; const e = byCoach.get(c.chat) ?? { lang: c.lang, uids: [] }; e.uids.push(r.user_id); byCoach.set(c.chat, e); }
      for (const [c, e] of byCoach) n += await tickCoach(c, e.lang, e.uids).catch(() => 0);
      const groups = await rows<{ id: string; value: Grp }>(`tg_state?select=id,value&id=like.grp:*&limit=500`);
      for (const g of groups) n += await tickGroup(g.id, g.value).catch(() => 0);
      return json({ ok: true, users: users.length, groups: groups.length, sent: n });
    }

    // ---- from the app (the user's session) ----
    const who = await fetch(`${SB}/auth/v1/user`, { headers: { authorization: auth, apikey: req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "" }, signal: AbortSignal.timeout(10000) });
    if (!who.ok) return json({ ok: false, error: "signIn" }, 401);
    const uid = ((await who.json()) as { id?: string }).id ?? "";
    if (!uid) return json({ ok: false, error: "signIn" }, 401);
    if (!TOKEN) return json({ ok: false, error: "noToken" }, 503);
    const lang = langOf(body?.lang), cur = (await getTg(uid)) ?? {};
    const state = (v: Tg) => ({ linked: !!v.chat, name: v.name ?? null, prefs: prefsOf(v.prefs), partner: v.partner?.chat ? { name: v.partner.name, since: v.partner.since } : null,
      coach: v.coach?.chat ? { name: v.coach.name, since: v.coach.since, prefs: { ...COACH, ...(v.coach.prefs ?? {}) } } : null });

    switch (body?.action) {
      case "info": {
        const me = await (await tg("getMe", {})).json().catch(() => null);
        if (!me?.ok) return json({ ok: false, error: "badToken" }, 502);
        await ensureHook(); // point the bot here: Telegram then sends every message and button tap for the bot to this function
        // the app's address (for the "note" buttons) and the browser's time zone (when the profile has none)
        const at = typeof body?.site === "string" && /^https?:\/\/\S{3,200}$/.test(body.site) ? body.site : cur.site ?? null, tz = validTz(body?.tz) ?? cur.tz ?? null;
        if (cur.lang !== lang || cur.site !== at || cur.tz !== tz) await saveTg(uid, { ...cur, lang, site: at, tz });
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
        if (cur.partner?.chat) await send(cur.partner.chat, T("pEnded", cur.partner.lang, { n: await traderName(uid, cur) })).catch(() => null);
        if (cur.coach?.chat) await send(cur.coach.chat, T("cEnded", cur.coach.lang, { n: await traderName(uid, cur) })).catch(() => null);
        await saveTg(uid, { ...cur, chat: null, name: null, codeHash: null, codeAt: null, partner: null, pcodeHash: null, pcodeAt: null, coach: null, ccodeHash: null, ccodeAt: null });
        return json({ ok: true, ...state({}) });
      }
      case "partnerInvite": { // a one-time t.me link (7 days) for the partner; a new one replaces the last
        if (!cur.chat) return json({ ok: false, error: "notLinked" }, 409);
        const code = b64url(crypto.getRandomValues(new Uint8Array(18)));
        await saveTg(uid, { ...cur, lang, pcodeHash: await sha256(code), pcodeAt: new Date().toISOString() });
        const me = await (await tg("getMe", {})).json().catch(() => null);
        return me?.ok ? json({ ok: true, url: `https://t.me/${me.result.username}?start=partner_${code}` }) : json({ ok: false, error: "badToken" }, 502);
      }
      case "partnerRemove": {
        if (cur.partner?.chat) await send(cur.partner.chat, T("pEnded", cur.partner.lang, { n: await traderName(uid, cur) })).catch(() => null);
        const next = { ...cur, partner: null, pcodeHash: null, pcodeAt: null };
        await saveTg(uid, next);
        return json({ ok: true, ...state(next) });
      }
      case "coachInvite": { // the same for a coach
        if (!cur.chat) return json({ ok: false, error: "notLinked" }, 409);
        const code = b64url(crypto.getRandomValues(new Uint8Array(18)));
        await saveTg(uid, { ...cur, lang, ccodeHash: await sha256(code), ccodeAt: new Date().toISOString() });
        const me = await (await tg("getMe", {})).json().catch(() => null);
        return me?.ok ? json({ ok: true, url: `https://t.me/${me.result.username}?start=coach_${code}` }) : json({ ok: false, error: "badToken" }, 502);
      }
      case "coachRemove": {
        if (cur.coach?.chat) await send(cur.coach.chat, T("cEnded", cur.coach.lang, { n: await traderName(uid, cur) })).catch(() => null);
        const next = { ...cur, coach: null, ccodeHash: null, ccodeAt: null };
        await saveTg(uid, next);
        return json({ ok: true, ...state(next) });
      }
      case "coachPrefs": { // what the coach gets: the rule alerts and the daily scores
        if (!cur.coach?.chat) return json({ ok: false, error: "notLinked" }, 409);
        const p = body?.prefs ?? {}, next = { ...cur, coach: { ...cur.coach, prefs: Object.fromEntries(Object.keys(COACH).map((k) => [k, p[k] !== false])) as typeof COACH } };
        await saveTg(uid, next);
        return json({ ok: true, ...state(next) });
      }
      case "prefs": {
        const p = body?.prefs ?? {}, next = { ...cur, lang, prefs: Object.fromEntries(Object.keys(PREFS).map((k) => [k, p[k] !== false])) as Prefs };
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
