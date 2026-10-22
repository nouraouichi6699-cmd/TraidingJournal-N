import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, ArrowUpDown, Clock3, Coins, Crosshair, Flame, MessageCircle, RotateCcw, Route, SendHorizontal, ShieldCheck, Sparkles, Star } from "lucide-react";
import { cardBg } from "./metricUi";
import { inputsFor, presetWhatIf } from "./WhatIfTab";
import { advise, journalContext, MIN_TRADES, type Advice, type Plan, type Topic } from "../lib/advisor";
import { askAdvisor, type AskError, type Turn } from "../lib/advisorChat";
import { commonCurrency, fmtMoney, ltrNumbers } from "../lib/money";
import { fmtHold } from "../lib/stats";
import type { Account, Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
const X = (en: string, ar: string, fr: string): L => [en, ar, fr];
const TXT = {
  title: X("Advisor", "المستشار", "Conseiller"),
  sub: X("What your trades say, and what to change first.", "ما تقوله صفقاتك، وما يجب تغييره أولاً.", "Ce que disent vos trades, et quoi changer en premier."),
  all: X("All accounts", "كل الحسابات", "Tous les comptes"),
  analysed: X("{n} closed trades analysed", "تم تحليل {n} صفقة مغلقة", "{n} trades clôturés analysés"),
  plan: X("Following these {n} rules together would have added {v} on your history.", "اتباع هذه القواعد الـ{n} معاً كان سيضيف {v} على سجلك.", "Suivre ces {n} règles ensemble aurait ajouté {v} sur votre historique."),
  plan1: X("Following this rule would have added {v} on your history.", "اتباع هذه القاعدة كان سيضيف {v} على سجلك.", "Suivre cette règle aurait ajouté {v} sur votre historique."),
  tryPlan: X("Try the plan in What if", "جرّب الخطة في «ماذا لو»", "Essayer le plan dans « Et si ? »"),
  tryOne: X("Try in What if", "جرّبها في «ماذا لو»", "Essayer dans « Et si ? »"),
  clean: X("No clear weakness in these trades. Keep going.", "لا يظهر ضعف واضح في هذه الصفقات. واصل.", "Aucune faiblesse nette dans ces trades. Continuez."),
  fix: X("To fix", "ما يجب إصلاحه", "À corriger"),
  watch: X("To watch", "للمتابعة", "À surveiller"),
  strength: X("What works for you", "ما ينجح معك", "Ce qui marche pour vous"),
  onHistory: X("on your history", "على سجلك", "sur votre historique"),
  strong: X("Strong evidence", "دليل قوي", "Preuve solide"),
  medium: X("Some evidence", "دليل متوسط", "Preuve moyenne"),
  weak: X("Weak evidence", "دليل ضعيف", "Preuve faible"),
  both: X("worked in both halves of your history", "نجحت في نصفي سجلك", "a marché sur les deux moitiés de votre historique"),
  oneHalf: X("worked in one half only", "نجحت في نصف واحد فقط", "n'a marché que sur une moitié"),
  caveat: X("Every figure is measured on your own past trades. A rule picked to fit the past usually helps less in the future: trust advice backed by many trades that worked in both halves of your history.", "كل رقم هنا مقاس على صفقاتك السابقة. القاعدة المختارة لتناسب الماضي تفيد عادةً أقل في المستقبل: ثق بالنصائح المدعومة بصفقات كثيرة والتي نجحت في نصفي سجلك.", "Chaque chiffre est mesuré sur vos propres trades passés. Une règle choisie pour coller au passé aide en général moins à l'avenir : fiez-vous aux conseils appuyés par beaucoup de trades et qui ont marché sur les deux moitiés de votre historique."),
  few: X("The advisor needs at least {n} closed trades (you have {m}).", "يحتاج المستشار {n} صفقات مغلقة على الأقل (لديك {m}).", "Le conseiller a besoin d'au moins {n} trades clôturés (vous en avez {m})."),
  exitsHint: X("Exit advice (stop loss, take profit) needs price paths: open Reports › Trade path once.", "نصائح الخروج (وقف الخسارة وجني الربح) تحتاج مسارات الأسعار: افتح «التقارير › مسار الصفقة» مرة واحدة.", "Les conseils de sortie (stop, take profit) demandent les parcours de prix : ouvrez une fois Rapports › Parcours du trade."),
  openPath: X("Open Trade path", "افتح «مسار الصفقة»", "Ouvrir Parcours du trade"),
  chat: X("Ask your advisor", "اسأل مستشارك", "Demandez à votre conseiller"),
  chatSub: X("Answers by Claude, from a summary of your trades.", "يجيب Claude انطلاقاً من ملخّص صفقاتك.", "Réponses de Claude, à partir d'un résumé de vos trades."),
  placeholder: X("Ask about your trading…", "اسأل عن تداولك…", "Posez une question sur votre trading…"),
  send: X("Send", "إرسال", "Envoyer"),
  restart: X("New conversation", "محادثة جديدة", "Nouvelle conversation"),
  privacy: X("Your question and a summary of your trades (no account numbers) are sent to Claude, by Anthropic, to write the answer. This is not financial advice.", "يُرسَل سؤالك وملخّص لصفقاتك (بلا أرقام حسابات) إلى Claude من Anthropic لكتابة الجواب. هذا ليس نصيحة مالية.", "Votre question et un résumé de vos trades (sans numéros de compte) sont envoyés à Claude, d'Anthropic, pour rédiger la réponse. Ce n'est pas un conseil financier."),
  notDeployed: X("The chat is not set up yet: deploy the \"advisor\" function in Supabase and add your Anthropic API key (ANTHROPIC_API_KEY).", "المحادثة غير مفعّلة بعد: انشر الدالة advisor في Supabase وأضف مفتاح Anthropic API باسم ANTHROPIC_API_KEY.", "Le chat n'est pas encore installé : déployez la fonction « advisor » dans Supabase et ajoutez votre clé API Anthropic (ANTHROPIC_API_KEY)."),
  noKey: X("Add your Anthropic API key in Supabase › Edge Functions › Secrets, named ANTHROPIC_API_KEY.", "أضف مفتاح Anthropic API في Supabase › Edge Functions › Secrets باسم ANTHROPIC_API_KEY.", "Ajoutez votre clé API Anthropic dans Supabase › Edge Functions › Secrets, nommée ANTHROPIC_API_KEY."),
  signIn: X("Sign in to use the chat.", "سجّل الدخول لاستخدام المحادثة.", "Connectez-vous pour utiliser le chat."),
  failed: X("The advisor could not answer right now. Try again in a moment.", "تعذّر على المستشار الإجابة الآن. حاول بعد قليل.", "Le conseiller n'a pas pu répondre. Réessayez dans un instant."),
};
const ASK: L[] = [
  X("What is my costliest habit?", "ما أكثر عادة تكلّفني؟", "Quelle habitude me coûte le plus ?"),
  X("When should I stop trading in a day?", "متى يجب أن أتوقف عن التداول في اليوم؟", "Quand dois-je arrêter de trader dans la journée ?"),
  X("Which market should I focus on?", "على أي سوق يجب أن أركّز؟", "Sur quel marché me concentrer ?"),
  X("What changed in my last month?", "ما الذي تغيّر في شهري الأخير؟", "Qu'est-ce qui a changé le mois dernier ?"),
];

const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i} className="font-semibold text-text">{p.slice(2, -2)}</strong> : p));
/** Claude's answer: paragraphs, "- " or "1." lists, **bold**, headings shown as bold lines. */
function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) out.push(<ul key={out.length} className="list-disc space-y-1 ps-5">{list.map((l, i) => <li key={i}>{bold(l)}</li>)}</ul>); list = []; };
  for (const raw of text.split(/\n+/)) {
    const l = raw.trim();
    if (!l) continue;
    const item = /^(?:[-•*]|\d+[.)])\s+(.*)$/.exec(l), head = /^#{1,4}\s+(.*)$/.exec(l);
    if (item) list.push(item[1]);
    else { flush(); out.push(<p key={out.length} className={head ? "font-semibold text-text" : ""}>{bold(head ? head[1] : l)}</p>); }
  }
  flush();
  return <div className="space-y-2">{out}</div>;
}

function Chat({ lang, T, context }: { lang: Lang; T: (x: L) => string; context: () => unknown }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AskError | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [turns, busy]);
  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const history = turns;
    setTurns([...history, { role: "user", content: question }]); setDraft(""); setErr(null); setBusy(true);
    const r = await askAdvisor(question, lang, context(), history);
    setBusy(false);
    if ("answer" in r) setTurns((t) => [...t, { role: "assistant", content: r.answer }]);
    else { setErr(r.error); setTurns((t) => t.slice(0, -1)); setDraft(question); }
  };
  const errText = err && T(err === "notDeployed" ? TXT.notDeployed : err === "noKey" ? TXT.noKey : err === "signIn" ? TXT.signIn : TXT.failed);
  return (
    <section className="rounded-2xl border border-border p-5" style={cardBg}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-tint text-icon"><MessageCircle size={17} /></span>
          <div className="leading-tight"><h2 className="font-heading text-base font-semibold text-primary">{T(TXT.chat)}</h2><p className="text-xs text-muted">{T(TXT.chatSub)}</p></div>
        </div>
        {turns.length > 0 && <button type="button" onClick={() => { setTurns([]); setErr(null); }} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text"><RotateCcw size={13} />{T(TXT.restart)}</button>}
      </div>
      {(turns.length > 0 || busy) && (
        <div ref={box} className="mt-4 max-h-[440px] space-y-3 overflow-y-auto pe-1">
          {turns.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div dir="auto" className={`adv-msg max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-primary-tint text-text" : "border border-border text-muted"}`} style={m.role === "user" ? undefined : { background: "color-mix(in srgb, var(--text) 3%, transparent)" }}>
                {m.role === "user" ? m.content : <Rich text={m.content} />}
              </div>
            </div>
          ))}
          {busy && <div className="flex justify-start"><div className="flex gap-1 rounded-2xl border border-border px-4 py-3" aria-label="…">{[0, 1, 2].map((j) => <span key={j} className="adv-dot h-1.5 w-1.5 rounded-full bg-[var(--icon)]" style={{ animationDelay: `${j * 160}ms` }} />)}</div></div>}
        </div>
      )}
      {turns.length === 0 && !busy && (
        <div className="mt-4 flex flex-wrap gap-2">
          {ASK.map((q) => <button key={q[0]} type="button" onClick={() => void ask(T(q))} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-[var(--primary)] hover:text-text">{T(q)}</button>)}
        </div>
      )}
      {errText && <p className="mt-3 rounded-xl border border-[var(--loss)] px-3 py-2 text-xs text-text" style={{ background: "color-mix(in srgb, var(--loss) 8%, transparent)" }}>{errText}</p>}
      <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void ask(draft); }}>
        <textarea dir="auto" rows={1} value={draft} maxLength={1000} placeholder={T(TXT.placeholder)} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(draft); } }}
          className="min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-[var(--bg)] px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-[var(--icon)]" />
        <button type="submit" disabled={busy || !draft.trim()} aria-label={T(TXT.send)} className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-primary text-on-primary transition-opacity disabled:opacity-40"><SendHorizontal size={17} className="rtl:-scale-x-100" /></button>
      </form>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">{T(TXT.privacy)}</p>
    </section>
  );
}
/** Title, finding, advice per advice id. */
const COPY: Record<string, [L, L, L]> = {
  streak: [X("Stop after {nL}", "توقّف بعد {nL}", "Arrêtez après {nL}"), X("After {nL} the same day, your next trades averaged {avg} ({kT}).", "بعد {nL} في اليوم نفسه، كان متوسط الصفقات التالية {avg} ({kT}).", "Après {nL} dans la journée, les trades suivants ont fait en moyenne {avg} ({kT})."), X("End the day after {nL}.", "أنهِ يومك بعد {nL}.", "Arrêtez la journée après {nL}.")],
  maxDay: [X("At most {nT} a day", "{nT} كحد أقصى في اليوم", "Au plus {nT} par jour"), X("Trades after {firstN} of the day averaged {avg} ({kT}).", "الصفقات بعد {firstN} في اليوم كان متوسطها {avg} ({kT}).", "Les trades après {firstN} de la journée ont fait en moyenne {avg} ({kT})."), X("Stop after {nT} a day.", "توقّف بعد {nT} في اليوم.", "Arrêtez après {nT} par jour.")],
  dayLoss: [X("Daily loss limit: {v}", "حد الخسارة اليومي: {v}", "Perte maximale par jour : {v}"), X("Once a day was down {v}, the trades that followed averaged {avg} ({kT}).", "حين كان اليوم خاسراً {v}، كان متوسط الصفقات التالية {avg} ({kT}).", "Une fois la journée à {v} de perte, les trades suivants ont fait en moyenne {avg} ({kT})."), X("Stop for the day once you are down {v}.", "توقّف لبقية اليوم عندما تخسر {v}.", "Arrêtez la journée dès {v} de perte.")],
  dayGain: [X("Lock in a good day at {v}", "احفظ يومك الرابح عند {v}", "Sécurisez une bonne journée à {v}"), X("After a day reached {v} of profit, the trades that followed averaged {avg} ({kT}).", "بعد أن بلغ ربح اليوم {v}، كان متوسط الصفقات التالية {avg} ({kT}).", "Après {v} de gain dans la journée, les trades suivants ont fait en moyenne {avg} ({kT})."), X("Stop for the day once you are up {v}.", "توقّف لبقية اليوم عندما تربح {v}.", "Arrêtez la journée dès {v} de gain.")],
  weekday: [X("Skip {day}", "تجنّب يوم {day}", "Évitez le {day}"), X("On {day}: {nT}, {net}, {wr} won.", "يوم {day}: {nT}، {net}، ربحت {wr} منها.", "Le {day} : {nT}, {net}, {wr} gagnants."), X("Don't trade on {day}, or trade it smaller.", "لا تتداول يوم {day}، أو تداول بحجم أصغر.", "Ne tradez pas le {day}, ou en plus petit.")],
  hours: [X("Avoid {range}", "تجنّب {range}", "Évitez {range}"), X("Entries from {a} to {b}: {nT}, {net}, {wr} won.", "الدخول من {a} إلى {b}: {nT}، {net}، ربحت {wr} منها.", "Entrées de {a} à {b} : {nT}, {net}, {wr} gagnants."), X("Don't open trades from {a} to {b} (your broker's clock).", "لا تفتح صفقات من {a} إلى {b} (بتوقيت الوسيط).", "N'ouvrez pas de trades de {a} à {b} (heure du courtier).")],
  symbol: [X("Leave {s} aside", "اترك {s} جانباً", "Mettez {s} de côté"), X("{s}: {nT}, {net}, {wr} won.", "{s}: {nT}، {net}، ربحت {wr} منها.", "{s} : {nT}, {net}, {wr} gagnants."), X("Stop trading {s} until you find what works on it.", "توقّف عن تداول {s} حتى تجد ما ينجح معه.", "Arrêtez {s} jusqu'à trouver ce qui marche dessus.")],
  side: [X("Focus on {other}", "ركّز على {other}", "Concentrez-vous sur les {other}"), X("Your {side}: {nT}, {net}, {wr} won.", "صفقات {side}: {nT}، {net}، ربحت {wr} منها.", "Vos {side} : {nT}, {net}, {wr} gagnants."), X("Take only {other} until your {side} improve.", "اكتفِ بصفقات {other} حتى تتحسّن صفقات {side}.", "Ne prenez que des {other} tant que vos {side} ne s'améliorent pas.")],
  stop: [X("Stop loss at {v}", "وقف خسارة عند {v}", "Stop loss à {v}"), X("{kT} went {v} or more against you before you closed them.", "{kT} تحرّكت ضدك {v} أو أكثر قبل أن تغلقها.", "{kT} sont allés à {v} ou plus contre vous avant clôture."), X("Place a stop at {v} on every trade.", "ضع وقف خسارة عند {v} في كل صفقة.", "Placez un stop à {v} sur chaque trade.")],
  target: [X("Take profit at {v}", "جني الربح عند {v}", "Take profit à {v}"), X("{kT} reached {v} of profit; taking it there beats your exits.", "{kT} بلغت ربح {v}، وكان الخروج عنده أفضل من خروجك.", "{kT} ont atteint {v} de gain ; sortir là fait mieux que vos sorties."), X("Take profit at {v}.", "اجنِ الربح عند {v}.", "Prenez vos gains à {v}.")],
  revenge: [X("Keep your size after a loss", "حافظ على حجمك بعد الخسارة", "Gardez votre taille après une perte"), X("After a loss you traded {x} your usual size: {nT}, {net}.", "بعد الخسارة تداولت بـ{x} حجمك المعتاد: {nT}، {net}.", "Après une perte, vous avez tradé {x} votre taille habituelle : {nT}, {net}."), X("Use your normal size on the trade after a loss.", "استخدم حجمك المعتاد في الصفقة التي تلي الخسارة.", "Gardez votre taille normale sur le trade qui suit une perte.")],
  rush: [X("Pause after a loss", "خذ استراحة بعد الخسارة", "Faites une pause après une perte"), X("Trades opened within {m} minutes of a loss: {nT}, {net}, {wr} won.", "صفقات فُتحت خلال {m} دقائق من خسارة: {nT}، {net}، ربحت {wr} منها.", "Trades ouverts moins de {m} minutes après une perte : {nT}, {net}, {wr} gagnants."), X("Wait at least 15 minutes after a losing trade.", "انتظر 15 دقيقة على الأقل بعد كل صفقة خاسرة.", "Attendez au moins 15 minutes après un trade perdant.")],
  holdLosers: [X("You hold losers longer", "تحتفظ بالصفقات الخاسرة أطول", "Vous gardez les pertes plus longtemps"), X("Losing trades last {ll} on average, winners {lw}: {x} longer.", "تدوم الصفقة الخاسرة {ll} في المتوسط والرابحة {lw}، أي أطول بـ{x}.", "Les pertes durent {ll} en moyenne, les gains {lw} : {x} plus long."), X("Decide your exit before you enter, and close when it is hit.", "حدّد خروجك قبل الدخول، وأغلق عند بلوغه.", "Décidez votre sortie avant d'entrer, et respectez-la.")],
  noStop: [X("Trades without a stop loss", "صفقات بلا وقف خسارة", "Trades sans stop loss"), X("{p} of your trades have no stop loss. Their average loss is {a}{vs}.", "{p} من صفقاتك بلا وقف خسارة، ومتوسط خسارتها {a}{vs}.", "{p} de vos trades n'ont pas de stop : perte moyenne {a}{vs}."), X("Set a stop loss on every trade before you enter.", "ضع وقف خسارة لكل صفقة قبل الدخول.", "Placez un stop loss sur chaque trade avant d'entrer.")],
  bestSymbol: [X("{s} is your best market", "{s} أفضل سوق لك", "{s} est votre meilleur marché"), X("{nT}, {net}, {wr} won.", "{nT}، {net}، ربحت {wr} منها.", "{nT}, {net}, {wr} gagnants."), X("Keep it as your main market.", "اجعله سوقك الأساسي.", "Gardez-le comme marché principal.")],
  bestDay: [X("{day} works for you", "يوم {day} يناسبك", "Le {day} vous réussit"), X("{nT}, {net}, {wr} won.", "{nT}، {net}، ربحت {wr} منها.", "{nT}, {net}, {wr} gagnants."), X("Be fully prepared for {day}.", "كن مستعداً تماماً ليوم {day}.", "Soyez prêt pour le {day}.")],
  bestHours: [X("Your best hours: {range}", "أفضل ساعاتك: {range}", "Vos meilleures heures : {range}"), X("{nT}, {net}, {wr} won.", "{nT}، {net}، ربحت {wr} منها.", "{nT}, {net}, {wr} gagnants."), X("Plan your main trades in this window.", "خطّط لصفقاتك الأساسية في هذه الفترة.", "Placez vos trades principaux sur ce créneau.")],
  bestSide: [X("Your {side} work", "صفقات {side} تنجح معك", "Vos {side} marchent"), X("{nT}, {net}, {wr} won.", "{nT}، {net}، ربحت {wr} منها.", "{nT}, {net}, {wr} gagnants."), X("Look for {side} setups first.", "ابحث عن فرص {side} أولاً.", "Cherchez d'abord des {side}.")],
};
const VS = X(", against {b} with a stop", " مقابل {b} مع الوقف", ", contre {b} avec stop");
const SIDE: Record<string, L> = { long: X("longs", "الشراء", "achats"), short: X("shorts", "البيع", "ventes") };
const ICON: Record<Topic, ReactNode> = { discipline: <ShieldCheck size={16} />, timing: <Clock3 size={16} />, symbols: <Coins size={16} />, direction: <ArrowUpDown size={16} />, exits: <Crosshair size={16} />, behaviour: <Flame size={16} />, risk: <AlertTriangle size={16} /> };

export default function AdvisorView({ lang, accounts, trades, onWhatIf, onOpenPath }: { lang: Lang; accounts: Account[]; trades: Trade[]; onWhatIf: (acc: string | null) => void; onOpenPath: () => void }) {
  const k = lang === "en" ? 0 : lang === "ar" ? 1 : 2, T = (x: L) => x[k];
  const [acc, setAcc] = useState("all");
  const list = useMemo(() => (acc === "all" ? trades : trades.filter((t) => t.accountId === acc)), [trades, acc]);
  const currency = commonCurrency(acc === "all" ? accounts : accounts.filter((a) => a.id === acc));
  const res: Plan = useMemo(() => advise(inputsFor(list, trades)), [list, trades]);
  const money = (v: number, sign = false) => fmtMoney(v, { sign, currency });
  const wd = (d: number) => new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + d)));
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const nTrades = (n: number) => (k === 1 ? (n === 1 ? "صفقة واحدة" : n === 2 ? "صفقتان" : n <= 10 ? `${n} صفقات` : `${n} صفقة`) : `${n} ${n === 1 ? "trade" : "trades"}`);
  const nLosses = (n: number) => (k === 1 ? (n === 1 ? "خسارة واحدة" : n === 2 ? "خسارتين متتاليتين" : n <= 10 ? `${n} خسائر متتالية` : `${n} خسارة متتالية`) : k === 2 ? `${n} pertes d'affilée` : `${n} losses in a row`);
  const iso = (s: string) => `⁦${s}⁩`; // a value kept left to right inside Arabic text
  const firstN = (n: number) => (k === 1 ? (n === 1 ? "الصفقة الأولى" : n === 2 ? "أول صفقتين" : n <= 10 ? `أول ${n} صفقات` : `أول ${n} صفقة`) : k === 2 ? (n === 1 ? "votre premier trade" : `vos ${n} premiers trades`) : n === 1 ? "your first trade" : `your first ${n} trades`);
  const fill = (x: string, a: Advice) => {
    const d = a.data, lv = (v: number) => (d.unit === "R" ? `${v}R` : money(v));
    const map: Record<string, string> = {
      n: String(d.n ?? ""), k: String(d.k ?? ""), nT: nTrades(Number(d.n)), kT: nTrades(Number(d.k)), nL: nLosses(Number(d.n)), m: String(d.m ?? ""),
      avg: money(Number(d.avg), true), net: money(Number(d.net), true), wr: `${Number(d.wr).toFixed(0)}%`, p: `${Number(d.p).toFixed(0)}%`,
      v: d.v != null ? lv(Number(d.v)) : "", a: a.id === "noStop" ? money(Number(d.a)) : d.a != null ? hh(Number(d.a)) : "", b: a.id === "noStop" ? (d.b != null ? money(Number(d.b)) : "") : d.b != null ? hh(Number(d.b)) : "",
      vs: a.id === "noStop" && d.b != null ? T(VS).replace("{b}", money(Number(d.b))) : "",
      day: d.d != null ? wd(Number(d.d)) : "", firstN: firstN(Number(d.n)), range: d.a != null && d.b != null && a.id !== "noStop" ? iso(`${hh(Number(d.a))}–${hh(Number(d.b))}`) : "", s: String(d.s ?? ""), side: d.side ? T(SIDE[String(d.side)]) : "", other: d.other ? T(SIDE[String(d.other)]) : "",
      x: `${Number(d.x).toFixed(1)}×`, lw: iso(fmtHold(Number(d.lw))), ll: iso(fmtHold(Number(d.ll))),
    };
    return ltrNumbers(x.replace(/\{(\w+)\}/g, (_, key: string) => map[key] ?? ""));
  };
  const text = (a: Advice, i: 0 | 1 | 2) => fill(T(COPY[a.id][i]), a);
  const tryRules = (r: Advice["rules"]) => { if (!r) return; presetWhatIf(r); onWhatIf(acc === "all" ? null : acc); }; // What if opens on the same account

  const fixes = res.advice.filter((a) => a.kind === "fix"), watch = res.advice.filter((a) => a.kind === "watch"), strengths = res.advice.filter((a) => a.kind === "strength");
  const planned = res.plan ? fixes.filter((a) => res.plan!.ids.includes(a.id)) : [];

  const card = (a: Advice, i: number) => {
    const good = a.kind === "strength", tone = good ? "var(--profit)" : a.kind === "watch" ? "var(--accent)" : "var(--primary)";
    const both = !!a.halves && a.halves[0] > 0 && a.halves[1] > 0;
    return (
      <article key={a.id} data-advice={a.id} className="adv-card relative overflow-hidden rounded-2xl border border-border p-5 transition-colors hover:border-[var(--primary)]" style={{ ...cardBg, animationDelay: `${i * 60}ms` }}>
        <span aria-hidden="true" className="absolute inset-y-0 start-0 w-1" style={{ background: tone }} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}>{good ? <Star size={16} /> : ICON[a.topic]}</span>
            <h3 className="font-heading text-base font-semibold text-text">{text(a, 0)}</h3>
          </div>
          {a.impact != null && (
            <div className="text-end">
              <div dir="ltr" className="tnum font-heading text-xl font-bold" style={{ color: "var(--profit)" }}>{money(a.impact, true)}</div>
              <div className="text-[11px] text-muted">{T(TXT.onHistory)}</div>
            </div>
          )}
        </div>
        <p className="mt-3 text-sm text-muted">{text(a, 1)}</p>
        <p className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-text"><ArrowRight size={15} className="mt-0.5 shrink-0 text-icon rtl:-scale-x-100" />{text(a, 2)}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: a.proof === "strong" ? "var(--profit)" : a.proof === "medium" ? "var(--accent)" : "var(--muted)" }}>
              <span className="flex gap-0.5" aria-hidden="true">{[0, 1, 2].map((j) => <span key={j} className="h-2.5 w-1 rounded-full" style={{ background: j < (a.proof === "strong" ? 3 : a.proof === "medium" ? 2 : 1) ? "currentColor" : "var(--border)" }} />)}</span>
              {T(TXT[a.proof])}
            </span>
            {a.halves && <span>{T(both ? TXT.both : TXT.oneHalf)}</span>}
          </div>
          {a.rules && (
            <button type="button" onClick={() => tryRules(a.rules)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-[var(--primary)] hover:text-primary">
              <Sparkles size={13} className="text-icon" />{T(TXT.tryOne)}
            </button>
          )}
        </div>
      </article>
    );
  };
  const section = (title: string, items: Advice[], start: number) => items.length > 0 && (
    <section className="space-y-3">
      <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <div className="grid gap-3 lg:grid-cols-2">{items.map((a, i) => card(a, start + i))}</div>
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-primary"><Sparkles size={22} className="text-icon" />{T(TXT.title)}</h1>
          <p className="text-sm text-muted">{T(TXT.sub)}</p>
        </div>
        {accounts.length > 1 && (
          <select className="field !w-auto" value={acc} onChange={(e) => setAcc(e.target.value)}>
            {[{ value: "all", label: T(TXT.all) }, ...accounts.map((a) => ({ value: a.id, label: a.name }))].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>

      {res.trades < MIN_TRADES ? (
        <div className="rounded-2xl border border-border p-10 text-center text-muted" style={cardBg}>{ltrNumbers(T(TXT.few).replace("{n}", String(MIN_TRADES)).replace("{m}", String(res.trades)))}</div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl border border-border p-6" style={cardBg}>
            <div aria-hidden="true" className="pointer-events-none absolute -end-20 -top-24 h-64 w-64 rounded-full opacity-50 blur-3xl" style={{ background: "color-mix(in srgb, var(--primary) 30%, transparent)" }} />
            <div className="relative space-y-4">
              <div className="text-xs text-muted">{ltrNumbers(T(TXT.analysed).replace("{n}", String(res.trades)))}</div>
              {res.plan ? (
                <>
                  <p className="max-w-3xl font-heading text-lg font-semibold leading-snug text-text">
                    {ltrNumbers((planned.length > 1 ? T(TXT.plan) : T(TXT.plan1)).replace("{n}", String(planned.length)).replace("{v}", money(res.plan.impact, true)))}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {planned.map((a) => <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-text" style={{ background: "color-mix(in srgb, var(--text) 4%, transparent)" }}><span className="text-icon">{ICON[a.topic]}</span>{text(a, 0)}</span>)}
                  </div>
                  <button type="button" onClick={() => tryRules(res.plan!.rules)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:-translate-y-0.5">
                    <Sparkles size={15} />{T(TXT.tryPlan)}
                  </button>
                </>
              ) : (
                <p className="font-heading text-lg font-semibold text-text">{T(TXT.clean)}</p>
              )}
            </div>
          </div>

          <Chat lang={lang} T={T} context={() => journalContext(list, res, currency)} />

          {section(T(TXT.fix), fixes, 0)}
          {section(T(TXT.watch), watch, fixes.length)}
          {section(T(TXT.strength), strengths, fixes.length + watch.length)}

          <div className="space-y-2 text-xs leading-relaxed text-muted">
            {res.exitsCovered < MIN_TRADES && (
              <p className="flex flex-wrap items-center gap-2">{T(TXT.exitsHint)}
                <button type="button" onClick={onOpenPath} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 font-semibold text-text transition-colors hover:border-[var(--primary)]"><Route size={13} className="text-icon" />{T(TXT.openPath)}</button>
              </p>
            )}
            <p>{T(TXT.caveat)}</p>
          </div>
        </>
      )}
    </div>
  );
}
