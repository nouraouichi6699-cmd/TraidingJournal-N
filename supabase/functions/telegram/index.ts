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
//  - Accountability partner: the app makes a one-time invite link (7 days); the partner sees what they would get and
//    accepts or declines with buttons, /leave stops it. When the trader breaks a rule (a trade left without a stop loss,
//    a new trade after 3+ losses in a row today, a new trade after a challenge's daily loss limit), the partner gets one
//    message per rule per day, never amounts or account details, and the trader is told.
//  - "tick" (pg_cron every 5 minutes, migration 20261024_telegram_tick.sql; no key needed: it only sends what is due and
//    runs at most every 4 minutes): MT5 sync stopped for an hour with open trades, yesterday's summary just after the
//    broker's midnight, the week's summary on Sunday from 10:00 (with a tip from the AI model, no account names or
//    numbers sent to it), high-impact news 15 minutes ahead for the currencies the user trades, and on weekdays from
//    08:00 the morning plan of each running challenge (room, a safe risk per trade, the pace to the target).
// Stored in user_settings "telegram": { chat, name, lang, prefs, codeHash, codeAt, sent, site, tz } (no bot token anywhere
// but here). Setup once: create a bot with @BotFather, add its token as the secret TELEGRAM_BOT_TOKEN, deploy with
// "Verify JWT" off; for the scheduled alerts run the migration once. The weekly tip uses GEMINI_API_KEY (as "advisor").
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
type Lang = "en" | "ar" | "fr";
const PREFS = { trades: true, rules: true, streak: true, nosl: true, stale: true, daily: true, weekly: true, news: true, entry: true, danger: true, morning: true };
type Prefs = typeof PREFS;
const prefsOf = (p?: Partial<Prefs> | null): Prefs => ({ ...PREFS, ...(p ?? {}) });
type Partner = { chat: number; name: string | null; lang: Lang; since: string };
type Tg = { chat?: number | null; name?: string | null; lang?: Lang; prefs?: Partial<Prefs>; codeHash?: string | null; codeAt?: string | null; sent?: Record<string, string>; site?: string | null; tz?: string | null;
  partner?: Partner | null; pcodeHash?: string | null; pcodeAt?: string | null };
type Rule = "nosl" | "streak" | "limit";
type Ch = { id: string; accountId: string; name: string; start: string; size: number; target: number | null; daily: number | null; dailyBase: "size" | "dayStart"; max: number | null; trailing: boolean; trailLock?: boolean; minDays: number; limitDays?: number | null };
type TradeRow = { key?: string; symbol: string; side: string; pnl: number | null; status: string; entry_time: string | null; exit_time: string | null; sl?: number | null };
type OpenRow = { key: string; symbol: string; side: string; qty: number; entry_time: string };
type Acc = { id: string; name: string; currency: string | null };
type Sync = { brokerNow?: string; last?: string };
type Btn = { text: string; url?: string; callback_data?: string };
type Hist = { symbol: string; side: string; pnl: number | null; entry_time: string | null };
type Danger = { kind: "symHour" | "sideSym" | "sym" | "hour" | "day"; n: number; lost: number; net: number };
type Cal = { id: string; time: string; currency: string; title: string; forecast: string; previous: string };

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
  rnosl: { en: "a trade without a stop loss", ar: "صفقة بلا وقف خسارة", fr: "un trade sans stop loss" },
  rstreak: { en: "trading on after {k} losses in a row", ar: "مواصلة التداول بعد {k} خسائر متتالية", fr: "continuer après {k} pertes d'affilée" },
  rlimit: { en: "a new trade after the daily loss limit", ar: "صفقة جديدة بعد بلوغ حد الخسارة اليومي", fr: "un nouveau trade après la limite de perte du jour" },
  bRule: { en: "🤝 {n} broke a rule: {r} ({s}, {h}). A short message from you can help.", ar: "🤝 {n} كسر قاعدة: {r} ({s}، {h}). رسالة قصيرة منك قد تساعده.", fr: "🤝 {n} a enfreint une règle : {r} ({s}, {h}). Un petit message de votre part peut l'aider." },
  tTold: { en: "🤝 Your partner {p} was told: {r}.", ar: "🤝 أُبلغ شريكك {p}: {r}.", fr: "🤝 Votre partenaire {p} a été prévenu : {r}." },
  mHead: { en: "☀️ Morning plan · {d}", ar: "☀️ خطة الصباح · {d}", fr: "☀️ Plan du matin · {d}" },
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
  /** The trader's name as the partner sees it: the Mizan profile name, else the first word of their Telegram name. */
  const traderName = async (uid: string, t: Tg) => {
    const p = (await rows<{ value: { name?: unknown } | null }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-profile&deleted_at=is.null`))[0]?.value?.name;
    return (typeof p === "string" && p.trim() ? p.trim() : (t.name ?? "").split(" @")[0] || "Mizan").slice(0, 60);
  };
  /** A broken rule: the partner gets one message per rule per day (no amounts, no account) and the trader a line saying
   *  so. Returns the key to remember ("" when nothing went out). A partner who blocked the bot ends the partnership. */
  const tellPartner = async (uid: string, t: Tg, rule: Rule, x: { symbol: string; entry_time: string }, day: string, sent: Record<string, string>, k = 3) => {
    const p = t.partner, key = `partner:${day}:${rule}`;
    if (!p?.chat || sent[key]) return "";
    const why = (l: Lang) => T(`r${rule}`, l, { k });
    const res = await send(p.chat, T("bRule", p.lang, { n: await traderName(uid, t), r: why(p.lang), s: x.symbol, h: x.entry_time.replace(" ", "T").slice(11, 16) }));
    if (res.status === 403) {
      await saveTg(uid, { ...((await getTg(uid)) ?? t), partner: null });
      if (t.chat) await send(t.chat, T("pGone", t.lang ?? "en", { p: p.name ?? "" }));
      return "";
    }
    if (!res.ok) return "";
    if (t.chat) await send(t.chat, T("tTold", t.lang ?? "en", { p: p.name ?? "", r: why(t.lang ?? "en") }));
    sent[key] = day; // the rest of this call does not tell twice
    return key;
  };
  /** Points the bot here, for messages and button taps (set again when it was set before the buttons existed). */
  const ensureHook = async () => {
    const hook = `${SB}/functions/v1/telegram`, w = (await (await tg("getWebhookInfo", {})).json().catch(() => null))?.result;
    if (!w || w.url !== hook || /401|403/.test(w.last_error_message ?? "") || !(w.allowed_updates ?? []).includes("callback_query"))
      await tg("setWebhook", { url: hook, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: !w || w.url !== hook });
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
      const n = challengeNow(c, trades, today), m = (v: number, sign = false) => money(v, { sign, cur: a.currency, lang });
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
      if ((prefs.nosl || t.partner?.chat) && now - last <= 15 * 60e3) {
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

    // the morning plan of each running challenge, on weekdays from 08:00 the user's time
    if (prefs.morning) {
      const lp = localParts(now, tz), k = `morning:${lp.date}:`;
      if (lp.wd >= 1 && lp.wd <= 5 && lp.hour >= 8 && lp.hour < 12 && !sent[k]) {
        const chs = ((await rows<{ value: Ch[] }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-challenges&deleted_at=is.null`))[0]?.value ?? []).filter((c) => c?.accountId);
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
    for (const d of partnerTodo) { const k = await tellPartner(uid, t, "nosl", d.x, d.day, sent); if (k) { n++; keys.push(k); } }
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
      // the partner's answer to an invite: "pa:<code>" accept, "pd:<code>" decline (the code is checked again here)
      const pm = cq ? String(cq.data ?? "").match(/^p([ad]):([A-Za-z0-9_-]{10,40})$/) : null;
      if (cq && pm && typeof cq.message?.chat?.id === "number") {
        const qChat = cq.message.chat.id as number, pLang = langOf(String(cq.from?.language_code ?? "").slice(0, 2));
        const inv = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>pcodeHash=eq.${await sha256(pm[2])}&deleted_at=is.null&limit=1`))[0];
        await tg("editMessageReplyMarkup", { chat_id: qChat, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
        if (!inv?.value.chat || !inv.value.pcodeAt || Date.now() - Date.parse(inv.value.pcodeAt) > 7 * 864e5 || inv.value.chat === qChat) await send(qChat, T("pExpired", pLang));
        else {
          const pname = String(cq.from?.first_name || (cq.from?.username ? `@${cq.from.username}` : "") || "—").slice(0, 60), tname = await traderName(inv.user_id, inv.value);
          if (pm[1] === "a") {
            if (inv.value.partner?.chat && inv.value.partner.chat !== qChat) await send(inv.value.partner.chat, T("pEnded", inv.value.partner.lang, { n: tname })); // one partner: the new one replaces the old
            await saveTg(inv.user_id, { ...inv.value, partner: { chat: qChat, name: pname, lang: pLang, since: new Date().toISOString() }, pcodeHash: null, pcodeAt: null });
            await send(qChat, T("pAccepted", pLang, { n: tname }));
            await send(inv.value.chat, T("pNow", inv.value.lang ?? "en", { p: pname }));
          } else {
            await saveTg(inv.user_id, { ...inv.value, pcodeHash: null, pcodeAt: null });
            await send(qChat, T("pDeclined", pLang));
            await send(inv.value.chat, T("pDeclinedT", inv.value.lang ?? "en", { p: pname }));
          }
        }
        await tg("answerCallbackQuery", { callback_query_id: cq.id });
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
      if (typeof chat !== "number" || msg?.chat?.type !== "private") return json({ ok: true });
      const userLang = langOf(String(msg?.from?.language_code ?? "").slice(0, 2));
      const linked = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>chat=eq.${chat}&deleted_at=is.null&limit=1`))[0];
      const lang = linked?.value.lang ?? userLang;
      const [cmd, arg] = text.split(/\s+/, 2);
      // the traders this chat is the accountability partner of (a partner needs no Mizan account)
      const partnerOf = () => rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->partner->>chat=eq.${chat}&deleted_at=is.null`);
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
      if (cmd === "/start" && arg?.startsWith("partner_")) { // an invite link: show what the partner would get, then ask
        const code = arg.slice(8), inv = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>pcodeHash=eq.${await sha256(code)}&deleted_at=is.null&limit=1`))[0];
        if (!inv?.value.chat || !inv.value.pcodeAt || Date.now() - Date.parse(inv.value.pcodeAt) > 7 * 864e5) await send(chat, T("pExpired", userLang));
        else if (inv.value.chat === chat) await send(chat, T("pSelf", userLang));
        else await send(chat, T("pInvite", userLang, { n: await traderName(inv.user_id, inv.value) }), [[{ text: T("pAccept", userLang), callback_data: `pa:${code}` }, { text: T("pDecline", userLang), callback_data: `pd:${code}` }]]);
        return json({ ok: true });
      }
      if (cmd === "/leave") {
        const mine = await partnerOf();
        if (mine.length) {
          const names: string[] = [];
          for (const r of mine) {
            names.push(await traderName(r.user_id, r.value));
            await saveTg(r.user_id, { ...r.value, partner: null });
            if (r.value.chat) await send(r.value.chat, T("pLeftT", r.value.lang ?? "en", { p: r.value.partner?.name ?? "" }));
          }
          await send(chat, T("pLeft", userLang, { n: names.join(", ") }));
          return json({ ok: true });
        }
      }
      if (cmd === "/start" && arg) {
        const row = (await rows<{ user_id: string; value: Tg }>(`user_settings?select=user_id,value&key=eq.telegram&value->>codeHash=eq.${await sha256(arg)}&deleted_at=is.null&limit=1`))[0];
        if (!row || !row.value.codeAt || Date.now() - Date.parse(row.value.codeAt) > 30 * 60e3) { await send(chat, T("badCode", userLang)); return json({ ok: true }); }
        if (linked && linked.user_id !== row.user_id) await saveTg(linked.user_id, { ...linked.value, chat: null }); // one chat, one Mizan user
        const name = [msg.from?.first_name, msg.from?.username ? `@${msg.from.username}` : null].filter(Boolean).join(" ").slice(0, 80) || null;
        await saveTg(row.user_id, { ...row.value, chat, name, codeHash: null, codeAt: null });
        await send(chat, T("linked", row.value.lang ?? userLang));
      } else if (!linked) {
        const mine = await partnerOf();
        await send(chat, mine.length ? T("pHelp", userLang, { n: (await Promise.all(mine.map((r) => traderName(r.user_id, r.value)))).join(", ") }) : T("unknown", userLang));
      } else if (cmd === "/stop") { // the alerts stop, and so does the partnership
        if (linked.value.partner?.chat) await send(linked.value.partner.chat, T("pEnded", linked.value.partner.lang, { n: await traderName(linked.user_id, linked.value) }));
        await saveTg(linked.user_id, { ...linked.value, chat: null, partner: null });
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
      const todo: { rule: Rule; x: OpenRow; k?: number }[] = [];
      if ((prefs.nosl || t.partner?.chat) && Array.isArray(body.open)) {
        const due = noSlDue(body.open as OpenRow[], Date.parse(`${now}Z`), sent).slice(0, 5);
        if (prefs.nosl) for (const x of due) { alerts.push(noSlLine(acc, x, lang)); newKeys.push(x.k); }
        if (due.length) todo.push({ rule: "nosl", x: newest(due) });
      }
      // a new trade after 3+ losses in a row today, or after a challenge's daily loss limit was reached: for the partner
      const newOne = t.partner?.chat && Array.isArray(body.opened) ? (body.opened as OpenRow[]).find((x) => typeof x?.symbol === "string" && typeof x.entry_time === "string" && Date.parse(`${now}Z`) - naive(x.entry_time) <= 30 * 60e3) : undefined;
      if (newOne) {
        const last = await rows<TradeRow>(`trades?select=key,pnl,exit_time&user_id=eq.${uid}&account_id=eq.${accountId}&status=eq.closed&deleted_at=is.null&order=exit_time.desc&limit=30`);
        const s = lossStreak(last.filter((x) => day(x.exit_time) === today)); // losses in a row today
        if (s.n >= 3) todo.push({ rule: "streak", x: newOne, k: s.n });
        const chs = ((await rows<{ value: Ch[] }>(`user_settings?select=value&user_id=eq.${uid}&key=eq.mizan-challenges&deleted_at=is.null`))[0]?.value ?? []).filter((c) => c?.accountId === accountId && c.daily != null);
        if (chs.length) {
          const all = await rows<TradeRow>(`trades?select=symbol,side,pnl,status,entry_time,exit_time&user_id=eq.${uid}&account_id=eq.${accountId}&deleted_at=is.null`);
          if (chs.some((c) => { const n = challengeNow(c, all, today); return n.limit != null && n.limit > 0 && -n.todayPnl >= n.limit - 1e-9; })) todo.push({ rule: "limit", x: newOne });
        }
      }
      if (prefs.rules && closed.length) {
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
      // trades just opened (30 minutes at most): one message each, with the plan question and the danger-zone warning
      const entries: { text: string; kb: Btn[][]; k: string }[] = [];
      if ((prefs.entry || prefs.danger) && Array.isArray(body.opened)) {
        const fresh = (body.opened as OpenRow[]).filter((x) => typeof x?.key === "string" && x.key.length <= 60 && typeof x.symbol === "string" && typeof x.entry_time === "string"
          && Date.parse(`${now}Z`) - naive(x.entry_time) <= 30 * 60e3 && !sent[`entry:${x.entry_time.slice(0, 10)}:${x.key}`]).slice(0, 3);
        const hist = fresh.length && prefs.danger ? await rows<Hist>(`trades?select=symbol,side,pnl,entry_time&user_id=eq.${uid}&account_id=eq.${accountId}&status=eq.closed&deleted_at=is.null&order=exit_time.desc&limit=1000`) : [];
        for (const x of fresh) {
          const d = prefs.danger ? dangerOf(x, hist) : null;
          if (!prefs.entry && !d) continue;
          const head = T("entry", lang, { a: acc.name, s: x.symbol, d: side(x.side, lang), q: Number(x.qty).toLocaleString("en-US"), h: x.entry_time.replace(" ", "T").slice(11, 16) });
          entries.push({ text: [head, ...(d ? [dangerLine(d, x, lang, acc)] : []), ...(prefs.entry ? [T("ask", lang)] : [])].join("\n"), kb: prefs.entry ? [planButtons(x.key, lang)] : [], k: `entry:${x.entry_time.slice(0, 10)}:${x.key}` });
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
      for (const d of todo) { const k = await tellPartner(uid, t, d.rule, d.x, today, sent, d.k); if (k) { n++; keep.push(k); } }
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
      return json({ ok: true, users: users.length, sent: n });
    }

    // ---- from the app (the user's session) ----
    const who = await fetch(`${SB}/auth/v1/user`, { headers: { authorization: auth, apikey: req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "" }, signal: AbortSignal.timeout(10000) });
    if (!who.ok) return json({ ok: false, error: "signIn" }, 401);
    const uid = ((await who.json()) as { id?: string }).id ?? "";
    if (!uid) return json({ ok: false, error: "signIn" }, 401);
    if (!TOKEN) return json({ ok: false, error: "noToken" }, 503);
    const lang = langOf(body?.lang), cur = (await getTg(uid)) ?? {};
    const state = (v: Tg) => ({ linked: !!v.chat, name: v.name ?? null, prefs: prefsOf(v.prefs), partner: v.partner?.chat ? { name: v.partner.name, since: v.partner.since } : null });

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
        await saveTg(uid, { ...cur, chat: null, name: null, codeHash: null, codeAt: null, partner: null, pcodeHash: null, pcodeAt: null });
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
