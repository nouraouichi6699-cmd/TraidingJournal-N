import { useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { supabase } from "../lib/supabase";
import LoginChart, { type LoginChartHandle } from "./LoginChart";
import { languages, type Key } from "../i18n";
import type { Lang } from "../types";

const GOLD = "#C99520"; // the wordmark on white
const GOLD_LINK = "#9A6B12"; // darker, so a link stays readable on white
const GOLD_BTN = "#F5B83D";
const BLACK = "#0b0b0c";
const SHOT = "/login/dashboard.webp";

// Providers are only called once they are listed here, so the buttons can ship before Supabase is set up.
const ENABLED = (import.meta.env.VITE_AUTH_PROVIDERS ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);

const CELEBRATE_MS = 1500;

const pill = "w-full rounded-full border px-4 py-2.5 text-sm outline-none transition";

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
  const chart = useRef<LoginChartHandle | null>(null);
  const form = useRef<HTMLFormElement | null>(null);
  const still = !!useReducedMotion();

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
      chart.current?.reject();
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
    // The session is already in hand and the app is loading behind us: this is only the hand-over.
    chart.current?.success();
    setCelebrating(true);
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
    <div dir="ltr" className="flex min-h-screen flex-col lg:flex-row" style={{ background: BLACK }}>
      {/* The form. On a phone it comes under the chart band; on a desktop it is the left column. */}
      <section
        className={`order-2 flex flex-col justify-center bg-white px-6 py-8 transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)] sm:px-10 lg:order-1 lg:w-2/5 lg:px-12 ${celebrating ? "opacity-0 lg:w-0 lg:overflow-hidden lg:px-0" : "opacity-100"}`}
      >
        <div dir={lang === "ar" ? "rtl" : "ltr"} className="mx-auto w-full max-w-sm">
          {/* The wordmark, in the same three faces as the loading screen. */}
          <div aria-hidden="true" className="flex flex-col items-start" dir="ltr">
            <span style={{ fontFamily: "'Aref Ruqaa', serif", color: GOLD, fontSize: "clamp(28px, 7vw, 40px)", lineHeight: 1.1 }}>ميزان</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 500, color: GOLD, fontSize: 13, letterSpacing: "0.45em" }}>MIZAN</span>
            <span style={{ fontFamily: "'Parisienne', cursive", color: GOLD, fontSize: 15, marginTop: 2 }}>by Nour Aouichi</span>
          </div>

          <h1 className="mt-7 font-heading text-2xl font-bold text-[#141414]">{t("welcomeBack")}</h1>
          <p className="mt-1 text-sm text-[#5d5d5d]">{t("welcomeSub")}</p>

          <form ref={form} onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <label className="text-xs font-semibold text-[#444]" htmlFor="au-email">
              {t("email")}
            </label>
            <input
              id="au-email" className={pill} type="email" required autoComplete="email" value={email}
              onChange={(e) => { setEmail(e.target.value); typed(); }}
              style={{ borderColor: "#dcdcdc", background: "#fafafa", color: "#141414" }}
            />
            <label className="mt-1 text-xs font-semibold text-[#444]" htmlFor="au-password">
              {t("password")}
            </label>
            <input
              id="au-password" className={pill} type="password" required minLength={6}
              autoComplete={mode === "in" ? "current-password" : "new-password"} value={password}
              onChange={(e) => { setPassword(e.target.value); typed(); }}
              style={{ borderColor: "#dcdcdc", background: "#fafafa", color: "#141414" }}
            />

            <button type="button" onClick={soon} className="self-start text-xs font-medium underline-offset-2 hover:underline" style={{ color: GOLD_LINK }}>
              {t("forgotPassword")}
            </button>

            {/* Politely announced, so a screen reader is not interrupted mid-sentence. */}
            <p role="status" aria-live="polite" className="min-h-5 text-xs font-medium" style={{ color: msg?.ok ? GOLD_LINK : "#C0392B" }}>
              {msg?.text ?? ""}
            </p>

            <button
              disabled={busy}
              className="rounded-full px-4 py-3 text-sm font-bold transition disabled:opacity-60"
              style={{ background: GOLD_BTN, color: "#2a1d00" }}
            >
              {mode === "in" ? t("signIn") : t("signUp")}
            </button>
          </form>

          <div aria-hidden="true" className="my-5 flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: "#e4e4e4" }} />
            <span className="text-xs text-[#8b8b8b]">{t("orDivider")}</span>
            <span className="h-px flex-1" style={{ background: "#e4e4e4" }} />
          </div>

          <div className="flex flex-col gap-2.5">
            <button type="button" disabled={busy} onClick={() => void oauth("google")} className={`${pill} flex items-center justify-center gap-2.5 font-medium disabled:opacity-60`} style={{ borderColor: "#dcdcdc", color: "#141414" }}>
              <GoogleMark />{t("withGoogle")}
            </button>
            <button type="button" disabled={busy} onClick={() => void oauth("facebook")} className={`${pill} flex items-center justify-center gap-2.5 font-medium disabled:opacity-60`} style={{ borderColor: "#dcdcdc", color: "#141414" }}>
              <FacebookMark />{t("withFacebook")}
            </button>
          </div>

          <button
            type="button"
            onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}
            className="mt-5 text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: GOLD_LINK }}
          >
            {mode === "in" ? t("noAccount") : t("haveAccount")}
          </button>

          {onLang && (
            <div className="mt-6 flex items-center gap-1.5" dir="ltr">
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

      {/* The black side: the chart, and under it the dashboard. On a phone only the chart band shows. */}
      <section className={`order-1 flex min-h-0 flex-col transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)] lg:order-2 lg:w-3/5 ${celebrating ? "lg:w-full" : ""}`} style={{ background: BLACK }}>
        <div className={`shrink-0 overflow-hidden transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)] lg:h-auto lg:basis-1/3 ${celebrating ? "h-0 opacity-0 lg:basis-0" : "h-[26vh]"}`}>
          <LoginChart ref={chart} still={!!still} />
        </div>
        <div aria-hidden="true" className="hidden min-h-0 flex-1 overflow-hidden lg:block">
          {shot ? (
            <img src={SHOT} alt="" onError={() => setShot(false)} className="h-full w-full object-cover object-left-top" />
          ) : (
            <div className="h-full w-full" style={{ background: "linear-gradient(160deg,#141416,#0b0b0c)" }} />
          )}
        </div>
      </section>
    </div>
  );
}
