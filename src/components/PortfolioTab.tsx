import { useMemo, useState } from "react";
import { ShieldAlert, PieChart } from "lucide-react";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import { MIN_DAYS, portfolioStats } from "../lib/portfolio";
import { readLinks, shownOf } from "../lib/myStrategies";
import { readCustom } from "../lib/customStrategies";
import { fmtMoney, ltrNumbers } from "../lib/money";
import type { CashFlow } from "../lib/cashflow";
import type { Account, Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const PORTFOLIO_TAB: L = ["Portfolio", "المحفظة", "Portefeuille"];
const TXT = {
  title: ["Portfolio", "المحفظة", "Portefeuille"] as L,
  sub: ["Combined portfolio contribution, concentration, diversification, and exposure.", "مساهمة المحفظة المجمّعة وتركّزها وتنوّعها وتعرّضها.", "Contribution, concentration, diversification et exposition du portefeuille."] as L,
  s1: ["Composition & contribution", "التركيب والمساهمة", "Composition & contribution"] as L,
  s1d: ["How accounts, symbols, and strategies contribute to the portfolio.", "كيف تساهم الحسابات والرموز والاستراتيجيات في المحفظة.", "Contribution des comptes, symboles et stratégies au portefeuille."] as L,
  s2: ["Portfolio risk", "مخاطر المحفظة", "Risque du portefeuille"] as L,
  s2d: ["Diversification, overlap, and combined portfolio exposure.", "التنويع والتداخل والتعرّض المجمّع للمحفظة.", "Diversification, chevauchement et exposition combinée."] as L,
  of: ["{a} of {b}", "{a} من {b}", "{a} sur {b}"] as L,
  atOnce: ["max {n} at once", "حتى {n} معاً", "max {n} à la fois"] as L,
  noTrades: ["No closed trades in this period.", "لا توجد صفقات مغلقة في هذه الفترة.", "Aucun trade clôturé sur la période."] as L,
  needStart: ["Needs a positive starting balance (Accounts).", "يحتاج رصيداً ابتدائياً موجباً (الحسابات).", "Nécessite un solde de départ positif (Comptes)."] as L,
  need2Acc: ["Needs 2 or more accounts with trades in this period (choose All accounts).", "يحتاج حسابين أو أكثر لهما صفقات في هذه الفترة (اختر كل الحسابات).", "Nécessite au moins 2 comptes avec des trades sur la période (choisissez Tous les comptes)."] as L,
  need2Sym: ["Needs trades in 2 or more symbols.", "يحتاج صفقات على رمزين أو أكثر.", "Nécessite des trades sur au moins 2 symboles."] as L,
  needPair: ["Needs 2 accounts trading over the same {n} days or more.", "يحتاج حسابين يتداولان خلال نفس الـ{n} يوماً أو أكثر.", "Nécessite 2 comptes actifs sur les mêmes {n} jours ou plus."] as L,
  needDays: ["Needs at least {n} trading days (has {d}).", "يحتاج {n} يوم تداول على الأقل (المتوفر {d}).", "Nécessite au moins {n} jours de trading ({d} disponibles)."] as L,
  noDD: ["No drawdown in this period.", "لا يوجد تراجع في هذه الفترة.", "Aucun drawdown sur la période."] as L,
  noStrat: ["Trades are not linked to strategies yet.", "الصفقات غير مرتبطة باستراتيجيات بعد.", "Les trades ne sont pas encore liés à des stratégies."] as L,
  noPv: ["Needs closed trades with a price move in each symbol, to measure the value of a 1.0 move per lot.", "يحتاج صفقات مغلقة بها حركة سعر في كل رمز، لقياس قيمة حركة 1.0 لكل لوت.", "Nécessite des trades clôturés avec un mouvement de prix par symbole, pour mesurer la valeur d'un mouvement de 1,0 par lot."] as L,
  missing: ["Left out (value per lot not measurable): {s}", "مستبعد (تعذّر قياس القيمة لكل لوت): {s}", "Exclu (valeur par lot non mesurable) : {s}"] as L,
};
const M1: [string, L, L][] = [
  ["accN", ["Accounts in portfolio", "الحسابات في المحفظة", "Comptes dans le portefeuille"], ["Accounts with trades in the period, out of the accounts selected. Only these form the portfolio, as on the Overview.", "الحسابات التي لها صفقات في الفترة من بين الحسابات المختارة. هذه وحدها تكوّن المحفظة، كما في النظرة العامة.", "Comptes ayant des trades sur la période, parmi les comptes sélectionnés. Eux seuls forment le portefeuille, comme dans la Vue d'ensemble."]],
  ["topAcc", ["Top account return contribution", "أعلى حساب مساهمةً في العائد", "Meilleur compte (contribution)"], ["Account with the highest P&L ÷ the portfolio's starting balance: its part of the total return, in percentage points (the parts add up to the total return).", "الحساب صاحب أعلى ربح ÷ رصيد المحفظة الابتدائي: حصته من العائد الكلي بالنقاط المئوية (مجموع الحصص = العائد الكلي).", "Compte au P&L le plus élevé ÷ solde de départ du portefeuille : sa part du rendement total, en points (la somme des parts = rendement total)."]],
  ["worstAcc", ["Worst account return contribution", "أضعف حساب مساهمةً في العائد", "Pire compte (contribution)"], ["Account with the lowest P&L ÷ the portfolio's starting balance, in percentage points of the total return.", "الحساب صاحب أدنى ربح ÷ رصيد المحفظة الابتدائي، بالنقاط المئوية من العائد الكلي.", "Compte au P&L le plus bas ÷ solde de départ du portefeuille, en points du rendement total."]],
  ["topAccDD", ["Top account drawdown contribution", "أعلى حساب مساهمةً في التراجع", "Compte contribuant le plus au drawdown"], ["During the portfolio's largest drawdown (peak to trough of the combined balance, deposits and withdrawals excluded), the account whose trades lost the most, as a share of that drawdown.", "خلال أكبر تراجع للمحفظة (من القمة إلى القاع للرصيد المجمّع، دون الإيداعات والسحوبات)، الحساب الذي خسرت صفقاته أكثر، كنسبة من ذلك التراجع.", "Pendant le plus fort drawdown du portefeuille (du pic au creux du solde combiné, hors dépôts et retraits), le compte dont les trades ont le plus perdu, en part de ce drawdown."]],
  ["topSym", ["Top symbol return contribution", "أعلى رمز مساهمةً في العائد", "Meilleur symbole (contribution)"], ["Symbol with the highest P&L ÷ the portfolio's starting balance, in percentage points of the total return.", "الرمز صاحب أعلى ربح ÷ رصيد المحفظة الابتدائي، بالنقاط المئوية من العائد الكلي.", "Symbole au P&L le plus élevé ÷ solde de départ du portefeuille, en points du rendement total."]],
  ["worstSym", ["Worst symbol return contribution", "أضعف رمز مساهمةً في العائد", "Pire symbole (contribution)"], ["Symbol with the lowest P&L ÷ the portfolio's starting balance, in percentage points of the total return.", "الرمز صاحب أدنى ربح ÷ رصيد المحفظة الابتدائي، بالنقاط المئوية من العائد الكلي.", "Symbole au P&L le plus bas ÷ solde de départ du portefeuille, en points du rendement total."]],
  ["topStrat", ["Top strategy return contribution", "أعلى استراتيجية مساهمةً في العائد", "Meilleure stratégie (contribution)"], ["Strategy with the highest P&L ÷ the portfolio's starting balance, in percentage points of the total return.", "الاستراتيجية صاحبة أعلى ربح ÷ رصيد المحفظة الابتدائي، بالنقاط المئوية من العائد الكلي.", "Stratégie au P&L le plus élevé ÷ solde de départ du portefeuille, en points du rendement total."]],
  ["accConc", ["Account concentration", "تركّز الحسابات", "Concentration par compte"], ["Herfindahl index of each account's share of absolute P&L: 100% = all results from one account, lower = spread out. In brackets: the equivalent number of equal accounts / accounts.", "مؤشر هيرفندال لحصة كل حساب من الربح والخسارة المطلقة: 100% = كل النتائج من حساب واحد، والأقل = موزّعة. بين القوسين: العدد المكافئ من الحسابات المتساوية / عدد الحسابات.", "Indice de Herfindahl des parts de P&L absolu par compte : 100 % = tout vient d'un compte, plus bas = réparti. Entre parenthèses : nombre équivalent de comptes égaux / nombre de comptes."]],
  ["symConc", ["Symbol concentration", "تركّز الرموز", "Concentration par symbole"], ["Herfindahl index of each symbol's share of absolute P&L: 100% = all results from one symbol, lower = spread out. In brackets: the equivalent number of equal symbols / symbols.", "مؤشر هيرفندال لحصة كل رمز من الربح والخسارة المطلقة: 100% = كل النتائج من رمز واحد، والأقل = موزّعة. بين القوسين: العدد المكافئ من الرموز المتساوية / عدد الرموز.", "Indice de Herfindahl des parts de P&L absolu par symbole : 100 % = tout vient d'un symbole, plus bas = réparti. Entre parenthèses : nombre équivalent de symboles égaux / nombre de symboles."]],
  ["stratConc", ["Strategy concentration", "تركّز الاستراتيجيات", "Concentration par stratégie"], ["Herfindahl index of each strategy's share of absolute P&L: 100% = all results from one strategy.", "مؤشر هيرفندال لحصة كل استراتيجية من الربح والخسارة المطلقة: 100% = كل النتائج من استراتيجية واحدة.", "Indice de Herfindahl des parts de P&L absolu par stratégie : 100 % = tout vient d'une stratégie."]],
];
const M2: [string, L, L][] = [
  ["pDD", ["Portfolio maximum balance drawdown", "أقصى تراجع لرصيد المحفظة", "Drawdown max du solde du portefeuille"], ["Largest peak-to-trough fall of the combined balance of closed trades, in % (time-weighted, so deposits and withdrawals are neither gains nor losses) and in money. Same rule as the Overview; floating P&L of open trades is not in the data.", "أكبر هبوط من القمة إلى القاع للرصيد المجمّع للصفقات المغلقة، بالنسبة المئوية (موزون زمنياً، فالإيداع والسحب ليسا ربحاً ولا خسارة) وبالمال. نفس قاعدة النظرة العامة؛ الربح العائم للصفقات المفتوحة غير موجود في البيانات.", "Plus forte baisse du pic au creux du solde combiné des trades clôturés, en % (pondéré dans le temps : dépôts et retraits ne sont ni gains ni pertes) et en argent. Même règle que la Vue d'ensemble ; le P&L latent n'est pas dans les données."]],
  ["avgCorr", ["Average account correlation", "متوسط ارتباط الحسابات", "Corrélation moyenne des comptes"], ["Average Pearson correlation of daily returns between every two accounts, over the days both were trading (20 days at least).", "متوسط ارتباط بيرسون بين العوائد اليومية لكل حسابين، خلال الأيام التي تداول فيها الاثنان (20 يوماً على الأقل).", "Corrélation de Pearson moyenne des rendements quotidiens entre chaque paire de comptes, sur les jours où les deux tradaient (20 jours minimum)."]],
  ["maxCorr", ["Maximum account correlation", "أقصى ارتباط بين حسابين", "Corrélation max entre comptes"], ["The most correlated pair of accounts: Pearson correlation of daily returns over the days both were trading.", "أكثر حسابين ارتباطاً: ارتباط بيرسون بين العوائد اليومية خلال الأيام التي تداول فيها الاثنان.", "La paire de comptes la plus corrélée : corrélation de Pearson des rendements quotidiens sur les jours où les deux tradaient."]],
  ["divRatio", ["Diversification ratio", "نسبة التنويع", "Ratio de diversification"], ["Sum of each account's daily P&L volatility ÷ the portfolio's daily P&L volatility. 1 = no diversification; higher = the accounts offset each other.", "مجموع تقلب الربح اليومي لكل حساب ÷ تقلب الربح اليومي للمحفظة. 1 = لا تنويع؛ الأعلى = الحسابات يعوّض بعضها بعضاً.", "Somme des volatilités du P&L quotidien de chaque compte ÷ volatilité du P&L quotidien du portefeuille. 1 = aucune diversification ; plus haut = les comptes se compensent."]],
  ["marginal", ["Largest marginal risk contribution", "أكبر مساهمة هامشية في المخاطر", "Plus grande contribution marginale au risque"], ["Share of the portfolio's daily P&L variance that comes from each account (each symbol when there is one account): covariance with the portfolio ÷ portfolio variance. The shares add up to 100%; the largest is shown.", "حصة كل حساب (أو كل رمز عند وجود حساب واحد) من تباين الربح اليومي للمحفظة: التغاير مع المحفظة ÷ تباين المحفظة. مجموع الحصص 100%؛ المعروض أكبرها.", "Part de la variance du P&L quotidien du portefeuille venant de chaque compte (chaque symbole s'il n'y a qu'un compte) : covariance avec le portefeuille ÷ variance du portefeuille. Les parts font 100 % ; la plus grande est affichée."]],
  ["overlap", ["Concurrent position overlap", "تداخل الصفقات المتزامنة", "Chevauchement des positions"], ["Share of the time in the market with two or more positions open at once, across the selected accounts. In brackets: the most positions open at once.", "نسبة وقت التواجد في السوق مع صفقتين مفتوحتين أو أكثر في نفس الوقت، عبر الحسابات المختارة. بين القوسين: أكبر عدد من الصفقات المفتوحة معاً.", "Part du temps en marché avec deux positions ouvertes ou plus en même temps, sur les comptes sélectionnés. Entre parenthèses : le plus de positions ouvertes à la fois."]],
  ["maxGross", ["Maximum gross exposure", "أقصى تعرّض إجمالي", "Exposition brute max"], ["Peak value of all open positions, long + short, in account money: lots × price × the value of a 1.0 move per lot, measured from your closed trades of that account and symbol.", "ذروة قيمة كل الصفقات المفتوحة، شراء + بيع، بعملة الحساب: اللوتات × السعر × قيمة حركة 1.0 لكل لوت، مقاسة من صفقاتك المغلقة لنفس الحساب والرمز.", "Pic de la valeur de toutes les positions ouvertes, long + short, en monnaie du compte : lots × prix × valeur d'un mouvement de 1,0 par lot, mesurée sur vos trades clôturés du même compte et symbole."]],
  ["maxNet", ["Maximum net exposure", "أقصى تعرّض صافٍ", "Exposition nette max"], ["Peak of long minus short position value (the sign tells the side).", "ذروة قيمة الشراء مطروحاً منها البيع (الإشارة تحدد الاتجاه).", "Pic de la valeur long moins short (le signe indique le sens)."]],
  ["avgGross", ["Average gross exposure", "متوسط التعرّض الإجمالي", "Exposition brute moyenne"], ["Average value of open positions, long + short, over the time at least one position is open.", "متوسط قيمة الصفقات المفتوحة، شراء + بيع، خلال الوقت الذي تكون فيه صفقة واحدة على الأقل مفتوحة.", "Valeur moyenne des positions ouvertes, long + short, sur le temps où au moins une position est ouverte."]],
  ["avgNet", ["Average net exposure", "متوسط التعرّض الصافي", "Exposition nette moyenne"], ["Average long minus short value over the time positions are open.", "متوسط قيمة الشراء مطروحاً منها البيع خلال وقت وجود صفقات مفتوحة.", "Valeur moyenne long moins short sur le temps où des positions sont ouvertes."]],
  ["maxLev", ["Maximum effective leverage", "أقصى رافعة فعلية", "Levier effectif max"], ["Peak of open position value ÷ the balance at that moment.", "ذروة قيمة الصفقات المفتوحة ÷ الرصيد في تلك اللحظة.", "Pic de la valeur des positions ouvertes ÷ solde à cet instant."]],
  ["avgLev", ["Average effective leverage", "متوسط الرافعة الفعلية", "Levier effectif moyen"], ["Average of open position value ÷ balance, over the time positions are open.", "متوسط قيمة الصفقات المفتوحة ÷ الرصيد، خلال وقت وجود صفقات مفتوحة.", "Moyenne de la valeur des positions ouvertes ÷ solde, sur le temps où des positions sont ouvertes."]],
  ["var95", ["Portfolio value at risk (95%)", "القيمة المعرّضة للخطر للمحفظة (95%)", "Value at Risk du portefeuille (95 %)"], ["Historical: the 5th percentile of the portfolio's daily returns (weekdays + weekend days with trades), a loss not exceeded on 95% of days. In brackets: that loss on the latest balance.", "تاريخية: المئين الخامس لعوائد المحفظة اليومية (أيام الأسبوع + عطل نهاية الأسبوع التي فيها صفقات)، خسارة لا تُتجاوز في 95% من الأيام. بين القوسين: تلك الخسارة على آخر رصيد.", "Historique : 5e centile des rendements quotidiens du portefeuille (jours ouvrés + week-ends avec trades), perte non dépassée 95 % des jours. Entre parenthèses : cette perte sur le dernier solde."]],
  ["es95", ["Portfolio expected shortfall (95%)", "العجز المتوقع للمحفظة (95%)", "Expected shortfall du portefeuille (95 %)"], ["Average of the daily returns at or below the 5th percentile: the average loss on the worst 5% of days. In brackets: on the latest balance.", "متوسط العوائد اليومية عند المئين الخامس أو تحته: متوسط الخسارة في أسوأ 5% من الأيام. بين القوسين: على آخر رصيد.", "Moyenne des rendements quotidiens au 5e centile ou en dessous : perte moyenne des 5 % pires jours. Entre parenthèses : sur le dernier solde."]],
];
const GREEN = "#22c55e", RED = "#f87171", NEUTRAL = "var(--primary)";

export default function PortfolioTab({ lang, trades, accounts, flows, history, currency }: { lang: Lang; trades: Trade[]; accounts: Account[]; flows: CashFlow[]; history: Trade[]; currency: string | null }) {
  const k = i(lang), T = (x: L) => x[k];
  const [view, setView] = useState<View>("grid");
  const [now] = useState(() => Date.now());
  // The strategy of each trade, as picked in the journal (short names: "SMC", "ORB 15m", or the trader's own).
  const p = useMemo(() => {
    const links = readLinks(), custom = readCustom();
    return portfolioStats(trades, accounts, flows, history, now, (t) => (links[t.key] ? shownOf(links[t.key], custom)?.short : undefined));
  }, [trades, accounts, flows, history, now]);

  const f = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/^-(?=0(\.0+)?$)/, ""); // no "-0.00"
  const sgn = (n: number, d = 2) => { const s = f(n, d); return `${n > 0 && /[1-9]/.test(s) ? "+" : ""}${s}%`; };
  const money = (n: number, sign = false) => fmtMoney(n, { sign, currency });
  const tone = (n: number | null | undefined) => (n == null ? NEUTRAL : n > 0 ? GREEN : n < 0 ? RED : NEUTRAL);
  // values mixing names or words with numbers: an RTL isolate in Arabic so they read in order inside the LTR value
  const mix = (s: string) => (lang === "ar" ? `⁧${ltrNumbers(s)}⁩` : s);
  const none = (reason: string): [string, string, string | undefined] => ["—", NEUTRAL, reason];
  const noTrades = T(TXT.noTrades);
  const symCount = p.symbols.length, accWithClosed = p.traded;

  const contribution = (s: { name: string; pnl: number; pct: number | null } | undefined): [string, string, string | undefined] =>
    !s ? none(noTrades) : s.pct == null ? [mix(`${s.name} ${money(s.pnl, true)}`), tone(s.pnl), T(TXT.needStart)] : [mix(`${s.name} ${sgn(s.pct)}`), tone(s.pct), undefined];
  const concentration = (c: typeof p.accConc): [string, string, string | undefined] =>
    c ? [`${f(c.hhi * 100, 0)}% (≈${f(c.eff, 1)}/${c.n})`, NEUTRAL, undefined] : none(noTrades);
  const v1 = (id: string): [string, string, string | undefined] => {
    if (!p.closed && id !== "accN") return none(noTrades);
    switch (id) {
      case "accN": return p.active === p.selected ? [String(p.active), NEUTRAL, p.active ? undefined : noTrades] : [mix(T(TXT.of).replace("{a}", String(p.active)).replace("{b}", String(p.selected))), NEUTRAL, undefined];
      case "topAcc": return contribution(p.accounts[0]);
      case "worstAcc": return p.accounts.length < 2 ? none(T(TXT.need2Acc)) : contribution(p.accounts[p.accounts.length - 1]);
      case "topAccDD": return !p.dd ? none(T(TXT.needStart)) : !p.dd.shares.length ? ["—", NEUTRAL, T(TXT.noDD)] : [mix(`${p.dd.shares[0].name} ${f(p.dd.shares[0].share, 0)}%`), RED, undefined];
      case "topSym": return contribution(p.symbols[0]);
      case "worstSym": return symCount < 2 ? none(T(TXT.need2Sym)) : contribution(p.symbols[symCount - 1]);
      case "topStrat": return p.strategies.length ? contribution(p.strategies[0]) : none(T(TXT.noStrat));
      case "stratConc": return p.stratConc ? concentration(p.stratConc) : none(T(TXT.noStrat));
      case "accConc": return concentration(p.accConc);
      case "symConc": return concentration(p.symConc);
    }
    return ["—", NEUTRAL, undefined];
  };

  const ex = p.exposure, exReason = !p.closed && !trades.length ? noTrades : T(TXT.noPv);
  const exMissing = ex?.missing.length ? T(TXT.missing).replace("{s}", ex.missing.join(", ")) : undefined;
  const daysReason = !p.closed ? noTrades : !(p.start > 0) ? T(TXT.needStart) : T(TXT.needDays).replace("{n}", String(MIN_DAYS)).replace("{d}", String(p.days));
  const v2 = (id: string): [string, string, string | undefined] => {
    switch (id) {
      case "pDD": return !p.closed ? none(noTrades) : !p.dd ? none(T(TXT.needStart)) : [p.dd.amount > 0 ? `-${f(p.dd.pct)}% (${money(-p.dd.amount)})` : `${f(0)}%`, p.dd.amount > 0 ? RED : NEUTRAL, undefined];
      case "avgCorr": return p.corr.avg != null ? [f(p.corr.avg), NEUTRAL, undefined] : none(!p.closed ? noTrades : accWithClosed < 2 ? T(TXT.need2Acc) : T(TXT.needPair).replace("{n}", String(MIN_DAYS)));
      case "maxCorr": return p.corr.max ? [mix(`${p.corr.max.a} / ${p.corr.max.b} ${f(p.corr.max.v)}`), NEUTRAL, undefined] : none(!p.closed ? noTrades : accWithClosed < 2 ? T(TXT.need2Acc) : T(TXT.needPair).replace("{n}", String(MIN_DAYS)));
      case "divRatio": return p.divRatio != null ? [f(p.divRatio), NEUTRAL, undefined] : none(!p.closed ? noTrades : accWithClosed < 2 ? T(TXT.need2Acc) : daysReason);
      case "marginal": return p.risk ? [mix(`${p.risk.name} ${f(p.risk.share, 0)}%`), NEUTRAL, undefined] : none(!p.closed ? noTrades : accWithClosed < 2 && symCount < 2 ? T(TXT.need2Sym) : daysReason);
      case "overlap": return p.overlap.share != null ? [mix(`${f(p.overlap.share, 1)}% (${T(TXT.atOnce).replace("{n}", String(p.overlap.maxOpen))})`), NEUTRAL, undefined] : none(noTrades);
      case "maxGross": return ex ? [money(ex.maxGross), NEUTRAL, exMissing] : none(exReason);
      case "maxNet": return ex ? [money(ex.maxNet, true), NEUTRAL, exMissing] : none(exReason);
      case "avgGross": return ex ? [money(ex.avgGross), NEUTRAL, exMissing] : none(exReason);
      case "avgNet": return ex ? [money(ex.avgNet, true), NEUTRAL, exMissing] : none(exReason);
      case "maxLev": return !ex ? none(exReason) : ex.maxLev == null ? none(T(TXT.needStart)) : [`${f(ex.maxLev)}×`, NEUTRAL, exMissing];
      case "avgLev": return !ex ? none(exReason) : ex.avgLev == null ? none(T(TXT.needStart)) : [`${f(ex.avgLev)}×`, NEUTRAL, exMissing];
      case "var95": return p.var95 != null ? [`${sgn(p.var95)} (${money((p.var95 / 100) * p.balance, true)})`, tone(p.var95), undefined] : none(daysReason);
      case "es95": return p.es95 != null ? [`${sgn(p.es95)} (${money((p.es95 / 100) * p.balance, true)})`, tone(p.es95), undefined] : none(daysReason);
    }
    return ["—", NEUTRAL, undefined];
  };
  const items = (m: [string, L, L][], val: (id: string) => [string, string, string | undefined]): Item[] => m.map(([id, l, tip]) => { const [value, color, reason] = val(id); return { id, label: T(l), tip: T(tip), value, color, reason }; });
  const n = M1.length + M2.length;
  return (
    <div className="space-y-5">
      <ViewHeader title={T(TXT.title)} sub={T(TXT.sub)} badge={`${n} ${lang === "ar" ? "مقياس" : lang === "fr" ? "métriques" : "metrics"}`} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      <MetricSection icon={<PieChart size={18} />} title={T(TXT.s1)} subtitle={T(TXT.s1d)} view={view} items={items(M1, v1)} />
      <MetricSection icon={<ShieldAlert size={18} />} title={T(TXT.s2)} subtitle={T(TXT.s2d)} view={view} items={items(M2, v2)} />
    </div>
  );
}
