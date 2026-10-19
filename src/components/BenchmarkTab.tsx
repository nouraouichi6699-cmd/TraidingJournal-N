import { useState } from "react";
import { GitCompareArrows, Globe2 } from "lucide-react";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import type { Lang } from "../types";

type L = [string, string, string]; // en, ar, fr
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const BENCH_TAB: L = ["Benchmark & Market", "المقارنة والسوق", "Référence & marché"];
const TXT = {
  title: ["Benchmark & market analysis", "تحليل المقارنة بالمعيار والسوق", "Analyse référence & marché"] as L,
  sub: ["Compare your results with a market benchmark and the conditions you traded in.", "قارن نتائجك بمعيار السوق وبالظروف التي تداولت فيها.", "Comparez vos résultats à une référence de marché et à vos conditions de trading."] as L,
  soon: ["Coming soon", "قريباً", "Bientôt"] as L,
  tipSoon: ["Not available yet: needs benchmark price data.", "غير متاح بعد: يحتاج بيانات أسعار المعيار.", "Pas encore disponible : nécessite les prix de la référence."] as L,
  s1: ["Benchmark-relative performance", "الأداء مقابل المعيار", "Performance relative à la référence"] as L,
  s1d: ["Performance measured against an explicitly selected market benchmark.", "الأداء مقاساً بمعيار سوق تختاره صراحةً.", "Performance mesurée par rapport à une référence choisie."] as L,
  s2: ["Market context", "سياق السوق", "Contexte de marché"] as L,
  s2d: ["How entries and results relate to volatility and market conditions.", "كيف ترتبط الدخولات والنتائج بالتقلب وظروف السوق.", "Lien entre entrées, résultats, volatilité et conditions de marché."] as L,
};
const M1: [string, L, L][] = [
  ["benchReturn", ["Benchmark return", "عائد المعيار", "Rendement de la référence"], ["Return of the selected benchmark over the same period.", "عائد المعيار المختار خلال نفس الفترة.", "Rendement de la référence sur la même période."]],
  ["excess", ["Excess return versus benchmark", "العائد الزائد مقابل المعيار", "Rendement excédentaire"], ["Your return minus the benchmark return.", "عائدك مطروحاً منه عائد المعيار.", "Votre rendement moins celui de la référence."]],
  ["alpha", ["Alpha", "ألفا", "Alpha"], ["Return not explained by market exposure.", "العائد الذي لا تفسره حركة السوق.", "Rendement non expliqué par le marché."]],
  ["beta", ["Beta", "بيتا", "Bêta"], ["Sensitivity of your returns to the benchmark.", "حساسية عوائدك لحركة المعيار.", "Sensibilité de vos rendements à la référence."]],
  ["corr", ["Benchmark correlation", "الارتباط بالمعيار", "Corrélation"], ["How closely your returns move with the benchmark.", "مدى تحرك عوائدك مع المعيار.", "Degré de co-mouvement avec la référence."]],
  ["upCap", ["Up capture ratio", "نسبة التقاط الصعود", "Capture haussière"], ["Share of benchmark gains you captured in up periods.", "حصتك من مكاسب المعيار في فترات الصعود.", "Part des gains de la référence captée."]],
  ["downCap", ["Down capture ratio", "نسبة التقاط الهبوط", "Capture baissière"], ["Share of benchmark losses you took in down periods.", "حصتك من خسائر المعيار في فترات الهبوط.", "Part des pertes de la référence subie."]],
  ["relStr", ["Relative strength", "القوة النسبية", "Force relative"], ["Your equity growth relative to the benchmark.", "نمو رصيدك نسبةً إلى المعيار.", "Croissance de votre capital relative à la référence."]],
  ["active", ["Active return", "العائد النشط", "Rendement actif"], ["Return gained from your own decisions versus the benchmark.", "العائد الناتج عن قراراتك مقارنةً بالمعيار.", "Rendement issu de vos décisions vs la référence."]],
  ["te", ["Tracking error", "خطأ التتبع", "Tracking error"], ["Volatility of the difference to the benchmark.", "تقلب الفرق بينك وبين المعيار.", "Volatilité de l'écart à la référence."]],
  ["ir", ["Information ratio", "نسبة المعلومات", "Ratio d'information"], ["Active return per unit of tracking error.", "العائد النشط لكل وحدة خطأ تتبع.", "Rendement actif par unité de tracking error."]],
  ["treynor", ["Treynor ratio", "نسبة تريينور", "Ratio de Treynor"], ["Excess return per unit of market risk (beta).", "العائد الزائد لكل وحدة مخاطر سوق (بيتا).", "Rendement excédentaire par unité de bêta."]],
  ["r2", ["Benchmark R-squared", "R² مقابل المعيار", "R² de la référence"], ["Share of your return variance explained by the benchmark.", "نسبة تباين عوائدك التي يفسرها المعيار.", "Part de variance expliquée par la référence."]],
];
const M2: [string, L, L][] = [
  ["entryLoc", ["Average entry location in session range", "متوسط موقع الدخول في نطاق الجلسة", "Position moyenne d'entrée dans la plage"], ["Where your entries sit between the session low and high.", "موقع دخولاتك بين أدنى وأعلى سعر في الجلسة.", "Position de vos entrées entre le plus bas et le plus haut."]],
  ["trendTrades", ["Trend-aligned trades", "الصفقات مع الاتجاه", "Trades dans le sens de la tendance"], ["Share of trades taken in the direction of the trend.", "نسبة الصفقات المنفذة باتجاه الترند.", "Part des trades dans le sens de la tendance."]],
  ["trendWin", ["Trend-aligned trade win rate", "نسبة ربح الصفقات مع الاتجاه", "Taux de gain avec la tendance"], ["Win rate of trend-aligned trades.", "نسبة ربح الصفقات باتجاه الترند.", "Taux de gain des trades dans le sens de la tendance."]],
  ["counterWin", ["Countertrend trade win rate", "نسبة ربح الصفقات عكس الاتجاه", "Taux de gain contre-tendance"], ["Win rate of countertrend trades.", "نسبة ربح الصفقات عكس الترند.", "Taux de gain des trades contre-tendance."]],
  ["lowVol", ["Low-volatility regime return", "عائد نظام التقلب المنخفض", "Rendement – faible volatilité"], ["Your return when market volatility was low.", "عائدك عندما كان تقلب السوق منخفضاً.", "Votre rendement en faible volatilité."]],
  ["normVol", ["Normal-volatility regime return", "عائد نظام التقلب الطبيعي", "Rendement – volatilité normale"], ["Your return when market volatility was normal.", "عائدك عندما كان تقلب السوق طبيعياً.", "Votre rendement en volatilité normale."]],
  ["highVol", ["High-volatility regime return", "عائد نظام التقلب المرتفع", "Rendement – forte volatilité"], ["Your return when market volatility was high.", "عائدك عندما كان تقلب السوق مرتفعاً.", "Votre rendement en forte volatilité."]],
  ["bestVol", ["Best-performing volatility regime", "أفضل نظام تقلب أداءً", "Meilleur régime de volatilité"], ["The volatility regime where you performed best.", "نظام التقلب الذي كان أداؤك فيه الأفضل.", "Régime où votre performance est la meilleure."]],
  ["barsDur", ["Average trade duration in bars", "متوسط مدة الصفقة بالشموع", "Durée moyenne en bougies"], ["Average holding time measured in chart bars.", "متوسط مدة الاحتفاظ مقاسةً بالشموع.", "Durée moyenne de détention en bougies."]],
  ["relTrade", ["Average benchmark-relative trade return", "متوسط عائد الصفقة نسبةً إلى المعيار", "Rendement moyen relatif par trade"], ["Average trade return minus the benchmark move over the same time.", "متوسط عائد الصفقة مطروحاً منه حركة المعيار في نفس المدة.", "Rendement moyen du trade moins la référence."]],
];

export default function BenchmarkTab({ lang }: { lang: Lang }) {
  const k = i(lang), T = (x: L) => x[k];
  const [view, setView] = useState<View>("grid");
  const items = (m: [string, L, L][]): Item[] => m.map(([id, l, tip]) => ({ id, label: T(l), tip: T(tip), value: T(TXT.soon), color: "var(--primary)", reason: T(TXT.tipSoon) }));
  return (
    <div className="space-y-5">
      <ViewHeader title={T(TXT.title)} sub={T(TXT.sub)} badge={T(TXT.soon)} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      <MetricSection icon={<GitCompareArrows size={18} />} title={T(TXT.s1)} subtitle={T(TXT.s1d)} view={view} items={items(M1)} />
      <MetricSection icon={<Globe2 size={18} />} title={T(TXT.s2)} subtitle={T(TXT.s2d)} view={view} items={items(M2)} />
    </div>
  );
}
