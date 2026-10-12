// Plain-language explanations shown in the event drawer (general knowledge, not live data).
import type { Kind } from "./calendar";
import type { Lang } from "../types";

export const INFO: Record<Kind, Record<Lang, { what: string; why: string }>> = {
  rate: {
    en: { what: "Central-bank interest-rate decision.", why: "The policy rate sets the cost of money. A rate above expectations (or a hawkish tone) usually supports the currency; a cut or dovish tone tends to weigh on it." },
    ar: { what: "قرار سعر الفائدة من البنك المركزي.", why: "سعر الفائدة يحدد تكلفة المال. فائدة أعلى من التوقعات (أو نبرة متشددة) تدعم العملة عادة، وخفضها أو نبرة متساهلة يضغط عليها." },
    fr: { what: "Décision de taux directeur de la banque centrale.", why: "Le taux directeur fixe le coût de l'argent. Un taux supérieur aux attentes (ou un ton restrictif) soutient généralement la devise ; une baisse ou un ton accommodant la pèse." },
  },
  inflation: {
    en: { what: "Measures how fast prices are changing.", why: "Inflation above consensus raises the odds of higher rates, which usually supports the currency; below consensus has the opposite effect." },
    ar: { what: "يقيس سرعة تغير الأسعار.", why: "تضخم أعلى من التوقعات يرفع احتمال زيادة الفائدة فيدعم العملة عادة، وأقل من التوقعات يعطي العكس." },
    fr: { what: "Mesure la vitesse de variation des prix.", why: "Une inflation supérieure au consensus augmente les chances de hausse des taux et soutient souvent la devise ; inférieure, l'effet inverse." },
  },
  jobs: {
    en: { what: "Labour-market data: jobs created, unemployment or wages.", why: "Stronger jobs data signals a healthy economy and firmer rates, usually supporting the currency; weak data does the opposite." },
    ar: { what: "بيانات سوق العمل: الوظائف أو البطالة أو الأجور.", why: "بيانات توظيف أقوى تعني اقتصادًا سليمًا وفائدة أكثر صلابة فتدعم العملة عادة، والضعيفة تعطي العكس." },
    fr: { what: "Données du marché du travail : emplois, chômage ou salaires.", why: "Des chiffres d'emploi solides signalent une économie saine et des taux plus fermes, favorables à la devise ; des chiffres faibles, l'inverse." },
  },
  gdp: {
    en: { what: "Total output of the economy.", why: "Growth above expectations supports the currency; a contraction or miss weighs on it." },
    ar: { what: "إجمالي إنتاج الاقتصاد.", why: "نمو أعلى من التوقعات يدعم العملة، والانكماش أو التراجع عن التوقعات يضغط عليها." },
    fr: { what: "Production totale de l'économie.", why: "Une croissance supérieure aux attentes soutient la devise ; une contraction ou un manque la pèse." },
  },
  pmi: {
    en: { what: "Survey/activity gauge of manufacturing, services or industry (above 50 = expansion).", why: "A reading above consensus signals stronger activity and usually lifts the currency." },
    ar: { what: "مؤشر نشاط للتصنيع أو الخدمات أو الصناعة (فوق 50 = توسع).", why: "قراءة أعلى من التوقعات تعني نشاطًا أقوى وترفع العملة عادة." },
    fr: { what: "Indicateur d'activité (industrie, services) ; au-dessus de 50 = expansion.", why: "Une lecture supérieure au consensus signale plus d'activité et soutient souvent la devise." },
  },
  retail: {
    en: { what: "Consumer spending at retailers.", why: "Strong spending suggests growth and supports the currency; weak spending weighs on it." },
    ar: { what: "إنفاق المستهلكين لدى تجار التجزئة.", why: "إنفاق قوي يوحي بنمو ويدعم العملة، والضعيف يضغط عليها." },
    fr: { what: "Dépenses des consommateurs chez les détaillants.", why: "Des dépenses fortes suggèrent de la croissance et soutiennent la devise ; faibles, elles la pèsent." },
  },
  speech: {
    en: { what: "A central-bank or government official speaks.", why: "Tone matters: hints about rates or policy can move the currency sharply, even without new data." },
    ar: { what: "يتحدث مسؤول في البنك المركزي أو الحكومة.", why: "النبرة مهمة: تلميحات حول الفائدة أو السياسة قد تحرك العملة بقوة حتى دون بيانات جديدة." },
    fr: { what: "Intervention d'un responsable de banque centrale ou du gouvernement.", why: "Le ton compte : des indices sur les taux ou la politique peuvent faire bouger la devise, même sans nouvelle donnée." },
  },
  trade: {
    en: { what: "Difference between exports and imports (or the current account).", why: "A bigger surplus than expected tends to support the currency; a wider deficit weighs on it." },
    ar: { what: "الفرق بين الصادرات والواردات (أو الحساب الجاري).", why: "فائض أكبر من المتوقع يدعم العملة عادة، وعجز أوسع يضغط عليها." },
    fr: { what: "Écart entre exportations et importations (ou compte courant).", why: "Un excédent supérieur aux attentes soutient la devise ; un déficit plus large la pèse." },
  },
  confidence: {
    en: { what: "Survey of business or consumer sentiment.", why: "Higher confidence than expected points to stronger spending and supports the currency." },
    ar: { what: "استطلاع لثقة الأعمال أو المستهلكين.", why: "ثقة أعلى من المتوقع تعني إنفاقًا أقوى وتدعم العملة." },
    fr: { what: "Enquête sur la confiance des entreprises ou des consommateurs.", why: "Une confiance supérieure aux attentes annonce plus de dépenses et soutient la devise." },
  },
  holiday: {
    en: { what: "Public or bank holiday: markets may be closed or thin.", why: "Low liquidity can cause erratic price moves; no economic data is released." },
    ar: { what: "عطلة رسمية أو مصرفية: قد تُغلق الأسواق أو تقل السيولة.", why: "ضعف السيولة قد يسبب تحركات غير منتظمة، ولا تصدر بيانات اقتصادية." },
    fr: { what: "Jour férié ou bancaire : marchés fermés ou peu liquides.", why: "Une faible liquidité peut provoquer des mouvements erratiques ; aucune donnée publiée." },
  },
  other: {
    en: { what: "Scheduled economic release.", why: "Compare the result with the consensus: a clear beat or miss can move the currency." },
    ar: { what: "إصدار اقتصادي مجدول.", why: "قارن النتيجة بالتوقعات: تجاوز أو تراجع واضح قد يحرك العملة." },
    fr: { what: "Publication économique programmée.", why: "Comparez le résultat au consensus : un écart net peut faire bouger la devise." },
  },
};
