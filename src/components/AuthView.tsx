import { useState } from "react";
import { supabase } from "../lib/supabase";
import Brand from "./Brand";
import type { Key } from "../i18n";
import type { Lang } from "../types";

export default function AuthView({ t, lang }: { t: (k: Key) => string; lang: Lang }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMsg({ text: error.message, ok: false });
    if (mode === "up" && !data.session) setMsg({ text: t("checkEmail"), ok: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg p-4 text-text">
      <Brand lang={lang} />
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <h1 className="font-heading text-xl font-bold">{mode === "in" ? t("signIn") : t("signUp")}</h1>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("email")}
          <input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("password")}
          <input className="field" type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && <p role="alert" className={`text-sm ${msg.ok ? "text-icon" : "text-loss"}`}>{msg.text}</p>}
        <button disabled={busy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-60">
          {mode === "in" ? t("signIn") : t("signUp")}
        </button>
        <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }} className="text-sm text-muted hover:text-text">
          {mode === "in" ? t("noAccount") : t("haveAccount")}
        </button>
      </form>
    </div>
  );
}
