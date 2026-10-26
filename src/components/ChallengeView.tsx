// Challenges: prop-firm evaluations tracked on the account's trades — the room left today and overall, the target, the
// trading days, a balance chart against the floor, and the chance to pass from here. A personal challenge runs the
// trader's own account on the same rules, from its real balance, with a new attempt after a failure.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, Flag, Mountain, Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2, UserRound, X } from "lucide-react";
import type { Account, BalancePoint, Lang, Trade } from "../types";
import { challengeState, retryStart, TEMPLATES, type Challenge, type ChallengeState } from "../lib/challenge";
import { balanceBefore } from "../lib/balance";
import type { CashFlow } from "../lib/cashflow";
import { fmtMoney, ltrNumbers } from "../lib/money";
import { propOdds } from "../lib/tradeLab";
import { Bar, BalanceChart, dangerColor, dayLabel, fill, nowFor, todayFor } from "./challengeUi";
import DateInput, { dayFirst } from "./DateInput";
import { fromDraft, hasRule, OT, OwnCard, OwnFields, toDraft, type OwnDraft } from "./OwnRulesCard";
import { loosens, NO_OWN, rulesAt, stricter, tidy, type OwnRules } from "../lib/ownRules";

type L3 = Record<Lang, string>;
const T = {
  title: { en: "Challenges", ar: "التحديات", fr: "Challenges" },
  telegram: { en: "Get these warnings on Telegram →", ar: "استلم هذه التنبيهات على تيليغرام ←", fr: "Recevez ces alertes sur Telegram →" },
  lead: { en: "A prop-firm evaluation, or your own account on the same rules, checked on every trade: the target, the daily and overall loss limits, the trading days.", ar: "تقييمك لدى شركة تمويل، أو حسابك الشخصي بالقواعد نفسها، مفحوصاً مع كل صفقة: الهدف، وحدّا الخسارة اليومية والكلية، وأيام التداول.", fr: "Une évaluation de prop firm, ou votre propre compte aux mêmes règles, vérifiée à chaque trade : l'objectif, les pertes max journalière et totale, les jours de trading." },
  new: { en: "New challenge", ar: "تحدٍّ جديد", fr: "Nouveau challenge" },
  emptyTitle: { en: "No challenge yet", ar: "لا يوجد تحدٍّ بعد", fr: "Aucun challenge" },
  emptyText: { en: "Track a prop-firm evaluation, or challenge yourself: run your own account on the same rules. Mizan checks them on every trade and shows how much you can still risk today.", ar: "تابع تقييمك لدى شركة تمويل، أو تحدَّ نفسك وأدِر حسابك الشخصي بالقواعد نفسها. يفحصها ميزان مع كل صفقة ويريك كم يمكنك أن تخاطر به اليوم.", fr: "Suivez une évaluation de prop firm, ou lancez-vous un défi : votre propre compte aux mêmes règles. Mizan les vérifie à chaque trade et montre ce que vous pouvez encore risquer aujourd'hui." },
  noAccounts: { en: "Connect an account first.", ar: "اربط حساباً أولاً.", fr: "Connectez d'abord un compte." },
  active: { en: "In progress", ar: "قيد التقدم", fr: "En cours" },
  passed: { en: "Passed", ar: "ناجح", fr: "Réussi" },
  failed: { en: "Failed", ar: "فاشل", fr: "Échoué" },
  started: { en: "Started {d}", ar: "بدأ في {d}", fr: "Commencé le {d}" },
  dayN: { en: "day {n}", ar: "اليوم {n}", fr: "jour {n}" },
  dayNofM: { en: "day {n} of {m}", ar: "اليوم {n} من {m}", fr: "jour {n} sur {m}" },
  riskDaily: { en: "You can lose up to {m} more today before the daily limit.", ar: "يمكنك أن تخسر حتى {m} إضافية اليوم قبل حد الخسارة اليومية.", fr: "Vous pouvez encore perdre jusqu'à {m} aujourd'hui avant la limite journalière." },
  riskMax: { en: "You can lose up to {m} more before the overall loss limit.", ar: "يمكنك أن تخسر حتى {m} إضافية قبل حد الخسارة الكلية.", fr: "Vous pouvez encore perdre jusqu'à {m} avant la perte max totale." },
  riskZero: { en: "No room left: a loss now breaks a rule.", ar: "لم يبقَ هامش: أي خسارة الآن تكسر قاعدة.", fr: "Plus aucune marge : une perte maintenant enfreint une règle." },
  failedDaily: { en: "Failed on {d}: the day's loss reached {v} (limit {l}).", ar: "فشل في {d}: بلغت خسارة اليوم {v} (الحد {l}).", fr: "Échoué le {d} : la perte du jour a atteint {v} (limite {l})." },
  failedMax: { en: "Failed on {d}: the balance fell to {v}, under the floor of {l}.", ar: "فشل في {d}: نزل الرصيد إلى {v}، تحت الحد الأدنى {l}.", fr: "Échoué le {d} : le solde est tombé à {v}, sous le plancher de {l}." },
  failedTime: { en: "Failed: the {l} days allowed ended on {d}.", ar: "فشل: انتهت المهلة ({l} يوماً) في {d}.", fr: "Échoué : les {l} jours autorisés ont pris fin le {d}." },
  passedOn: { en: "Passed on {d}: target reached with every rule kept.", ar: "نجح في {d}: بلغ الهدف مع احترام كل القواعد.", fr: "Réussi le {d} : objectif atteint, toutes les règles respectées." },
  waitDays: { en: "Target reached: trade {n} more day(s) to meet the minimum of {m}.", ar: "تم بلوغ الهدف: تداول {n} يوم إضافي لتكمل الحد الأدنى ({m}).", fr: "Objectif atteint : tradez encore {n} jour(s) pour le minimum de {m}." },
  waitCons: { en: "Target reached, but your best day is {p}% of the profit (max {m}%): keep trading to spread it.", ar: "تم بلوغ الهدف، لكن أفضل يوم يمثل {p}% من الربح (الحد {m}%): واصل التداول لتوزيعه.", fr: "Objectif atteint, mais votre meilleur jour fait {p} % du profit (max {m} %) : continuez pour le répartir." },
  target: { en: "Profit target", ar: "هدف الربح", fr: "Objectif de profit" },
  toGo: { en: "{p}% · {m} to go", ar: "{p}% · بقي {m}", fr: "{p} % · reste {m}" },
  reached: { en: "Reached", ar: "تم بلوغه", fr: "Atteint" },
  noTarget: { en: "No target (funded account)", ar: "بلا هدف (حساب ممول)", fr: "Pas d'objectif (compte financé)" },
  daily: { en: "Daily loss today", ar: "خسارة اليوم", fr: "Perte du jour" },
  used: { en: "{u} of {l} used", ar: "استُعمل {u} من {l}", fr: "{u} sur {l} utilisés" },
  room: { en: "room {m}", ar: "الهامش {m}", fr: "marge {m}" },
  overall: { en: "Overall loss", ar: "الخسارة الكلية", fr: "Perte max totale" },
  floor: { en: "floor {m}", ar: "الحد الأدنى {m}", fr: "plancher {m}" },
  trailing: { en: "trailing", ar: "متحرك", fr: "suiveur" },
  none: { en: "Not set", ar: "غير محدد", fr: "Non défini" },
  days: { en: "Trading days", ar: "أيام التداول", fr: "Jours de trading" },
  ofMin: { en: "{n} of {m}", ar: "{n} من {m}", fr: "{n} sur {m}" },
  minMet: { en: "{n} · minimum {m} met", ar: "{n} · تحقق الحد الأدنى ({m})", fr: "{n} · minimum {m} atteint" },
  best: { en: "Best day", ar: "أفضل يوم", fr: "Meilleur jour" },
  share: { en: "{p}% of the profit (max {m}%)", ar: "{p}% من الربح (الحد {m}%)", fr: "{p} % du profit (max {m} %)" },
  odds: { en: "Chance to pass from here", ar: "فرصة النجاح من هنا", fr: "Chance de réussir d'ici" },
  oddsSub: { en: "fail {f}% · undecided {o}%", ar: "فشل {f}% · غير محسوم {o}%", fr: "échec {f} % · non tranché {o} %" },
  oddsDays: { en: " · about {n} trading days", ar: " · نحو {n} يوم تداول", fr: " · environ {n} jours de trading" },
  oddsHint: { en: "2,000 simulations replaying your own past trading days from the current balance (minimum days not counted).", ar: "2,000 محاكاة تعيد أيام تداولك السابقة انطلاقاً من الرصيد الحالي (دون احتساب الحد الأدنى للأيام).", fr: "2 000 simulations qui rejouent vos jours de trading passés depuis le solde actuel (jours minimum non comptés)." },
  pace: { en: "At your average trading day ({m}), about {n} more trading days to the target.", ar: "بمعدل يوم تداولك ({m})، يبقى نحو {n} يوم تداول حتى الهدف.", fr: "À votre journée moyenne ({m}), environ {n} jours de trading jusqu'à l'objectif." },
  note: { en: "Closed trades only, by the broker's day. Firms also count floating losses: keep a margin.", ar: "على الصفقات المغلقة فقط، بحسب يوم الوسيط. تحتسب الشركات الخسائر العائمة أيضاً، فاترك هامشاً.", fr: "Trades clôturés uniquement, par jour du courtier. Les sociétés comptent aussi les pertes latentes : gardez une marge." },
  balance: { en: "Balance", ar: "الرصيد", fr: "Solde" },
  edit: { en: "Edit", ar: "تعديل", fr: "Modifier" },
  remove: { en: "Remove", ar: "حذف", fr: "Supprimer" },
  confirmRemove: { en: "Remove this challenge? Your trades stay.", ar: "حذف هذا التحدي؟ تبقى صفقاتك كما هي.", fr: "Supprimer ce challenge ? Vos trades restent." },
  cancel: { en: "Cancel", ar: "إلغاء", fr: "Annuler" },
  formNew: { en: "New challenge", ar: "تحدٍّ جديد", fr: "Nouveau challenge" },
  formEdit: { en: "Edit challenge", ar: "تعديل التحدي", fr: "Modifier le challenge" },
  account: { en: "Account", ar: "الحساب", fr: "Compte" },
  from: { en: "Start from", ar: "ابدأ من", fr: "Partir de" },
  twoStep1: { en: "2-step · phase 1", ar: "مرحلتان · المرحلة 1", fr: "2 étapes · phase 1" },
  twoStep2: { en: "2-step · phase 2", ar: "مرحلتان · المرحلة 2", fr: "2 étapes · phase 2" },
  oneStep: { en: "1-step", ar: "مرحلة واحدة", fr: "1 étape" },
  funded: { en: "Funded account", ar: "حساب ممول", fr: "Compte financé" },
  name: { en: "Name", ar: "الاسم", fr: "Nom" },
  size: { en: "Account size", ar: "حجم الحساب", fr: "Taille du compte" },
  start: { en: "Start day", ar: "يوم البداية", fr: "Jour de début" },
  calendar: { en: "Calendar", ar: "التقويم", fr: "Calendrier" },
  fTarget: { en: "Profit target % (empty = none)", ar: "هدف الربح % (فارغ = بلا هدف)", fr: "Objectif % (vide = aucun)" },
  fDaily: { en: "Max daily loss %", ar: "أقصى خسارة يومية %", fr: "Perte journalière max %" },
  ofSize: { en: "of the account size", ar: "من حجم الحساب", fr: "de la taille du compte" },
  ofDay: { en: "of the day's starting balance", ar: "من رصيد بداية اليوم", fr: "du solde de début de journée" },
  fMax: { en: "Max overall loss %", ar: "أقصى خسارة كلية %", fr: "Perte max totale %" },
  fTrailing: { en: "Trailing: follows the highest balance", ar: "متحرك: يتبع أعلى رصيد", fr: "Suiveur : suit le solde le plus haut" },
  fLock: { en: "Stops rising at the account size", ar: "يتوقف عند حجم الحساب", fr: "S'arrête à la taille du compte" },
  fMinDays: { en: "Minimum trading days", ar: "الحد الأدنى لأيام التداول", fr: "Jours de trading minimum" },
  fLimit: { en: "Time limit in days (empty = none)", ar: "المهلة بالأيام (فارغ = بلا حد)", fr: "Limite en jours (vide = aucune)" },
  fCons: { en: "Best day at most % of the profit (empty = none)", ar: "أفضل يوم بحد أقصى % من الربح (فارغ = بلا شرط)", fr: "Meilleur jour au plus % du profit (vide = aucune)" },
  formNote: { en: "Use your firm's exact rules: these are only typical starting values.", ar: "استعمل قواعد شركتك بدقة: هذه قيم شائعة للبداية فقط.", fr: "Utilisez les règles exactes de votre société : ce ne sont que des valeurs typiques." },
  save: { en: "Save", ar: "حفظ", fr: "Enregistrer" },
  invalid: { en: "Check the highlighted fields.", ar: "تحقّق من الحقول المحددة.", fr: "Vérifiez les champs signalés." },
  kindProp: { en: "Prop-firm challenge", ar: "تحدي شركة تمويل", fr: "Challenge de prop firm" },
  kindPropD: { en: "Your evaluation, with your firm's rules.", ar: "تقييمك لدى الشركة، بقواعدها.", fr: "Votre évaluation, avec les règles de votre société." },
  kindSelf: { en: "Challenge myself", ar: "أتحدّى نفسي", fr: "Me lancer un défi" },
  kindSelfD: { en: "My own account on prop-firm rules, from my real balance.", ar: "حسابي الشخصي بقواعد شركات التمويل، من رصيدي الحقيقي.", fr: "Mon propre compte aux règles des prop firms, depuis mon solde réel." },
  self: { en: "Personal", ar: "شخصي", fr: "Personnel" },
  attemptN: { en: "attempt {n}", ar: "المحاولة {n}", fr: "tentative {n}" },
  selfName: { en: "Personal challenge", ar: "تحدٍّ شخصي", fr: "Défi personnel" },
  selfFailed: { en: "At a prop firm, this account would have been closed here.", ar: "في شركة تمويل كان هذا الحساب سيُغلق هنا.", fr: "Dans une prop firm, ce compte aurait été clôturé ici." },
  selfPassed: { en: "You're ready for a real prop-firm challenge.", ar: "أنت جاهز لتحدٍّ حقيقي لدى شركة تمويل.", fr: "Vous êtes prêt pour un vrai challenge de prop firm." },
  retry: { en: "New attempt", ar: "محاولة جديدة", fr: "Nouvelle tentative" },
  retryToday: { en: "Same rules, from today's opening balance.", ar: "بالقواعد نفسها، من رصيد بداية اليوم.", fr: "Mêmes règles, depuis le solde d'ouverture du jour." },
  retryTomorrow: { en: "Same rules, from tomorrow: today is a rest day.", ar: "بالقواعد نفسها، ابتداءً من الغد: اليوم استراحة.", fr: "Mêmes règles, dès demain : aujourd'hui, repos." },
  starts: { en: "Starts {d}", ar: "يبدأ في {d}", fr: "Commence le {d}" },
  pending: { en: "Starts on {d}: trades from that day count.", ar: "يبدأ في {d}: تُحتسب الصفقات ابتداءً من ذلك اليوم.", fr: "Commence le {d} : les trades comptent à partir de ce jour." },
  noteSelf: { en: "Closed trades only, by the broker's day. Deposits and withdrawals count as neither profit nor loss.", ar: "على الصفقات المغلقة فقط، بحسب يوم الوسيط. الإيداع والسحب لا يُحتسبان ربحاً ولا خسارة.", fr: "Trades clôturés uniquement, par jour du courtier. Dépôts et retraits ne comptent ni en gain ni en perte." },
  startBal: { en: "Starting balance", ar: "رصيد البداية", fr: "Solde de départ" },
  balAuto: { en: "Your balance at the start of {d}", ar: "رصيدك في بداية {d}", fr: "Votre solde au début du {d}" },
  formNoteSelf: { en: "Typical prop-firm rules: make them as strict as you like.", ar: "قواعد شائعة لدى شركات التمويل: شدّدها كما تشاء.", fr: "Règles typiques des prop firms : durcissez-les à votre guise." },
} satisfies Record<string, L3>;

const KEY = "mizan-challenges";
const read = (): Challenge[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
export const readChallenges = read;
const write = (l: Challenge[]) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage blocked */ } };
/** Challenges in local storage (synced with the account by settingsSync); re-read when the window regains focus. */
function useChallenges() {
  const [list, setList] = useState<Challenge[]>(read);
  useEffect(() => { const f = () => window.setTimeout(() => setList(read()), 1500); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  return [list, (next: Challenge[]) => { setList(next); write(next); }] as const;
}

export { todayFor };

function Card({ c, account, trades, lang, onEdit, onRemove, onRetry }: { c: Challenge; account: Account; trades: Trade[]; lang: Lang; onEdit: () => void; onRemove: () => void; onRetry: (start: string) => void }) {
  const L = (x: L3) => x[lang];
  const today = todayFor(account);
  const s = useMemo(() => challengeState(c, trades, today), [c, trades, today]);
  const self = c.kind === "self", pending = c.start > today;
  const [ask, setAsk] = useState(false);
  const cur = account.currency;
  const m = (v: number, sign = false) => fmtMoney(v, { sign, currency: cur });
  const tx = (v: string) => (lang === "ar" ? ltrNumbers(v) : v);
  // chance to pass from the current balance, replaying the account's own trading days (as Charts › Prop rules does)
  const odds = useMemo(() => {
    if (s.status !== "active" || !c.target || !s.target) return null;
    const bal = s.balance, goalLevel = c.size + s.target.amount;
    const dailyMoney = s.today ? s.today.limit : null, floor = s.maxLoss?.floor ?? null;
    const own = trades.filter((t) => t.accountId === c.accountId);
    const locked = c.trailing && c.trailLock && floor != null && floor >= c.size - 1e-9;
    return propOdds(own, bal, { dailyLossPct: dailyMoney != null ? (dailyMoney / bal) * 100 : 0, maxDDPct: floor != null ? ((bal - floor) / bal) * 100 : 0, targetPct: ((goalLevel - bal) / bal) * 100, trailing: c.trailing && !locked },
      { horizon: s.daysLeft != null ? Math.max(1, Math.round((s.daysLeft * 5) / 7)) : 250 });
  }, [s, c, trades]);

  const pill = s.status === "passed" ? ["border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]", <Check key="i" size={13} />] : s.status === "failed" ? ["border-[#f87171]/40 bg-[#f87171]/10 text-[#f87171]", <X key="i" size={13} />]
    : ["border-border text-text", <span key="i" className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-[var(--icon)] opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--icon)]" /></span>];
  const first = s.breaches[0];
  const banner = pending ? [fill(L(T.pending), { d: dayLabel(c.start, lang) }), "border-[var(--icon)] bg-primary-tint"]
    : s.status === "failed" && first
    ? [(first.rule === "daily" ? fill(L(T.failedDaily), { d: dayLabel(first.day, lang), v: m(first.value), l: m(first.limit) }) : first.rule === "max" ? fill(L(T.failedMax), { d: dayLabel(first.day, lang), v: m(first.value), l: m(first.limit) }) : fill(L(T.failedTime), { d: dayLabel(first.day, lang), l: first.limit })) + (self ? ` ${L(T.selfFailed)}` : ""), "border-[#f87171]/50 bg-[#f87171]/10"]
    : s.status === "passed" && s.passedOn ? [fill(L(T.passedOn), { d: dayLabel(s.passedOn, lang) }) + (self ? ` ${L(T.selfPassed)}` : ""), "border-[#22c55e]/50 bg-[#22c55e]/10"]
      : s.waiting.length ? [s.waiting.includes("days") ? fill(L(T.waitDays), { n: c.minDays - s.tradingDays, m: c.minDays }) : fill(L(T.waitCons), { p: Math.round((s.consistency?.share ?? 0) * 100), m: c.consistency ?? 0 }), "border-[var(--icon)] bg-primary-tint"]
        : s.risk ? [s.risk.amount <= 0 ? L(T.riskZero) : fill(L(s.risk.rule === "daily" ? T.riskDaily : T.riskMax), { m: m(s.risk.amount) }), s.risk.amount <= 0 || (s.risk.rule === "daily" ? s.today?.used ?? 0 : s.maxLoss?.used ?? 0) >= 0.8 ? "border-[#f87171]/50 bg-[#f87171]/10" : "border-[var(--icon)] bg-primary-tint"] : null;

  return (
    <article className="ch-card rounded-2xl border border-border p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-icon">{self ? <Mountain size={18} /> : <Flag size={18} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="font-heading text-base font-semibold">{account.name} · {c.name}</h3>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${pill[0]}`}>{pill[1]}{L(T[s.status])}</span>
            {self && <span className="tone-sky tone-chip inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"><UserRound size={12} />{tx(`${L(T.self)}${(c.attempt ?? 1) > 1 ? ` · ${fill(L(T.attemptN), { n: c.attempt as number })}` : ""}`)}</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted">{tx(pending ? `${fill(L(T.starts), { d: dayLabel(c.start, lang) })} · ${m(c.size)}` : `${fill(L(T.started), { d: dayLabel(c.start, lang) })} · ${c.limitDays ? fill(L(T.dayNofM), { n: s.daysUsed, m: c.limitDays }) : fill(L(T.dayN), { n: s.daysUsed })} · ${m(c.size)}`)}</p>
        </div>
        {!ask && (
          <div className="flex gap-1.5">
            <button type="button" onClick={onEdit} aria-label={L(T.edit)} title={L(T.edit)} className="icon-btn !h-8 !w-8 border border-border"><Pencil size={14} /></button>
            <button type="button" onClick={() => setAsk(true)} aria-label={L(T.remove)} title={L(T.remove)} className="icon-btn !h-8 !w-8 border border-border text-[#f87171]"><Trash2 size={14} /></button>
          </div>
        )}
      </div>
      {ask && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
          <span className="me-auto">{L(T.confirmRemove)}</span>
          <button type="button" onClick={() => setAsk(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">{L(T.cancel)}</button>
          <button type="button" onClick={onRemove} className="rounded-lg bg-loss px-3 py-1.5 text-xs font-semibold text-white">{L(T.remove)}</button>
        </div>
      )}

      {banner && <p className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${banner[1]}`}>{tx(banner[0])}</p>}
      {self && !pending && s.status === "failed" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={() => onRetry(retryStart(s, today))} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"><RotateCcw size={15} />{L(T.retry)}</button>
          <span className="text-xs text-muted">{L(retryStart(s, today) > today ? T.retryTomorrow : T.retryToday)}</span>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted">{L(T.target)}</p>
          {s.target ? (
            <>
              <p className={`mt-1 text-lg font-semibold tnum ${s.pnl >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}`} dir="ltr">{m(s.pnl, true)} <span className="text-sm font-medium text-muted">/ {m(s.target.amount)}</span></p>
              <Bar value={s.status === "passed" ? 1 : s.target.progress} color="var(--profit)" />
              <p className="mt-1.5 text-xs text-muted">{s.status === "passed" || s.target.left <= 0 ? L(T.reached) : tx(fill(L(T.toGo), { p: Math.round(s.target.progress * 100), m: m(s.target.left) }))}</p>
            </>
          ) : <p className="mt-1 text-sm text-muted">{L(T.noTarget)}</p>}
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted">{L(T.daily)}</p>
          {s.today ? (
            <>
              <p className={`mt-1 text-lg font-semibold tnum ${s.today.pnl > 0 ? "text-[#22c55e]" : s.today.pnl < 0 ? "text-[#f87171]" : ""}`} dir="ltr">{m(s.today.pnl, true)}</p>
              <Bar value={s.today.used} color={dangerColor(s.today.used)} />
              <p className="mt-1.5 text-xs text-muted">{tx(`${fill(L(T.used), { u: m(Math.max(0, -s.today.pnl)), l: m(s.today.limit) })} · ${fill(L(T.room), { m: m(s.today.room) })}`)}</p>
            </>
          ) : <p className="mt-1 text-sm text-muted">{L(T.none)}</p>}
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted">{L(T.overall)}{c.trailing && c.max != null && <span className="rounded-full border border-border px-1.5 text-[10px]">{L(T.trailing)}</span>}</p>
          {s.maxLoss ? (
            <>
              <p className="mt-1 text-lg font-semibold tnum" dir="ltr">{m(s.maxLoss.room)}</p>
              <Bar value={s.maxLoss.used} color={dangerColor(s.maxLoss.used)} />
              <p className="mt-1.5 text-xs text-muted">{tx(`${fill(L(T.room), { m: m(s.maxLoss.room) })} · ${fill(L(T.floor), { m: m(s.maxLoss.floor) })}`)}</p>
            </>
          ) : <p className="mt-1 text-sm text-muted">{L(T.none)}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{L(T.days)}</span>
          {c.minDays > 0 && c.minDays <= 12 ? (
            <span className="flex gap-1" aria-label={fill(L(T.ofMin), { n: s.tradingDays, m: c.minDays })}>{Array.from({ length: c.minDays }, (_, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < s.tradingDays ? "bg-[var(--icon)]" : "border border-border"}`} />)}</span>
          ) : null}
          <span className="font-semibold">{c.minDays > 0 ? tx(fill(L(s.tradingDays >= c.minDays ? T.minMet : T.ofMin), { n: s.tradingDays, m: c.minDays })) : s.tradingDays}</span>
        </div>
        {s.consistency && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{L(T.best)}</span>
            <span className={`font-semibold ${s.consistency.ok ? "" : "text-[#f59e0b]"}`}>{tx(fill(L(T.share), { p: Math.round(s.consistency.share * 100), m: c.consistency ?? 0 }))}</span>
          </div>
        )}
        {odds && (
          <div className="flex items-center gap-2" title={L(T.oddsHint)}>
            <span className="text-xs text-muted">{L(T.odds)}</span>
            <span className="font-semibold tnum">{Math.round(odds.pass)}%</span>
            <span className="text-xs text-muted">{tx(fill(L(T.oddsSub), { f: Math.round(odds.fail), o: Math.round(odds.open) }) + (odds.medianDays != null ? fill(L(T.oddsDays), { n: odds.medianDays }) : ""))}</span>
          </div>
        )}
      </div>

      <BalanceChart size={c.size} goal={c.target != null ? c.size * (1 + c.target / 100) : null} floor={s.maxLoss?.floor ?? null} start={c.start} rows={s.days.map((r) => ({ day: r.day, pnl: r.pnl, end: r.end, floor: r.floor, bad: r.breach.length > 0 }))} money={(v) => m(v)} lang={lang} label={L(T.balance)} />

      {s.daysToTarget != null && s.avgDay != null && <p className="mt-2 text-xs text-muted">{tx(fill(L(T.pace), { m: m(s.avgDay, true), n: s.daysToTarget }))}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">{L(self ? T.noteSelf : T.note)}{odds ? ` ${L(T.oddsHint)}` : ""}</p>
    </article>
  );
}

type Kind = "prop" | "self" | "own";
type Draft = { kind: Kind; sizeAuto: boolean; attempt?: number; accountId: string; tpl: keyof typeof TEMPLATES | "custom"; name: string; size: string; start: string; target: string; daily: string; dailyBase: "size" | "dayStart"; max: string; trailing: boolean; trailLock: boolean; minDays: string; limitDays: string; consistency: string; own: OwnDraft };
const s2 = (v: number | null | undefined) => (v == null ? "" : String(v));
const fromChallenge = (c: Challenge): Draft => ({ kind: c.kind === "self" || c.kind === "own" ? c.kind : "prop", sizeAuto: !!c.sizeAuto, attempt: c.attempt, accountId: c.accountId, tpl: "custom", name: c.name, size: String(c.size), start: c.start, target: s2(c.target), daily: s2(c.daily), dailyBase: c.dailyBase, max: s2(c.max), trailing: c.trailing, trailLock: c.trailLock, minDays: String(c.minDays), limitDays: s2(c.limitDays), consistency: s2(c.consistency), own: toDraft(c.ownNext?.rules ?? c.own ?? NO_OWN) });
const r2 = (v: number) => Math.round(v * 100) / 100;
const KINDS: { k: Kind; icon: typeof Flag; title: L3; sub: L3 }[] = [
  { k: "prop", icon: Building2, title: T.kindProp, sub: T.kindPropD },
  { k: "self", icon: Mountain, title: T.kindSelf, sub: T.kindSelfD },
  { k: "own", icon: SlidersHorizontal, title: OT.kind, sub: OT.kindD },
];

function Form({ lang, accounts, trades, balances, flows, initial, kind, onSave, onClose }: { lang: Lang; accounts: Account[]; trades: Trade[]; balances: Record<string, BalancePoint[]>; flows: CashFlow[]; initial: Challenge | null; kind: Kind; onSave: (c: Challenge) => void; onClose: () => void }) {
  const L = (x: L3) => x[lang];
  const tx = (v: string) => (lang === "ar" ? ltrNumbers(v) : v);
  const panel = useRef<HTMLDivElement>(null);
  const tplName = (k: keyof typeof TEMPLATES) => ({ twoStep1: "Phase 1", twoStep2: "Phase 2", oneStep: "1-step", funded: "Funded" })[k];
  const applyTpl = (d: Draft, k: keyof typeof TEMPLATES): Draft => { const t = TEMPLATES[k]; return { ...d, tpl: k, name: d.kind === "prop" ? tplName(k) : d.name, target: s2(t.target), daily: s2(t.daily), dailyBase: t.dailyBase, max: s2(t.max), trailing: t.trailing, trailLock: t.trailLock, minDays: String(t.minDays), limitDays: s2(t.limitDays), consistency: s2(t.consistency) }; };
  const [d, setD] = useState<Draft>(() => {
    if (initial) return fromChallenge(initial);
    const a = accounts[0];
    const base = applyTpl({ kind, sizeAuto: kind !== "prop", accountId: a.id, tpl: "twoStep1", name: "", size: String(a.startBalance > 0 ? a.startBalance : 100000), start: todayFor(a), target: "", daily: "", dailyBase: "size", max: "", trailing: false, trailLock: true, minDays: "0", limitDays: "", consistency: "", own: toDraft(NO_OWN) }, "twoStep1");
    return { ...base, name: kind === "self" ? L(T.selfName) : kind === "own" ? L(OT.name) : base.name };
  });
  // a personal challenge starts from the account's real balance at the start of its first day
  const acc = accounts.find((x) => x.id === d.accountId);
  const auto = acc && /^\d{4}-\d{2}-\d{2}$/.test(d.start) ? r2(balanceBefore(acc, trades, d.start, balances[acc.id], flows)) : 0;
  const useAuto = d.kind !== "prop" && d.sizeAuto && auto > 0;
  const size = useAuto ? String(auto) : d.size;
  const isDefaultName = (n: string) => !n.trim() || ["Phase 1", "Phase 2", "1-step", "Funded"].includes(n) || Object.values(T.selfName).includes(n) || Object.values(OT.name).includes(n);
  const setKind = (k: Kind) => {
    if (k === d.kind) return;
    const name = isDefaultName(d.name) ? (k === "self" ? L(T.selfName) : k === "own" ? L(OT.name) : d.tpl === "custom" ? "" : tplName(d.tpl)) : d.name;
    setD(k === "prop" ? { ...d, kind: k, sizeAuto: false, size: acc && acc.startBalance > 0 ? String(acc.startBalance) : d.size, name } : { ...d, kind: k, sizeAuto: true, name });
  };
  const symbols = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of trades) if (t.accountId === d.accountId) n.set(t.symbol, (n.get(t.symbol) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [trades, d.accountId]);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const pct = (v: string, opt: boolean) => { const n = num(v); return n == null ? opt : Number.isFinite(n) && n > 0 && n < 100; };
  const int = (v: string, opt: boolean) => { const n = num(v); return n == null ? opt : Number.isInteger(n) && n >= 0 && n <= 3650; };
  const own = d.kind === "own" ? fromDraft(d.own) : null, prop = d.kind !== "own";
  const bad = {
    name: !d.name.trim(), size: !(Number(num(size)) > 0), start: !/^\d{4}-\d{2}-\d{2}$/.test(d.start), target: prop && !pct(d.target, true), daily: prop && !pct(d.daily, true), max: prop && !pct(d.max, true),
    minDays: prop && !int(d.minDays, true), limitDays: prop && (!int(d.limitDays, true) || num(d.limitDays) === 0), consistency: prop && !pct(d.consistency, true),
    own: !!own && (own.bad.size > 0 || !hasRule(own.rules)),
  };
  const ok = !Object.values(bad).some(Boolean);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!ok) return;
    const base = { id: initial?.id ?? crypto.randomUUID(), accountId: d.accountId, name: d.name.trim(), start: d.start, size: Number(num(size)) };
    if (own) {
      // the rule lock: what tightens counts now; what loosens waits a day, with the stricter of both meanwhile. Times on the
      // broker's clock; trades before a change keep the rules they were made under (ownPast).
      const now = nowFor(acc), next = own.rules, kept = initial?.kind === "own" && initial.start === d.start && initial.accountId === d.accountId;
      const old = kept && initial ? rulesAt(initial, now) : null, same = (a: OwnRules, b: OwnRules) => JSON.stringify(tidy(a)) === JSON.stringify(tidy(b));
      const later = !!old && loosens(old, next, base.size);
      const from = initial?.ownNext && same(initial.ownNext.rules, next) ? initial.ownNext.from : new Date(Date.parse(`${now}Z`) + 864e5).toISOString().slice(0, 16);
      const inForce = later && old ? stricter(old, next, base.size) : next;
      const past = kept && initial && old && !same(old, inForce) ? [...(initial.ownPast ?? []), { until: now, rules: old }].slice(-20) : kept ? initial?.ownPast : undefined;
      onSave({
        ...base, target: null, daily: null, dailyBase: "size", max: null, trailing: false, trailLock: true, minDays: 0, limitDays: null, consistency: null,
        kind: "own", ...(useAuto ? { sizeAuto: true } : {}), ...(d.attempt ? { attempt: d.attempt } : {}),
        own: inForce, ...(later ? { ownNext: { rules: next, from } } : {}), ...(past?.length ? { ownPast: past } : {}), ...(initial?.signed ? { signed: initial.signed } : {}),
      });
      return;
    }
    onSave({
      ...base, target: num(d.target), daily: num(d.daily), dailyBase: d.dailyBase,
      max: num(d.max), trailing: d.trailing && num(d.max) != null, trailLock: d.trailLock, minDays: num(d.minDays) ?? 0, limitDays: num(d.limitDays), consistency: num(d.consistency),
      ...(d.kind === "self" ? { kind: "self" as const, ...(useAuto ? { sizeAuto: true } : {}), ...(d.attempt ? { attempt: d.attempt } : {}) } : {}),
    });
  };
  const field = (k: keyof typeof bad) => `field ${tried && bad[k] ? "!border-[var(--loss)]" : ""}`;
  const lbl = "flex flex-col gap-1.5 text-sm font-medium";
  const firstTrade = (id: string) => trades.filter((t) => t.accountId === id && t.entryTime).map((t) => (t.entryTime as string).slice(0, 10)).sort()[0];
  // on document.body: the page sits in a transformed container, which would pin a fixed overlay to the content area
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ch-form-title" className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-border bg-surface p-6 outline-none ${d.kind === "own" ? "max-w-2xl" : "max-w-xl"}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="ch-form-title" className="font-heading text-xl font-semibold">{L(initial ? T.formEdit : T.formNew)}</h2>
          <button type="button" aria-label={L(T.cancel)} onClick={onClose} className="icon-btn -m-1.5"><X size={20} /></button>
        </div>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <div role="radiogroup" aria-label={L(T.formNew)} className="grid gap-2 sm:grid-cols-3">
            {KINDS.map(({ k, icon: Icon, title, sub }) => {
              const on = d.kind === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setKind(k)} className={`flex items-start gap-3 rounded-xl border p-3 text-start transition-colors ${on ? "border-[var(--icon)] bg-primary-tint" : "border-border hover:border-[var(--icon)]"}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${on ? "bg-primary text-on-primary" : "bg-primary-tint text-icon"}`}><Icon size={16} /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{L(title)}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{L(sub)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <label className={lbl}>{L(T.account)}
            <select className="field" value={d.accountId} onChange={(e) => { const a = accounts.find((x) => x.id === e.target.value); setD({ ...d, accountId: e.target.value, size: d.kind === "prop" && a && a.startBalance > 0 ? String(a.startBalance) : d.size }); }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          {prop && (
            <div className="flex flex-col gap-1.5 text-sm font-medium">{L(T.from)}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((k) => (
                  <button key={k} type="button" aria-pressed={d.tpl === k} onClick={() => setD(applyTpl(d, k))} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${d.tpl === k ? "border-[var(--icon)] bg-primary-tint text-primary" : "border-border text-muted hover:text-text"}`}>{L(T[k])}</button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={lbl}>{L(T.name)}<input className={field("name")} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value, tpl: d.tpl })} /></label>
            <div className="flex flex-col gap-1.5">
              <label className={lbl}>{L(d.kind !== "prop" ? T.startBal : T.size)}<input className={field("size")} inputMode="decimal" dir="ltr" value={size} onChange={(e) => setD({ ...d, size: e.target.value, sizeAuto: false })} /></label>
              {d.kind !== "prop" && auto > 0 && (useAuto
                ? <span className="text-xs text-muted">{tx(`✓ ${fill(L(T.balAuto), { d: dayLabel(d.start, lang) })}`)}</span>
                : <button type="button" onClick={() => setD({ ...d, sizeAuto: true })} className="self-start text-start text-xs font-semibold text-icon hover:underline">{tx(`↺ ${fill(L(T.balAuto), { d: dayLabel(d.start, lang) })}: ${fmtMoney(auto, { currency: acc?.currency ?? null })}`)}</button>)}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={lbl}>{L(T.start)}<DateInput className={field("start")} value={d.start} onChange={(v) => setD({ ...d, start: v })} calendarLabel={L(T.calendar)} /></label>
              {firstTrade(d.accountId) && firstTrade(d.accountId) < d.start && <button type="button" onClick={() => setD({ ...d, start: firstTrade(d.accountId) })} className="self-start text-xs font-semibold text-icon hover:underline"><span dir="ltr">↺ {dayFirst(firstTrade(d.accountId))}</span></button>}
            </div>
            {prop && (
              <>
                <label className={lbl}>{L(T.fTarget)}<input className={field("target")} inputMode="decimal" dir="ltr" value={d.target} onChange={(e) => setD({ ...d, target: e.target.value, tpl: "custom" })} /></label>
                <div className="flex flex-col gap-1.5">
                  <label className={lbl}>{L(T.fDaily)}<input className={field("daily")} inputMode="decimal" dir="ltr" value={d.daily} onChange={(e) => setD({ ...d, daily: e.target.value, tpl: "custom" })} /></label>
                  <select className="field" aria-label={`${L(T.fDaily)}: ${L(T.ofSize)} / ${L(T.ofDay)}`} value={d.dailyBase} onChange={(e) => setD({ ...d, dailyBase: e.target.value as Draft["dailyBase"], tpl: "custom" })}>
                    <option value="size">{L(T.ofSize)}</option><option value="dayStart">{L(T.ofDay)}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={lbl}>{L(T.fMax)}<input className={field("max")} inputMode="decimal" dir="ltr" value={d.max} onChange={(e) => setD({ ...d, max: e.target.value, tpl: "custom" })} /></label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[var(--icon)]" checked={d.trailing} onChange={(e) => setD({ ...d, trailing: e.target.checked, tpl: "custom" })} />{L(T.fTrailing)}</label>
                  {d.trailing && <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[var(--icon)]" checked={d.trailLock} onChange={(e) => setD({ ...d, trailLock: e.target.checked, tpl: "custom" })} />{L(T.fLock)}</label>}
                </div>
                <label className={lbl}>{L(T.fMinDays)}<input className={field("minDays")} inputMode="numeric" dir="ltr" value={d.minDays} onChange={(e) => setD({ ...d, minDays: e.target.value, tpl: "custom" })} /></label>
                <label className={lbl}>{L(T.fLimit)}<input className={field("limitDays")} inputMode="numeric" dir="ltr" value={d.limitDays} onChange={(e) => setD({ ...d, limitDays: e.target.value, tpl: "custom" })} /></label>
                <label className={`${lbl} sm:col-span-2`}>{L(T.fCons)}<input className={field("consistency")} inputMode="decimal" dir="ltr" value={d.consistency} onChange={(e) => setD({ ...d, consistency: e.target.value, tpl: "custom" })} /></label>
              </>
            )}
          </div>
          {own && <OwnFields lang={lang} d={d.own} set={(o) => setD({ ...d, own: o })} bad={own.bad} tried={tried} cur={acc?.currency ?? null} size={Number(num(size)) || 0} symbols={symbols} />}
          <p className="text-xs text-muted">{L(d.kind === "own" ? OT.lockNote : d.kind === "self" ? T.formNoteSelf : T.formNote)}</p>
          {tried && !ok && <p className="text-sm text-loss" role="alert">{L(own && !hasRule(own.rules) && own.bad.size === 0 ? OT.needRule : T.invalid)}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted hover:text-text">{L(T.cancel)}</button>
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">{L(T.save)}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

const NONE: never[] = [], NO_POINTS: Record<string, BalancePoint[]> = {};
export default function ChallengeView({ lang, accounts, trades, balances = NO_POINTS, flows = NONE, onOpenProfile }: { lang: Lang; accounts: Account[]; trades: Trade[]; balances?: Record<string, BalancePoint[]>; flows?: CashFlow[]; onOpenProfile?: () => void }) {
  const L = (x: L3) => x[lang];
  const [list, setList] = useChallenges();
  const [editing, setEditing] = useState<Challenge | Kind | null>(null);
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const shown = list.filter((c) => byId.has(c.accountId));
  const startBal = (a: Account, day: string) => r2(balanceBefore(a, trades, day, balances[a.id], flows));
  const profileName = useMemo(() => { try { const n = JSON.parse(localStorage.getItem("mizan-profile") ?? "{}")?.name; return typeof n === "string" ? n : ""; } catch { return ""; } }, []);
  // personal challenges keep the real balance at the start of their first day (trades synced late, flows recorded later)
  useEffect(() => {
    if (!trades.length) return;
    let changed = false;
    const next = list.map((c) => {
      const a = byId.get(c.accountId);
      let x = c;
      if (x.ownNext && a && x.ownNext.from <= nowFor(a)) { // a loosened set whose day came: the stricter one becomes the past
        const { ownNext, ...rest } = x;
        x = { ...rest, own: ownNext.rules, ownPast: [...(x.ownPast ?? []), ...(x.own ? [{ until: ownNext.from, rules: x.own }] : [])].slice(-20) };
        changed = true;
      }
      if ((x.kind !== "self" && x.kind !== "own") || !x.sizeAuto || !a) return x;
      const v = startBal(a, x.start);
      if (!(v > 0) || Math.abs(v - x.size) < 0.005) return x;
      changed = true;
      return { ...x, size: v };
    });
    if (changed) setList(next);
  }, [list, trades, balances, flows, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  // a new attempt after a failure: the same rules under a new id (its Telegram warnings start over), from its balance then
  const retry = (c: Challenge, start: string) => {
    const a = byId.get(c.accountId), v = a ? startBal(a, start) : 0;
    setList(list.map((x) => (x.id === c.id ? { ...c, id: crypto.randomUUID(), start, size: v > 0 ? v : c.size, sizeAuto: v > 0, attempt: (c.attempt ?? 1) + 1 } : x)));
  };
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold">{L(T.title)}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{L(T.lead)}</p>
          {onOpenProfile && shown.length > 0 && <button type="button" onClick={onOpenProfile} className="mt-1.5 text-xs font-semibold text-icon hover:underline">{L(T.telegram)}</button>}
        </div>
        {accounts.length > 0 && shown.length > 0 && (
          <button type="button" onClick={() => setEditing("prop")} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"><Plus size={16} />{L(T.new)}</button>
        )}
      </header>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-tint text-icon"><Flag size={22} /></span>
          <p className="font-heading text-lg font-semibold">{L(T.emptyTitle)}</p>
          <p className="max-w-md text-sm text-muted">{accounts.length ? L(T.emptyText) : L(T.noAccounts)}</p>
          {accounts.length > 0 && (
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setEditing("prop")} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"><Building2 size={16} />{L(T.kindProp)}</button>
              <button type="button" onClick={() => setEditing("self")} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--icon)] px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-tint"><Mountain size={16} />{L(T.kindSelf)}</button>
              <button type="button" onClick={() => setEditing("own")} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--icon)] px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-tint"><SlidersHorizontal size={16} />{L(OT.kind)}</button>
            </div>
          )}
        </div>
      ) : (
        shown.map((c) => (c.kind === "own"
          ? <OwnCard key={c.id} c={c} account={byId.get(c.accountId) as Account} trades={trades} lang={lang} profileName={profileName} onEdit={() => setEditing(c)} onRemove={() => setList(list.filter((x) => x.id !== c.id))} onChange={(n) => setList(list.map((x) => (x.id === c.id ? n : x)))} onRetry={(start) => retry(c, start)} />
          : <Card key={c.id} c={c} account={byId.get(c.accountId) as Account} trades={trades} lang={lang} onEdit={() => setEditing(c)} onRemove={() => setList(list.filter((x) => x.id !== c.id))} onRetry={(start) => retry(c, start)} />
        ))
      )}
      {editing && accounts.length > 0 && (
        <Form lang={lang} accounts={accounts} trades={trades} balances={balances} flows={flows} initial={typeof editing === "string" ? null : editing} kind={typeof editing === "string" ? editing : "prop"} onClose={() => setEditing(null)}
          onSave={(c) => { setList(typeof editing === "string" ? [c, ...list] : list.map((x) => (x.id === c.id ? c : x))); setEditing(null); }} />
      )}
    </section>
  );
}
