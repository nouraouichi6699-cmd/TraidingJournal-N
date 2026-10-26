// "My own rules" on the Challenges page: the rules editor of the challenge form, and the card — today's state, the
// discipline score, the price of broken rules, the room left under each loss limit, the broken rules, a looser change
// waiting for its day, and the contract with oneself (rules: lib/ownRules.ts).
import { useMemo, useState } from "react";
import { Download, PenLine, RotateCcw, ScrollText, SlidersHorizontal, Trash2, Pencil, X } from "lucide-react";
import type { Account, Lang, Trade } from "../types";
import type { Challenge } from "../lib/challenge";
import { amount, fromAdvisor, OWN_KEYS, ownState, rulesAt, tidy, type Limit, type OwnKey, type OwnRules } from "../lib/ownRules";
import { currencySymbol, fmtMoney, ltrNumbers } from "../lib/money";
import { Bar, BalanceChart, dangerColor, dayLabel, fill, loc, nowFor } from "./challengeUi";
import SignaturePad, { Signature } from "./SignaturePad";
import SymbolPicker from "./SymbolPicker";
import { cleanSymbol } from "../lib/symbols";

type L3 = Record<Lang, string>;
const X3 = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });
export const OT = {
  kind: X3("My own rules", "قواعدي الخاصة", "Mes propres règles"),
  kindD: X3("My rules and my risk management: I set everything.", "قواعدي وإدارة مخاطري: أنا من يحدد كل شيء.", "Mes règles et ma gestion du risque : je décide de tout."),
  name: X3("My rules", "قواعدي", "Mes règles"),
  active: X3("In progress", "قيد التقدم", "En cours"),
  ended: X3("Ended", "انتهى", "Terminé"),
  signedBadge: X3("Signed", "موقَّع", "Signé"),
  started: X3("Started {d}", "بدأ في {d}", "Commencé le {d}"),
  starts: X3("Starts {d}", "يبدأ في {d}", "Commence le {d}"),
  dayN: X3("day {n}", "اليوم {n}", "jour {n}"),
  attemptN: X3("attempt {n}", "المحاولة {n}", "tentative {n}"),
  pendingStart: X3("Starts on {d}: trades from that day count.", "يبدأ في {d}: تُحتسب الصفقات ابتداءً من ذلك اليوم.", "Commence le {d} : les trades comptent à partir de ce jour."),
  endedOn: X3("Ended on {d}: “{r}” was broken.", "انتهى في {d}: كُسرت قاعدة «{r}».", "Terminé le {d} : « {r} » a été enfreinte."),
  stoppedToday: X3("You broke a rule today: the rest of the day is off.", "كسرت قاعدة اليوم: بقية اليوم استراحة.", "Vous avez enfreint une règle aujourd'hui : le reste de la journée est off."),
  dailyHit: X3("Daily loss limit reached: stop for today.", "بلغت حد الخسارة اليومية: توقف لليوم.", "Perte max du jour atteinte : arrêtez pour aujourd'hui."),
  weeklyHit: X3("Weekly loss limit reached: stop until Monday.", "بلغت حد الخسارة الأسبوعية: توقف حتى الاثنين.", "Perte max de la semaine atteinte : arrêtez jusqu'à lundi."),
  monthlyHit: X3("Monthly loss limit reached: stop until next month.", "بلغت حد الخسارة الشهرية: توقف حتى الشهر القادم.", "Perte max du mois atteinte : arrêtez jusqu'au mois prochain."),
  overallHit: X3("Overall loss limit reached: stop and review your rules.", "بلغت حد الخسارة الكلية: توقف وراجع قواعدك.", "Perte max totale atteinte : arrêtez et revoyez vos règles."),
  pauseUntil: X3("Pause after a loss: your next trade from {t}.", "استراحة بعد خسارة: صفقتك التالية بعد {t}.", "Pause après une perte : prochain trade à partir de {t}."),
  lockHit: X3("Profit lock reached: well done, stop for today.", "بلغت قفل الربح: أحسنت، توقف لليوم.", "Verrou de gain atteint : bravo, arrêtez pour aujourd'hui."),
  tradesHit: X3("No trades left today ({n} of {m}).", "لم تبقَ صفقات لليوم ({n} من {m}).", "Plus de trades aujourd'hui ({n} sur {m})."),
  streakHit: X3("{k} today: stop for today.", "{k} اليوم: توقف لليوم.", "{k} aujourd'hui : arrêtez pour aujourd'hui."),
  allGood: X3("Within all your rules today.", "ملتزم بكل قواعدك اليوم.", "Toutes vos règles respectées aujourd'hui."),
  pending: X3("A looser version of your rules takes effect on {d} at {t}. Until then the stricter rules hold.", "نسخة أخفّ من قواعدك تسري في {d} الساعة {t}. حتى ذلك الحين تبقى القواعد الأشد.", "Une version plus souple de vos règles s'applique le {d} à {t}. D'ici là, les règles les plus strictes restent."),
  keep: X3("Keep the current rules", "أبقِ القواعد الحالية", "Garder les règles actuelles"),
  retry: X3("New attempt", "محاولة جديدة", "Nouvelle tentative"),
  retryToday: X3("Same rules, from today's opening balance.", "بالقواعد نفسها، من رصيد بداية اليوم.", "Mêmes règles, depuis le solde d'ouverture du jour."),
  retryTomorrow: X3("Same rules, from tomorrow: today is a rest day.", "بالقواعد نفسها، ابتداءً من الغد: اليوم استراحة.", "Mêmes règles, dès demain : aujourd'hui, repos."),
  score: X3("Discipline", "الانضباط", "Discipline"),
  scoreSub: X3("{c} of {n} days without a broken rule", "{c} من {n} أيام دون كسر قاعدة", "{c} jours sur {n} sans règle enfreinte"),
  inRow: X3("{n} in a row · best {b}", "{n} متتالية · الأفضل {b}", "{n} d'affilée · record {b}"),
  cost: X3("The price of broken rules", "ثمن كسر القواعد", "Le prix des règles enfreintes"),
  costBroke: X3("Broke a rule: {n}", "خالفت قاعدة: {n}", "Règle enfreinte : {n}"),
  costKept: X3("Within your rules: {n}", "ضمن قواعدك: {n}", "Dans vos règles : {n}"),
  costNone: X3("No closed trades yet.", "لا صفقات مغلقة بعد.", "Aucun trade clôturé."),
  goal: X3("Goal", "الهدف", "Objectif"),
  reached: X3("Reached", "تم بلوغه", "Atteint"),
  toGo: X3("{p}% · {m} to go", "{p}% · بقي {m}", "{p} % · reste {m}"),
  today: X3("Today", "اليوم", "Aujourd'hui"),
  roomDaily: X3("Daily loss", "خسارة اليوم", "Perte du jour"),
  roomWeekly: X3("This week", "هذا الأسبوع", "Cette semaine"),
  roomMonthly: X3("This month", "هذا الشهر", "Ce mois-ci"),
  roomOverall: X3("Overall loss", "الخسارة الكلية", "Perte totale"),
  used: X3("{u} of {l} used · room {r}", "استُعمل {u} من {l} · الهامش {r}", "{u} sur {l} utilisés · marge {r}"),
  cTrades: X3("Trades today {n}/{m}", "صفقات اليوم {n}/{m}", "Trades du jour {n}/{m}"),
  cRun: X3("Losses in a row {n}/{m}", "خسائر متتالية {n}/{m}", "Pertes d'affilée {n}/{m}"),
  cLock: X3("Profit lock {v} / {l}", "قفل الربح {v} / {l}", "Verrou de gain {v} / {l}"),
  log: X3("Broken rules", "القواعد المكسورة", "Règles enfreintes"),
  logNone: X3("None so far: keep it up.", "لا شيء حتى الآن: واصل هكذا.", "Aucune pour l'instant : continuez."),
  showAll: X3("Show all ({n})", "عرض الكل ({n})", "Tout voir ({n})"),
  showLess: X3("Show less", "عرض أقل", "Moins"),
  contract: X3("My contract with myself", "عقدي مع نفسي", "Mon contrat avec moi-même"),
  lead: X3("I, {n}, commit to these rules:", "أنا {n}، ألتزم بهذه القواعد:", "Moi, {n}, je m'engage à respecter ces règles :"),
  me: X3("the trader", "المتداول", "le trader"),
  onWarn: X3("A broken rule is recorded and counts against my discipline.", "القاعدة المكسورة تُسجَّل وتُحسب على انضباطي.", "Une règle enfreinte est notée et compte contre ma discipline."),
  onDay: X3("If I break one, I stop trading for the rest of the day.", "إذا كسرت إحداها، أتوقف عن التداول بقية اليوم.", "Si j'en enfreins une, j'arrête de trader pour le reste de la journée."),
  onEnd: X3("If I break one, this challenge ends.", "إذا كسرت إحداها، ينتهي هذا التحدي.", "Si j'en enfreins une, ce challenge prend fin."),
  signName: X3("Your name", "اسمك", "Votre nom"),
  notify: X3("Tell my accountability partner and my coach on Telegram when I break one (never amounts).", "أبلغ شريك الالتزام ومدرّبي على تيليجرام عندما أكسر إحداها (دون أي مبالغ).", "Prévenir mon partenaire et mon coach sur Telegram quand j'en enfreins une (jamais de montants)."),
  sign: X3("Sign", "أوقّع", "Signer"),
  signedOn: X3("Signed by {n} on {d}", "وقّعه {n} في {d}", "Signé par {n} le {d}"),
  notifyOn: X3("Your partner and coach are told when a rule breaks.", "يُبلَّغ شريكك ومدرّبك عند كسر قاعدة.", "Votre partenaire et votre coach sont prévenus quand une règle est enfreinte."),
  changed: X3("Your rules changed since you signed.", "تغيّرت قواعدك منذ توقيعك.", "Vos règles ont changé depuis votre signature."),
  sigLabel: X3("Your signature", "توقيعك", "Votre signature"),
  sigHint: X3("Sign here with your mouse or your finger", "وقّع هنا بالفأرة أو بإصبعك", "Signez ici à la souris ou au doigt"),
  sigClear: X3("Clear and sign again", "امسح وأعد", "Effacer et recommencer"),
  signAgain: X3("Sign again", "وقّع من جديد", "Signer à nouveau"),
  note: X3("Loss limits on closed trades, by the broker's day. Deposits and withdrawals count as neither profit nor loss.", "حدود الخسارة على الصفقات المغلقة، بحسب يوم الوسيط. الإيداع والسحب لا يُحتسبان ربحاً ولا خسارة.", "Limites de perte sur les trades clôturés, par jour du courtier. Dépôts et retraits ne comptent ni en gain ni en perte."),
  balance: X3("Balance", "الرصيد", "Solde"),
  edit: X3("Edit", "تعديل", "Modifier"),
  remove: X3("Remove", "حذف", "Supprimer"),
  confirmRemove: X3("Remove this challenge? Your trades stay.", "حذف هذا التحدي؟ تبقى صفقاتك كما هي.", "Supprimer ce challenge ? Vos trades restent."),
  cancel: X3("Cancel", "إلغاء", "Annuler"),
  // the editor
  gLoss: X3("Loss limits", "حدود الخسارة", "Limites de perte"),
  gLossD: X3("The most you may lose (empty = no limit; % = of the starting balance).", "أقصى ما يمكنك خسارته (فارغ = بلا حد؛ % = من رصيد البداية).", "Le maximum que vous pouvez perdre (vide = aucune limite ; % = du solde de départ)."),
  fDaily: X3("Per day", "في اليوم", "Par jour"),
  fWeekly: X3("Per week", "في الأسبوع", "Par semaine"),
  fMonthly: X3("Per month", "في الشهر", "Par mois"),
  fOverall: X3("Overall", "إجمالاً", "Au total"),
  gTrade: X3("One trade", "الصفقة الواحدة", "Un trade"),
  fPerTrade: X3("Max loss per trade", "أقصى خسارة للصفقة", "Perte max par trade"),
  fLots: X3("Max volume (lots)", "أقصى حجم (لوت)", "Volume max (lots)"),
  fSl: X3("A stop loss on every trade", "وقف خسارة لكل صفقة", "Un stop loss sur chaque trade"),
  gDisc: X3("Discipline", "الانضباط", "Discipline"),
  fMaxTrades: X3("Max trades a day", "أقصى عدد صفقات في اليوم", "Trades max par jour"),
  fStreak: X3("Stop after this many losses in a row", "التوقف بعد هذا العدد من الخسائر المتتالية", "Arrêt après ce nombre de pertes d'affilée"),
  fLock: X3("Stop for the day once up", "التوقف لليوم عند ربح", "Arrêt pour la journée à un gain de"),
  fCool: X3("Pause after a loss (minutes)", "استراحة بعد الخسارة (دقائق)", "Pause après une perte (minutes)"),
  gTime: X3("Time and markets", "الوقت والأسواق", "Horaires et marchés"),
  fHours: X3("Trade only between", "التداول فقط بين", "Trader seulement entre"),
  fAnd: X3("and", "و", "et"),
  fDaysOff: X3("Days off", "أيام الراحة", "Jours de repos"),
  fOnly: X3("Only these markets", "هذه الأسواق فقط", "Seulement ces marchés"),
  fAvoid: X3("Never these markets", "تجنّب هذه الأسواق", "Jamais ces marchés"),
  allMarkets: X3("All markets", "كل الأسواق", "Tous les marchés"),
  noMarket: X3("None", "لا شيء", "Aucun"),
  fSide: X3("Direction", "الاتجاه", "Sens"),
  sideBoth: X3("Buys and sells", "شراء وبيع", "Achats et ventes"),
  sideLong: X3("Buys only", "الشراء فقط", "Achats uniquement"),
  sideShort: X3("Sells only", "البيع فقط", "Ventes uniquement"),
  gGoal: X3("Goal (optional)", "الهدف (اختياري)", "Objectif (facultatif)"),
  fGoal: X3("Profit target", "هدف الربح", "Objectif de profit"),
  gBreak: X3("When I break a rule", "عندما أكسر قاعدة", "Quand j'enfreins une règle"),
  bWarn: X3("Warn me", "نبّهني فقط", "M'avertir"),
  bWarnD: X3("It is recorded and counts against my discipline.", "تُسجَّل وتُحسب على انضباطي.", "Elle est notée et compte contre ma discipline."),
  bDay: X3("The rest of the day off", "بقية اليوم استراحة", "Le reste de la journée off"),
  bDayD: X3("Any later trade that day is a broken rule too.", "كل صفقة بعدها في اليوم نفسه مخالفة أيضاً.", "Tout trade suivant ce jour-là est aussi une règle enfreinte."),
  bEnd: X3("End the challenge", "إنهاء التحدي", "Fin du challenge"),
  bEndD: X3("Like a prop firm: the first broken rule ends it.", "كشركات التمويل: أول قاعدة تُكسر تنهيه.", "Comme une prop firm : la première règle enfreinte y met fin."),
  importBtn: X3("Add my Advisor rules", "أضف قواعدي من المستشار", "Ajouter mes règles du conseiller"),
  imported: X3("Your Advisor rules were added: the stricter value is kept.", "أُضيفت قواعدك من المستشار، مع الإبقاء على القيمة الأشد.", "Vos règles du conseiller ont été ajoutées : la valeur la plus stricte est gardée."),
  lockNote: X3("Tightening a rule counts at once; loosening it counts 24 hours later.", "تشديد القاعدة يسري فوراً، وتخفيفها يسري بعد 24 ساعة.", "Durcir une règle compte tout de suite ; l'assouplir, 24 heures plus tard."),
  needRule: X3("Set at least one rule.", "ضع قاعدة واحدة على الأقل.", "Fixez au moins une règle."),
} satisfies Record<string, L3>;

// ---------- the rules in words ----------
const NAME: Record<OwnKey | "afterStop", L3> = {
  daily: X3("Daily loss limit", "حد الخسارة اليومية", "Perte max du jour"),
  weekly: X3("Weekly loss limit", "حد الخسارة الأسبوعية", "Perte max de la semaine"),
  monthly: X3("Monthly loss limit", "حد الخسارة الشهرية", "Perte max du mois"),
  overall: X3("Overall loss limit", "حد الخسارة الكلية", "Perte max totale"),
  perTrade: X3("Max loss per trade", "أقصى خسارة للصفقة", "Perte max par trade"),
  lots: X3("Max volume", "أقصى حجم", "Volume max"),
  sl: X3("A stop loss on every trade", "وقف خسارة لكل صفقة", "Un stop loss sur chaque trade"),
  maxTrades: X3("Trades a day", "عدد الصفقات في اليوم", "Trades par jour"),
  streak: X3("Losses in a row", "الخسائر المتتالية", "Pertes d'affilée"),
  lock: X3("Profit lock", "قفل الربح", "Verrou de gain"),
  cool: X3("Pause after a loss", "الاستراحة بعد الخسارة", "Pause après une perte"),
  hours: X3("Trading hours", "ساعات التداول", "Heures de trading"),
  daysOff: X3("Day off", "يوم راحة", "Jour de repos"),
  only: X3("Allowed markets", "الأسواق المسموحة", "Marchés autorisés"),
  avoid: X3("Avoided market", "سوق تتجنّبه", "Marché évité"),
  side: X3("Direction", "الاتجاه", "Sens"),
  afterStop: X3("Trading on after a stop", "مواصلة التداول بعد التوقف", "Continuer après un arrêt"),
};
const ar = (n: number, one: string, two: string, few: string, many: string) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`);
const nTrades = (n: number, lang: Lang) => (lang === "ar" ? ar(n, "صفقة واحدة", "صفقتان", "صفقات", "صفقة") : lang === "fr" ? `${n} trade${n > 1 ? "s" : ""}` : `${n} trade${n === 1 ? "" : "s"}`);
const nLosses = (n: number, lang: Lang) => (lang === "ar" ? ar(n, "خسارة واحدة", "خسارتين متتاليتين", "خسائر متتالية", "خسارة متتالية") : lang === "fr" ? `${n} perte${n > 1 ? "s" : ""} d'affilée` : `${n} loss${n === 1 ? "" : "es"} in a row`);
const nMin = (n: number, lang: Lang) => (lang === "ar" ? ar(n, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة") : `${n} min`);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const iso = (s: string, lang: Lang) => (lang === "ar" ? `⁦${s}⁩` : s);
const wdName = (i: number, lang: Lang, style: "long" | "short" = "long") => new Intl.DateTimeFormat(loc(lang), { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 19 + i))); // 2026-10-19 is a Monday
const join = (a: string[], lang: Lang) => a.join(lang === "ar" ? "، " : ", ");

/** One rule as a line (the card, the contract, the trade check). */
export function ruleLine(k: OwnKey, r: OwnRules, size: number, cur: string | null, lang: Lang): string {
  const m = (l?: Limit) => { const v = amount(l, size) ?? 0, s = fmtMoney(v, { currency: cur }); return l?.unit === "pct" ? `${l.v}% (${s})` : s; };
  const T3 = (en: string, a: string, fr: string) => ({ en, ar: a, fr })[lang];
  switch (k) {
    case "daily": return `${NAME.daily[lang]}: ${m(r.daily)}`;
    case "weekly": return `${NAME.weekly[lang]}: ${m(r.weekly)}`;
    case "monthly": return `${NAME.monthly[lang]}: ${m(r.monthly)}`;
    case "overall": return `${NAME.overall[lang]}: ${m(r.overall)}`;
    case "perTrade": return `${NAME.perTrade[lang]}: ${m(r.perTrade)}`;
    case "lots": return T3(`Max volume per trade: ${r.lots} lots`, `أقصى حجم للصفقة: ${r.lots} لوت`, `Volume max par trade : ${r.lots} lots`);
    case "sl": return NAME.sl[lang];
    case "maxTrades": return T3(`At most ${nTrades(r.maxTrades ?? 0, lang)} a day`, `بحد أقصى ${nTrades(r.maxTrades ?? 0, lang)} في اليوم`, `Au plus ${nTrades(r.maxTrades ?? 0, lang)} par jour`);
    case "streak": return T3(`Stop for the day after ${nLosses(r.streak ?? 0, lang)}`, `التوقف لليوم بعد ${nLosses(r.streak ?? 0, lang)}`, `Arrêt pour la journée après ${nLosses(r.streak ?? 0, lang)}`);
    case "lock": return T3(`Stop for the day once up ${m(r.lock)}`, `التوقف لليوم عند ربح ${m(r.lock)}`, `Arrêt pour la journée à +${m(r.lock)}`);
    case "cool": return T3(`Wait ${nMin(r.cool ?? 0, lang)} after a loss`, `انتظار ${nMin(r.cool ?? 0, lang)} بعد كل خسارة`, `Attendre ${nMin(r.cool ?? 0, lang)} après une perte`);
    case "hours": { const [a, b] = r.hours ?? [0, 0], w = iso(`${hh(a)}–${hh(b)}`, lang); return T3(`Trade only ${w}`, `التداول فقط ${w}`, `Trader seulement ${w}`); }
    case "daysOff": { const d = join((r.daysOff ?? []).slice().sort().map((i) => wdName(i, lang)), lang); return T3(`No trading on ${d}`, `لا تداول يوم ${d}`, `Pas de trading le ${d}`); }
    case "only": return T3(`Only ${join(r.only ?? [], lang)}`, `فقط: ${join(r.only ?? [], lang)}`, `Uniquement ${join(r.only ?? [], lang)}`);
    case "avoid": return T3(`Never ${join(r.avoid ?? [], lang)}`, `تجنّب ${join(r.avoid ?? [], lang)}`, `Jamais ${join(r.avoid ?? [], lang)}`);
    case "side": return r.side === "short" ? OT.sideShort[lang] : OT.sideLong[lang];
  }
}
/** The keys of the rules that are set, in display order. */
export const ruleKeys = (r: OwnRules) => OWN_KEYS.filter((k) => k in tidy(r));

// ---------- the editor ----------
type U = Limit["unit"];
type LimKey = "daily" | "weekly" | "monthly" | "overall" | "perTrade" | "lock" | "goal";
export type OwnDraft = Record<LimKey, string> & Record<`${LimKey}U`, U> & {
  lots: string; sl: boolean; maxTrades: string; streak: string; cool: string;
  hoursOn: boolean; hFrom: number; hTo: number; daysOff: number[]; only: string; avoid: string; side: "" | "long" | "short"; onBreak: OwnRules["onBreak"];
};
const LIMS: LimKey[] = ["daily", "weekly", "monthly", "overall", "perTrade", "lock", "goal"];
export function toDraft(r: OwnRules): OwnDraft {
  const d = { lots: r.lots != null ? String(r.lots) : "", sl: !!r.sl, maxTrades: r.maxTrades != null ? String(r.maxTrades) : "", streak: r.streak != null ? String(r.streak) : "", cool: r.cool != null ? String(r.cool) : "",
    hoursOn: !!r.hours, hFrom: r.hours?.[0] ?? 9, hTo: r.hours?.[1] ?? 17, daysOff: r.daysOff ?? [], only: (r.only ?? []).join(", "), avoid: (r.avoid ?? []).join(", "), side: r.side ?? "", onBreak: r.onBreak } as OwnDraft;
  for (const k of LIMS) { const l = r[k]; d[k] = l ? String(l.v) : ""; d[`${k}U`] = l?.unit ?? "money"; }
  return d;
}
const list = (s: string) => [...new Set(s.split(/[\s,;،]+/).map(cleanSymbol).filter(Boolean))].slice(0, 40);
/** The rules from the editor, and the fields that do not read. */
export function fromDraft(d: OwnDraft): { rules: OwnRules; bad: Set<string> } {
  const bad = new Set<string>(), r: OwnRules = { onBreak: d.onBreak };
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  for (const k of LIMS) {
    const v = num(d[k]);
    if (v == null) continue;
    if (!(Number.isFinite(v) && v > 0 && (d[`${k}U`] === "money" || v < (k === "goal" ? 1000 : 100)))) { bad.add(k); continue; }
    r[k] = { v, unit: d[`${k}U`] };
  }
  const int = (k: "maxTrades" | "streak" | "cool", max: number) => { const v = num(d[k]); if (v == null) return; if (Number.isInteger(v) && v >= 1 && v <= max) r[k] = v; else bad.add(k); };
  int("maxTrades", 100); int("streak", 50); int("cool", 1440);
  const lots = num(d.lots);
  if (lots != null) { if (Number.isFinite(lots) && lots > 0) r.lots = lots; else bad.add("lots"); }
  if (d.sl) r.sl = true;
  if (d.hoursOn && d.hFrom !== d.hTo) r.hours = [d.hFrom, d.hTo];
  if (d.daysOff.length) r.daysOff = [...d.daysOff].sort();
  if (list(d.only).length) r.only = list(d.only);
  if (list(d.avoid).length) r.avoid = list(d.avoid);
  if (d.side) r.side = d.side;
  return { rules: tidy(r), bad };
}
/** Whether at least one rule is set (the goal is not one). */
export const hasRule = (r: OwnRules) => ruleKeys(r).length > 0;

const readAdopted = (): { rules: Record<string, unknown> }[] => { try { const v = JSON.parse(localStorage.getItem("mizan-advisor-rules") ?? "[]"); return Array.isArray(v) ? v.filter((x) => x && typeof x.rules === "object") : []; } catch { return []; } };

export function OwnFields({ lang, d, set, bad, tried, cur, size, symbols }: { lang: Lang; d: OwnDraft; set: (d: OwnDraft) => void; bad: Set<string>; tried: boolean; cur: string | null; size: number; symbols: string[] }) {
  const L = (x: L3) => x[lang];
  const [done, setDone] = useState(false);
  const adopted = useMemo(readAdopted, []);
  const sym = currencySymbol(cur) || "$";
  const cls = (k: string) => `field min-w-0 flex-1 ${tried && bad.has(k) ? "!border-[var(--loss)]" : ""}`;
  const lbl = "flex flex-col gap-1.5 text-sm font-medium";
  const box = "rounded-xl border border-border p-4";
  const head = (t: string, sub?: string) => <div className="mb-3"><p className="font-heading text-sm font-semibold">{t}</p>{sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}</div>;
  const limit = (k: LimKey, label: string) => (
    <label key={k} className={lbl}>{label}
      <span className="flex gap-2">
        <input className={cls(k)} inputMode="decimal" dir="ltr" value={d[k]} onChange={(e) => set({ ...d, [k]: e.target.value })} />
        <span className="flex shrink-0 overflow-hidden rounded-lg border border-border" role="group" aria-label={label}>
          {(["money", "pct"] as const).map((u) => (
            <button key={u} type="button" aria-pressed={d[`${k}U`] === u} onClick={() => set({ ...d, [`${k}U`]: u })} className={`min-w-9 px-2.5 text-xs font-semibold ${d[`${k}U`] === u ? "bg-primary text-on-primary" : "text-muted hover:text-text"}`}>{u === "money" ? sym : "%"}</button>
          ))}
        </span>
      </span>
    </label>
  );
  const whole = (k: "maxTrades" | "streak" | "cool" | "lots", label: string) => <label key={k} className={lbl}>{label}<input className={cls(k)} inputMode={k === "lots" ? "decimal" : "numeric"} dir="ltr" value={d[k]} onChange={(e) => set({ ...d, [k]: e.target.value })} /></label>;
  const markets = (k: "only" | "avoid", label: string) => (
    <div key={k} className={`${lbl} sm:col-span-2`}>{label}
      <SymbolPicker multi inline lang={lang} mine={symbols} value={list(d[k])} onChange={(v) => set({ ...d, [k]: v.join(", ") })} label={label} placeholder={L(k === "only" ? OT.allMarkets : OT.noMarket)} />
    </div>
  );
  const importAdvisor = () => {
    const cur0 = fromDraft(d).rules;
    set(toDraft({ ...fromAdvisor(adopted as { rules: Partial<import("../lib/whatif").Rules> }[], cur0, size), goal: cur0.goal }));
    setDone(true);
  };
  return (
    <div className="flex flex-col gap-3">
      {adopted.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button type="button" onClick={importAdvisor} className="tone-indigo tone-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"><Download size={14} />{L(OT.importBtn)}</button>
          {done && <span className="text-xs text-muted" role="status">{L(OT.imported)}</span>}
        </div>
      )}
      <div className={box}>
        {head(L(OT.gLoss), L(OT.gLossD))}
        <div className="grid gap-3 sm:grid-cols-2">{limit("daily", L(OT.fDaily))}{limit("weekly", L(OT.fWeekly))}{limit("monthly", L(OT.fMonthly))}{limit("overall", L(OT.fOverall))}</div>
      </div>
      <div className={box}>
        {head(L(OT.gTrade))}
        <div className="grid gap-3 sm:grid-cols-2">
          {limit("perTrade", L(OT.fPerTrade))}{whole("lots", L(OT.fLots))}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-[var(--icon)]" checked={d.sl} onChange={(e) => set({ ...d, sl: e.target.checked })} />{L(OT.fSl)}</label>
        </div>
      </div>
      <div className={box}>
        {head(L(OT.gDisc))}
        <div className="grid gap-3 sm:grid-cols-2">{whole("maxTrades", L(OT.fMaxTrades))}{whole("streak", L(OT.fStreak))}{limit("lock", L(OT.fLock))}{whole("cool", L(OT.fCool))}</div>
      </div>
      <div className={box}>
        {head(L(OT.gTime))}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`${lbl} sm:col-span-2`}>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--icon)]" checked={d.hoursOn} onChange={(e) => set({ ...d, hoursOn: e.target.checked })} />{L(OT.fHours)}</label>
            {d.hoursOn && (
              <span className="flex items-center gap-2">
                <select className="field min-w-0 flex-1" dir="ltr" value={d.hFrom} onChange={(e) => set({ ...d, hFrom: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
                <span className="text-xs text-muted">{L(OT.fAnd)}</span>
                <select className="field min-w-0 flex-1" dir="ltr" value={d.hTo} onChange={(e) => set({ ...d, hTo: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
              </span>
            )}
          </div>
          <div className={`${lbl} sm:col-span-2`}>{L(OT.fDaysOff)}
            <span className="flex flex-wrap gap-1.5">
              {Array.from({ length: 7 }, (_, i) => { const on = d.daysOff.includes(i); return <button key={i} type="button" aria-pressed={on} onClick={() => set({ ...d, daysOff: on ? d.daysOff.filter((x) => x !== i) : [...d.daysOff, i] })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? "border-[var(--icon)] bg-primary-tint text-primary" : "border-border text-muted hover:text-text"}`}>{wdName(i, lang, "short")}</button>; })}
            </span>
          </div>
          {markets("only", L(OT.fOnly))}
          {markets("avoid", L(OT.fAvoid))}
          <label className={lbl}>{L(OT.fSide)}
            <select className="field" value={d.side} onChange={(e) => set({ ...d, side: e.target.value as OwnDraft["side"] })}>
              <option value="">{L(OT.sideBoth)}</option><option value="long">{L(OT.sideLong)}</option><option value="short">{L(OT.sideShort)}</option>
            </select>
          </label>
        </div>
      </div>
      <div className={box}>
        {head(L(OT.gGoal))}
        <div className="grid gap-3 sm:grid-cols-2">{limit("goal", L(OT.fGoal))}</div>
      </div>
      <div className={box}>
        {head(L(OT.gBreak))}
        <div role="radiogroup" aria-label={L(OT.gBreak)} className="grid gap-2 sm:grid-cols-3">
          {(["warn", "day", "end"] as const).map((k) => {
            const on = d.onBreak === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => set({ ...d, onBreak: k })} className={`rounded-xl border p-3 text-start transition-colors ${on ? "border-[var(--icon)] bg-primary-tint" : "border-border hover:border-[var(--icon)]"}`}>
                <span className="block text-sm font-semibold">{L(k === "warn" ? OT.bWarn : k === "day" ? OT.bDay : OT.bEnd)}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{L(k === "warn" ? OT.bWarnD : k === "day" ? OT.bDayD : OT.bEndD)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- the card ----------
const ROSE = "border-[#f87171]/50 bg-[#f87171]/10", AMBER = "border-[#f59e0b]/50 bg-[#f59e0b]/10", GREEN = "border-[#22c55e]/50 bg-[#22c55e]/10", PLAIN = "border-[var(--icon)] bg-primary-tint";
const addDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

export function OwnCard({ c, account, trades, lang, profileName, onEdit, onRemove, onChange, onRetry }: {
  c: Challenge; account: Account; trades: Trade[]; lang: Lang; profileName: string; onEdit: () => void; onRemove: () => void; onChange: (c: Challenge) => void; onRetry: (start: string) => void;
}) {
  const L = (x: L3) => x[lang];
  const tx = (v: string) => (lang === "ar" ? ltrNumbers(v) : v);
  const now = nowFor(account), today = now.slice(0, 10);
  const rules = rulesAt(c, now);
  const s = useMemo(() => ownState(c, c, trades, today, now), [c, trades, today, now]);
  const [ask, setAsk] = useState(false), [all, setAll] = useState(false);
  const [who, setWho] = useState(c.signed?.name || profileName || ""), [notify, setNotify] = useState(c.signed?.notify ?? true), [sig, setSig] = useState("");
  const cur = account.currency, m = (v: number, sign = false) => fmtMoney(v, { sign, currency: cur });
  const pending = c.start > today, ended = s.status === "failed";
  const room = (k: string) => s.rooms.find((x) => x.key === k);
  const keys = ruleKeys(rules);

  let banner: [string, string];
  if (pending) banner = [fill(L(OT.pendingStart), { d: dayLabel(c.start, lang) }), PLAIN];
  else if (ended && s.endedOn) { const v0 = s.violations[0]; banner = [fill(L(OT.endedOn), { d: dayLabel(s.endedOn, lang), r: NAME[v0.key][lang] }), ROSE]; }
  else if (s.today.stopped) banner = [L(OT.stoppedToday), ROSE];
  else if (room("daily")?.room === 0) banner = [L(OT.dailyHit), ROSE];
  else if (room("weekly")?.room === 0) banner = [L(OT.weeklyHit), ROSE];
  else if (room("monthly")?.room === 0) banner = [L(OT.monthlyHit), ROSE];
  else if (room("overall")?.room === 0) banner = [L(OT.overallHit), ROSE];
  else if (s.today.nextAt && s.today.nextAt > now) banner = [fill(L(OT.pauseUntil), { t: s.today.nextAt.slice(11, 16) }), AMBER];
  else if (s.today.lock != null && s.today.net >= s.today.lock - 1e-9) banner = [L(OT.lockHit), GREEN];
  else if (rules.maxTrades != null && s.today.n >= rules.maxTrades) banner = [fill(L(OT.tradesHit), { n: s.today.n, m: rules.maxTrades }), AMBER];
  else if (rules.streak && s.today.run >= rules.streak) banner = [fill(L(OT.streakHit), { k: nLosses(s.today.run, lang) }), AMBER];
  else banner = [L(OT.allGood), PLAIN];

  const next = c.ownNext && c.ownNext.from > now ? c.ownNext.from : null; // broker clock
  const when = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc(lang), o).format(d);
  const signedFor = c.signed && c.signed.rules === JSON.stringify(tidy(rules));
  const sign = () => onChange({ ...c, signed: { name: who.trim().slice(0, 60), at: new Date().toISOString(), notify, rules: JSON.stringify(tidy(rules)), sig } });
  const detail = (v: (typeof s.violations)[number]) => {
    const d = (en: string, a: string, fr: string) => ({ en, ar: a, fr })[lang];
    switch (v.key) {
      case "daily": case "weekly": case "monthly": case "overall": case "perTrade": return v.value != null && v.limit != null ? d(`lost ${m(v.value)}, limit ${m(v.limit)}`, `خسارة ${m(v.value)}، والحد ${m(v.limit)}`, `perte ${m(v.value)}, limite ${m(v.limit)}`) : "";
      case "lots": return d(`${v.value} lots, max ${v.limit}`, `${v.value} لوت، والحد ${v.limit}`, `${v.value} lots, max ${v.limit}`);
      case "maxTrades": return d(`trade ${v.value} of the day, max ${v.limit}`, `الصفقة ${v.value} في اليوم، والحد ${v.limit}`, `trade ${v.value} du jour, max ${v.limit}`);
      case "streak": return d(`after ${nLosses(v.value ?? 0, lang)}`, `بعد ${nLosses(v.value ?? 0, lang)}`, `après ${nLosses(v.value ?? 0, lang)}`);
      case "lock": return v.value != null && v.limit != null ? d(`up ${m(v.value)}, lock ${m(v.limit)}`, `ربح ${m(v.value)}، والقفل ${m(v.limit)}`, `gain ${m(v.value)}, verrou ${m(v.limit)}`) : "";
      case "cool": return d(`${nMin(v.value ?? 0, lang)} after a loss, wait ${nMin(v.limit ?? 0, lang)}`, `بعد ${nMin(v.value ?? 0, lang)} من الخسارة، والانتظار ${nMin(v.limit ?? 0, lang)}`, `${nMin(v.value ?? 0, lang)} après une perte, attente ${nMin(v.limit ?? 0, lang)}`);
      default: return "";
    }
  };
  const log = [...s.violations].reverse(), shown = all ? log : log.slice(0, 6);
  const scoreColor = s.score == null ? "var(--icon)" : s.score >= 80 ? "var(--profit)" : s.score >= 50 ? "#f59e0b" : "#f87171";
  const overall = amount(rules.overall, c.size), floor = overall != null ? c.size - overall : null;
  const chips: string[] = [
    ...(rules.maxTrades != null ? [fill(L(OT.cTrades), { n: s.today.n, m: rules.maxTrades })] : []),
    ...(rules.streak ? [fill(L(OT.cRun), { n: s.today.run, m: rules.streak })] : []),
    ...(s.today.lock != null ? [fill(L(OT.cLock), { v: m(s.today.net, true), l: m(s.today.lock) })] : []),
  ];

  return (
    <article className="ch-card rounded-2xl border border-border p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-icon"><SlidersHorizontal size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="font-heading text-base font-semibold">{account.name} · {c.name}</h3>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ended ? "border-[#f87171]/40 bg-[#f87171]/10 text-[#f87171]" : "border-border text-text"}`}>
              {ended ? <X size={13} /> : <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-[var(--icon)] opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--icon)]" /></span>}
              {L(ended ? OT.ended : OT.active)}
            </span>
            <span className="tone-violet tone-chip inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"><SlidersHorizontal size={12} />{tx(`${L(OT.kind)}${(c.attempt ?? 1) > 1 ? ` · ${fill(L(OT.attemptN), { n: c.attempt as number })}` : ""}`)}</span>
            {signedFor && <span className="tone-emerald tone-chip inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"><PenLine size={12} />{L(OT.signedBadge)}</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted">{tx(pending ? `${fill(L(OT.starts), { d: dayLabel(c.start, lang) })} · ${m(c.size)}` : `${fill(L(OT.started), { d: dayLabel(c.start, lang) })} · ${fill(L(OT.dayN), { n: Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.start}T00:00:00Z`)) / 864e5) + 1) })} · ${m(c.size)}`)}</p>
        </div>
        {!ask && (
          <div className="flex gap-1.5">
            <button type="button" onClick={onEdit} aria-label={L(OT.edit)} title={L(OT.edit)} className="icon-btn !h-8 !w-8 border border-border"><Pencil size={14} /></button>
            <button type="button" onClick={() => setAsk(true)} aria-label={L(OT.remove)} title={L(OT.remove)} className="icon-btn !h-8 !w-8 border border-border text-[#f87171]"><Trash2 size={14} /></button>
          </div>
        )}
      </div>
      {ask && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
          <span className="me-auto">{L(OT.confirmRemove)}</span>
          <button type="button" onClick={() => setAsk(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">{L(OT.cancel)}</button>
          <button type="button" onClick={onRemove} className="rounded-lg bg-loss px-3 py-1.5 text-xs font-semibold text-white">{L(OT.remove)}</button>
        </div>
      )}

      <p className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${banner[1]}`}>{tx(banner[0])}</p>
      {ended && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={() => onRetry((s.endedOn ?? "") >= today ? addDay(today) : today)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"><RotateCcw size={15} />{L(OT.retry)}</button>
          <span className="text-xs text-muted">{L((s.endedOn ?? "") >= today ? OT.retryTomorrow : OT.retryToday)}</span>
        </div>
      )}
      {next && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm">
          <span className="me-auto text-muted">{tx(fill(L(OT.pending), { d: dayLabel(next.slice(0, 10), lang), t: next.slice(11, 16) }))}</span>
          <button type="button" onClick={() => onChange({ ...c, ownNext: undefined })} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-primary-tint">{L(OT.keep)}</button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted">{L(OT.score)}</p>
          <p className="mt-1 text-lg font-semibold tnum" dir="ltr"><span style={{ color: scoreColor }}>{s.score ?? "—"}</span> <span className="text-sm font-medium text-muted">/ 100</span></p>
          <Bar value={(s.score ?? 0) / 100} color={scoreColor} />
          <p className="mt-1.5 text-xs text-muted">{tx(fill(L(OT.scoreSub), { c: s.cleanDays, n: s.activeDays }))}</p>
          <p className="text-xs text-muted">{tx(fill(L(OT.inRow), { n: s.streak, b: s.best }))}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted">{L(OT.cost)}</p>
          {s.cost.broke.n + s.cost.kept.n === 0 ? <p className="mt-1 text-sm text-muted">{L(OT.costNone)}</p> : (
            <div className="mt-1.5 space-y-1.5 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="text-muted">{tx(fill(L(OT.costBroke), { n: nTrades(s.cost.broke.n, lang) }))}</span><span dir="ltr" className={`font-semibold tnum ${s.cost.broke.net < 0 ? "text-[#f87171]" : s.cost.broke.net > 0 ? "text-[#22c55e]" : ""}`}>{m(s.cost.broke.net, true)}</span></p>
              <p className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="text-muted">{tx(fill(L(OT.costKept), { n: nTrades(s.cost.kept.n, lang) }))}</span><span dir="ltr" className={`font-semibold tnum ${s.cost.kept.net < 0 ? "text-[#f87171]" : s.cost.kept.net > 0 ? "text-[#22c55e]" : ""}`}>{m(s.cost.kept.net, true)}</span></p>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border p-4">
          {s.goal ? (
            <>
              <p className="text-xs font-medium text-muted">{L(OT.goal)}</p>
              <p className={`mt-1 text-lg font-semibold tnum ${s.pnl >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}`} dir="ltr">{m(s.pnl, true)} <span className="text-sm font-medium text-muted">/ {m(s.goal.amount)}</span></p>
              <Bar value={s.goal.progress} color="var(--profit)" />
              <p className="mt-1.5 text-xs text-muted">{s.goal.reached ? L(OT.reached) : tx(fill(L(OT.toGo), { p: Math.round(s.goal.progress * 100), m: m(s.goal.left) }))}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted">{L(OT.today)}</p>
              <p className={`mt-1 text-lg font-semibold tnum ${s.today.net > 0 ? "text-[#22c55e]" : s.today.net < 0 ? "text-[#f87171]" : ""}`} dir="ltr">{m(s.today.net, true)}</p>
              <p className="mt-1.5 text-xs text-muted">{tx(nTrades(s.today.n, lang))}</p>
            </>
          )}
        </div>
      </div>

      {s.rooms.length > 0 && (
        <div className={`mt-3 grid gap-3 ${s.rooms.length > 1 ? "sm:grid-cols-2" : ""} ${s.rooms.length > 2 ? "lg:grid-cols-4" : ""}`}>
          {s.rooms.map((x) => (
            <div key={x.key} className="rounded-xl border border-border p-4">
              <p className="text-xs font-medium text-muted">{L(x.key === "daily" ? OT.roomDaily : x.key === "weekly" ? OT.roomWeekly : x.key === "monthly" ? OT.roomMonthly : OT.roomOverall)}</p>
              <p className={`mt-1 text-lg font-semibold tnum ${x.net > 0 ? "text-[#22c55e]" : x.net < 0 ? "text-[#f87171]" : ""}`} dir="ltr">{m(x.net, true)}</p>
              <Bar value={x.used} color={dangerColor(x.used)} />
              <p className="mt-1.5 text-xs text-muted">{tx(fill(L(OT.used), { u: m(x.used * x.limit), l: m(x.limit), r: m(x.room) }))}</p>
            </div>
          ))}
        </div>
      )}
      {chips.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{chips.map((t) => <span key={t} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{tx(t)}</span>)}</div>}

      <BalanceChart size={c.size} goal={s.goal ? c.size + s.goal.amount : null} floor={floor} start={c.start} rows={s.days.map((d) => ({ ...d, floor }))} money={(v) => m(v)} lang={lang} label={L(OT.balance)} />

      <div className="mt-4">
        <p className="text-sm font-semibold">{L(OT.log)}{log.length > 0 && <span className="ms-2 rounded-full border border-[#f87171]/40 bg-[#f87171]/10 px-2 py-0.5 text-[11px] font-bold text-[#f87171] tnum">{log.length}</span>}</p>
        {log.length === 0 ? <p className="mt-1.5 text-sm text-muted">{L(OT.logNone)}</p> : (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {shown.map((v, i) => {
              const dt = detail(v);
              return (
                <li key={`${v.at}-${v.key}-${i}`} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="flex shrink-0 items-baseline gap-2 text-xs">
                    <span className="text-muted tnum">{tx(`${dayLabel(v.day, lang)} · ${v.at.slice(11, 16)}`)}</span>
                    {v.symbol && <span className="font-semibold" dir="ltr">{v.symbol}</span>}
                  </span>
                  <span className="min-w-0 sm:flex-1">{NAME[v.key][lang]}{dt && <span className="text-muted">{tx(` · ${dt}`)}</span>}</span>
                </li>
              );
            })}
          </ul>
        )}
        {log.length > 6 && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-semibold text-icon hover:underline">{all ? L(OT.showLess) : tx(fill(L(OT.showAll), { n: log.length }))}</button>}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-bg p-4">
        <p className="flex items-center gap-2 font-heading text-sm font-semibold"><ScrollText size={16} className="text-icon" />{L(OT.contract)}</p>
        <p className="mt-2 text-sm">{fill(L(OT.lead), { n: (c.signed?.name || who || L(OT.me)).trim() })}</p>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">{keys.map((k) => <li key={k}>{tx(ruleLine(k, rules, c.size, cur, lang))}</li>)}</ul>
        <p className="mt-2 text-sm text-muted">{L(rules.onBreak === "warn" ? OT.onWarn : rules.onBreak === "day" ? OT.onDay : OT.onEnd)}</p>
        {signedFor && c.signed ? (
          <div className="mt-3 border-t border-dashed border-border pt-3">
            {c.signed.sig ? <Signature d={c.signed.sig} className="h-16 w-48 sm:h-20 sm:w-60" /> : <p className="font-heading text-lg italic text-primary">{c.signed.name}</p>}
            <p className="text-xs text-muted">{tx(fill(L(OT.signedOn), { n: c.signed.name, d: when(new Date(c.signed.at), { day: "numeric", month: "long", year: "numeric" }) }))}{c.signed.notify ? ` · ${L(OT.notifyOn)}` : ""}</p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-border pt-3">
            {c.signed && <p className="text-xs font-semibold text-[#f59e0b]">{L(OT.changed)}</p>}
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">{L(OT.signName)}<input className="field" value={who} maxLength={60} onChange={(e) => setWho(e.target.value)} /></label>
            <div className="flex flex-col gap-1.5 text-xs font-medium text-muted">{L(OT.sigLabel)}<SignaturePad onChange={setSig} label={L(OT.sigLabel)} hint={L(OT.sigHint)} clearLabel={L(OT.sigClear)} /></div>
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-[var(--icon)]" checked={notify} onChange={(e) => setNotify(e.target.checked)} />{L(OT.notify)}</label>
            <button type="button" disabled={!who.trim() || !sig || !keys.length} onClick={sign} className="inline-flex items-center gap-1.5 self-start rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"><PenLine size={15} />{L(c.signed ? OT.signAgain : OT.sign)}</button>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">{L(OT.note)}</p>
    </article>
  );
}
