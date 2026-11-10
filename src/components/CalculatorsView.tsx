// The Calculators page: a hub of 22 calculators in 5 groups (search, recently used, one glass card per group) and a
// detail screen per calculator (inputs | result). Opened from the sidebar, the header's size calculator, or anywhere
// with openCalculator(key).
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowLeft, ArrowLeftRight, BarChart3, Boxes, Brain, ChevronRight, Coins, Crosshair, Delete, Divide, Flag, Layers, LayoutGrid, LineChart, Moon, NotebookPen, Percent, PieChart, Receipt, RefreshCw,
  Ruler, Scale, Search, Shield, ShieldHalf, Shuffle, Sigma, TrendingDown, TrendingUp, TriangleAlert, Trophy, type LucideIcon,
} from "lucide-react";
import "./calculators/calculators.css";
import GlassIcon from "./GlassIcon";
import { MathFunctionIcon } from "./Mascot";
import type { Key } from "../i18n";
import type { Account, BalancePoint, Lang, Theme, Trade } from "../types";
import type { CashFlow } from "../lib/cashflow";
import { usePrivacy } from "../usePrivacy";
import { mixHex, THEME_INK } from "../lib/lighting";
import { CALC_GROUPS, CALC_JOURNAL, CALC_READY, DEFAULT_RECENT, groupOf, isCalcKey, matchesQuery, pushRecentCalc, readableTone, type CalcKey, type DistUnit, type GroupKey } from "../lib/calculators";
import { CALC_TEXT, GROUP_TEXT, T } from "./calculators/text";
import { Seg, useL, type Ctx } from "./calculators/ui";
import { AtrBody, CostBody, MarginBody, PipBody, PlBody, RrBody, SizeBody, SwapBody, UnitsBody } from "./calculators/TradeSetup";
import { CompBody, PropBody } from "./calculators/PropCalcs";
import { FxBody, PctBody, StdBody } from "./calculators/General";
import { DdBody, ExpBody, KellyBody, McBody, PortBody, RuinBody, StreakBody, WrBody } from "./calculators/RiskSystem";

const GOLD = "#e6b84a";
const GROUP_ICON: Record<GroupKey, LucideIcon> = { setup: Crosshair, risk: Shield, system: Brain, prop: Trophy, general: LayoutGrid };
const ICON: Record<CalcKey, LucideIcon> = {
  size: Scale, rr: ArrowLeftRight, pl: TrendingUp, pip: Ruler, margin: Layers, atr: BarChart3,
  dd: RefreshCw, ruin: TriangleAlert, streak: TrendingDown, port: ShieldHalf,
  exp: Sigma, wr: Percent, kelly: Divide, mc: Shuffle,
  prop: Flag, comp: LineChart,
  std: Delete, fx: Coins, pct: PieChart, units: Boxes, cost: Receipt, swap: Moon,
};

// ---------- what the page remembers on this device ----------

// The "Pips | Price" choice of Risk/Reward and Profit and loss is kept per calculator under UNIT_KEY (Position size
// keeps its own inside SIZE_KEY, shared with the header's dropdown). Anything but "price" reads as pips, the default.
const RECENT_KEY = "mizan-calc-recent", SRC_KEY = "mizan-calc-src", UNIT_KEY = "mizan-calc-unit", SIZE_KEY = "mizan-size-calc";
type Src = "journal" | "manual";
const readJson = (k: string): unknown => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const readRecent = (): CalcKey[] => { const v = readJson(RECENT_KEY); return Array.isArray(v) && v.some(isCalcKey) ? v.filter(isCalcKey).slice(0, 3) : DEFAULT_RECENT; };
const readSrc = (): Partial<Record<CalcKey, Src>> => { const v = readJson(SRC_KEY); return v && typeof v === "object" ? (v as Partial<Record<CalcKey, Src>>) : {}; };
const readUnits = (): Partial<Record<CalcKey, DistUnit>> => { const v = readJson(UNIT_KEY); return v && typeof v === "object" ? (v as Partial<Record<CalcKey, DistUnit>>) : {}; };
const readSizeAcc = (): string => { const v = readJson(SIZE_KEY) as { acc?: unknown } | null; return typeof v?.acc === "string" ? v.acc : ""; };

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  theme: Theme;
  accounts: Account[];
  trades: Trade[];
  balances: Record<string, BalancePoint[]>;
  flows: CashFlow[];
  /** A calculator to open (null: the list), consumed once. */
  nav: { key: string | null } | null;
  onNavDone: () => void;
}

export default function CalculatorsView({ lang, theme, accounts, trades, balances, flows, nav, onNavDone }: Props) {
  const { hidden } = usePrivacy();
  const [open, setOpen] = useState<CalcKey | null>(null);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<CalcKey[]>(readRecent);
  const [src, setSrc] = useState(readSrc);
  const [units, setUnits] = useState(readUnits);
  const [accId, setAccId] = useState(readSizeAcc);
  const [cur, setCur] = useState("USD");

  const go = (k: CalcKey | null) => {
    setOpen(k);
    if (k) setRecent((r) => { const n = pushRecentCalc(r, k); writeJson(RECENT_KEY, n); return n; });
    try { window.scrollTo({ top: 0 }); } catch { /* no window */ }
  };
  useEffect(() => {
    if (!nav) return;
    go(isCalcKey(nav.key) ? nav.key : null);
    onNavDone();
  }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group colours written as text must read on the glass: the theme's page colour under a light white veil, or near-white on Ivory.
  const glassBg = theme === "light" ? "#fbfcfd" : mixHex((THEME_INK[theme] ?? THEME_INK.dark).bg, "#ffffff", 0.05);
  const toneOf = useMemo(() => { const m = new Map<string, string>(); return (c: string) => { if (!m.has(c)) m.set(c, readableTone(c, glassBg)); return m.get(c) as string; }; }, [glassBg]);

  return (
    <div className="calc-page mx-auto w-full max-w-6xl pb-8">
      <div className="calc-glow" aria-hidden="true" />
      {open
        ? <Detail key={open} k={open} lang={lang} mode={CALC_JOURNAL.has(open) && src[open] !== "manual" ? "journal" : "manual"}
            onMode={(m) => setSrc((o) => { const n = { ...o, [open]: m }; writeJson(SRC_KEY, n); return n; })} onBack={() => go(null)}
            unit={units[open] === "price" ? "price" : "pips"} onUnit={(u) => setUnits((o) => { const n = { ...o, [open]: u }; writeJson(UNIT_KEY, n); return n; })}
            ctxBase={{ lang, accounts, trades, balances, flows, hidden, accId, setAccId, cur, setCur }} toneOf={toneOf} glassBg={glassBg} />
        : <Hub lang={lang} q={q} setQ={setQ} recent={recent} onOpen={go} toneOf={toneOf} />}
    </div>
  );
}

// ---------- the hub ----------

function Hub({ lang, q, setQ, recent, onOpen, toneOf }: { lang: Lang; q: string; setQ: (v: string) => void; recent: CalcKey[]; onOpen: (k: CalcKey) => void; toneOf: (c: string) => string }) {
  const L = useL(lang);
  const groups = CALC_GROUPS.map((g) => ({ ...g, shown: g.items.filter((k) => matchesQuery(q, CALC_TEXT[k].name[lang], CALC_TEXT[k].desc[lang])) })).filter((g) => g.shown.length);
  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <GlassIcon icon={MathFunctionIcon as any} size={44} color={GOLD} />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl font-semibold">{L(T.title)}</h1>
          <p className="text-sm text-muted">{L(T.subtitle)}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-icon" aria-hidden />
          <input type="search" className="field calc-glass !rounded-full !ps-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(T.search)} aria-label={L(T.search)} />
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="me-1 text-xs font-semibold text-muted">{L(T.recent)}</span>
        {recent.map((k) => (
          <button key={k} type="button" onClick={() => onOpen(k)} className="calc-glass calc-pill inline-flex items-center gap-2 rounded-full py-1 pe-3 ps-1 text-xs font-medium">
            <GlassIcon icon={ICON[k]} size={22} color={groupOf(k).color} />
            {CALC_TEXT[k].name[lang]}
          </button>
        ))}
        <span className="ms-auto inline-flex items-center gap-1.5 text-xs text-muted">
          <NotebookPen size={14} className="shrink-0 text-icon" aria-hidden />
          {L(T.journalNote)}
        </span>
      </div>

      {groups.length ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const GIcon = GROUP_ICON[g.key];
            return (
              <section key={g.key} className="calc-glass relative overflow-hidden rounded-2xl p-3 sm:p-4" style={{ "--g": g.color, "--gt": toneOf(g.color) } as CSSProperties} aria-labelledby={`calc-g-${g.key}`}>
                <span className="calc-topline" aria-hidden="true" />
                <GIcon size={110} strokeWidth={1.5} className="calc-watermark" aria-hidden />
                <header className="relative flex items-center gap-3 px-1 pb-2">
                  <GlassIcon icon={GIcon} size={40} color={g.color} />
                  <div className="min-w-0 flex-1">
                    <h2 id={`calc-g-${g.key}`} className="font-heading text-base font-semibold leading-6">{GROUP_TEXT[g.key].name[lang]}</h2>
                    <p className="text-xs text-muted">{GROUP_TEXT[g.key].sub[lang]}</p>
                  </div>
                  <span className="calc-badge tnum rounded-full px-2.5 py-0.5 text-xs font-bold">{g.shown.length}</span>
                </header>
                <div className="relative flex flex-col gap-0.5">
                  {g.shown.map((k) => (
                    <button key={k} type="button" className="calc-row" onClick={() => onOpen(k)}>
                      <span className="calc-row-in">
                        <GlassIcon icon={ICON[k]} size={30} color={g.color} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-5">{CALC_TEXT[k].name[lang]}</span>
                          <span className="block text-[11px] leading-4 text-muted">{CALC_TEXT[k].desc[lang]}</span>
                        </span>
                        {!CALC_READY.has(k) && <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-muted">{L(T.soonTag)}</span>}
                        {CALC_JOURNAL.has(k) && <NotebookPen size={14} className="shrink-0 text-icon" aria-label={L(T.journalNote)} />}
                        <ChevronRight size={16} className="calc-chev shrink-0 rtl:rotate-180" aria-hidden />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="calc-glass mt-5 rounded-2xl p-8 text-center text-sm text-muted">{L(T.empty)}</p>
      )}
    </>
  );
}

// ---------- one calculator ----------

interface DetailProps {
  k: CalcKey;
  lang: Lang;
  mode: Src;
  onMode: (m: Src) => void;
  onBack: () => void;
  unit: DistUnit;
  onUnit: (u: DistUnit) => void;
  ctxBase: Omit<Ctx, "journal" | "color" | "tone" | "unit" | "setUnit">;
  toneOf: (c: string) => string;
  glassBg: string;
}

function Detail({ k, lang, mode, onMode, onBack, unit, onUnit, ctxBase, toneOf, glassBg }: DetailProps) {
  const L = useL(lang);
  const g = groupOf(k);
  const ready = CALC_READY.has(k), journalable = CALC_JOURNAL.has(k);
  const ctx: Ctx = { ...ctxBase, journal: journalable && mode === "journal", color: g.color, tone: toneOf(g.color), unit, setUnit: onUnit };
  // fresh fields when the source changes; a journal field follows the account by itself until it is typed over
  const bodyKey = mode;
  return (
    <>
      <button type="button" onClick={onBack} className="calc-glass calc-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
        <ArrowLeft size={14} className="shrink-0 text-icon rtl:rotate-180" aria-hidden />
        <span>{L(T.back)}</span>
        <span className="text-muted" aria-hidden>/</span>
        <span className="text-muted">{GROUP_TEXT[g.key].name[lang]}</span>
      </button>
      <header className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <GlassIcon icon={ICON[k]} size={54} color={g.color} />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl font-semibold">{CALC_TEXT[k].name[lang]}</h1>
          <p className="text-sm text-muted">{CALC_TEXT[k].desc[lang]}</p>
        </div>
        {ready && journalable && (
          <Seg label={L(T.source)} value={mode} onChange={onMode} options={[{ v: "journal", label: <span className="inline-flex items-center gap-1.5"><NotebookPen size={13} aria-hidden />{L(T.fromJournal)}</span> }, { v: "manual", label: L(T.manual) }]} />
        )}
      </header>
      <div className="mt-5">
        {!ready ? <p className="text-sm text-muted">{L(T.soon)}</p>
          : k === "size" ? <SizeBody key={bodyKey} ctx={ctx} />
          : k === "rr" ? <RrBody ctx={ctx} />
          : k === "pl" ? <PlBody ctx={ctx} />
          : k === "pip" ? <PipBody ctx={ctx} />
          : k === "margin" ? <MarginBody ctx={ctx} />
          : k === "atr" ? <AtrBody key={bodyKey} ctx={ctx} />
          : k === "prop" ? <PropBody key={bodyKey} ctx={ctx} glassBg={glassBg} />
          : k === "comp" ? <CompBody key={bodyKey} ctx={ctx} />
          : k === "dd" ? <DdBody key={bodyKey} ctx={ctx} />
          : k === "ruin" ? <RuinBody key={bodyKey} ctx={ctx} />
          : k === "streak" ? <StreakBody key={bodyKey} ctx={ctx} />
          : k === "port" ? <PortBody key={bodyKey} ctx={ctx} />
          : k === "exp" ? <ExpBody key={bodyKey} ctx={ctx} />
          : k === "wr" ? <WrBody ctx={ctx} />
          : k === "kelly" ? <KellyBody key={bodyKey} ctx={ctx} />
          : k === "mc" ? <McBody key={bodyKey} ctx={ctx} />
          : k === "std" ? <StdBody ctx={ctx} />
          : k === "fx" ? <FxBody ctx={ctx} />
          : k === "pct" ? <PctBody ctx={ctx} />
          : k === "units" ? <UnitsBody ctx={ctx} />
          : k === "cost" ? <CostBody key={bodyKey} ctx={ctx} />
          : k === "swap" ? <SwapBody ctx={ctx} />
          : null}
      </div>
    </>
  );
}
