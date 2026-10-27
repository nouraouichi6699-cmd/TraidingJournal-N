import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthView from "./components/AuthView";
import { initialSync, startRowSync, haltSync, resumeSync } from "./lib/rowSync";
import { initialSettingsSync, startSettingsSync, settingsIdle } from "./lib/settingsSync";
import { useInterests } from "./useInterests";
import { edgeAlerts, weeklyReport } from "./lib/tradeLab";
import { commonCurrency, fmtMoney, ltrNumbers } from "./lib/money";
import Header from "./components/Header";
import SizeCalc from "./components/SizeCalc";
import Sidebar, { type View } from "./components/Sidebar";
import ConnectAccountModal from "./components/ConnectAccountModal";
import AccountsList from "./components/AccountsList";
import ImportView from "./components/ImportView";
import ChartsView from "./components/ChartsView";
import DashboardView from "./components/DashboardView";
import ReportsView from "./components/ReportsView";
import AdvisorView from "./components/AdvisorView";
import JournalView from "./components/JournalView";
import ChallengeView from "./components/ChallengeView";
import { Watermark } from "./components/Brand";
const StrategiesView = lazy(() => import("./components/StrategiesView"));
import { useJournal } from "./useJournal";
import CalendarView from "./components/CalendarView";
import NewsView from "./components/NewsView";
import ProfileView from "./components/ProfileView";
import { useProfile } from "./useProfile";
import { useAccounts } from "./useAccounts";
import { makeT, type Key } from "./i18n";
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
  useEffect(() => startRowSync(userId), [userId]);
  useEffect(() => startSettingsSync(userId), [userId]);
  const { accounts, add, remove, resolveMt5, setStartBalance } = useAccounts();
  const journal = useJournal();
  // Edge alerts: accounts whose expectancy over the last 20 trades turned negative ring the bell (one notice per losing run).
  const edge = useMemo(() => edgeAlerts(journal.trades, 20).map((a) => {
    const acc = accounts.find((x) => x.id === a.accountId);
    const sub = `${t("notifEdgeSub")} ${fmtMoney(a.exp, { cents: true, currency: acc?.currency })} · ${t("chRollWin")} ${Math.round(a.winRate)}%`;
    // Trade times are wall times (read as UTC): shift so the panel shows them as written in the file.
    return { id: `e:${a.accountId}:${a.key}`, kind: "edge" as const, title: `${t("notifEdge")} · ${acc?.name ?? ""}`, sub: lang === "ar" ? ltrNumbers(sub) : sub, time: a.t + new Date(a.t).getTimezoneOffset() * 60e3, soon: false };
  }), [journal.trades, accounts, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  // Weekly report: the last complete week (Monday to Sunday, close time) in one notice.
  const week = useMemo(() => {
    const w = weeklyReport(journal.trades, Date.now() - new Date().getTimezoneOffset() * 60e3);
    if (!w) return [];
    const cur = commonCurrency(accounts), m = (n: number) => fmtMoney(n, { sign: true, currency: cur });
    const df = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" }), hh = (h: number) => `${String(h).padStart(2, "0")}h`;
    const habit = w.habit ? `${t("notifWeekHabit")}: ${w.habit.kind === "tilt" ? t("chTiltAfter") : w.habit.kind === "session" ? t(w.habit.key as Key) : w.habit.key.replace(/^[^:]+:/, "")} ${m(w.habit.net)}` : "";
    const sub = [`${m(w.net)} · ${w.n} ${t("monthTrades")} · ${t("chRollWin")} ${Math.round(w.winRate)}%`, w.best ? `${t("chBest")} ${hh(w.best.h)} ${m(w.best.net)}` : "",
      w.worst ? `${t("chWorst")} ${hh(w.worst.h)} ${m(w.worst.net)}` : "", habit, w.prevNet != null ? `${t("notifWeekPrev")} ${m(w.prevNet)}` : ""].filter(Boolean).join(" · ");
    return [{ id: `w:${w.week}`, kind: "week" as const, title: `${t("notifWeek")} · ${df.format(new Date(`${w.week}T00:00Z`))} – ${df.format(new Date(w.end))}`, sub: lang === "ar" ? ltrNumbers(sub) : sub, time: w.end + new Date(w.end).getTimezoneOffset() * 60e3, soon: false }];
  }, [journal.trades, accounts, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const trading = useMemo(() => [...edge, ...week], [edge, week]);
  const interests = useInterests(trading);
  const [connecting, setConnecting] = useState(false);
  // A trade to open from the "note" button of a Telegram alert (?trade=<key>): the journal opens it once it has it.
  const [openTrade, setOpenTrade] = useState<string | null>(() => { try { return new URLSearchParams(location.search).get("trade"); } catch { return null; } });
  const tradeOpened = () => {
    setOpenTrade(null);
    try { const u = new URL(location.href); u.searchParams.delete("trade"); history.replaceState(history.state, "", `${u.pathname}${u.search}${u.hash}`); } catch { /* the address keeps it */ }
  };
  const [view, setView] = useState<View | "profile" | "news" | "calendar">(() => (openTrade ? "journal" : "dashboard"));
  // One-shot deep link into Reports (e.g. Charts -> "Open this day" -> Day by Day), consumed when Reports mounts.
  const [reportsNav, setReportsNav] = useState<{ tab: string; day?: string; acc?: string | null } | null>(null);
  const { profile, save: saveProfile } = useProfile();

  return (
    <div className="min-h-screen bg-bg text-text">
      <Header lang={lang} t={t} theme={theme} name={profile.name} avatar={profile.avatar} onLang={setLang} onTheme={setTheme} onProfile={() => setView("profile")} onNews={() => setView("news")} onCalendar={() => setView("calendar")} onDashboard={() => setView("dashboard")} onCharts={() => setView("charts")} interests={interests} calc={<SizeCalc lang={lang} accounts={accounts} trades={journal.trades} balances={journal.balances} flows={journal.flows} />} />
      <div className="flex">
        <Sidebar t={t} lang={lang} view={view} onView={setView} />
        <main className="min-w-0 flex-1 p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              {view === "accounts" && (
                <AccountsList
                  t={t}
                  accounts={accounts}
                  trades={journal.trades}
                  balances={journal.balances}
                  flows={journal.flows}
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
                      await haltSync(); await settingsIdle(); // no background push may re-create rows
                      // Hard delete, children before parents (foreign keys).
                      for (const tbl of ["trades", "balance_points", "accounts", "user_settings"]) {
                        const { error } = await supabase.from(tbl).delete().eq("user_id", userId);
                        // delete() reports no error when RLS matches 0 rows, so count what is left.
                        const left = error ? null : await supabase.from(tbl).select("*", { count: "exact", head: true }).eq("user_id", userId);
                        if (error || left?.error || left?.count) { resumeSync(); window.alert(`${t("deleteFailed")} (${tbl}: ${error?.message ?? left?.error?.message ?? `${left?.count} rows left`})`); return; }
                      }
                      await supabase.auth.signOut();
                      try {
                        Object.keys(localStorage).filter((k) => k.startsWith("mizan-") && k !== "mizan-lang" && k !== "mizan-theme").forEach((k) => localStorage.removeItem(k));
                      } catch { }
                      location.reload();
                    })();
                  }}
                />
              )}
              {view === "calendar" && <CalendarView t={t} lang={lang} interests={interests} />}
              {view === "news" && <NewsView t={t} lang={lang} interests={interests} />}
              {view === "charts" && <ChartsView t={t} lang={lang} accounts={accounts} trades={journal.trades} balances={journal.balances} flows={journal.flows} onOpenDay={(day, acc) => { setReportsNav({ tab: "daybyday", day, acc }); setView("reports"); }} />}
              {view === "dashboard" && <DashboardView t={t} lang={lang} accounts={accounts} trades={journal.trades} flows={journal.flows} />}
              {view === "reports" && <ReportsView nav={reportsNav} onNavDone={() => setReportsNav(null)} t={t} lang={lang} accounts={accounts} trades={journal.trades} balances={journal.balances} onImport={() => setView("import")} flows={journal.flows} onAddFlow={journal.addFlow} onRemoveFlow={journal.removeFlow} />}
              {view === "advisor" && <AdvisorView lang={lang} accounts={accounts} trades={journal.trades} onWhatIf={(acc) => { setReportsNav({ tab: "whatif", acc }); setView("reports"); }} onOpenPath={() => { setReportsNav({ tab: "path" }); setView("reports"); }} />}
              {view === "strategies" && <Suspense fallback={<div className="p-6 text-sm text-muted">{t("loadingData")}</div>}><StrategiesView lang={lang} /></Suspense>}
              {view === "challenges" && <ChallengeView lang={lang} accounts={accounts} trades={journal.trades} balances={journal.balances} flows={journal.flows} onOpenProfile={() => setView("profile")} />}
              {view === "journal" && <JournalView t={t} lang={lang} accounts={accounts} trades={journal.trades} openKey={openTrade} onOpened={tradeOpened} onOpenReport={(tab) => { setReportsNav({ tab }); setView("reports"); }} />}
              {view === "import" && (
                <ImportView t={t} lang={lang} userId={userId} accounts={accounts} journal={journal} resolveMt5={resolveMt5} setStartBalance={setStartBalance} onConnect={() => setConnecting(true)} />
              )}
            </motion.div>
          </AnimatePresence>
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
    } catch { }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    try {
      localStorage.setItem("mizan-lang", lang);
    } catch { }
  }, [lang]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (uid && readyFor !== uid) Promise.all([initialSync(uid), initialSettingsSync(uid)]).finally(() => setReadyFor(uid));
  }, [uid, readyFor]);

  if (session === undefined || (session && readyFor !== session.user.id))
    return <div className="flex min-h-screen items-center justify-center bg-bg text-muted">{t("loadingData")}</div>;
  if (!session) return <AuthView t={t} lang={lang} />;
  return <Main lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} email={session.user.email ?? ""} userId={session.user.id} />;
}
