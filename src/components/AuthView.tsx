import { useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { supabase } from "../lib/supabase";
import LoginChart, { type Anchor, type LoginChartHandle } from "./LoginChart";
import NewsCandle, { type NewsKind } from "./NewsCandle";
import { languages, type Key } from "../i18n";
import type { Lang } from "../types";

const GOLD = "#C99520"; // the wordmark on white
const GOLD_LINK = "#9A6B12"; // darker, so a link stays readable on white
const GOLD_BTN = "#F5B83D";
const BLACK = "#0b0b0c";
const FRAME = "#2c2c2a"; // the window frame around the dashboard picture
const SOFT = "#F3F2EE"; // the light provider pills
const SHOT = "/login/dashboard.webp";

// Providers are only called once they are listed here, so the buttons can ship before Supabase is set up.
const ENABLED = (import.meta.env.VITE_AUTH_PROVIDERS ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);

const CELEBRATE_MS = 1500;
const ERUPT_MS = 350; // the green candle's run to the top, before the panel starts rearranging

const field = "w-full rounded-full border px-4 py-2.5 text-sm outline-none transition placeholder:text-[#9a9a9a] focus:border-[#C99520]";
const provider = "flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition hover:brightness-95 disabled:opacity-60";

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.6 2.2 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.6 7.3l7.7 6c4.5-4.2 6.5-10.2 6.5-17.6z" />
    <path fill="#FBBC05" d="M10.5 28.6a14.6 14.6 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2z" />
    <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.6-5.8l-7.7-6c-2.1 1.4-4.9 2.4-7.9 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

const FacebookMark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.95H15.83c-1.5 0-1.96.93-1.96 1.89v2.27h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
  </svg>
);

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  onLang?: (l: Lang) => void;
  /** Called before the sign-in call, so App keeps this screen mounted through the celebration. */
  onAttempt?: () => void;
  /** Called once this screen is finished with, whether it succeeded or not. */
  onDone?: () => void;
}

export default function AuthView({ t, lang, onLang, onAttempt, onDone }: Props) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [shot, setShot] = useState(true);
  // The giant candle currently on screen, if any. The id restarts it when the same kind fires twice.
  const [shout, setShout] = useState<{ kind: NewsKind; at: Anchor; id: number } | null>(null);
  const shoutId = useRef(0);
  const chart = useRef<LoginChartHandle | null>(null);
  const form = useRef<HTMLFormElement | null>(null);
  const still = !!useReducedMotion();

  // The giant candle starts from wherever the chart has the price right now. Reduced motion skips it entirely.
  const news = (kind: NewsKind) => {
    if (still) return;
    const at = chart.current?.anchor();
    if (at) setShout({ kind, at, id: shoutId.current++ });
  };

  // Restarting the same animation needs the class taken off and put back with a reflow in between.
  const shake = () => {
    const el = form.current;
    if (!el || still) return;
    el.classList.remove("au-shake");
    void el.offsetWidth;
    el.classList.add("au-shake");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    onAttempt?.();
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      news("down");
      shake();
      setMsg({ text: error.message, ok: false });
      onDone?.();
      return;
    }
    if (mode === "up" && !data.session) {
      setMsg({ text: t("checkEmail"), ok: true });
      onDone?.();
      return;
    }
    // The session is already in hand and the app is loading behind us: this is only the hand-over. The candle goes
    // up first and the panel starts rearranging behind it, so the whole thing still takes CELEBRATE_MS.
    news("up");
    window.setTimeout(() => setCelebrating(true), still ? 0 : ERUPT_MS);
    window.setTimeout(() => onDone?.(), still ? 0 : CELEBRATE_MS);
  };

  const soon = () => setMsg({ text: t("comingSoon"), ok: true });

  const oauth = async (provider: "google" | "facebook") => {
    if (!ENABLED.includes(provider)) return soon();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin } });
    if (error) {
      setBusy(false);
      setMsg({ text: error.message, ok: false });
    }
  };

  const typed = () => chart.current?.keystroke();

  return (
    // ltr whatever the language, so the two columns never trade sides; only the text inside the form turns around.
    // The white sits on this root alone: the black panel needs something behind its cut corner, and no other
    // screen should inherit a light background.
    <div dir="ltr" className="flex min-h-screen flex-col bg-white lg:flex-row">
      {/* The form: under the chart band on a phone, the left column on a desktop. It stays put on sign-in. */}
      <section className="order-2 flex flex-col justify-center px-6 py-10 sm:px-10 lg:order-1 lg:w-[42%] lg:px-10">
        <div dir={lang === "ar" ? "rtl" : "ltr"} className="mx-auto flex w-full max-w-[360px] flex-col items-center text-center">
          {/* The wordmark, in the same three faces as the loading screen. */}
          <div aria-hidden="true" className="flex flex-col items-center" dir="ltr">
            <span style={{ fontFamily: "'Aref Ruqaa', serif", color: GOLD, fontSize: "clamp(28px, 7vw, 40px)", lineHeight: 1.15 }}>ميزان</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 500, color: GOLD, fontSize: 13, letterSpacing: "0.45em", paddingInlineStart: "0.45em" }}>MIZAN</span>
            <span style={{ fontFamily: "'Parisienne', cursive", color: GOLD, fontSize: 15, marginTop: 3 }}>by Nour Aouichi</span>
          </div>

          <h1 className="mt-7 font-heading text-2xl font-bold text-[#141414]">{t("welcomeBack")}</h1>
          <p className="mt-1.5 text-sm text-[#5d5d5d]">{t("welcomeSub")}</p>

          <form ref={form} onSubmit={submit} className="mt-7 flex w-full flex-col gap-3">
            {/* The placeholders carry the names on screen; the labels stay for anything that reads the page. */}
            <label className="sr-only" htmlFor="au-email">{t("email")}</label>
            <input
              id="au-email" className={field} type="email" required autoComplete="email" placeholder={t("email")} value={email}
              onChange={(e) => { setEmail(e.target.value); typed(); }}
              style={{ borderColor: "#dcdcdc", background: "#fafafa", color: "#141414" }}
            />
            <label className="sr-only" htmlFor="au-password">{t("password")}</label>
            <input
              id="au-password" className={field} type="password" required minLength={6} placeholder={t("password")}
              autoComplete={mode === "in" ? "current-password" : "new-password"} value={password}
              onChange={(e) => { setPassword(e.target.value); typed(); }}
              style={{ borderColor: "#dcdcdc", background: "#fafafa", color: "#141414" }}
            />

            <button type="button" onClick={soon} className="mx-auto text-xs font-medium underline-offset-2 hover:underline" style={{ color: GOLD_LINK }}>
              {t("forgotPassword")}
            </button>

            {/* Politely announced, so a screen reader is not interrupted mid-sentence. */}
            <p role="status" aria-live="polite" className="min-h-5 text-center text-xs font-medium" style={{ color: msg?.ok ? GOLD_LINK : "#C0392B" }}>
              {msg?.text ?? ""}
            </p>

            <button
              disabled={busy}
              className="w-full rounded-full px-4 py-3 text-sm font-bold transition hover:brightness-95 disabled:opacity-60"
              style={{ background: GOLD_BTN, color: "#2a1d00" }}
            >
              {mode === "in" ? t("signIn") : t("signUp")}
            </button>
          </form>

          <div aria-hidden="true" className="my-5 flex w-full items-center gap-3">
            <span className="h-px flex-1" style={{ background: "#e4e4e4" }} />
            <span className="text-xs text-[#8b8b8b]">{t("orDivider")}</span>
            <span className="h-px flex-1" style={{ background: "#e4e4e4" }} />
          </div>

          {/* Short labels on screen, the full sentence left as the accessible name. */}
          <div className="flex w-full gap-2.5">
            <button type="button" disabled={busy} aria-label={t("withGoogle")} onClick={() => void oauth("google")} className={provider} style={{ background: SOFT, color: "#141414" }}>
              <GoogleMark />Google
            </button>
            <button type="button" disabled={busy} aria-label={t("withFacebook")} onClick={() => void oauth("facebook")} className={provider} style={{ background: SOFT, color: "#141414" }}>
              <FacebookMark />Facebook
            </button>
          </div>

          <button
            type="button"
            onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}
            className="mt-6 text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: GOLD_LINK }}
          >
            {mode === "in" ? t("noAccount") : t("haveAccount")}
          </button>

          {onLang && (
            <div className="mt-6 flex items-center justify-center gap-1.5" dir="ltr">
              {languages.map((l) => (
                <button
                  key={l.code} type="button" onClick={() => onLang(l.code)} aria-pressed={lang === l.code}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
                  style={lang === l.code ? { borderColor: GOLD, background: GOLD, color: "#fff" } : { borderColor: "#dcdcdc", color: "#6b6b6b" }}
                >
                  {l.code.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* The black panel, cut away at its top-left corner on a desktop so the white page shows through there. It
          crops whatever reaches its edges, which is how the window frame below runs off the right and the bottom. */}
      <section className="relative order-1 flex min-h-0 flex-col overflow-hidden lg:order-2 lg:w-[58%] lg:rounded-tl-[56px]" style={{ background: BLACK }}>
        <div className={`shrink-0 overflow-hidden transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)] lg:ms-10 lg:mt-8 lg:h-auto lg:basis-1/3 ${celebrating ? "h-0 opacity-0 lg:basis-0" : "h-[24vh]"}`}>
          <LoginChart ref={chart} still={still} />
        </div>
        {/* The dashboard sits in a window frame larger than the room left for it, so the panel crops two of its
            sides. On sign-in the chart above gives up its height, which lifts the frame as it grows. */}
        <div aria-hidden="true" className="relative hidden min-h-0 flex-1 lg:block">
          <div
            className={`absolute left-10 top-6 flex h-[calc(100%+140px)] w-[calc(100%+160px)] flex-col overflow-hidden rounded-2xl border transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] ${celebrating ? "scale-[1.04]" : ""}`}
            style={{ borderColor: FRAME, background: "#0e0e10" }}
          >
            <div className="flex shrink-0 items-center gap-1.5 px-4 py-3" style={{ borderBottom: `1px solid ${FRAME}` }}>
              {[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: "#3b3b38" }} />)}
            </div>
            <div className="min-h-0 flex-1">
              {shot ? (
                <img src={SHOT} alt="" onError={() => setShot(false)} className="h-full w-full object-cover object-left-top" />
              ) : (
                <div className="h-full w-full" style={{ background: "linear-gradient(160deg,#141416,#0b0b0c)" }} />
              )}
            </div>
          </div>
        </div>
        {/* The giant candle covers the whole panel, so it can run past the chart band and over the frame. On a phone
            the panel is only as tall as the band, which keeps it well clear of the form. */}
        {shout && <NewsCandle key={shout.id} kind={shout.kind} at={shout.at} onDone={() => setShout(null)} />}
      </section>
    </div>
  );
}
