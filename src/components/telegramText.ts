// The Telegram wording and the shape of the alert board, lifted out of the old Profile card unchanged so that not a
// single translation is re-done by the move. The groups are the ones the app has always used: a danger-zone warning
// is about a new trade, so it sits with the trades, and the morning plan carries a challenge's room for the day, so
// it sits with the challenges.
import { CalendarCheck, CalendarRange, CandlestickChart, ClipboardCheck, Flag, GraduationCap, Handshake, ListChecks, Newspaper, Radar, Receipt, ShieldAlert, ShieldOff, Sunrise, TrendingDown, WifiOff, type LucideIcon } from "lucide-react";
import { TG_COACH, tgCoachInvite, tgCoachRemove, tgPartnerInvite, tgPartnerRemove, type TgCoachPrefs, type TgPrefs } from "../lib/telegram";
import type { Tone } from "./profileUi";
import type { Lang } from "../types";

export type L3 = Record<Lang, string>;
export const pick = (lang: Lang) => (x: L3) => x[lang];

export const T = {
  title: { en: "Telegram alerts", ar: "تنبيهات تيليغرام", fr: "Alertes Telegram" },
  lead: { en: "Your trades, your risks and your challenges, as messages on your phone.", ar: "صفقاتك ومخاطرك وتحدياتك، رسائل تصلك على هاتفك.", fr: "Vos trades, vos risques et vos challenges, en messages sur votre téléphone." },
  connect: { en: "Connect Telegram", ar: "ربط تيليغرام", fr: "Connecter Telegram" },
  open: { en: "Open Telegram", ar: "افتح تيليغرام", fr: "Ouvrir Telegram" },
  waiting: { en: "Waiting for you to press Start in the bot…", ar: "في انتظار ضغطك على «ابدأ» في البوت…", fr: "En attente de votre appui sur Démarrer dans le bot…" },
  expired: { en: "The link has expired: connect again.", ar: "انتهت صلاحية الرابط: اضغط «ربط تيليغرام» من جديد.", fr: "Le lien a expiré : reconnectez-vous." },
  connected: { en: "Connected", ar: "متصل", fr: "Connecté" },
  notConnected: { en: "Not connected", ar: "غير متصل", fr: "Non connecté" },
  step1: { en: "Press Connect Telegram.", ar: "اضغط «ربط تيليغرام».", fr: "Appuyez sur Connecter Telegram." },
  step2: { en: "Telegram opens on the Mizan bot: press Start.", ar: "يفتح تيليغرام على بوت ميزان: اضغط «ابدأ».", fr: "Telegram s'ouvre sur le bot Mizan : appuyez sur Démarrer." },
  step3: { en: "This page updates by itself, then choose your alerts.", ar: "تتحدث هذه الصفحة وحدها، ثم اختر تنبيهاتك.", fr: "Cette page se met à jour toute seule, puis choisissez vos alertes." },
  linkedTo: { en: "Linked to {n}", ar: "مربوط بحساب {n}", fr: "Lié à {n}" },
  test: { en: "Send a test", ar: "إرسال تجربة", fr: "Envoyer un test" },
  sent: { en: "Test sent ✓ Check Telegram.", ar: "أُرسلت التجربة ✓ تفقّد تيليغرام.", fr: "Test envoyé ✓ Regardez Telegram." },
  off: { en: "Disconnect", ar: "فك الربط", fr: "Déconnecter" },
  offAsk: { en: "Disconnect Telegram? The alerts stop, and your partner and coach are told.", ar: "فك ربط تيليغرام؟ ستتوقف التنبيهات، ويُبلَّغ شريكك ومدرّبك.", fr: "Déconnecter Telegram ? Les alertes s'arrêtent, et votre partenaire et votre coach sont prévenus." },
  choose: { en: "Choose your alerts", ar: "اختر تنبيهاتك", fr: "Choisissez vos alertes" },
  onOf: { en: "{n} of {m} on", ar: "{n} من {m} مفعّلة", fr: "{n} sur {m} actives" },
  gTrades: { en: "Your trades", ar: "صفقاتك", fr: "Vos trades" },
  gProtect: { en: "Protection", ar: "حماية الحساب", fr: "Protection" },
  gProp: { en: "Challenges", ar: "التحديات", fr: "Challenges" },
  gSum: { en: "Summaries and news", ar: "الملخصات والأخبار", fr: "Bilans et annonces" },
  trades: { en: "Each closed trade", ar: "كل صفقة مغلقة", fr: "Chaque trade clôturé" },
  trades_d: { en: "The result of every trade MT5 closes, with a button to add a note.", ar: "نتيجة كل صفقة يغلقها MT5، مع زر لإضافة ملاحظة.", fr: "Le résultat de chaque trade fermé par MT5, avec un bouton pour ajouter une note." },
  entry: { en: "New trade: in your plan?", ar: "صفقة جديدة: ضمن خطتك؟", fr: "Nouveau trade : dans votre plan ?" },
  entry_d: { en: "Answer with one tap when you open a trade; the answer is kept with the trade.", ar: "أجب بنقرة واحدة عند فتح صفقة، فتُحفظ إجابتك معها.", fr: "Répondez d'un tap à l'ouverture ; la réponse est gardée avec le trade." },
  danger: { en: "Danger zone", ar: "منطقة الخطر", fr: "Zone de danger" },
  danger_d: { en: "A warning when a new trade looks like your worst pattern: symbol, hour, day.", ar: "تحذير عندما تشبه الصفقة الجديدة أسوأ نمط في سجلك: الرمز والساعة واليوم.", fr: "Un avertissement quand un nouveau trade ressemble à votre pire schéma : symbole, heure, jour." },
  nosl: { en: "Trade without a stop loss", ar: "صفقة بلا وقف خسارة", fr: "Trade sans stop loss" },
  nosl_d: { en: "When a trade stays open for 2 minutes with no stop loss.", ar: "عندما تبقى صفقة مفتوحة دقيقتين دون وقف خسارة.", fr: "Quand un trade reste ouvert 2 minutes sans stop loss." },
  streak: { en: "3 losses in a row", ar: "3 خسائر متتالية", fr: "3 pertes d'affilée" },
  streak_d: { en: "A reminder to stop and take a break before the next trade.", ar: "تذكير بالتوقف وأخذ استراحة قبل الصفقة القادمة.", fr: "Un rappel pour arrêter et faire une pause avant le prochain trade." },
  stale: { en: "MT5 stopped syncing", ar: "توقف مزامنة MT5", fr: "Synchro MT5 arrêtée" },
  stale_d: { en: "When the sync stops for an hour while trades are open.", ar: "عندما تتوقف المزامنة ساعة كاملة وعندك صفقات مفتوحة.", fr: "Quand la synchro s'arrête une heure avec des trades ouverts." },
  myRules: { en: "My rules", ar: "قواعدي", fr: "Mes règles" },
  myRules_d: { en: "Your Advisor rules and your own rules, each morning at 08:00, and a warning when a new trade breaks one.", ar: "قواعدك من المستشار وقواعدك الخاصة كل صباح في الثامنة، وتحذير عندما تكسر صفقة جديدة إحداها.", fr: "Vos règles du conseiller et vos propres règles chaque matin à 8 h, et un avertissement quand un nouveau trade en enfreint une." },
  rules: { en: "Challenge warnings", ar: "تنبيهات التحديات", fr: "Alertes de challenge" },
  rules_d: { en: "At half and at 80% of a loss limit, when a limit is passed, and at the target.", ar: "عند استهلاك نصف حد الخسارة و80% منه، وعند تجاوزه، وعند بلوغ الهدف.", fr: "À la moitié et à 80 % d'une limite de perte, quand une limite est dépassée, et à l'objectif." },
  morning: { en: "Morning plan", ar: "خطة الصباح", fr: "Plan du matin" },
  morning_d: { en: "At 08:00 on weekdays: today's room and a safe risk per trade.", ar: "الثامنة صباحاً في أيام التداول: هامش اليوم ومخاطرة آمنة للصفقة.", fr: "À 8 h en semaine : la marge du jour et un risque sûr par trade." },
  daily: { en: "Day summary", ar: "ملخص اليوم", fr: "Bilan du jour" },
  daily_d: { en: "Yesterday's result, just after the market's midnight.", ar: "نتيجة الأمس، بعد منتصف ليل السوق مباشرة.", fr: "Le résultat de la veille, juste après minuit du marché." },
  weekly: { en: "Week summary", ar: "ملخص الأسبوع", fr: "Bilan de la semaine" },
  weekly_d: { en: "On Sunday, with one tip for the week ahead.", ar: "يوم الأحد، مع نصيحة للأسبوع القادم.", fr: "Le dimanche, avec un conseil pour la semaine." },
  news: { en: "High-impact news", ar: "الأخبار القوية", fr: "Annonces majeures" },
  news_d: { en: "15 minutes before news on the currencies you trade.", ar: "قبل 15 دقيقة من الأخبار على العملات التي تتداولها.", fr: "15 minutes avant les annonces sur les devises que vous tradez." },
  voiceT: { en: "Voice notes", ar: "ملاحظات صوتية", fr: "Notes vocales" },
  voiceD: { en: "Reply to a trade's message with a voice note: it is kept as text with the trade.", ar: "ردّ على رسالة صفقة برسالة صوتية، فتُحفظ نصاً مع الصفقة.", fr: "Répondez au message d'un trade par une note vocale : elle est gardée en texte avec le trade." },
  boardT: { en: "Discipline board", ar: "لوحة الانضباط", fr: "Tableau de discipline" },
  boardD: { en: "Add the bot to a Telegram group: members who tap Join get a daily score out of 100.", ar: "أضف البوت إلى مجموعة تيليغرام: كل عضو يضغط «انضمام» تصله درجة يومية من 100.", fr: "Ajoutez le bot à un groupe Telegram : les membres qui appuient sur Rejoindre ont une note quotidienne sur 100." },
  cmds: { en: "In the bot: /status shows your challenges, /stop turns the alerts off. Trade alerts come from MT5 auto-sync; the summaries and news use all your trades.", ar: "في البوت: ‏/status لعرض تحدياتك، و‏/stop لإيقاف التنبيهات. تنبيهات الصفقات تأتي من مزامنة MT5، أما الملخصات والأخبار فتشمل كل صفقاتك.", fr: "Dans le bot : /status montre vos challenges, /stop coupe les alertes. Les alertes de trades viennent de la synchro MT5 ; les bilans et annonces utilisent tous vos trades." },
  people: { en: "Partner and coach", ar: "الشريك والمدرّب", fr: "Partenaire et coach" },
  peopleSub: { en: "People who help you keep your rules. They never see amounts or account details.", ar: "أشخاص يساعدونك على الالتزام بقواعدك، ولا يرون أي مبالغ أو تفاصيل حسابات.", fr: "Des personnes qui vous aident à tenir vos règles. Elles ne voient jamais de montants ni de détails de compte." },
  peopleNeed: { en: "Connect Telegram first: your partner and coach get their messages from the same bot.", ar: "اربط تيليغرام أولاً: شريكك ومدرّبك تصلهم الرسائل من البوت نفسه.", fr: "Connectez d'abord Telegram : votre partenaire et votre coach reçoivent leurs messages du même bot." },
  goTg: { en: "Go to Telegram alerts", ar: "اذهب إلى تنبيهات تيليغرام", fr: "Aller aux alertes Telegram" },
  pTitle: { en: "Accountability partner", ar: "شريك الالتزام", fr: "Partenaire de discipline" },
  pWhat: { en: "A friend gets a short message when you leave a trade without a stop loss, trade on after 3 losses in a row, or trade after a challenge's daily loss limit.", ar: "يصل صديقك تنبيه قصير إذا تركت صفقة بلا وقف خسارة، أو واصلت التداول بعد 3 خسائر متتالية، أو تداولت بعد بلوغ حد الخسارة اليومي في تحدٍّ.", fr: "Un ami reçoit un court message quand vous laissez un trade sans stop loss, continuez après 3 pertes d'affilée, ou tradez après la limite de perte du jour d'un challenge." },
  pInvite: { en: "Invite a partner", ar: "دعوة شريك", fr: "Inviter un partenaire" },
  pSend: { en: "Send this link to your partner in Telegram. It works once, for 7 days.", ar: "أرسل هذا الرابط لشريكك في تيليغرام. يعمل مرة واحدة خلال 7 أيام.", fr: "Envoyez ce lien à votre partenaire dans Telegram. Il marche une fois, pendant 7 jours." },
  pWait: { en: "Waiting for your partner to accept…", ar: "في انتظار موافقة شريكك…", fr: "En attente de l'accord de votre partenaire…" },
  pEnd: { en: "End the partnership", ar: "إنهاء الشراكة", fr: "Mettre fin au partenariat" },
  cTitle: { en: "Coach", ar: "المدرّب", fr: "Coach" },
  cWhat: { en: "Your coach gets your discipline score each day and an alert when you break a rule. One coach can follow many traders.", ar: "تصل مدرّبك درجة انضباطك كل يوم وتنبيه عندما تكسر قاعدة. يستطيع المدرّب الواحد متابعة عدة متداولين.", fr: "Votre coach reçoit votre note de discipline chaque jour et une alerte quand vous enfreignez une règle. Un coach peut suivre plusieurs traders." },
  cInvite: { en: "Invite a coach", ar: "دعوة مدرّب", fr: "Inviter un coach" },
  cSend: { en: "Send this link to your coach in Telegram. It works once, for 7 days.", ar: "أرسل هذا الرابط لمدرّبك في تيليغرام. يعمل مرة واحدة خلال 7 أيام.", fr: "Envoyez ce lien à votre coach dans Telegram. Il marche une fois, pendant 7 jours." },
  cWait: { en: "Waiting for your coach to accept…", ar: "في انتظار موافقة مدرّبك…", fr: "En attente de l'accord de votre coach…" },
  cEnd: { en: "End the coaching", ar: "إنهاء التدريب", fr: "Mettre fin au coaching" },
  cGets: { en: "What your coach gets", ar: "ما يصل مدرّبك", fr: "Ce que reçoit votre coach" },
  c_nosl: { en: "A trade without a stop loss", ar: "صفقة بلا وقف خسارة", fr: "Un trade sans stop loss" },
  c_streak: { en: "Trading on after 3 losses in a row", ar: "مواصلة التداول بعد 3 خسائر متتالية", fr: "Continuer après 3 pertes d'affilée" },
  c_limit: { en: "A trade after the daily loss limit", ar: "صفقة بعد بلوغ حد الخسارة اليومي", fr: "Un trade après la limite de perte du jour" },
  c_daily: { en: "The daily discipline score", ar: "درجة الانضباط اليومية", fr: "La note de discipline du jour" },
  since: { en: "Since {d}", ar: "منذ {d}", fr: "Depuis le {d}" },
  copy: { en: "Copy", ar: "نسخ", fr: "Copier" },
  copied: { en: "Copied ✓", ar: "نُسخ ✓", fr: "Copié ✓" },
  closed: { en: "The invite was declined or has expired.", ar: "رُفضت الدعوة أو انتهت صلاحيتها.", fr: "L'invitation a été refusée ou a expiré." },
  notDeployed: { en: "Telegram alerts are not set up on the server yet: deploy the \"telegram\" function (Verify JWT off).", ar: "تنبيهات تيليغرام غير مفعّلة على الخادم بعد: انشر الدالة telegram مع إيقاف Verify JWT.", fr: "Les alertes Telegram ne sont pas encore installées : déployez la fonction « telegram » (Verify JWT désactivé)." },
  noToken: { en: "Add your bot's token as the Supabase secret TELEGRAM_BOT_TOKEN.", ar: "أضف رمز البوت كسرّ في Supabase باسم TELEGRAM_BOT_TOKEN.", fr: "Ajoutez le jeton du bot comme secret Supabase TELEGRAM_BOT_TOKEN." },
  badToken: { en: "Telegram refused the bot token: check TELEGRAM_BOT_TOKEN.", ar: "رفض تيليغرام رمز البوت: تحقّق من TELEGRAM_BOT_TOKEN.", fr: "Telegram a refusé le jeton du bot : vérifiez TELEGRAM_BOT_TOKEN." },
  signIn: { en: "Sign in again to manage Telegram alerts.", ar: "سجّل الدخول من جديد لإدارة تنبيهات تيليغرام.", fr: "Reconnectez-vous pour gérer les alertes Telegram." },
  failed: { en: "Could not reach the server. Try again.", ar: "تعذّر الوصول إلى الخادم. حاول مجدداً.", fr: "Serveur injoignable. Réessayez." },
  retry: { en: "Try again", ar: "إعادة المحاولة", fr: "Réessayer" },
} satisfies Record<string, L3>;

export /** The alerts in four groups, each with its colour and an icon per alert. */
const GROUPS: { tone: Tone; icon: LucideIcon; title: L3; items: { k: keyof TgPrefs; icon: LucideIcon }[] }[] = [
  { tone: "sky", icon: CandlestickChart, title: T.gTrades, items: [{ k: "trades", icon: Receipt }, { k: "entry", icon: ClipboardCheck }, { k: "danger", icon: Radar }] },
  { tone: "rose", icon: ShieldAlert, title: T.gProtect, items: [{ k: "nosl", icon: ShieldOff }, { k: "streak", icon: TrendingDown }, { k: "stale", icon: WifiOff }, { k: "myRules", icon: ListChecks }] },
  { tone: "amber", icon: Flag, title: T.gProp, items: [{ k: "rules", icon: Flag }, { k: "morning", icon: Sunrise }] },
  { tone: "violet", icon: Newspaper, title: T.gSum, items: [{ k: "daily", icon: CalendarCheck }, { k: "weekly", icon: CalendarRange }, { k: "news", icon: Newspaper }] },
];

export const COACH_ICON: Record<keyof TgCoachPrefs, LucideIcon> = { nosl: ShieldOff, streak: TrendingDown, limit: Flag, daily: CalendarCheck };

export const ROLE = {
  partner: { tone: "emerald" as Tone, icon: Handshake, title: T.pTitle, what: T.pWhat, invite: T.pInvite, send: T.pSend, wait: T.pWait, end: T.pEnd, make: tgPartnerInvite, remove: tgPartnerRemove },
  coach: { tone: "indigo" as Tone, icon: GraduationCap, title: T.cTitle, what: T.cWhat, invite: T.cInvite, send: T.cSend, wait: T.cWait, end: T.cEnd, make: tgCoachInvite, remove: tgCoachRemove },
};

export { TG_COACH };
export type { TgCoachPrefs, TgPrefs };
