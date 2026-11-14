// GLORIA_RPG map: the visual identity of the seven zones and how a zone's map state is derived from quest progress.
//
// Map art is keyed by gloria_zones.order_index (1..7), not by zone id, so the map keeps working if the DB seed is
// renamed or reseeded. The display names below are the map's design names; the DB zone row still supplies the boss
// name, reward and (through its challenges) all progress. A missing DB row (migration not applied, offline) still
// renders its zone, as locked, so the world is never blank.
import type { GloriaChallenge, GloriaQuestProgress, GloriaQuestStatus, GloriaZone } from "../../types/gloria";
import type { Lang } from "../../types";

export type ZoneTheme = "oasis" | "forest" | "mountain" | "sea" | "castle" | "volcano" | "throne";
export type ZoneMapState = "locked" | "active" | "completed";

export interface ZoneVisual {
  order: number;
  theme: ZoneTheme;
  name: Record<Lang, string>;
  blurb: Record<Lang, string>;
  /** Where the zone's medallion sits on the 1200x800 map, and where the journey path passes through. */
  node: { x: number; y: number };
  /** Main colour + accent, from the design palette. */
  color: string;
  accent: string;
}

export const ZONE_VISUALS: ZoneVisual[] = [
  {
    order: 1, theme: "oasis", node: { x: 240, y: 675 }, color: "#4ade80", accent: "#38bdf8",
    name: { en: "Oasis of Beginning", ar: "واحة البداية", fr: "Oasis du Commencement" },
    blurb: {
      en: "Every legend starts by the water. Build the habits that keep a trader alive.",
      ar: "كل أسطورة تبدأ عند الماء. ابنِ العادات التي تُبقي المتداول على قيد الحياة.",
      fr: "Toute légende commence près de l'eau. Forgez les habitudes qui gardent un trader en vie.",
    },
  },
  {
    order: 2, theme: "forest", node: { x: 545, y: 655 }, color: "#15803d", accent: "#166534",
    name: { en: "Forest of Discipline", ar: "غابة الانضباط", fr: "Forêt de la Discipline" },
    blurb: {
      en: "The trees grow close and the path is easy to lose. Only the plan leads out.",
      ar: "الأشجار متلاصقة والطريق سهل الضياع. وحدها الخطة تقودك إلى الخارج.",
      fr: "Les arbres sont serrés et le chemin se perd vite. Seul le plan mène à la sortie.",
    },
  },
  {
    order: 3, theme: "mountain", node: { x: 905, y: 640 }, color: "#78716c", accent: "#f5f5f4",
    name: { en: "Analysis Mountain", ar: "جبل التحليل", fr: "Montagne de l'Analyse" },
    blurb: {
      en: "From the summit every chart looks clearer. The climb is paid for in data.",
      ar: "من القمة يبدو كل رسم بياني أوضح. ثمن الصعود يُدفع بالبيانات.",
      fr: "Du sommet, chaque graphique est plus clair. L'ascension se paie en données.",
    },
  },
  {
    order: 4, theme: "sea", node: { x: 975, y: 360 }, color: "#0ea5e9", accent: "#06b6d4",
    name: { en: "Risk Sea", ar: "بحر المخاطر", fr: "Mer des Risques" },
    blurb: {
      en: "Calm water hides deep currents. Size every voyage so one storm can't sink you.",
      ar: "المياه الهادئة تخفي تيارات عميقة. اضبط حجم كل رحلة كي لا تُغرقك عاصفة واحدة.",
      fr: "L'eau calme cache des courants profonds. Dimensionnez chaque voyage pour survivre à la tempête.",
    },
  },
  {
    order: 5, theme: "castle", node: { x: 615, y: 470 }, color: "#a8a29e", accent: "#eab308",
    name: { en: "Strategy Castle", ar: "قلعة الاستراتيجية", fr: "Château de la Stratégie" },
    blurb: {
      en: "Walls are built one stone at a time. Here an edge becomes a system.",
      ar: "الأسوار تُبنى حجراً بعد حجر. هنا تتحول الميزة إلى نظام.",
      fr: "Les murs se bâtissent pierre après pierre. Ici, un avantage devient un système.",
    },
  },
  {
    order: 6, theme: "volcano", node: { x: 290, y: 445 }, color: "#ef4444", accent: "#f97316",
    name: { en: "Mastery Volcano", ar: "بركان الإتقان", fr: "Volcan de la Maîtrise" },
    blurb: {
      en: "Greed burns hotter than lava. Keep your head where the ground itself is on fire.",
      ar: "الطمع يحرق أكثر من الحمم. حافظ على هدوئك حيث تشتعل الأرض نفسها.",
      fr: "L'avidité brûle plus que la lave. Gardez la tête froide là où le sol lui-même brûle.",
    },
  },
  {
    order: 7, theme: "throne", node: { x: 620, y: 200 }, color: "#eab308", accent: "#fef08a",
    name: { en: "Throne of Mizan", ar: "عرش الميزان", fr: "Trône de Mizan" },
    blurb: {
      en: "Edge, risk and emotion in perfect balance. Few have ever sat here.",
      ar: "الميزة والمخاطرة والعاطفة في توازن تام. قلة فقط جلسوا هنا.",
      fr: "Avantage, risque et émotion en équilibre parfait. Rares sont ceux qui s'y sont assis.",
    },
  },
];

export interface MapZone {
  visual: ZoneVisual;
  zone: GloriaZone | null;
  state: ZoneMapState;
  challenges: { challenge: GloriaChallenge; progress: GloriaQuestProgress | null; status: GloriaQuestStatus }[];
  done: number;
  total: number;
  /** Every regular challenge is done and the boss is waiting to be fought. */
  bossReady: boolean;
  bossDefeated: boolean;
}

/** Joins the seven visuals with the DB zones, challenges and the player's quest progress. */
export function buildMapZones(zones: GloriaZone[], challenges: GloriaChallenge[], progress: GloriaQuestProgress[]): MapZone[] {
  const byOrder = new Map(zones.map((z) => [z.orderIndex, z]));
  const progressOf = new Map(progress.map((p) => [p.challengeId, p]));

  return ZONE_VISUALS.map((visual) => {
    const zone = byOrder.get(visual.order) ?? null;
    const list = zone
      ? challenges
          .filter((c) => c.zoneId === zone.id)
          // Regular challenges first (in their seeded id order), the boss last.
          .sort((a, b) => Number(a.isBossChallenge) - Number(b.isBossChallenge) || a.id.localeCompare(b.id, undefined, { numeric: true }))
          .map((challenge) => {
            const p = progressOf.get(challenge.id) ?? null;
            return { challenge, progress: p, status: (p?.status ?? "locked") as GloriaQuestStatus };
          })
      : [];

    const total = list.length;
    const done = list.filter((c) => c.status === "completed").length;
    const boss = list.find((c) => c.challenge.isBossChallenge);
    const regular = list.filter((c) => !c.challenge.isBossChallenge);
    const regularDone = regular.length > 0 && regular.every((c) => c.status === "completed");
    const bossDefeated = boss?.status === "completed";
    const cleared = total > 0 && (boss ? bossDefeated : regularDone);
    const opened = list.some((c) => c.status !== "locked");

    let state: ZoneMapState = cleared ? "completed" : opened ? "active" : "locked";
    // Zone 1 is "Available from the start" by design (see gloria_zones.unlock_condition) -- it can never
    // genuinely be locked. A "locked" result for it only ever means we don't have enough joined data yet (the
    // zones/challenges reference tables haven't loaded, a fetch hiccuped, or quest rows haven't been seeded for
    // this user yet), never that it is actually gated. Covers the old, narrower "no progress rows at all yet"
    // case too, plus the case where progress loaded fine but the zones/challenges reference arrays didn't.
    if (visual.order === 1 && state === "locked") state = "active";

    return { visual, zone, state, challenges: list, done, total, bossReady: regularDone && !!boss && !bossDefeated, bossDefeated };
  });
}

/** Challenge copy names its zone by the DB seed's name; swap that for the map's name so the panel reads consistently. */
export function challengeText(text: string, zone: GloriaZone | null, visual: ZoneVisual, lang: Lang): string {
  if (!zone) return text;
  const from = lang === "ar" ? zone.nameAr : zone.name;
  return from ? text.split(from).join(visual.name[lang]) : text;
}
