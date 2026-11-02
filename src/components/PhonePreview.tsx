// What a Mizan alert looks like on a phone. The chat is drawn in Mizan's own colours on purpose: it is a preview of
// our message, not a picture of Telegram, so none of Telegram's branding or layout is copied.
//
// The wording is the bot's own, per language, taken from supabase/functions/telegram/index.ts and filled with example
// values. Where the real template carries money (a challenge's room, a day's result) the design's sample is used
// instead, because nothing here may show an amount, an account number or a person's name.
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { stT } from "../i18n";
import { useReduceMotion, useSettings } from "../useSettings";
import { DEFAULT_LIGHTING, dur, SWATCH } from "../lib/lighting";
import { SESSION_TRIO } from "../lib/sessionColors";
import { sessionAt } from "../lib/tradingTime";
import type { Lang } from "../types";

type L3 = Record<Lang, string>;
const P = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });

interface Sample {
  /** The preference key this previews, where there is one. */
  id: string;
  chip: L3;
  title: L3;
  body: L3;
  time: string;
  btns?: L3[];
}

const SAMPLES: Sample[] = [
  {
    id: "trades", chip: P("Closed trade", "صفقة مغلقة", "Trade clôturé"),
    title: P("Closed trade · a win", "صفقة مغلقة · رابحة", "Trade clôturé · gagnant"),
    body: P("EURUSD · short · held 42 minutes", "EURUSD · بيع · المدة 42 دقيقة", "EURUSD · vente · tenu 42 minutes"),
    time: "13:05", btns: [P("Add a note", "أضف ملاحظة", "Ajouter une note")],
  },
  {
    // the bot's entry + ask, with the account name left out
    id: "entry", chip: P("In your plan?", "ضمن خطتك؟", "Dans votre plan ?"),
    title: P("📥 new trade GBPUSD long 0.20 (11:47)", "📥 صفقة جديدة GBPUSD شراء 0.20 (11:47)", "📥 nouveau trade GBPUSD long 0.20 (11:47)"),
    body: P("Is it in your plan?", "هل هي ضمن خطتك؟", "Est-il dans votre plan ?"),
    time: "11:47",
    btns: [P("✅ In my plan", "✅ ضمن خطتي", "✅ Dans mon plan"), P("❌ Outside my plan", "❌ خارج خطتي", "❌ Hors de mon plan")],
  },
  {
    id: "danger", chip: P("Danger zone", "منطقة الخطر", "Zone de danger"),
    title: P("⚠️ Danger zone", "⚠️ منطقة الخطر", "⚠️ Zone de danger"),
    body: P("This looks like your worst pattern: NAS100, Thursday, 15:00.", "هذه تشبه أسوأ نمط في سجلك: NAS100، الخميس، 15:00.", "Cela ressemble à votre pire schéma : NAS100, jeudi, 15 h."),
    time: "15:02",
  },
  {
    id: "nosl", chip: P("No stop", "بلا وقف", "Sans stop"),
    title: P("⚠️ XAUUSD long 0.10 has no stop loss", "⚠️ صفقة XAUUSD شراء 0.10 بلا وقف خسارة", "⚠️ XAUUSD long 0.10 sans stop loss"),
    body: P("Open since 14:27.", "مفتوحة منذ 14:27.", "Ouvert depuis 14 h 27."),
    time: "14:32", btns: [P("Stop added", "أضفت الوقف", "Stop ajouté"), P("Remind me later", "ذكّرني لاحقاً", "Me le rappeler")],
  },
  {
    id: "streak", chip: P("3 losses", "3 خسائر", "3 pertes"),
    title: P("🛑 3 losses in a row (NAS100)", "🛑 3 خسائر متتالية (NAS100)", "🛑 3 pertes d'affilée (NAS100)"),
    body: P("Stop and take a break before the next trade.", "توقف وخذ استراحة قبل الصفقة القادمة.", "Arrêtez-vous et faites une pause avant le prochain trade."),
    time: "15:10", btns: [P("I'll take a break", "سآخذ استراحة", "Je fais une pause")],
  },
  {
    id: "stale", chip: P("MT5 stopped", "توقف MT5", "MT5 arrêté"),
    title: P("📡 No sync from MT5 since 15:02", "📡 لم تصل مزامنة من MT5 منذ 15:02", "📡 Aucune synchro MT5 depuis 15 h 02"),
    body: P("Open trades (2). Is MT5 closed or is the computer asleep?", "وما زالت صفقات مفتوحة (2). هل أُغلق MT5 أو نام الحاسوب؟", "Trades ouverts (2). MT5 est-il fermé ou l'ordinateur en veille ?"),
    time: "16:02",
  },
  {
    id: "myRules", chip: P("My rules", "قواعدي", "Mes règles"),
    title: P("❓ Did you break any of your rules (order flow)?", "❓ هل كسرت أيّاً من قواعدك (تدفق الأوامر)؟", "❓ Avez-vous enfreint une de vos règles (order flow) ?"),
    body: P("Tap the ones you broke:", "اضغط على ما كسرته:", "Touchez celles que vous avez enfreintes :"),
    time: "12:20", btns: [P("No", "لا", "Non"), P("Yes", "نعم", "Oui")],
  },
  {
    // the real template names the amount left, so the design's percentage sample stands in for it
    id: "rules", chip: P("Challenges", "التحديات", "Challenges"),
    title: P("🚨 Close to today's loss limit", "🚨 اقتربت من حد الخسارة اليومي", "🚨 Proche de la perte max du jour"),
    body: P("0.4% left before the limit on [challenge].", "بقي 0.4% قبل الحد في [التحدي].", "Il reste 0,4 % avant la limite sur [challenge]."),
    time: "15:40", btns: [P("Stop trading today", "أوقف التداول اليوم", "Arrêter pour aujourd'hui")],
  },
  {
    id: "morning", chip: P("Morning plan", "خطة الصباح", "Plan du matin"),
    title: P("Morning plan", "خطة الصباح", "Plan du matin"),
    body: P("Two high-impact news today · review your rules before the first trade", "خبران قويان اليوم · راجع قواعدك قبل أول صفقة", "Deux annonces majeures aujourd'hui · revoyez vos règles avant le premier trade"),
    time: "08:00", btns: [P("My plan is ready", "خطتي جاهزة", "Mon plan est prêt")],
  },
  {
    id: "daily", chip: P("Day summary", "ملخص اليوم", "Bilan du jour"),
    title: P("📅 Day summary · Thursday", "📅 ملخص اليوم · الخميس", "📅 Bilan du jour · jeudi"),
    body: P("3 trades · 2 wins · 1 break-even · discipline 92/100", "3 صفقات · 2 رابحة · 1 تعادل · الانضباط 92/100", "3 trades · 2 gagnants · 1 neutre · discipline 92/100"),
    time: "22:00",
  },
  {
    id: "weekly", chip: P("Week summary", "ملخص الأسبوع", "Bilan de la semaine"),
    title: P("🗓️ Your week", "🗓️ أسبوعك", "🗓️ Votre semaine"),
    body: P("Best day: Tuesday · most common mistake: entering early", "أفضل يوم: الثلاثاء · أكثر خطأ: دخول مبكر", "Meilleur jour : mardi · erreur la plus fréquente : entrée trop tôt"),
    time: "—", btns: [P("Open the report", "افتح التقرير", "Ouvrir le rapport")],
  },
  {
    id: "news", chip: P("News", "الأخبار", "Annonces"),
    title: P("📰 High-impact news in 15 min", "📰 خبر قوي بعد 15 دقيقة", "📰 Annonce majeure dans 15 min"),
    body: P("USD · consumer price index. Check your open trades and stops.", "USD · مؤشر أسعار المستهلكين. راجع صفقاتك المفتوحة ووقف الخسارة.", "USD · indice des prix à la consommation. Vérifiez vos trades ouverts et vos stops."),
    time: "13:15",
  },
  {
    id: "voice", chip: P("Voice note", "ملاحظة صوتية", "Note vocale"),
    title: P("📝 Note saved with the trade", "📝 حُفظت ملاحظتك مع الصفقة", "📝 Note enregistrée avec le trade"),
    body: P("“I entered before the candle confirmed; next time I wait.”", "«دخلت قبل تأكيد الشمعة، سأنتظر في المرة القادمة»", "« Je suis entré avant la confirmation de la bougie ; la prochaine fois j'attends. »"),
    time: "14:41",
  },
];

export const PREVIEW_IDS = SAMPLES.map((x) => x.id);

/**
 * `highlight` is the preference a lamp has just switched on: the preview jumps to it, drops a banner and gives the
 * phone one short shake. The counter is what makes a second switch of the same lamp replay it.
 */
export default function PhonePreview({ lang, highlight }: { lang: Lang; highlight?: { id: string; n: number } | null }) {
  const L = stT(lang);
  const still = useReduceMotion();
  const [picked, setPicked] = useState("nosl");
  const [shake, setShake] = useState(0);
  const [banner, setBanner] = useState(false);
  const seen = useRef(0);

  useEffect(() => {
    if (!highlight || highlight.n === seen.current) return;
    seen.current = highlight.n;
    if (!SAMPLES.some((x) => x.id === highlight.id)) return;
    setPicked(highlight.id);
    if (still) return;
    setShake((n) => n + 1);
    setBanner(true);
    const id = window.setTimeout(() => setBanner(false), 1600);
    return () => window.clearTimeout(id);
  }, [highlight, still]);

  const cur = SAMPLES.find((x) => x.id === picked) ?? SAMPLES[0];

  // The frame edge carries the light the app is wearing. The screen itself stays plain: it is a message, not a lamp.
  const set = useSettings();
  const light = { ...DEFAULT_LIGHTING, ...(set.lighting ?? {}) };
  const sessTrio = SESSION_TRIO[sessionAt(new Date().getUTCHours(), set.sessionBounds)];
  const fullTint = light.color === "session" ? sessTrio.a
    : light.color === "solid" || light.color === "custom" ? light.solid
      : (SWATCH[light.color] ?? SWATCH.gold);
  const ring =
    light.style === "full" ? fullTint
      : light.style === "police" ? "linear-gradient(90deg, #ff2d55, #2d7bff)"
      : light.color === "rgb" ? "conic-gradient(#ff4d4d, #ffcc33, #33e58c, #33b8ff, #9b5cff, #ff4d4d)"
        : light.color === "custom" ? `linear-gradient(135deg, ${light.custom.a}, ${light.custom.b}, ${light.custom.c})`
          : light.color === "session" ? `linear-gradient(135deg, ${sessTrio.a}, ${sessTrio.b}, ${sessTrio.c})`
            : light.color === "solid" ? light.solid
              : (SWATCH[light.color] ?? "#f2c14e");
  const ringAnim = light.color === "rgb" && light.style !== "police" && light.style !== "full" && !still && light.playing
    ? `mz-hue ${dur(30, light.speed)} linear infinite` : undefined;
  const shakeClass = shake === 0 || still ? "" : shake % 2 ? "mz-shake-a" : "mz-shake-b";

  return (
    <div className="flex flex-col gap-3">
      <div className={`relative mx-auto w-[248px] ${shakeClass}`}>
        {/* The handset: a metal frame, the camera hole, and a plain screen. */}
        {/* The lit edge: a ring cut out of the light's own colour, so only the frame glows. */}
        <div
          className="mz-orb pointer-events-none absolute inset-[-3px] rounded-[2.4rem] p-[3px]"
          style={{
            background: ring, animation: ringAnim,
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor", mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            maskComposite: "exclude", opacity: light.style === "off" ? 0.35 : 0.9,
          }}
        />
        <div
          className="relative rounded-[2.2rem] p-[3px]"
          style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--text) 26%, transparent), color-mix(in srgb, var(--text) 8%, transparent))" }}
        >
          <div className="relative overflow-hidden rounded-[2rem] border border-border" style={{ background: "var(--bg)" }}>
            <div className="flex items-center justify-center pb-1 pt-2.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: "color-mix(in srgb, var(--text) 42%, transparent)" }} />
            </div>

            <div className="flex items-center gap-2 border-b border-border px-3 pb-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-tint text-primary"><Send size={12} /></span>
              <span className="truncate text-[11px] font-semibold">{L("previewBot")}</span>
            </div>

            <div className="relative flex min-h-[260px] flex-col justify-end gap-2 p-3">
              {banner && (
                <div className="mz-banner absolute inset-x-3 top-2 rounded-xl border border-primary/50 px-2.5 py-1.5 text-[10.5px] font-semibold text-primary" style={{ background: "var(--primary-tint)" }}>
                  {L("previewOn")}
                </div>
              )}
              {/* One message bubble, in Mizan's colours rather than any other app's. */}
              <div className="max-w-[88%] rounded-2xl rounded-es-md border border-border p-2.5" style={{ background: "var(--surface)" }}>
                <p className="text-[11.5px] font-semibold leading-snug">{cur.title[lang]}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{cur.body[lang]}</p>
                {cur.btns && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cur.btns.map((b, i) => (
                      <span key={i} className="rounded-lg border border-primary/40 px-2 py-1 text-[10px] font-semibold text-primary">{b[lang]}</span>
                    ))}
                  </div>
                )}
                <p className="tnum mt-1.5 text-end text-[9.5px] text-muted" dir="ltr">{cur.time}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted">{L("previewNote")}</p>

      <div role="radiogroup" aria-label={L("previewPick")} className="flex flex-wrap justify-center gap-1.5">
        {SAMPLES.map((x) => {
          const here = x.id === picked;
          return (
            <button
              key={x.id} type="button" role="radio" aria-checked={here} tabIndex={here ? 0 : -1}
              onClick={() => setPicked(x.id)}
              className={`min-h-[30px] rounded-[10px] px-2 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${here ? "bg-primary font-bold text-on-primary" : "border border-border font-semibold text-primary hover:bg-primary-tint"}`}
            >
              {x.chip[lang]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
