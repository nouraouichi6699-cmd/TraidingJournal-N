// The indicators and tools a trader can put in their own strategy, in six groups. Technical names are the same in
// every language (RSI, VWAP, FVG); descriptive ones have their Arabic and French names.
import type { Lang } from "../types";

export type ToolGroup = "trend" | "momentum" | "volatility" | "volume" | "price" | "time";
export interface Tool { id: string; g: ToolGroup; n: string; ar?: string; fr?: string }

export const TOOL_GROUPS: ToolGroup[] = ["trend", "momentum", "volatility", "volume", "price", "time"];
export const TOOL_GROUP_LABEL: Record<ToolGroup, Record<Lang, string>> = {
  trend: { en: "Trend", ar: "الاتجاه", fr: "Tendance" },
  momentum: { en: "Momentum", ar: "الزخم", fr: "Momentum" },
  volatility: { en: "Volatility", ar: "التقلب", fr: "Volatilité" },
  volume: { en: "Volume", ar: "الحجم", fr: "Volume" },
  price: { en: "Price action & smart money", ar: "حركة السعر والأموال الذكية", fr: "Price action et smart money" },
  time: { en: "Sessions & time", ar: "الجلسات والوقت", fr: "Sessions et horaires" },
};

export const TOOLS: Tool[] = [
  // trend
  { id: "sma", g: "trend", n: "SMA" },
  { id: "ema", g: "trend", n: "EMA" },
  { id: "wma", g: "trend", n: "WMA" },
  { id: "hma", g: "trend", n: "Hull MA" },
  { id: "vwma", g: "trend", n: "VWMA" },
  { id: "ma-cross", g: "trend", n: "MA crossover", ar: "تقاطع المتوسطات", fr: "Croisement de moyennes" },
  { id: "ichimoku", g: "trend", n: "Ichimoku" },
  { id: "supertrend", g: "trend", n: "Supertrend" },
  { id: "psar", g: "trend", n: "Parabolic SAR" },
  { id: "adx", g: "trend", n: "ADX / DMI" },
  { id: "aroon", g: "trend", n: "Aroon" },
  { id: "alligator", g: "trend", n: "Williams Alligator" },
  { id: "linreg", g: "trend", n: "Linear regression", ar: "الانحدار الخطي", fr: "Régression linéaire" },
  { id: "donchian", g: "trend", n: "Donchian channels", ar: "قنوات دونشيان", fr: "Canaux de Donchian" },
  { id: "trendline", g: "trend", n: "Trendline", ar: "خط الاتجاه", fr: "Ligne de tendance" },
  { id: "channel", g: "trend", n: "Price channel", ar: "القناة السعرية", fr: "Canal de prix" },
  // momentum
  { id: "rsi", g: "momentum", n: "RSI" },
  { id: "rsi-div", g: "momentum", n: "RSI divergence", ar: "دايفرجنس RSI", fr: "Divergence RSI" },
  { id: "stoch", g: "momentum", n: "Stochastic" },
  { id: "stochrsi", g: "momentum", n: "Stochastic RSI" },
  { id: "macd", g: "momentum", n: "MACD" },
  { id: "cci", g: "momentum", n: "CCI" },
  { id: "willr", g: "momentum", n: "Williams %R" },
  { id: "momentum", g: "momentum", n: "Momentum" },
  { id: "roc", g: "momentum", n: "ROC" },
  { id: "ao", g: "momentum", n: "Awesome Oscillator" },
  { id: "tsi", g: "momentum", n: "TSI" },
  { id: "uo", g: "momentum", n: "Ultimate Oscillator" },
  // volatility
  { id: "atr", g: "volatility", n: "ATR" },
  { id: "bb", g: "volatility", n: "Bollinger Bands" },
  { id: "keltner", g: "volatility", n: "Keltner Channels" },
  { id: "squeeze", g: "volatility", n: "Squeeze Momentum" },
  { id: "envelopes", g: "volatility", n: "MA envelopes", ar: "أغلفة المتوسط", fr: "Enveloppes" },
  { id: "stdev", g: "volatility", n: "Standard deviation", ar: "الانحراف المعياري", fr: "Écart-type" },
  { id: "hv", g: "volatility", n: "Historical volatility", ar: "التقلب التاريخي", fr: "Volatilité historique" },
  { id: "adr", g: "volatility", n: "ADR", ar: "متوسط المدى اليومي (ADR)", fr: "Range moyen du jour (ADR)" },
  { id: "vix", g: "volatility", n: "VIX" },
  // volume
  { id: "volume", g: "volume", n: "Volume", ar: "الحجم", fr: "Volume" },
  { id: "rvol", g: "volume", n: "Relative volume", ar: "الحجم النسبي", fr: "Volume relatif" },
  { id: "obv", g: "volume", n: "OBV" },
  { id: "vwap", g: "volume", n: "VWAP" },
  { id: "avwap", g: "volume", n: "Anchored VWAP", ar: "VWAP المثبت", fr: "VWAP ancré" },
  { id: "vprofile", g: "volume", n: "Volume Profile" },
  { id: "tpo", g: "volume", n: "Market Profile (TPO)" },
  { id: "cvd", g: "volume", n: "CVD" },
  { id: "delta", g: "volume", n: "Delta" },
  { id: "footprint", g: "volume", n: "Footprint" },
  { id: "dom", g: "volume", n: "Order book (DOM)", ar: "دفتر الأوامر (DOM)", fr: "Carnet d'ordres (DOM)" },
  { id: "mfi", g: "volume", n: "MFI" },
  { id: "cmf", g: "volume", n: "Chaikin Money Flow" },
  { id: "ad", g: "volume", n: "Accumulation / Distribution", ar: "التجميع والتوزيع (A/D)", fr: "Accumulation / Distribution" },
  { id: "oi", g: "volume", n: "Open interest", ar: "العقود المفتوحة", fr: "Intérêt ouvert" },
  // price action and smart money
  { id: "structure", g: "price", n: "Market structure (BOS / CHoCH)", ar: "هيكل السوق (BOS / CHoCH)", fr: "Structure de marché (BOS / CHoCH)" },
  { id: "ob", g: "price", n: "Order block", ar: "أوردر بلوك", fr: "Order block" },
  { id: "breaker", g: "price", n: "Breaker block", ar: "بريكر بلوك", fr: "Breaker block" },
  { id: "fvg", g: "price", n: "Fair value gap (FVG)", ar: "فجوة القيمة العادلة (FVG)", fr: "Fair value gap (FVG)" },
  { id: "liquidity", g: "price", n: "Liquidity sweep", ar: "سحب السيولة", fr: "Prise de liquidité" },
  { id: "eqhl", g: "price", n: "Equal highs / lows", ar: "قمم وقيعان متساوية", fr: "Sommets / creux égaux" },
  { id: "pd", g: "price", n: "Premium / Discount", ar: "الغلاء والخصم", fr: "Premium / Discount" },
  { id: "ote", g: "price", n: "OTE" },
  { id: "inducement", g: "price", n: "Inducement", ar: "الإغراء", fr: "Inducement" },
  { id: "smt", g: "price", n: "SMT divergence", ar: "اختلاف SMT", fr: "Divergence SMT" },
  { id: "sd", g: "price", n: "Supply & demand zones", ar: "مناطق العرض والطلب", fr: "Zones d'offre et de demande" },
  { id: "sr", g: "price", n: "Support & resistance", ar: "الدعم والمقاومة", fr: "Supports et résistances" },
  { id: "pivots", g: "price", n: "Pivot points", ar: "نقاط الارتكاز", fr: "Points pivots" },
  { id: "fib", g: "price", n: "Fibonacci retracement", ar: "تصحيح فيبوناتشي", fr: "Retracement de Fibonacci" },
  { id: "fibext", g: "price", n: "Fibonacci extension", ar: "امتداد فيبوناتشي", fr: "Extension de Fibonacci" },
  { id: "round", g: "price", n: "Round numbers", ar: "الأرقام الدائرية", fr: "Chiffres ronds" },
  { id: "candles", g: "price", n: "Candlestick patterns", ar: "نماذج الشموع", fr: "Figures de bougies" },
  { id: "chart", g: "price", n: "Chart patterns", ar: "النماذج الفنية", fr: "Figures chartistes" },
  { id: "harmonic", g: "price", n: "Harmonic patterns", ar: "النماذج التوافقية", fr: "Figures harmoniques" },
  { id: "elliott", g: "price", n: "Elliott waves", ar: "موجات إليوت", fr: "Vagues d'Elliott" },
  { id: "wyckoff", g: "price", n: "Wyckoff phases", ar: "مراحل وايكوف", fr: "Phases de Wyckoff" },
  { id: "crt", g: "price", n: "Candle range (CRT)", ar: "نطاق الشمعة (CRT)", fr: "Range de bougie (CRT)" },
  { id: "heikin", g: "price", n: "Heikin Ashi" },
  { id: "renko", g: "price", n: "Renko" },
  { id: "mtf", g: "price", n: "Multi-timeframe analysis", ar: "تحليل متعدد الأطر", fr: "Analyse multi-unités de temps" },
  // sessions and time
  { id: "asia", g: "time", n: "Asian range", ar: "نطاق آسيا", fr: "Range asiatique" },
  { id: "london", g: "time", n: "London open", ar: "افتتاح لندن", fr: "Ouverture de Londres" },
  { id: "ny", g: "time", n: "New York open", ar: "افتتاح نيويورك", fr: "Ouverture de New York" },
  { id: "killzones", g: "time", n: "Kill zones", ar: "مناطق القتل", fr: "Kill zones" },
  { id: "silver", g: "time", n: "Silver Bullet window", ar: "نافذة السيلفر بوليت", fr: "Fenêtre Silver Bullet" },
  { id: "orb", g: "time", n: "Opening range", ar: "نطاق الافتتاح", fr: "Opening range" },
  { id: "pdhl", g: "time", n: "Previous day high / low", ar: "قمة وقاع اليوم السابق", fr: "Plus haut / bas de la veille" },
  { id: "pwhl", g: "time", n: "Previous week high / low", ar: "قمة وقاع الأسبوع السابق", fr: "Plus haut / bas de la semaine passée" },
  { id: "midnight", g: "time", n: "Midnight open", ar: "افتتاح منتصف الليل", fr: "Ouverture de minuit" },
  { id: "opens", g: "time", n: "Daily / weekly open", ar: "الافتتاح اليومي والأسبوعي", fr: "Ouverture du jour / de la semaine" },
  { id: "news", g: "time", n: "Economic news", ar: "الأخبار الاقتصادية", fr: "Annonces économiques" },
];

export const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]));
/** A tool's name in the reader's language. */
export const toolName = (t: Tool, lang: Lang) => (lang === "en" ? t.n : t[lang] ?? t.n);
