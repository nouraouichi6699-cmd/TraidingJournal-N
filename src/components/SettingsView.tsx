// Settings: how the app looks and behaves. Personal details stay in the profile and are not repeated here. Each
// setting's default is what the app did before this page existed, so a fresh account behaves exactly as it used to.
import { useState } from "react";
import { Database, LogOut, Monitor, TrendingUp } from "lucide-react";
import { SectionHead, Switch } from "./profileUi";
import { languages, stT, themeNames, type Key } from "../i18n";
import { setSettings, useSettings, type FontSize, type NumberFormat, type WeekStart } from "../useSettings";
import { setPrivacy } from "../usePrivacy";
import { downloadCsv, tradesToCsv } from "../lib/exportTrades";
import { supabase } from "../lib/supabase";
import type { Account, Lang, Theme, Trade } from "../types";

const sec = "rounded-2xl border border-border bg-surface p-5 sm:p-6";
const lbl = "flex flex-col gap-1.5 text-sm font-medium";
const row = "flex flex-wrap items-start justify-between gap-3 border-t border-border pt-4 first:border-0 first:pt-0";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  theme: Theme;
  onLang: (l: Lang) => void;
  onTheme: (t: Theme) => void;
  accounts: Account[];
  trades: Trade[];
  onImport: () => void;
}

/** A row of choices, which is clearer than a select for two or three short options. */
function Choice<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${value === o.v ? "border-primary bg-primary text-on-primary" : "border-border text-text hover:bg-primary-tint"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsView({ t, lang, theme, onLang, onTheme, accounts, trades, onImport }: Props) {
  const L = stT(lang);
  const s = useSettings();
  const [exportAcc, setExportAcc] = useState("all");
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const exportNow = () => {
    const list = trades.filter((x) => exportAcc === "all" || x.accountId === exportAcc);
    if (!list.length) return setNote(L("noTrades"));
    const who = exportAcc === "all" ? "all-accounts" : (accounts.find((a) => a.id === exportAcc)?.name ?? exportAcc);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`mizan-trades-${who.replace(/[^\w-]+/g, "-")}-${stamp}.csv`, tradesToCsv(list, accounts));
    setNote(L("exported").replace("{n}", String(list.length)));
  };

  const signOutEverywhere = async () => {
    setBusy(true);
    // Ends this session too, so the app drops back to the login screen on its own through onAuthStateChange.
    await supabase.auth.signOut({ scope: "global" });
    setBusy(false);
    setAsking(false);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header>
        <h1 className="font-heading text-2xl font-bold">{L("title")}</h1>
        <p className="mt-1 text-sm text-muted">{L("sub")}</p>
      </header>

      <section className={sec}>
        <SectionHead tone="sky" icon={Monitor} title={L("display")} sub={L("displaySub")} />
        <div className="mt-6 flex flex-col gap-4">
          <div className={row}>
            <span className="text-sm font-medium">{t("theme")}</span>
            <Choice<Theme>
              label={t("theme")} value={theme} onChange={onTheme}
              options={(Object.keys(themeNames) as Theme[]).map((th) => ({ v: th, label: themeNames[th][lang] }))}
            />
          </div>
          <div className={row}>
            <span className="text-sm font-medium">{t("language")}</span>
            <Choice<Lang> label={t("language")} value={lang} onChange={onLang} options={languages.map((l) => ({ v: l.code, label: l.label }))} />
          </div>
          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("weekStart")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("weekStartSub")}</span>
            </span>
            <Choice<WeekStart>
              label={L("weekStart")} value={s.weekStart} onChange={(v) => setSettings({ weekStart: v })}
              options={[{ v: "mon", label: L("monday") }, { v: "sun", label: L("sunday") }]}
            />
          </div>
          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("privacyAtOpen")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("privacyAtOpenSub")}</span>
            </span>
            {/* Turning it on hides things straight away, so the effect is visible rather than only next time. */}
            <Switch
              label={L("privacyAtOpen")} checked={s.privacyAtOpen}
              onChange={(v) => { setSettings({ privacyAtOpen: v }); if (v) setPrivacy(true); }}
            />
          </div>
          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("reduceMotion")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("reduceMotionSub")}</span>
            </span>
            <Switch label={L("reduceMotion")} checked={s.reduceMotion} onChange={(v) => setSettings({ reduceMotion: v })} />
          </div>
          <div className={row}>
            <span className="text-sm font-medium">{L("fontSize")}</span>
            <Choice<FontSize>
              label={L("fontSize")} value={s.fontSize} onChange={(v) => setSettings({ fontSize: v })}
              options={[{ v: "small", label: L("small") }, { v: "normal", label: L("normal") }, { v: "large", label: L("large") }]}
            />
          </div>
          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("numberFormat")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("numberFormatSub")}</span>
            </span>
            <Choice<NumberFormat>
              label={L("numberFormat")} value={s.numberFormat} onChange={(v) => setSettings({ numberFormat: v })}
              options={[{ v: "dot", label: "1,234.56" }, { v: "space", label: "1 234,56" }]}
            />
          </div>
        </div>
      </section>

      <section className={sec}>
        <SectionHead tone="emerald" icon={TrendingUp} title={L("trading")} sub={L("tradingSub")} />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className={lbl}>
            {L("defaultAccount")}
            <select className="field" value={s.defaultAccount} onChange={(e) => setSettings({ defaultAccount: e.target.value })}>
              <option value="all">{L("allAccounts")}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className={lbl}>
            {L("riskPct")}
            <input
              className="field" type="number" min="0.1" max="100" step="0.1" inputMode="decimal" value={s.riskPct}
              onChange={(e) => setSettings({ riskPct: e.target.value })}
            />
            <span className="text-xs font-normal text-muted">{L("riskPctSub")}</span>
          </label>
        </div>
      </section>

      <section className={sec}>
        <SectionHead tone="slate" icon={Database} title={L("data")} sub={L("dataSub")} />
        <div className="mt-6 flex flex-col gap-4">
          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("exportCsv")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("exportCsvSub")}</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={L("exportWhich")} className="field !w-auto !py-1.5 text-sm" value={exportAcc} onChange={(e) => setExportAcc(e.target.value)}>
                <option value="all">{L("allAccounts")}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button type="button" onClick={exportNow} className="rounded-xl bg-primary px-3.5 py-1.5 text-sm font-semibold text-on-primary">
                {L("download")}
              </button>
            </div>
          </div>

          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("mt5Keys")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("mt5KeysSub")}</span>
            </span>
            <button type="button" onClick={onImport} className="rounded-xl border border-border px-3.5 py-1.5 text-sm font-medium hover:bg-primary-tint">
              {L("openImport")}
            </button>
          </div>

          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("signOutAll")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("signOutAllSub")}</span>
            </span>
            <button type="button" onClick={() => setAsking(true)} className="flex items-center gap-2 rounded-xl border border-loss/40 px-3.5 py-1.5 text-sm font-medium text-loss hover:bg-loss/10">
              <LogOut size={15} />{L("signOutAll")}
            </button>
          </div>

          {note && <p role="status" aria-live="polite" className="text-xs text-muted">{note}</p>}
        </div>
      </section>

      {asking && (
        <div role="dialog" aria-modal="true" aria-label={L("signOutAllConfirm")} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-heading text-lg font-semibold">{L("signOutAllConfirm")}</h2>
            <p className="mt-2 text-sm text-muted">{L("signOutAllBody")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAsking(false)} className="rounded-xl border border-border px-3.5 py-2 text-sm font-medium hover:bg-primary-tint">
                {L("cancel")}
              </button>
              <button type="button" disabled={busy} onClick={() => void signOutEverywhere()} className="rounded-xl bg-loss px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {L("signOutAll")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
