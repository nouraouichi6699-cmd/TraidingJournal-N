import type { Lang, Theme } from "./types";

export const languages: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "fr", label: "Français" },
];

export const themeNames: Record<Theme, Record<Lang, string>> = {
  dark: { en: "Navy", ar: "كحلي", fr: "Marine" },
  light: { en: "Ivory", ar: "عاجي", fr: "Ivoire" },
  cream: { en: "Sand", ar: "رملي", fr: "Sable" },
};

type Dict = Record<string, Record<Lang, string>>;

const dict = {
  dashboard: { en: "Dashboard", ar: "الرئيسية", fr: "Tableau" },
  journal: { en: "Journal", ar: "اليوميات", fr: "Journal" },
  accounts: { en: "Accounts", ar: "الحسابات", fr: "Comptes" },
  charts: { en: "Charts", ar: "الرسوم", fr: "Graphiques" },
  reports: { en: "Reports", ar: "التقارير", fr: "Rapports" },
  connect: { en: "Connect an account", ar: "ربط حساب", fr: "Connecter un compte" },
  feedback: { en: "Share feedback", ar: "شارك رأيك", fr: "Donner un avis" },
  greeting: { en: "Good to see you,", ar: "سعيد برؤيتك،", fr: "Content de vous voir," },
  metrics: { en: "Metrics", ar: "المؤشرات", fr: "Indicateurs" },
  calendar: { en: "Calendar", ar: "التقويم", fr: "Calendrier" },
  news: { en: "News", ar: "الأخبار", fr: "Actualités" },
  boards: { en: "My boards", ar: "لوحاتي", fr: "Mes tableaux" },
  addBoard: { en: "Add board", ar: "إضافة لوحة", fr: "Ajouter un tableau" },
  editBoards: { en: "Edit boards", ar: "تعديل اللوحات", fr: "Modifier les tableaux" },
  editTemplate: { en: "Edit template", ar: "تعديل القالب", fr: "Modifier le modèle" },
  settings: { en: "Settings", ar: "الإعدادات", fr: "Paramètres" },
  market: { en: "Closed · 1d 23h", ar: "مغلق · 1ي 23س", fr: "Fermé · 1j 23h" },
  language: { en: "Language", ar: "اللغة", fr: "Langue" },
  theme: { en: "Theme", ar: "المظهر", fr: "Thème" },
  notifications: { en: "Notifications", ar: "الإشعارات", fr: "Notifications" },
  fullscreen: { en: "Full screen", ar: "ملء الشاشة", fr: "Plein écran" },
  profile: { en: "Profile", ar: "الحساب الشخصي", fr: "Profil" },
  mainNav: { en: "Main navigation", ar: "القائمة الرئيسية", fr: "Navigation principale" },
} satisfies Dict;

export type Key = keyof typeof dict;

export const makeT = (lang: Lang) => (k: Key) => dict[k][lang];
