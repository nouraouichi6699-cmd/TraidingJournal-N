// Profile › Telegram alerts: link a Telegram chat to the account, choose what is sent, test, unlink.
import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { Lang } from "../types";
import { tgInfo, tgLink, tgLinked, tgPrefs, tgTest, tgUnlink, type TgError, type TgPrefs } from "../lib/telegram";

type L3 = Record<Lang, string>;
const T = {
  title: { en: "Telegram alerts", ar: "تنبيهات تيليغرام", fr: "Alertes Telegram" },
  lead: { en: "Each trade closed by MT5 auto-sync and your prop-challenge warnings, straight to Telegram.", ar: "كل صفقة تُغلقها مزامنة MT5 وتنبيهات تحديات التمويل، مباشرة إلى تيليغرام.", fr: "Chaque trade clôturé par la synchro MT5 et vos alertes de challenge, directement dans Telegram." },
  connect: { en: "Connect Telegram", ar: "ربط تيليغرام", fr: "Connecter Telegram" },
  open: { en: "Open Telegram", ar: "افتح تيليغرام", fr: "Ouvrir Telegram" },
  waiting: { en: "Press Start in the bot: this page updates by itself.", ar: "اضغط «Start» في البوت: تتحدث هذه الصفحة وحدها.", fr: "Appuyez sur Démarrer dans le bot : cette page se met à jour toute seule." },
  expired: { en: "The link has expired: connect again.", ar: "انتهت صلاحية الرابط: اضغط «ربط» من جديد.", fr: "Le lien a expiré : reconnectez-vous." },
  connected: { en: "Connected", ar: "متصل", fr: "Connecté" },
  to: { en: "Connected to {n} · bot @{b}", ar: "مربوط بـ {n} · البوت ‎@{b}", fr: "Connecté à {n} · bot @{b}" },
  trades: { en: "Each closed trade (MT5 auto-sync)", ar: "كل صفقة مغلقة (مزامنة MT5)", fr: "Chaque trade clôturé (synchro MT5)" },
  rules: { en: "Prop challenge warnings: loss limits, target", ar: "تنبيهات تحديات التمويل: حدود الخسارة والهدف", fr: "Alertes de challenge : limites de perte, objectif" },
  test: { en: "Send a test", ar: "إرسال تجربة", fr: "Envoyer un test" },
  sent: { en: "Sent ✓", ar: "أُرسلت ✓", fr: "Envoyé ✓" },
  off: { en: "Disconnect", ar: "فك الربط", fr: "Déconnecter" },
  cmds: { en: "In Telegram: /status shows your challenges, /stop turns the alerts off.", ar: "في تيليغرام: ‏/status لعرض تحدياتك، و‏/stop لإيقاف التنبيهات.", fr: "Dans Telegram : /status montre vos challenges, /stop coupe les alertes." },
  only: { en: "Alerts come from MT5 auto-sync: trades imported from reports send none.", ar: "تأتي التنبيهات من مزامنة MT5: الصفقات المستوردة من التقارير لا ترسل تنبيهات.", fr: "Les alertes viennent de la synchro MT5 : les trades importés d'un rapport n'en envoient pas." },
  notDeployed: { en: "Telegram alerts are not set up on the server yet: deploy the \"telegram\" function (Verify JWT off).", ar: "تنبيهات تيليغرام غير مفعّلة على الخادم بعد: انشر الدالة telegram مع إيقاف Verify JWT.", fr: "Les alertes Telegram ne sont pas encore installées : déployez la fonction « telegram » (Verify JWT désactivé)." },
  noToken: { en: "Add your bot's token as the Supabase secret TELEGRAM_BOT_TOKEN.", ar: "أضف رمز البوت كسرّ في Supabase باسم TELEGRAM_BOT_TOKEN.", fr: "Ajoutez le jeton du bot comme secret Supabase TELEGRAM_BOT_TOKEN." },
  badToken: { en: "Telegram refused the bot token: check TELEGRAM_BOT_TOKEN.", ar: "رفض تيليغرام رمز البوت: تحقّق من TELEGRAM_BOT_TOKEN.", fr: "Telegram a refusé le jeton du bot : vérifiez TELEGRAM_BOT_TOKEN." },
  signIn: { en: "Sign in again to manage Telegram alerts.", ar: "سجّل الدخول من جديد لإدارة تنبيهات تيليغرام.", fr: "Reconnectez-vous pour gérer les alertes Telegram." },
  failed: { en: "Could not reach the server. Try again.", ar: "تعذّر الوصول إلى الخادم. حاول مجدداً.", fr: "Serveur injoignable. Réessayez." },
  retry: { en: "Try again", ar: "إعادة المحاولة", fr: "Réessayer" },
} satisfies Record<string, L3>;

type View = { kind: "loading" } | { kind: "error"; error: TgError } | { kind: "ready"; bot: string; linked: boolean; name: string | null; prefs: TgPrefs };
const POLL_MS = 3000, POLL_FOR = 3 * 60e3;

export default function TelegramCard({ lang }: { lang: Lang }) {
  const L = (x: L3) => x[lang];
  const [v, setV] = useState<View>({ kind: "loading" });
  const [url, setUrl] = useState<string | null>(null); // the one-time t.me link while waiting for Start
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const until = useRef(0);

  const load = useCallback(async () => {
    const r = await tgInfo(lang);
    setV("error" in r ? { kind: "error", error: r.error } : { kind: "ready", bot: r.bot, linked: r.linked, name: r.name, prefs: r.prefs });
  }, [lang]);
  useEffect(() => { void load(); }, [load]);

  // after "Connect": watch the settings row until the chat is linked (or the link expires)
  useEffect(() => {
    if (!url) return;
    const id = window.setInterval(async () => {
      if (Date.now() > until.current) { setUrl(null); setNote(L(T.expired)); return; }
      const s = await tgLinked();
      if (s?.linked) { setUrl(null); setNote(null); setV((x) => (x.kind === "ready" ? { ...x, linked: true, name: s.name } : x)); }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (f: () => Promise<unknown>) => { setBusy(true); setNote(null); try { await f(); } finally { setBusy(false); } };
  const connect = () => act(async () => {
    const r = await tgLink(lang);
    if ("error" in r) { setV({ kind: "error", error: r.error }); return; }
    until.current = Date.now() + POLL_FOR;
    setUrl(r.url);
    window.open(r.url, "_blank", "noopener"); // may be blocked after the await: the button below stays as the way in
  });
  const setPref = (p: TgPrefs) => act(async () => {
    if (v.kind !== "ready") return;
    setV({ ...v, prefs: p });
    const r = await tgPrefs(lang, p);
    if ("error" in r) setNote(L(T.failed));
  });
  const test = () => act(async () => { const r = await tgTest(lang); setNote("error" in r ? L(r.error === "notLinked" ? T.expired : T.failed) : L(T.sent)); });
  const unlink = () => act(async () => { const r = await tgUnlink(lang); if ("error" in r) setNote(L(T.failed)); else if (v.kind === "ready") setV({ ...v, linked: false, name: null }); });

  const btn = "rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-text disabled:opacity-50";
  return (
    <section className="rounded-2xl border border-border bg-surface p-5" aria-busy={busy}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-icon"><Send size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="text-sm font-semibold text-icon">{L(T.title)}</h3>
            {v.kind === "ready" && v.linked && (
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-profit opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-profit" /></span>
                {L(T.connected)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{L(T.lead)}</p>
        </div>
      </div>

      {v.kind === "loading" && <div className="mt-4 h-9 w-44 animate-pulse rounded-xl bg-skeleton" />}

      {v.kind === "error" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className={v.error === "unreachable" || v.error === "failed" ? "text-loss" : "text-muted"}>{L(T[v.error === "notLinked" || v.error === "unreachable" ? "failed" : v.error])}</span>
          <button type="button" onClick={() => { setV({ kind: "loading" }); void load(); }} className={btn}>{L(T.retry)}</button>
        </div>
      )}

      {v.kind === "ready" && !v.linked && (
        <div className="mt-4 flex flex-col gap-3">
          {url ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--icon)] bg-primary-tint p-3 text-sm">
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary"><Send size={13} />{L(T.open)}</a>
              <span className="flex items-center gap-2 text-text"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--icon)] border-t-transparent motion-reduce:animate-none" />{L(T.waiting)}</span>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={connect} className="inline-flex items-center gap-1.5 self-start rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"><Send size={15} />{L(T.connect)}</button>
          )}
          <p className="text-xs text-muted">{L(T.only)}</p>
        </div>
      )}

      {v.kind === "ready" && v.linked && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm">{L(T.to).replace("{n}", v.name ?? "Telegram").replace("{b}", v.bot)}</p>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--icon)]" checked={v.prefs.trades} disabled={busy} onChange={(e) => setPref({ ...v.prefs, trades: e.target.checked })} />{L(T.trades)}</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--icon)]" checked={v.prefs.rules} disabled={busy} onChange={(e) => setPref({ ...v.prefs, rules: e.target.checked })} />{L(T.rules)}</label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={test} className={btn}>{L(T.test)}</button>
            <button type="button" disabled={busy} onClick={unlink} className={`${btn} !text-loss hover:border-[var(--loss)]`}>{L(T.off)}</button>
          </div>
          <p className="text-xs text-muted">{L(T.cmds)} {L(T.only)}</p>
        </div>
      )}
      {note && <p className="mt-3 text-xs font-semibold text-icon" aria-live="polite">{note}</p>}
    </section>
  );
}
