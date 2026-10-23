// Import › MT5 auto-sync: makes the account's sync key for the MizanSync Expert Advisor and shows whether it syncs.
import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Download, PlugZap } from "lucide-react";
import type { Account, Lang } from "../types";
import { createSyncKey, readSyncKey, removeSyncKey, type SyncKey } from "../lib/mt5Sync";
import { SUPABASE_URL } from "../lib/supabase";

const T = {
  title: { en: "MT5 auto-sync", ar: "مزامنة MT5 التلقائية", fr: "Synchro auto MT5" },
  lead: {
    en: "Your trades arrive here by themselves when they close in MetaTrader 5, with no report to export. A small read-only Expert Advisor sends them; it never trades.",
    ar: "تصل صفقاتك إلى هنا وحدها عند إغلاقها في ميتاتريدر 5، دون تصدير أي تقرير. يرسلها مستشار خبير صغير يقرأ فقط ولا يتداول أبداً.",
    fr: "Vos trades arrivent ici tout seuls à leur clôture dans MetaTrader 5, sans rapport à exporter. Un petit Expert Advisor en lecture seule les envoie ; il ne trade jamais.",
  },
  onlyMt5: { en: "Auto-sync is for MetaTrader 5 accounts: pick an MT5 account above.", ar: "المزامنة التلقائية لحسابات ميتاتريدر 5: اختر حساب MT5 في الأعلى.", fr: "La synchro auto est pour les comptes MetaTrader 5 : choisissez un compte MT5 ci-dessus." },
  create: { en: "Create a sync key", ar: "إنشاء مفتاح مزامنة", fr: "Créer une clé de synchro" },
  keyFor: { en: "Sync key for {acc}", ar: "مفتاح المزامنة لحساب {acc}", fr: "Clé de synchro pour {acc}" },
  once: {
    en: "Copy it now: it is shown only once. Anyone with this key can add trades to this account, so keep it private.",
    ar: "انسخه الآن: لن يظهر مرة أخرى. من يملك هذا المفتاح يستطيع إضافة صفقات إلى هذا الحساب، فاحتفظ به لنفسك.",
    fr: "Copiez-la maintenant : elle ne s'affiche qu'une fois. Quiconque a cette clé peut ajouter des trades à ce compte ; gardez-la privée.",
  },
  copy: { en: "Copy", ar: "نسخ", fr: "Copier" },
  copied: { en: "Copied", ar: "تم النسخ", fr: "Copié" },
  stepsTitle: { en: "Set up MetaTrader 5 (once)", ar: "إعداد ميتاتريدر 5 (مرة واحدة)", fr: "Configurer MetaTrader 5 (une fois)" },
  download: { en: "Download MizanSync.mq5", ar: "تنزيل MizanSync.mq5", fr: "Télécharger MizanSync.mq5" },
  s1: { en: "Put the downloaded file in MT5: {a}.", ar: "ضع الملف الذي نزّلته في MT5:‏ {a}.", fr: "Placez le fichier téléchargé dans MT5 : {a}." },
  s2: { en: "In MT5, open {a}, tick {b} and add {c}", ar: "في MT5 افتح {a}، فعّل {b} وأضف {c}", fr: "Dans MT5, ouvrez {a}, cochez {b} et ajoutez {c}" },
  s3: { en: "Open MetaEditor ({a}), open MizanSync.mq5 and press {b} ({c}).", ar: "افتح MetaEditor ‏({a})، ثم افتح MizanSync.mq5 واضغط {b} ‏({c}).", fr: "Ouvrez MetaEditor ({a}), ouvrez MizanSync.mq5 et cliquez sur {b} ({c})." },
  s4: { en: "Drag MizanSync from the Navigator onto any chart, paste the key into {a} in its Inputs tab, then OK.", ar: "اسحب MizanSync من نافذة Navigator إلى أي رسم بياني، والصق المفتاح في خانة {a} من تبويب Inputs، ثم OK.", fr: "Glissez MizanSync du Navigator sur un graphique, collez la clé dans {a} (onglet Inputs), puis OK." },
  s5: { en: "Keep MT5 open: closed trades arrive here within a minute. The status shows here and on the chart.", ar: "أبقِ MT5 مفتوحاً: تصل الصفقات المغلقة إلى هنا خلال دقيقة، وتظهر الحالة هنا وعلى الرسم البياني.", fr: "Laissez MT5 ouvert : les trades clôturés arrivent ici en une minute. L'état s'affiche ici et sur le graphique." },
  connected: { en: "Connected", ar: "متصل", fr: "Connecté" },
  waiting: { en: "Waiting for MT5", ar: "بانتظار MT5", fr: "En attente de MT5" },
  paused: { en: "Paused", ar: "متوقف", fr: "En pause" },
  last: { en: "Last sync {t}", ar: "آخر مزامنة {t}", fr: "Dernière synchro {t}" },
  first: { en: "Waiting for the first sync from MT5…", ar: "بانتظار أول مزامنة من MT5…", fr: "En attente de la première synchro de MT5…" },
  stale: { en: "Is MT5 open with MizanSync on a chart?", ar: "هل MT5 مفتوح وعليه MizanSync؟", fr: "MT5 est-il ouvert avec MizanSync sur un graphique ?" },
  login: { en: "MT5 account {n}", ar: "حساب MT5 {n}", fr: "Compte MT5 {n}" },
  steps: { en: "Setup steps", ar: "خطوات الإعداد", fr: "Étapes" },
  newKey: { en: "New key", ar: "مفتاح جديد", fr: "Nouvelle clé" },
  confirmNew: { en: "Make a new key? The current key stops working: paste the new one in the EA.", ar: "إنشاء مفتاح جديد؟ سيتوقف المفتاح الحالي، فالصق الجديد في المستشار الخبير.", fr: "Créer une nouvelle clé ? L'actuelle ne marchera plus : collez la nouvelle dans l'EA." },
  off: { en: "Disconnect", ar: "قطع الاتصال", fr: "Déconnecter" },
  confirmOff: { en: "Disconnect? MT5 stops sending trades to this account. Trades already here stay.", ar: "قطع الاتصال؟ سيتوقف MT5 عن إرسال الصفقات إلى هذا الحساب، وتبقى الصفقات الموجودة.", fr: "Déconnecter ? MT5 n'enverra plus de trades à ce compte. Ceux déjà ici restent." },
  cancel: { en: "Cancel", ar: "إلغاء", fr: "Annuler" },
  failed: { en: "Could not reach Mizan's server. Try again.", ar: "تعذّر الوصول إلى خادم ميزان. حاول مجدداً.", fr: "Serveur Mizan injoignable. Réessayez." },
  retry: { en: "Try again", ar: "إعادة المحاولة", fr: "Réessayer" },
  done: { en: "Done", ar: "تم", fr: "Terminé" },
} satisfies Record<string, Record<Lang, string>>;

const HOST = SUPABASE_URL.replace(/\/+$/, "");
const STALE = 30 * 60e3; // the EA reports at least every 10 minutes while MT5 is open

/** "{a}"-style placeholders filled with inline nodes. */
function fill(text: string, parts: Record<string, ReactNode>) {
  return text.split(/\{(\w+)\}/).map((p, i) => <Fragment key={i}>{i % 2 ? parts[p] : p}</Fragment>);
}
const Code = ({ children }: { children: string }) => (
  <code dir="ltr" className="rounded-md border border-border bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[12px] text-text box-decoration-clone [overflow-wrap:anywhere]">{children}</code>
);
/** An MT5 menu path; it wraps between steps, never inside one. */
const Path = ({ steps }: { steps: string[] }) => (
  <span dir="ltr" className="inline">
    {steps.map((x, i) => (
      <Fragment key={x}>
        {i > 0 && <span className="text-muted"> › </span>}
        <code className="whitespace-nowrap rounded-md border border-border bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[12px] text-text">{x}</code>
      </Fragment>
    ))}
  </span>
);

function ago(iso: string, lang: Lang, now: number) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000), rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar-u-nu-latn" : lang, { numeric: "auto" });
  return s < 45 ? rtf.format(0, "second") : s < 3600 ? rtf.format(-Math.round(s / 60), "minute") : s < 86400 ? rtf.format(-Math.round(s / 3600), "hour") : rtf.format(-Math.round(s / 86400), "day");
}

async function copyText(s: string) {
  try { await navigator.clipboard.writeText(s); return true; } catch { return false; }
}

function CopyButton({ text, lang, primary }: { text: string; lang: Lang; primary?: boolean }) {
  const [ok, setOk] = useState(false);
  useEffect(() => { if (!ok) return; const id = setTimeout(() => setOk(false), 1600); return () => clearTimeout(id); }, [ok]);
  return (
    <button type="button" onClick={async () => setOk(await copyText(text))}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${primary ? "bg-primary text-on-primary" : "border border-border text-muted hover:text-text"}`}>
      {ok ? <Check size={14} /> : <Copy size={14} />}
      {ok ? T.copied[lang] : T.copy[lang]}
    </button>
  );
}

function Steps({ lang }: { lang: Lang }) {
  const items = [
    <>
      <a href={`${import.meta.env.BASE_URL}MizanSync.mq5`} download className="mb-1.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary">
        <Download size={14} /> {T.download[lang]}
      </a>
      <span className="block">{fill(T.s1[lang], { a: <Path steps={["File", "Open Data Folder", "MQL5", "Experts"]} /> })}</span>
    </>,
    <>
      {fill(T.s2[lang], { a: <Path steps={["Tools", "Options", "Expert Advisors"]} />, b: <Code>Allow WebRequest for listed URL</Code>, c: <Code>{HOST}</Code> })}
      <span className="ms-2 inline-block align-middle"><CopyButton text={HOST} lang={lang} /></span>
    </>,
    fill(T.s3[lang], { a: <Code>F4</Code>, b: <Code>Compile</Code>, c: <Code>F7</Code> }),
    fill(T.s4[lang], { a: <Code>Sync key</Code> }),
    T.s5[lang],
  ];
  return (
    <div className="mt-4 rounded-xl border border-border p-4">
      <p className="mb-3 text-sm font-semibold">{T.stepsTitle[lang]}</p>
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-tint text-xs font-semibold text-primary">{i + 1}</span>
            <div className="min-w-0 flex-1">{it}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Mt5SyncCard({ lang, userId, account }: { lang: Lang; userId: string; account: Account }) {
  const [state, setState] = useState<SyncKey | null | undefined | "error">(undefined);
  const [fresh, setFresh] = useState<string | null>(null); // the key just made, shown once
  const [ask, setAsk] = useState<null | "new" | "off">(null);
  const [steps, setSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const mt5 = account.platform === "mt5";

  const load = useCallback(async () => {
    const s = await readSyncKey(userId, account.id);
    setState((old) => (s === undefined ? (old === undefined ? "error" : old) : s));
    setNow(Date.now());
  }, [userId, account.id]);

  useEffect(() => { setState(undefined); setFresh(null); setAsk(null); setSteps(false); if (mt5) void load(); }, [load, mt5]);
  // while waiting for the first sync, look often; otherwise just keep the status fresh
  const waitingFirst = !!state && state !== "error" && !state.last;
  useEffect(() => {
    if (!mt5 || !state || state === "error") return;
    const id = setInterval(load, waitingFirst ? 5000 : 30000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [mt5, state, waitingFirst, load]);

  const make = async () => {
    setBusy(true); setAsk(null);
    const key = await createSyncKey(userId, account.id);
    if (key) { setFresh(key); setSteps(true); await load(); } else setState("error");
    setBusy(false);
  };
  const off = async () => {
    setBusy(true); setAsk(null);
    if (await removeSyncKey(userId, account.id)) { setFresh(null); setState(null); setSteps(false); } else setState("error");
    setBusy(false);
  };

  const key = state && state !== "error" ? state : null;
  const status = !key ? null : !key.last ? "waiting" : now - Date.parse(key.last) > STALE ? "paused" : "connected";

  return (
    <section className="rounded-2xl border border-border p-5" aria-busy={busy}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-icon"><PlugZap size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="font-heading text-base font-semibold">{T.title[lang]}</h3>
            {status && (
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold" aria-live="polite">
            <span className="relative flex h-2 w-2">
              {status === "connected" && <span className="absolute inline-flex h-full w-full rounded-full bg-profit opacity-60 motion-safe:animate-ping" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${status === "connected" ? "bg-profit" : status === "waiting" ? "border-[1.5px] border-[var(--icon)] motion-safe:animate-pulse" : "bg-[var(--muted)]"}`} />
            </span>
            {T[status][lang]}
          </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted">{mt5 ? T.lead[lang] : T.onlyMt5[lang]}</p>
        </div>
      </div>

      {mt5 && state === undefined && <div className="mt-4 h-9 w-48 animate-pulse rounded-xl bg-skeleton" />}

      {mt5 && state === "error" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-loss">{T.failed[lang]}</span>
          <button type="button" onClick={() => { setState(undefined); void load(); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">{T.retry[lang]}</button>
        </div>
      )}

      {mt5 && state === null && (
        <button type="button" disabled={busy} onClick={make} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-opacity disabled:opacity-50">
          {T.create[lang]}
        </button>
      )}

      {mt5 && key && (
        <>
          {fresh && (
            <div className="mt-4 rounded-xl border border-[var(--primary)] bg-primary-tint p-4">
              <p className="text-xs font-semibold text-primary">{T.keyFor[lang].replace("{acc}", account.name)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input readOnly value={fresh} dir="ltr" onFocus={(e) => e.currentTarget.select()} aria-label={T.keyFor[lang].replace("{acc}", account.name)}
                  className="min-w-[12rem] flex-1 rounded-lg border border-border bg-[var(--bg)] px-3 py-2 font-mono text-[13px] text-text outline-none focus:border-[var(--icon)]" />
                <CopyButton text={fresh} lang={lang} primary />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">{T.once[lang]}</p>
            </div>
          )}

          <p className="mt-4 text-sm text-muted">
            {key.last ? T.last[lang].replace("{t}", ago(key.last, lang, now)) : T.first[lang]}
            {key.login && <span className="whitespace-nowrap"> · {T.login[lang].replace("{n}", key.login)}</span>}
            {status === "paused" && <span className="block text-text">{T.stale[lang]}</span>}
          </p>

          {ask ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
              <span className="me-auto">{ask === "new" ? T.confirmNew[lang] : T.confirmOff[lang]}</span>
              <button type="button" onClick={() => setAsk(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">{T.cancel[lang]}</button>
              <button type="button" disabled={busy} onClick={ask === "new" ? make : off} className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${ask === "off" ? "bg-loss text-white" : "bg-primary text-on-primary"}`}>
                {ask === "new" ? T.newKey[lang] : T.off[lang]}
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {fresh ? (
                <button type="button" onClick={() => { setFresh(null); setSteps(false); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">{T.done[lang]}</button>
              ) : (
                <button type="button" aria-expanded={steps} onClick={() => setSteps((s) => !s)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">{T.steps[lang]}</button>
              )}
              <button type="button" onClick={() => setAsk("new")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">{T.newKey[lang]}</button>
              <button type="button" onClick={() => setAsk("off")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-loss hover:border-[var(--loss)]">{T.off[lang]}</button>
            </div>
          )}

          {(steps || fresh) && <Steps lang={lang} />}
        </>
      )}
    </section>
  );
}
