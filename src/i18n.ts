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
  accountsTitle: { en: "Connected accounts", ar: "الحسابات المربوطة", fr: "Comptes connectés" },
  noAccounts: { en: "No accounts connected yet", ar: "لا توجد حسابات مربوطة بعد", fr: "Aucun compte connecté" },
  noAccountsHint: { en: "Connect your first account to start.", ar: "اربط حسابك الأول للبدء.", fr: "Connectez votre premier compte pour commencer." },
  choosePlatform: { en: "Choose a platform", ar: "اختر المنصة", fr: "Choisissez une plateforme" },
  tvName: { en: "TradingView Paper Trading", ar: "TradingView (تداول تجريبي)", fr: "TradingView Paper Trading" },
  tvDesc: { en: "Practice account on TradingView", ar: "حساب تجريبي على TradingView", fr: "Compte d'entraînement TradingView" },
  mt5Name: { en: "MetaTrader 5", ar: "MetaTrader 5", fr: "MetaTrader 5" },
  mt5Desc: { en: "Your MT5 trading account", ar: "حساب التداول على MT5", fr: "Votre compte de trading MT5" },
  accountName: { en: "Account name", ar: "اسم الحساب", fr: "Nom du compte" },
  currency: { en: "Currency", ar: "العملة", fr: "Devise" },
  startBalance: { en: "Starting balance", ar: "الرصيد الابتدائي", fr: "Solde initial" },
  mt5Login: { en: "Account number (optional)", ar: "رقم الحساب (اختياري)", fr: "Numéro de compte (optionnel)" },
  mt5Server: { en: "Server (optional)", ar: "الخادم (اختياري)", fr: "Serveur (optionnel)" },
  noPassword: { en: "Never enter your broker password here.", ar: "لا تُدخل كلمة مرور الوسيط هنا أبدًا.", fr: "Ne saisissez jamais le mot de passe de votre courtier ici." },
  cancel: { en: "Cancel", ar: "إلغاء", fr: "Annuler" },
  back: { en: "Back", ar: "رجوع", fr: "Retour" },
  connectBtn: { en: "Connect account", ar: "ربط الحساب", fr: "Connecter le compte" },
  awaiting: { en: "Waiting for trades", ar: "بانتظار الصفقات", fr: "En attente de trades" },
  remove: { en: "Remove account", ar: "حذف الحساب", fr: "Supprimer le compte" },
  close: { en: "Close", ar: "إغلاق", fr: "Fermer" },
  required: { en: "Required", ar: "مطلوب", fr: "Requis" },
  invalidNumber: { en: "Enter a valid number", ar: "أدخل رقمًا صحيحًا", fr: "Saisissez un nombre valide" },
} satisfies Dict;

export type Key = keyof typeof dict;

export const makeT = (lang: Lang) => (k: Key) => dict[k][lang];
