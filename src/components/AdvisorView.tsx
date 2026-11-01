import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, ArrowUpDown, Check, CircleCheck, Clock3, Coins, Crosshair, Eye, Flag, Flame, Info, ListChecks, MessagesSquare, Route, ScanSearch, ShieldCheck, Sparkles, Star, Wrench, X as Drop, type LucideIcon } from "lucide-react";
import AdvisorChat, { dly, tint } from "./AdvisorChat";
import Mascot, { MOODS, type Mood } from "./Mascot";
import PlanCard from "./PlanCard";
import TradeCheck, { type CheckRule } from "./TradeCheck";
import type { Tone } from "./profileUi";
import { inputsFor, presetWhatIf } from "./WhatIfTab";
import { advise, journalContext, MIN_TRADES, type Advice, type Plan, type Topic } from "../lib/advisor";
import { curves, NO_RULES, simulate, type Rules, type SimInput } from "../lib/whatif";
import { commonCurrency, fmtMoney, ltrNumbers } from "../lib/money";
import { useConverted } from "../useConverted";
import FxWarning from "./FxWarning";
import { fmtHold } from "../lib/stats";
import type { Account, Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
const X = (en: string, ar: string, fr: string): L => [en, ar, fr];
const TXT = {
  title: X("Advisor", "المستشار", "Conseiller"),
  sub: X("What your trades say, and what to change first.", "ما تقوله صفقاتك، وما يجب تغييره أولاً.", "Ce que disent vos trades, et quoi changer en premier."),
  all: X("All accounts", "كل الحسابات", "Tous les comptes"),
  nav: X("Advisor sections", "أقسام المستشار", "Sections du conseiller"),
  tradesTile: X("Trades analysed", "صفقات محلَّلة", "Trades analysés"),
  analysed: X("{n} closed trades analysed", "تم تحليل {n} صفقة مغلقة", "{n} trades clôturés analysés"),
  yourPlan: X("Your plan", "خطتك", "Votre plan"),
  planCap: X("would have been added to your history by following these {n} rules together.", "كان سيُضاف إلى سجلك لو اتبعت هذه القواعد الـ{n} معاً.", "auraient été ajoutés à votre historique en suivant ces {n} règles ensemble."),
  planCap1: X("would have been added to your history by following this rule.", "كان سيُضاف إلى سجلك لو اتبعت هذه القاعدة.", "auraient été ajoutés à votre historique en suivant cette règle."),
  actual: X("Your result", "نتيجتك الفعلية", "Votre résultat"),
  withPlan: X("With the plan", "مع الخطة", "Avec le plan"),
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
  half1: X("1st half", "النصف الأول", "1re moitié"),
  half2: X("2nd half", "النصف الثاني", "2e moitié"),
  askIt: X("Ask about it", "اسأل عنها", "En parler"),
  askQ: X("Explain my advice “{t}”: why it matters for me and how to apply it.", "اشرح لي نصيحة «{t}»: لماذا تهمّني وكيف أطبّقها؟", "Explique mon conseil « {t} » : pourquoi il compte pour moi et comment l'appliquer."),
  adopt: X("Adopt", "تبنّها", "Adopter"),
  adopted: X("Adopted", "متبنّاة", "Adoptée"),
  rules: X("My rules", "قواعدي", "Mes règles"),
  rulesSub: X("The rules you adopted, and how well you kept them since.", "القواعد التي تبنّيتها، ومدى التزامك بها منذ ذلك اليوم.", "Les règles adoptées, et comment vous les avez tenues depuis."),
  since: X("since {d}", "منذ {d}", "depuis le {d}"),
  kept: X("Kept in {k} of {n} trades", "التزمت بها في {k} من أصل {n}", "Tenue sur {k} des {n} trades"),
  noneSince: X("No trade since you adopted it.", "لا صفقات منذ تبنّيتها.", "Aucun trade depuis son adoption."),
  cost: X("Breaking it cost you {v}", "كسرُها كلّفك {v}", "L'enfreindre vous a coûté {v}"),
  saved: X("Breaking it still made you {v}", "كسرُها أربحك {v} هذه المرة", "L'enfreindre vous a quand même rapporté {v}"),
  perfect: X("Kept every time", "التزمت بها في كل مرة", "Tenue à chaque fois"),
  drop: X("Stop following", "توقف عن اتباعها", "Ne plus suivre"),
  caveat: X("Every figure is measured on your own past trades. A rule picked to fit the past usually helps less in the future: trust advice backed by many trades that worked in both halves of your history.", "كل رقم هنا مقاس على صفقاتك السابقة. القاعدة المختارة لتناسب الماضي تفيد عادةً أقل في المستقبل: ثق بالنصائح المدعومة بصفقات كثيرة والتي نجحت في نصفي سجلك.", "Chaque chiffre est mesuré sur vos propres trades passés. Une règle choisie pour coller au passé aide en général moins à l'avenir : fiez-vous aux conseils appuyés par beaucoup de trades et qui ont marché sur les deux moitiés de votre historique."),
  few: X("The advisor needs at least {n} closed trades (you have {m}).", "يحتاج المستشار {n} صفقات مغلقة على الأقل (لديك {m}).", "Le conseiller a besoin d'au moins {n} trades clôturés (vous en avez {m})."),
  exitsHint: X("Exit advice (stop loss, take profit) needs price paths: open Reports › Trade path once.", "نصائح الخروج (وقف الخسارة وجني الربح) تحتاج مسارات الأسعار: افتح «التقارير › مسار الصفقة» مرة واحدة.", "Les conseils de sortie (stop, take profit) demandent les parcours de prix : ouvrez une fois Rapports › Parcours du trade."),
  openPath: X("Open Trade path", "افتح «مسار الصفقة»", "Ouvrir Parcours du trade"),
  // the candle's mood, from your last trading day
  happy: X("Happy: your last trading day ({d}) closed {v}.", "سعيدة: آخر يوم تداول ({d}) أُغلق على {v}.", "Contente : votre dernier jour de trading ({d}) a fini à {v}."),
  sad: X("Sad: your last trading day ({d}) closed {v}.", "حزينة: آخر يوم تداول ({d}) أُغلق على {v}.", "Triste : votre dernier jour de trading ({d}) a fini à {v}."),
  noStop: X("Angry: on {d}, {n} without a stop loss.", "غاضبة: يوم {d}، {n} بلا وقف خسارة.", "En colère : le {d}, {n} sans stop loss."),
  broke: X("Angry: on {d}, you broke your rule “{r}”.", "غاضبة: يوم {d}، كسرت قاعدتك «{r}».", "En colère : le {d}, vous avez enfreint votre règle « {r} »."),
  jealous: X("Jealous: on {d}, your plan would have made {v} more.", "غيورة: يوم {d}، كانت خطتك ستربح {v} أكثر منك.", "Jalouse : le {d}, votre plan aurait gagné {v} de plus."),
  hello: X("Happy to help: ask me about your trading.", "سعيدة بمساعدتك: اسألني عن تداولك.", "Ravie de vous aider : posez-moi vos questions."),
  pvHappy: X("Happy after a winning day.", "سعيدة بعد يوم رابح.", "Contente après un jour gagnant."),
  pvSad: X("Sad after a losing day.", "حزينة بعد يوم خاسر.", "Triste après un jour perdant."),
  pvAngry: X("Angry at a trade without a stop loss, or a broken rule.", "غاضبة من صفقة بلا وقف خسارة أو قاعدة مكسورة.", "En colère contre un trade sans stop ou une règle enfreinte."),
  pvJealous: X("Jealous when your plan would have done better.", "غيورة حين كانت خطتك ستفعل أفضل منك.", "Jalouse quand votre plan aurait fait mieux."),
  tap: X("Tap the candle to see its moods", "اضغط الشمعة لترى حالاتها", "Touchez la bougie pour voir ses humeurs"),
  checkBtn: X("Check a trade", "افحص صفقة", "Vérifier un trade"),
};
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
const ICON: Record<Topic, LucideIcon> = { discipline: ShieldCheck, timing: Clock3, symbols: Coins, direction: ArrowUpDown, exits: Crosshair, behaviour: Flame, risk: AlertTriangle };
/** One colour per kind of advice: its section, its cards, its tile in the bar and the plan's chips. */
const KIND: Record<Advice["kind"], { tone: Tone; icon: LucideIcon; title: L; id: string }> = {
  fix: { tone: "sky", icon: Wrench, title: TXT.fix, id: "adv-fix" },
  watch: { tone: "amber", icon: Eye, title: TXT.watch, id: "adv-watch" },
  strength: { tone: "emerald", icon: Star, title: TXT.strength, id: "adv-works" },
};
const MOOD_TONE: Record<Mood, Tone> = { happy: "emerald", sad: "sky", angry: "rose", jealous: "violet" };
const PREVIEW: Record<Mood, L> = { happy: TXT.pvHappy, sad: TXT.pvSad, angry: TXT.pvAngry, jealous: TXT.pvJealous };
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- rules the trader adopted, kept (and synced) in "mizan-advisor-rules" ----
type Adopted = { id: string; topic: Topic; rules: Partial<Rules>; data: Advice["data"]; at: string }; // at: YYYY-MM-DD
const RULES = "mizan-advisor-rules";
const keyOf = (x: { id: string; rules: Partial<Rules> | null }) => `${x.id}|${JSON.stringify(x.rules)}`;
const readAdopted = (): Adopted[] => { try { const v = JSON.parse(localStorage.getItem(RULES) ?? "null"); return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && x.rules && typeof x.at === "string") : []; } catch { return []; } };
const dayOf = (t: Trade) => (t.exitTime ?? t.entryTime ?? "").slice(0, 10);
/** How a rule was kept since it was adopted: trades it would have skipped or closed differently count as broken. */
function keptSince(inputs: SimInput[], r: Adopted) {
  const since = inputs.filter((x) => (x.trade.entryTime ?? x.trade.exitTime ?? "").slice(0, 10) >= r.at);
  const s = simulate(since, { ...NO_RULES, ...r.rules });
  const broke = s.rows.filter((x) => x.skip || x.exit).length;
  return { n: s.rows.length, kept: s.rows.length - broke, cost: s.sim.net - s.actual.net };
}

type MoodWhy = { mood: Mood; why: "none" | "day" | "noStop" | "broke" | "plan"; day?: string; v?: number; n?: number; rule?: Adopted };
/** The candle's mood from the last trading day: a trade without a stop or a broken adopted rule makes it angry, a
 *  losing day sad, a winning day the plan would have beaten jealous, any other winning day happy. */
function moodOf(inputs: SimInput[], plan: Plan["plan"], adopted: Adopted[]): MoodWhy {
  if (!inputs.length) return { mood: "happy", why: "none" };
  const day = inputs.map((x) => dayOf(x.trade)).sort().pop() as string;
  const today = inputs.filter((x) => dayOf(x.trade) === day);
  const net = today.reduce((s, x) => s + (x.trade.pnl as number), 0);
  const bare = today.filter((x) => !(x.trade.sl != null && x.trade.sl > 0)).length;
  if (bare) return { mood: "angry", why: "noStop", day, n: bare };
  for (const r of adopted) {
    if (day < r.at) continue;
    if (simulate(today, { ...NO_RULES, ...r.rules }).rows.some((x) => x.skip || x.exit)) return { mood: "angry", why: "broke", day, rule: r };
  }
  if (net < 0) return { mood: "sad", why: "day", day, v: net };
  if (plan) {
    const s = simulate(today, { ...NO_RULES, ...plan.rules }), gain = s.sim.net - s.actual.net;
    if (gain > 0.5) return { mood: "jealous", why: "plan", day, v: gain };
  }
  return { mood: "happy", why: "day", day, v: net };
}

/** Elements with .adv-reveal rise in the first time they scroll into view. */
function useReveal(dep: unknown) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = [...(root.current?.querySelectorAll<HTMLElement>(".adv-reveal:not([data-in])") ?? [])];
    if (!els.length) return;
    if (typeof IntersectionObserver === "undefined") { els.forEach((e) => { e.dataset.in = ""; }); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { (e.target as HTMLElement).dataset.in = ""; io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [dep]);
  return root;
}

export default function AdvisorView({ lang, accounts, trades, onWhatIf, onOpenPath }: { lang: Lang; accounts: Account[]; trades: Trade[]; onWhatIf: (acc: string | null) => void; onOpenPath: () => void }) {
  const k = lang === "en" ? 0 : lang === "ar" ? 1 : 2, T = (x: L) => x[k];
  const [acc, setAcc] = useState("all");
  const [adopted, setAdopted] = useState<Adopted[]>(readAdopted);
  const [chat, setChat] = useState(false);
  const [request, setRequest] = useState<{ q: string; n: number } | null>(null);
  const [peek, setPeek] = useState<Mood | null>(null);
  const [active, setActive] = useState("adv-plan");
  const fx = useConverted(acc === "all", accounts, trades);
  const list = useMemo(() => (acc === "all" ? fx.trades : fx.trades.filter((t) => t.accountId === acc)), [fx.trades, acc]);
  const currency = commonCurrency(acc === "all" ? fx.accounts : fx.accounts.filter((a) => a.id === acc));
  const inputs = useMemo(() => inputsFor(list, trades), [list, trades]);
  const res: Plan = useMemo(() => advise(inputs), [inputs]);
  const actual = useMemo(() => inputs.reduce((s, x) => s + (x.trade.pnl as number), 0), [inputs]);
  const losing = useMemo(() => inputs.filter((x) => (x.trade.pnl as number) < 0).length, [inputs]);
  // both running totals for the plan card: yours, and with the plan's rules (or yours alone when there is no plan)
  const curve = useMemo(() => {
    if (res.plan) { const c = curves(simulate(inputs, { ...NO_RULES, ...res.plan.rules })); return { a: c.a, b: c.b }; }
    const order = [...inputs].sort((x, y) => (x.trade.exitTime ?? "").localeCompare(y.trade.exitTime ?? "") || x.trade.no - y.trade.no);
    let run = 0;
    return { a: [0, ...order.map((x) => (run += x.trade.pnl as number))], b: null };
  }, [inputs, res]);
  const mood = useMemo(() => moodOf(inputs, res.plan, adopted), [inputs, res, adopted]);
  const root = useReveal(res);
  useEffect(() => { try { localStorage.setItem(RULES, JSON.stringify(adopted)); } catch { /* storage full or blocked */ } }, [adopted]);
  useEffect(() => { if (!peek) return; const t = setTimeout(() => setPeek(null), 5000); return () => clearTimeout(t); }, [peek]);

  const loc = lang === "ar" ? "ar-u-nu-latn" : lang;
  const money = (v: number, sign = false) => fmtMoney(v, { sign, currency });
  const dateOf = (d: string) => new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const wd = (d: number) => new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + d)));
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const nTrades = (n: number) => (k === 1 ? (n === 1 ? "صفقة واحدة" : n === 2 ? "صفقتان" : n <= 10 ? `${n} صفقات` : `${n} صفقة`) : `${n} ${n === 1 ? "trade" : "trades"}`);
  const nLosses = (n: number) => (k === 1 ? (n === 1 ? "خسارة واحدة" : n === 2 ? "خسارتين متتاليتين" : n <= 10 ? `${n} خسائر متتالية` : `${n} خسارة متتالية`) : k === 2 ? `${n} pertes d'affilée` : `${n} losses in a row`);
  const iso = (s: string) => `⁦${s}⁩`; // a value kept left to right inside Arabic text
  const firstN = (n: number) => (k === 1 ? (n === 1 ? "الصفقة الأولى" : n === 2 ? "أول صفقتين" : n <= 10 ? `أول ${n} صفقات` : `أول ${n} صفقة`) : k === 2 ? (n === 1 ? "votre premier trade" : `vos ${n} premiers trades`) : n === 1 ? "your first trade" : `your first ${n} trades`);
  const fill = (x: string, a: Pick<Advice, "id" | "data">) => {
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
  const text = (a: Pick<Advice, "id" | "data">, i: 0 | 1 | 2) => fill(T(COPY[a.id][i]), a);
  const plain = (s: string) => s.replace(/[⁦-⁩]/g, "");
  const tryRules = (r: Advice["rules"]) => { if (!r) return; presetWhatIf(r); onWhatIf(acc === "all" ? null : acc); }; // What if opens on the same account
  const askAbout = (a: Advice) => { setRequest((r) => ({ q: T(TXT.askQ).replace("{t}", plain(text(a, 0))), n: (r?.n ?? 0) + 1 })); setChat(true); };
  const isAdopted = (a: Advice) => adopted.some((x) => keyOf(x) === keyOf(a));
  const toggleAdopt = (a: Advice) => {
    if (!a.rules) return;
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    setAdopted((xs) => (xs.some((x) => keyOf(x) === keyOf(a)) ? xs.filter((x) => keyOf(x) !== keyOf(a)) : [...xs, { id: a.id, topic: a.topic, rules: a.rules as Partial<Rules>, data: a.data, at: today }]));
  };

  const byKind = (kind: Advice["kind"]) => res.advice.filter((a) => a.kind === kind);
  const planned = res.plan ? byKind("fix").filter((a) => res.plan!.ids.includes(a.id)) : [];
  const planRules = useMemo<CheckRule[]>(() => (res.plan ? res.advice.filter((a) => a.kind === "fix" && a.rules && res.plan!.ids.includes(a.id)).map((a) => ({ id: a.id, rules: a.rules as Partial<Rules>, data: a.data, topic: a.topic })) : []), [res]);

  // the section in view lights up in the bar
  const ids = ["adv-plan", ...(["fix", "watch", "strength"] as const).filter((x) => byKind(x).length).map((x) => KIND[x].id)].join(",");
  useEffect(() => {
    const els = ids.split(",").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      const top = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);
  const go = (id: string) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: still() ? "auto" : "smooth", block: "start" }); };

  const face = peek ?? mood.mood;
  const moodText = peek ? T(PREVIEW[peek]) : ltrNumbers(
    mood.why === "none" ? T(TXT.hello)
      : mood.why === "noStop" ? T(TXT.noStop).replace("{d}", dateOf(mood.day!)).replace("{n}", nTrades(mood.n!))
        : mood.why === "broke" ? T(TXT.broke).replace("{d}", dateOf(mood.day!)).replace("{r}", text(mood.rule!, 0))
          : mood.why === "plan" ? T(TXT.jealous).replace("{d}", dateOf(mood.day!)).replace("{v}", money(mood.v!))
            : T(mood.mood === "sad" ? TXT.sad : TXT.happy).replace("{d}", dateOf(mood.day!)).replace("{v}", money(mood.v!, true)));

  const card = (a: Advice, i: number) => {
    const Icon = a.kind === "strength" ? Star : ICON[a.topic];
    const both = !!a.halves && a.halves[0] > 0 && a.halves[1] > 0;
    const lvl = a.proof === "strong" ? 3 : a.proof === "medium" ? 2 : 1, proofTone: Tone = lvl === 3 ? "emerald" : lvl === 2 ? "amber" : "slate";
    const top = a.halves ? Math.max(Math.abs(a.halves[0]), Math.abs(a.halves[1])) : 0, on = isAdopted(a);
    return (
      <div key={a.id} className="adv-reveal" style={dly((i % 2) * 90)}>
        <article data-advice={a.id} className={`tone-${KIND[a.kind].tone} adv-item adv-lift relative flex h-full flex-col overflow-hidden rounded-2xl p-4 sm:p-5`}>
          <span aria-hidden="true" className="absolute inset-y-0 start-0 w-1" style={{ background: "var(--tone)" }} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
              <span className="tone-tile h-10 w-10 rounded-xl"><Icon size={17} /></span>
              <h3 className="min-w-0 font-heading text-base font-semibold leading-snug text-text">{text(a, 0)}</h3>
            </div>
            {a.impact != null && (
              <div className="flex items-baseline gap-2 max-sm:basis-full sm:flex-col sm:items-end sm:gap-0">
                <bdi dir="ltr" className="tone-emerald tone-text font-heading text-xl font-bold tnum">{money(a.impact, true)}</bdi>
                <span className="text-[11px] text-muted">{T(TXT.onHistory)}</span>
              </div>
            )}
          </div>
          <p className="adv-p mt-3 text-sm">{tint(text(a, 1))}</p>
          <div className="adv-do mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3">
            <ArrowRight size={15} className="tone-text mt-0.5 shrink-0 rtl:-scale-x-100" />
            <p className="text-sm font-medium leading-relaxed text-text">{tint(text(a, 2))}</p>
          </div>
          {a.halves && (
            <div className="mt-3.5 space-y-1.5 text-[11px]">
              <p className="flex items-center gap-1.5 text-muted">{both ? <CircleCheck size={12} className="tone-emerald tone-text" /> : <Info size={12} />}{T(both ? TXT.both : TXT.oneHalf)}</p>
              {a.halves.map((v, j) => (
                <div key={j} className="grid grid-cols-[4.75rem_1fr_auto] items-center gap-2.5">
                  <span className="text-muted">{T(j ? TXT.half2 : TXT.half1)}</span>
                  <span className="h-1.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--text) 8%, transparent)" }}>
                    <span className="adv-hbar block h-full rounded-full" style={{ width: `${top ? Math.max(6, (Math.abs(v) / top) * 100) : 0}%`, background: v > 0 ? "var(--c-emerald)" : "var(--loss)" }} />
                  </span>
                  <bdi dir="ltr" className={v > 0 ? "adv-up" : "adv-down"}>{money(v, true)}</bdi>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2.5 pt-4">
            <span className={`tone-${proofTone} tone-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold`}>
              <span aria-hidden="true" className="adv-meter flex items-end gap-0.5">
                {[0, 1, 2].map((j) => <span key={j} className="w-1 rounded-full" style={{ height: 6 + j * 2.5, background: j < lvl ? "currentColor" : "color-mix(in srgb, currentColor 25%, transparent)" }} />)}
              </span>
              {T(TXT[a.proof])}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => askAbout(a)} className="tone-violet tone-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"><MessagesSquare size={13} />{T(TXT.askIt)}</button>
              {a.rules && a.kind === "fix" && (
                <button type="button" aria-pressed={on} onClick={() => toggleAdopt(a)} className={`tone-gold ${on ? "tone-solid" : "tone-btn"} inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold`}>
                  {on ? <Check size={13} /> : <Flag size={13} />}{T(on ? TXT.adopted : TXT.adopt)}
                </button>
              )}
              {a.rules && (
                <button type="button" onClick={() => tryRules(a.rules)} className="tone-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"><Sparkles size={13} />{T(TXT.tryOne)}</button>
              )}
            </div>
          </div>
        </article>
      </div>
    );
  };
  const group = (kind: Advice["kind"]) => {
    const items = byKind(kind), K = KIND[kind], Icon = K.icon;
    return items.length > 0 && (
      <section key={kind} id={K.id} className="scroll-mt-28 space-y-4">
        <div className={`tone-${K.tone} adv-reveal flex items-center gap-3`}>
          <span className="tone-tile h-10 w-10 rounded-xl"><Icon size={18} /></span>
          <h2 className="font-heading text-lg font-semibold text-text">{T(K.title)}</h2>
          <span className="tone-chip rounded-full px-2.5 py-0.5 text-xs font-bold tnum">{items.length}</span>
          <span aria-hidden="true" className="adv-rule min-w-6 flex-1" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">{items.map(card)}</div>
      </section>
    );
  };
  const tiles: { id: string; tone: Tone; icon: LucideIcon; label: L; n: number }[] = [
    ...(["fix", "watch", "strength"] as const).map((x) => ({ id: KIND[x].id, tone: KIND[x].tone, icon: KIND[x].icon, label: KIND[x].title, n: byKind(x).length })),
    { id: "adv-plan", tone: "gold", icon: ListChecks, label: TXT.tradesTile, n: res.trades },
  ];
  const myRules = adopted.map((r) => ({ r, s: keptSince(inputs, r) }));
  let rulesEl: ReactNode = null;
  if (myRules.length) rulesEl = (
    <section id="adv-rules" className="tone-indigo tone-panel adv-pop scroll-mt-28 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="tone-tile h-10 w-10 rounded-xl"><Flag size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-semibold text-text">{T(TXT.rules)}</h2>
          <p className="text-xs text-muted">{T(TXT.rulesSub)}</p>
        </div>
        <span className="tone-chip rounded-full px-2.5 py-0.5 text-xs font-bold tnum">{myRules.length}</span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {myRules.map(({ r, s }, i) => {
          const Icon = ICON[r.topic], pct = s.n ? (s.kept / s.n) * 100 : 0, tone: Tone = !s.n ? "slate" : pct >= 80 ? "emerald" : pct >= 50 ? "amber" : "rose";
          return (
            <div key={keyOf(r)} className="adv-pop rounded-xl border border-border bg-[var(--bg)] p-3.5" style={dly(i * 80)}>
              <div className="flex items-start gap-3">
                <span className="tone-tile h-9 w-9 rounded-lg"><Icon size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text">{text(r, 0)}</p>
                  <p className="text-[11px] text-muted">{T(TXT.since).replace("{d}", dateOf(r.at))}</p>
                </div>
                <button type="button" onClick={() => setAdopted((xs) => xs.filter((x) => keyOf(x) !== keyOf(r)))} title={T(TXT.drop)} aria-label={T(TXT.drop)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--surface)] hover:text-text"><Drop size={15} /></button>
              </div>
              {s.n ? (
                <div className={`tone-${tone} mt-3 space-y-1.5`}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-text">{ltrNumbers(T(TXT.kept).replace("{k}", String(s.kept)).replace("{n}", String(s.n)))}</span>
                    <bdi dir="ltr" className="tone-text font-bold tnum">{Math.round(pct)}%</bdi>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--tone) 15%, var(--border))" }}>
                    <div className="adv-grow h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: "var(--tone)" }} />
                  </div>
                  <p className="text-[11px]">
                    {s.kept === s.n ? <span className="tone-emerald tone-text font-semibold">{T(TXT.perfect)}</span>
                      : s.cost > 0.5 ? <span className="text-muted">{tint(ltrNumbers(T(TXT.cost).replace("{v}", money(-s.cost, true))))}</span>
                        : s.cost < -0.5 ? <span className="text-muted">{tint(ltrNumbers(T(TXT.saved).replace("{v}", money(-s.cost, true))))}</span> : null}
                  </p>
                </div>
              ) : <p className="mt-3 text-xs text-muted">{T(TXT.noneSince)}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div ref={root} className="mx-auto max-w-6xl space-y-6 pb-24 pt-2 sm:space-y-8 sm:p-4 sm:pb-24 md:p-6 md:pb-24">
      <FxWarning codes={fx.missing} lang={lang} />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button type="button" onClick={() => setPeek(MOODS[(MOODS.indexOf(face) + 1) % MOODS.length])} title={T(TXT.tap)} aria-label={T(TXT.tap)}
            className={`tone-${MOOD_TONE[face]} adv-mood grid h-[88px] w-[80px] shrink-0 place-items-center rounded-2xl`}>
            <Mascot mood={face} className="h-[78px] w-[67px]" />
          </button>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold text-text">{T(TXT.title)}</h1>
            <p className="text-sm text-muted">{T(TXT.sub)}</p>
            <p aria-live="polite" className={`tone-${MOOD_TONE[face]} tone-chip mt-2 inline-block rounded-2xl px-3 py-1 text-xs font-semibold leading-relaxed`}>{tint(moodText)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {res.trades >= MIN_TRADES && (
            <button type="button" onClick={() => go("adv-check")} className="tone-emerald tone-btn inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold"><ScanSearch size={15} />{T(TXT.checkBtn)}</button>
          )}
          {accounts.length > 1 && (
            <select className="field !w-auto" value={acc} onChange={(e) => setAcc(e.target.value)}>
              {[{ value: "all", label: T(TXT.all) }, ...accounts.map((a) => ({ value: a.id, label: a.name }))].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
      </header>

      {res.trades < MIN_TRADES ? (
        <div className="tone-sky tone-panel adv-pop rounded-3xl p-8 text-center">
          <span className="tone-tile mx-auto h-14 w-14 rounded-2xl"><Sparkles size={24} className="adv-twinkle" /></span>
          <p className="mx-auto mt-4 max-w-md font-heading text-lg font-semibold text-text">{ltrNumbers(T(TXT.few).replace("{n}", String(MIN_TRADES)).replace("{m}", String(res.trades)))}</p>
          <div className="mx-auto mt-5 h-2 max-w-xs overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--tone) 15%, var(--border))" }}>
            <div className="adv-grow h-full rounded-full" style={{ width: `${Math.min(100, (res.trades / MIN_TRADES) * 100)}%`, background: "var(--tone)" }} />
          </div>
          <p dir="ltr" className="tone-text mt-2 text-xs font-semibold tnum">{res.trades} / {MIN_TRADES}</p>
        </div>
      ) : (
        <>
          <nav aria-label={T(TXT.nav)} className="adv-bar sticky top-0 z-20 -mx-4 overflow-x-auto px-4 py-2.5">
            <div className="flex gap-2 sm:grid sm:grid-cols-4">
              {tiles.map((x) => {
                const Icon = x.icon;
                return (
                  <button key={x.id} type="button" disabled={!x.n} aria-current={active === x.id ? "true" : undefined} onClick={() => go(x.id)} className={`tone-${x.tone} adv-tile flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-start`}>
                    <span className="tone-tile h-8 w-8 rounded-lg"><Icon size={15} /></span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text">{T(x.label)}</span>
                    <span className="tone-text font-heading text-lg font-bold tnum">{x.n}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <PlanCard lang={lang} currency={currency} trades={res.trades} impact={res.plan?.impact ?? null} actual={actual} losing={losing} curve={curve}
            steps={planned.map((a) => ({ key: a.id, title: text(a, 0), icon: ICON[a.topic] }))} onTry={() => tryRules(res.plan?.rules ?? null)} />
          <TradeCheck lang={lang} accounts={accounts} acc={acc} trades={list} currency={currency} adopted={adopted} plan={planRules} titleOf={(r) => text(r, 0)} />

          {rulesEl}
          {group("fix")}
          {group("watch")}
          {group("strength")}

          <div className="tone-slate adv-reveal flex gap-3 rounded-2xl p-4" style={{ border: "1px dashed color-mix(in srgb, var(--tone) 35%, var(--border))" }}>
            <span className="tone-tile h-9 w-9 rounded-xl"><Info size={16} /></span>
            <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed text-muted">
              {res.exitsCovered < MIN_TRADES && (
                <p className="flex flex-wrap items-center gap-2">{T(TXT.exitsHint)}
                  <button type="button" onClick={onOpenPath} className="tone-sky tone-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold"><Route size={13} />{T(TXT.openPath)}</button>
                </p>
              )}
              <p>{T(TXT.caveat)}</p>
            </div>
          </div>
        </>
      )}
      <AdvisorChat lang={lang} mood={face} open={chat} onOpen={() => setChat(true)} onClose={() => setChat(false)} request={request} context={() => journalContext(list, res, currency)} />
    </div>
  );
}
