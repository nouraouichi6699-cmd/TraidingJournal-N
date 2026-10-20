import { useState } from "react";
import { Activity, Crosshair, Timer } from "lucide-react";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import type { Lang } from "../types";

type L = [string, string, string]; // en, ar, fr
type M = [string, L, L]; // id, label, tip
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const PATH_TAB: L = ["Trade path", "مسار الصفقة", "Parcours du trade"];
const TXT = {
  sub: ["Excursion, exit quality and timing of the price path while trades are open.", "الحركة المواتية والعكسية وجودة الخروج وتوقيت مسار السعر أثناء الصفقة.", "Excursion, qualité de sortie et chronologie du parcours des trades."] as L,
  soon: ["Coming soon", "قريباً", "Bientôt"] as L,
  tipSoon: ["Not available yet: needs the intra-trade price path.", "غير متاح بعد: يحتاج مسار السعر داخل الصفقة.", "Pas encore disponible : nécessite le parcours de prix."] as L,
  s1: ["Excursion", "الحركة داخل الصفقة", "Excursion"] as L,
  s1d: ["Favourable and adverse movement observed while trades are open.", "الحركة المواتية والعكسية أثناء بقاء الصفقات مفتوحة.", "Mouvement favorable et adverse observé pendant les trades."] as L,
  s2: ["Capture & exit quality", "الالتقاط وجودة الخروج", "Capture & qualité de sortie"] as L,
  s2d: ["How much available opportunity is retained at close.", "مقدار الفرصة المتاحة التي تحتفظ بها عند الإغلاق.", "Part de l'opportunité conservée à la clôture."] as L,
  s3: ["Path timing & stability", "توقيت المسار وثباته", "Chronologie & stabilité"] as L,
  s3d: ["Time spent in heat, profit, stagnation, and recovery.", "الوقت المقضي في الخسارة والربح والركود والتعافي.", "Temps passé en perte, profit, stagnation et récupération."] as L,
};
const S1: M[] = [
  ["avgMfe", ["Average maximum favourable excursion", "متوسط أقصى حركة مواتية (MFE)", "MFE moyen"], ["Average best unrealised profit reached during a trade.", "متوسط أفضل ربح غير محقق بلغته الصفقة.", "Meilleur profit latent moyen atteint."]],
  ["medMfe", ["Median maximum favourable excursion", "وسيط أقصى حركة مواتية", "MFE médian"], ["Median best unrealised profit reached.", "وسيط أفضل ربح غير محقق.", "Meilleur profit latent médian."]],
  ["avgMae", ["Average maximum adverse excursion", "متوسط أقصى حركة عكسية (MAE)", "MAE moyen"], ["Average worst unrealised loss during a trade.", "متوسط أسوأ خسارة غير محققة أثناء الصفقة.", "Pire perte latente moyenne."]],
  ["medMae", ["Median maximum adverse excursion", "وسيط أقصى حركة عكسية", "MAE médian"], ["Median worst unrealised loss.", "وسيط أسوأ خسارة غير محققة.", "Pire perte latente médiane."]],
  ["mfePct", ["Average MFE as balance percentage", "متوسط MFE كنسبة من الرصيد", "MFE moyen en % du capital"], ["Average MFE relative to account balance.", "متوسط MFE نسبةً إلى رصيد الحساب.", "MFE moyen rapporté au capital."]],
  ["maePct", ["Average MAE as balance percentage", "متوسط MAE كنسبة من الرصيد", "MAE moyen en % du capital"], ["Average MAE relative to account balance.", "متوسط MAE نسبةً إلى رصيد الحساب.", "MAE moyen rapporté au capital."]],
  ["mfeAtr", ["Average MFE in ATR", "متوسط MFE بوحدات ATR", "MFE moyen en ATR"], ["Average MFE measured in average true range units.", "متوسط MFE مقاساً بوحدات ATR.", "MFE moyen exprimé en ATR."]],
  ["maeAtr", ["Average MAE in ATR", "متوسط MAE بوحدات ATR", "MAE moyen en ATR"], ["Average MAE measured in average true range units.", "متوسط MAE مقاساً بوحدات ATR.", "MAE moyen exprimé en ATR."]],
  ["earlyFav", ["Average early favourable response", "متوسط الاستجابة المواتية المبكرة", "Réponse favorable précoce moyenne"], ["Average profit reached early in the trade.", "متوسط الربح المحقق مبكراً في الصفقة.", "Profit moyen atteint tôt dans le trade."]],
  ["earlyAdv", ["Average early adverse heat", "متوسط الضغط العكسي المبكر", "Pression adverse précoce moyenne"], ["Average loss suffered early in the trade.", "متوسط الخسارة المتكبدة مبكراً في الصفقة.", "Perte moyenne subie tôt dans le trade."]],
  ["amp", ["Average trade P&L path amplitude", "متوسط اتساع مسار ربح/خسارة الصفقة", "Amplitude moyenne du P&L du trade"], ["Average distance between best and worst floating P&L.", "متوسط المسافة بين أفضل وأسوأ ربح عائم.", "Écart moyen entre meilleur et pire P&L latent."]],
  ["var", ["Average floating P&L variability", "متوسط تذبذب الربح/الخسارة العائم", "Variabilité moyenne du P&L latent"], ["Average volatility of the floating P&L.", "متوسط تقلب الربح/الخسارة العائم.", "Volatilité moyenne du P&L latent."]],
  ["tMfe", ["Average time to MFE", "متوسط الزمن حتى MFE", "Temps moyen jusqu'au MFE"], ["Average time from entry to the best point.", "متوسط الزمن من الدخول إلى أفضل نقطة.", "Temps moyen entrée → meilleur point."]],
  ["tMae", ["Average time to MAE", "متوسط الزمن حتى MAE", "Temps moyen jusqu'au MAE"], ["Average time from entry to the worst point.", "متوسط الزمن من الدخول إلى أسوأ نقطة.", "Temps moyen entrée → pire point."]],
];
const S2: M[] = [
  ["avgCap", ["Average MFE capture", "متوسط التقاط MFE", "Capture MFE moyenne"], ["Realised profit ÷ MFE, on average.", "الربح المحقق ÷ MFE في المتوسط.", "Profit réalisé ÷ MFE, en moyenne."]],
  ["medCap", ["Median MFE capture", "وسيط التقاط MFE", "Capture MFE médiane"], ["Median of realised profit ÷ MFE.", "وسيط الربح المحقق ÷ MFE.", "Médiane du profit réalisé ÷ MFE."]],
  ["giveback", ["Average peak giveback", "متوسط التنازل عن القمة", "Restitution moyenne du pic"], ["Average profit given back from the peak.", "متوسط الربح المتنازل عنه من القمة.", "Profit moyen rendu depuis le pic."]],
  ["givebackPct", ["Average peak giveback percentage", "متوسط نسبة التنازل عن القمة", "Restitution moyenne du pic (%)"], ["Giveback as a share of the peak profit.", "التنازل كنسبة من ربح القمة.", "Restitution en % du profit au pic."]],
  ["closeLoc", ["Average close location", "متوسط موقع الإغلاق", "Position moyenne de clôture"], ["Where the close sits between the trade's low and high.", "موقع الإغلاق بين أدنى وأعلى نقطة في الصفقة.", "Position de la clôture entre plus bas et plus haut."]],
  ["velocity", ["Average profit velocity", "متوسط سرعة الربح", "Vitesse moyenne du profit"], ["Profit per unit of time.", "الربح لكل وحدة زمن.", "Profit par unité de temps."]],
  ["winCap", ["Winning trade MFE capture", "التقاط MFE للصفقات الرابحة", "Capture MFE des trades gagnants"], ["MFE capture for winning trades only.", "التقاط MFE للصفقات الرابحة فقط.", "Capture MFE des trades gagnants seulement."]],
  ["loseRec", ["Losing trade recovery from MAE", "تعافي الصفقات الخاسرة من MAE", "Récupération des perdants depuis le MAE"], ["How much of the worst loss was recovered before close.", "مقدار ما استُرد من أسوأ خسارة قبل الإغلاق.", "Part de la pire perte récupérée avant la clôture."]],
];
const S3: M[] = [
  ["tBelow", ["Average time below breakeven", "متوسط الزمن تحت التعادل", "Temps moyen sous le point mort"], ["Average time spent in loss.", "متوسط الزمن المقضي في خسارة.", "Temps moyen passé en perte."]],
  ["tBelowPct", ["Average time below breakeven percentage", "متوسط نسبة الزمن تحت التعادل", "Temps moyen sous le point mort (%)"], ["Share of trade duration spent in loss.", "نسبة مدة الصفقة المقضية في خسارة.", "Part de la durée passée en perte."]],
  ["tBe", ["Average time to breakeven", "متوسط الزمن حتى التعادل", "Temps moyen jusqu'au point mort"], ["Average time to first reach breakeven.", "متوسط الزمن لبلوغ التعادل أول مرة.", "Temps moyen pour atteindre le point mort."]],
  ["tBePct", ["Average time to breakeven percentage", "متوسط نسبة الزمن حتى التعادل", "Temps jusqu'au point mort (%)"], ["Time to breakeven as a share of duration.", "الزمن حتى التعادل كنسبة من المدة.", "Temps jusqu'au point mort en % de la durée."]],
  ["tPeak", ["Average time to peak profit", "متوسط الزمن حتى قمة الربح", "Temps moyen jusqu'au pic de profit"], ["Average time to the highest profit.", "متوسط الزمن حتى أعلى ربح.", "Temps moyen jusqu'au profit maximal."]],
  ["tPeakClose", ["Average time from peak to close", "متوسط الزمن من القمة إلى الإغلاق", "Temps moyen du pic à la clôture"], ["Average time between the peak and the exit.", "متوسط الزمن بين القمة والخروج.", "Temps moyen entre le pic et la sortie."]],
  ["postPeak", ["Average post-peak time percentage", "متوسط نسبة الزمن بعد القمة", "Temps après pic moyen (%)"], ["Share of duration spent after the peak.", "نسبة المدة المقضية بعد القمة.", "Part de la durée après le pic."]],
  ["tFav", ["Average time in favourable territory", "متوسط الزمن في المنطقة المواتية", "Temps moyen en zone favorable"], ["Average time spent in profit.", "متوسط الزمن المقضي في ربح.", "Temps moyen passé en profit."]],
  ["recMae", ["Average recovery time from MAE", "متوسط زمن التعافي من MAE", "Temps moyen de récupération du MAE"], ["Average time to recover from the worst point.", "متوسط الزمن للتعافي من أسوأ نقطة.", "Temps moyen pour se redresser du pire point."]],
  ["cross", ["Average breakeven crossings", "متوسط عبور نقطة التعادل", "Passages moyens du point mort"], ["Average times the P&L crossed breakeven.", "متوسط مرات عبور الربح/الخسارة لنقطة التعادل.", "Nombre moyen de passages du point mort."]],
  ["stag", ["Average stagnation time", "متوسط زمن الركود", "Temps moyen de stagnation"], ["Average time with little price movement.", "متوسط الزمن بحركة سعر ضعيفة.", "Temps moyen avec peu de mouvement."]],
  ["nearBe", ["Average time near breakeven", "متوسط الزمن قرب التعادل", "Temps moyen près du point mort"], ["Average time close to breakeven.", "متوسط الزمن القريب من التعادل.", "Temps moyen proche du point mort."]],
  ["area", ["Average trade pain area", "متوسط مساحة الألم في الصفقة", "Aire de douleur moyenne"], ["Average area under breakeven (depth × time).", "متوسط المساحة تحت التعادل (العمق × الزمن).", "Aire moyenne sous le point mort."]],
  ["cover", ["Price-path metric coverage", "تغطية مقاييس مسار السعر", "Couverture des métriques de parcours"], ["Share of trades with price-path data.", "نسبة الصفقات التي لها بيانات مسار سعر.", "Part des trades avec données de parcours."]],
];

export default function PathTab({ lang }: { lang: Lang }) {
  const k = i(lang), T = (x: L) => x[k];
  const [view, setView] = useState<View>("grid");
  const items = (m: M[]): Item[] => m.map(([id, l, tip]) => ({ id, label: T(l), tip: T(tip), value: T(TXT.soon), color: "var(--primary)", reason: T(TXT.tipSoon) }));
  const n = S1.length + S2.length + S3.length;
  const sec = [[<Activity size={18} />, TXT.s1, TXT.s1d, S1], [<Crosshair size={18} />, TXT.s2, TXT.s2d, S2], [<Timer size={18} />, TXT.s3, TXT.s3d, S3]] as const;
  return (
    <div className="space-y-5">
      <ViewHeader title={T(PATH_TAB)} sub={T(TXT.sub)} badge={`${n} ${lang === "ar" ? "مقياس" : lang === "fr" ? "métriques" : "metrics"}`} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      {sec.map(([icon, t, d, m]) => <MetricSection key={t[0]} icon={icon} title={T(t)} subtitle={T(d)} view={view} items={items(m as M[])} />)}
    </div>
  );
}
