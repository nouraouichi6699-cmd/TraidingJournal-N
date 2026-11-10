import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
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
import DashboardView from "./components/DashboardView";
import { Watermark } from "./components/Brand";
import LoadingScreen from "./components/LoadingScreen";
import Ambient from "./components/Ambient";
import { useJournal } from "./useJournal";
import { useProfile } from "./useProfile";
import { loadSettings, OPEN_SETTINGS, readSettings, setActiveTheme, useActiveTheme, useReduceMotion, useSettings as useSettingsHook, type SettingsStart } from "./useSettings";
import { isBuiltIn, resolveTheme } from "./lib/customThemes";
import { setPrivacy } from "./usePrivacy";
import { useAccounts } from "./useAccounts";
import { makeT, type Key } from "./i18n";
import { OPEN_CALCULATOR, OPEN_CHARTS, type CalcNav } from "./useCalculators";
import { publishBotRules } from "./lib/tradeRules";
import { CHANGED } from "./lib/myStrategies";
import { clearEconCacheForUser } from "./lib/econNewsCache";
import type { Lang, Theme } from "./types";

// Every view other than the Dashboard (kept in the main bundle so the first screen never waits on a chunk).
// Each loader is also used directly for idle-time prefetching after sign-in.
const loadAccounts = () => import("./components/AccountsList");
const loadImport = () => import("./components/ImportView");
const loadCharts = () => import("./components/ChartsView");
const loadReports = () => import("./components/ReportsView");
const loadAdvisor = () => import("./components/AdvisorView");
const loadJournal = () => import("./components/JournalView");
const loadChallenges = () => import("./components/ChallengeView");
const loadStrategies = () => import("./components/StrategiesView");
const loadCalendar = () => import("./components/CalendarView");
const loadNews = () => import("./components/NewsView");
const loadProfile = () => import("./components/ProfileView");
const loadSettingsView = () => import("./components/SettingsView");
const loadCalculators = () => import("./components/CalculatorsView");

const AccountsList = lazy(loadAccounts);
const ImportView = lazy(loadImport);
const ChartsView = lazy(loadCharts);
const ReportsView = lazy(loadReports);
const AdvisorView = lazy(loadAdvisor);
const JournalView = lazy(loadJournal);
const ChallengeView = lazy(loadChallenges);
const StrategiesView = lazy(loadStrategies);
const CalendarView = lazy(loadCalendar);
const NewsView = lazy(loadNews);
const ProfileView = lazy(loadProfile);
const SettingsView = lazy(loadSettingsView);
const CalculatorsView = lazy(loadCalculators);

// The views switched to most often once signed in: prefetched in idle time so the first tab switch feels instant.
const PREFETCH_AFTER_SIGNIN = [loadJournal, loadCharts, loadReports];

function idlePrefetch(loaders: (() => Promise<unknown>)[]) {
  const run = () => { loaders.forEach((load) => { void load().catch(() => {}); }); };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(run, { timeout: 4000 });
  else window.setTimeout(run, 2000);
}

/** A lazy view's chunk failed to load (typically a stale tab after a new deploy overwrote the old build's files). */
class ChunkErrorBoundary extends Component<{ t: (k: Key) => string; children?: ReactNode }, { error: boolean }> {
  constructor(props: { t: (k: Key) => string; children?: ReactNode }) {
    super(props);
    this.state = { error: false };
  }

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { t } = this.props;
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-sm text-muted">{t("chunkUpdate")}</p>
        <button type="button" onClick={() => location.reload()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
          {t("chunkReload")}
        </button>
      </div>
    );
  }
}

/** Wraps a lazy view so a failed chunk load shows a reload prompt instead of a blank screen, and a pending one shows the loading skeleton. */
function LazyView({ t, lang, children }: { t: (k: Key) => string; lang: Lang; children: ReactNode }) {
  return (
    <ChunkErrorBoundary t={t}>
      <Suspense fallback={<div className="min-h-[60vh]"><LoadingScreen t={t} lang={lang} variant="compact" /></div>}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T, migrate: Record<string, T> = {}): T => {
  try {
    const raw = localStorage.getItem(key);
    const v = (raw && migrate[raw] ? migrate[raw] : raw) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

class AmbientErrorBoundary extends Component<{ theme: Theme; children?: never }, { error: boolean }> {
  constructor(props: { theme: Theme; children?: never }) {
    super(props);
    this.state = { error: false };
  }

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (this.state.error) return null;
    return <Ambient theme={this.props.theme} />;
  }
}

function Main({ lang, setLang, theme: deviceTheme, setTheme: setDeviceTheme, email, userId }: { lang: Lang; setLang: (l: Lang) => void; theme: Theme; setTheme: (t: Theme) => void; email: string; userId: string }) {
  const t = makeT(lang);
  const appSettings = useSettingsHook();
  const activeId = useActiveTheme();
  const resolved = resolveTheme(activeId, appSettings.customThemes ?? [], deviceTheme);
  const theme = resolved.base;

  useEffect(() => {
    if (theme !== deviceTheme) setDeviceTheme(theme);
  }, [theme, deviceTheme, setDeviceTheme]);

  // If the active custom theme was deleted on another device, fall back to the device theme.
  useEffect(() => {
    if (activeId && !isBuiltIn(activeId)) {
      const ct = (appSettings.customThemes ?? []).find((c) => c.id === activeId);
      if (!ct) setActiveTheme(deviceTheme);
    }
  }, [activeId, appSettings.customThemes, deviceTheme]);

  const handleTheme = (id: string) => {
    if (isBuiltIn(id)) {
      setDeviceTheme(id as Theme);
      setActiveTheme(id);
    } else {
      const ct = (appSettings.customThemes ?? []).find((c) => c.id === id);
      if (ct) {
        setDeviceTheme(ct.base);
        setActiveTheme(id);
      }
    }
  };
  useEffect(() => startRowSync(userId), [userId]);
  useEffect(() => startSettingsSync(userId), [userId]);
  // The rules of the trader's strategies, for the Telegram question under each new trade: sent again on every change.
  useEffect(() => {
    const go = () => void publishBotRules(lang);
    go();
    window.addEventListener(CHANGED, go);
    return () => window.removeEventListener(CHANGED, go);
  }, [lang]);
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
  const [view, setView] = useState<View | "profile" | "news" | "calendar" | "settings">(() => (openTrade ? "journal" : "dashboard"));
  // One-shot deep link into Reports (e.g. Charts -> "Open this day" -> Day by Day), consumed when Reports mounts.
  const [reportsNav, setReportsNav] = useState<{ tab: string; day?: string; acc?: string | null; sub?: string } | null>(null);
  // Where a link into Settings asked to land, e.g. the missing-rate warning pointing at the rates table.
  const [settingsAt, setSettingsAt] = useState<SettingsStart | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      setSettingsAt((e as CustomEvent<SettingsStart>).detail ?? null);
      setView("settings");
    };
    window.addEventListener(OPEN_SETTINGS, on);
    return () => window.removeEventListener(OPEN_SETTINGS, on);
  }, []);
  // Which calculator a link asked for (null: the list), consumed when the Calculators page mounts or is already open.
  const [calcNav, setCalcNav] = useState<{ key: string | null } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      setCalcNav({ key: (e as CustomEvent<CalcNav>).detail?.key ?? null });
      setView("calculators");
    };
    window.addEventListener(OPEN_CALCULATOR, on);
    return () => window.removeEventListener(OPEN_CALCULATOR, on);
  }, []);
  useEffect(() => {
    const on = () => setView("charts");
    window.addEventListener(OPEN_CHARTS, on);
    return () => window.removeEventListener(OPEN_CHARTS, on);
  }, []);
  const { profile, save: saveProfile } = useProfile();
  // Once signed in and settled, warm the most-switched-to views in idle time so the first tab change feels instant.
  useEffect(() => { idlePrefetch(PREFETCH_AFTER_SIGNIN); }, []);

  return (
    <div className="relative min-h-screen bg-bg text-text">
      {/* The light sits over the page colour and under everything else; the wrapper below keeps content on top. */}
      <AmbientErrorBoundary theme={theme} />
      <div className="relative z-10">
      <Header lang={lang} t={t} theme={theme} name={profile.name} avatar={profile.avatar} onLang={setLang} onTheme={handleTheme} onProfile={() => setView("profile")} onSettings={() => { setSettingsAt(null); setView("settings"); }} onNews={() => setView("news")} onCalendar={() => setView("calendar")} onDashboard={() => setView("dashboard")} onCharts={() => setView("charts")} interests={interests} calc={<SizeCalc lang={lang} accounts={accounts} trades={journal.trades} balances={journal.balances} flows={journal.flows} />} />
      <div className="flex">
        <Sidebar t={t} lang={lang} view={view} onView={(v) => { if (v === "calculators") setCalcNav({ key: null }); setView(v); }} />
        <main className="min-w-0 flex-1 p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {view === "accounts" && (
                <LazyView t={t} lang={lang}>
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
                </LazyView>
              )}
              {view === "profile" && (
                <LazyView t={t} lang={lang}>
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
                </LazyView>
              )}
              {view === "settings" && (
                <LazyView t={t} lang={lang}>
                  <SettingsView
                    t={t} lang={lang} theme={theme} onLang={setLang} onTheme={handleTheme}
                    accounts={accounts} trades={journal.trades} onImport={() => setView("import")}
                    onProfile={() => setView("profile")} start={settingsAt}
                  />
                </LazyView>
              )}
              {view === "calendar" && <LazyView t={t} lang={lang}><CalendarView t={t} lang={lang} interests={interests} /></LazyView>}
              {view === "news" && <LazyView t={t} lang={lang}><NewsView t={t} lang={lang} interests={interests} /></LazyView>}
              {view === "calculators" && <LazyView t={t} lang={lang}><CalculatorsView t={t} lang={lang} theme={theme} accounts={accounts} trades={journal.trades} balances={journal.balances} flows={journal.flows} nav={calcNav} onNavDone={() => setCalcNav(null)} /></LazyView>}
              {view === "charts" && <LazyView t={t} lang={lang}><ChartsView t={t} lang={lang} accounts={accounts} trades={journal.trades} balances={journal.balances} flows={journal.flows} onOpenDay={(day, acc) => { setReportsNav({ tab: "daybyday", day, acc }); setView("reports"); }} /></LazyView>}
              {view === "dashboard" && <DashboardView t={t} lang={lang} accounts={accounts} trades={journal.trades} flows={journal.flows} userId={userId} onOpenDay={(day, hotspot) => { setReportsNav({ tab: "daybyday", day, sub: hotspot ? "hotspot" : undefined }); setView("reports"); }} />}
              {view === "reports" && <LazyView t={t} lang={lang}><ReportsView nav={reportsNav} onNavDone={() => setReportsNav(null)} t={t} lang={lang} accounts={accounts} trades={journal.trades} balances={journal.balances} onImport={() => setView("import")} flows={journal.flows} onAddFlow={journal.addFlow} onRemoveFlow={journal.removeFlow} /></LazyView>}
              {view === "advisor" && <LazyView t={t} lang={lang}><AdvisorView lang={lang} accounts={accounts} trades={journal.trades} onWhatIf={(acc) => { setReportsNav({ tab: "whatif", acc }); setView("reports"); }} onOpenPath={() => { setReportsNav({ tab: "path" }); setView("reports"); }} /></LazyView>}
              {view === "strategies" && <LazyView t={t} lang={lang}><StrategiesView lang={lang} t={t} trades={journal.trades} accounts={accounts} onOpenJournal={() => setView("journal")} /></LazyView>}
              {view === "challenges" && <LazyView t={t} lang={lang}><ChallengeView lang={lang} accounts={accounts} trades={journal.trades} balances={journal.balances} flows={journal.flows} onOpenProfile={() => setView("profile")} /></LazyView>}
              {view === "journal" && <LazyView t={t} lang={lang}><JournalView t={t} lang={lang} accounts={accounts} trades={journal.trades} openKey={openTrade} onOpened={tradeOpened} onOpenReport={(tab) => { setReportsNav({ tab }); setView("reports"); }} /></LazyView>}
              {view === "import" && (
                <LazyView t={t} lang={lang}>
                  <ImportView t={t} lang={lang} userId={userId} accounts={accounts} journal={journal} resolveMt5={resolveMt5} setStartBalance={setStartBalance} onConnect={() => setConnecting(true)} />
                </LazyView>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
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
  const reduce = useReduceMotion();

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
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession((prev) => {
        // Sign-out (or switching to a different account): drop this device's cached news so the
        // next person signed in here never sees rows that were fetched for someone else.
        if (prev && prev.user.id && (!s || s.user.id !== prev.user.id)) void clearEconCacheForUser(prev.user.id);
        return s;
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (uid && readyFor !== uid)
      Promise.all([initialSync(uid), initialSettingsSync(uid)]).finally(() => {
        loadSettings(); // a newer copy may have just arrived from another device
        if (readSettings().privacyAtOpen) setPrivacy(true);
        setReadyFor(uid);
      });
  }, [uid, readyFor]);

  // The login screen asks to stay mounted while it plays its sign-in animation. The session and the first sync run
  // underneath it the whole time, so this holds the hand-over back, never the auth call.
  const [holdAuth, setHoldAuth] = useState(false);
  useEffect(() => {
    if (!holdAuth) return;
    // If the screen never says it is finished, let go anyway rather than stay on it.
    const id = window.setTimeout(() => setHoldAuth(false), 4000);
    return () => window.clearTimeout(id);
  }, [holdAuth]);

  // Waiting for the session, or for the first sync of the signed-in user's rows.
  const loading = !holdAuth && (session === undefined || (session !== null && readyFor !== session.user.id));
  const showAuth = session === null || holdAuth;
  return (
    <>
      {showAuth
        ? <AuthView t={t} lang={lang} onLang={setLang} onAttempt={() => setHoldAuth(true)} onDone={() => setHoldAuth(false)} />
        : !loading && session
          ? <Main lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} email={session.user.email ?? ""} userId={session.user.id} />
          : null}
      {/* The page below mounts the moment the data is there and the screen fades off it, so nothing waits on the
          animation. The screen needs nothing of the user's, so the same one covers both waits. */}
      <AnimatePresence>
        {loading && (
          <motion.div key="loading" exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }} className="fixed inset-0 z-50 overflow-hidden">
            <LoadingScreen t={t} lang={lang} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
