import { useState } from "react";
import { ShieldAlert, PieChart } from "lucide-react";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import type { Lang } from "../types";

type L = [string, string, string]; // en, ar, fr
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const PORTFOLIO_TAB: L = ["Portfolio", "المحفظة", "Portefeuille"];
const TXT = {
  title: ["Portfolio", "المحفظة", "Portefeuille"] as L,
  sub: ["Combined portfolio contribution, concentration, diversification, and exposure.", "مساهمة المحفظة المجمّعة وتركّزها وتنوّعها وتعرّضها.", "Contribution, concentration, diversification et exposition du portefeuille."] as L,
  soon: ["Coming soon", "قريباً", "Bientôt"] as L,
  tipSoon: ["Not available yet.", "غير متاح بعد.", "Pas encore disponible."] as L,
  s1: ["Composition & contribution", "التركيب والمساهمة", "Composition & contribution"] as L,
  s1d: ["How accounts, symbols, and strategies contribute to the portfolio.", "كيف تساهم الحسابات والرموز والاستراتيجيات في المحفظة.", "Contribution des comptes, symboles et stratégies au portefeuille."] as L,
  s2: ["Portfolio risk", "مخاطر المحفظة", "Risque du portefeuille"] as L,
  s2d: ["Diversification, overlap, and combined portfolio exposure.", "التنويع والتداخل والتعرّض المجمّع للمحفظة.", "Diversification, chevauchement et exposition combinée."] as L,
};
const M1: [string, L, L][] = [
  ["accN", ["Accounts in portfolio", "الحسابات في المحفظة", "Comptes dans le portefeuille"], ["Number of accounts combined in the portfolio.", "عدد الحسابات المجمّعة في المحفظة.", "Nombre de comptes combinés."]],
  ["topAcc", ["Top account return contribution", "أعلى حساب مساهمةً في العائد", "Meilleur compte (contribution)"], ["Account that contributed most to portfolio return.", "الحساب الأكثر مساهمة في عائد المحفظة.", "Compte contribuant le plus au rendement."]],
  ["worstAcc", ["Worst account return contribution", "أضعف حساب مساهمةً في العائد", "Pire compte (contribution)"], ["Account that contributed least to portfolio return.", "الحساب الأقل مساهمة في عائد المحفظة.", "Compte contribuant le moins au rendement."]],
  ["topAccDD", ["Top account drawdown contribution", "أعلى حساب مساهمةً في التراجع", "Compte contribuant le plus au drawdown"], ["Account that contributed most to portfolio drawdown.", "الحساب الأكثر مساهمة في تراجع المحفظة.", "Compte contribuant le plus au drawdown."]],
  ["topSym", ["Top symbol return contribution", "أعلى رمز مساهمةً في العائد", "Meilleur symbole (contribution)"], ["Symbol that contributed most to portfolio return.", "الرمز الأكثر مساهمة في عائد المحفظة.", "Symbole contribuant le plus au rendement."]],
  ["worstSym", ["Worst symbol return contribution", "أضعف رمز مساهمةً في العائد", "Pire symbole (contribution)"], ["Symbol that contributed least to portfolio return.", "الرمز الأقل مساهمة في عائد المحفظة.", "Symbole contribuant le moins au rendement."]],
  ["topStrat", ["Top strategy return contribution", "أعلى استراتيجية مساهمةً في العائد", "Meilleure stratégie (contribution)"], ["Strategy that contributed most to portfolio return.", "الاستراتيجية الأكثر مساهمة في عائد المحفظة.", "Stratégie contribuant le plus au rendement."]],
  ["accConc", ["Account concentration", "تركّز الحسابات", "Concentration par compte"], ["How concentrated results are in a few accounts.", "مدى تركّز النتائج في عدد قليل من الحسابات.", "Concentration des résultats sur quelques comptes."]],
  ["symConc", ["Symbol concentration", "تركّز الرموز", "Concentration par symbole"], ["How concentrated results are in a few symbols.", "مدى تركّز النتائج في عدد قليل من الرموز.", "Concentration des résultats sur quelques symboles."]],
  ["stratConc", ["Strategy concentration", "تركّز الاستراتيجيات", "Concentration par stratégie"], ["How concentrated results are in a few strategies.", "مدى تركّز النتائج في عدد قليل من الاستراتيجيات.", "Concentration des résultats sur quelques stratégies."]],
];
const M2: [string, L, L][] = [
  ["pDD", ["Portfolio maximum equity drawdown", "أقصى تراجع لرصيد المحفظة", "Drawdown max du portefeuille"], ["Largest peak-to-trough fall of combined equity.", "أكبر هبوط من القمة إلى القاع للرصيد المجمّع.", "Plus forte baisse du capital combiné."]],
  ["avgCorr", ["Average account correlation", "متوسط ارتباط الحسابات", "Corrélation moyenne des comptes"], ["Average correlation between account returns.", "متوسط الارتباط بين عوائد الحسابات.", "Corrélation moyenne entre comptes."]],
  ["maxCorr", ["Maximum account correlation", "أقصى ارتباط بين حسابين", "Corrélation max entre comptes"], ["Highest correlation between any two accounts.", "أعلى ارتباط بين أي حسابين.", "Corrélation la plus forte entre deux comptes."]],
  ["divRatio", ["Diversification ratio", "نسبة التنويع", "Ratio de diversification"], ["Weighted account volatility ÷ portfolio volatility.", "التقلب المرجّح للحسابات ÷ تقلب المحفظة.", "Volatilité pondérée ÷ volatilité du portefeuille."]],
  ["marginal", ["Largest marginal risk contribution", "أكبر مساهمة هامشية في المخاطر", "Plus grande contribution marginale au risque"], ["Component adding the most risk to the portfolio.", "المكوّن الذي يضيف أكبر مخاطرة للمحفظة.", "Composant ajoutant le plus de risque."]],
  ["overlap", ["Concurrent position overlap", "تداخل الصفقات المتزامنة", "Chevauchement des positions"], ["Share of time positions are open at the same time.", "نسبة الوقت التي تكون فيها صفقات مفتوحة معاً.", "Part du temps avec positions simultanées."]],
  ["maxGross", ["Maximum gross exposure", "أقصى تعرّض إجمالي", "Exposition brute max"], ["Peak total long + short exposure.", "ذروة إجمالي تعرّض الشراء والبيع.", "Pic d'exposition long + short."]],
  ["maxNet", ["Maximum net exposure", "أقصى تعرّض صافٍ", "Exposition nette max"], ["Peak long minus short exposure.", "ذروة الشراء مطروحاً منه البيع.", "Pic d'exposition long moins short."]],
  ["avgGross", ["Average gross exposure", "متوسط التعرّض الإجمالي", "Exposition brute moyenne"], ["Average total long + short exposure.", "متوسط إجمالي تعرّض الشراء والبيع.", "Exposition long + short moyenne."]],
  ["avgNet", ["Average net exposure", "متوسط التعرّض الصافي", "Exposition nette moyenne"], ["Average long minus short exposure.", "متوسط الشراء مطروحاً منه البيع.", "Exposition long moins short moyenne."]],
  ["maxLev", ["Maximum effective leverage", "أقصى رافعة فعلية", "Levier effectif max"], ["Peak exposure ÷ equity.", "ذروة التعرّض ÷ الرصيد.", "Pic d'exposition ÷ capital."]],
  ["avgLev", ["Average effective leverage", "متوسط الرافعة الفعلية", "Levier effectif moyen"], ["Average exposure ÷ equity.", "متوسط التعرّض ÷ الرصيد.", "Exposition moyenne ÷ capital."]],
  ["var95", ["Portfolio value at risk (95%)", "القيمة المعرّضة للخطر للمحفظة (95%)", "Value at Risk du portefeuille (95 %)"], ["Loss not expected to be exceeded 95% of the time.", "خسارة لا يُتوقع تجاوزها في 95% من الحالات.", "Perte non dépassée dans 95 % des cas."]],
  ["es95", ["Portfolio expected shortfall (95%)", "العجز المتوقع للمحفظة (95%)", "Expected shortfall du portefeuille (95 %)"], ["Average loss in the worst 5% of cases.", "متوسط الخسارة في أسوأ 5% من الحالات.", "Perte moyenne dans les 5 % pires cas."]],
];

export default function PortfolioTab({ lang }: { lang: Lang }) {
  const k = i(lang), T = (x: L) => x[k];
  const [view, setView] = useState<View>("grid");
  const items = (m: [string, L, L][]): Item[] => m.map(([id, l, tip]) => ({ id, label: T(l), tip: T(tip), value: T(TXT.soon), color: "var(--primary)", reason: T(TXT.tipSoon) }));
  const n = M1.length + M2.length;
  return (
    <div className="space-y-5">
      <ViewHeader title={T(TXT.title)} sub={T(TXT.sub)} badge={`${n} ${lang === "ar" ? "مقياس" : lang === "fr" ? "métriques" : "metrics"}`} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      <MetricSection icon={<PieChart size={18} />} title={T(TXT.s1)} subtitle={T(TXT.s1d)} view={view} items={items(M1)} />
      <MetricSection icon={<ShieldAlert size={18} />} title={T(TXT.s2)} subtitle={T(TXT.s2d)} view={view} items={items(M2)} />
    </div>
  );
}
