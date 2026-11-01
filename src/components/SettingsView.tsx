// Settings: how the app looks and behaves. Personal details stay in the profile and are not repeated here. Each
// setting's default is what the app did before this page existed, so a fresh account behaves exactly as it used to.
import { useMemo, useState } from "react";
import { Clock3, Coins, Database, LogOut, Monitor, RefreshCw, TrendingUp } from "lucide-react";
import { SectionHead, Switch } from "./profileUi";
import { languages, stT, themeNames, type Key } from "../i18n";
import { setSettings, useSettings, type BrokerClock, type DayStart, type FontSize, type NumberFormat, type WeekStart } from "../useSettings";
import { clampBounds, DEFAULT_BOUNDS } from "../lib/tradingTime";
import { currenciesOf, FRANKFURTER_CODES, frankfurterUrl, isFrankfurter, missingRates } from "../lib/fx";
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

  // Currencies the accounts actually use, minus the base, which needs no rate of its own.
  const needed = useMemo(() => currenciesOf(accounts).filter((c) => c !== s.baseCurrency), [accounts, s.baseCurrency]);
  const fxMissing = useMemo(() => missingRates(accounts, s.baseCurrency, s.rates), [accounts, s.baseCurrency, s.rates]);
  // The base list is the published set plus anything the accounts already use, so a manual-only currency can be it.
  const baseOptions = useMemo(
    () => [...new Set([...FRANKFURTER_CODES, ...currenciesOf(accounts).filter(Boolean)])].sort(),
    [accounts],
  );
  const [fetching, setFetching] = useState(false);
  const [ratesNote, setRatesNote] = useState<string | null>(null);

  const updateRates = async () => {
    // Only the codes the published set covers are asked for; the rest stay as they were typed.
    const ask = needed.filter((c) => isFrankfurter(c));
    if (!ask.length) return setRatesNote(L("ratesManual"));
    setFetching(true);
    setRatesNote(null);
    try {
      const r = await fetch(frankfurterUrl(s.baseCurrency, ask));
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as { date?: string; rates?: Record<string, number> };
      const got = data.rates ?? {};
      const next = { ...s.rates };
      for (const [k, v] of Object.entries(got)) if (Number.isFinite(v) && v > 0) next[k] = v;
      setSettings({ rates: next, ratesDate: data.date ?? "" });
    } catch {
      setRatesNote(L("ratesFailed"));
    } finally {
      setFetching(false);
    }
  };

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
        <SectionHead tone="violet" icon={Clock3} title={L("analytics")} sub={L("analyticsSub")} />
        <div className="mt-6 flex flex-col gap-4">
          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("dayStart")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("dayStartSub")}</span>
              <span className="mt-1 block text-xs text-muted">{s.dayStart === "ny17" ? L("ny17Sub") : L("dateOnlyNote")}</span>
            </span>
            <Choice<DayStart>
              label={L("dayStart")} value={s.dayStart} onChange={(v) => setSettings({ dayStart: v })}
              options={[{ v: "midnight", label: L("midnight") }, { v: "ny17", label: L("ny17") }]}
            />
          </div>

          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("brokerClock")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("brokerClockSub")}</span>
              <span className="mt-1 block text-xs text-muted">
                {s.brokerClock.kind === "mt5" ? L("clockMt5Sub") : s.brokerClock.kind === "none" ? L("clockNoneSub") : ""}
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Choice<BrokerClock["kind"]>
                label={L("brokerClock")} value={s.brokerClock.kind}
                onChange={(v) => setSettings({ brokerClock: v === "fixed" ? { kind: "fixed", hours: 2 } : { kind: v } })}
                options={[{ v: "none", label: L("clockNone") }, { v: "fixed", label: L("clockFixed") }, { v: "mt5", label: L("clockMt5") }]}
              />
              {s.brokerClock.kind === "fixed" && (
                <input
                  aria-label={L("clockHours")} className="field !w-20 !py-1.5 text-sm" type="number" min="-12" max="14" step="1"
                  value={s.brokerClock.hours}
                  onChange={(e) => setSettings({ brokerClock: { kind: "fixed", hours: Number(e.target.value) || 0 } })}
                />
              )}
            </div>
          </div>

          {accounts.length > 0 && (
            <div className={row}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{L("perAccount")}</span>
                <span className="mt-0.5 block text-xs text-muted">{L("perAccountSub")}</span>
              </span>
              <div className="flex w-full flex-col gap-2 sm:w-auto">
                {accounts.map((a) => {
                  const own = s.brokerByAccount[a.id];
                  const kind = own?.kind ?? "";
                  return (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                      <span className="truncate text-xs text-muted">{a.name}</span>
                      <select
                        aria-label={`${L("brokerClock")}: ${a.name}`} className="field !w-auto !py-1.5 text-sm" value={kind}
                        onChange={(e) => {
                          const v = e.target.value;
                          const next = { ...s.brokerByAccount };
                          if (!v) delete next[a.id];
                          else next[a.id] = v === "fixed" ? { kind: "fixed", hours: 2 } : { kind: v as "none" | "mt5" };
                          setSettings({ brokerByAccount: next });
                        }}
                      >
                        <option value="">{L("useDefault")}</option>
                        <option value="none">{L("clockNone")}</option>
                        <option value="fixed">{L("clockFixed")}</option>
                        <option value="mt5">{L("clockMt5")}</option>
                      </select>
                      {own?.kind === "fixed" && (
                        <input
                          aria-label={`${L("clockHours")}: ${a.name}`} className="field !w-20 !py-1.5 text-sm" type="number" min="-12" max="14" step="1"
                          value={own.hours}
                          onChange={(e) => setSettings({ brokerByAccount: { ...s.brokerByAccount, [a.id]: { kind: "fixed", hours: Number(e.target.value) || 0 } } })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("breakEven")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("breakEvenSub")}</span>
            </span>
            <input
              aria-label={L("breakEven")} className="field !w-24 !py-1.5 text-sm" type="number" min="0" step="0.01" inputMode="decimal"
              value={s.breakEven}
              onChange={(e) => setSettings({ breakEven: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>

          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("bounds")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("boundsSub")}</span>
              <span className="mt-1 block text-xs text-muted">{L("boundsNote")}</span>
            </span>
            <div className="flex flex-wrap items-end gap-2">
              {([["boundTokyo", "tokyo"], ["boundLondon", "london"], ["boundNewYork", "newYork"]] as const).map(([key, field]) => (
                <label key={field} className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                  {L(key)}
                  <input
                    className="field !w-16 !py-1.5 text-sm" type="number" min="0" max="24" step="1" value={s.sessionBounds[field]}
                    /* Put back in order on the way in, so an invalid set is never stored. */
                    onChange={(e) => setSettings({ sessionBounds: clampBounds({ ...s.sessionBounds, [field]: Number(e.target.value) }) })}
                  />
                </label>
              ))}
              <button
                type="button" onClick={() => setSettings({ sessionBounds: DEFAULT_BOUNDS })}
                className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-primary-tint"
              >
                {L("reset")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={sec}>
        <SectionHead tone="amber" icon={Coins} title={L("unify")} sub={L("unifySub")} />
        <div className="mt-6 flex flex-col gap-4">
          <div className={row}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{L("unify")}</span>
              <span className="mt-0.5 block text-xs text-muted">{L("ratesSent")}</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Switch label={L("unify")} checked={s.unifyCurrency} onChange={(v) => setSettings({ unifyCurrency: v })} />
              <select
                aria-label={L("baseCurrency")} className="field !w-auto !py-1.5 text-sm" value={s.baseCurrency}
                onChange={(e) => setSettings({ baseCurrency: e.target.value })}
              >
                {baseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {s.unifyCurrency && (
            <div className={row}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{L("rates")}</span>
                <span className="mt-0.5 block text-xs text-muted">{L("ratesSub").replace("{base}", s.baseCurrency)}</span>
                {s.ratesDate && <span className="mt-1 block text-xs text-muted">{L("ratesAsOf").replace("{date}", s.ratesDate)}</span>}
                {fxMissing.length > 0 && (
                  <span className="mt-1 block text-xs text-loss">
                    {L("ratesMissing").replace("{codes}", fxMissing.map((c) => c || L("noCurrencyCode")).join(", "))}
                  </span>
                )}
              </span>
              <div className="flex w-full flex-col gap-2 sm:w-auto">
                {needed.length === 0 && <span className="text-xs text-muted">{L("allAccounts")}</span>}
                {needed.map((c) => (
                  <div key={c} className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                    <span className="text-xs text-muted">{c || L("noCurrencyCode")}</span>
                    <input
                      aria-label={`${L("rates")}: ${c}`} className="field !w-28 !py-1.5 text-sm" type="number" min="0" step="0.0001" inputMode="decimal"
                      value={s.rates[c] ?? ""}
                      onChange={(e) => {
                        const next = { ...s.rates };
                        const v = Number(e.target.value);
                        if (!e.target.value || !Number.isFinite(v) || v <= 0) delete next[c];
                        else next[c] = v;
                        setSettings({ rates: next });
                      }}
                    />
                    {!isFrankfurter(c) && <span className="basis-full text-[11px] text-muted sm:basis-auto">{L("ratesManual")}</span>}
                  </div>
                ))}
                <div className="flex items-center justify-end gap-2">
                  {ratesNote && <span className="text-xs text-muted">{ratesNote}</span>}
                  <button
                    type="button" disabled={fetching} onClick={() => void updateRates()}
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-primary-tint disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={fetching ? "animate-spin text-icon" : "text-icon"} />
                    {L("updateRates")}
                  </button>
                </div>
              </div>
            </div>
          )}
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
