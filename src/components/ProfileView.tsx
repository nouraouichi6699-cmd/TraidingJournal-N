import { useRef, useState } from "react";
import { Camera, Trash2, Info, User, Check } from "lucide-react";
import type { Key } from "../i18n";
import type { Lang } from "../types";
import type { Profile } from "../useProfile";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  profile: Profile;
  onSave: (p: Profile) => void;
  onDeleteAll: () => void;
}

const COUNTRIES = "TN DZ MA EG LY SA AE QA KW BH OM JO LB SY IQ PS YE SD MR TR FR DE ES IT PT BE NL CH GB IE SE NO DK FI PL US CA MX BR AR CL CO IN PK CN JP KR SG MY ID AU NZ ZA NG KE".split(" ");

export default function ProfileView({ t, lang, profile, onSave, onDeleteAll }: Props) {
  const [draft, setDraft] = useState(profile);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const names = new Intl.DisplayNames([lang], { type: "region" });
  const countries = COUNTRIES.map((c) => ({ c, n: names.of(c) ?? c })).sort((a, b) => a.n.localeCompare(b.n, lang));
  const zones: string[] = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["UTC"];

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

  const card = "rounded-2xl border border-border bg-surface p-5";
  const btn = "flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <section className={`${card} flex flex-wrap items-center gap-5`}>
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-icon">
          {draft.avatar ? <img src={draft.avatar} alt="" className="h-full w-full object-cover" /> : <User size={52} className="text-on-primary" strokeWidth={1.6} />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-xl font-bold">{draft.name || "—"}</h2>
          <p className="text-sm text-muted">{t("profileSub")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><Info size={13} />{t("imgMax")}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <button type="button" onClick={() => file.current?.click()} className={`${btn} border-icon text-icon hover:bg-primary-tint`}>
            <Camera size={16} />{t("changePic")}
          </button>
          <button type="button" disabled={!draft.avatar} onClick={() => setDraft({ ...draft, avatar: null })} className={`${btn} border-loss/40 text-loss enabled:hover:bg-loss/10 disabled:opacity-40`}>
            <Trash2 size={16} />{t("removePic")}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </section>

      <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h3 className="mb-1 text-sm font-semibold text-icon">{t("accountSec")}</h3>
          <p className="text-sm text-muted">{t("notSignedIn")}</p>
        </div>
        <button type="button" disabled className={`${btn} border-icon text-icon disabled:opacity-40`}>{t("changeEmail")}</button>
      </section>

      <section className={`${card} flex flex-wrap items-center justify-between gap-3 !border-loss/40`}>
        <div>
          <h3 className="mb-1 text-sm font-semibold text-icon">{t("accessSec")}</h3>
          <p className="font-bold">{t("closeAccount")}</p>
          <p className="text-sm text-muted">{t("closeHint")}</p>
        </div>
        <button
          type="button"
          onClick={() => window.confirm(t("deleteConfirm")) && onDeleteAll()}
          className={`${btn} border-loss/60 text-loss hover:bg-loss/10`}
        >
          {t("deleteAccount")}
        </button>
      </section>

      <section className={card}>
        <h3 className="mb-4 text-sm font-semibold text-icon">{t("prefsSec")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("name")}
            <input className="field" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("country")}
            <select className="field" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })}>
              <option value="">{t("selectCountry")}</option>
              {countries.map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("timezone")}
            <select className="field" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
              {!zones.includes(draft.timezone) && <option>{draft.timezone}</option>}
              {zones.map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-sm text-loss" role="alert">{msg}</span>}
        <button
          type="button"
          onClick={() => { onSave(draft); setMsg(null); }}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary"
        >
          {JSON.stringify(draft) === JSON.stringify(profile) ? <Check size={16} /> : null}
          {t("saveChanges")}
        </button>
      </div>
    </div>
  );
}
