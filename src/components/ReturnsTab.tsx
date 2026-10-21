import { useState } from "react";
import { Banknote, CalendarCheck, TrendingUp } from "lucide-react";
import { fmt } from "../lib/stats";
import type { ReturnsCapital, RcWhy } from "../lib/returnsCapital";
import { usePrivacy } from "../usePrivacy";
import { GREEN, RED } from "./dashWidgets";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import type { Lang } from "../types";

type L = [string, string, string]; // en, ar, fr
type M = [string, L, L]; // id, label, tip
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const RET_TAB: L = ["Returns & capital", "العوائد ورأس المال", "Rendements & capital"];
const TXT = {
  sub: ["Returns, capital flows and period consistency for the selected period.", "العوائد والتدفقات المالية وانتظام الفترات خلال الفترة المختارة.", "Rendements, flux de capital et régularité des périodes."] as L,
  soon: ["Coming soon", "قريباً", "Bientôt"] as L,
  tipSoon: ["Not available yet.", "غير متاح بعد.", "Pas encore disponible."] as L,
  s1: ["Returns", "العوائد", "Rendements"] as L,
  s1d: ["Profit and return across the selected period.", "الربح والعائد خلال الفترة المختارة.", "Profit et rendement sur la période choisie."] as L,
  s2: ["Capital & cash flow", "رأس المال والتدفقات", "Capital & flux de trésorerie"] as L,
  s2d: ["Balance, equity, and external account flows.", "الرصيد وحقوق الملكية والتدفقات الخارجية للحساب.", "Solde, equity et flux externes du compte."] as L,
  s3: ["Period consistency", "انتظام الفترات", "Régularité des périodes"] as L,
  s3d: ["How consistently the account produces profitable periods.", "مدى انتظام الحساب في إنتاج فترات رابحة.", "Régularité avec laquelle le compte produit des périodes rentables."] as L,
};
const S1: M[] = [
  ["net", ["Net profit", "صافي الربح", "Profit net"], ["Total profit after costs.", "إجمالي الربح بعد التكاليف.", "Profit total après coûts."]],
  ["gp", ["Gross profit", "إجمالي الربح", "Profit brut"], ["Sum of all winning trades.", "مجموع الصفقات الرابحة.", "Somme des trades gagnants."]],
  ["gl", ["Gross loss", "إجمالي الخسارة", "Perte brute"], ["Sum of all losing trades.", "مجموع الصفقات الخاسرة.", "Somme des trades perdants."]],
  ["tr", ["Total return", "العائد الإجمالي", "Rendement total"], ["Net profit as a percentage of the starting balance.", "صافي الربح كنسبة من الرصيد الابتدائي.", "Profit net en % du solde initial."]],
  ["twr", ["Time-weighted return", "العائد المرجّح زمنياً", "Rendement pondéré par le temps"], ["Return that removes the effect of deposits and withdrawals.", "عائد يزيل أثر الإيداعات والسحوبات.", "Rendement neutralisant dépôts et retraits."]],
  ["ann", ["Annualised return", "العائد السنوي", "Rendement annualisé"], ["Return scaled to a one-year period.", "العائد محوّلاً إلى سنة كاملة.", "Rendement ramené à un an."]],
  ["adr", ["Average daily return", "متوسط العائد اليومي", "Rendement quotidien moyen"], ["Average return per trading day.", "متوسط العائد لكل يوم تداول.", "Rendement moyen par jour."]],
  ["awr", ["Average weekly return", "متوسط العائد الأسبوعي", "Rendement hebdomadaire moyen"], ["Average return per week.", "متوسط العائد لكل أسبوع.", "Rendement moyen par semaine."]],
  ["amr", ["Average monthly return", "متوسط العائد الشهري", "Rendement mensuel moyen"], ["Average return per month.", "متوسط العائد لكل شهر.", "Rendement moyen par mois."]],
  ["adp", ["Average daily P&L", "متوسط الربح/الخسارة اليومي", "P&L quotidien moyen"], ["Average profit or loss per trading day.", "متوسط الربح أو الخسارة لكل يوم تداول.", "Profit ou perte moyen par jour."]],
  ["mdp", ["Median daily P&L", "وسيط الربح/الخسارة اليومي", "P&L quotidien médian"], ["Middle value of daily P&L.", "القيمة الوسطى للربح/الخسارة اليومي.", "Valeur médiane du P&L quotidien."]],
  ["sdp", ["Daily P&L standard deviation", "الانحراف المعياري للربح/الخسارة اليومي", "Écart-type du P&L quotidien"], ["Spread of daily P&L.", "تشتت الربح/الخسارة اليومي.", "Dispersion du P&L quotidien."]],
  ["awp", ["Average weekly P&L", "متوسط الربح/الخسارة الأسبوعي", "P&L hebdomadaire moyen"], ["Average profit or loss per week.", "متوسط الربح أو الخسارة لكل أسبوع.", "Profit ou perte moyen par semaine."]],
  ["amp", ["Average monthly P&L", "متوسط الربح/الخسارة الشهري", "P&L mensuel moyen"], ["Average profit or loss per month.", "متوسط الربح أو الخسارة لكل شهر.", "Profit ou perte moyen par mois."]],
  ["bd", ["Best day P&L", "أفضل يوم", "Meilleur jour"], ["Highest daily P&L.", "أعلى ربح/خسارة يومي.", "Meilleur P&L quotidien."]],
  ["wd", ["Worst day P&L", "أسوأ يوم", "Pire jour"], ["Lowest daily P&L.", "أدنى ربح/خسارة يومي.", "Pire P&L quotidien."]],
  ["bw", ["Best week P&L", "أفضل أسبوع", "Meilleure semaine"], ["Highest weekly P&L.", "أعلى ربح/خسارة أسبوعي.", "Meilleur P&L hebdomadaire."]],
  ["ww", ["Worst week P&L", "أسوأ أسبوع", "Pire semaine"], ["Lowest weekly P&L.", "أدنى ربح/خسارة أسبوعي.", "Pire P&L hebdomadaire."]],
  ["bm", ["Best month P&L", "أفضل شهر", "Meilleur mois"], ["Highest monthly P&L.", "أعلى ربح/خسارة شهري.", "Meilleur P&L mensuel."]],
  ["wm", ["Worst month P&L", "أسوأ شهر", "Pire mois"], ["Lowest monthly P&L.", "أدنى ربح/خسارة شهري.", "Pire P&L mensuel."]],
];
const S2: M[] = [
  ["init", ["Initial balance", "الرصيد الأولي", "Solde initial"], ["Balance when the account was opened.", "الرصيد عند فتح الحساب.", "Solde à l'ouverture du compte."]],
  ["start", ["Starting balance", "رصيد البداية", "Solde de départ"], ["Balance at the start of the selected period.", "الرصيد في بداية الفترة المختارة.", "Solde au début de la période."]],
  ["cur", ["Current balance", "الرصيد الحالي", "Solde actuel"], ["Latest account balance.", "آخر رصيد للحساب.", "Dernier solde du compte."]],
  ["end", ["Ending balance", "رصيد النهاية", "Solde final"], ["Balance at the end of the selected period.", "الرصيد في نهاية الفترة المختارة.", "Solde à la fin de la période."]],
  ["hiBal", ["Highest balance", "أعلى رصيد", "Solde le plus haut"], ["Peak balance reached.", "أعلى رصيد تم بلوغه.", "Solde maximal atteint."]],
  ["sEq", ["Starting equity", "حقوق الملكية في البداية", "Equity de départ"], ["Equity at the start of the period.", "حقوق الملكية في بداية الفترة.", "Equity au début de la période."]],
  ["cEq", ["Current equity", "حقوق الملكية الحالية", "Equity actuelle"], ["Latest equity including open trades.", "آخر حقوق ملكية شاملة الصفقات المفتوحة.", "Dernière equity incluant les trades ouverts."]],
  ["eEq", ["Ending equity", "حقوق الملكية في النهاية", "Equity finale"], ["Equity at the end of the period.", "حقوق الملكية في نهاية الفترة.", "Equity à la fin de la période."]],
  ["hiEq", ["Highest equity", "أعلى حقوق ملكية", "Equity la plus haute"], ["Peak equity reached.", "أعلى حقوق ملكية تم بلوغها.", "Equity maximale atteinte."]],
  ["netDep", ["Net deposits", "صافي الإيداعات", "Dépôts nets"], ["Deposits minus withdrawals.", "الإيداعات ناقص السحوبات.", "Dépôts moins retraits."]],
  ["totDep", ["Total deposits", "إجمالي الإيداعات", "Total des dépôts"], ["Sum of all deposits.", "مجموع كل الإيداعات.", "Somme des dépôts."]],
  ["totWd", ["Total withdrawals", "إجمالي السحوبات", "Total des retraits"], ["Sum of all withdrawals.", "مجموع كل السحوبات.", "Somme des retraits."]],
  ["netFlow", ["Net external cash flow", "صافي التدفق النقدي الخارجي", "Flux externe net"], ["All money moved in or out of the account.", "كل الأموال الداخلة والخارجة من الحساب.", "Argent entré ou sorti du compte."]],
  ["credits", ["Credits and adjustments", "الائتمانات والتعديلات", "Crédits et ajustements"], ["Broker credits and balance adjustments.", "ائتمانات الوسيط وتعديلات الرصيد.", "Crédits courtier et ajustements."]],
  ["depN", ["Deposit count", "عدد الإيداعات", "Nombre de dépôts"], ["Number of deposits.", "عدد الإيداعات.", "Nombre de dépôts."]],
  ["wdN", ["Withdrawal count", "عدد السحوبات", "Nombre de retraits"], ["Number of withdrawals.", "عدد السحوبات.", "Nombre de retraits."]],
  ["credN", ["Credit or adjustment count", "عدد الائتمانات أو التعديلات", "Nombre de crédits ou ajustements"], ["Number of credits or adjustments.", "عدد الائتمانات أو التعديلات.", "Nombre de crédits ou ajustements."]],
  ["avgDep", ["Average deposit", "متوسط الإيداع", "Dépôt moyen"], ["Average deposit size.", "متوسط حجم الإيداع.", "Taille moyenne d'un dépôt."]],
  ["avgWd", ["Average withdrawal", "متوسط السحب", "Retrait moyen"], ["Average withdrawal size.", "متوسط حجم السحب.", "Taille moyenne d'un retrait."]],
];
const S3: M[] = [
  ["pDays", ["Profitable days", "الأيام الرابحة", "Jours gagnants"], ["Number of days closed in profit.", "عدد الأيام المغلقة بربح.", "Nombre de jours clôturés en profit."]],
  ["pDayPct", ["Profitable-day percentage", "نسبة الأيام الرابحة", "% de jours gagnants"], ["Profitable days ÷ trading days.", "الأيام الرابحة ÷ أيام التداول.", "Jours gagnants ÷ jours de trading."]],
  ["dWin", ["Daily win rate", "نسبة الربح اليومية", "Taux de gain quotidien"], ["Share of days with a positive result.", "نسبة الأيام ذات النتيجة الموجبة.", "Part des jours positifs."]],
  ["pWeeks", ["Profitable weeks", "الأسابيع الرابحة", "Semaines gagnantes"], ["Number of weeks closed in profit.", "عدد الأسابيع المغلقة بربح.", "Nombre de semaines en profit."]],
  ["pMonths", ["Profitable months", "الأشهر الرابحة", "Mois gagnants"], ["Number of months closed in profit.", "عدد الأشهر المغلقة بربح.", "Nombre de mois en profit."]],
  ["posRet", ["Positive-return days", "أيام العائد الموجب", "Jours à rendement positif"], ["Days with a positive percentage return.", "الأيام ذات العائد النسبي الموجب.", "Jours avec rendement % positif."]],
  ["avgWinDay", ["Average winning day", "متوسط اليوم الرابح", "Jour gagnant moyen"], ["Average P&L of profitable days.", "متوسط ربح الأيام الرابحة.", "P&L moyen des jours gagnants."]],
  ["avgLossDay", ["Average losing day", "متوسط اليوم الخاسر", "Jour perdant moyen"], ["Average P&L of losing days.", "متوسط خسارة الأيام الخاسرة.", "P&L moyen des jours perdants."]],
  ["bigWin", ["Largest winning day contribution", "مساهمة أكبر يوم رابح", "Contribution du plus gros jour gagnant"], ["Share of total profit from the best day.", "حصة أفضل يوم من إجمالي الربح.", "Part du profit total du meilleur jour."]],
  ["bigLoss", ["Largest losing day contribution", "مساهمة أكبر يوم خاسر", "Contribution du plus gros jour perdant"], ["Share of total loss from the worst day.", "حصة أسوأ يوم من إجمالي الخسارة.", "Part de la perte totale du pire jour."]],
];

type Kind = "money" | "pct" | "int";
/** metric id -> [ReturnsCapital field, kind, signed]. Ids missing here have no stored data (equity, deposits, withdrawals, credits). */
const MAP: Record<string, [keyof ReturnsCapital, Kind, boolean]> = {
  net: ["net", "money", true], gp: ["gross", "money", false], gl: ["loss", "money", true], tr: ["totalReturn", "pct", true],
  adr: ["avgDailyRet", "pct", true], awr: ["avgWeeklyRet", "pct", true], amr: ["avgMonthlyRet", "pct", true],
  adp: ["avgDailyPnl", "money", true], mdp: ["medDailyPnl", "money", true], sdp: ["sdDailyPnl", "money", false], awp: ["avgWeeklyPnl", "money", true], amp: ["avgMonthlyPnl", "money", true],
  bd: ["bestDay", "money", true], wd: ["worstDay", "money", true], bw: ["bestWeek", "money", true], ww: ["worstWeek", "money", true], bm: ["bestMonth", "money", true], wm: ["worstMonth", "money", true],
  twr: ["twr", "pct", true], ann: ["ann", "pct", true],
  netDep: ["netDep", "money", true], totDep: ["totDep", "money", false], totWd: ["totWd", "money", false], netFlow: ["netFlow", "money", true], credits: ["credits", "money", true],
  depN: ["depN", "int", false], wdN: ["wdN", "int", false], credN: ["credN", "int", false], avgDep: ["avgDep", "money", false], avgWd: ["avgWd", "money", false],
  init: ["initial", "money", false], start: ["startBal", "money", false], cur: ["currentBal", "money", false], end: ["endBal", "money", false], hiBal: ["highBal", "money", false],
  pDays: ["profitDays", "int", false], pDayPct: ["profitDayPct", "pct", false], dWin: ["tradeWinRate", "pct", false], pWeeks: ["profitWeeks", "int", false], pMonths: ["profitMonths", "int", false], posRet: ["posRetDays", "int", false],
  avgWinDay: ["avgWinDay", "money", true], avgLossDay: ["avgLossDay", "money", true], bigWin: ["bigWinShare", "pct", false], bigLoss: ["bigLossShare", "pct", false],
};
const WHY: Record<RcWhy, L> = {
  noTrades: ["No closed trades in this period.", "لا توجد صفقات مغلقة في هذه الفترة.", "Aucun trade clôturé sur la période."],
  noStart: ["Insufficient data: needs a positive starting balance on the account.", "بيانات غير كافية: يلزم رصيد ابتدائي موجب للحساب.", "Données insuffisantes : solde initial positif requis."],
  noCash: ["Insufficient data: deposits, withdrawals and credits are not recorded.", "بيانات غير كافية: الإيداعات والسحوبات والائتمانات غير مسجّلة.", "Données insuffisantes : dépôts, retraits et crédits non enregistrés."],
  noEquity: ["Insufficient data: equity history / open-position P&L is not stored.", "بيانات غير كافية: سجل حقوق الملكية وأرباح الصفقات المفتوحة غير محفوظ.", "Données insuffisantes : historique d'equity non stocké."],
  fewDays: ["Needs at least 2 trading days.", "يلزم يومان تداول على الأقل.", "Au moins 2 jours de trading requis."],
  noWins: ["No profitable days in this period.", "لا توجد أيام رابحة في هذه الفترة.", "Aucun jour gagnant sur la période."],
  noDeposits: ["No deposits recorded in this period.", "لا توجد إيداعات مسجّلة في هذه الفترة.", "Aucun dépôt enregistré sur la période."],
  noWithdrawals: ["No withdrawals recorded in this period.", "لا توجد سحوبات مسجّلة في هذه الفترة.", "Aucun retrait enregistré sur la période."],
  shortPeriod: ["Annualising needs at least 30 days; shorter spans give misleading figures.", "التحويل السنوي يحتاج 30 يوماً على الأقل؛ الفترات الأقصر تعطي أرقاماً مضلّلة.", "L'annualisation exige au moins 30 jours."],
  twrStart: ["Not defined: the account value was zero/negative or the total return was -100%.", "غير معرّف: كانت قيمة الحساب صفراً أو سالبة أو العائد -100%.", "Non défini : valeur du compte nulle/négative ou rendement de -100 %."],
  noLosses: ["No losing days in this period.", "لا توجد أيام خاسرة في هذه الفترة.", "Aucun jour perdant sur la période."],
};
const POLICY: L = ["Only days, weeks and months with at least one closed trade count. Day = close date.", "تُحتسب فقط الأيام والأسابيع والأشهر التي فيها صفقة مغلقة واحدة على الأقل. اليوم = تاريخ الإغلاق.", "Seuls les jours/semaines/mois avec un trade clôturé comptent. Jour = date de clôture."];

export default function ReturnsTab({ lang, rc, onImport }: { lang: Lang; rc: ReturnsCapital; onImport?: () => void }) {
  const k = i(lang), T = (x: L) => x[k];
  const { hidden } = usePrivacy();
  const [view, setView] = useState<View>("grid");
  const items = (m: M[]): Item[] => m.map(([id, l, tip]) => {
    const spec = MAP[id], v = spec ? (rc[spec[0]] as number | null) : null;
    const why = (rc.why[id] ?? (spec ? undefined : "noCash")) as RcWhy | undefined;
    if (v == null) return { id, label: T(l), tip: T(tip), value: "-", reason: why ? T(WHY[why]) : undefined };
    const [, kind, signed] = spec;
    const value = kind === "int" ? String(Math.round(v)) : kind === "pct" ? `${signed && v > 0 ? "+" : ""}${fmt(v)}%` : hidden ? "••••" : `${signed && v > 0 ? "+" : ""}${fmt(v)}`;
    return { id, label: T(l), tip: T(tip), value, color: signed && !hidden && kind !== "int" && v !== 0 ? (v > 0 ? GREEN : RED) : undefined };
  });
  const n = S1.length + S2.length + S3.length;
  const sec = [[<TrendingUp size={18} />, TXT.s1, TXT.s1d, S1], [<Banknote size={18} />, TXT.s2, TXT.s2d, S2], [<CalendarCheck size={18} />, TXT.s3, TXT.s3d, S3]] as const;
  return (
    <div className="space-y-5">
      <ViewHeader title={T(RET_TAB)} sub={`${T(TXT.sub)} ${T(POLICY)}`} badge={`${n} ${lang === "ar" ? "مقياس" : lang === "fr" ? "métriques" : "metrics"}`} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      {sec.map(([icon, t, d, m]) => <MetricSection key={t[0]} icon={icon} title={T(t)} subtitle={T(d)} view={view} items={items(m as M[])} />)}
    </div>
  );
}
