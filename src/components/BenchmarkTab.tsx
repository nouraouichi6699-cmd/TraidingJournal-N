import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, Globe2, RefreshCw, Upload, Check, AlertTriangle } from "lucide-react";
import { MetricSection, ViewHeader, type Item, type View } from "./metricUi";
import { BENCHMARKS, accountDays, alignWithBenchmark, benchStats, marketContext, tickerFor, type Bar, type RegimeKey, type Ticker } from "../lib/benchmark";
import { benchOf, clearCsv, clearDownloads, importCsv, loadDaily, loadMap, loadPrefs, readCsv, saveMap, savePrefs, type LoadError, type Prices } from "../lib/marketData";
import { fmtMoney, ltrNumbers } from "../lib/money";
import type { CashFlow } from "../lib/cashflow";
import type { Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
const i = (l: Lang) => (l === "en" ? 0 : l === "ar" ? 1 : 2);

export const BENCH_TAB: L = ["Benchmark & Market", "المقارنة والسوق", "Référence & marché"];
const TXT = {
  title: ["Benchmark & market analysis", "تحليل المقارنة بالمعيار والسوق", "Analyse référence & marché"] as L,
  sub: ["Compare your results with a market benchmark and the conditions you traded in.", "قارن نتائجك بمعيار السوق وبالظروف التي تداولت فيها.", "Comparez vos résultats à une référence de marché et à vos conditions de trading."] as L,
  s1: ["Benchmark-relative performance", "الأداء مقابل المعيار", "Performance relative à la référence"] as L,
  s1d: ["Your daily returns against the benchmark's daily closes, over the period of your trades.", "عوائدك اليومية مقابل الإغلاقات اليومية للمعيار، خلال فترة صفقاتك.", "Vos rendements quotidiens face aux clôtures de la référence, sur la période de vos trades."] as L,
  s2: ["Market context", "سياق السوق", "Contexte de marché"] as L,
  s2d: ["What each traded symbol was doing when you entered, from its daily prices.", "ماذا كان يفعل كل رمز تداولته عند دخولك، من أسعاره اليومية.", "Ce que faisait chaque symbole à votre entrée, d'après ses prix quotidiens."] as L,
  bench: ["Benchmark", "المعيار", "Référence"] as L,
  custom: ["Other (Yahoo ticker)", "آخر (رمز Yahoo)", "Autre (ticker Yahoo)"] as L,
  rf: ["Risk-free rate, % a year", "العائد الخالي من المخاطر، % سنوياً", "Taux sans risque, % par an"] as L,
  refresh: ["Refresh prices", "تحديث الأسعار", "Actualiser les prix"] as L,
  importCsv: ["Import CSV", "استيراد CSV", "Importer un CSV"] as L,
  removeCsv: ["Remove CSV", "حذف CSV", "Retirer le CSV"] as L,
  csvBad: ["Could not read prices from this file (needs date, open, high, low, close columns).", "تعذّرت قراءة الأسعار من هذا الملف (يحتاج أعمدة التاريخ والافتتاح والأعلى والأدنى والإغلاق).", "Prix illisibles dans ce fichier (colonnes date, open, high, low, close requises)."] as L,
  loading: ["Loading prices…", "جارٍ تحميل الأسعار…", "Chargement des prix…"] as L,
  noTrades: ["No closed trades in this period.", "لا توجد صفقات مغلقة في هذه الفترة.", "Aucun trade clôturé sur la période."] as L,
  status: ["{b}: {n} daily closes ({src}), compared on {d} trading days, {from} to {to}.", "{b}: {n} إغلاقاً يومياً ({src})، المقارنة على {d} يوم تداول، من {from} إلى {to}.", "{b} : {n} clôtures ({src}), comparaison sur {d} jours, du {from} au {to}."] as L,
  errNotDeployed: ["Price service not set up yet: deploy the \"market\" function once in Supabase (supabase functions deploy market), or import a CSV of daily prices.", "خدمة الأسعار غير مفعّلة بعد: انشر الدالة market مرة واحدة في Supabase بالأمر \u2066supabase functions deploy market\u2069، أو استورد ملف CSV بالأسعار اليومية.", "Service de prix non installé : déployez une fois la fonction « market » dans Supabase (supabase functions deploy market), ou importez un CSV de prix quotidiens."] as L,
  errUnreachable: ["The price service could not be reached. Try again later, or import a CSV.", "تعذّر الوصول إلى خدمة الأسعار. حاول لاحقاً أو استورد ملف CSV.", "Service de prix injoignable. Réessayez plus tard ou importez un CSV."] as L,
  errNoData: ["No prices found for this ticker. Check it, or import a CSV.", "لم نجد أسعاراً لهذا الرمز. تحقّق منه أو استورد ملف CSV.", "Aucun prix pour ce ticker. Vérifiez-le ou importez un CSV."] as L,
  errNoTicker: ["Type a Yahoo Finance ticker (for example ^FTSE).", "اكتب رمز Yahoo Finance (مثلاً ^FTSE).", "Saisissez un ticker Yahoo Finance (par ex. ^FTSE)."] as L,
  needDays: ["Needs at least 20 trading days in common with the benchmark (has {n}).", "يحتاج 20 يوم تداول مشتركاً مع المعيار على الأقل (المتوفر {n}).", "Il faut au moins 20 jours communs avec la référence ({n} disponibles)."] as L,
  needStart: ["Needs a positive starting balance to compute daily returns (Accounts).", "يحتاج رصيداً ابتدائياً موجباً لحساب العوائد اليومية (الحسابات).", "Il faut un solde de départ positif pour les rendements quotidiens (Comptes)."] as L,
  needBench: ["Needs the benchmark's prices.", "يحتاج أسعار المعيار.", "Nécessite les prix de la référence."] as L,
  noBeta: ["The benchmark did not move enough to measure this.", "المعيار لم يتحرك بما يكفي لقياس هذا.", "La référence n'a pas assez bougé pour le mesurer."] as L,
  needSym: ["Needs daily prices of the traded symbols (see the list above).", "يحتاج الأسعار اليومية للرموز المتداولة (انظر القائمة أعلاه).", "Nécessite les prix quotidiens des symboles tradés (voir la liste)."] as L,
  needHist: ["Needs 50 daily bars before the trades for the trend, 30 for the volatility levels.", "يحتاج 50 شمعة يومية قبل الصفقات للاتجاه، و30 لمستويات التقلب.", "Il faut 50 bougies avant les trades pour la tendance, 30 pour la volatilité."] as L,
  fewRegime: ["Needs at least 3 trades in a volatility level.", "يحتاج 3 صفقات على الأقل في مستوى تقلب.", "Il faut au moins 3 trades dans un niveau de volatilité."] as L,
  symbols: ["Prices of your symbols", "أسعار رموزك", "Prix de vos symboles"] as L,
  ticker: ["Yahoo ticker", "رمز Yahoo", "Ticker Yahoo"] as L,
  save: ["Save", "حفظ", "Enregistrer"] as L,
  allOff: ["Your trade prices do not match the market data of any symbol (for example futures against your broker's CFD). Import your broker's daily prices as CSV for these symbols.", "أسعار صفقاتك لا تطابق بيانات السوق لأي رمز (مثلاً العقود الآجلة مقابل CFD الوسيط). استورد الأسعار اليومية من وسيطك كملف CSV لهذه الرموز.", "Vos prix ne correspondent aux données de marché d'aucun symbole (par ex. futures contre le CFD de votre courtier). Importez les prix quotidiens de votre courtier en CSV pour ces symboles."] as L,
  offScale: ["prices differ from the market data: left out of the entry location", "أسعارك تختلف عن بيانات السوق: مستبعد من موقع الدخول", "prix différents des données de marché : exclu de la position d'entrée"] as L,
  noPrices: ["no prices", "لا أسعار", "pas de prix"] as L,
  barSize: ["Bar size for durations", "حجم الشمعة للمدة", "Taille de bougie pour les durées"] as L,
  low: ["Low", "منخفض", "Faible"] as L, normal: ["Normal", "عادي", "Normale"] as L, high: ["High", "مرتفع", "Forte"] as L,
};
const M1: [string, L, L][] = [
  ["benchReturn", ["Benchmark return", "عائد المعيار", "Rendement de la référence"], ["Benchmark change from the close before your first trade day to your last trade day.", "تغيّر المعيار من الإغلاق السابق لأول يوم تداول لك حتى آخر يوم تداول.", "Variation de la référence de la clôture précédant votre premier jour de trading à votre dernier."]],
  ["excess", ["Excess return versus benchmark", "العائد الزائد مقابل المعيار", "Rendement excédentaire"], ["Your time-weighted return minus the benchmark return over the same days, in percentage points.", "عائدك الموزون زمنياً مطروحاً منه عائد المعيار على نفس الأيام، بالنقاط المئوية.", "Votre rendement pondéré dans le temps moins celui de la référence, en points de %."]],
  ["alpha", ["Alpha (annualised)", "ألفا (سنوي)", "Alpha (annualisé)"], ["Jensen's alpha, % a year: the part of your daily return not explained by beta x the benchmark (after the risk-free rate).", "ألفا جنسن، % سنوياً: جزء عائدك اليومي الذي لا يفسره بيتا × المعيار (بعد العائد الخالي من المخاطر).", "Alpha de Jensen, % par an : part du rendement quotidien non expliquée par bêta x référence (après taux sans risque)."]],
  ["beta", ["Beta", "بيتا", "Bêta"], ["Covariance of your daily returns with the benchmark ÷ its variance. 1 = moves like it, 0 = unrelated.", "تغاير عوائدك اليومية مع المعيار ÷ تباينه. 1 = يتحرك مثله، 0 = لا علاقة.", "Covariance de vos rendements avec la référence ÷ sa variance. 1 = comme elle, 0 = aucun lien."]],
  ["corr", ["Benchmark correlation", "الارتباط بالمعيار", "Corrélation"], ["Pearson correlation of daily returns, from -1 to 1.", "ارتباط بيرسون بين العوائد اليومية، من -1 إلى 1.", "Corrélation de Pearson des rendements quotidiens, de -1 à 1."]],
  ["upCap", ["Up capture ratio", "نسبة التقاط الصعود", "Capture haussière"], ["On days the benchmark rose: your geometric average daily return ÷ the benchmark's, in %.", "في أيام صعود المعيار: متوسطك الهندسي اليومي ÷ متوسط المعيار، بالنسبة المئوية.", "Jours de hausse de la référence : votre moyenne géométrique ÷ celle de la référence, en %."]],
  ["downCap", ["Down capture ratio", "نسبة التقاط الهبوط", "Capture baissière"], ["On days the benchmark fell: your geometric average daily return ÷ the benchmark's, in %. Lower is better.", "في أيام هبوط المعيار: متوسطك الهندسي اليومي ÷ متوسط المعيار، بالنسبة المئوية. الأقل أفضل.", "Jours de baisse : votre moyenne géométrique ÷ celle de la référence, en %. Plus bas = mieux."]],
  ["relStr", ["Relative strength", "القوة النسبية", "Force relative"], ["(1 + your return) ÷ (1 + benchmark return). Above 1: you grew faster.", "(1 + عائدك) ÷ (1 + عائد المعيار). فوق 1: نموك أسرع.", "(1 + votre rendement) ÷ (1 + référence). Au-dessus de 1 : croissance plus rapide."]],
  ["active", ["Active return (annualised)", "العائد النشط (سنوي)", "Rendement actif (annualisé)"], ["Average daily (your return - benchmark return), × 252: % a year.", "متوسط (عائدك - عائد المعيار) اليومي × 252: % سنوياً.", "Moyenne quotidienne (vous - référence) × 252 : % par an."]],
  ["te", ["Tracking error (annualised)", "خطأ التتبع (سنوي)", "Tracking error (annualisé)"], ["Standard deviation of the daily difference to the benchmark, × √252: % a year.", "الانحراف المعياري للفرق اليومي عن المعيار × √252: % سنوياً.", "Écart-type de l'écart quotidien à la référence × √252 : % par an."]],
  ["ir", ["Information ratio", "نسبة المعلومات", "Ratio d'information"], ["Active return ÷ tracking error.", "العائد النشط ÷ خطأ التتبع.", "Rendement actif ÷ tracking error."]],
  ["treynor", ["Treynor ratio", "نسبة تريينور", "Ratio de Treynor"], ["(Annualised return - risk-free rate) ÷ beta.", "(العائد السنوي - العائد الخالي من المخاطر) ÷ بيتا.", "(Rendement annualisé - taux sans risque) ÷ bêta."]],
  ["r2", ["Benchmark R-squared", "R² مقابل المعيار", "R² de la référence"], ["Correlation squared: share of your daily return variance the benchmark explains.", "مربع الارتباط: نسبة تباين عوائدك اليومية التي يفسرها المعيار.", "Corrélation au carré : part de la variance expliquée par la référence."]],
];
const M2: [string, L, L][] = [
  ["entryLoc", ["Average entry location in the day's range (buys / sells)", "متوسط موقع الدخول في نطاق اليوم (شراء / بيع)", "Position moyenne d'entrée dans la plage du jour (achats / ventes)"], ["Entry price inside the day's low-high: 0% = at the low, 100% = at the high. Low is good for buys, high for sells.", "سعر الدخول داخل أدنى-أعلى اليوم: 0% = عند الأدنى، 100% = عند الأعلى. المنخفض جيد للشراء والمرتفع للبيع.", "Prix d'entrée dans le bas-haut du jour : 0 % = au plus bas, 100 % = au plus haut. Bas = bien pour acheter, haut pour vendre."]],
  ["trendTrades", ["Trend-aligned trades", "الصفقات مع الاتجاه", "Trades dans le sens de la tendance"], ["Buys while the previous close was above its 50-day average, sells while below.", "الشراء والإغلاق السابق فوق متوسطه لـ50 يوماً، والبيع وهو تحته.", "Achats quand la clôture précédente est au-dessus de sa moyenne 50 jours, ventes en dessous."]],
  ["trendWin", ["Trend-aligned trade win rate", "نسبة ربح الصفقات مع الاتجاه", "Taux de gain avec la tendance"], ["Share of trend-aligned trades closed in profit.", "نسبة الصفقات مع الاتجاه التي أُغلقت بربح.", "Part des trades avec la tendance clôturés en gain."]],
  ["counterWin", ["Countertrend trade win rate", "نسبة ربح الصفقات عكس الاتجاه", "Taux de gain contre-tendance"], ["Share of countertrend trades closed in profit.", "نسبة الصفقات عكس الاتجاه التي أُغلقت بربح.", "Part des trades contre-tendance clôturés en gain."]],
  ["lowVol", ["Low-volatility regime return", "عائد نظام التقلب المنخفض", "Rendement – faible volatilité"], ["Net P&L (trades) when the symbol's 14-day ATR was in its lowest third.", "صافي الربح (عدد الصفقات) عندما كان ATR لـ14 يوماً في ثلثه الأدنى.", "P&L net (trades) quand l'ATR 14 jours du symbole était dans son tiers bas."]],
  ["normVol", ["Normal-volatility regime return", "عائد نظام التقلب الطبيعي", "Rendement – volatilité normale"], ["Net P&L (trades) when the 14-day ATR was in its middle third.", "صافي الربح (عدد الصفقات) عندما كان ATR في ثلثه الأوسط.", "P&L net (trades) quand l'ATR était dans son tiers médian."]],
  ["highVol", ["High-volatility regime return", "عائد نظام التقلب المرتفع", "Rendement – forte volatilité"], ["Net P&L (trades) when the 14-day ATR was in its highest third.", "صافي الربح (عدد الصفقات) عندما كان ATR في ثلثه الأعلى.", "P&L net (trades) quand l'ATR était dans son tiers haut."]],
  ["bestVol", ["Best-performing volatility regime", "أفضل نظام تقلب أداءً", "Meilleur régime de volatilité"], ["Volatility level with the best average P&L per trade (at least 3 trades).", "مستوى التقلب الذي فيه أفضل متوسط ربح للصفقة (3 صفقات على الأقل).", "Niveau de volatilité au meilleur P&L moyen par trade (3 trades min.)."]],
  ["barsDur", ["Average trade duration in bars", "متوسط مدة الصفقة بالشموع", "Durée moyenne en bougies"], ["Average holding time ÷ the bar size chosen above.", "متوسط مدة الاحتفاظ ÷ حجم الشمعة المختار أعلاه.", "Durée moyenne de détention ÷ taille de bougie choisie."]],
  ["relTrade", ["Average benchmark-relative trade return", "متوسط عائد الصفقة نسبةً إلى المعيار", "Rendement moyen relatif par trade"], ["Trade P&L in % of the balance before it, minus the benchmark move between the daily closes before the entry and before the exit (0 for trades inside one day).", "ربح الصفقة كنسبة من الرصيد قبلها، مطروحاً منه تحرك المعيار بين الإغلاقين اليوميين السابقين للدخول والخروج (0 للصفقات داخل اليوم نفسه).", "P&L du trade en % du solde avant lui, moins le mouvement de la référence entre les clôtures avant l'entrée et avant la sortie (0 pour un trade dans la journée)."]],
];
const BARS: [number, string][] = [[5, "M5"], [15, "M15"], [60, "H1"], [240, "H4"], [1440, "D1"]];
const GREEN = "#22c55e", RED = "#f87171", NEUTRAL = "var(--primary)";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
type Load = { state: "loading" } | { state: "ok"; p: Prices } | { state: "error"; e: LoadError };

export default function BenchmarkTab({ lang, trades, start, flows, currency }: { lang: Lang; trades: Trade[]; start: number; flows: CashFlow[]; currency: string | null }) {
  const k = i(lang), T = (x: L) => x[k];
  const [view, setView] = useState<View>("grid");
  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (p: Partial<typeof prefs>) => { const n = { ...prefs, ...p }; setPrefsState(n); savePrefs(n); };
  const [map, setMapState] = useState(loadMap);
  const [reload, setReload] = useState(0);
  const [bench, setBench] = useState<Load>({ state: "loading" });
  const [syms, setSyms] = useState<Record<string, Load>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [csvMsg, setCsvMsg] = useState<string | null>(null);

  const closed = useMemo(() => trades.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && t.exitTime).sort((a, b) => (a.exitTime as string).localeCompare(b.exitTime as string) || a.no - b.no), [trades]);
  const from = closed[0]?.exitTime?.slice(0, 10) ?? "", to = closed[closed.length - 1]?.exitTime?.slice(0, 10) ?? "";
  const firstEntry = closed.reduce((m, t) => { const d = (t.entryTime ?? t.exitTime ?? "").slice(0, 10); return d && d < m ? d : m; }, from);
  const symbols = useMemo(() => [...new Set(closed.map((t) => t.symbol))].sort(), [closed]);
  const def = benchOf(prefs);
  const tickerOf = (s: string): Ticker | null => (map[s] ? { yahoo: map[s], stooq: null } : tickerFor(s));

  useEffect(() => {
    if (!from) return;
    let live = true;
    setBench({ state: "loading" });
    // +7 days: trades on a weekend after the last close count on the next close
    loadDaily(`bench:${def.id}`, def.t, addDays(from, -10), addDays(to, 7)).then((r) => live && setBench("error" in r ? { state: "error", e: r.error } : { state: "ok", p: r }));
    return () => { live = false; };
  }, [def.id, from, to, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!firstEntry) return;
    let live = true;
    setSyms(Object.fromEntries(symbols.map((s) => [s, { state: "loading" } as Load])));
    Promise.all(symbols.map(async (s) => [s, await loadDaily(`sym:${s}`, tickerOf(s), addDays(firstEntry, -120), to)] as const)).then((all) => {
      if (live) setSyms(Object.fromEntries(all.map(([s, r]) => [s, "error" in r ? { state: "error", e: r.error } : { state: "ok", p: r }])));
    });
    return () => { live = false; };
  }, [symbols.join("|"), firstEntry, to, reload, JSON.stringify(map)]); // eslint-disable-line react-hooks/exhaustive-deps

  const benchBars: Bar[] | null = bench.state === "ok" ? bench.p.bars : null;
  const acct = useMemo(() => (from ? accountDays(closed, start, flows, from, to) : null), [closed, start, flows, from, to]);
  const pairs = useMemo(() => (acct && benchBars ? alignWithBenchmark(acct, benchBars, from, to) : []), [acct, benchBars, from, to]);
  const bs = useMemo(() => benchStats(pairs, { rf: prefs.rf }), [pairs, prefs.rf]);
  const symBars = useMemo(() => Object.fromEntries(Object.entries(syms).flatMap(([s, l]) => (l.state === "ok" ? [[s, l.p.bars]] : []))) as Record<string, Bar[]>, [syms]);
  const mc = useMemo(() => marketContext(closed, symBars, { barMinutes: prefs.barMinutes, start, bench: benchBars ?? undefined }), [closed, symBars, prefs.barMinutes, start, benchBars]);

  // ----- formatting -----
  const f = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/^-(?=0(\.0+)?$)/, ""); // no "-0.00"
  const sgn = (n: number, d = 2, unit = "%") => { const s = f(n, d); return `${n > 0 && /[1-9]/.test(s) ? "+" : ""}${s}${unit}`; };
  const tone = (n: number | null | undefined) => (n == null ? NEUTRAL : n > 0 ? GREEN : n < 0 ? RED : NEUTRAL);
  const money = (n: number) => fmtMoney(n, { sign: true, currency });
  const errText = (e: LoadError) => T(e === "notDeployed" ? TXT.errNotDeployed : e === "unreachable" ? TXT.errUnreachable : e === "noTicker" ? TXT.errNoTicker : TXT.errNoData);
  const benchReason = !from ? T(TXT.noTrades) : bench.state === "loading" ? T(TXT.loading) : bench.state === "error" ? errText(bench.e) : !acct ? T(TXT.needStart) : !bs ? T(TXT.needDays).replace("{n}", String(pairs.length)) : undefined;

  const v1 = (id: string): [string, string, string | undefined] => { // value, colour, reason
    if (!bs) return ["—", NEUTRAL, benchReason];
    const nb = T(TXT.noBeta);
    switch (id) {
      case "benchReturn": return [sgn(bs.bench), tone(bs.bench), undefined];
      case "excess": return [sgn(bs.excess), tone(bs.excess), undefined];
      case "alpha": return bs.alpha == null ? ["—", NEUTRAL, nb] : [sgn(bs.alpha), tone(bs.alpha), undefined];
      case "beta": return bs.beta == null ? ["—", NEUTRAL, nb] : [f(bs.beta), NEUTRAL, undefined];
      case "corr": return bs.corr == null ? ["—", NEUTRAL, nb] : [f(bs.corr), NEUTRAL, undefined];
      case "upCap": return bs.upCapture == null ? ["—", NEUTRAL, nb] : [`${f(bs.upCapture, 1)}%`, NEUTRAL, undefined];
      case "downCap": return bs.downCapture == null ? ["—", NEUTRAL, nb] : [`${f(bs.downCapture, 1)}%`, NEUTRAL, undefined];
      case "relStr": return bs.relStrength == null ? ["—", NEUTRAL, nb] : [`${f(bs.relStrength, 3)}×`, tone((bs.relStrength ?? 1) - 1), undefined];
      case "active": return bs.active == null ? ["—", NEUTRAL, nb] : [sgn(bs.active), tone(bs.active), undefined];
      case "te": return bs.trackingError == null ? ["—", NEUTRAL, nb] : [`${f(bs.trackingError)}%`, NEUTRAL, undefined];
      case "ir": return bs.infoRatio == null ? ["—", NEUTRAL, nb] : [f(bs.infoRatio), tone(bs.infoRatio), undefined];
      case "treynor": return bs.treynor == null ? ["—", NEUTRAL, nb] : [f(bs.treynor), tone(bs.treynor), undefined];
      case "r2": return bs.r2 == null ? ["—", NEUTRAL, nb] : [`${f(bs.r2 * 100, 1)}%`, NEUTRAL, undefined];
    }
    return ["—", NEUTRAL, undefined];
  };
  const symsLoading = Object.values(syms).some((l) => l.state === "loading");
  const symReason = !from ? T(TXT.noTrades) : symsLoading ? T(TXT.loading) : mc.covered === 0 ? T(TXT.needSym) : undefined;
  const reg = (r: RegimeKey): [string, string, string | undefined] => {
    const x = mc.regimes[r];
    return x.n ? [`${money(x.net)} (${x.n})`, tone(x.net), undefined] : ["—", NEUTRAL, symReason ?? T(TXT.needHist)];
  };
  const v2 = (id: string): [string, string, string | undefined] => {
    switch (id) {
      case "entryLoc": return mc.location.n ? [`${mc.location.long == null ? "—" : `${f(mc.location.long, 0)}%`} / ${mc.location.short == null ? "—" : `${f(mc.location.short, 0)}%`}`, NEUTRAL, undefined] : ["—", NEUTRAL, symReason ?? T(mc.offScale.length ? TXT.allOff : TXT.needSym)];
      case "trendTrades": return mc.trend.n ? [`${f(mc.trend.share ?? 0, 1)}% (${mc.trend.aligned}/${mc.trend.n})`, NEUTRAL, undefined] : ["—", NEUTRAL, symReason ?? T(TXT.needHist)];
      case "trendWin": return mc.trend.alignedWin != null ? [`${f(mc.trend.alignedWin, 1)}%`, NEUTRAL, undefined] : ["—", NEUTRAL, symReason ?? T(TXT.needHist)];
      case "counterWin": return mc.trend.counterWin != null ? [`${f(mc.trend.counterWin, 1)}%`, NEUTRAL, undefined] : ["—", NEUTRAL, symReason ?? T(TXT.needHist)];
      case "lowVol": return reg("low");
      case "normVol": return reg("normal");
      case "highVol": return reg("high");
      case "bestVol": return mc.best ? [lang === "ar" ? `\u2067${T(TXT[mc.best])} (${ltrNumbers(money(mc.regimes[mc.best].avg ?? 0))})\u2069` : `${T(TXT[mc.best])} (${money(mc.regimes[mc.best].avg ?? 0)})`, tone(mc.regimes[mc.best].avg), undefined] : ["—", NEUTRAL, symReason ?? T(TXT.fewRegime)];
      case "barsDur": return mc.bars.avg != null ? [`${f(mc.bars.avg, 1)} (${BARS.find((b) => b[0] === prefs.barMinutes)?.[1] ?? ""})`, NEUTRAL, undefined] : ["—", NEUTRAL, T(TXT.noTrades)];
      case "relTrade": return mc.relTrade.avg != null ? [sgn(mc.relTrade.avg, 3), tone(mc.relTrade.avg), undefined] : ["—", NEUTRAL, !from ? T(TXT.noTrades) : !(start > 0) ? T(TXT.needStart) : bench.state === "loading" ? T(TXT.loading) : bench.state === "error" ? errText(bench.e) : T(TXT.needBench)];
    }
    return ["—", NEUTRAL, undefined];
  };
  const items = (m: [string, L, L][], val: (id: string) => [string, string, string | undefined]): Item[] => m.map(([id, l, tip]) => { const [value, color, reason] = val(id); return { id, label: T(l), tip: T(tip), value, color, reason }; });

  // ----- controls -----
  const pick = async (target: string, file: File | undefined) => {
    if (!file) return;
    const ok = importCsv(target, await file.text());
    setCsvMsg(ok ? null : T(TXT.csvBad));
    setReload((x) => x + 1);
  };
  const csvButton = (target: string) => (
    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--primary)]">
      <Upload size={13} className="text-icon" />{T(TXT.importCsv)}
      <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => { void pick(target, e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );
  const benchTarget = `bench:${def.id}`;
  const sel = "field !min-h-0 !w-auto min-w-0 max-w-full !py-1.5 text-sm";
  const statusLine = bench.state === "ok" && from
    // names and dates never break across lines (no-break spaces, word joiners after the date hyphens)
    ? ltrNumbers(T(TXT.status).replace("{b}", `\u2066${def.label.replace(/ /g, "\u00a0")}\u2069`).replace("{n}", String(bench.p.bars.length)).replace("{src}", bench.p.source === "csv" ? "CSV" : bench.p.source === "stooq" ? "Stooq" : "Yahoo\u00a0Finance").replace("{d}", String(pairs.length)).replace("{from}", from).replace("{to}", to)).replace(/(\d{4})-(\d{2})-(\d{2})/g, "$1-\u2060$2-\u2060$3")
    : ltrNumbers(benchReason ?? "");
  const top1 = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 max-w-full items-center gap-2 text-sm"><span className="shrink-0 text-muted">{T(TXT.bench)}</span>
          <select className={sel} value={prefs.bench} onChange={(e) => setPrefs({ bench: e.target.value })}>
            {BENCHMARKS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            <option value="custom">{T(TXT.custom)}</option>
          </select>
        </label>
        {prefs.bench === "custom" && <input className={`${sel} w-28`} dir="ltr" placeholder="^FTSE" defaultValue={prefs.custom} onBlur={(e) => setPrefs({ custom: e.target.value.trim() })} onKeyDown={(e) => e.key === "Enter" && setPrefs({ custom: (e.target as HTMLInputElement).value.trim() })} aria-label={T(TXT.ticker)} />}
        <label className="flex items-center gap-2 text-sm"><span className="text-muted">{T(TXT.rf)}</span>
          <input type="number" step={0.25} min={0} max={20} className={`${sel} w-20 text-end tnum`} value={prefs.rf} onChange={(e) => setPrefs({ rf: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} />
        </label>
        <span className="ms-auto flex items-center gap-2">
          {csvButton(benchTarget)}
          {readCsv(benchTarget) && <button type="button" onClick={() => { clearCsv(benchTarget); setReload((x) => x + 1); }} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--primary)]">{T(TXT.removeCsv)}</button>}
          <button type="button" onClick={() => { clearDownloads(); setReload((x) => x + 1); }} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--primary)]"><RefreshCw size={13} className="text-icon" />{T(TXT.refresh)}</button>
        </span>
      </div>
      {statusLine && <p className={`text-xs ${bench.state === "error" ? "text-[#f87171]" : "text-muted"}`}>{statusLine}</p>}
      {csvMsg && <p className="text-xs text-[#f87171]">{csvMsg}</p>}
    </div>
  );
  const chip = (s: string) => {
    const l = syms[s], off = mc.offScale.includes(s), ok = l?.state === "ok";
    const src = ok ? (l.p.source === "csv" ? "CSV" : l.p.source === "stooq" ? "Stooq" : "Yahoo") : l?.state === "loading" ? "…" : T(TXT.noPrices);
    return (
      <button key={s} type="button" onClick={() => { setEditing(editing === s ? null : s); setDraft(map[s] ?? tickerOf(s)?.yahoo ?? ""); }} title={off ? T(TXT.offScale) : undefined}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${editing === s ? "border-[var(--primary)]" : "border-border"} ${ok && !off ? "" : "text-muted"}`}>
        {ok && !off ? <Check size={12} className="text-[#22c55e]" /> : <AlertTriangle size={12} className="text-[var(--primary)]" />}
        <span className="font-semibold" dir="ltr">{s.replace(/^[^:]+:/, "")}</span><span>{src}</span>
      </button>
    );
  };
  const top2 = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{T(TXT.symbols)}</span>
        {symbols.map(chip)}
        <label className="ms-auto flex items-center gap-2 text-sm"><span className="text-muted">{T(TXT.barSize)}</span>
          <select className={sel} value={prefs.barMinutes} onChange={(e) => setPrefs({ barMinutes: Number(e.target.value) })}>
            {BARS.map(([m, n]) => <option key={m} value={m}>{n}</option>)}
          </select>
        </label>
      </div>
      {editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
          <span className="font-semibold" dir="ltr">{editing}</span>
          {mc.offScale.includes(editing) && <span className="text-xs text-[var(--primary)]">{T(TXT.offScale)}</span>}
          <label className="flex items-center gap-2"><span className="text-muted">{T(TXT.ticker)}</span><input className={`${sel} w-32`} dir="ltr" value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
          <button type="button" onClick={() => { const m = { ...map }; if (draft.trim()) m[editing] = draft.trim(); else delete m[editing]; saveMap(m); setMapState(m); setEditing(null); }} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-on-primary">{T(TXT.save)}</button>
          {csvButton(`sym:${editing}`)}
          {readCsv(`sym:${editing}`) && <button type="button" onClick={() => { clearCsv(`sym:${editing}`); setReload((x) => x + 1); }} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">{T(TXT.removeCsv)}</button>}
          {syms[editing]?.state === "error" && <span className="text-xs text-[#f87171]">{errText((syms[editing] as { e: LoadError }).e)}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <ViewHeader title={T(TXT.title)} sub={T(TXT.sub)} badge={def.label} view={view} onView={setView} gridLabel={lang === "ar" ? "عرض شبكي" : lang === "fr" ? "Vue grille" : "Grid view"} listLabel={lang === "ar" ? "عرض قائمة" : lang === "fr" ? "Vue liste" : "List view"} />
      <MetricSection icon={<GitCompareArrows size={18} />} title={T(TXT.s1)} subtitle={T(TXT.s1d)} view={view} items={items(M1, v1)} top={top1} />
      <MetricSection icon={<Globe2 size={18} />} title={T(TXT.s2)} subtitle={T(TXT.s2d)} view={view} items={items(M2, v2)} top={from ? top2 : undefined} />
    </div>
  );
}
