import { useEffect, useMemo, useState } from "react";
import { metrics } from "../lib/dashStats";
import { Wallet, Route, Waypoints, FlaskConical, Briefcase, GitCompareArrows, LayoutDashboard, Activity as ActIcon, CalendarDays, Clock, Flame, Layers, TrendingDown, TrendingUp, Info, Scale, Repeat, BarChart3, Gauge } from "lucide-react";
import { computeActivity } from "../lib/activity";
import { computeOverview } from "../lib/stats";
import { computeReturnsCapital } from "../lib/returnsCapital";
import { signed, type CashFlow } from "../lib/cashflow";
import { commonCurrency } from "../lib/money";
import { currentBalance, ledgerReconciles } from "../lib/balance";
import OverviewTab from "./OverviewTab";
import TradeOutcomesTab from "./TradeOutcomesTab";
import BenchmarkTab, { BENCH_TAB } from "./BenchmarkTab";
import DayByDayTab, { DAY_TAB } from "./DayByDayTab";
import PathTab, { PATH_TAB } from "./PathTab";
import ReturnsTab, { RET_TAB } from "./ReturnsTab";
import AdvancedTab, { ADV_TAB } from "./AdvancedTab";
import PortfolioTab, { PORTFOLIO_TAB } from "./PortfolioTab";
import { computeTradeOutcomes, recentOutcomes } from "../lib/tradeOutcomes";
import { toT } from "../i18n";
import { ovT } from "../i18n";
import type { Key } from "../i18n";
import type { Account, BalancePoint, Lang, Trade } from "../types";

interface Props { nav?: { tab: string; day?: string; acc?: string | null } | null; onNavDone?: () => void; t: (k: Key) => string; lang: Lang; accounts: Account[]; trades: Trade[]; balances: Record<string, BalancePoint[]>; onImport?: () => void; flows?: CashFlow[]; onAddFlow?: (f: Omit<CashFlow, "id">) => void; onRemoveFlow?: (id: string) => void }
type L = Record<Lang, string>;
const X = (en: string, ar: string, fr: string): L => ({ en, ar, fr });

const TX = {
  tab: X("Activity & Behaviour", "النشاط والسلوك", "Activité & comportement"),
  all: X("All accounts", "كل الحسابات", "Tous les comptes"),
  pAll: X("All time", "كل الفترات", "Tout"), p1: X("Last month", "آخر شهر", "Dernier mois"), p3: X("Last 3 months", "آخر 3 أشهر", "3 derniers mois"), p12: X("Last year", "آخر سنة", "Dernière année"),
  empty: X("No trades with entry times yet.", "لا توجد صفقات بأوقات دخول بعد.", "Aucun trade avec heure d'entrée."),
  days: X("Trading days", "أيام التداول", "Jours de trading"), daysI: X("Distinct days on which you opened at least one trade.", "عدد الأيام المختلفة التي فتحتَ فيها صفقة واحدة على الأقل.", "Jours distincts avec au moins un trade."),
  elig: X("Eligible calendar days", "أيام التقويم المؤهلة", "Jours calendaires éligibles"), eligI: X("Mon–Fri days between your first and last trade.", "أيام الإثنين–الجمعة بين أول صفقة وآخر صفقة.", "Jours lun–ven entre le premier et le dernier trade."),
  freq: X("Active-day frequency", "نسبة الأيام النشطة", "Fréquence des jours actifs"), freqI: X("Trading days ÷ eligible days.", "أيام التداول ÷ الأيام المؤهلة.", "Jours de trading ÷ jours éligibles."),
  pd: X("Avg trades / trading day", "متوسط الصفقات / يوم", "Trades moy. / jour"), pw: X("Avg trades / week", "متوسط الصفقات / أسبوع", "Trades moy. / semaine"), pm: X("Avg trades / month", "متوسط الصفقات / شهر", "Trades moy. / mois"),
  md: X("Max trades in one day", "أكثر صفقات في يوم", "Max trades en un jour"),
  wd: X("Most active weekday", "أنشط يوم في الأسبوع", "Jour le plus actif"), hr: X("Most active hour", "أنشط ساعة", "Heure la plus active"), hrI: X("Entry hour as recorded in your trade times.", "ساعة الدخول كما هي مسجلة في أوقات صفقاتك.", "Heure d'entrée telle qu'enregistrée."),
  tv: X("Total volume", "إجمالي الحجم", "Volume total"), av: X("Average trade volume", "متوسط حجم الصفقة", "Volume moyen"), mv: X("Maximum trade volume", "أكبر حجم صفقة", "Volume max"),
  lg: X("Long trades", "صفقات الشراء", "Trades long"), sh: X("Short trades", "صفقات البيع", "Trades short"), ratio: X("Long-to-short ratio", "نسبة الشراء إلى البيع", "Ratio long/short"),
  byWd: X("Trades by weekday", "الصفقات حسب اليوم", "Trades par jour"), byHr: X("Trades by hour", "الصفقات حسب الساعة", "Trades par heure"), heat: X("Daily activity", "النشاط اليومي", "Activité quotidienne"),
  split: X("Direction split", "توزيع الاتجاه", "Répartition"), trades: X("trades", "صفقة", "trades"), vol: X("Volume", "الحجم", "Volume"), cons: X("Consistency", "الانتظام", "Régularité"),
} satisfies Record<string, L>;

const fmtN = (n: number, d = 2) => n.toLocaleString("en", { maximumFractionDigits: d });

function Kpi({ icon, label, value, sub, info, hero }: { icon: React.ReactNode; label: string; value: string; sub?: string; info?: string; hero?: boolean }) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-primary/50 ${hero ? "ring-1 ring-primary/30" : ""}`}>
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary-tint opacity-60 blur-2xl" />
      <div className="relative flex items-center justify-between">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-tint text-icon">{icon}</span>
        {info && (
          <span className="relative">
            <Info size={14} className="cursor-help text-muted" />
            <span className="pointer-events-none absolute end-0 top-5 z-20 hidden w-52 rounded-lg border border-border bg-bg p-2 text-[11px] leading-snug text-muted shadow-xl group-hover:block">{info}</span>
          </span>
        )}
      </div>
      <div className="relative mt-3 text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tnum relative mt-0.5 font-heading text-2xl font-bold text-primary">{value}</div>
      {sub && <div className="relative text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function Bars({ data, labels, peak, h = 130 }: { data: number[]; labels: string[]; peak: number; h?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div dir="ltr" className="flex items-end gap-1" style={{ height: h + 22 }}>
      {data.map((v, i) => (
        <div key={i} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
          <span className="tnum pointer-events-none absolute -top-1 hidden -translate-y-full rounded bg-bg px-1.5 py-0.5 text-[10px] text-text shadow group-hover:block">{v}</span>
          <div className="w-full rounded-t-md transition-all" style={{ height: Math.max((v / max) * h, v ? 3 : 1), background: i === peak ? "linear-gradient(180deg,var(--primary),color-mix(in srgb,var(--primary) 55%,transparent))" : "color-mix(in srgb,var(--primary) 28%,transparent)", boxShadow: i === peak ? "0 0 14px color-mix(in srgb,var(--primary) 45%,transparent)" : undefined }} />
          <span className="mt-1 h-4 text-[10px] text-muted">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-surface p-5"><div className="mb-4 font-heading text-sm font-semibold text-text">{title}</div>{children}</div>;
}

export default function ReportsView({ nav, onNavDone, t, lang, accounts, trades, balances, onImport, flows = [], onAddFlow, onRemoveFlow }: Props) {
  const [tab, setTab] = useState(nav?.tab ?? "overview");
  const [acc, setAcc] = useState(nav?.acc && accounts.some((a) => a.id === nav.acc) ? nav.acc : "all");
  const [focusDay] = useState(nav?.day); // deep link from Charts ("Open this day")
  useEffect(() => { if (nav) onNavDone?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [per, setPer] = useState("all");
  const L = (k: L) => k[lang];
  const TABS = [{ id: "overview", icon: <LayoutDashboard size={15} />, label: ovT(lang)("tab") }, { id: "outcomes", icon: <Scale size={15} />, label: toT(lang)("tab") }, { id: "returns", icon: <Wallet size={15} />, label: RET_TAB[lang === "en" ? 0 : lang === "ar" ? 1 : 2] }, { id: "benchmark", icon: <GitCompareArrows size={15} />, label: BENCH_TAB[lang === "en" ? 0 : lang === "ar" ? 1 : 2] }, { id: "portfolio", icon: <Briefcase size={15} />, label: PORTFOLIO_TAB[lang === "en" ? 0 : lang === "ar" ? 1 : 2] }, { id: "advanced", icon: <FlaskConical size={15} />, label: ADV_TAB[lang === "en" ? 0 : lang === "ar" ? 1 : 2] }, { id: "path", icon: <Route size={15} />, label: PATH_TAB[lang === "en" ? 0 : lang === "ar" ? 1 : 2] }, { id: "daybyday", icon: <CalendarDays size={15} />, label: DAY_TAB[lang === "en" ? 0 : lang === "ar" ? 1 : 2] }, { id: "activity", icon: <ActIcon size={15} />, label: L(TX.tab) }];

  // Period start (YYYY-MM-DD), "" for all time. One cut-off for trades, cash flows and balance history.
  const cut = useMemo(() => {
    if (per === "all") return "";
    const d = new Date(); d.setMonth(d.getMonth() - (per === "p1" ? 1 : per === "p3" ? 3 : 12));
    return d.toISOString().slice(0, 10);
  }, [per]);
  const list = useMemo(() => {
    const r = acc === "all" ? trades : trades.filter((x) => x.accountId === acc);
    return cut ? r.filter((x) => (x.exitTime || x.entryTime || "").slice(0, 10) >= cut) : r; // realised P&L belongs to its close date, as on the Dashboard and Charts
  }, [trades, acc, cut]);
  // Trades of the selected accounts that fall before the selected period (needed for the period's starting balance).
  const before = useMemo(() => {
    if (per === "all") return [] as Trade[];
    const inList = new Set(list.map((x) => x.key));
    return (acc === "all" ? trades : trades.filter((x) => x.accountId === acc)).filter((x) => !inList.has(x.key));
  }, [trades, list, acc, per]);
  const a = useMemo(() => computeActivity(list), [list]);
  const startBal = useMemo(() => accounts.filter((x) => acc === "all" || x.id === acc).reduce((n, x) => n + (x.startBalance || 0), 0), [accounts, acc]);
  // Cash flows of the selected accounts, split at the same period cut-off as the trades (flow date >= cut-off = in period).
  const accFlows = useMemo(() => flows.filter((f) => acc === "all" || f.accountId === acc), [flows, acc]);
  // The deposit/withdrawal ledger is known when, for every selected account, either its imported balance history reconciles
  // with start + P&L + recorded flows (nothing missing, so zeros are real), or it has no history and some flows were recorded.
  const cashKnown = useMemo(() => {
    const sel = accounts.filter((x) => acc === "all" || x.id === acc);
    return sel.length > 0 && sel.every((a) => { const r = ledgerReconciles(a, trades, balances[a.id] ?? [], flows); return r ?? flows.some((f) => f.accountId === a.id); });
  }, [accounts, acc, trades, balances, flows]);
  const flowSplit = useMemo(() => ({ ...(cut ? { before: accFlows.filter((f) => f.t < cut), period: accFlows.filter((f) => f.t >= cut) } : { before: [] as CashFlow[], period: accFlows }), known: cashKnown }), [accFlows, cut, cashKnown]);
  const currency = useMemo(() => commonCurrency(acc === "all" ? accounts : accounts.filter((x) => x.id === acc)), [accounts, acc]); // null when currencies are mixed
  // Current balance: the same per-account figure as the Accounts cards (imported history first, else ledger); unknown without a start balance or history.
  const currentNow = useMemo(() => {
    const sel = acc === "all" ? accounts : accounts.filter((x) => x.id === acc);
    if (!sel.length || !sel.every((a) => a.startBalance > 0 || (balances[a.id]?.length ?? 0) > 0)) return null;
    return sel.reduce((s, a) => s + currentBalance(a, trades, balances[a.id] ?? [], flows), 0);
  }, [accounts, acc, trades, balances, flows]);
  const rc = useMemo(() => computeReturnsCapital(list, before, startBal, flowSplit, currentNow), [list, before, startBal, flowSplit, currentNow]);
  // For a period, every %-of-balance figure (total return, drawdown, Sharpe, expectancy %) is measured against the balance at
  // the START of the period (initial + earlier realised P&L + earlier cash flows), not against the account's initial balance.
  const periodAccounts = useMemo(() => {
    const sel = acc === "all" ? accounts : accounts.filter((x) => x.id === acc);
    if (!cut) return sel;
    return sel.map((a) => ({ ...a, startBalance: a.startBalance + before.filter((x) => x.accountId === a.id && x.status === "closed" && x.pnl != null).reduce((s, x) => s + (x.pnl as number), 0) + flowSplit.before.filter((f) => f.accountId === a.id).reduce((s, f) => s + signed(f), 0) }));
  }, [accounts, acc, cut, before, flowSplit]);
  const periodStart = useMemo(() => periodAccounts.reduce((s, a) => s + (a.startBalance || 0), 0), [periodAccounts]);
  const outcomes = useMemo(() => computeTradeOutcomes(list, periodStart), [list, periodStart]);
  const recent = useMemo(() => recentOutcomes(list, 60), [list]);
  const ov = useMemo(() => computeOverview(list, periodAccounts, balances, cut, flowSplit.period), [list, periodAccounts, balances, cut, flowSplit]);

  // Dev-only consistency check against the Dashboard maths.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const d = metrics(list.filter((x) => x.status === "closed" && x.pnl != null));
    const bad = (a: number | null, b: number | null) => (a == null) !== (b == null) || (a != null && b != null && Math.abs(a - b) > 0.01);
    if (bad(ov.net, d.net) || bad(ov.winRate, d.winRate) || bad(ov.pf, d.pf)) console.warn("[Overview] mismatch with Dashboard", { net: [ov.net, d.net], winRate: [ov.winRate, d.winRate], pf: [ov.pf, d.pf] });
  }, [list, ov]);

  const wdNames = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i)))), [lang]);
  const wdLong = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i)))), [lang]);

  const heat = useMemo(() => {
    if (!a) return null;
    const end = new Date(a.last + "T00:00:00Z");
    const endMon = new Date(end.getTime() - ((end.getUTCDay() + 6) % 7) * 864e5);
    const weeks = Math.min(53, Math.ceil((end.getTime() - new Date(a.first + "T00:00:00Z").getTime()) / 864e5 / 7) + 1);
    const cols = [] as { d: string; n: number; out: boolean }[][];
    for (let w = weeks - 1; w >= 0; w--) {
      const col = [];
      for (let i = 0; i < 7; i++) {
        const dt = new Date(endMon.getTime() - w * 7 * 864e5 + i * 864e5);
        const d = dt.toISOString().slice(0, 10);
        col.push({ d, n: a.days[d] || 0, out: dt > end });
      }
      cols.push(col);
    }
    return cols;
  }, [a]);
  const maxDay = a?.maxDay || 1;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex justify-center">
        <div className="inline-flex gap-1 rounded-2xl border border-border bg-surface p-1">
          {TABS.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${tab === x.id ? "bg-primary-tint text-primary border border-primary/50 shadow-sm" : "text-muted hover:text-text"}`}>{x.icon}{x.label}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {accounts.length > 1 && (
          <select className="field" value={acc} onChange={(e) => setAcc(e.target.value)}>{[{ value: "all", label: L(TX.all) }, ...accounts.map((x) => ({ value: x.id, label: x.name }))].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        )}
        <select className="field" value={per} onChange={(e) => setPer(e.target.value)}>{[{ value: "all", label: L(TX.pAll) }, { value: "p1", label: L(TX.p1) }, { value: "p3", label: L(TX.p3) }, { value: "p12", label: L(TX.p12) }].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      </div>

      {tab === "overview" ? (
        <OverviewTab lang={lang} o={ov} currency={currency} twr={rc.twr} />
      ) : tab === "outcomes" ? (
        <TradeOutcomesTab lang={lang} o={outcomes} recent={recent} onImport={onImport} currency={currency} />
      ) : tab === "benchmark" ? (
        <BenchmarkTab lang={lang} />
      ) : tab === "portfolio" ? (
        <PortfolioTab lang={lang} />
      ) : tab === "advanced" ? (
        <AdvancedTab lang={lang} />
      ) : tab === "path" ? (
        <PathTab lang={lang} />
      ) : tab === "daybyday" ? (
        <DayByDayTab lang={lang} trades={list} onImport={onImport} currency={currency} focusDay={focusDay} />
      ) : tab === "returns" ? (
        <ReturnsTab lang={lang} rc={rc} accounts={acc === "all" ? accounts : accounts.filter((x) => x.id === acc)} flows={accFlows} onAddFlow={onAddFlow} onRemoveFlow={onRemoveFlow} currency={currency} />
      ) : !a ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-muted">{L(TX.empty)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi hero icon={<CalendarDays size={16} />} label={L(TX.days)} value={String(a.tradingDays)} info={L(TX.daysI)} />
            <Kpi icon={<Layers size={16} />} label={L(TX.elig)} value={String(a.eligibleDays)} info={L(TX.eligI)} />
            <Kpi hero icon={<Gauge size={16} />} label={L(TX.freq)} value={`${fmtN(a.freq * 100, 1)}%`} info={L(TX.freqI)} />
            <Kpi icon={<Repeat size={16} />} label={L(TX.pd)} value={fmtN(a.perDay)} />
            <Kpi icon={<BarChart3 size={16} />} label={L(TX.pw)} value={fmtN(a.perWeek)} />
            <Kpi icon={<BarChart3 size={16} />} label={L(TX.pm)} value={fmtN(a.perMonth)} />
            <Kpi hero icon={<Flame size={16} />} label={L(TX.md)} value={String(a.maxDay)} />
            <Kpi icon={<CalendarDays size={16} />} label={L(TX.wd)} value={wdLong[a.topWeekday]} sub={`${a.weekday[a.topWeekday]} ${L(TX.trades)}`} />
            <Kpi icon={<Clock size={16} />} label={L(TX.hr)} value={`${String(a.topHour).padStart(2, "0")}:00`} sub={`${a.hour[a.topHour]} ${L(TX.trades)}`} info={L(TX.hrI)} />
            <Kpi icon={<Scale size={16} />} label={L(TX.tv)} value={fmtN(a.vol.total)} />
            <Kpi icon={<Scale size={16} />} label={L(TX.av)} value={fmtN(a.vol.avg)} />
            <Kpi icon={<Scale size={16} />} label={L(TX.mv)} value={fmtN(a.vol.max)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={L(TX.byWd)}><Bars data={a.weekday} labels={wdNames} peak={a.topWeekday} /></Card>
            <Card title={L(TX.byHr)}><Bars data={a.hour} labels={a.hour.map((_, i) => (i % 3 === 0 ? String(i) : ""))} peak={a.topHour} /></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card title={L(TX.heat)}>
                <div dir="ltr" className="overflow-x-auto pb-1">
                  <div className="flex gap-[3px]">
                    {heat!.map((col, i) => (
                      <div key={i} className="flex flex-col gap-[3px]">
                        {col.map((c) => (
                          <div key={c.d} title={c.out ? "" : `${c.d} · ${c.n} ${L(TX.trades)}`} className="h-3.5 w-3.5 rounded-[3px]" style={{ background: c.out ? "transparent" : c.n ? `color-mix(in srgb,var(--primary) ${25 + (c.n / maxDay) * 75}%,transparent)` : "color-mix(in srgb,var(--text) 7%,transparent)" }} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
            <Card title={L(TX.split)}>
              <div className="space-y-4">
                <div dir="ltr" className="flex h-3 overflow-hidden rounded-full bg-border">
                  <div style={{ width: `${(a.long / a.trades) * 100}%`, background: "#22c55e" }} />
                  <div style={{ width: `${(a.short / a.trades) * 100}%`, background: "#f87171" }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="flex items-center gap-1 text-[11px] text-muted"><TrendingUp size={13} className="text-[#22c55e]" />{L(TX.lg)}</div><div className="tnum font-heading text-xl font-bold text-[#22c55e]">{a.long}</div></div>
                  <div><div className="flex items-center gap-1 text-[11px] text-muted"><TrendingDown size={13} className="text-[#f87171]" />{L(TX.sh)}</div><div className="tnum font-heading text-xl font-bold text-[#f87171]">{a.short}</div></div>
                </div>
                <div className="rounded-xl bg-primary-tint p-3 text-center">
                  <div className="text-[11px] text-muted">{L(TX.ratio)}</div>
                  <div className="tnum font-heading text-2xl font-bold text-primary">{a.short ? fmtN(a.long / a.short) : "∞"}</div>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
