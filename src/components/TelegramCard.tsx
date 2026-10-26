// Profile › Telegram alerts: link a Telegram chat, choose the alerts by group (each group has its own colour), test,
// unlink; then the people who help: the accountability partner and the coach (invite, who it is, what the coach gets).
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, CalendarRange, CandlestickChart, ClipboardCheck, Flag, GraduationCap, Handshake, ListChecks, Mic, Newspaper, Radar, Receipt, Send, ShieldAlert, ShieldOff, Sunrise, TrendingDown, Users, WifiOff, type LucideIcon } from "lucide-react";
import type { Lang } from "../types";
import { TG_COACH, TG_PREFS, tgCoachInvite, tgCoachPrefs, tgCoachRemove, tgInfo, tgLink, tgLinked, tgPartnerInvite, tgPartnerRemove, tgPrefs, tgTest, tgUnlink, tgWatcherNow, type TgCoach, type TgCoachPrefs, type TgError, type TgPartner, type TgPrefs, type TgRole } from "../lib/telegram";
import { SectionHead, Switch, type Tone } from "./profileUi";

type L3 = Record<Lang, string>;
const T = {
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

/** The alerts in four groups, each with its colour and an icon per alert. */
const GROUPS: { tone: Tone; icon: LucideIcon; title: L3; items: { k: keyof TgPrefs; icon: LucideIcon }[] }[] = [
  { tone: "sky", icon: CandlestickChart, title: T.gTrades, items: [{ k: "trades", icon: Receipt }, { k: "entry", icon: ClipboardCheck }, { k: "danger", icon: Radar }] },
  { tone: "rose", icon: ShieldAlert, title: T.gProtect, items: [{ k: "nosl", icon: ShieldOff }, { k: "streak", icon: TrendingDown }, { k: "stale", icon: WifiOff }, { k: "myRules", icon: ListChecks }] },
  { tone: "amber", icon: Flag, title: T.gProp, items: [{ k: "rules", icon: Flag }, { k: "morning", icon: Sunrise }] },
  { tone: "violet", icon: Newspaper, title: T.gSum, items: [{ k: "daily", icon: CalendarCheck }, { k: "weekly", icon: CalendarRange }, { k: "news", icon: Newspaper }] },
];
const COACH_ICON: Record<keyof TgCoachPrefs, LucideIcon> = { nosl: ShieldOff, streak: TrendingDown, limit: Flag, daily: CalendarCheck };

type View = { kind: "loading" } | { kind: "error"; error: TgError } | { kind: "ready"; bot: string; linked: boolean; name: string | null; prefs: TgPrefs; partner: TgPartner | null; coach: TgCoach | null };
const POLL_MS = 3000, POLL_FOR = 3 * 60e3;
const ROLE = {
  partner: { tone: "emerald" as Tone, icon: Handshake, title: T.pTitle, what: T.pWhat, invite: T.pInvite, send: T.pSend, wait: T.pWait, end: T.pEnd, make: tgPartnerInvite, remove: tgPartnerRemove },
  coach: { tone: "indigo" as Tone, icon: GraduationCap, title: T.cTitle, what: T.cWhat, invite: T.cInvite, send: T.cSend, wait: T.cWait, end: T.cEnd, make: tgCoachInvite, remove: tgCoachRemove },
};
const spinner = <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--tone,var(--icon))] border-t-transparent motion-reduce:animate-none" />;
const dateOf = (iso: string, lang: Lang) => { const d = new Date(iso); return Number.isNaN(+d) ? "" : new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : lang, { day: "numeric", month: "short", year: "numeric" }).format(d); };

/** The accountability partner or the coach: invite (a one-time link, watched until accepted), who it is, end it; the
 *  coach card also lists what the coach gets, each with a switch. */
function Watcher({ role, lang, person, busy, act, onPerson, onNote }: { role: TgRole; lang: Lang; person: TgPartner | TgCoach | null; busy: boolean; act: (f: () => Promise<unknown>) => Promise<void>; onPerson: (p: TgPartner | TgCoach | null) => void; onNote: (n: string | null) => void }) {
  const L = (x: L3) => x[lang], R = ROLE[role];
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const until = useRef(0);
  useEffect(() => {
    if (!invite) return;
    const id = window.setInterval(async () => {
      if (Date.now() > until.current) { setInvite(null); return; }
      const s = await tgWatcherNow(role);
      if (s?.person) { setInvite(null); onPerson(s.person); }
      else if (s && !s.pending) { setInvite(null); onNote(L(T.closed)); }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [invite]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => act(async () => {
    const r = await R.make(lang);
    if ("error" in r) { onNote(L(T.failed)); return; }
    until.current = Date.now() + 15 * 60e3;
    setCopied(false);
    setInvite(r.url);
  });
  const copy = async () => { if (!invite) return; try { await navigator.clipboard.writeText(invite); setCopied(true); } catch { /* the field stays selectable */ } };
  const end = () => act(async () => { const r = await R.remove(lang); if ("error" in r) onNote(L(T.failed)); else onPerson(null); });
  const coach = role === "coach" && person && "prefs" in person ? person : null;
  const setPref = (p: TgCoachPrefs) => act(async () => { if (!coach) return; onPerson({ ...coach, prefs: p }); const r = await tgCoachPrefs(lang, p); if ("error" in r) onNote(L(T.failed)); });
  const Icon = R.icon;
  return (
    <div className={`tone-${R.tone} tone-panel flex flex-col rounded-2xl p-4 sm:p-5`}>
      <div className="flex items-start gap-3">
        <span className="tone-tile h-10 w-10 rounded-xl"><Icon size={19} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-semibold">{L(R.title)}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{L(R.what)}</p>
        </div>
      </div>
      <div className="mt-4">
        {person ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg p-3">
              <span className="tone-tile h-10 w-10 rounded-full font-heading text-sm font-bold">{(person.name ?? "?").trim().charAt(0).toUpperCase() || "?"}</span>
              <div className="min-w-[9rem] flex-1">
                <p className="truncate text-sm font-semibold">{person.name ?? "—"}</p>
                {person.since && <p className="text-xs text-muted">{L(T.since).replace("{d}", dateOf(person.since, lang))}</p>}
              </div>
              <button type="button" disabled={busy} onClick={end} className="tone-red tone-btn rounded-lg px-3 py-1.5 text-xs font-semibold">{L(R.end)}</button>
            </div>
            {coach && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-muted">{L(T.cGets)}</p>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {(Object.keys(TG_COACH) as (keyof TgCoachPrefs)[]).map((k) => {
                    const RowIcon = COACH_ICON[k];
                    return (
                      <li key={k} className="flex items-center gap-3 px-3 py-2.5">
                        <RowIcon size={16} className="tone-text shrink-0" />
                        <span className="min-w-0 flex-1 text-sm">{L(T[`c_${k}`])}</span>
                        <Switch checked={coach.prefs[k]} disabled={busy} label={L(T[`c_${k}`])} onChange={(on) => setPref({ ...coach.prefs, [k]: on })} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        ) : invite ? (
          <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--tone)_45%,transparent)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input readOnly value={invite} dir="ltr" aria-label={L(R.invite)} onFocus={(e) => e.target.select()} className="field min-w-0 flex-1 text-xs" />
              <button type="button" onClick={copy} className="tone-btn rounded-lg px-3 py-2 text-xs font-semibold">{L(copied ? T.copied : T.copy)}</button>
            </div>
            <p className="text-xs text-muted">{L(R.send)}</p>
            <span className="flex items-center gap-2 text-xs font-medium">{spinner}{L(R.wait)}</span>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={start} className="tone-btn w-full rounded-xl px-4 py-2.5 text-sm font-semibold">{L(R.invite)}</button>
        )}
      </div>
    </div>
  );
}

export default function TelegramCard({ lang, onStatus }: { lang: Lang; onStatus?: (linked: boolean | null) => void }) {
  const L = (x: L3) => x[lang];
  const [v, setV] = useState<View>({ kind: "loading" });
  const [url, setUrl] = useState<string | null>(null); // the one-time t.me link while waiting for Start
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [peopleNote, setPeopleNote] = useState<string | null>(null);
  const until = useRef(0);

  const load = useCallback(async () => {
    const r = await tgInfo(lang);
    setV("error" in r ? { kind: "error", error: r.error } : { kind: "ready", bot: r.bot, linked: r.linked, name: r.name, prefs: { ...TG_PREFS, ...r.prefs }, partner: r.partner ?? null, coach: r.coach ?? null });
  }, [lang]);
  useEffect(() => { void load(); }, [load]);
  const linked = v.kind === "ready" ? v.linked : null;
  useEffect(() => { onStatus?.(linked); }, [linked]); // eslint-disable-line react-hooks/exhaustive-deps

  // after "Connect": watch the settings row until the chat is linked (or the link expires)
  useEffect(() => {
    if (!url) return;
    const id = window.setInterval(async () => {
      if (Date.now() > until.current) { setUrl(null); setNote(L(T.expired)); return; }
      const s = await tgLinked();
      if (s?.linked) { setUrl(null); setNote(null); setV((x) => (x.kind === "ready" ? { ...x, linked: true, name: s.name } : x)); }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (f: () => Promise<unknown>) => { setBusy(true); setNote(null); try { await f(); } finally { setBusy(false); } };
  const connect = () => act(async () => {
    const r = await tgLink(lang);
    if ("error" in r) { setV({ kind: "error", error: r.error }); return; }
    until.current = Date.now() + POLL_FOR;
    setUrl(r.url);
    window.open(r.url, "_blank", "noopener"); // may be blocked after the await: the button below stays as the way in
  });
  const setPref = (p: TgPrefs) => act(async () => {
    if (v.kind !== "ready") return;
    setV({ ...v, prefs: p });
    const r = await tgPrefs(lang, p);
    if ("error" in r) setNote(L(T.failed));
  });
  const test = () => act(async () => { const r = await tgTest(lang); setNote("error" in r ? L(r.error === "notLinked" ? T.expired : T.failed) : L(T.sent)); });
  const unlink = () => { if (window.confirm(L(T.offAsk))) void act(async () => { const r = await tgUnlink(lang); if ("error" in r) setNote(L(T.failed)); else if (v.kind === "ready") setV({ ...v, linked: false, name: null, partner: null, coach: null }); }); };
  const goTelegram = () => document.getElementById("pf-telegram")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

  const status = v.kind === "ready" && (
    <span className={`${v.linked ? "tone-emerald tone-chip" : "border border-border text-muted"} inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold`}>
      <span className="relative flex h-2 w-2">
        {v.linked && <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--tone)] opacity-60 motion-safe:animate-ping" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${v.linked ? "bg-[var(--tone)]" : "bg-[var(--muted)]"}`} />
      </span>
      {L(v.linked ? T.connected : T.notConnected)}
    </span>
  );
  const btn = "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-text transition-colors hover:border-[var(--muted)] disabled:opacity-50";

  return (
    <>
      <section id="pf-telegram" aria-busy={busy} className="scroll-mt-20 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <SectionHead tone="sky" icon={Send} title={L(T.title)} sub={L(T.lead)} aside={status} />

        {v.kind === "loading" && (
          <div className="mt-6 grid gap-4 md:grid-cols-2" aria-hidden>
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-skeleton motion-reduce:animate-none" />)}
          </div>
        )}

        {v.kind === "error" && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border p-4 text-sm">
            <span className={v.error === "unreachable" || v.error === "failed" ? "text-loss" : "text-muted"}>{L(T[v.error === "notLinked" || v.error === "unreachable" ? "failed" : v.error])}</span>
            <button type="button" onClick={() => { setV({ kind: "loading" }); void load(); }} className={btn}>{L(T.retry)}</button>
          </div>
        )}

        {v.kind === "ready" && !v.linked && (
          <div className="tone-sky tone-panel mt-6 grid gap-5 rounded-2xl p-5 md:grid-cols-[1fr_auto] md:items-center">
            <ol className="flex flex-col gap-3">
              {[T.step1, T.step2, T.step3].map((s, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="tone-chip grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums">{i + 1}</span>
                  <span className="pt-0.5">{L(s)}</span>
                </li>
              ))}
            </ol>
            {url ? (
              <div className="flex flex-col items-stretch gap-2.5 md:items-end">
                <a href={url} target="_blank" rel="noopener noreferrer" className="tone-solid inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"><Send size={16} />{L(T.open)}</a>
                <span className="flex items-center gap-2 text-xs font-medium">{spinner}{L(T.waiting)}</span>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={connect} className="tone-solid inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50"><Send size={16} />{L(T.connect)}</button>
            )}
          </div>
        )}

        {v.kind === "ready" && v.linked && (
          <>
            <div id="pf-tg-link" className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg p-4">
              <span className="tone-sky tone-tile h-10 w-10 rounded-full"><Send size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{L(T.linkedTo).replace("{n}", v.name ?? "Telegram")}</p>
                <p className="text-xs text-muted"><bdi dir="ltr">@{v.bot}</bdi></p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={test} className={btn}>{L(T.test)}</button>
                <button type="button" disabled={busy} onClick={unlink} className="tone-red tone-btn inline-flex items-center rounded-lg px-3.5 py-2 text-xs font-semibold">{L(T.off)}</button>
              </div>
            </div>
            {note && <p className="mt-3 text-sm" role="status">{note}</p>}

            <h3 className="mt-7 font-heading text-base font-semibold">{L(T.choose)}</h3>
            <div id="pf-alerts" className="mt-3 grid gap-4 md:grid-cols-2">
              {GROUPS.map((g) => {
                const on = g.items.filter((x) => v.prefs[x.k]).length, GIcon = g.icon;
                return (
                  <div key={g.tone} className={`tone-${g.tone} tone-panel overflow-hidden rounded-2xl`}>
                    <div className="flex items-center gap-2.5 px-4 pb-2 pt-3.5">
                      <span className="tone-tile h-8 w-8 rounded-lg"><GIcon size={16} /></span>
                      <h4 className="min-w-0 flex-1 text-sm font-semibold">{L(g.title)}</h4>
                      <span className="tone-chip shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums"><span className="sm:hidden" dir="ltr">{on}/{g.items.length}</span><span className="hidden sm:inline">{L(T.onOf).replace("{n}", String(on)).replace("{m}", String(g.items.length))}</span></span>
                    </div>
                    <ul className="divide-y divide-border">
                      {g.items.map(({ k, icon: RowIcon }) => (
                        <li key={k} className="flex items-start gap-3 px-4 py-3">
                          <RowIcon size={17} className="tone-text mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug">{L(T[k])}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted">{L(T[`${k}_d`])}</p>
                          </div>
                          <Switch checked={v.prefs[k]} disabled={busy} label={L(T[k])} onChange={(x) => setPref({ ...v.prefs, [k]: x })} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {([[Mic, T.voiceT, T.voiceD], [Users, T.boardT, T.boardD]] as const).map(([TipIcon, t, d]) => (
                <div key={t.en} className="tone-sky flex items-start gap-3 rounded-2xl border border-border p-4">
                  <span className="tone-tile h-9 w-9 rounded-lg"><TipIcon size={17} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{L(t)}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{L(d)}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">{L(T.cmds)}</p>
          </>
        )}
        {v.kind === "ready" && !v.linked && note && <p className="mt-3 text-sm" role="status">{note}</p>}
      </section>

      <section id="pf-people" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <SectionHead tone="emerald" icon={Users} title={L(T.people)} sub={L(T.peopleSub)} />
        {v.kind === "ready" && v.linked ? (
          <div className="mt-6 grid items-start gap-4 md:grid-cols-2">
            <Watcher role="partner" lang={lang} person={v.partner} busy={busy} act={act} onPerson={(p) => setV((x) => (x.kind === "ready" ? { ...x, partner: p } : x))} onNote={setPeopleNote} />
            <Watcher role="coach" lang={lang} person={v.coach} busy={busy} act={act} onPerson={(p) => setV((x) => (x.kind === "ready" ? { ...x, coach: p && "prefs" in p ? p : null } : x))} onNote={setPeopleNote} />
          </div>
        ) : null}
        {v.kind === "ready" && v.linked && peopleNote && <p className="mt-3 text-sm" role="status">{peopleNote}</p>}
        {!(v.kind === "ready" && v.linked) && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border p-4">
            <p className="min-w-[10rem] flex-1 text-sm text-muted">{L(T.peopleNeed)}</p>
            {v.kind === "ready" && <button type="button" onClick={goTelegram} className="tone-sky tone-btn rounded-lg px-3.5 py-2 text-xs font-semibold">{L(T.goTg)}</button>}
          </div>
        )}
      </section>
    </>
  );
}
