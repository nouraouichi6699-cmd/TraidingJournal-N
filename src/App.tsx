import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthView from "./components/AuthView";
import { pullCloud, useCloudSync } from "./useCloudSync";
import { useInterests } from "./useInterests";
import Header from "./components/Header";
import Sidebar, { type View } from "./components/Sidebar";
import ConnectAccountModal from "./components/ConnectAccountModal";
import AccountsList from "./components/AccountsList";
import ImportView from "./components/ImportView";
import ChartsView from "./components/ChartsView";
import ReportsView from "./components/ReportsView";
import JournalView from "./components/JournalView";
import { Watermark } from "./components/Brand";
import { useJournal } from "./useJournal";
import CalendarView from "./components/CalendarView";
import NewsView from "./components/NewsView";
import ProfileView from "./components/ProfileView";
import { useProfile } from "./useProfile";
import { useAccounts } from "./useAccounts";
import { makeT } from "./i18n";
import type { Lang, Theme } from "./types";

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T, migrate: Record<string, T> = {}): T => {
  try {
    const raw = localStorage.getItem(key);
    const v = (raw && migrate[raw] ? migrate[raw] : raw) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

function Main({ lang, setLang, theme, setTheme, email, userId }: { lang: Lang; setLang: (l: Lang) => void; theme: Theme; setTheme: (t: Theme) => void; email: string; userId: string }) {
  const t = makeT(lang);
  useCloudSync(userId);
  const interests = useInterests();
  const { accounts, add, remove, resolveMt5 } = useAccounts();
  const journal = useJournal();
  const [connecting, setConnecting] = useState(false);
  const [view, setView] = useState<View | "profile" | "news" | "calendar">("dashboard");
  const { profile, save: saveProfile } = useProfile();

  return (
    <div className="min-h-screen bg-bg text-text">
      <Header lang={lang} t={t} theme={theme} name={profile.name} avatar={profile.avatar} onLang={setLang} onTheme={setTheme} onProfile={() => setView("profile")} onNews={() => setView("news")} onCalendar={() => setView("calendar")} interests={interests} />
      <div className="flex">
        <Sidebar t={t} view={view} onView={setView} />
        <main className="min-w-0 flex-1 p-4">
          {view === "accounts" && (
            <AccountsList
              t={t}
              accounts={accounts}
              trades={journal.trades}
              balances={journal.balances}
              onRemove={(id) => {
                remove(id);
                journal.purgeAccount(id);
              }}
              onConnect={() => setConnecting(true)}
            />
          )}
          {view === "profile" && (
            <ProfileView
              email={email}
              key={JSON.stringify(profile)}
              t={t}
              lang={lang}
              profile={profile}
              onSave={saveProfile}
              onDeleteAll={() => {
                void (async () => {
                  await supabase.from("user_data").delete().eq("user_id", userId);
                  await supabase.auth.signOut();
                  try {
                    Object.keys(localStorage).filter((k) => k.startsWith("mizan-") && k !== "mizan-lang" && k !== "mizan-theme").forEach((k) => localStorage.removeItem(k));
                  } catch {}
                  location.reload();
                })();
              }}
            />
          )}
          {view === "calendar" && <CalendarView t={t} lang={lang} interests={interests} />}
          {view === "news" && <NewsView t={t} lang={lang} interests={interests} />}
          {view === "charts" && <ChartsView t={t} lang={lang} accounts={accounts} trades={journal.trades} balances={journal.balances} />}
          {view === "reports" && <ReportsView t={t} lang={lang} accounts={accounts} trades={journal.trades} />}
          {view === "journal" && <JournalView t={t} lang={lang} accounts={accounts} trades={journal.trades} />}
          {view === "import" && (
            <ImportView t={t} accounts={accounts} journal={journal} resolveMt5={resolveMt5} onConnect={() => setConnecting(true)} />
          )}
        </main>
      </div>
      <Watermark feedback={t("feedback")} />
      {connecting && <ConnectAccountModal t={t} onClose={() => setConnecting(false)} onCreate={add} />}
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => read("mizan-lang", ["en", "ar", "fr"], "en"));
  const [theme, setTheme] = useState<Theme>(() => read("mizan-theme", ["dark", "light", "black"], "dark", { cream: "black" }));
  const t = makeT(lang);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [readyFor, setReadyFor] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("mizan-theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    try {
      localStorage.setItem("mizan-lang", lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (uid && readyFor !== uid) pullCloud(uid).finally(() => setReadyFor(uid));
  }, [uid, readyFor]);

  if (session === undefined || (session && readyFor !== session.user.id))
    return <div className="flex min-h-screen items-center justify-center bg-bg text-muted">{t("loadingData")}</div>;
  if (!session) return <AuthView t={t} lang={lang} />;
  return <Main lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} email={session.user.email ?? ""} userId={session.user.id} />;
}
