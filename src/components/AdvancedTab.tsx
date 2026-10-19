import { useState } from "react";
import { BarChart3, FlaskConical, Gauge, ShieldCheck } from "lucide-react";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import type { Lang } from "../types";

type L = [string, string, string]; // en, ar, fr
type M = [string, L, L]; // id, label, tip
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const ADV_TAB: L = ["Advanced statistics", "إحصاءات متقدمة", "Statistiques avancées"];
const TXT = {
  sub: ["Return distribution, advanced risk ratios, confidence and simulation.", "توزيع العوائد ونسب المخاطرة المتقدمة والثقة والمحاكاة.", "Distribution des rendements, ratios de risque avancés, confiance et simulation."] as L,
  soon: ["Coming soon", "قريباً", "Bientôt"] as L,
  tipSoon: ["Not available yet.", "غير متاح بعد.", "Pas encore disponible."] as L,
  s1: ["Return distribution", "توزيع العوائد", "Distribution des rendements"] as L,
  s1d: ["Shape, persistence, and extremes in canonical periodic returns.", "شكل العوائد الدورية واستمراريتها وقيمها المتطرفة.", "Forme, persistance et extrêmes des rendements périodiques."] as L,
  s2: ["Advanced return-to-risk", "العائد إلى المخاطرة (متقدم)", "Rendement/risque avancé"] as L,
  s2d: ["Alternative measures of return efficiency and benchmark performance.", "مقاييس بديلة لكفاءة العائد والأداء مقابل المعيار.", "Mesures alternatives d'efficacité et de performance vs référence."] as L,
  s3: ["Confidence & robustness", "الثقة والمتانة", "Confiance & robustesse"] as L,
  s3d: ["Uncertainty ranges around the observed trading edge.", "نطاقات عدم اليقين حول ميزتك التداولية المرصودة.", "Plages d'incertitude autour de l'avantage observé."] as L,
  s4: ["Simulation & sizing", "المحاكاة وحجم المركز", "Simulation & taille de position"] as L,
  s4d: ["Modelled outcomes under explicit resampling and sizing assumptions.", "نتائج مُنمذجة وفق افتراضات إعادة العيّنة وحجم المركز.", "Résultats modélisés selon des hypothèses explicites."] as L,
};
const S1: M[] = [
  ["gmDaily", ["Geometric mean daily return", "المتوسط الهندسي للعائد اليومي", "Rendement quotidien moyen géométrique"], ["Compounded average daily return.", "متوسط العائد اليومي المركّب.", "Rendement quotidien moyen composé."]],
  ["gmMonthly", ["Geometric mean monthly return", "المتوسط الهندسي للعائد الشهري", "Rendement mensuel moyen géométrique"], ["Compounded average monthly return.", "متوسط العائد الشهري المركّب.", "Rendement mensuel moyen composé."]],
  ["sdDaily", ["Daily return standard deviation", "الانحراف المعياري للعائد اليومي", "Écart-type du rendement quotidien"], ["Spread of daily returns.", "تشتت العوائد اليومية.", "Dispersion des rendements quotidiens."]],
  ["sdMonthly", ["Monthly return standard deviation", "الانحراف المعياري للعائد الشهري", "Écart-type du rendement mensuel"], ["Spread of monthly returns.", "تشتت العوائد الشهرية.", "Dispersion des rendements mensuels."]],
  ["skew", ["Return skewness", "التواء العوائد", "Asymétrie des rendements"], ["Asymmetry of the return distribution.", "عدم تماثل توزيع العوائد.", "Asymétrie de la distribution."]],
  ["kurt", ["Return excess kurtosis", "التفرطح الزائد للعوائد", "Kurtosis excédentaire"], ["Fat tails compared with a normal distribution.", "ثِقل الأطراف مقارنةً بالتوزيع الطبيعي.", "Queues épaisses vs loi normale."]],
  ["tail", ["Tail ratio", "نسبة الذيل", "Ratio de queue"], ["95th percentile gain ÷ 5th percentile loss.", "مكسب الشريحة 95 ÷ خسارة الشريحة 5.", "Gain du 95e centile ÷ perte du 5e."]],
  ["g2p", ["Gain-to-pain ratio", "نسبة المكسب إلى الألم", "Ratio gain/douleur"], ["Total return ÷ sum of absolute losses.", "إجمالي العائد ÷ مجموع الخسائر المطلقة.", "Rendement total ÷ somme des pertes."]],
  ["g2l", ["Gain-to-loss ratio", "نسبة المكسب إلى الخسارة", "Ratio gain/perte"], ["Average gain ÷ average loss.", "متوسط المكسب ÷ متوسط الخسارة.", "Gain moyen ÷ perte moyenne."]],
  ["csr", ["Common sense ratio", "نسبة الحس العام", "Common sense ratio"], ["Profit factor × tail ratio.", "عامل الربح × نسبة الذيل.", "Profit factor × ratio de queue."]],
  ["cpc", ["CPC index", "مؤشر CPC", "Indice CPC"], ["Profit factor × win rate × payoff ratio.", "عامل الربح × نسبة الربح × نسبة العائد/الخسارة.", "Profit factor × taux de gain × payoff."]],
  ["outWin", ["Outlier win ratio", "نسبة الأرباح الشاذة", "Ratio de gains aberrants"], ["Share of total profit from outlier wins.", "حصة الأرباح الشاذة من إجمالي الربح.", "Part du profit issue de gains aberrants."]],
  ["outLoss", ["Outlier loss ratio", "نسبة الخسائر الشاذة", "Ratio de pertes aberrantes"], ["Share of total loss from outlier losses.", "حصة الخسائر الشاذة من إجمالي الخسارة.", "Part de la perte issue de pertes aberrantes."]],
  ["posOut", ["Positive return outliers", "العوائد الشاذة الموجبة", "Valeurs aberrantes positives"], ["Count of unusually large gains.", "عدد المكاسب الكبيرة بشكل غير معتاد.", "Nombre de gains exceptionnels."]],
  ["negOut", ["Negative return outliers", "العوائد الشاذة السالبة", "Valeurs aberrantes négatives"], ["Count of unusually large losses.", "عدد الخسائر الكبيرة بشكل غير معتاد.", "Nombre de pertes exceptionnelles."]],
  ["autoc", ["Return autocorrelation", "الارتباط الذاتي للعوائد", "Autocorrélation des rendements"], ["Correlation of a return with the previous one.", "ارتباط العائد بالذي سبقه.", "Corrélation d'un rendement avec le précédent."]],
  ["stab", ["Equity curve stability", "ثبات منحنى الرصيد", "Stabilité de la courbe de capital"], ["R² of log equity against time.", "R² للوغاريتم الرصيد مقابل الزمن.", "R² du log du capital vs temps."]],
  ["r2", ["Equity curve R-squared", "R² لمنحنى الرصيد", "R² de la courbe de capital"], ["How straight the equity curve is.", "مدى استقامة منحنى الرصيد.", "Linéarité de la courbe de capital."]],
  ["runsZ", ["Runs test Z-score", "اختبار التتابع Z", "Z-score du test des séries"], ["Tests whether wins and losses cluster randomly.", "يختبر عشوائية تجمّع الأرباح والخسائر.", "Teste le regroupement aléatoire gains/pertes."]],
];
const S2: M[] = [
  ["consist", ["Trade-return consistency ratio", "نسبة اتساق عوائد الصفقات", "Ratio de régularité des trades"], ["Mean trade return ÷ its standard deviation.", "متوسط عائد الصفقة ÷ انحرافه المعياري.", "Rendement moyen ÷ écart-type."]],
  ["acSharpe", ["Autocorrelation-adjusted Sharpe ratio", "نسبة شارب المعدّلة للارتباط الذاتي", "Sharpe ajusté de l'autocorrélation"], ["Sharpe corrected for serial correlation.", "شارب مصحّح للارتباط التسلسلي.", "Sharpe corrigé de la corrélation sérielle."]],
  ["acSortino", ["Autocorrelation-adjusted Sortino ratio", "نسبة سورتينو المعدّلة للارتباط الذاتي", "Sortino ajusté de l'autocorrélation"], ["Sortino corrected for serial correlation.", "سورتينو مصحّح للارتباط التسلسلي.", "Sortino corrigé de la corrélation sérielle."]],
  ["psr", ["Probabilistic Sharpe ratio", "نسبة شارب الاحتمالية", "Sharpe probabiliste"], ["Probability the true Sharpe exceeds a threshold.", "احتمال أن يتجاوز شارب الحقيقي حداً معيناً.", "Probabilité que le vrai Sharpe dépasse un seuil."]],
  ["burke", ["Burke ratio", "نسبة بورك", "Ratio de Burke"], ["Return ÷ root of squared drawdowns.", "العائد ÷ جذر مربعات التراجعات.", "Rendement ÷ racine des drawdowns²."]],
  ["mBurke", ["Modified Burke ratio", "نسبة بورك المعدّلة", "Ratio de Burke modifié"], ["Burke ratio scaled by the number of observations.", "نسبة بورك مضبوطة بعدد الملاحظات.", "Burke ajusté du nombre d'observations."]],
  ["painIdx", ["Pain index", "مؤشر الألم", "Indice de douleur"], ["Average depth of drawdowns over time.", "متوسط عمق التراجع عبر الزمن.", "Profondeur moyenne des drawdowns."]],
  ["painRatio", ["Pain ratio", "نسبة الألم", "Ratio de douleur"], ["Return ÷ pain index.", "العائد ÷ مؤشر الألم.", "Rendement ÷ indice de douleur."]],
  ["upi", ["Ulcer performance index", "مؤشر أداء القرحة", "Ulcer performance index"], ["Return ÷ ulcer index.", "العائد ÷ مؤشر القرحة.", "Rendement ÷ ulcer index."]],
  ["ir", ["Information ratio", "نسبة المعلومات", "Ratio d'information"], ["Active return per unit of tracking error.", "العائد النشط لكل وحدة خطأ تتبع.", "Rendement actif par unité de tracking error."]],
  ["treynor", ["Treynor ratio", "نسبة تريينور", "Ratio de Treynor"], ["Excess return per unit of beta.", "العائد الزائد لكل وحدة بيتا.", "Rendement excédentaire par unité de bêta."]],
  ["te", ["Tracking error", "خطأ التتبع", "Tracking error"], ["Volatility of the difference to the benchmark.", "تقلب الفرق عن المعيار.", "Volatilité de l'écart à la référence."]],
  ["active", ["Active return", "العائد النشط", "Rendement actif"], ["Return versus the benchmark.", "العائد مقابل المعيار.", "Rendement vs la référence."]],
];
const S3: M[] = [
  ["ciWin", ["Win rate confidence interval", "فترة الثقة لنسبة الربح", "Intervalle de confiance du taux de gain"], ["Likely range of the true win rate.", "النطاق المرجّح لنسبة الربح الحقيقية.", "Plage probable du vrai taux de gain."]],
  ["ciExp", ["Expectancy confidence interval", "فترة الثقة للتوقع", "Intervalle de confiance de l'espérance"], ["Likely range of the true expectancy.", "النطاق المرجّح للتوقع الحقيقي.", "Plage probable de la vraie espérance."]],
  ["ciPf", ["Profit factor confidence interval", "فترة الثقة لعامل الربح", "Intervalle de confiance du profit factor"], ["Likely range of the true profit factor.", "النطاق المرجّح لعامل الربح الحقيقي.", "Plage probable du vrai profit factor."]],
  ["ciMed", ["Median trade return confidence interval", "فترة الثقة لوسيط عائد الصفقة", "Intervalle de confiance du rendement médian"], ["Likely range of the true median trade return.", "النطاق المرجّح لوسيط عائد الصفقة الحقيقي.", "Plage probable du vrai rendement médian."]],
  ["ciRet", ["Return confidence interval", "فترة الثقة للعائد", "Intervalle de confiance du rendement"], ["Likely range of the true average return.", "النطاق المرجّح لمتوسط العائد الحقيقي.", "Plage probable du vrai rendement moyen."]],
  ["minTrl", ["Minimum track record length", "الحد الأدنى لطول السجل", "Longueur minimale de l'historique"], ["Observations needed to trust the Sharpe ratio.", "عدد الملاحظات اللازمة للوثوق بنسبة شارب.", "Observations nécessaires pour valider le Sharpe."]],
];
const S4: M[] = [
  ["kelly", ["Kelly criterion", "معيار كيلي", "Critère de Kelly"], ["Bet fraction that maximises long-run growth.", "نسبة المخاطرة التي تعظّم النمو طويل الأجل.", "Fraction maximisant la croissance à long terme."]],
  ["fKelly", ["Fractional Kelly criterion", "معيار كيلي الجزئي", "Kelly fractionnaire"], ["A safer fraction of the full Kelly size.", "جزء أكثر أماناً من حجم كيلي الكامل.", "Fraction plus prudente du Kelly complet."]],
  ["ruin", ["Estimated risk of ruin", "احتمال الإفلاس المقدّر", "Risque de ruine estimé"], ["Probability of losing the account at the current sizing.", "احتمال خسارة الحساب بحجم المخاطرة الحالي.", "Probabilité de perdre le compte."]],
  ["mcProfit", ["Monte Carlo probability of profit", "احتمال الربح (مونت كارلو)", "Probabilité de profit (Monte Carlo)"], ["Share of simulated paths ending in profit.", "نسبة المسارات المحاكاة التي تنتهي بربح.", "Part des trajectoires finissant en profit."]],
  ["mcMed", ["Monte Carlo median terminal return", "الوسيط النهائي للعائد (مونت كارلو)", "Rendement terminal médian (Monte Carlo)"], ["Median ending return across simulations.", "الوسيط لعائد النهاية عبر المحاكاة.", "Rendement final médian des simulations."]],
  ["mc5", ["Monte Carlo 5th percentile terminal return", "الشريحة 5 للعائد النهائي (مونت كارلو)", "5e centile du rendement terminal (Monte Carlo)"], ["A pessimistic ending return.", "عائد نهاية متشائم.", "Rendement final pessimiste."]],
  ["mcDD", ["Monte Carlo median maximum drawdown", "وسيط أقصى تراجع (مونت كارلو)", "Drawdown max médian (Monte Carlo)"], ["Median worst drawdown across simulations.", "وسيط أسوأ تراجع عبر المحاكاة.", "Pire drawdown médian des simulations."]],
  ["mcDD95", ["Monte Carlo 95th percentile maximum drawdown", "الشريحة 95 لأقصى تراجع (مونت كارلو)", "95e centile du drawdown max (Monte Carlo)"], ["A severe drawdown seen in 5% of simulations.", "تراجع حاد يظهر في 5% من المحاكاة.", "Drawdown sévère vu dans 5 % des cas."]],
  ["mcRec", ["Monte Carlo median recovery time", "وسيط زمن التعافي (مونت كارلو)", "Temps de récupération médian (Monte Carlo)"], ["Median time to recover from drawdowns.", "وسيط الزمن للتعافي من التراجعات.", "Temps médian de récupération."]],
];

export default function AdvancedTab({ lang }: { lang: Lang }) {
  const k = i(lang), T = (x: L) => x[k];
  const [view, setView] = useState<View>("grid");
  const items = (m: M[]): Item[] => m.map(([id, l, tip]) => ({ id, label: T(l), tip: T(tip), value: T(TXT.soon), color: "var(--primary)", reason: T(TXT.tipSoon) }));
  const n = S1.length + S2.length + S3.length + S4.length;
  const sec = [[<BarChart3 size={18} />, TXT.s1, TXT.s1d, S1], [<Gauge size={18} />, TXT.s2, TXT.s2d, S2], [<ShieldCheck size={18} />, TXT.s3, TXT.s3d, S3], [<FlaskConical size={18} />, TXT.s4, TXT.s4d, S4]] as const;
  return (
    <div className="space-y-5">
      <ViewHeader title={T(ADV_TAB)} sub={T(TXT.sub)} badge={`${n} ${lang === "ar" ? "مقياس" : lang === "fr" ? "métriques" : "metrics"}`} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      {sec.map(([icon, t, d, m]) => <MetricSection key={t[0]} icon={icon} title={T(t)} subtitle={T(d)} view={view} items={items(m as M[])} />)}
    </div>
  );
}
