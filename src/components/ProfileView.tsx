// Profile: who you are (photo, name, country, time zone), Telegram alerts, partner and coach, then the account. Each
// section has its own colour and a place in the bar at the top; the personal details are saved together from the bar
// that appears at the bottom when something changed.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Clock, KeyRound, LogOut, Mail, MapPin, Send, Trash2, TriangleAlert, User, UserRound, Users, type LucideIcon } from "lucide-react";
import Private from "./Private";
import TelegramCard from "./TelegramCard";
import { SectionHead, type Tone } from "./profileUi";
import type { Key } from "../i18n";
import type { Lang } from "../types";
import { supabase } from "../lib/supabase";
import type { Profile } from "../useProfile";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  email: string;
  profile: Profile;
  onSave: (p: Profile) => void;
  onDeleteAll: () => void;
}

type L3 = Record<Lang, string>;
const T = {
  nav: { en: "Profile sections", ar: "أقسام الحساب الشخصي", fr: "Sections du profil" },
  details: { en: "Personal details", ar: "البيانات الشخصية", fr: "Informations personnelles" },
  detailsSub: { en: "Your name shows in the app and in the messages your partner and coach get.", ar: "يظهر اسمك في التطبيق وفي الرسائل التي تصل شريكك ومدرّبك.", fr: "Votre nom apparaît dans l'app et dans les messages de votre partenaire et de votre coach." },
  telegram: { en: "Telegram alerts", ar: "تنبيهات تيليغرام", fr: "Alertes Telegram" },
  people: { en: "Partner and coach", ar: "الشريك والمدرّب", fr: "Partenaire et coach" },
  account: { en: "Account and sign-in", ar: "الحساب وتسجيل الدخول", fr: "Compte et connexion" },
  accountSub: { en: "The email you sign in with. Signing out keeps all your data.", ar: "البريد الذي تسجّل به الدخول. تسجيل الخروج يحتفظ بكل بياناتك.", fr: "L'e-mail de connexion. Se déconnecter garde toutes vos données." },
  photo: { en: "Photo", ar: "الصورة", fr: "Photo" },
  tzHelp: { en: "The 08:00 morning plan and the Sunday summary follow this time zone.", ar: "خطة الصباح (الثامنة) وملخص الأحد يتبعان هذه المنطقة الزمنية.", fr: "Le plan du matin (8 h) et le bilan du dimanche suivent ce fuseau." },
  noCountry: { en: "No country yet", ar: "لم تُحدَّد الدولة", fr: "Pays non défini" },
  tgOn: { en: "Telegram connected", ar: "تيليغرام متصل", fr: "Telegram connecté" },
  tgOff: { en: "Telegram not connected", ar: "تيليغرام غير متصل", fr: "Telegram non connecté" },
  unsaved: { en: "You have unsaved changes", ar: "لديك تغييرات غير محفوظة", fr: "Vous avez des modifications non enregistrées" },
  discard: { en: "Discard", ar: "تراجع", fr: "Annuler" },
} satisfies Record<string, L3>;

const SECTIONS: { id: string; tone: Tone; icon: LucideIcon; label: L3 }[] = [
  { id: "pf-details", tone: "gold", icon: UserRound, label: T.details },
  { id: "pf-telegram", tone: "sky", icon: Send, label: T.telegram },
  { id: "pf-people", tone: "emerald", icon: Users, label: T.people },
  { id: "pf-account", tone: "slate", icon: KeyRound, label: T.account },
];
const COUNTRIES = "TN DZ MA EG LY SA AE QA KW BH OM JO LB SY IQ PS YE SD MR TR FR DE ES IT PT BE NL CH GB IE SE NO DK FI PL US CA MX BR AR CL CO IN PK CN JP KR SG MY ID AU NZ ZA NG KE".split(" ");
const smooth = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

function Chip({ tone, icon: Icon, children }: { tone: Tone; icon: LucideIcon; children: ReactNode }) {
  return <span className={`tone-${tone} tone-chip inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold`}><Icon size={13} className="shrink-0" />{children}</span>;
}

export default function ProfileView({ t, lang, email, profile, onSave, onDeleteAll }: Props) {
  const L = (x: L3) => x[lang];
  const [draft, setDraft] = useState(profile);
  const [msg, setMsg] = useState<string | null>(null);
  const [tg, setTg] = useState<boolean | null>(null);
  const [active, setActive] = useState(SECTIONS[0].id);
  const file = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

  const names = new Intl.DisplayNames([lang], { type: "region" });
  const countries = COUNTRIES.map((c) => ({ c, n: names.of(c) ?? c })).sort((a, b) => a.n.localeCompare(b.n, lang));
  const zones: string[] = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["UTC"];
  const country = draft.country ? names.of(draft.country) ?? draft.country : "";
  let local = "";
  try { local = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: draft.timezone || undefined }).format(new Date()); } catch { /* unknown zone */ }

  // the section in view lights up in the bar
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id);
    }, { rootMargin: "-25% 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  const go = (id: string) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: smooth(), block: "start" }); };

  const pick = (f?: File) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return setMsg(t("imgTooBig"));
    const r = new FileReader();
    r.onload = () => {
      setMsg(null);
      setDraft((d) => ({ ...d, avatar: String(r.result) }));
    };
    r.readAsDataURL(f);
  };

  const sec = "scroll-mt-20 rounded-2xl border border-border bg-surface p-5 sm:p-6";
  const lbl = "flex flex-col gap-1.5 text-sm font-medium";
  const help = "text-xs font-normal leading-relaxed text-muted";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-2">
      {/* who you are, at a glance */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--icon) 17%, transparent), transparent)" }} />
        <div className="relative flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
          <div className="relative shrink-0">
            <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-icon ring-4 ring-[var(--surface)]" style={{ boxShadow: "0 0 0 6px color-mix(in srgb, var(--icon) 45%, transparent)" }}>
              {draft.avatar ? <img src={draft.avatar} alt="" className="h-full w-full object-cover" /> : <User size={50} className="text-on-primary" strokeWidth={1.6} />}
            </div>
            <button type="button" aria-label={t("changePic")} title={t("changePic")} onClick={() => file.current?.click()} className="absolute -bottom-1 -end-1 grid h-9 w-9 place-items-center rounded-full border-[3px] border-[var(--surface)] bg-primary text-on-primary">
              <Camera size={15} />
            </button>
          </div>
          <div className="w-full min-w-0 flex-1">
            <h1 className="truncate font-heading text-2xl font-bold sm:text-[1.75rem] sm:leading-tight">{draft.name || "—"}</h1>
            <p className="mt-1 truncate text-sm text-muted"><Private hint={t("privacyReveal")}>{email}</Private></p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Chip tone="gold" icon={MapPin}>{country || L(T.noCountry)}</Chip>
              <Chip tone="violet" icon={Clock}><span className="inline-flex items-center gap-2"><bdi dir="ltr">{(draft.timezone || "UTC").replace(/_/g, " ")}</bdi>{local && <bdi dir="ltr" className="opacity-75 tabular-nums">{local}</bdi>}</span></Chip>
              {tg !== null && <Chip tone={tg ? "sky" : "slate"} icon={Send}>{L(tg ? T.tgOn : T.tgOff)}</Chip>}
            </div>
          </div>
        </div>
      </section>

      {/* the sections, always in reach */}
      <nav aria-label={L(T.nav)} className="sticky top-0 z-20 -mx-4 px-4 py-2.5" style={{ background: "color-mix(in srgb, var(--bg) 86%, transparent)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((s) => {
            const on = active === s.id, Icon = s.icon;
            return (
              <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={on ? "true" : undefined}
                className={`tone-${s.tone} inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${on ? "tone-chip" : "border border-border text-muted hover:text-text"}`}>
                <Icon size={15} className={on ? "" : "tone-text"} />{L(s.label)}
              </button>
            );
          })}
        </div>
      </nav>

      <section id="pf-details" className={sec}>
        <SectionHead tone="gold" icon={UserRound} title={L(T.details)} sub={L(T.detailsSub)} />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className={lbl}>
            {t("name")}
            <input className="field" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className={lbl}>
            {t("country")}
            <select className="field" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })}>
              <option value="">{t("selectCountry")}</option>
              {countries.map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
          <label className={lbl}>
            {t("timezone")}
            <select className="field" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
              {!zones.includes(draft.timezone) && <option>{draft.timezone}</option>}
              {zones.map((z) => <option key={z}>{z}</option>)}
            </select>
            <span className={help}>{L(T.tzHelp)}</span>
          </label>
          <div className={lbl}>
            {L(T.photo)}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => file.current?.click()} className="tone-gold tone-btn inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"><Camera size={15} />{t("changePic")}</button>
              <button type="button" disabled={!draft.avatar} onClick={() => setDraft({ ...draft, avatar: null })} className="tone-red tone-btn inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"><Trash2 size={15} />{t("removePic")}</button>
            </div>
            <span className={msg ? "text-xs text-loss" : help} role={msg ? "alert" : undefined}>{msg ?? t("imgMax")}</span>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
      </section>

      <TelegramCard lang={lang} onStatus={setTg} />

      <section id="pf-account" className={sec}>
        <SectionHead tone="slate" icon={KeyRound} title={L(T.account)} sub={L(T.accountSub)} />
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg p-4">
          <span className="tone-slate tone-tile h-10 w-10 rounded-full"><Mail size={17} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{t("signedInAs")}</p>
            <p className="truncate text-sm font-semibold"><Private hint={t("privacyReveal")}>{email}</Private></p>
          </div>
          <button type="button" onClick={() => supabase.auth.signOut()} className="tone-slate tone-btn inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold"><LogOut size={15} className="rtl:-scale-x-100" />{t("signOut")}</button>
        </div>
        <div className="tone-red mt-4 flex flex-wrap items-center gap-4 rounded-2xl p-4" style={{ border: "1px solid color-mix(in srgb, var(--loss) 38%, var(--border))", background: "color-mix(in srgb, var(--loss) 6%, var(--surface))" }}>
          <span className="tone-tile h-10 w-10 rounded-xl"><TriangleAlert size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("closeAccount")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{t("closeHint")}</p>
          </div>
          <button type="button" onClick={() => window.confirm(t("deleteConfirm")) && onDeleteAll()} className="tone-btn inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"><Trash2 size={15} />{t("deleteAccount")}</button>
        </div>
      </section>

      {/* personal details are saved together */}
      {dirty && (
        <div role="region" aria-label={L(T.unsaved)} className="sticky bottom-4 z-30 mx-auto flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl"
          style={{ border: "1px solid color-mix(in srgb, var(--icon) 55%, var(--border))", background: "color-mix(in srgb, var(--surface) 92%, var(--icon))" }}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--icon)]" />
          <p className="min-w-0 flex-1 text-sm font-medium">{L(T.unsaved)}</p>
          <button type="button" onClick={() => { setDraft(profile); setMsg(null); }} className="rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:border-[var(--muted)]">{L(T.discard)}</button>
          <button type="button" onClick={() => { onSave(draft); setMsg(null); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">{t("saveChanges")}</button>
        </div>
      )}
    </div>
  );
}
