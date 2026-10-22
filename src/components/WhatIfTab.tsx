import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarOff, Clock3, Crosshair, RotateCcw, ShieldAlert, SlidersHorizontal, X } from "lucide-react";
import { cardBg } from "./metricUi";
import { readPaths } from "../lib/pathData";
import { pointValues } from "../lib/portfolio";
import { activeRules, curves as runningTotals, impact, NO_RULES, simulate, type RuleKey, type Rules, type SimInput, type Unit } from "../lib/whatif";
import { currencySymbol, fmtMoney, ltrNumbers } from "../lib/money";
import type { Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
export const WHATIF_TAB: L = ["What if", "ماذا لو", "Et si ?"];
const TXT = {
  sub: ["Replay your trades with other rules and see what would have changed.", "أعد تشغيل صفقاتك بقواعد أخرى وشاهد ما كان سيتغيّر.", "Rejouez vos trades avec d'autres règles et voyez ce qui aurait changé."] as L,
  rulesOn: ["Rules on: {n}", "القواعد المفعّلة: {n}", "Règles actives : {n}"] as L,
  discipline: ["Discipline", "الانضباط", "Discipline"] as L,
  filters: ["Filters", "التصفية", "Filtres"] as L,
  exits: ["Exits", "الخروج", "Sorties"] as L,
  exitsSub: ["from each trade's price path", "من مسار السعر لكل صفقة", "d'après le parcours du prix de chaque trade"] as L,
  streak: ["Stop the day after {n} losses in a row", "أوقف اليوم بعد {n} خسائر متتالية", "Arrêter la journée après {n} pertes d'affilée"] as L,
  dayLoss: ["Stop the day once it is down {n}", "أوقف اليوم إذا خسر {n}", "Arrêter la journée à {n} de perte"] as L,
  dayGain: ["Stop the day once it is up {n}", "أوقف اليوم إذا ربح {n}", "Arrêter la journée à {n} de gain"] as L,
  maxDay: ["At most {n} trades a day", "{n} صفقات كحد أقصى في اليوم", "Au plus {n} trades par jour"] as L,
  days: ["Days without trading", "أيام بلا تداول", "Jours sans trading"] as L,
  hours: ["Only entries from {a} to {b}", "الدخول فقط من {a} إلى {b}", "Entrées seulement de {a} à {b}"] as L,
  symbols: ["Symbols left out", "رموز مستبعدة", "Symboles exclus"] as L,
  side: ["Direction", "الاتجاه", "Sens"] as L,
  both: ["Both", "الاثنان", "Les deux"] as L,
  long: ["Long only", "شراء فقط", "Achats seulement"] as L,
  short: ["Short only", "بيع فقط", "Ventes seulement"] as L,
  sl: ["Stop loss at {n}", "وقف الخسارة عند {n}", "Stop loss à {n}"] as L,
  tp: ["Take profit at {n}", "جني الربح عند {n}", "Take profit à {n}"] as L,
  money: ["money", "مال", "argent"] as L,
  reset: ["Reset", "إعادة الضبط", "Réinitialiser"] as L,
  actual: ["Actual", "الفعلي", "Réel"] as L,
  withRules: ["With these rules", "بهذه القواعد", "Avec ces règles"] as L,
  tradesOf: ["{a} of {b} trades taken", "{a} من {b} صفقة مأخوذة", "{a} trades sur {b} pris"] as L,
  noChange: ["These rules change nothing in this selection.", "هذه القواعد لا تغيّر شيئاً في هذا الاختيار.", "Ces règles ne changent rien sur cette sélection."] as L,
  net: ["Net P&L", "صافي الربح", "P&L net"] as L,
  trades: ["Trades", "الصفقات", "Trades"] as L,
  winRate: ["Win rate", "نسبة الفوز", "Taux de réussite"] as L,
  pf: ["Profit factor", "معامل الربح", "Profit factor"] as L,
  dd: ["Max drawdown", "أقصى تراجع", "Drawdown max"] as L,
  avg: ["Average trade", "متوسط الصفقة", "Trade moyen"] as L,
  was: ["actual {v}", "الفعلي {v}", "réel {v}"] as L,
  curve: ["Equity curve", "منحنى النتائج", "Courbe des résultats"] as L,
  at: ["Trade {i} ({d}): actual {a} · with these rules {b}", "الصفقة {i} ({d}): الفعلي {a} · بهذه القواعد {b}", "Trade {i} ({d}) : réel {a} · avec ces règles {b}"] as L,
  alone: ["Each rule on its own", "أثر كل قاعدة وحدها", "Chaque règle seule"] as L,
  skips: ["skips {n} trades", "تتخطى {n} صفقة", "écarte {n} trades"] as L,
  changes: ["changes {n} exits", "تغيّر خروج {n} صفقة", "modifie {n} sorties"] as L,
  nothing: ["no effect", "بلا أثر", "sans effet"] as L,
  iStreak: ["After {n} losses in a row", "بعد {n} خسائر متتالية", "Après {n} pertes d'affilée"] as L,
  iDayLoss: ["Daily loss limit {v}", "حد الخسارة اليومي {v}", "Perte max par jour {v}"] as L,
  iDayGain: ["Daily profit target {v}", "هدف الربح اليومي {v}", "Objectif de gain par jour {v}"] as L,
  iMaxDay: ["At most {n} trades a day", "{n} صفقات كحد أقصى في اليوم", "Au plus {n} trades par jour"] as L,
  iDays: ["No trading on {v}", "بلا تداول يوم {v}", "Pas de trading le {v}"] as L,
  iHours: ["Entries {a} to {b}", "الدخول من {a} إلى {b}", "Entrées de {a} à {b}"] as L,
  iSymbols: ["Without {v}", "بدون {v}", "Sans {v}"] as L,
  iSl: ["Stop loss {v}", "وقف الخسارة {v}", "Stop loss {v}"] as L,
  iTp: ["Take profit {v}", "جني الربح {v}", "Take profit {v}"] as L,
  how: ["Daily rules only see the trades already closed at each entry. Exits can only close a trade earlier than you did: what the price did after your exit is not known.", "قواعد اليوم لا ترى إلا الصفقات التي أُغلقت قبل كل دخول. ولا يمكن لقواعد الخروج إلا أن تغلق الصفقة أبكر مما أغلقتها أنت، لأن ما حدث بعد خروجك غير معروف.", "Les règles du jour ne voient que les trades déjà clôturés à chaque entrée. Les sorties ne peuvent que clôturer un trade plus tôt que vous : ce que le prix a fait après votre sortie n'est pas connu."] as L,
  cover: ["Exit rules used the price path of {a} of {b} trades.", "استخدمت قواعد الخروج مسار السعر لـ{a} من {b} صفقة.", "Les sorties ont utilisé le parcours de {a} trades sur {b}."] as L,
  noPath: ["{n} without a measured path stayed as they were.", "{n} بلا مسار مُقاس بقيت كما هي.", "{n} sans parcours mesuré sont restés tels quels."] as L,
  noStop: ["{n} without a stop loss stayed as they were (R is the distance to the trade's own stop).", "{n} بلا وقف خسارة بقيت كما هي (R هي المسافة إلى وقف الصفقة نفسها).", "{n} sans stop loss sont restés tels quels (R est la distance au stop du trade)."] as L,
  noMoney: ["{n} without a money value stayed as they were.", "{n} بلا قيمة مالية بقيت كما هي.", "{n} sans valeur monétaire sont restés tels quels."] as L,
  ties: ["{n} reached both levels within the same bar: counted as stopped out.", "{n} بلغت المستويين داخل الشمعة نفسها: حُسبت خاسرة بالوقف.", "{n} ont atteint les deux niveaux dans la même bougie : comptés comme stoppés."] as L,
  unordered: ["{n} reached both levels but were measured before their order was kept: counted as stopped out. Measure again in Trade path for the exact order.", "{n} بلغت المستويين لكنها قيست قبل حفظ ترتيبهما: حُسبت خاسرة بالوقف. أعد القياس في «مسار الصفقة» لمعرفة الترتيب الدقيق.", "{n} ont atteint les deux niveaux mais ont été mesurés avant que leur ordre soit gardé : comptés comme stoppés. Mesurez à nouveau dans Parcours du trade."] as L,
  openPath: ["Open Trade path", "افتح «مسار الصفقة»", "Ouvrir Parcours du trade"] as L,
  empty: ["No closed trades in this selection.", "لا توجد صفقات مغلقة في هذا الاختيار.", "Aucun trade clôturé dans cette sélection."] as L,
};

/** Rule settings as edited: each rule keeps its value while switched off. */
interface Ui {
  streak: [boolean, number]; dayLoss: [boolean, number]; dayGain: [boolean, number]; maxDay: [boolean, number];
  skipDays: number[]; hours: [boolean, number, number]; skipSymbols: string[]; side: Rules["side"];
  sl: [boolean, number, Unit]; tp: [boolean, number, Unit];
}
const KEY = "mizan-whatif";
const fresh = (unit: Unit): Ui => ({
  streak: [true, 2], dayLoss: [false, 200], dayGain: [false, 500], maxDay: [false, 3], skipDays: [], hours: [false, 8, 20], skipSymbols: [], side: "both",
  sl: [false, unit === "R" ? 1 : 100, unit], tp: [false, unit === "R" ? 2 : 200, unit],
});
const toRules = (u: Ui): Rules => ({
  ...NO_RULES,
  streak: u.streak[0] ? u.streak[1] : null, dayLoss: u.dayLoss[0] ? u.dayLoss[1] : null, dayGain: u.dayGain[0] ? u.dayGain[1] : null, maxDay: u.maxDay[0] ? u.maxDay[1] : null,
  skipDays: u.skipDays, hours: u.hours[0] ? [u.hours[1], u.hours[2]] : null, skipSymbols: u.skipSymbols, side: u.side,
  sl: u.sl[0] ? { v: u.sl[1], unit: u.sl[2] } : null, tp: u.tp[0] ? { v: u.tp[1], unit: u.tp[2] } : null,
});
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Closed trades with their measured price path and money per 1.0 move (their own, else the account's point value). */
export function inputsFor(trades: Trade[], history: Trade[]): SimInput[] {
  const store = readPaths(), pv = pointValues(history);
  return trades.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl)).map((t) => {
    const x = store.get(t.key), path = x && "src" in x ? x.path : null;
    const own = t.exitPrice != null && t.exitPrice !== t.entryPrice ? ((t.pnl as number) + (t.commission || 0)) / ((t.exitPrice - t.entryPrice) * (t.side === "long" ? 1 : -1)) : NaN;
    const v = pv.get(`${t.accountId}|${t.symbol}`);
    return { trade: t, path, k: Number.isFinite(own) && own > 0 ? own : v != null && t.qty > 0 ? v * t.qty : null };
  });
}
/** Makes What if open with exactly these rules on (written where the section reads its settings). */
export function presetWhatIf(r: Partial<Rules>) {
  const u = fresh(r.sl?.unit ?? r.tp?.unit ?? "money");
  const flag = (v: number | null | undefined, d: number): [boolean, number] => [v != null, v ?? d];
  const ui: Ui = {
    ...u, streak: flag(r.streak, 2), dayLoss: flag(r.dayLoss, u.dayLoss[1]), dayGain: flag(r.dayGain, u.dayGain[1]), maxDay: flag(r.maxDay, u.maxDay[1]),
    skipDays: r.skipDays ?? [], hours: r.hours ? [true, r.hours[0], r.hours[1]] : u.hours, skipSymbols: r.skipSymbols ?? [], side: r.side ?? "both",
    sl: r.sl ? [true, r.sl.v, r.sl.unit] : u.sl, tp: r.tp ? [true, r.tp.v, r.tp.unit] : u.tp,
  };
  try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch { /* storage blocked */ }
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${on ? "bg-primary" : "bg-[var(--gauge-track)]"}`}>
      <span className={`absolute start-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-4 rtl:-translate-x-4" : ""}`} />
    </button>
  );
}

function Num({ value, onChange, min = 1, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; step?: number; label: string }) {
  const [txt, setTxt] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (document.activeElement !== ref.current) setTxt(String(value)); }, [value]); // reset or a new unit from outside
  return (
    <input ref={ref} dir="ltr" type="number" inputMode="decimal" aria-label={label} min={min} step={step} value={txt}
      onChange={(e) => { setTxt(e.target.value); const v = Number(e.target.value); if (Number.isFinite(v) && v >= min) onChange(v); }}
      onBlur={() => setTxt(String(value))}
      className="tnum mx-1 w-[4.5rem] rounded-lg border border-border bg-[var(--bg)] px-2 py-0.5 text-center text-sm text-text outline-none transition-colors focus:border-[var(--icon)]" />
  );
}

/** Sentence with inline inputs: "{n}" (and "{a}", "{b}") in the text are replaced by the given nodes. */
function Sentence({ text, parts }: { text: string; parts: Record<string, ReactNode> }) {
  const bits = text.split(/(\{[a-z]+\})/);
  return <>{bits.map((b, i) => { const m = /^\{([a-z]+)\}$/.exec(b); return m ? <span key={i} className="inline-flex items-center">{parts[m[1]]}</span> : <span key={i}>{b}</span>; })}</>;
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5" style={{ background: "var(--bg)" }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${value === v ? "bg-primary-tint text-primary" : "text-muted hover:text-text"}`}>{label}</button>
      ))}
    </div>
  );
}

function Group({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-tint text-icon">{icon}</span>
        <div className="leading-tight"><div className="font-heading text-sm font-semibold text-primary">{title}</div>{sub && <div className="text-[11px] text-muted">{sub}</div>}</div>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Rule({ on, onToggle, label, children }: { on: boolean; onToggle: (v: boolean) => void; label: string; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${on ? "bg-primary-tint" : ""}`} style={on ? undefined : { background: "color-mix(in srgb, var(--text) 3%, transparent)" }}>
      <Switch on={on} onChange={onToggle} label={label} />
      <div className={`flex min-w-0 flex-wrap items-center text-sm leading-7 transition-colors ${on ? "text-text" : "text-muted"}`}>{children}</div>
    </div>
  );
}

/** Both running totals over the real trade sequence, with a readout under the pointer. */
function Curves({ a, b, at, fmt, label, labels }: { a: number[]; b: number[]; at: string[]; fmt: (v: number) => string; label: (i: number, d: string, x: string, y: string) => string; labels: [string, string] }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const n = a.length - 1;
  if (n < 1) return null;
  const y0 = Math.min(0, ...a, ...b), y1 = Math.max(0, ...a, ...b);
  const W = 1000, H = 240, P = 10;
  const X = (i: number) => (i / n) * W, Y = (v: number) => P + (1 - (v - y0) / (y1 - y0 || 1)) * (H - 2 * P);
  const line = (s: number[]) => s.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const pct = (v: number) => `${(Y(v) / H) * 100}%`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 rounded" style={{ background: "var(--primary)" }} />{labels[1]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: "var(--muted)" }} />{labels[0]}</span>
        <span className="tnum ms-auto min-h-[1rem]">{hover != null && hover > 0 ? ltrNumbers(label(hover, at[hover].slice(0, 10), fmt(a[hover]), fmt(b[hover]))) : ""}</span>
      </div>
      <div dir="ltr" className="relative h-56 touch-none" onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(n, Math.round(((e.clientX - r.left) / r.width) * n)))); }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient>
          </defs>
          <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={`${line(b)}L${W},${Y(0).toFixed(1)}L0,${Y(0).toFixed(1)}Z`} fill={`url(#${id}g)`} className="ch-fade" />
          <path d={line(a)} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          <path d={line(b)} fill="none" stroke="var(--primary)" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hover != null && <line x1={X(hover)} x2={X(hover)} y1={0} y2={H} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {hover != null && (["a", "b"] as const).map((w) => (
          <span key={w} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${(hover / n) * 100}%`, top: pct((w === "a" ? a : b)[hover]), borderColor: w === "a" ? "var(--muted)" : "var(--primary)", background: "var(--surface)" }} />
        ))}
        <span className="tnum pointer-events-none absolute start-1 -translate-y-1/2 text-[10px] text-muted" style={{ top: pct(y1) }}>{fmt(y1)}</span>
        {y0 < 0 && <span className="tnum pointer-events-none absolute start-1 -translate-y-1/2 text-[10px] text-muted" style={{ top: pct(y0) }}>{fmt(y0)}</span>}
        <span className="tnum pointer-events-none absolute end-1 -translate-y-1/2 text-[10px] text-muted" style={{ top: pct(0) }}>0</span>
      </div>
    </div>
  );
}

export default function WhatIfTab({ lang, trades, history, currency, onOpen }: { lang: Lang; trades: Trade[]; history: Trade[]; currency: string | null; onOpen?: (tab: "path") => void }) {
  const k = lang === "en" ? 0 : lang === "ar" ? 1 : 2, T = (x: L) => x[k];
  const fill = (x: L, o: Record<string, string | number>) => Object.entries(o).reduce((s, [kk, v]) => s.replace(`{${kk}}`, String(v)), T(x));
  const money = (v: number, sign = false) => fmtMoney(v, { sign, currency });
  const unitLabel = currencySymbol(currency) || T(TXT.money);

  const closed = useMemo(() => trades.filter((t) => t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl)), [trades]);
  const inputs = useMemo(() => inputsFor(trades, history), [trades, history]);
  const symbols = useMemo(() => { const c = new Map<string, number>(); for (const t of closed) c.set(t.symbol, (c.get(t.symbol) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1]); }, [closed]);

  const defUnit: Unit = closed.length && closed.filter((t) => t.sl != null && t.sl > 0).length >= closed.length / 2 ? "R" : "money";
  const [ui, setUi] = useState<Ui>(() => { try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (s && Array.isArray(s.streak) && Array.isArray(s.sl)) return { ...fresh(defUnit), ...s }; } catch { /* no saved rules */ } return fresh(defUnit); });
  const set = (p: Partial<Ui>) => setUi((u) => { const n = { ...u, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* storage blocked */ } return n; });
  const rules = useMemo(() => toRules(ui), [ui]);
  const sim = useMemo(() => simulate(inputs, rules), [inputs, rules]);
  const imp = useMemo(() => impact(inputs, rules).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)), [inputs, rules]);
  const curves = useMemo(() => runningTotals(sim), [sim]);
  const on = activeRules(rules).length;

  const wd = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i)))), [lang]);
  const lv = (u: Unit, v: number) => (u === "R" ? `${v}R` : money(v));
  const ruleName = (key: RuleKey) => {
    switch (key) {
      case "streak": return fill(TXT.iStreak, { n: ui.streak[1] });
      case "dayLoss": return fill(TXT.iDayLoss, { v: money(ui.dayLoss[1]) });
      case "dayGain": return fill(TXT.iDayGain, { v: money(ui.dayGain[1]) });
      case "maxDay": return fill(TXT.iMaxDay, { n: ui.maxDay[1] });
      case "days": return fill(TXT.iDays, { v: ui.skipDays.map((d) => wd[d]).join(k === 1 ? "، " : ", ") });
      case "hours": return fill(TXT.iHours, { a: hh(ui.hours[1]), b: hh(ui.hours[2]) });
      case "symbols": return fill(TXT.iSymbols, { v: ui.skipSymbols.join(", ") });
      case "side": return T(ui.side === "long" ? TXT.long : TXT.short);
      case "sl": return fill(TXT.iSl, { v: lv(ui.sl[2], ui.sl[1]) });
      case "tp": return fill(TXT.iTp, { v: lv(ui.tp[2], ui.tp[1]) });
    }
  };

  if (!closed.length) return <div className="rounded-2xl border border-border p-10 text-center text-muted" style={cardBg}>{T(TXT.empty)}</div>;

  const A = sim.actual, S = sim.sim, diff = S.net - A.net;
  const tone = (good: boolean | null) => (good == null ? "var(--muted)" : good ? "var(--profit)" : "var(--loss)");
  const avg = (m: typeof A) => (m.n ? m.net / m.n : 0);
  const cards: { label: string; now: string; was: string; delta: string | null; good: boolean | null }[] = [
    { label: T(TXT.net), now: money(S.net), was: money(A.net), delta: Math.abs(diff) >= 0.5 ? money(diff, true) : null, good: diff > 0 ? true : diff < 0 ? false : null },
    { label: T(TXT.trades), now: String(S.n), was: String(A.n), delta: S.n !== A.n ? `${S.n - A.n > 0 ? "+" : ""}${S.n - A.n}` : null, good: null },
    { label: T(TXT.winRate), now: S.winRate == null ? "-" : `${S.winRate.toFixed(1)}%`, was: A.winRate == null ? "-" : `${A.winRate.toFixed(1)}%`, delta: S.winRate != null && A.winRate != null && Math.abs(S.winRate - A.winRate) >= 0.05 ? `${S.winRate - A.winRate > 0 ? "+" : ""}${(S.winRate - A.winRate).toFixed(1)}` : null, good: S.winRate != null && A.winRate != null ? (S.winRate > A.winRate ? true : S.winRate < A.winRate ? false : null) : null },
    { label: T(TXT.pf), now: S.pf == null ? (S.net > 0 ? "∞" : "-") : S.pf.toFixed(2), was: A.pf == null ? (A.net > 0 ? "∞" : "-") : A.pf.toFixed(2), delta: S.pf != null && A.pf != null && Math.abs(S.pf - A.pf) >= 0.005 ? `${S.pf - A.pf > 0 ? "+" : ""}${(S.pf - A.pf).toFixed(2)}` : null, good: S.pf != null && A.pf != null ? (S.pf > A.pf ? true : S.pf < A.pf ? false : null) : null },
    { label: T(TXT.dd), now: money(-S.maxDD), was: money(-A.maxDD), delta: Math.abs(S.maxDD - A.maxDD) >= 0.5 ? money(A.maxDD - S.maxDD, true) : null, good: S.maxDD < A.maxDD ? true : S.maxDD > A.maxDD ? false : null },
    { label: T(TXT.avg), now: money(avg(S)), was: money(avg(A)), delta: Math.abs(avg(S) - avg(A)) >= 0.5 ? money(avg(S) - avg(A), true) : null, good: avg(S) > avg(A) ? true : avg(S) < avg(A) ? false : null },
  ];
  const ex = sim.exits, exitsOn = !!(rules.sl || rules.tp);
  const notes = [
    ...(exitsOn ? [fill(TXT.cover, { a: ex.applied, b: ex.applied + ex.noPath + ex.noMoney + ex.noStop })] : []),
    ...(exitsOn && ex.noPath ? [fill(TXT.noPath, { n: ex.noPath })] : []), ...(exitsOn && ex.noStop ? [fill(TXT.noStop, { n: ex.noStop })] : []),
    ...(exitsOn && ex.noMoney ? [fill(TXT.noMoney, { n: ex.noMoney })] : []), ...(ex.ties ? [fill(TXT.ties, { n: ex.ties })] : []), ...(ex.unordered ? [fill(TXT.unordered, { n: ex.unordered })] : []),
  ];
  const maxImp = Math.max(1, ...imp.map((x) => Math.abs(x.net)));
  const unitSeg = (which: "sl" | "tp") => <Seg value={ui[which][2]} options={[["R", "R"], ["money", unitLabel]]} onChange={(u) => set({ [which]: [true, u === ui[which][2] ? ui[which][1] : u === "R" ? (which === "sl" ? 1 : 2) : which === "sl" ? 100 : 200, u] } as Partial<Ui>)} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold text-primary">{T(WHATIF_TAB)}</h2>
          <p className="text-sm text-muted">{T(TXT.sub)}</p>
        </div>
        <span className="rounded-full border border-border bg-primary-tint px-3 py-1 text-xs font-semibold text-primary">{ltrNumbers(fill(TXT.rulesOn, { n: on }))}</span>
      </div>

      <div className="wi-grid">
        {/* ---------- result ---------- */}
        <section className="wi-res space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-border p-5" style={cardBg}>
            <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full opacity-60 blur-3xl" style={{ background: `color-mix(in srgb, ${tone(diff > 0 ? true : diff < 0 ? false : null)} 22%, transparent)` }} />
            <div className="relative flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div className="text-xs text-muted">{T(TXT.actual)}</div>
                <div dir="ltr" className="tnum font-heading text-2xl font-bold text-muted">{money(A.net)}</div>
              </div>
              <div className="pb-1 text-xl text-muted rtl:-scale-x-100" aria-hidden="true">→</div>
              <div>
                <div className="text-xs text-muted">{T(TXT.withRules)}</div>
                <div dir="ltr" className="tnum font-heading text-4xl font-bold" style={{ color: S.net >= 0 ? "var(--profit)" : "var(--loss)" }}>{money(S.net)}</div>
              </div>
              {Math.abs(diff) >= 0.5 && (
                <span dir="ltr" className="tnum mb-1.5 rounded-full px-3 py-1 text-sm font-semibold" style={{ color: tone(diff > 0), background: `color-mix(in srgb, ${tone(diff > 0)} 14%, transparent)` }}>
                  {money(diff, true)}{A.net !== 0 ? ` (${diff > 0 ? "+" : ""}${((diff / Math.abs(A.net)) * 100).toFixed(1)}%)` : ""}
                </span>
              )}
            </div>
            <div className="relative mt-3 text-xs text-muted">{on && Math.abs(diff) < 0.5 && S.n === A.n ? T(TXT.noChange) : ltrNumbers(fill(TXT.tradesOf, { a: S.n, b: A.n }))}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-xl border border-border p-3" style={{ background: "color-mix(in srgb, var(--text) 4%, transparent)" }}>
                <div className="text-xs text-muted">{c.label}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span dir="ltr" className="tnum text-xl font-bold text-text">{c.now}</span>
                  {c.delta && <span dir="ltr" className="tnum text-xs font-semibold" style={{ color: tone(c.good) }}>{c.delta}</span>}
                </div>
                <div className="tnum mt-0.5 text-[11px] text-muted">{ltrNumbers(fill(TXT.was, { v: c.was }))}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- rules ---------- */}
        <aside className="wi-rules space-y-6 rounded-2xl border border-border p-5" style={cardBg}>
          <Group icon={<ShieldAlert size={15} />} title={T(TXT.discipline)}>
            <Rule on={ui.streak[0]} onToggle={(v) => set({ streak: [v, ui.streak[1]] })} label={T(TXT.iStreak).replace("{n}", "N")}>
              <Sentence text={T(TXT.streak)} parts={{ n: <Num value={ui.streak[1]} label="N" onChange={(v) => set({ streak: [true, Math.round(v)] })} /> }} />
            </Rule>
            <Rule on={ui.dayLoss[0]} onToggle={(v) => set({ dayLoss: [v, ui.dayLoss[1]] })} label={T(TXT.iDayLoss).replace("{v}", "")}>
              <Sentence text={T(TXT.dayLoss)} parts={{ n: <><Num value={ui.dayLoss[1]} step={10} label={unitLabel} onChange={(v) => set({ dayLoss: [true, v] })} /><span className="text-muted">{unitLabel}</span></> }} />
            </Rule>
            <Rule on={ui.dayGain[0]} onToggle={(v) => set({ dayGain: [v, ui.dayGain[1]] })} label={T(TXT.iDayGain).replace("{v}", "")}>
              <Sentence text={T(TXT.dayGain)} parts={{ n: <><Num value={ui.dayGain[1]} step={10} label={unitLabel} onChange={(v) => set({ dayGain: [true, v] })} /><span className="text-muted">{unitLabel}</span></> }} />
            </Rule>
            <Rule on={ui.maxDay[0]} onToggle={(v) => set({ maxDay: [v, ui.maxDay[1]] })} label={T(TXT.iMaxDay).replace("{n}", "N")}>
              <Sentence text={T(TXT.maxDay)} parts={{ n: <Num value={ui.maxDay[1]} label="N" onChange={(v) => set({ maxDay: [true, Math.round(v)] })} /> }} />
            </Rule>
          </Group>

          <Group icon={<CalendarOff size={15} />} title={T(TXT.filters)}>
            <div className="space-y-1.5">
              <div className="text-xs text-muted">{T(TXT.days)}</div>
              <div className="flex flex-wrap gap-1.5">
                {wd.map((name, d) => { const off = ui.skipDays.includes(d); return (
                  <button key={d} type="button" aria-pressed={off} onClick={() => set({ skipDays: off ? ui.skipDays.filter((x) => x !== d) : [...ui.skipDays, d].sort() })}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${off ? "border-[var(--loss)] text-[var(--loss)]" : "border-border text-muted hover:text-text"}`} style={off ? { background: "color-mix(in srgb, var(--loss) 10%, transparent)" } : undefined}>
                    {off && <X size={11} strokeWidth={2.5} />}{name}
                  </button>
                ); })}
              </div>
            </div>
            <Rule on={ui.hours[0]} onToggle={(v) => set({ hours: [v, ui.hours[1], ui.hours[2]] })} label={T(TXT.iHours).replace("{a}", "").replace("{b}", "")}>
              <Clock3 size={14} className="me-1.5 text-icon" />
              <Sentence text={T(TXT.hours)} parts={Object.fromEntries((["a", "b"] as const).map((p, j) => [p, (
                <select key={p} dir="ltr" aria-label={p} value={ui.hours[(j + 1) as 1 | 2]} onChange={(e) => { const h = [...ui.hours] as Ui["hours"]; h[0] = true; h[(j + 1) as 1 | 2] = Number(e.target.value); set({ hours: h }); }}
                  className="tnum mx-1 rounded-lg border border-border bg-[var(--bg)] px-1.5 py-0.5 text-sm text-text outline-none focus:border-[var(--icon)]">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
                </select>
              )]))} />
            </Rule>
            <div className="space-y-1.5">
              <div className="text-xs text-muted">{T(TXT.symbols)}</div>
              <div className="flex flex-wrap gap-1.5">
                {symbols.map(([s, n]) => { const off = ui.skipSymbols.includes(s); return (
                  <button key={s} type="button" aria-pressed={off} onClick={() => set({ skipSymbols: off ? ui.skipSymbols.filter((x) => x !== s) : [...ui.skipSymbols, s] })}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${off ? "border-[var(--loss)] text-[var(--loss)]" : "border-border text-muted hover:text-text"}`} style={off ? { background: "color-mix(in srgb, var(--loss) 10%, transparent)" } : undefined}>
                    {off && <X size={11} strokeWidth={2.5} />}{s}<span className="tnum opacity-60">{n}</span>
                  </button>
                ); })}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">{T(TXT.side)}</span>
              <Seg value={ui.side} options={[["both", T(TXT.both)], ["long", T(TXT.long)], ["short", T(TXT.short)]]} onChange={(v) => set({ side: v })} />
            </div>
          </Group>

          <Group icon={<Crosshair size={15} />} title={T(TXT.exits)} sub={T(TXT.exitsSub)}>
            {(["sl", "tp"] as const).map((w) => (
              <Rule key={w} on={ui[w][0]} onToggle={(v) => set({ [w]: [v, ui[w][1], ui[w][2]] } as Partial<Ui>)} label={T(w === "sl" ? TXT.iSl : TXT.iTp).replace("{v}", "")}>
                <Sentence text={T(w === "sl" ? TXT.sl : TXT.tp)} parts={{ n: <><Num key={`${w}${ui[w][2]}`} value={ui[w][1]} min={ui[w][2] === "R" ? 0.1 : 1} step={ui[w][2] === "R" ? 0.1 : 10} label={ui[w][2]} onChange={(v) => set({ [w]: [true, v, ui[w][2]] } as Partial<Ui>)} />{unitSeg(w)}</> }} />
              </Rule>
            ))}
          </Group>

          <button type="button" onClick={() => set(fresh(defUnit))} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text">
            <RotateCcw size={13} />{T(TXT.reset)}
          </button>
        </aside>

        {/* ---------- details ---------- */}
        <section className="wi-more space-y-4">
          <div className="rounded-2xl border border-border p-5" style={cardBg}>
            <div className="mb-3 font-heading text-sm font-semibold text-primary">{T(TXT.curve)}</div>
            <Curves a={curves.a} b={curves.b} at={curves.at} fmt={(v) => money(v)} labels={[T(TXT.actual), T(TXT.withRules)]} label={(i, d, x, y) => fill(TXT.at, { i, d, a: x, b: y })} />
          </div>
          {imp.length > 0 && (
            <div className="rounded-2xl border border-border p-5" style={cardBg}>
              <div className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold text-primary"><SlidersHorizontal size={15} className="text-icon" />{T(TXT.alone)}</div>
              <div className="space-y-3">
                {imp.map((x) => (
                  <div key={x.key}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-text">{ltrNumbers(ruleName(x.key))}</span>
                      <span dir="ltr" className="tnum shrink-0 font-semibold" style={{ color: tone(x.net > 0.5 ? true : x.net < -0.5 ? false : null) }}>{Math.abs(x.net) >= 0.5 ? money(x.net, true) : "0"}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--gauge-track)" }}>
                        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(Math.abs(x.net) / maxImp) * 100}%`, background: tone(x.net > 0.5 ? true : x.net < -0.5 ? false : null) }} />
                      </div>
                      <span className="shrink-0 text-[11px] text-muted">{ltrNumbers(x.skipped ? fill(TXT.skips, { n: x.skipped }) : x.changed ? fill(TXT.changes, { n: x.changed }) : T(TXT.nothing))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5 text-xs leading-relaxed text-muted">
            <p>{T(TXT.how)}</p>
            {notes.map((n) => <p key={n}>{ltrNumbers(n)}</p>)}
            {exitsOn && (ex.noPath > 0 || ex.unordered > 0) && onOpen && (
              <button type="button" onClick={() => onOpen("path")} className="mt-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-[var(--primary)]">{T(TXT.openPath)}</button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
