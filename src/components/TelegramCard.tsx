// Profile › Telegram alerts: link a Telegram chat to the account, choose what is sent, test, unlink.
import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { Lang } from "../types";
import { TG_COACH, TG_PREFS, tgCoachInvite, tgCoachPrefs, tgCoachRemove, tgInfo, tgLink, tgLinked, tgPartnerInvite, tgPartnerRemove, tgPrefs, tgTest, tgUnlink, tgWatcherNow, type TgCoach, type TgCoachPrefs, type TgError, type TgPartner, type TgPrefs, type TgRole } from "../lib/telegram";

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
  streak: { en: "3 losses in a row: take a break", ar: "ثلاث خسائر متتالية: خذ استراحة", fr: "3 pertes d'affilée : faites une pause" },
  nosl: { en: "Open trade without a stop loss", ar: "صفقة مفتوحة بلا وقف خسارة", fr: "Trade ouvert sans stop loss" },
  stale: { en: "MT5 stopped syncing with open trades", ar: "توقف مزامنة MT5 وعندك صفقات مفتوحة", fr: "Synchro MT5 arrêtée avec des trades ouverts" },
  daily: { en: "Day summary, after the market's midnight", ar: "ملخص اليوم بعد منتصف ليل السوق", fr: "Bilan du jour, après minuit du marché" },
  weekly: { en: "Week summary on Sunday, with a tip", ar: "ملخص الأسبوع يوم الأحد مع نصيحة", fr: "Bilan de la semaine le dimanche, avec un conseil" },
  news: { en: "High-impact news 15 minutes ahead", ar: "الأخبار القوية قبل ربع ساعة", fr: "Annonces majeures 15 minutes avant" },
  entry: { en: "New trade: is it in your plan?", ar: "صفقة جديدة: هل هي ضمن خطتك؟", fr: "Nouveau trade : est-il dans votre plan ?" },
  danger: { en: "Danger zone, from your own history", ar: "منطقة الخطر من سجلك", fr: "Zone de danger, d'après votre historique" },
  morning: { en: "Morning plan for your challenges (08:00)", ar: "خطة الصباح لتحدياتك (الثامنة صباحاً)", fr: "Plan du matin pour vos challenges (8 h)" },
  pTitle: { en: "Accountability partner", ar: "شريك الالتزام", fr: "Partenaire de discipline" },
  pWhat: { en: "A friend gets a short message, with no amounts, when you leave a trade without a stop loss, trade on after 3 losses in a row, or open a trade after a challenge's daily loss limit.", ar: "يصل صديقك تنبيه قصير دون مبالغ إذا تركت صفقة بلا وقف خسارة، أو واصلت التداول بعد ثلاث خسائر متتالية، أو فتحت صفقة بعد بلوغ حد الخسارة اليومي في تحدٍّ.", fr: "Un ami reçoit un court message, sans montants, quand vous laissez un trade sans stop loss, continuez après 3 pertes d'affilée ou ouvrez un trade après la limite de perte du jour d'un challenge." },
  pInvite: { en: "Invite a partner", ar: "دعوة شريك", fr: "Inviter un partenaire" },
  pCopy: { en: "Copy", ar: "نسخ", fr: "Copier" },
  pCopied: { en: "Copied ✓", ar: "نُسخ ✓", fr: "Copié ✓" },
  pSend: { en: "Send this link to your partner in Telegram. It works once, for 7 days.", ar: "أرسل هذا الرابط لشريكك في تيليغرام. يعمل مرة واحدة خلال 7 أيام.", fr: "Envoyez ce lien à votre partenaire dans Telegram. Il marche une fois, pendant 7 jours." },
  pWait: { en: "Waiting for your partner to accept…", ar: "في انتظار موافقة شريكك…", fr: "En attente de l'accord de votre partenaire…" },
  pClosed: { en: "The invite was declined or has expired.", ar: "رُفضت الدعوة أو انتهت صلاحيتها.", fr: "L'invitation a été refusée ou a expiré." },
  pIs: { en: "Your partner: {n}", ar: "شريكك: {n}", fr: "Votre partenaire : {n}" },
  pEnd: { en: "End the partnership", ar: "إنهاء الشراكة", fr: "Mettre fin au partenariat" },
  cTitle: { en: "Coach", ar: "المدرّب", fr: "Coach" },
  cWhat: { en: "Your coach gets, with no amounts, your discipline score each day and an alert when you break a rule. One coach can follow many traders.", ar: "يصل مدرّبك، دون أي مبالغ، درجة انضباطك كل يوم وتنبيه عندما تكسر قاعدة. يستطيع المدرّب الواحد متابعة عدة متداولين.", fr: "Votre coach reçoit, sans montants, votre note de discipline chaque jour et une alerte quand vous enfreignez une règle. Un coach peut suivre plusieurs traders." },
  cInvite: { en: "Invite a coach", ar: "دعوة مدرّب", fr: "Inviter un coach" },
  cSend: { en: "Send this link to your coach in Telegram. It works once, for 7 days.", ar: "أرسل هذا الرابط لمدرّبك في تيليغرام. يعمل مرة واحدة خلال 7 أيام.", fr: "Envoyez ce lien à votre coach dans Telegram. Il marche une fois, pendant 7 jours." },
  cWait: { en: "Waiting for your coach to accept…", ar: "في انتظار موافقة مدرّبك…", fr: "En attente de l'accord de votre coach…" },
  cIs: { en: "Your coach: {n}", ar: "مدرّبك: {n}", fr: "Votre coach : {n}" },
  cEnd: { en: "End the coaching", ar: "إنهاء التدريب", fr: "Mettre fin au coaching" },
  cGets: { en: "Your coach gets:", ar: "يصل مدرّبك:", fr: "Votre coach reçoit :" },
  c_nosl: { en: "A trade without a stop loss", ar: "صفقة بلا وقف خسارة", fr: "Un trade sans stop loss" },
  c_streak: { en: "Trading on after 3 losses in a row", ar: "مواصلة التداول بعد 3 خسائر متتالية", fr: "Continuer après 3 pertes d'affilée" },
  c_limit: { en: "A new trade after the daily loss limit", ar: "صفقة جديدة بعد حد الخسارة اليومي", fr: "Un nouveau trade après la limite du jour" },
  c_daily: { en: "The daily discipline score", ar: "درجة الانضباط اليومية", fr: "La note de discipline du jour" },
  only: { en: "Trade alerts come from MT5 auto-sync; the summaries and news use all your trades.", ar: "تنبيهات الصفقات تأتي من مزامنة MT5، أما الملخصات والأخبار فتشمل كل صفقاتك.", fr: "Les alertes de trades viennent de la synchro MT5 ; les bilans et annonces utilisent tous vos trades." },
  notDeployed: { en: "Telegram alerts are not set up on the server yet: deploy the \"telegram\" function (Verify JWT off).", ar: "تنبيهات تيليغرام غير مفعّلة على الخادم بعد: انشر الدالة telegram مع إيقاف Verify JWT.", fr: "Les alertes Telegram ne sont pas encore installées : déployez la fonction « telegram » (Verify JWT désactivé)." },
  noToken: { en: "Add your bot's token as the Supabase secret TELEGRAM_BOT_TOKEN.", ar: "أضف رمز البوت كسرّ في Supabase باسم TELEGRAM_BOT_TOKEN.", fr: "Ajoutez le jeton du bot comme secret Supabase TELEGRAM_BOT_TOKEN." },
  badToken: { en: "Telegram refused the bot token: check TELEGRAM_BOT_TOKEN.", ar: "رفض تيليغرام رمز البوت: تحقّق من TELEGRAM_BOT_TOKEN.", fr: "Telegram a refusé le jeton du bot : vérifiez TELEGRAM_BOT_TOKEN." },
  signIn: { en: "Sign in again to manage Telegram alerts.", ar: "سجّل الدخول من جديد لإدارة تنبيهات تيليغرام.", fr: "Reconnectez-vous pour gérer les alertes Telegram." },
  failed: { en: "Could not reach the server. Try again.", ar: "تعذّر الوصول إلى الخادم. حاول مجدداً.", fr: "Serveur injoignable. Réessayez." },
  retry: { en: "Try again", ar: "إعادة المحاولة", fr: "Réessayer" },
} satisfies Record<string, L3>;

type View = { kind: "loading" } | { kind: "error"; error: TgError } | { kind: "ready"; bot: string; linked: boolean; name: string | null; prefs: TgPrefs; partner: TgPartner | null; coach: TgCoach | null };
const POLL_MS = 3000, POLL_FOR = 3 * 60e3;
const ROLE = {
  partner: { icon: "🤝", title: T.pTitle, what: T.pWhat, invite: T.pInvite, send: T.pSend, wait: T.pWait, is: T.pIs, end: T.pEnd, make: tgPartnerInvite, remove: tgPartnerRemove },
  coach: { icon: "🎓", title: T.cTitle, what: T.cWhat, invite: T.cInvite, send: T.cSend, wait: T.cWait, is: T.cIs, end: T.cEnd, make: tgCoachInvite, remove: tgCoachRemove },
};

/** The accountability partner or the coach: invite (a one-time link, watched until accepted), who it is, end it; the
 *  coach also shows what they get. */
function Watcher({ role, lang, person, busy, act, onPerson, onNote, btn }: { role: TgRole; lang: Lang; person: TgPartner | TgCoach | null; busy: boolean; act: (f: () => Promise<unknown>) => Promise<void>; onPerson: (p: TgPartner | TgCoach | null) => void; onNote: (n: string | null) => void; btn: string }) {
  const L = (x: L3) => x[lang], R = ROLE[role];
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const until = useRef(0);
  useEffect(() => {
    if (!invite) return;
    const id = window.setInterval(async () => {
      if (Date.now() > until.current) { setInvite(null); return; }
      const s = await tgWatcherNow(role);
      if (s?.person) { setInvite(null); onPerson(s.person); }
      else if (s && !s.pending) { setInvite(null); onNote(L(T.pClosed)); }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [invite]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => act(async () => {
    const r = await R.make(lang);
    if ("error" in r) { onNote(L(T.failed)); return; }
    until.current = Date.now() + 15 * 60e3;
    setCopied(false);
    setInvite(r.url);
  });
  const copy = async () => { if (!invite) return; try { await navigator.clipboard.writeText(invite); setCopied(true); } catch { /* the field stays selectable */ } };
  const end = () => act(async () => { const r = await R.remove(lang); if ("error" in r) onNote(L(T.failed)); else onPerson(null); });
  const coach = role === "coach" && person && "prefs" in person ? person : null;
  const setPref = (p: TgCoachPrefs) => act(async () => { if (!coach) return; onPerson({ ...coach, prefs: p }); const r = await tgCoachPrefs(lang, p); if ("error" in r) onNote(L(T.failed)); });
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-sm font-semibold">{R.icon} {L(R.title)}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{L(R.what)}</p>
      {person ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span>{L(R.is).replace("{n}", person.name ?? "—")}</span>
            <button type="button" disabled={busy} onClick={end} className={`${btn} !text-loss hover:border-[var(--loss)]`}>{L(R.end)}</button>
          </div>
          {coach && (
            <div className="mt-2">
              <p className="text-xs text-muted">{L(T.cGets)}</p>
              <div className="mt-1 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {(Object.keys(TG_COACH) as (keyof TgCoachPrefs)[]).map((k) => (
                  <label key={k} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-[var(--icon)]" checked={coach.prefs[k]} disabled={busy} onChange={(e) => setPref({ ...coach.prefs, [k]: e.target.checked })} />{L(T[`c_${k}`])}</label>
                ))}
              </div>
            </div>
          )}
        </>
      ) : invite ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={invite} dir="ltr" aria-label={L(R.invite)} onFocus={(e) => e.target.select()} className="field min-w-0 flex-1 text-xs" />
            <button type="button" onClick={copy} className={btn}>{L(copied ? T.pCopied : T.pCopy)}</button>
          </div>
          <p className="text-xs text-muted">{L(R.send)}</p>
          <span className="flex items-center gap-2 text-xs text-text"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--icon)] border-t-transparent motion-reduce:animate-none" />{L(R.wait)}</span>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={start} className={`${btn} mt-2`}>{L(R.invite)}</button>
      )}
    </div>
  );
}

export default function TelegramCard({ lang }: { lang: Lang }) {
  const L = (x: L3) => x[lang];
  const [v, setV] = useState<View>({ kind: "loading" });
  const [url, setUrl] = useState<string | null>(null); // the one-time t.me link while waiting for Start
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const until = useRef(0);

  const load = useCallback(async () => {
    const r = await tgInfo(lang);
    setV("error" in r ? { kind: "error", error: r.error } : { kind: "ready", bot: r.bot, linked: r.linked, name: r.name, prefs: { ...TG_PREFS, ...r.prefs }, partner: r.partner ?? null, coach: r.coach ?? null });
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
  const unlink = () => act(async () => { const r = await tgUnlink(lang); if ("error" in r) setNote(L(T.failed)); else if (v.kind === "ready") setV({ ...v, linked: false, name: null, partner: null, coach: null }); });

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
          <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {(Object.keys(TG_PREFS) as (keyof TgPrefs)[]).map((k) => (
              <label key={k} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-[var(--icon)]" checked={v.prefs[k]} disabled={busy} onChange={(e) => setPref({ ...v.prefs, [k]: e.target.checked })} />{L(T[k])}</label>
            ))}
          </div>
          <Watcher role="partner" lang={lang} person={v.partner} busy={busy} act={act} onPerson={(p) => setV((x) => (x.kind === "ready" ? { ...x, partner: p } : x))} onNote={setNote} btn={btn} />
          <Watcher role="coach" lang={lang} person={v.coach} busy={busy} act={act} onPerson={(p) => setV((x) => (x.kind === "ready" ? { ...x, coach: p && "prefs" in p ? p : null } : x))} onNote={setNote} btn={btn} />
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
