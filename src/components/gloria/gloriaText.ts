// GLORIA_RPG UI strings (en / ar / fr). Kept beside the feature rather than in the app-wide dictionary.
import type { Lang } from "../../types";
import type { GloriaCharacterLevel, GloriaQuestStatus, GloriaRank, GloriaStatFocus } from "../../types/gloria";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";
import type { ZoneMapState } from "./gloriaZones";

type L = Record<Lang, string>;

const S = {
  title: { en: "World of Gloria", ar: "عالم غلوريا", fr: "Monde de Gloria" },
  xp: { en: "XP", ar: "XP", fr: "XP" },
  maxRank: { en: "Max rank reached", ar: "أعلى رتبة", fr: "Rang maximal" },
  nextRank: { en: "to", ar: "حتى", fr: "vers" },
  elfMeter: { en: "Elf Meter", ar: "مقياس الإلف", fr: "Jauge Elfe" },
  radar: { en: "Trader stats this month", ar: "إحصاءات المتداول هذا الشهر", fr: "Stats du trader ce mois-ci" },
  noHero: { en: "Unawakened", ar: "لم يستيقظ بعد", fr: "Non éveillé" },
  noHeroHint: { en: "Close a trade this month to awaken your hero", ar: "أغلق صفقة هذا الشهر لإيقاظ بطلك", fr: "Clôturez un trade ce mois-ci pour éveiller votre héros" },
  checkNow: { en: "Check quests", ar: "تحقق من المهام", fr: "Vérifier les quêtes" },
  checking: { en: "Checking…", ar: "جارٍ التحقق…", fr: "Vérification…" },
  loading: { en: "Unrolling the map…", ar: "جارٍ فتح الخريطة…", fr: "Déroulement de la carte…" },
  error: { en: "The realm could not be reached", ar: "تعذر الوصول إلى العالم", fr: "Le royaume est injoignable" },
  quests: { en: "quests", ar: "مهام", fr: "quêtes" },
  enter: { en: "Click to enter", ar: "انقر للدخول", fr: "Cliquez pour entrer" },
  explore: { en: "Click to scout", ar: "انقر للاستطلاع", fr: "Cliquez pour explorer" },
  bossAwaits: { en: "Boss awaits!", ar: "الزعيم بانتظارك!", fr: "Le boss attend !" },
  close: { en: "Close", ar: "إغلاق", fr: "Fermer" },
  challenges: { en: "Challenges", ar: "التحديات", fr: "Défis" },
  boss: { en: "Zone boss", ar: "زعيم المنطقة", fr: "Boss de zone" },
  bossLocked: { en: "Clear every challenge above to face the boss", ar: "أنجز كل التحديات أعلاه لمواجهة الزعيم", fr: "Terminez tous les défis ci-dessus pour affronter le boss" },
  bossDefeated: { en: "Defeated", ar: "هُزم", fr: "Vaincu" },
  reward: { en: "Reward", ar: "المكافأة", fr: "Récompense" },
  unlock: { en: "Unlocks when", ar: "يُفتح عند", fr: "Se débloque quand" },
  noChallenges: { en: "This land is still uncharted. Its quests have not been written yet.", ar: "هذه الأرض لم تُرسم بعد. لم تُكتب مهامها حتى الآن.", fr: "Cette terre est encore inexplorée. Ses quêtes ne sont pas encore écrites." },
  lockedZone: { en: "Shrouded in fog. To reveal it, conquer", ar: "يغطيها الضباب. لكشفها، افتح", fr: "Plongée dans la brume. Pour la révéler, conquérez" },
  conquered: { en: "Conquered!", ar: "تم الفتح!", fr: "Conquise !" },
} satisfies Record<string, L>;

export type TextKey = keyof typeof S;
export const gt = (lang: Lang) => (k: TextKey) => S[k][lang];

export const ZONE_STATE_TEXT: Record<ZoneMapState, L> = {
  locked: { en: "Locked", ar: "مقفلة", fr: "Verrouillée" },
  active: { en: "In progress", ar: "قيد التقدم", fr: "En cours" },
  completed: { en: "Conquered", ar: "مفتوحة", fr: "Conquise" },
};

export const QUEST_STATUS_TEXT: Record<GloriaQuestStatus, L> = {
  locked: { en: "Locked", ar: "مقفل", fr: "Verrouillé" },
  active: { en: "Active", ar: "نشط", fr: "Actif" },
  completed: { en: "Completed", ar: "مكتمل", fr: "Terminé" },
  failed: { en: "Failed", ar: "فشل", fr: "Échoué" },
};

export const RANK_TEXT: Record<GloriaRank, L> = {
  beginner: { en: "Beginner", ar: "مبتدئ", fr: "Débutant" },
  intermediate: { en: "Intermediate", ar: "متوسط", fr: "Intermédiaire" },
  advanced: { en: "Advanced", ar: "متقدم", fr: "Avancé" },
  expert: { en: "Expert", ar: "خبير", fr: "Expert" },
  master: { en: "Master", ar: "سيّد", fr: "Maître" },
  legend: { en: "Legend", ar: "أسطورة", fr: "Légende" },
};

export const LEVEL_TEXT: Record<GloriaCharacterLevel, L> = {
  negative: { en: "Fallen", ar: "ساقط", fr: "Déchu" },
  neutral: { en: "Neutral", ar: "محايد", fr: "Neutre" },
  positive: { en: "Hero", ar: "بطل", fr: "Héros" },
  legendary: { en: "Legendary", ar: "أسطوري", fr: "Légendaire" },
};

export const STAT_TEXT: Record<GloriaStatFocus, L> = {
  precision: { en: "Precision", ar: "الدقة", fr: "Précision" },
  speed: { en: "Speed", ar: "السرعة", fr: "Vitesse" },
  defense: { en: "Defense", ar: "الدفاع", fr: "Défense" },
  wisdom: { en: "Wisdom", ar: "الحكمة", fr: "Sagesse" },
  recovery: { en: "Recovery", ar: "التعافي", fr: "Récupération" },
  intelligence: { en: "Intelligence", ar: "الذكاء", fr: "Intelligence" },
  power: { en: "Power", ar: "القوة", fr: "Puissance" },
};

/** Mirrors the reseeded gloria_characters roster (supabase/migrations/20261114_gloria_characters_reseed.sql). */
export const CHARACTER_INFO: Record<GloriaCharacterId, { name: L; level: GloriaCharacterLevel }> = {
  savage: { name: { en: "Savage", ar: "الهمجي", fr: "Sauvage" }, level: "negative" },
  rogue: { name: { en: "Rogue", ar: "المحتال", fr: "Vagabond" }, level: "neutral" },
  warrior: { name: { en: "Warrior", ar: "المحارب", fr: "Guerrier" }, level: "positive" },
  sniper: { name: { en: "Sniper", ar: "القناص", fr: "Tireur d'élite" }, level: "positive" },
  tank: { name: { en: "Tank", ar: "الحارس الفولاذي", fr: "Tank" }, level: "positive" },
  healer: { name: { en: "Healer", ar: "المعالج", fr: "Soigneur" }, level: "positive" },
  mage: { name: { en: "Mage", ar: "الساحر", fr: "Mage" }, level: "positive" },
  assassin: { name: { en: "Assassin", ar: "القاتل الصامت", fr: "Assassin" }, level: "positive" },
  elf: { name: { en: "Elf", ar: "الإلف", fr: "Elfe" }, level: "legendary" },
};
