import { useEffect, useState } from "react";
import Header from "./components/Header";
import Sidebar, { type View } from "./components/Sidebar";
import ConnectAccountModal from "./components/ConnectAccountModal";
import AccountsList from "./components/AccountsList";
import { useAccounts } from "./useAccounts";
import { makeT } from "./i18n";
import type { Lang, Theme } from "./types";

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

export default function App() {
  const [lang, setLang] = useState<Lang>(() => read("mizan-lang", ["en", "ar", "fr"], "en"));
  const [theme, setTheme] = useState<Theme>(() => read("mizan-theme", ["dark", "light", "cream"], "dark"));
  const t = makeT(lang);
  const { accounts, add, remove } = useAccounts();
  const [connecting, setConnecting] = useState(false);
  const [view, setView] = useState<View>("dashboard");

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

  return (
    <div className="min-h-screen bg-bg text-text">
      <Header lang={lang} t={t} theme={theme} onLang={setLang} onTheme={setTheme} onConnect={() => setConnecting(true)} />
      <div className="flex">
        <Sidebar t={t} view={view} onView={setView} />
        <main className="min-w-0 flex-1 p-4">
          {view === "accounts" && (
            <AccountsList t={t} accounts={accounts} onRemove={remove} onConnect={() => setConnecting(true)} />
          )}
        </main>
      </div>
      {connecting && <ConnectAccountModal t={t} onClose={() => setConnecting(false)} onCreate={add} />}
    </div>
  );
}
