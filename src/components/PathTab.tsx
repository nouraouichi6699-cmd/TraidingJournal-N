import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Check, Crosshair, RefreshCw, Timer, Upload } from "lucide-react";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import { pathStats, MODELS, modelId, parseModel, type PathRow, type TimeModel } from "../lib/path";
import { atrBefore, clearDownloadedPaths, importPathCsv, measurePaths, readClock, readPaths, removePathCsv, saveClockOverride, tickerOfSymbol, type Clock, type NoPath } from "../lib/pathData";
import { addDays, loadDaily, loadMap, type LoadError } from "../lib/marketData";
import { pointValues } from "../lib/portfolio";
import { fmtHold } from "../lib/stats";
import { fmtMoney, ltrNumbers } from "../lib/money";
import type { Bar } from "../lib/benchmark";
import type { Account, Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
type M = [string, L, L]; // id, label, tip
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const PATH_TAB: L = ["Trade path", "مسار الصفقة", "Parcours du trade"];
const TXT = {
  sub: ["Excursion, exit quality and timing of the price path while trades are open.", "الحركة المواتية والعكسية وجودة الخروج وتوقيت مسار السعر أثناء الصفقة.", "Excursion, qualité de sortie et chronologie du parcours des trades."] as L,
  s1: ["Excursion", "الحركة داخل الصفقة", "Excursion"] as L,
  s1d: ["Best (MFE) and worst (MAE) floating result while trades are open, from intraday prices.", "أفضل (MFE) وأسوأ (MAE) نتيجة عائمة أثناء فتح الصفقات، من الأسعار داخل اليوم.", "Meilleur (MFE) et pire (MAE) résultat latent pendant les trades, d'après les prix intrajournaliers."] as L,
  s2: ["Capture & exit quality", "الالتقاط وجودة الخروج", "Capture & qualité de sortie"] as L,
  s2d: ["How much available opportunity is retained at close.", "مقدار الفرصة المتاحة التي تحتفظ بها عند الإغلاق.", "Part de l'opportunité conservée à la clôture."] as L,
  s3: ["Path timing & stability", "توقيت المسار وثباته", "Chronologie & stabilité"] as L,
  s3d: ["Time spent in heat, profit, stagnation, and recovery.", "الوقت المقضي في الخسارة والربح والركود والتعافي.", "Temps passé en perte, profit, stagnation et récupération."] as L,
  covered: ["Price path measured for {n} of {m} closed trades{src}.", "تم قياس مسار السعر لـ{n} من {m} صفقة مغلقة{src}.", "Parcours mesuré pour {n} trades clôturés sur {m}{src}."] as L,
  loading: ["Loading intraday prices {d} / {t}…", "جارٍ تحميل الأسعار داخل اليوم {d} / {t}…", "Chargement des prix intrajournaliers {d} / {t}…"] as L,
  notDeployed: ["Price service not set up yet: deploy the \"market\" function once in Supabase (supabase functions deploy market), or import M1 bars from MT5 for each symbol below.", "خدمة الأسعار غير مفعّلة بعد: انشر الدالة market مرة واحدة في Supabase بالأمر ⁦supabase functions deploy market⁩، أو استورد شموع M1 من MT5 لكل رمز أدناه.", "Service de prix non installé : déployez une fois la fonction « market » dans Supabase (supabase functions deploy market), ou importez des bougies M1 de MT5 pour chaque symbole ci-dessous."] as L,
  unreachable: ["The price service could not be reached. Try again later, or import M1 bars from MT5.", "تعذّر الوصول إلى خدمة الأسعار. حاول لاحقاً أو استورد شموع M1 من MT5.", "Service de prix injoignable. Réessayez plus tard ou importez des bougies M1 de MT5."] as L,
  missing: ["Not measured: {list}.", "غير مُقاس: {list}.", "Non mesurés : {list}."] as L,
  rShort: ["{n} too short for the bars available (1-minute bars cover the last 28 days, 5-minute 58 days, hourly 2 years)", "{n} أقصر من الشموع المتاحة (شموع الدقيقة تغطي آخر 28 يوماً، و5 دقائق 58 يوماً، والساعة سنتين)", "{n} trop courts pour les bougies disponibles (1 min : 28 derniers jours, 5 min : 58 jours, horaires : 2 ans)"] as L,
  rTiny: ["{n} under 3 minutes: too short for 1-minute prices", "{n} أقل من 3 دقائق: أقصر من أن تقيسها شموع الدقيقة", "{n} de moins de 3 minutes : trop courts pour des bougies d'une minute"] as L,
  rCoarse: ["{n} too short for the 5-minute or hourly prices of their dates (import M1 bars from MT5 to measure them)", "{n} أقصر من شموع 5 دقائق أو الساعة المتاحة لتواريخها (استورد شموع M1 من MT5 لقياسها)", "{n} trop courts pour les bougies 5 min ou horaires de leurs dates (importez des bougies M1 de MT5 pour les mesurer)"] as L,
  rGap: ["{n} with market prices missing for part of the trade", "{n} تنقصها أسعار السوق في جزء من مدة الصفقة", "{n} sans prix de marché pendant une partie du trade"] as L,
  rOld: ["{n} older than 2 years and shorter than a few days", "{n} أقدم من سنتين وأقصر من بضعة أيام", "{n} de plus de 2 ans et de moins de quelques jours"] as L,
  rNoTicker: ["{n} on symbols without a market ticker", "{n} على رموز بلا رمز سوق", "{n} sur des symboles sans ticker de marché"] as L,
  rNoData: ["{n} without market prices", "{n} بلا أسعار سوق", "{n} sans prix de marché"] as L,
  rClock: ["{n} whose times could not be matched to market prices (pick the broker clock or import MT5 bars)", "{n} لم تُطابَق أوقاتها مع أسعار السوق (اختر توقيت الوسيط أو استورد شموع MT5)", "{n} dont l'heure n'a pas pu être alignée sur les prix (choisissez l'heure du courtier ou importez des bougies MT5)"] as L,
  clock: ["Broker clock", "توقيت الوسيط", "Heure du courtier"] as L,
  auto: ["Auto (from entry prices)", "تلقائي (من أسعار الدخول)", "Auto (d'après les prix d'entrée)"] as L,
  clockOf: ["{a}: broker clock {c}{how}.", "{a}: توقيت الوسيط {c}{how}.", "{a} : heure du courtier {c}{how}."] as L,
  howDetected: [", found from {n} entries", "، مستنتج من {n} دخولاً", ", trouvée sur {n} entrées"] as L,
  howSaved: [", found earlier", "، مستنتج سابقاً", ", trouvée précédemment"] as L,
  howOverride: [", chosen by you", "، اخترته أنت", ", choisie par vous"] as L,
  noClock: ["{a}: trade times could not be matched to market prices yet.", "{a}: لم تُطابَق أوقات الصفقات مع أسعار السوق بعد.", "{a} : l'heure des trades n'a pas encore pu être alignée sur les prix."] as L,
  refresh: ["Measure again", "إعادة القياس", "Mesurer à nouveau"] as L,
  symbols: ["Measured by symbol", "المُقاس حسب الرمز", "Mesurés par symbole"] as L,
  importCsv: ["Import M1 bars (CSV)", "استيراد شموع M1 ‏(CSV)", "Importer des bougies M1 (CSV)"] as L,
  removeCsv: ["Remove imported bars", "حذف الشموع المستوردة", "Retirer les bougies importées"] as L,
  csvHint: ["In MT5: View › Symbols › Bars, choose M1 and the dates of your trades, Request, then Export bars. The file uses your broker's own clock and prices: exact paths.", "في MT5: عرض › الرموز › الشموع، اختر M1 وتواريخ صفقاتك، طلب، ثم تصدير الشموع. الملف بتوقيت وأسعار وسيطك: مسارات دقيقة.", "Dans MT5 : Affichage › Symboles › Barres, choisissez M1 et les dates de vos trades, Demander, puis Exporter. Le fichier suit l'heure et les prix de votre courtier : parcours exacts."] as L,
  csvBad: ["Could not read bars from this file.", "تعذّرت قراءة الشموع من هذا الملف.", "Bougies illisibles dans ce fichier."] as L,
  csvDone: ["{n} of {m} trades inside the file's dates measured ({b}-minute bars).", "تم قياس {n} من {m} صفقة ضمن تواريخ الملف (شموع {b} دقيقة).", "{n} trades sur {m} dans les dates du fichier mesurés (bougies de {b} min)."] as L,
  noTrades: ["No closed trades in this period.", "لا توجد صفقات مغلقة في هذه الفترة.", "Aucun trade clôturé sur la période."] as L,
  noPath: ["No trade path measured yet (see the status above).", "لم يُقَس أي مسار صفقة بعد (انظر الحالة أعلاه).", "Aucun parcours mesuré pour l'instant (voir l'état ci-dessus)."] as L,
  noMoney: ["Needs trades whose value per price move is known (a price move at exit, or other trades of the symbol).", "يحتاج صفقات معروفة قيمة حركة السعر فيها (حركة سعر عند الخروج، أو صفقات أخرى للرمز).", "Nécessite des trades dont la valeur d'un mouvement est connue (mouvement à la sortie, ou autres trades du symbole)."] as L,
  noAtr: ["Needs daily prices of the symbols (Benchmark & Market).", "يحتاج الأسعار اليومية للرموز (المقارنة والسوق).", "Nécessite les prix quotidiens des symboles (Référence & marché)."] as L,
  none: ["No measured trade fits this measure yet.", "لا توجد صفقة مُقاسة تناسب هذا المقياس بعد.", "Aucun trade mesuré ne correspond encore à cette mesure."] as L,
  perHour: ["{v} an hour", "{v} في الساعة", "{v} par heure"] as L,
  atr: ["{v} ATR", "{v} ATR", "{v} ATR"] as L,
};
const S1: M[] = [
  ["avgMfe", ["Average maximum favourable excursion", "متوسط أقصى حركة مواتية (MFE)", "MFE moyen"], ["Average best floating profit reached during a trade, in money (best price move × the trade's value per move).", "متوسط أفضل ربح عائم بلغته الصفقة، بالمال (أفضل حركة سعر × قيمة الحركة للصفقة).", "Meilleur profit latent moyen atteint, en argent (meilleur mouvement × valeur du mouvement pour le trade)."]],
  ["medMfe", ["Median maximum favourable excursion", "وسيط أقصى حركة مواتية", "MFE médian"], ["Median best floating profit reached, in money.", "وسيط أفضل ربح عائم، بالمال.", "Meilleur profit latent médian, en argent."]],
  ["avgMae", ["Average maximum adverse excursion", "متوسط أقصى حركة عكسية (MAE)", "MAE moyen"], ["Average worst floating loss during a trade, in money.", "متوسط أسوأ خسارة عائمة أثناء الصفقة، بالمال.", "Pire perte latente moyenne, en argent."]],
  ["medMae", ["Median maximum adverse excursion", "وسيط أقصى حركة عكسية", "MAE médian"], ["Median worst floating loss, in money.", "وسيط أسوأ خسارة عائمة، بالمال.", "Pire perte latente médiane, en argent."]],
  ["mfePct", ["Average MFE as balance percentage", "متوسط MFE كنسبة من الرصيد", "MFE moyen en % du capital"], ["MFE ÷ the account's balance before the trade, averaged.", "MFE ÷ رصيد الحساب قبل الصفقة، في المتوسط.", "MFE ÷ solde du compte avant le trade, en moyenne."]],
  ["maePct", ["Average MAE as balance percentage", "متوسط MAE كنسبة من الرصيد", "MAE moyen en % du capital"], ["MAE ÷ the account's balance before the trade, averaged.", "MAE ÷ رصيد الحساب قبل الصفقة، في المتوسط.", "MAE ÷ solde du compte avant le trade, en moyenne."]],
  ["mfeAtr", ["Average MFE in ATR", "متوسط MFE بوحدات ATR", "MFE moyen en ATR"], ["Best price move ÷ the symbol's daily ATR(14) the day before entry.", "أفضل حركة سعر ÷ ATR(14) اليومي للرمز في اليوم السابق للدخول.", "Meilleur mouvement ÷ ATR(14) quotidien du symbole la veille de l'entrée."]],
  ["maeAtr", ["Average MAE in ATR", "متوسط MAE بوحدات ATR", "MAE moyen en ATR"], ["Worst price move ÷ the symbol's daily ATR(14) the day before entry.", "أسوأ حركة سعر ÷ ATR(14) اليومي للرمز في اليوم السابق للدخول.", "Pire mouvement ÷ ATR(14) quotidien du symbole la veille de l'entrée."]],
  ["earlyFav", ["Average early favourable response", "متوسط الاستجابة المواتية المبكرة", "Réponse favorable précoce moyenne"], ["Best floating profit within the first quarter of the trade's time, in money.", "أفضل ربح عائم خلال الربع الأول من مدة الصفقة، بالمال.", "Meilleur profit latent dans le premier quart du trade, en argent."]],
  ["earlyAdv", ["Average early adverse heat", "متوسط الضغط العكسي المبكر", "Pression adverse précoce moyenne"], ["Worst floating loss within the first quarter of the trade's time, in money.", "أسوأ خسارة عائمة خلال الربع الأول من مدة الصفقة، بالمال.", "Pire perte latente dans le premier quart du trade, en argent."]],
  ["amp", ["Average trade P&L path amplitude", "متوسط اتساع مسار ربح/خسارة الصفقة", "Amplitude moyenne du P&L du trade"], ["MFE + MAE: distance between the best and the worst floating result, in money.", "MFE + MAE: المسافة بين أفضل وأسوأ نتيجة عائمة، بالمال.", "MFE + MAE : écart entre meilleur et pire résultat latent, en argent."]],
  ["var", ["Average floating P&L variability", "متوسط تذبذب الربح/الخسارة العائم", "Variabilité moyenne du P&L latent"], ["Standard deviation of the floating result at each bar close, in money.", "الانحراف المعياري للنتيجة العائمة عند إغلاق كل شمعة، بالمال.", "Écart-type du résultat latent à chaque clôture de bougie, en argent."]],
  ["tMfe", ["Average time to MFE", "متوسط الزمن حتى MFE", "Temps moyen jusqu'au MFE"], ["Time from entry to the best point (middle of its bar; the exit when the best point is the exit).", "الزمن من الدخول إلى أفضل نقطة (منتصف شمعتها؛ الخروج إن كانت أفضل نقطة هي الخروج).", "Temps de l'entrée au meilleur point (milieu de sa bougie ; la sortie si c'est la sortie)."]],
  ["tMae", ["Average time to MAE", "متوسط الزمن حتى MAE", "Temps moyen jusqu'au MAE"], ["Time from entry to the worst point.", "الزمن من الدخول إلى أسوأ نقطة.", "Temps de l'entrée au pire point."]],
];
const S2: M[] = [
  ["avgCap", ["Average MFE capture", "متوسط التقاط MFE", "Capture MFE moyenne"], ["Total result at exit ÷ total MFE, in money, over the trades that were ever in profit: the share of the available profit you kept.", "مجموع النتائج عند الخروج ÷ مجموع MFE، بالمال، على الصفقات التي كانت رابحة يوماً: نسبة الربح المتاح التي احتفظت بها.", "Total des résultats à la sortie ÷ total des MFE, en argent, sur les trades passés en profit : part du profit disponible conservée."]],
  ["medCap", ["Median MFE capture", "وسيط التقاط MFE", "Capture MFE médiane"], ["Median, trade by trade, of result at exit ÷ MFE (trades that were ever in profit).", "الوسيط، صفقة بصفقة، للنتيجة عند الخروج ÷ MFE (الصفقات التي كانت رابحة يوماً).", "Médiane, trade par trade, du résultat à la sortie ÷ MFE (trades passés en profit)."]],
  ["giveback", ["Average peak giveback", "متوسط التنازل عن القمة", "Restitution moyenne du pic"], ["MFE - result at exit: profit given back from the best point, in money.", "MFE - النتيجة عند الخروج: الربح المتنازل عنه من أفضل نقطة، بالمال.", "MFE - résultat à la sortie : profit rendu depuis le meilleur point, en argent."]],
  ["givebackPct", ["Average peak giveback percentage", "متوسط نسبة التنازل عن القمة", "Restitution moyenne du pic (%)"], ["Total (MFE - result at exit) ÷ total MFE, in money: the share of the available profit given back.", "مجموع (MFE - النتيجة عند الخروج) ÷ مجموع MFE، بالمال: نسبة الربح المتاح التي تنازلت عنها.", "Total (MFE - résultat à la sortie) ÷ total des MFE, en argent : part du profit disponible rendue."]],
  ["closeLoc", ["Average close location", "متوسط موقع الإغلاق", "Position moyenne de clôture"], ["Where the exit sits between the trade's worst point (0%) and best point (100%).", "موقع الخروج بين أسوأ نقطة في الصفقة (0%) وأفضلها (100%).", "Position de la sortie entre le pire point (0 %) et le meilleur (100 %)."]],
  ["velocity", ["Average profit velocity", "متوسط سرعة الربح", "Vitesse moyenne du profit"], ["Net P&L ÷ total hours spent in trades (all closed trades).", "صافي الربح ÷ مجموع الساعات داخل الصفقات (كل الصفقات المغلقة).", "P&L net ÷ total des heures en position (tous les trades clôturés)."]],
  ["winCap", ["Winning trade MFE capture", "التقاط MFE للصفقات الرابحة", "Capture MFE des trades gagnants"], ["Result at exit ÷ MFE for winning trades only.", "النتيجة عند الخروج ÷ MFE للصفقات الرابحة فقط.", "Résultat à la sortie ÷ MFE, trades gagnants seulement."]],
  ["loseRec", ["Losing trade recovery from MAE", "تعافي الصفقات الخاسرة من MAE", "Récupération des perdants depuis le MAE"], ["Losing trades: share of the worst floating loss won back before the exit.", "الصفقات الخاسرة: نسبة ما استُرد من أسوأ خسارة عائمة قبل الخروج.", "Trades perdants : part de la pire perte latente regagnée avant la sortie."]],
];
const S3: M[] = [
  ["tBelow", ["Average time below breakeven", "متوسط الزمن تحت التعادل", "Temps moyen sous le point mort"], ["Time with the floating result below zero (bar closes).", "الزمن الذي تكون فيه النتيجة العائمة تحت الصفر (عند إغلاق الشموع).", "Temps avec un résultat latent sous zéro (clôtures de bougies)."]],
  ["tBelowPct", ["Average time below breakeven percentage", "متوسط نسبة الزمن تحت التعادل", "Temps moyen sous le point mort (%)"], ["Share of the trade's time below zero.", "نسبة مدة الصفقة تحت الصفر.", "Part de la durée du trade sous zéro."]],
  ["tBe", ["Average time to breakeven", "متوسط الزمن حتى التعادل", "Temps moyen jusqu'au point mort"], ["Time to the first bar close at or above zero (trades that reached it).", "الزمن حتى أول إغلاق شمعة عند الصفر أو فوقه (للصفقات التي بلغته).", "Temps jusqu'à la première clôture à zéro ou au-dessus (trades qui l'ont atteint)."]],
  ["tBePct", ["Average time to breakeven percentage", "متوسط نسبة الزمن حتى التعادل", "Temps jusqu'au point mort (%)"], ["Time to breakeven as a share of the trade's time.", "الزمن حتى التعادل كنسبة من مدة الصفقة.", "Temps jusqu'au point mort en % de la durée."]],
  ["tPeak", ["Average time to peak profit", "متوسط الزمن حتى قمة الربح", "Temps moyen jusqu'au pic de profit"], ["Winning trades: time from entry to the best point.", "الصفقات الرابحة: الزمن من الدخول إلى أفضل نقطة.", "Trades gagnants : temps de l'entrée au meilleur point."]],
  ["tPeakClose", ["Average time from peak to close", "متوسط الزمن من القمة إلى الإغلاق", "Temps moyen du pic à la clôture"], ["Time between the best point and the exit (trades that were ever in profit).", "الزمن بين أفضل نقطة والخروج (الصفقات التي كانت رابحة يوماً).", "Temps entre le meilleur point et la sortie (trades passés en profit)."]],
  ["postPeak", ["Average post-peak time percentage", "متوسط نسبة الزمن بعد القمة", "Temps après pic moyen (%)"], ["Share of the trade's time spent after the best point.", "نسبة مدة الصفقة بعد أفضل نقطة.", "Part de la durée après le meilleur point."]],
  ["tFav", ["Average time in favourable territory", "متوسط الزمن في المنطقة المواتية", "Temps moyen en zone favorable"], ["Time with the floating result above zero.", "الزمن الذي تكون فيه النتيجة العائمة فوق الصفر.", "Temps avec un résultat latent au-dessus de zéro."]],
  ["recMae", ["Average recovery time from MAE", "متوسط زمن التعافي من MAE", "Temps moyen de récupération du MAE"], ["Time from the worst point back to breakeven (trades that came back).", "الزمن من أسوأ نقطة حتى العودة إلى التعادل (للصفقات التي عادت).", "Temps du pire point au retour au point mort (trades revenus)."]],
  ["cross", ["Average breakeven crossings", "متوسط عبور نقطة التعادل", "Passages moyens du point mort"], ["Times the floating result changed sign (bar closes).", "عدد مرات تغيّر إشارة النتيجة العائمة (عند إغلاق الشموع).", "Nombre de changements de signe du résultat latent."]],
  ["stag", ["Average stagnation time", "متوسط زمن الركود", "Temps moyen de stagnation"], ["Time in bars that made neither a new best nor a new worst point.", "الزمن في شموع لم تصنع أفضل نقطة جديدة ولا أسوأ نقطة جديدة.", "Temps dans des bougies sans nouveau meilleur ni nouveau pire point."]],
  ["nearBe", ["Average time near breakeven", "متوسط الزمن قرب التعادل", "Temps moyen près du point mort"], ["Time with the floating result within 10% of the trade's MFE + MAE range from zero.", "الزمن الذي تكون فيه النتيجة العائمة ضمن 10% من مدى MFE + MAE حول الصفر.", "Temps avec un résultat latent à moins de 10 % de l'amplitude MFE + MAE autour de zéro."]],
  ["area", ["Average trade pain area", "متوسط مساحة الألم في الصفقة", "Aire de douleur moyenne"], ["Floating loss × time spent below zero, in money × hours.", "الخسارة العائمة × الزمن تحت الصفر، بالمال × الساعات.", "Perte latente × temps sous zéro, en argent × heures."]],
  ["cover", ["Price-path metric coverage", "تغطية مقاييس مسار السعر", "Couverture des métriques de parcours"], ["Share of the period's closed trades whose price path was measured.", "نسبة الصفقات المغلقة في الفترة التي قيس مسار سعرها.", "Part des trades clôturés de la période dont le parcours a été mesuré."]],
];
const GREEN = "#22c55e", RED = "#f87171", NEUTRAL = "var(--primary)";
type V = [string, string, string | undefined];
const clockLabel = (m: TimeModel) => { const u = (h: number) => `UTC${h >= 0 ? "+" : "-"}${Math.abs(h)}`; return m.dst === "none" ? u(m.base) : `${u(m.base)} / ${u(m.base + 1)} (${m.dst === "us" ? "US" : "EU"} DST)`; };
const CLOCKS: TimeModel[] = [...MODELS.filter((m) => m.dst === "none"), ...MODELS.filter((m) => m.dst !== "none" && m.base >= -8 && m.base <= 4)];

export default function PathTab({ lang, trades, accounts, history, currency }: { lang: Lang; trades: Trade[]; accounts: Account[]; history: Trade[]; currency: string | null }) {
  const k = i(lang), T = (x: L) => x[k];
  const [view, setView] = useState<View>("grid");
  const [now] = useState(() => Date.now());
  const [version, setVersion] = useState(0); // bumps after measuring or importing, to re-read the stored paths
  const [reload, setReload] = useState(0);
  const [force, setForce] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [clocks, setClocks] = useState<Clock[]>([]);
  const [error, setError] = useState<LoadError | null>(null);
  const [override, setOverride] = useState(() => readClock().override);
  const [editing, setEditing] = useState<string | null>(null);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [daily, setDaily] = useState<Record<string, Bar[]>>({});

  const closed = useMemo(() => trades.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl)).sort((a, b) => (a.exitTime ?? "").localeCompare(b.exitTime ?? "") || a.no - b.no), [trades]);
  const symbols = useMemo(() => [...new Set(closed.map((t) => t.symbol))].sort(), [closed]);
  const keySig = closed.map((t) => t.key).join("|");

  useEffect(() => {
    if (!closed.length) return;
    let live = true;
    setProgress([0, 0]); setError(null);
    measurePaths({ trades: closed, now, map: loadMap(), force, onProgress: (d, tt) => live && setProgress([d, tt]) }).then((r) => {
      if (!live) return;
      setClocks(r.clocks); setError(r.error); setProgress(null); setForce(false); setVersion((v) => v + 1);
    });
    return () => { live = false; };
  }, [keySig, reload, override]); // eslint-disable-line react-hooks/exhaustive-deps

  // daily prices for the ATR (shared cache with Benchmark & Market)
  useEffect(() => {
    if (!closed.length) return;
    let live = true;
    const first = closed.reduce((m, t) => ((t.entryTime ?? "") < m ? (t.entryTime as string) : m), closed[0].entryTime ?? "").slice(0, 10), last = closed[closed.length - 1].exitTime?.slice(0, 10) ?? first;
    const map = loadMap();
    Promise.all(symbols.map(async (s) => { const r = await loadDaily(`sym:${s}`, tickerOfSymbol(s, map), addDays(first, -40), last); return [s, "error" in r ? [] : r.bars] as const; })).then((all) => live && setDaily(Object.fromEntries(all)));
    return () => { live = false; };
  }, [symbols.join("|"), version]); // eslint-disable-line react-hooks/exhaustive-deps

  const store = useMemo(() => readPaths(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const pv = useMemo(() => pointValues(history), [history]);
  const rows: PathRow[] = useMemo(() => {
    const bal = new Map(accounts.map((a) => [a.id, a.startBalance || 0]));
    return closed.map((t) => {
      const x = store.get(t.key), path = x && "src" in x ? x.path : null;
      let kk: number | null = null;
      if (path && t.exitPrice != null) {
        const own = Math.abs(path.final) > 1e-12 ? ((t.pnl as number) + (t.commission || 0)) / ((t.exitPrice - t.entryPrice) * (t.side === "long" ? 1 : -1)) : NaN;
        const v = pv.get(`${t.accountId}|${t.symbol}`);
        kk = Number.isFinite(own) && own > 0 ? own : v != null && t.qty > 0 ? v * t.qty : null;
      }
      const b = bal.get(t.accountId) ?? null;
      const atr = path && daily[t.symbol]?.length ? atrBefore(daily[t.symbol], (t.entryTime ?? "").slice(0, 10)) : null;
      if (b != null) bal.set(t.accountId, b + (t.pnl as number));
      return { trade: t, path, k: kk, bal: b != null && b > 0 ? b : null, atr };
    });
  }, [closed, store, pv, accounts, daily]);
  const st = useMemo(() => pathStats(rows), [rows]);

  // ----- formatting
  const f = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/^-(?=0(\.0+)?$)/, "");
  const money = (n: number, sign = false) => fmtMoney(n, { sign, currency });
  const mix = (s: string) => (lang === "ar" ? `⁧${ltrNumbers(s)}⁩` : s);
  const fill = (x: L, o: Record<string, string | number>) => Object.entries(o).reduce((s, [kk, v]) => s.replace(`{${kk}}`, String(v)), T(x));
  const none = (r: string): V => ["—", NEUTRAL, r];
  const base = !closed.length ? T(TXT.noTrades) : progress ? fill(TXT.loading, { d: progress[0], t: progress[1] }) : error === "notDeployed" ? T(TXT.notDeployed) : error === "unreachable" ? T(TXT.unreachable) : T(TXT.noPath);
  const pathWhy = st.covered ? T(TXT.none) : base, moneyWhy = st.covered ? (st.money ? T(TXT.none) : T(TXT.noMoney)) : base;
  const mny = (x: number | null, neg = false): V => (x == null ? none(moneyWhy) : [money(neg ? -x : x, neg), neg && x > 0 ? RED : NEUTRAL, undefined]);
  const pct = (x: number | null, d = 1, why = pathWhy): V => (x == null ? none(why) : [`${f(x, d)}%`, NEUTRAL, undefined]);
  const dur = (x: number | null): V => (x == null ? none(pathWhy) : [fmtHold(x), NEUTRAL, undefined]);
  const v = (id: string): V => {
    switch (id) {
      case "avgMfe": return mny(st.avgMfe); case "medMfe": return mny(st.medMfe);
      case "avgMae": return mny(st.avgMae, true); case "medMae": return mny(st.medMae, true);
      case "mfePct": return pct(st.mfePct, 2, moneyWhy);
      case "maePct": return st.maePct == null ? none(moneyWhy) : [`-${f(st.maePct)}%`, st.maePct > 0 ? RED : NEUTRAL, undefined];
      case "mfeAtr": return st.mfeAtr == null ? none(st.covered ? T(TXT.noAtr) : base) : [fill(TXT.atr, { v: f(st.mfeAtr) }), NEUTRAL, undefined];
      case "maeAtr": return st.maeAtr == null ? none(st.covered ? T(TXT.noAtr) : base) : [fill(TXT.atr, { v: f(st.maeAtr) }), NEUTRAL, undefined];
      case "earlyFav": return mny(st.eFav); case "earlyAdv": return mny(st.eAdv, true);
      case "amp": return mny(st.amp); case "var": return mny(st.vol);
      case "tMfe": return dur(st.tMfe); case "tMae": return dur(st.tMae);
      case "avgCap": return st.avgCap == null ? none(pathWhy) : [`${f(st.avgCap, 1)}%`, st.avgCap < 0 ? RED : NEUTRAL, undefined];
      case "medCap": return st.medCap == null ? none(pathWhy) : [`${f(st.medCap, 1)}%`, st.medCap < 0 ? RED : NEUTRAL, undefined];
      case "giveback": return st.giveback == null ? none(moneyWhy) : [money(-st.giveback, true), st.giveback > 0 ? RED : NEUTRAL, undefined];
      case "givebackPct": return pct(st.givebackPct);
      case "closeLoc": return pct(st.closeLoc);
      case "velocity": return st.velocity == null ? none(T(TXT.noTrades)) : [mix(fill(TXT.perHour, { v: money(st.velocity, true) })), st.velocity > 0 ? GREEN : st.velocity < 0 ? RED : NEUTRAL, undefined];
      case "winCap": return pct(st.winCap); case "loseRec": return pct(st.loseRec);
      case "tBelow": return dur(st.tBelow); case "tBelowPct": return pct(st.tBelowPct);
      case "tBe": return dur(st.tBe); case "tBePct": return pct(st.tBePct);
      case "tPeak": return dur(st.tPeak); case "tPeakClose": return dur(st.tPeakClose); case "postPeak": return pct(st.postPeak);
      case "tFav": return dur(st.tFav); case "recMae": return dur(st.recMae);
      case "cross": return st.cross == null ? none(pathWhy) : [f(st.cross), NEUTRAL, undefined];
      case "stag": return dur(st.stag); case "nearBe": return dur(st.nearBe);
      case "area": return st.area == null ? none(moneyWhy) : [`${money(-st.area, true)}·h`, st.area > 0 ? RED : NEUTRAL, undefined];
      case "cover": return !closed.length ? none(T(TXT.noTrades)) : [`${f((st.covered / st.closed) * 100, 0)}% (${st.covered}/${st.closed})`, NEUTRAL, st.covered ? undefined : base];
    }
    return ["—", NEUTRAL, undefined];
  };
  const items = (m: M[]): Item[] => m.map(([id, l, tip]) => { const [value, color, reason] = v(id); return { id, label: T(l), tip: T(tip), value, color, reason }; });

  // ----- status and controls
  const counts = useMemo(() => {
    const c = { res: new Map<string, number>(), why: new Map<NoPath, number>() };
    for (const t of closed) {
      const x = store.get(t.key);
      if (!x) continue;
      if ("src" in x) { const r = x.src === "csv" ? `MT5 ${x.res}m` : x.res >= 1440 ? "1d" : x.res >= 60 ? "1h" : `${x.res}m`; c.res.set(r, (c.res.get(r) ?? 0) + 1); }
      else c.why.set(x.none, (c.why.get(x.none) ?? 0) + 1);
    }
    return c;
  }, [closed, store]);
  const srcText = counts.res.size ? ` (\u2066${[...counts.res].map(([r, n]) => `${r}: ${n}`).join(", ")}\u2069)` : ""; // kept left to right in Arabic
  const whyLabel = (r: NoPath) => ({ tiny: TXT.rTiny, coarse: TXT.rCoarse, short: TXT.rShort, gap: TXT.rGap, old: TXT.rOld, noTicker: TXT.rNoTicker, clock: TXT.rClock, noData: TXT.rNoData })[r];
  const sep = lang === "ar" ? "؛ " : "; ";
  const whyText = [...counts.why].map(([r, n]) => fill(whyLabel(r), { n })).join(sep);
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const saved = readClock();
  const clockLines = (clocks.length ? clocks : Object.entries(saved.auto).filter(([id]) => accounts.some((a) => a.id === id)).map(([id, x]) => ({ accountId: id, model: parseModel(x.m), how: "saved" as const, n: x.n })))
    .map((c) => (c.model ? fill(TXT.clockOf, { a: nameOf(c.accountId), c: `⁦${clockLabel(c.model)}⁩`, how: c.how === "override" ? T(TXT.howOverride) : c.how === "detected" ? fill(TXT.howDetected, { n: c.n }) : T(TXT.howSaved) }) : fill(TXT.noClock, { a: nameOf(c.accountId) })));
  const status = closed.length ? [fill(TXT.covered, { n: st.covered, m: st.closed, src: srcText }), ...clockLines, whyText ? fill(TXT.missing, { list: whyText }) : "", progress ? fill(TXT.loading, { d: progress[0], t: progress[1] }) : "", error === "notDeployed" ? T(TXT.notDeployed) : error === "unreachable" ? T(TXT.unreachable) : ""].filter(Boolean) : [];
  const sel = "field !min-h-0 !w-auto min-w-0 max-w-full !py-1.5 text-sm";
  const pick = async (symbol: string, file: File | undefined) => {
    if (!file) return;
    const r = importPathCsv(symbol, await file.text(), history, now);
    setCsvMsg(r ? fill(TXT.csvDone, { n: r.measured, m: r.inSpan, b: r.minutes }) : T(TXT.csvBad));
    setVersion((x) => x + 1);
  };
  const measuredOf = (s: string) => { const ts = closed.filter((t) => t.symbol === s); return [ts.filter((t) => { const x = store.get(t.key); return x && "src" in x; }).length, ts.length] as const; };
  const top = closed.length ? (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 max-w-full items-center gap-2 text-sm"><span className="shrink-0 text-muted">{T(TXT.clock)}</span>
          <select className={sel} value={override} onChange={(e) => { const m = parseModel(e.target.value); saveClockOverride(m); setOverride(m ? modelId(m) : ""); }}>
            <option value="">{T(TXT.auto)}</option>
            {CLOCKS.map((m) => <option key={modelId(m)} value={modelId(m)}>{clockLabel(m)}</option>)}
          </select>
        </label>
        <button type="button" disabled={!!progress} onClick={() => { clearDownloadedPaths(); setForce(true); setReload((x) => x + 1); }} className="ms-auto flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--primary)] disabled:opacity-50">
          <RefreshCw size={13} className={`text-icon ${progress ? "animate-spin" : ""}`} />{T(TXT.refresh)}
        </button>
      </div>
      {status.map((s, n) => <p key={n} className={`text-xs ${n === status.length - 1 && error ? "text-[#f87171]" : "text-muted"}`}>{ltrNumbers(s)}</p>)}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{T(TXT.symbols)}</span>
        {symbols.map((s) => { const [a, b] = measuredOf(s), ok = a === b && b > 0; return (
          <button key={s} type="button" onClick={() => { setEditing(editing === s ? null : s); setCsvMsg(null); }} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${editing === s ? "border-[var(--primary)]" : "border-border"} ${a ? "" : "text-muted"}`}>
            {ok ? <Check size={12} className="text-[#22c55e]" /> : <AlertTriangle size={12} className="text-[var(--primary)]" />}
            <span className="font-semibold" dir="ltr">{s.replace(/^[^:]+:/, "")}</span><span className="tnum" dir="ltr">{a}/{b}</span>
          </button>); })}
      </div>
      {editing && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold" dir="ltr">{editing}</span>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary">
              <Upload size={13} />{T(TXT.importCsv)}
              <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => { void pick(editing, e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {closed.some((t) => t.symbol === editing && (store.get(t.key) as { src?: string } | undefined)?.src === "csv") && (
              <button type="button" onClick={() => { removePathCsv(editing, history); setVersion((x) => x + 1); setReload((x) => x + 1); }} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">{T(TXT.removeCsv)}</button>)}
          </div>
          {(() => { // why this symbol's other trades were not measured
            const w = new Map<NoPath, number>();
            for (const t of closed) { if (t.symbol !== editing) continue; const x = store.get(t.key); if (x && "none" in x) w.set(x.none, (w.get(x.none) ?? 0) + 1); }
            return w.size ? <p className="text-xs text-text">{ltrNumbers(fill(TXT.missing, { list: [...w].map(([r, n]) => fill(whyLabel(r), { n })).join(sep) }))}</p> : null;
          })()}
          <p className="text-xs text-muted">{T(TXT.csvHint)}</p>
          {csvMsg && <p className="text-xs text-text">{ltrNumbers(csvMsg)}</p>}
        </div>
      )}
    </div>
  ) : undefined;

  const n = S1.length + S2.length + S3.length;
  const sec = [[<Activity size={18} />, TXT.s1, TXT.s1d, S1], [<Crosshair size={18} />, TXT.s2, TXT.s2d, S2], [<Timer size={18} />, TXT.s3, TXT.s3d, S3]] as const;
  return (
    <div className="space-y-5">
      <ViewHeader title={T(PATH_TAB)} sub={T(TXT.sub)} badge={`${n} ${lang === "ar" ? "مقياس" : lang === "fr" ? "métriques" : "metrics"}`} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      {sec.map(([icon, t, d, m], idx) => <MetricSection key={t[0]} icon={icon} title={T(t)} subtitle={T(d)} view={view} items={items(m as M[])} top={idx === 0 ? top : undefined} />)}
    </div>
  );
}
