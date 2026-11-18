// GLORIA_RPG: copy and formatters for the hero system (Your Hero, roster locks, character detail, reveal, history).
// en / ar / fr, kept beside the feature like gloriaText.ts.
import type { Lang } from "../../types";
import type { GloriaHeroUpdateKind } from "../../types/gloria";
import type { Criterion, CriterionMetric, HeroReason } from "../../services/gloriaCharacterRules";
import { CHARACTER_PATHS } from "../../services/gloriaCharacterRules";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";

type L = Record<Lang, string>;

export const HERO_TEXT = {
  openHero: { en: "Open your hero's page", ar: "افتح صفحة بطلك", fr: "Ouvrir la page de votre héros" },
  yourHero: { en: "Your Hero", ar: "بطلك", fr: "Votre héros" },
  freeStarter: { en: "Free starter", ar: "بداية مجانية", fr: "Héros de départ" },
  currentHero: { en: "Current hero", ar: "البطل الحالي", fr: "Héros actuel" },
  whyTitle: { en: "Why this hero", ar: "لماذا هذا البطل", fr: "Pourquoi ce héros" },
  basedOn: { en: "Based on", ar: "بناءً على", fr: "Basé sur" },
  runnerUp: { en: "Runner-up", ar: "الوصيف", fr: "Second choix" },
  scheduleTitle: { en: "Next updates", ar: "التحديثات القادمة", fr: "Prochaines mises à jour" },
  nextWeekly: { en: "Weekly update", ar: "التحديث الأسبوعي", fr: "Mise à jour hebdo" },
  nextMonth: { en: "New month", ar: "بداية الشهر", fr: "Nouveau mois" },
  scheduleNote: {
    en: "Your hero is re-assessed only on these dates and stays fixed in between. A due update is applied the next time you open Gloria.",
    ar: "يُعاد تقييم بطلك في هذه المواعيد فقط ويبقى ثابتاً بينها. يُطبَّق التحديث المستحق عند فتح غلوريا في المرة القادمة.",
    fr: "Votre héros n'est réévalué qu'à ces dates et reste fixe entre-temps. Une mise à jour due s'applique à votre prochaine ouverture de Gloria.",
  },
  scheduleError: {
    en: "The hero schedule could not be reached, so the free starter is shown for now.",
    ar: "تعذر الوصول إلى جدول الأبطال، لذلك يُعرض بطل البداية المجاني حالياً.",
    fr: "Le planning des héros est injoignable ; le héros de départ est affiché pour l'instant.",
  },
  loadingHero: { en: "Summoning your hero…", ar: "جارٍ استدعاء بطلك…", fr: "Invocation de votre héros…" },

  // history / trophy case
  trophyTitle: { en: "Trophy case", ar: "خزانة الجوائز", fr: "Salle des trophées" },
  collected: { en: "heroes collected", ar: "أبطال تم جمعهم", fr: "héros collectés" },
  newHero: { en: "New hero", ar: "بطل جديد", fr: "Nouveau héros" },
  held: { en: "Held", ar: "ثابت", fr: "Conservé" },
  showAll: { en: "Show all", ar: "عرض الكل", fr: "Tout afficher" },
  showLess: { en: "Show less", ar: "عرض أقل", fr: "Réduire" },
  noHistory: { en: "Your first hero will be logged here.", ar: "سيُسجَّل بطلك الأول هنا.", fr: "Votre premier héros sera consigné ici." },
  from: { en: "from", ar: "بدلاً من", fr: "après" },

  // roster
  roster: { en: "All characters", ar: "كل الشخصيات", fr: "Tous les personnages" },
  locked: { en: "Locked", ar: "مقفلة", fr: "Verrouillé" },
  unlocked: { en: "Unlocked", ar: "مفتوحة", fr: "Débloqué" },
  toUnlock: { en: "To unlock", ar: "لفتحها", fr: "Pour débloquer" },
  back: { en: "All characters", ar: "كل الشخصيات", fr: "Tous les personnages" },
  enlarge: { en: "Tap to view the full poster", ar: "انقر لعرض الملصق كاملاً", fr: "Touchez pour voir l'affiche en entier" },
  close: { en: "Close", ar: "إغلاق", fr: "Fermer" },
  details: { en: "View details", ar: "عرض التفاصيل", fr: "Voir les détails" },

  // detail
  progressUnlock: { en: "Progress to unlock", ar: "التقدم نحو الفتح", fr: "Progression vers le déblocage" },
  matchNow: { en: "Match with your current stats", ar: "التطابق مع إحصاءاتك الحالية", fr: "Correspondance avec vos stats actuelles" },
  reqMet: { en: "Every requirement is met right now: it competes for your hero at the next update.", ar: "كل المتطلبات محققة الآن: سيتنافس على أن يكون بطلك في التحديث القادم.", fr: "Toutes les conditions sont remplies : il concourt pour être votre héros à la prochaine mise à jour." },
  requirements: { en: "Requirements", ar: "المتطلبات", fr: "Conditions" },
  or: { en: "or", ar: "أو", fr: "ou" },
  you: { en: "You", ar: "أنت", fr: "Vous" },
  focusStat: { en: "Focus stat", ar: "الإحصائية الرئيسية", fr: "Stat principale" },
  yourStats: { en: "Your trader stats now", ar: "إحصاءاتك الحالية", fr: "Vos stats actuelles" },
  record: { en: "Your record", ar: "سجلك", fr: "Votre historique" },
  timesHero: { en: "Times as your hero", ar: "مرات كونه بطلك", fr: "Fois votre héros" },
  firstTime: { en: "First", ar: "الأولى", fr: "Première" },
  lastTime: { en: "Latest", ar: "الأخيرة", fr: "Dernière" },
  neverHero: { en: "Not yet", ar: "ليس بعد", fr: "Pas encore" },
  starterNote: { en: "Free starter: always unlocked.", ar: "بطل البداية المجاني: مفتوح دائماً.", fr: "Héros de départ gratuit : toujours débloqué." },
  noData: { en: "No closed trades yet, so there is nothing to measure.", ar: "لا توجد صفقات مغلقة بعد، فلا شيء يمكن قياسه.", fr: "Aucun trade clôturé pour l'instant, rien à mesurer." },
  yes: { en: "Yes", ar: "نعم", fr: "Oui" },
  no: { en: "No", ar: "لا", fr: "Non" },

  // reveal
  revealChange: { en: "A new hero awakens", ar: "بطل جديد يستيقظ", fr: "Un nouveau héros s'éveille" },
  revealStarter: { en: "Your journey begins", ar: "تبدأ رحلتك", fr: "Votre voyage commence" },
  revealFirst: { en: "Your hero awakens", ar: "بطلك يستيقظ", fr: "Votre héros s'éveille" },
  revealContinue: { en: "Continue", ar: "متابعة", fr: "Continuer" },
  revealSkip: { en: "Skip", ar: "تخطّي", fr: "Passer" },
  revealDialog: { en: "Hero reveal", ar: "كشف البطل", fr: "Révélation du héros" },
} satisfies Record<string, L>;

export const heroT = (lang: Lang) => <K extends keyof typeof HERO_TEXT>(k: K): string => HERO_TEXT[k][lang];

export const KIND_TEXT: Record<GloriaHeroUpdateKind, L> = {
  starter: { en: "Free starter", ar: "بداية مجانية", fr: "Héros de départ" },
  initial: { en: "First reading", ar: "القراءة الأولى", fr: "Première lecture" },
  weekly: { en: "Weekly update", ar: "تحديث أسبوعي", fr: "Mise à jour hebdo" },
  monthly: { en: "New month", ar: "شهر جديد", fr: "Nouveau mois" },
};

// ── Why this hero ──────────────────────────────────────────────────────────────────────────────────────────────

interface IntroCtx { name: string; trades: number }

const INTRO: Record<HeroReason, Record<Lang, (c: IntroCtx) => string>> = {
  starter: {
    en: (c) => `You have no closed trades yet, so ${c.name} joins you as a free starter hero. At the first scheduled update after you have trade history, your hero becomes whichever one your real trading earns.`,
    ar: (c) => `ليس لديك صفقات مغلقة بعد، لذلك ينضم إليك ${c.name} كبطل مجاني للبداية. عند أول تحديث مجدول بعد أن يصبح لديك سجل تداول، يصبح بطلك الشخصية التي يستحقها تداولك الفعلي.`,
    fr: (c) => `Vous n'avez aucun trade clôturé, donc ${c.name} vous rejoint comme héros de départ gratuit. À la première mise à jour planifiée après l'apparition d'un historique, votre héros devient celui que votre trading réel mérite.`,
  },
  newcomer: {
    en: (c) => `You have closed only ${c.trades} trade${c.trades === 1 ? "" : "s"} so far. Under 5 trades is too few to read a style, so you are the ${c.name} for now. Keep trading: a fuller month gives a sharper reading.`,
    ar: (c) => `لقد أغلقت ${c.trades} صفقة فقط حتى الآن. أقل من 5 صفقات قليلة جداً لقراءة أسلوبك، لذا أنت ${c.name} في الوقت الحالي. واصل التداول: شهر أكثر نشاطاً يعطي قراءة أدق.`,
    fr: (c) => `Vous n'avez clôturé que ${c.trades} trade${c.trades === 1 ? "" : "s"} pour l'instant. Moins de 5 trades, c'est trop peu pour lire un style : vous êtes donc ${c.name} pour le moment. Continuez : un mois plus fourni donnera une lecture plus précise.`,
  },
  elf: {
    en: (c) => `Every one of your seven trader stats is above 70, and your win rate, drawdown and payoff ratio all clear the legendary bar. Rare air: the ${c.name}.`,
    ar: (c) => `كل إحصاءاتك السبع فوق 70، ونسبة ربحك وتراجعك ونسبة العائد كلها تتخطى معيار الأسطورة. مستوى نادر: ${c.name}.`,
    fr: (c) => `Vos sept stats de trader dépassent 70, et votre taux de réussite, votre drawdown et votre ratio gain/perte passent tous le seuil légendaire. Air rare : ${c.name}.`,
  },
  savage: {
    en: (c) => `That reading was rough: a low win rate, a deep drawdown and a weak payoff ratio together make you the ${c.name}. It is a starting point, not a verdict; each line below shows what to move.`,
    ar: (c) => `كانت هذه القراءة صعبة: نسبة ربح منخفضة وتراجع عميق ونسبة عائد ضعيفة جعلتك ${c.name}. إنها نقطة بداية لا حكم نهائي؛ كل سطر أدناه يوضح ما يجب تحسينه.`,
    fr: (c) => `Cette lecture était difficile : faible taux de réussite, drawdown profond et ratio gain/perte faible font de vous ${c.name}. C'est un point de départ, pas un verdict ; chaque ligne ci-dessous montre quoi faire bouger.`,
  },
  rogue: {
    en: (c) => `You are hovering around break-even: win rate, drawdown and payoff ratio all sit in the neutral band, with no clear edge yet. That is the ${c.name}.`,
    ar: (c) => `أنت قرب نقطة التعادل: نسبة الربح والتراجع ونسبة العائد كلها في النطاق المحايد، بلا ميزة واضحة بعد. هذا هو ${c.name}.`,
    fr: (c) => `Vous oscillez autour de l'équilibre : taux de réussite, drawdown et ratio gain/perte sont dans la bande neutre, sans avantage net. C'est ${c.name}.`,
  },
  qualified: {
    en: (c) => `You met every requirement of the ${c.name}. When more than one hero qualifies, the best-fitting one is chosen.`,
    ar: (c) => `حققت كل متطلبات ${c.name}. عندما يتأهل أكثر من بطل، يُختار الأنسب.`,
    fr: (c) => `Vous remplissez toutes les conditions de ${c.name}. Quand plusieurs héros se qualifient, le mieux adapté est choisi.`,
  },
  closest: {
    en: (c) => `No hero had every requirement met for this reading, so your closest profile, the ${c.name}, was chosen. The lines below show what is still missing.`,
    ar: (c) => `لم تتحقق المتطلبات الكاملة لأي بطل في هذه القراءة، فاختير أقرب ملف لك، ${c.name}. توضح الأسطر أدناه ما ينقصك.`,
    fr: (c) => `Aucun héros n'avait toutes ses conditions remplies pour cette lecture ; votre profil le plus proche, ${c.name}, a été retenu. Les lignes ci-dessous montrent ce qui manque encore.`,
  },
};

export const heroIntro = (reason: HeroReason, lang: Lang, ctx: IntroCtx): string => INTRO[reason][lang](ctx);

// ── Criteria formatting ────────────────────────────────────────────────────────────────────────────────────────

export const METRIC_LABEL: Record<CriterionMetric, L> = {
  trades: { en: "Closed trades", ar: "الصفقات المغلقة", fr: "Trades clôturés" },
  winRate: { en: "Win rate", ar: "نسبة الربح", fr: "Taux de réussite" },
  drawdown: { en: "Max drawdown", ar: "أقصى تراجع", fr: "Drawdown max" },
  rr: { en: "Payoff ratio (RR)", ar: "نسبة العائد (RR)", fr: "Ratio gain/perte (RR)" },
  profitFactor: { en: "Profit factor", ar: "عامل الربح", fr: "Facteur de profit" },
  pairs: { en: "Different pairs", ar: "أزواج مختلفة", fr: "Paires différentes" },
  prevLoss: { en: "Came back from a losing month", ar: "تعافٍ من شهر خاسر", fr: "Remonté d'un mois perdant" },
  radarMin: { en: "Weakest of your 7 stats", ar: "أضعف إحصاءاتك السبع", fr: "Plus faible de vos 7 stats" },
};

/** Integer as-is, otherwise up to 2 decimals without trailing zeros (1.50 -> 1.5). */
export const fmtNum = (n: number): string => String(Math.round(n * 100) / 100);

const UNIT: Partial<Record<CriterionMetric, string>> = { winRate: "%", drawdown: "%" };

/** A measured value as text: "62%", "1.8", "Yes". `null` (not measurable yet) is an em dash. */
export function fmtValue(metric: CriterionMetric, v: number | null, lang: Lang): string {
  if (v == null) return "—";
  if (metric === "prevLoss") return v >= 1 ? HERO_TEXT.yes[lang] : HERO_TEXT.no[lang];
  return `${fmtNum(v)}${UNIT[metric] ?? ""}`;
}

/** Arabic reads better with words than with < > symbols sitting inside right-to-left text. */
const AR_OP: Record<"gt" | "gte" | "lt" | "lte", string> = { gt: "أكثر من", gte: "على الأقل", lt: "أقل من", lte: "على الأكثر" };

/** The requirement side of a criterion: "> 55%", "≥ 20", "40–50%" (Arabic: words), or "" for a yes/no flag (the label says it all). */
export function fmtRequirement(k: Criterion, lang: Lang): string {
  const u = UNIT[k.metric] ?? "";
  const ar = lang === "ar";
  switch (k.op) {
    case "gt": return `${ar ? AR_OP.gt : ">"} ${fmtNum(k.value)}${u}`;
    case "gte": return `${ar ? AR_OP.gte : "≥"} ${fmtNum(k.value)}${u}`;
    case "lt": return `${ar ? AR_OP.lt : "<"} ${fmtNum(k.value)}${u}`;
    case "lte": return `${ar ? AR_OP.lte : "≤"} ${fmtNum(k.value)}${u}`;
    case "between": return ar ? `بين ${fmtNum(k.value)} و ${fmtNum(k.hi ?? k.value)}${u}` : `${fmtNum(k.value)}–${fmtNum(k.hi ?? k.value)}${u}`;
    case "flag": return "";
  }
}

/** The generic "at least 5 closed trades" entry gate every non-newcomer path carries; left out of short hints. */
const isEntryGate = (k: Criterion) => k.metric === "trades" && k.op === "gte" && k.value === 5;

/** A short "what it takes" line for a locked card: the character's defining criteria, joined with " · ". */
export function unlockHint(id: GloriaCharacterId, lang: Lang): string {
  const paths = CHARACTER_PATHS[id];
  // Rogue's first path is the 1-4 trades newcomer shortcut; the break-even band is the one worth advertising.
  const path = paths.length > 1 ? paths[paths.length - 1] : paths[0];
  const parts = path
    .filter((k) => !isEntryGate(k))
    .map((k) => `${METRIC_LABEL[k.metric][lang]} ${fmtRequirement(k, lang)}`.trim());
  return parts.join(" · ");
}

/** Short names for the "Based on" summary line. */
export const STAT_SHORT: Record<"trades" | "winRate" | "drawdown" | "rr" | "plan", L> = {
  trades: { en: "trades", ar: "صفقة", fr: "trades" },
  winRate: { en: "win rate", ar: "نسبة الربح", fr: "réussite" },
  drawdown: { en: "drawdown", ar: "التراجع", fr: "drawdown" },
  rr: { en: "RR", ar: "RR", fr: "RR" },
  plan: { en: "plan followed", ar: "الالتزام بالخطة", fr: "plan suivi" },
};

// ── Dates ──────────────────────────────────────────────────────────────────────────────────────────────────────

const LOCALE: Record<Lang, string> = { en: "en-US", ar: "ar-u-nu-latn", fr: "fr-FR" };

export const fmtDate = (d: Date | string, lang: Lang, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string => {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(LOCALE[lang], opts);
};

/** "2026-11" -> "November 2026". */
export const fmtMonth = (month: string, lang: Lang): string => fmtDate(new Date(`${month}-01T00:00:00Z`), lang, { month: "long", year: "numeric", timeZone: "UTC" });
