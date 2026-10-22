import { useEffect, useMemo, useState } from "react";
import { BarChart3, FlaskConical, Gauge, ShieldCheck } from "lucide-react";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import { advancedStats, MIN_DAYS, MIN_TRADES, SHARPE_DAYS, type Range } from "../lib/advanced";
import { accountDays, alignWithBenchmark, benchStats, type Bar } from "../lib/benchmark";
import { benchOf, loadDaily, loadPrefs, type LoadError } from "../lib/marketData";
import { fmtMoney, ltrNumbers } from "../lib/money";
import type { CashFlow } from "../lib/cashflow";
import type { Account, Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
type M = [string, L, L]; // id, label, tip
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const ADV_TAB: L = ["Advanced statistics", "إحصاءات متقدمة", "Statistiques avancées"];
const TXT = {
  sub: ["Return distribution, advanced risk ratios, confidence and simulation.", "توزيع العوائد ونسب المخاطرة المتقدمة والثقة والمحاكاة.", "Distribution des rendements, ratios de risque avancés, confiance et simulation."] as L,
  s1: ["Return distribution", "توزيع العوائد", "Distribution des rendements"] as L,
  s1d: ["Shape, persistence and extremes of your daily returns (the series behind the Overview's Sharpe ratio).", "شكل عوائدك اليومية واستمراريتها وقيمها المتطرفة (نفس سلسلة نسبة شارب في النظرة العامة).", "Forme, persistance et extrêmes de vos rendements quotidiens (la série du Sharpe de la Vue d'ensemble)."] as L,
  s2: ["Advanced return-to-risk", "العائد إلى المخاطرة (متقدم)", "Rendement/risque avancé"] as L,
  s2d: ["Alternative measures of return efficiency and benchmark performance.", "مقاييس بديلة لكفاءة العائد والأداء مقابل المعيار.", "Mesures alternatives d'efficacité et de performance vs référence."] as L,
  s3: ["Confidence & robustness", "الثقة والمتانة", "Confiance & robustesse"] as L,
  s3d: ["95% ranges around the observed trading edge.", "نطاقات ثقة 95% حول ميزتك التداولية المرصودة.", "Plages à 95 % autour de l'avantage observé."] as L,
  s4: ["Simulation & sizing", "المحاكاة وحجم المركز", "Simulation & taille de position"] as L,
  s4d: ["Your trades replayed at random (1,000 paths, as on Charts › Monte Carlo) and growth-optimal sizing (Charts › Size).", "صفقاتك مُعادة عشوائياً (1,000 مسار، كما في الرسوم › مونت كارلو) وحجم المخاطرة الأمثل للنمو (الرسوم › حجم المركز).", "Vos trades rejoués au hasard (1 000 trajectoires, comme Graphiques › Monte Carlo) et taille optimale (Graphiques › Taille)."] as L,
  noTrades: ["No closed trades in this period.", "لا توجد صفقات مغلقة في هذه الفترة.", "Aucun trade clôturé sur la période."] as L,
  needStart: ["Needs a positive starting balance (Accounts).", "يحتاج رصيداً ابتدائياً موجباً (الحسابات).", "Nécessite un solde de départ positif (Comptes)."] as L,
  needDays: ["Needs at least {n} daily returns (has {d}).", "يحتاج {n} عائداً يومياً على الأقل (المتوفر {d}).", "Nécessite au moins {n} rendements quotidiens ({d} disponibles)."] as L,
  needSharpe: ["Needs {n} trading days, as the Overview's Sharpe ratio (has {d}).", "يحتاج {n} يوم تداول، مثل نسبة شارب في النظرة العامة (المتوفر {d}).", "Nécessite {n} jours de trading, comme le Sharpe de la Vue d'ensemble ({d} disponibles)."] as L,
  needMonths: ["Needs at least {n} months (has {d}).", "يحتاج {n} أشهر على الأقل (المتوفر {d}).", "Nécessite au moins {n} mois ({d} disponibles)."] as L,
  needTrades: ["Needs at least {n} closed trades (has {d}).", "يحتاج {n} صفقة مغلقة على الأقل (المتوفر {d}).", "Nécessite au moins {n} trades clôturés ({d} disponibles)."] as L,
  noLossDay: ["No losing day in this period.", "لا يوجد يوم خاسر في هذه الفترة.", "Aucun jour perdant sur la période."] as L,
  flatTail: ["The worst 5% of days are flat (0%): the ratio has no denominator.", "أسوأ 5% من الأيام بلا تغيّر (0%): لا مقام للنسبة.", "Les 5 % pires jours sont à 0 % : le ratio n'a pas de dénominateur."] as L,
  needWL: ["Needs at least {n} winning or losing trades, with both kinds.", "يحتاج {n} صفقة رابحة أو خاسرة على الأقل، من النوعين.", "Nécessite au moins {n} trades gagnants ou perdants, des deux sortes."] as L,
  notPositive: ["The daily Sharpe ratio is not positive: no track record length can confirm an edge.", "نسبة شارب اليومية ليست موجبة: لا يوجد طول سجل يؤكد ميزة.", "Le Sharpe quotidien n'est pas positif : aucune durée ne peut confirmer un avantage."] as L,
  noDD: ["No drawdown in this period.", "لا يوجد تراجع في هذه الفترة.", "Aucun drawdown sur la période."] as L,
  needR: ["Needs {n} closed trades with a stop loss (R multiples), as Charts › Size (has {d}).", "يحتاج {n} صفقة مغلقة بوقف خسارة (مضاعفات R)، كما في الرسوم › حجم المركز (المتوفر {d}).", "Nécessite {n} trades clôturés avec stop (multiples de R), comme Graphiques › Taille ({d} disponibles)."] as L,
  needTwo: ["Needs at least 2 closed trades.", "يحتاج صفقتين مغلقتين على الأقل.", "Nécessite au moins 2 trades clôturés."] as L,
  noRec: ["Most simulated paths were still below their deepest drawdown's peak after {h} trades.", "أغلب المسارات المحاكاة بقيت تحت قمة أعمق تراجع لها بعد {h} صفقة.", "La plupart des trajectoires restaient sous le pic de leur pire drawdown après {h} trades."] as L,
  loading: ["Loading the benchmark's prices…", "جارٍ تحميل أسعار المعيار…", "Chargement des prix de la référence…"] as L,
  needBench: ["Needs the benchmark's daily prices: see the Benchmark & Market tab.", "يحتاج الأسعار اليومية للمعيار: انظر تبويب المقارنة والسوق.", "Nécessite les prix quotidiens de la référence : voir l'onglet Référence & marché."] as L,
  needPairs: ["Needs {n} trading days in common with the benchmark (has {d}).", "يحتاج {n} يوم تداول مشتركاً مع المعيار (المتوفر {d}).", "Nécessite {n} jours communs avec la référence ({d} disponibles)."] as L,
  noBeta: ["The benchmark did not move enough to measure this.", "المعيار لم يتحرك بما يكفي لقياس هذا.", "La référence n'a pas assez bougé pour le mesurer."] as L,
  days: ["{n} days ({d} so far)", "{n} يوم (المتوفر {d})", "{n} jours ({d} à ce jour)"] as L,
  trades: ["{n} trades", "{n} صفقة", "{n} trades"] as L,
  capped: ["≥ 50% (search limit)", "≥ 50% (حد البحث)", "≥ 50 % (limite de recherche)"] as L,
};
const S1: M[] = [
  ["gmDaily", ["Geometric mean daily return", "المتوسط الهندسي للعائد اليومي", "Rendement quotidien moyen géométrique"], ["Compounded average daily return: (product of (1 + daily return))^(1/days) - 1.", "متوسط العائد اليومي المركّب: (حاصل ضرب (1 + العائد اليومي))^(1/عدد الأيام) - 1.", "Rendement quotidien moyen composé : (produit de (1 + rendement))^(1/jours) - 1."]],
  ["gmMonthly", ["Geometric mean monthly return", "المتوسط الهندسي للعائد الشهري", "Rendement mensuel moyen géométrique"], ["Compounded average of calendar-month returns (each month = its daily returns compounded).", "المتوسط المركّب لعوائد الأشهر (كل شهر = عوائده اليومية مركّبة).", "Moyenne composée des rendements mensuels (chaque mois = ses rendements quotidiens composés)."]],
  ["sdDaily", ["Daily return standard deviation", "الانحراف المعياري للعائد اليومي", "Écart-type du rendement quotidien"], ["Sample standard deviation of daily returns.", "الانحراف المعياري للعيّنة للعوائد اليومية.", "Écart-type d'échantillon des rendements quotidiens."]],
  ["sdMonthly", ["Monthly return standard deviation", "الانحراف المعياري للعائد الشهري", "Écart-type du rendement mensuel"], ["Sample standard deviation of calendar-month returns.", "الانحراف المعياري للعيّنة لعوائد الأشهر.", "Écart-type d'échantillon des rendements mensuels."]],
  ["skew", ["Return skewness", "التواء العوائد", "Asymétrie des rendements"], ["Asymmetry of daily returns (bias-corrected): above 0 = a longer tail of big up days.", "عدم تماثل العوائد اليومية (مصحّح): فوق 0 = ذيل أطول للأيام الكبيرة الرابحة.", "Asymétrie des rendements quotidiens (corrigée) : au-dessus de 0 = queue plus longue de grands jours positifs."]],
  ["kurt", ["Return excess kurtosis", "التفرطح الزائد للعوائد", "Kurtosis excédentaire"], ["Fat tails of daily returns compared with a normal distribution (0 = normal, above 0 = more extreme days).", "ثِقل أطراف العوائد اليومية مقارنةً بالتوزيع الطبيعي (0 = طبيعي، فوق 0 = أيام متطرفة أكثر).", "Queues épaisses vs loi normale (0 = normale, au-dessus = plus de jours extrêmes)."]],
  ["tail", ["Tail ratio", "نسبة الذيل", "Ratio de queue"], ["95th percentile daily return ÷ |5th percentile daily return|. Above 1: the best days are bigger than the worst.", "العائد اليومي عند الشريحة 95 ÷ |العائد عند الشريحة 5|. فوق 1: أفضل الأيام أكبر من أسوئها.", "Rendement du 95e centile ÷ |5e centile|. Au-dessus de 1 : les meilleurs jours dépassent les pires."]],
  ["g2p", ["Gain-to-pain ratio", "نسبة المكسب إلى الألم", "Ratio gain/douleur"], ["Sum of daily returns ÷ |sum of losing daily returns|.", "مجموع العوائد اليومية ÷ |مجموع العوائد اليومية الخاسرة|.", "Somme des rendements quotidiens ÷ |somme des jours perdants|."]],
  ["g2l", ["Gain-to-loss ratio", "نسبة المكسب إلى الخسارة", "Ratio gain/perte"], ["Average winning day ÷ |average losing day| (daily returns).", "متوسط اليوم الرابح ÷ |متوسط اليوم الخاسر| (العوائد اليومية).", "Jour gagnant moyen ÷ |jour perdant moyen| (rendements quotidiens)."]],
  ["csr", ["Common sense ratio", "نسبة الحس العام", "Common sense ratio"], ["Daily profit factor (sum of gains ÷ |sum of losses|) × tail ratio. Above 1 is good.", "عامل الربح اليومي (مجموع المكاسب ÷ |مجموع الخسائر|) × نسبة الذيل. فوق 1 جيد.", "Profit factor quotidien (gains ÷ |pertes|) × ratio de queue. Au-dessus de 1 = bien."]],
  ["cpc", ["CPC index", "مؤشر CPC", "Indice CPC"], ["Daily profit factor × share of winning days (among days with a gain or loss) × gain-to-loss ratio. Above 1 is good.", "عامل الربح اليومي × نسبة الأيام الرابحة (من الأيام الرابحة أو الخاسرة) × نسبة المكسب إلى الخسارة. فوق 1 جيد.", "Profit factor quotidien × part de jours gagnants (parmi les jours non nuls) × ratio gain/perte. Au-dessus de 1 = bien."]],
  ["outWin", ["Outlier win ratio", "نسبة الأرباح الشاذة", "Ratio de gains aberrants"], ["99th percentile daily return ÷ average non-negative day: how far the best days stand above a normal good day.", "العائد اليومي عند الشريحة 99 ÷ متوسط الأيام غير السالبة: كم تبتعد أفضل الأيام عن اليوم الجيد العادي.", "Rendement du 99e centile ÷ jour non négatif moyen : l'écart des meilleurs jours."]],
  ["outLoss", ["Outlier loss ratio", "نسبة الخسائر الشاذة", "Ratio de pertes aberrantes"], ["1st percentile daily return ÷ average losing day: how far the worst days stand below a normal bad day.", "العائد اليومي عند الشريحة 1 ÷ متوسط اليوم الخاسر: كم تبتعد أسوأ الأيام عن اليوم السيئ العادي.", "Rendement du 1er centile ÷ jour perdant moyen : l'écart des pires jours."]],
  ["posOut", ["Positive return outliers", "العوائد الشاذة الموجبة", "Valeurs aberrantes positives"], ["Days whose return is more than 3 standard deviations above the average day.", "الأيام التي يزيد عائدها بأكثر من 3 انحرافات معيارية عن متوسط اليوم.", "Jours à plus de 3 écarts-types au-dessus du jour moyen."]],
  ["negOut", ["Negative return outliers", "العوائد الشاذة السالبة", "Valeurs aberrantes négatives"], ["Days whose return is more than 3 standard deviations below the average day.", "الأيام التي يقل عائدها بأكثر من 3 انحرافات معيارية عن متوسط اليوم.", "Jours à plus de 3 écarts-types en dessous du jour moyen."]],
  ["autoc", ["Return autocorrelation", "الارتباط الذاتي للعوائد", "Autocorrélation des rendements"], ["Correlation of each day's return with the previous day's (lag 1). Near 0 = days independent; above 0 = good days follow good days.", "ارتباط عائد كل يوم بعائد اليوم السابق. قرب 0 = أيام مستقلة؛ فوق 0 = الأيام الجيدة تتبع الجيدة.", "Corrélation du rendement d'un jour avec la veille. Près de 0 = jours indépendants ; au-dessus = les bons jours se suivent."]],
  ["stab", ["Equity curve stability", "ثبات منحنى الرصيد", "Stabilité de la courbe de capital"], ["R² of a straight line fitted to the cumulative log return over the days (1 = perfectly steady growth).", "R² لخط مستقيم مطابق للعائد اللوغاريتمي التراكمي عبر الأيام (1 = نمو ثابت تماماً).", "R² d'une droite ajustée au rendement log cumulé dans le temps (1 = croissance parfaitement régulière)."]],
  ["r2", ["Equity curve R-squared", "R² لمنحنى الرصيد", "R² de la courbe de capital"], ["R² of a straight line fitted to cumulative P&L trade by trade (1 = a straight equity line).", "R² لخط مستقيم مطابق للربح التراكمي صفقة بصفقة (1 = منحنى رصيد مستقيم).", "R² d'une droite ajustée au P&L cumulé trade par trade (1 = courbe droite)."]],
  ["runsZ", ["Runs test Z-score", "اختبار التتابع Z", "Z-score du test des séries"], ["Wald-Wolfowitz runs test on winning / losing trades in close order. Below -1.96: streaks (wins follow wins); above +1.96: wins and losses alternate more than chance.", "اختبار والد-وولفويتز للتتابعات على الصفقات الرابحة / الخاسرة بترتيب الإغلاق. تحت -1.96: سلاسل (الربح يتبع الربح)؛ فوق +1.96: تناوب أكثر من الصدفة.", "Test des séries de Wald-Wolfowitz sur trades gagnants / perdants. Sous -1,96 : séries ; au-dessus de +1,96 : alternance plus forte que le hasard."]],
];
const S2: M[] = [
  ["consist", ["Trade-return consistency ratio", "نسبة اتساق عوائد الصفقات", "Ratio de régularité des trades"], ["Average trade return ÷ its standard deviation (trade return = P&L ÷ balance before the trade).", "متوسط عائد الصفقة ÷ انحرافه المعياري (عائد الصفقة = الربح ÷ الرصيد قبلها).", "Rendement moyen par trade ÷ son écart-type (rendement = P&L ÷ solde avant le trade)."]],
  ["acSharpe", ["Autocorrelation-adjusted Sharpe ratio", "نسبة شارب المعدّلة للارتباط الذاتي", "Sharpe ajusté de l'autocorrélation"], ["The Overview's Sharpe ratio ÷ an autocorrelation penalty, √(1 + 2 Σ ((n - k) / n) |ρ|^k) with ρ the lag-1 autocorrelation (QuantStats smart Sharpe).", "نسبة شارب في النظرة العامة ÷ عقوبة الارتباط الذاتي، √(1 + 2 Σ ((n - k) / n) |ρ|^k) حيث ρ الارتباط الذاتي من الدرجة 1.", "Sharpe de la Vue d'ensemble ÷ pénalité d'autocorrélation √(1 + 2 Σ ((n - k) / n) |ρ|^k), ρ = autocorrélation d'ordre 1."]],
  ["acSortino", ["Autocorrelation-adjusted Sortino ratio", "نسبة سورتينو المعدّلة للارتباط الذاتي", "Sortino ajusté de l'autocorrélation"], ["The Overview's Sortino ratio ÷ the same autocorrelation penalty.", "نسبة سورتينو في النظرة العامة ÷ نفس عقوبة الارتباط الذاتي.", "Sortino de la Vue d'ensemble ÷ la même pénalité."]],
  ["psr", ["Probabilistic Sharpe ratio", "نسبة شارب الاحتمالية", "Sharpe probabiliste"], ["Probability that the true Sharpe ratio is above 0, given the number of days, skewness and kurtosis (Bailey & López de Prado).", "احتمال أن تكون نسبة شارب الحقيقية فوق 0، بحسب عدد الأيام والالتواء والتفرطح (بيلي ولوبيز دي برادو).", "Probabilité que le vrai Sharpe soit au-dessus de 0, selon le nombre de jours, l'asymétrie et la kurtosis (Bailey & López de Prado)."]],
  ["burke", ["Burke ratio", "نسبة بورك", "Ratio de Burke"], ["Annualised return ÷ √(sum of each drawdown's depth²). Drawdowns of the daily balance index.", "العائد السنوي ÷ √(مجموع مربعات عمق كل تراجع). التراجعات من مؤشر الرصيد اليومي.", "Rendement annualisé ÷ √(somme des profondeurs² de chaque drawdown)."]],
  ["mBurke", ["Modified Burke ratio", "نسبة بورك المعدّلة", "Ratio de Burke modifié"], ["Burke ratio × √(number of days): annualised return ÷ √(sum of drawdown depths² ÷ days).", "نسبة بورك × √(عدد الأيام): العائد السنوي ÷ √(مجموع مربعات التراجعات ÷ الأيام).", "Burke × √(nombre de jours) : rendement annualisé ÷ √(somme des drawdowns² ÷ jours)."]],
  ["painIdx", ["Pain index", "مؤشر الألم", "Indice de douleur"], ["Average depth below the previous peak over all days (0 on days at a new high).", "متوسط العمق تحت القمة السابقة عبر كل الأيام (0 في أيام القمم الجديدة).", "Profondeur moyenne sous le pic précédent sur tous les jours."]],
  ["painRatio", ["Pain ratio", "نسبة الألم", "Ratio de douleur"], ["Annualised return ÷ pain index.", "العائد السنوي ÷ مؤشر الألم.", "Rendement annualisé ÷ indice de douleur."]],
  ["upi", ["Ulcer performance index", "مؤشر أداء القرحة", "Ulcer performance index"], ["Annualised return ÷ ulcer index (√ of the average squared depth below the previous peak).", "العائد السنوي ÷ مؤشر القرحة (جذر متوسط مربع العمق تحت القمة السابقة).", "Rendement annualisé ÷ ulcer index (√ de la profondeur² moyenne sous le pic)."]],
  ["ir", ["Information ratio", "نسبة المعلومات", "Ratio d'information"], ["Active return ÷ tracking error, against the benchmark chosen on the Benchmark & Market tab.", "العائد النشط ÷ خطأ التتبع، مقابل المعيار المختار في تبويب المقارنة والسوق.", "Rendement actif ÷ tracking error, face à la référence choisie dans l'onglet Référence & marché."]],
  ["treynor", ["Treynor ratio", "نسبة تريينور", "Ratio de Treynor"], ["(Annualised return - risk-free rate) ÷ beta to the benchmark.", "(العائد السنوي - العائد الخالي من المخاطر) ÷ بيتا مقابل المعيار.", "(Rendement annualisé - taux sans risque) ÷ bêta."]],
  ["te", ["Tracking error", "خطأ التتبع", "Tracking error"], ["Standard deviation of the daily difference to the benchmark, × √252: % a year.", "الانحراف المعياري للفرق اليومي عن المعيار × √252: % سنوياً.", "Écart-type de l'écart quotidien à la référence × √252 : % par an."]],
  ["active", ["Active return", "العائد النشط", "Rendement actif"], ["Average daily (your return - benchmark return) × 252: % a year.", "متوسط (عائدك - عائد المعيار) اليومي × 252: % سنوياً.", "Moyenne quotidienne (vous - référence) × 252 : % par an."]],
];
const S3: M[] = [
  ["ciWin", ["Win rate confidence interval", "فترة الثقة لنسبة الربح", "Intervalle de confiance du taux de gain"], ["95% Wilson interval of the win rate (winning trades ÷ all closed trades, as the Overview).", "فترة ويلسون 95% لنسبة الربح (الصفقات الرابحة ÷ كل الصفقات المغلقة، كما في النظرة العامة).", "Intervalle de Wilson à 95 % du taux de gain (gagnants ÷ tous les trades, comme la Vue d'ensemble)."]],
  ["ciExp", ["Expectancy confidence interval", "فترة الثقة للتوقع", "Intervalle de confiance de l'espérance"], ["95% t-interval of the average P&L per trade.", "فترة t بنسبة 95% لمتوسط الربح لكل صفقة.", "Intervalle t à 95 % du P&L moyen par trade."]],
  ["ciPf", ["Profit factor confidence interval", "فترة الثقة لعامل الربح", "Intervalle de confiance du profit factor"], ["95% bootstrap interval: 2,000 resamples of your trades (fixed seed, so it does not change between visits).", "فترة بوتستراب 95%: 2,000 إعادة سحب لصفقاتك (بذرة ثابتة، فلا تتغير بين الزيارات).", "Intervalle bootstrap à 95 % : 2 000 rééchantillonnages (graine fixe, stable entre les visites)."]],
  ["ciMed", ["Median trade return confidence interval", "فترة الثقة لوسيط عائد الصفقة", "Intervalle de confiance du rendement médian"], ["Distribution-free 95% interval of the median trade return (order statistics of a Binomial(n, ½)).", "فترة 95% دون افتراض توزيع لوسيط عائد الصفقة (إحصاءات الترتيب من ذي الحدين).", "Intervalle à 95 % sans hypothèse de loi du rendement médian par trade (statistiques d'ordre)."]],
  ["ciRet", ["Return confidence interval", "فترة الثقة للعائد", "Intervalle de confiance du rendement"], ["95% t-interval of the average daily return.", "فترة t بنسبة 95% لمتوسط العائد اليومي.", "Intervalle t à 95 % du rendement quotidien moyen."]],
  ["minTrl", ["Minimum track record length", "الحد الأدنى لطول السجل", "Longueur minimale de l'historique"], ["Days of returns needed to be 95% confident that the Sharpe ratio is above 0, given its skewness and kurtosis (Bailey & López de Prado).", "عدد أيام العوائد اللازمة للثقة بنسبة 95% أن نسبة شارب فوق 0، بحسب الالتواء والتفرطح (بيلي ولوبيز دي برادو).", "Jours de rendements nécessaires pour être sûr à 95 % que le Sharpe est au-dessus de 0 (Bailey & López de Prado)."]],
];
const S4: M[] = [
  ["kelly", ["Kelly criterion", "معيار كيلي", "Critère de Kelly"], ["Risk per trade (share of the balance) that maximises long-run growth on your R multiples, as Charts › Size.", "المخاطرة لكل صفقة (نسبة من الرصيد) التي تعظّم النمو طويل الأجل على مضاعفات R لديك، كما في الرسوم › حجم المركز.", "Risque par trade (part du solde) qui maximise la croissance à long terme sur vos multiples de R (Graphiques › Taille)."]],
  ["fKelly", ["Fractional Kelly criterion", "معيار كيلي الجزئي", "Kelly fractionnaire"], ["Half Kelly: most of the growth with much smaller drawdowns.", "نصف كيلي: معظم النمو مع تراجعات أصغر بكثير.", "Demi-Kelly : l'essentiel de la croissance avec des drawdowns bien plus faibles."]],
  ["ruin", ["Estimated risk of ruin", "احتمال الإفلاس المقدّر", "Risque de ruine estimé"], ["Share of simulated paths that lose half of the starting balance at some point, at your current trade sizes.", "نسبة المسارات المحاكاة التي تخسر نصف الرصيد الابتدائي في لحظة ما، بأحجام صفقاتك الحالية.", "Part des trajectoires simulées qui perdent la moitié du solde de départ, à vos tailles actuelles."]],
  ["mcProfit", ["Monte Carlo probability of profit", "احتمال الربح (مونت كارلو)", "Probabilité de profit (Monte Carlo)"], ["Share of simulated paths that end above zero.", "نسبة المسارات المحاكاة التي تنتهي فوق الصفر.", "Part des trajectoires finissant au-dessus de zéro."]],
  ["mcMed", ["Monte Carlo median terminal return", "الوسيط النهائي للعائد (مونت كارلو)", "Rendement terminal médian (Monte Carlo)"], ["Median ending P&L of the simulated paths, in % of the starting balance (and money).", "وسيط الربح النهائي للمسارات المحاكاة، كنسبة من الرصيد الابتدائي (وبالمال).", "P&L final médian des trajectoires, en % du solde de départ (et en argent)."]],
  ["mc5", ["Monte Carlo 5th percentile terminal return", "الشريحة 5 للعائد النهائي (مونت كارلو)", "5e centile du rendement terminal (Monte Carlo)"], ["A pessimistic ending: 95% of the paths end above it.", "نهاية متشائمة: 95% من المسارات تنتهي فوقها.", "Une fin pessimiste : 95 % des trajectoires finissent au-dessus."]],
  ["mcDD", ["Monte Carlo median maximum drawdown", "وسيط أقصى تراجع (مونت كارلو)", "Drawdown max médian (Monte Carlo)"], ["Median of each path's largest drop from a peak, in money (and % of the starting balance).", "وسيط أكبر هبوط من القمة في كل مسار، بالمال (وكنسبة من الرصيد الابتدائي).", "Médiane de la plus forte baisse de chaque trajectoire, en argent (et % du solde de départ)."]],
  ["mcDD95", ["Monte Carlo 95th percentile maximum drawdown", "الشريحة 95 لأقصى تراجع (مونت كارلو)", "95e centile du drawdown max (Monte Carlo)"], ["A severe drawdown: only 5% of the paths fall further.", "تراجع حاد: 5% فقط من المسارات تهبط أكثر.", "Un drawdown sévère : seules 5 % des trajectoires tombent plus bas."]],
  ["mcRec", ["Monte Carlo median recovery time", "وسيط زمن التعافي (مونت كارلو)", "Temps de récupération médian (Monte Carlo)"], ["Median number of trades a path needs to climb from the bottom of its deepest drawdown back to that drawdown's peak.", "وسيط عدد الصفقات التي يحتاجها المسار للصعود من قاع أعمق تراجع إلى قمته.", "Nombre médian de trades pour remonter du creux du pire drawdown jusqu'à son pic."]],
];
const GREEN = "#22c55e", RED = "#f87171", NEUTRAL = "var(--primary)";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
type V = [string, string, string | undefined]; // value, colour, reason
type Bench = { state: "loading" } | { state: "ok"; bars: Bar[] } | { state: "error"; e: LoadError };

export default function AdvancedTab({ lang, trades, accounts, flows, periodStart, currency }: { lang: Lang; trades: Trade[]; accounts: Account[]; flows: CashFlow[]; periodStart: number; currency: string | null }) {
  const k = i(lang), T = (x: L) => x[k];
  const [view, setView] = useState<View>("grid");
  const a = useMemo(() => advancedStats(trades, accounts, flows), [trades, accounts, flows]);

  // benchmark metrics: the benchmark and risk-free rate chosen on the Benchmark & Market tab, from its price cache
  const prefs = useMemo(() => loadPrefs(), []);
  const def = benchOf(prefs);
  const closed = useMemo(() => trades.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && t.exitTime).sort((x, y) => (x.exitTime as string).localeCompare(y.exitTime as string)), [trades]);
  const from = closed[0]?.exitTime?.slice(0, 10) ?? "", to = closed[closed.length - 1]?.exitTime?.slice(0, 10) ?? "";
  const [bench, setBench] = useState<Bench>({ state: "loading" });
  useEffect(() => {
    if (!from) return;
    let live = true;
    setBench({ state: "loading" });
    loadDaily(`bench:${def.id}`, def.t, addDays(from, -10), addDays(to, 7)).then((r) => live && setBench("error" in r ? { state: "error", e: r.error } : { state: "ok", bars: r.bars }));
    return () => { live = false; };
  }, [def.id, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const pairs = useMemo(() => { const acct = from && bench.state === "ok" ? accountDays(closed, periodStart, flows, from, to) : null; return acct && bench.state === "ok" ? alignWithBenchmark(acct, bench.bars, from, to) : []; }, [closed, periodStart, flows, from, to, bench]);
  const bs = useMemo(() => benchStats(pairs, { rf: prefs.rf }), [pairs, prefs.rf]);

  // ----- formatting
  const f = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/^-(?=0(\.0+)?$)/, ""); // no "-0.00"
  const sgn = (n: number, d = 2, unit = "%") => { const s = f(n, d); return `${n > 0 && /[1-9]/.test(s) ? "+" : ""}${s}${unit}`; };
  const money = (n: number, sign = true) => fmtMoney(n, { sign, currency });
  const tone = (n: number | null | undefined) => (n == null ? NEUTRAL : n > 0 ? GREEN : n < 0 ? RED : NEUTRAL);
  const mix = (s: string) => (lang === "ar" ? `⁧${ltrNumbers(s)}⁩` : s); // words + numbers read in order in Arabic
  const fill = (x: L, o: Record<string, string | number>) => Object.entries(o).reduce((s, [kk, v]) => s.replace(`{${kk}}`, String(v)), T(x));
  const range = (r: Range, fmt: (x: number) => string) => `${fmt(r[0])} – ${fmt(r[1])}`;
  const none = (reason: string): V => ["—", NEUTRAL, reason];
  const num = (x: number | null, d = 2): V | null => (x == null ? null : [f(x, d), NEUTRAL, undefined]);

  // reasons
  const noTrades = T(TXT.noTrades), needStart = T(TXT.needStart);
  const daysWhy = !a.n ? noTrades : !(a.start > 0) ? needStart : fill(TXT.needDays, { n: MIN_DAYS, d: a.days });
  const sharpeWhy = !a.n ? noTrades : !(a.start > 0) ? needStart : fill(TXT.needSharpe, { n: SHARPE_DAYS, d: a.tradingDays });
  const tradesWhy = (min: number) => (!a.n ? noTrades : fill(TXT.needTrades, { n: min, d: a.n }));
  const enoughDays = a.days >= MIN_DAYS;
  const dailyWhy = (ok: boolean, otherwise: string) => (!enoughDays ? daysWhy : ok ? undefined : otherwise);
  const benchWhy = !a.n ? noTrades : bench.state === "loading" ? T(TXT.loading) : bench.state === "error" ? T(TXT.needBench) : !bs ? fill(TXT.needPairs, { n: 20, d: pairs.length }) : T(TXT.noBeta);

  const v = (id: string): V => {
    const S = a.start;
    switch (id) {
      // return distribution
      case "gmDaily": return a.gmDaily != null ? [sgn(a.gmDaily, 3), tone(a.gmDaily), undefined] : none(daysWhy);
      case "gmMonthly": return a.gmMonthly != null ? [sgn(a.gmMonthly), tone(a.gmMonthly), undefined] : none(!a.n ? noTrades : !(S > 0) ? needStart : fill(TXT.needMonths, { n: 2, d: a.months }));
      case "sdDaily": return a.sdDaily != null ? [`${f(a.sdDaily, 3)}%`, NEUTRAL, undefined] : none(daysWhy);
      case "sdMonthly": return a.sdMonthly != null ? [`${f(a.sdMonthly)}%`, NEUTRAL, undefined] : none(!a.n ? noTrades : !(S > 0) ? needStart : fill(TXT.needMonths, { n: 3, d: a.months }));
      case "skew": return num(a.skew) ?? none(daysWhy);
      case "kurt": return num(a.kurt) ?? none(daysWhy);
      case "tail": return num(a.tail) ?? none(dailyWhy(false, T(TXT.flatTail)) as string);
      case "g2p": return a.g2p != null ? [f(a.g2p), tone(a.g2p), undefined] : none(dailyWhy(false, T(TXT.noLossDay)) as string);
      case "g2l": return num(a.g2l) ?? none(dailyWhy(false, T(TXT.noLossDay)) as string);
      case "csr": return num(a.csr) ?? none(dailyWhy(false, a.tail == null ? T(TXT.flatTail) : T(TXT.noLossDay)) as string);
      case "cpc": return num(a.cpc) ?? none(dailyWhy(false, T(TXT.noLossDay)) as string);
      case "outWin": return num(a.outWin) ?? none(daysWhy);
      case "outLoss": return num(a.outLoss) ?? none(dailyWhy(false, T(TXT.noLossDay)) as string);
      case "posOut": return a.posOut != null ? [String(a.posOut), NEUTRAL, undefined] : none(daysWhy);
      case "negOut": return a.negOut != null ? [String(a.negOut), NEUTRAL, undefined] : none(daysWhy);
      case "autoc": return num(a.autoc) ?? none(daysWhy);
      case "stab": return num(a.stab) ?? none(daysWhy);
      case "r2": return num(a.r2) ?? none(tradesWhy(MIN_TRADES));
      case "runsZ": return a.runsZ != null ? [sgn(a.runsZ, 2, ""), NEUTRAL, undefined] : none(!a.n ? noTrades : fill(TXT.needWL, { n: MIN_DAYS }));
      // return to risk
      case "consist": return num(a.consist) ?? none(!a.n ? noTrades : !(S > 0) ? needStart : tradesWhy(MIN_TRADES));
      case "acSharpe": return a.acSharpe != null ? [f(a.acSharpe), tone(a.acSharpe), undefined] : none(sharpeWhy);
      case "acSortino": return a.acSortino != null ? [f(a.acSortino), tone(a.acSortino), undefined] : none(sharpeWhy);
      case "psr": return a.psr != null ? [`${f(a.psr, 1)}%`, NEUTRAL, undefined] : none(sharpeWhy);
      case "burke": return num(a.burke) ?? none(dailyWhy(false, T(TXT.noDD)) as string);
      case "mBurke": return num(a.mBurke) ?? none(dailyWhy(false, T(TXT.noDD)) as string);
      case "painIdx": return a.painIdx != null ? [`${f(a.painIdx)}%`, NEUTRAL, undefined] : none(daysWhy);
      case "painRatio": return num(a.painRatio) ?? none(dailyWhy(false, T(TXT.noDD)) as string);
      case "upi": return num(a.upi) ?? none(dailyWhy(false, T(TXT.noDD)) as string);
      case "ir": return bs?.infoRatio != null ? [f(bs.infoRatio), tone(bs.infoRatio), undefined] : none(benchWhy);
      case "treynor": return bs?.treynor != null ? [f(bs.treynor), tone(bs.treynor), undefined] : none(benchWhy);
      case "te": return bs?.trackingError != null ? [`${f(bs.trackingError)}%`, NEUTRAL, undefined] : none(benchWhy);
      case "active": return bs?.active != null ? [sgn(bs.active), tone(bs.active), undefined] : none(benchWhy);
      // confidence
      case "ciWin": return a.ciWin ? [range(a.ciWin, (x) => `${f(x, 1)}%`), NEUTRAL, undefined] : none(tradesWhy(MIN_TRADES));
      case "ciExp": return a.ciExp ? [range(a.ciExp, (x) => money(x)), NEUTRAL, undefined] : none(tradesWhy(MIN_TRADES));
      case "ciPf": return a.ciPf ? [range(a.ciPf, (x) => (Number.isFinite(x) ? f(x) : "∞")), NEUTRAL, undefined] : none(tradesWhy(MIN_TRADES));
      case "ciMed": return a.ciMed ? [range(a.ciMed, (x) => sgn(x)), NEUTRAL, undefined] : none(!(S > 0) && a.n ? needStart : tradesWhy(MIN_TRADES));
      case "ciRet": return a.ciRet ? [range(a.ciRet, (x) => sgn(x, 3)), NEUTRAL, undefined] : none(daysWhy);
      case "minTrl": return a.minTrl != null ? [mix(fill(TXT.days, { n: Math.ceil(a.minTrl).toLocaleString("en-US"), d: a.days })), a.minTrl <= a.days ? GREEN : NEUTRAL, undefined] : none(a.srDaily != null && a.srDaily <= 0 && a.tradingDays >= SHARPE_DAYS ? T(TXT.notPositive) : sharpeWhy);
      // simulation and sizing
      case "kelly": return a.kelly ? [a.kelly.capped ? T(TXT.capped) : `${f(a.kelly.full)}%`, NEUTRAL, undefined] : none(!a.n ? noTrades : fill(TXT.needR, { n: 20, d: a.rN }));
      case "fKelly": return a.kelly ? [`${f(a.kelly.half)}%`, NEUTRAL, undefined] : none(!a.n ? noTrades : fill(TXT.needR, { n: 20, d: a.rN }));
    }
    const mc = a.mc;
    if (!mc) return none(!a.n ? noTrades : T(TXT.needTwo));
    const pctOf = (x: number) => (S > 0 ? (x / S) * 100 : null);
    const withPct = (x: number): V => { const p = pctOf(x); return [p == null ? money(x) : `${sgn(p)} (${money(x)})`, tone(x), p == null ? needStart : undefined]; };
    const loss = (x: number): V => { const p = pctOf(-x); return [p == null ? money(-x) : `${money(-x)} (${sgn(p)})`, x > 0 ? RED : NEUTRAL, p == null ? needStart : undefined]; };
    switch (id) {
      case "ruin": return mc.ruin != null ? [`${f(mc.ruin, 1)}%`, mc.ruin > 0 ? RED : NEUTRAL, undefined] : none(needStart);
      case "mcProfit": return [`${f(mc.probProfit, 0)}%`, NEUTRAL, undefined];
      case "mcMed": return withPct(mc.med);
      case "mc5": return withPct(mc.p5);
      case "mcDD": return loss(mc.ddMed);
      case "mcDD95": return loss(mc.dd95);
      case "mcRec": return mc.rec != null ? [mix(fill(TXT.trades, { n: f(mc.rec, 0) })), NEUTRAL, undefined] : none(fill(TXT.noRec, { h: mc.horizon }));
    }
    return ["—", NEUTRAL, undefined];
  };
  const items = (m: M[]): Item[] => m.map(([id, l, tip]) => { const [value, color, reason] = v(id); return { id, label: T(l), tip: T(tip), value, color, reason }; });
  const n = S1.length + S2.length + S3.length + S4.length;
  const sec = [[<BarChart3 size={18} />, TXT.s1, TXT.s1d, S1], [<Gauge size={18} />, TXT.s2, TXT.s2d, S2], [<ShieldCheck size={18} />, TXT.s3, TXT.s3d, S3], [<FlaskConical size={18} />, TXT.s4, TXT.s4d, S4]] as const;
  return (
    <div className="space-y-5">
      <ViewHeader title={T(ADV_TAB)} sub={T(TXT.sub)} badge={`${n} ${lang === "ar" ? "مقياس" : lang === "fr" ? "métriques" : "metrics"}`} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      {sec.map(([icon, t, d, m]) => <MetricSection key={t[0]} icon={icon} title={T(t)} subtitle={T(d)} view={view} items={items(m as M[])} />)}
    </div>
  );
}
