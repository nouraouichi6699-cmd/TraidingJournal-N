import { useState } from "react";
import { Activity, Target, Timer } from "lucide-react";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import type { Lang } from "../types";

type L = [string, string, string]; // en, ar, fr
type M = [string, L, L]; // id, label, tip
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const EXC_TAB: L = ["Excursion & path", "الانحراف ومسار الصفقة", "Excursion & trajectoire"];
const TXT = {
  sub: ["What price did while your trades were open: excursions, exit quality and path timing.", "ما فعله السعر أثناء فتح صفقاتك: الانحرافات وجودة الخروج وتوقيت المسار.", "Ce que le prix a fait pendant vos trades : excursions, qualité de sortie et timing."] as L,
  soon: ["Coming soon", "قريباً", "Bientôt"] as L,
  tipSoon: ["Needs the price path of each trade (not available yet).", "يحتاج مسار سعر كل صفقة (غير متاح بعد).", "Nécessite la trajectoire de prix de chaque trade (pas encore disponible)."] as L,
  s1: ["Excursion", "الانحراف (MFE / MAE)", "Excursion"] as L,
  s1d: ["Favourable and adverse movement observed while trades are open.", "الحركة الإيجابية والسلبية أثناء فتح الصفقات.", "Mouvement favorable et défavorable pendant les trades."] as L,
  s2: ["Capture & exit quality", "الالتقاط وجودة الخروج", "Capture & qualité de sortie"] as L,
  s2d: ["How much available opportunity is retained at close.", "مقدار الفرصة المتاحة التي تحتفظ بها عند الإغلاق.", "Part de l'opportunité conservée à la clôture."] as L,
  s3: ["Path timing & stability", "توقيت المسار وثباته", "Timing & stabilité de la trajectoire"] as L,
  s3d: ["Time spent in heat, profit, stagnation, and recovery.", "الوقت المقضي في الخسارة والربح والركود والتعافي.", "Temps passé en perte, profit, stagnation et récupération."] as L,
};
const S1: M[] = [
  ["avgMfe", ["Average maximum favourable excursion", "متوسط أقصى حركة إيجابية", "Excursion favorable max moyenne"], ["Average best unrealised profit reached during a trade.", "متوسط أفضل ربح غير محقق بلغته الصفقة.", "Meilleur profit latent moyen atteint."]],
  ["medMfe", ["Median maximum favourable excursion", "وسيط أقصى حركة إيجابية", "Excursion favorable max médiane"], ["Median best unrealised profit during a trade.", "وسيط أفضل ربح غير محقق أثناء الصفقة.", "Meilleur profit latent médian."]],
  ["avgMae", ["Average maximum adverse excursion", "متوسط أقصى حركة سلبية", "Excursion défavorable max moyenne"], ["Average worst unrealised loss during a trade.", "متوسط أسوأ خسارة غير محققة أثناء الصفقة.", "Pire perte latente moyenne."]],
  ["medMae", ["Median maximum adverse excursion", "وسيط أقصى حركة سلبية", "Excursion défavorable max médiane"], ["Median worst unrealised loss during a trade.", "وسيط أسوأ خسارة غير محققة أثناء الصفقة.", "Pire perte latente médiane."]],
  ["mfePct", ["Average MFE as balance percentage", "متوسط MFE كنسبة من الرصيد", "MFE moyen en % du capital"], ["Average MFE relative to account balance.", "متوسط MFE نسبةً إلى رصيد الحساب.", "MFE moyen rapporté au capital."]],
  ["maePct", ["Average MAE as balance percentage", "متوسط MAE كنسبة من الرصيد", "MAE moyen en % du capital"], ["Average MAE relative to account balance.", "متوسط MAE نسبةً إلى رصيد الحساب.", "MAE moyen rapporté au capital."]],
  ["mfeAtr", ["Average MFE in ATR", "متوسط MFE بوحدات ATR", "MFE moyen en ATR"], ["Average MFE measured in average true range units.", "متوسط MFE مقاساً بوحدات ATR.", "MFE moyen exprimé en ATR."]],
  ["maeAtr", ["Average MAE in ATR", "متوسط MAE بوحدات ATR", "MAE moyen en ATR"], ["Average MAE measured in average true range units.", "متوسط MAE مقاساً بوحدات ATR.", "MAE moyen exprimé en ATR."]],
  ["early", ["Average early favourable response", "متوسط الاستجابة الإيجابية المبكرة", "Réponse favorable précoce moyenne"], ["How far trades move in your favour early on.", "مدى تحرك الصفقات لصالحك في بدايتها.", "Mouvement favorable en début de trade."]],
  ["heat", ["Average early adverse heat", "متوسط الضغط السلبي المبكر", "Chaleur défavorable précoce moyenne"], ["How far trades move against you early on.", "مدى تحرك الصفقات ضدك في بدايتها.", "Mouvement défavorable en début de trade."]],
  ["amp", ["Average trade P&L path amplitude", "متوسط اتساع مسار ربح/خسارة الصفقة", "Amplitude moyenne du P&L du trade"], ["Average range between best and worst floating P&L.", "متوسط المدى بين أفضل وأسوأ ربح عائم.", "Écart moyen entre meilleur et pire P&L latent."]],
  ["var", ["Average floating P&L variability", "متوسط تذبذب الربح العائم", "Variabilité moyenne du P&L latent"], ["Average standard deviation of floating P&L.", "متوسط الانحراف المعياري للربح العائم.", "Écart-type moyen du P&L latent."]],
  ["tMfe", ["Average time to MFE", "متوسط الزمن حتى MFE", "Temps moyen jusqu'au MFE"], ["Average time to reach the best point.", "متوسط الزمن للوصول إلى أفضل نقطة.", "Temps moyen pour atteindre le meilleur point."]],
  ["tMae", ["Average time to MAE", "متوسط الزمن حتى MAE", "Temps moyen jusqu'au MAE"], ["Average time to reach the worst point.", "متوسط الزمن للوصول إلى أسوأ نقطة.", "Temps moyen pour atteindre le pire point."]],
];
const S2: M[] = [
  ["capAvg", ["Average MFE capture", "متوسط التقاط MFE", "Capture MFE moyenne"], ["Realised profit ÷ MFE, averaged.", "الربح المحقق ÷ MFE (متوسط).", "Profit réalisé ÷ MFE, moyenné."]],
  ["capMed", ["Median MFE capture", "وسيط التقاط MFE", "Capture MFE médiane"], ["Median of realised profit ÷ MFE.", "وسيط الربح المحقق ÷ MFE.", "Médiane de profit réalisé ÷ MFE."]],
  ["giveback", ["Average peak giveback", "متوسط التنازل عن القمة", "Restitution moyenne du pic"], ["Profit given back from the peak to the close.", "الربح المتنازل عنه من القمة حتى الإغلاق.", "Profit rendu entre le pic et la clôture."]],
  ["givebackPct", ["Average peak giveback percentage", "نسبة التنازل عن القمة", "% moyen de restitution du pic"], ["Giveback as a share of peak profit.", "التنازل كنسبة من ربح القمة.", "Restitution en % du profit au pic."]],
  ["closeLoc", ["Average close location", "متوسط موقع الإغلاق", "Position moyenne de clôture"], ["Where the close sits between the trade's low and high.", "موقع الإغلاق بين أدنى وأعلى نقطة في الصفقة.", "Position de la clôture entre le bas et le haut."]],
  ["velocity", ["Average profit velocity", "متوسط سرعة الربح", "Vitesse de profit moyenne"], ["Profit gained per unit of time.", "الربح المكتسب لكل وحدة زمن.", "Profit gagné par unité de temps."]],
  ["winCap", ["Winning trade MFE capture", "التقاط MFE للصفقات الرابحة", "Capture MFE des trades gagnants"], ["MFE capture on winning trades only.", "التقاط MFE في الصفقات الرابحة فقط.", "Capture MFE des gagnants uniquement."]],
  ["loseRec", ["Losing trade recovery from MAE", "تعافي الصفقات الخاسرة من MAE", "Récupération des perdants depuis le MAE"], ["How much losing trades recovered from their worst point.", "مقدار تعافي الصفقات الخاسرة من أسوأ نقطة.", "Part récupérée depuis le pire point."]],
];
const S3: M[] = [
  ["tBelow", ["Average time below breakeven", "متوسط الزمن تحت التعادل", "Temps moyen sous le point mort"], ["Time spent at a floating loss.", "الوقت المقضي بخسارة عائمة.", "Temps passé en perte latente."]],
  ["tBelowPct", ["Average time below breakeven percentage", "نسبة الزمن تحت التعادل", "% moyen du temps sous le point mort"], ["Share of the trade spent below breakeven.", "حصة الصفقة تحت التعادل.", "Part du trade sous le point mort."]],
  ["tBe", ["Average time to breakeven", "متوسط الزمن حتى التعادل", "Temps moyen jusqu'au point mort"], ["Time until a trade first reaches breakeven.", "الزمن حتى تصل الصفقة للتعادل لأول مرة.", "Temps avant le premier point mort."]],
  ["tBePct", ["Average time to breakeven percentage", "نسبة الزمن حتى التعادل", "% moyen du temps jusqu'au point mort"], ["Time to breakeven as a share of the trade.", "الزمن حتى التعادل كنسبة من الصفقة.", "Temps jusqu'au point mort en % du trade."]],
  ["tPeak", ["Average time to peak profit", "متوسط الزمن حتى ذروة الربح", "Temps moyen jusqu'au pic de profit"], ["Time until the best floating profit.", "الزمن حتى أفضل ربح عائم.", "Temps jusqu'au meilleur profit latent."]],
  ["tPeakClose", ["Average time from peak to close", "متوسط الزمن من الذروة للإغلاق", "Temps moyen du pic à la clôture"], ["Time between the peak and the close.", "الزمن بين الذروة والإغلاق.", "Temps entre le pic et la clôture."]],
  ["postPeak", ["Average post-peak time percentage", "نسبة الزمن بعد الذروة", "% moyen du temps après le pic"], ["Share of the trade spent after its peak.", "حصة الصفقة بعد بلوغ الذروة.", "Part du trade après le pic."]],
  ["fav", ["Average time in favourable territory", "متوسط الزمن في منطقة الربح", "Temps moyen en territoire favorable"], ["Time spent at a floating profit.", "الوقت المقضي بربح عائم.", "Temps passé en profit latent."]],
  ["recMae", ["Average recovery time from MAE", "متوسط زمن التعافي من MAE", "Temps moyen de récupération depuis le MAE"], ["Time to recover from the worst point.", "الزمن للتعافي من أسوأ نقطة.", "Temps pour récupérer du pire point."]],
  ["cross", ["Average breakeven crossings", "متوسط عبور نقطة التعادل", "Passages moyens au point mort"], ["How often the P&L crosses zero during a trade.", "عدد مرات عبور الربح للصفر أثناء الصفقة.", "Nombre de passages du P&L par zéro."]],
  ["stag", ["Average stagnation time", "متوسط زمن الركود", "Temps moyen de stagnation"], ["Time spent with little price movement.", "الوقت بحركة سعر ضعيفة.", "Temps avec peu de mouvement."]],
  ["nearBe", ["Average time near breakeven", "متوسط الزمن قرب التعادل", "Temps moyen près du point mort"], ["Time spent close to zero P&L.", "الوقت القريب من ربح صفر.", "Temps proche d'un P&L nul."]],
  ["pain", ["Average trade pain area", "متوسط مساحة الألم في الصفقة", "Aire de douleur moyenne du trade"], ["Area under breakeven × time.", "المساحة تحت التعادل × الزمن.", "Aire sous le point mort × temps."]],
  ["cover", ["Price-path metric coverage", "تغطية مقاييس مسار السعر", "Couverture des métriques de trajectoire"], ["Share of trades that have price-path data.", "نسبة الصفقات التي لها بيانات مسار سعر.", "Part des trades avec données de trajectoire."]],
];

export default function ExcursionTab({ lang }: { lang: Lang }) {
  const k = i(lang), T = (x: L) => x[k];
  const [view, setView] = useState<View>("grid");
  const items = (m: M[]): Item[] => m.map(([id, l, tip]) => ({ id, label: T(l), tip: T(tip), value: T(TXT.soon), color: "var(--primary)", reason: T(TXT.tipSoon) }));
  const n = S1.length + S2.length + S3.length;
  const sec = [[<Activity size={18} />, TXT.s1, TXT.s1d, S1], [<Target size={18} />, TXT.s2, TXT.s2d, S2], [<Timer size={18} />, TXT.s3, TXT.s3d, S3]] as const;
  return (
    <div className="space-y-5">
      <ViewHeader title={T(EXC_TAB)} sub={T(TXT.sub)} badge={`${n} ${lang === "ar" ? "مقياس" : lang === "fr" ? "métriques" : "metrics"}`} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      {sec.map(([icon, t, d, m]) => <MetricSection key={t[0]} icon={icon} title={T(t)} subtitle={T(d)} view={view} items={items(m as M[])} />)}
    </div>
  );
}
