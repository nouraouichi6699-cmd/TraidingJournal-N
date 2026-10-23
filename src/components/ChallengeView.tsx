// Challenges: prop-firm evaluations tracked on the account's trades — the room left today and overall, the target, the
// trading days, a balance chart against the floor, and the chance to pass from here.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Flag, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Account, Lang, Trade } from "../types";
import { challengeState, TEMPLATES, type Challenge, type ChallengeState } from "../lib/challenge";
import { fmtMoney, ltrNumbers } from "../lib/money";
import { offsetMs, parseModel, type TimeModel } from "../lib/path";
import { readClock } from "../lib/pathData";
import { propOdds } from "../lib/tradeLab";

type L3 = Record<Lang, string>;
const T = {
  title: { en: "Prop challenges", ar: "تحديات التمويل", fr: "Challenges prop" },
  telegram: { en: "Get these warnings on Telegram →", ar: "استلم هذه التنبيهات على تيليغرام ←", fr: "Recevez ces alertes sur Telegram →" },
  lead: { en: "Your funded-account evaluation, checked on every trade: the target, the daily and overall loss limits, the trading days.", ar: "تقييم حسابك الممول مفحوصاً مع كل صفقة: الهدف، وحدّا الخسارة اليومية والكلية، وأيام التداول.", fr: "Votre évaluation de compte financé, vérifiée à chaque trade : l'objectif, les pertes max journalière et totale, les jours de trading." },
  new: { en: "New challenge", ar: "تحدٍّ جديد", fr: "Nouveau challenge" },
  emptyTitle: { en: "No challenge yet", ar: "لا يوجد تحدٍّ بعد", fr: "Aucun challenge" },
  emptyText: { en: "Enter your evaluation's rules once: Mizan checks them on every trade and shows how much you can still risk today.", ar: "أدخل قواعد تقييمك مرة واحدة، ويفحصها ميزان مع كل صفقة ويريك كم يمكنك أن تخاطر به اليوم.", fr: "Saisissez une fois les règles de votre évaluation : Mizan les vérifie à chaque trade et montre ce que vous pouvez encore risquer aujourd'hui." },
  noAccounts: { en: "Connect an account first.", ar: "اربط حساباً أولاً.", fr: "Connectez d'abord un compte." },
  active: { en: "In progress", ar: "قيد التقدم", fr: "En cours" },
  passed: { en: "Passed", ar: "ناجح", fr: "Réussi" },
  failed: { en: "Failed", ar: "فاشل", fr: "Échoué" },
  started: { en: "Started {d}", ar: "بدأ في {d}", fr: "Commencé le {d}" },
  dayN: { en: "day {n}", ar: "اليوم {n}", fr: "jour {n}" },
  dayNofM: { en: "day {n} of {m}", ar: "اليوم {n} من {m}", fr: "jour {n} sur {m}" },
  riskDaily: { en: "You can lose up to {m} more today before the daily limit.", ar: "يمكنك أن تخسر حتى {m} إضافية اليوم قبل حد الخسارة اليومية.", fr: "Vous pouvez encore perdre jusqu'à {m} aujourd'hui avant la limite journalière." },
  riskMax: { en: "You can lose up to {m} more before the overall loss limit.", ar: "يمكنك أن تخسر حتى {m} إضافية قبل حد الخسارة الكلية.", fr: "Vous pouvez encore perdre jusqu'à {m} avant la perte max totale." },
  riskZero: { en: "No room left: a loss now breaks a rule.", ar: "لم يبقَ هامش: أي خسارة الآن تكسر قاعدة.", fr: "Plus aucune marge : une perte maintenant enfreint une règle." },
  failedDaily: { en: "Failed on {d}: the day's loss reached {v} (limit {l}).", ar: "فشل في {d}: بلغت خسارة اليوم {v} (الحد {l}).", fr: "Échoué le {d} : la perte du jour a atteint {v} (limite {l})." },
  failedMax: { en: "Failed on {d}: the balance fell to {v}, under the floor of {l}.", ar: "فشل في {d}: نزل الرصيد إلى {v}، تحت الحد الأدنى {l}.", fr: "Échoué le {d} : le solde est tombé à {v}, sous le plancher de {l}." },
  failedTime: { en: "Failed: the {l} days allowed ended on {d}.", ar: "فشل: انتهت المهلة ({l} يوماً) في {d}.", fr: "Échoué : les {l} jours autorisés ont pris fin le {d}." },
  passedOn: { en: "Passed on {d}: target reached with every rule kept.", ar: "نجح في {d}: بلغ الهدف مع احترام كل القواعد.", fr: "Réussi le {d} : objectif atteint, toutes les règles respectées." },
  waitDays: { en: "Target reached: trade {n} more day(s) to meet the minimum of {m}.", ar: "تم بلوغ الهدف: تداول {n} يوم إضافي لتكمل الحد الأدنى ({m}).", fr: "Objectif atteint : tradez encore {n} jour(s) pour le minimum de {m}." },
  waitCons: { en: "Target reached, but your best day is {p}% of the profit (max {m}%): keep trading to spread it.", ar: "تم بلوغ الهدف، لكن أفضل يوم يمثل {p}% من الربح (الحد {m}%): واصل التداول لتوزيعه.", fr: "Objectif atteint, mais votre meilleur jour fait {p} % du profit (max {m} %) : continuez pour le répartir." },
  target: { en: "Profit target", ar: "هدف الربح", fr: "Objectif de profit" },
  toGo: { en: "{p}% · {m} to go", ar: "{p}% · بقي {m}", fr: "{p} % · reste {m}" },
  reached: { en: "Reached", ar: "تم بلوغه", fr: "Atteint" },
  noTarget: { en: "No target (funded account)", ar: "بلا هدف (حساب ممول)", fr: "Pas d'objectif (compte financé)" },
  daily: { en: "Daily loss today", ar: "خسارة اليوم", fr: "Perte du jour" },
  used: { en: "{u} of {l} used", ar: "استُعمل {u} من {l}", fr: "{u} sur {l} utilisés" },
  room: { en: "room {m}", ar: "الهامش {m}", fr: "marge {m}" },
  overall: { en: "Overall loss", ar: "الخسارة الكلية", fr: "Perte max totale" },
  floor: { en: "floor {m}", ar: "الحد الأدنى {m}", fr: "plancher {m}" },
  trailing: { en: "trailing", ar: "متحرك", fr: "suiveur" },
  none: { en: "Not set", ar: "غير محدد", fr: "Non défini" },
  days: { en: "Trading days", ar: "أيام التداول", fr: "Jours de trading" },
  ofMin: { en: "{n} of {m}", ar: "{n} من {m}", fr: "{n} sur {m}" },
  minMet: { en: "{n} · minimum {m} met", ar: "{n} · تحقق الحد الأدنى ({m})", fr: "{n} · minimum {m} atteint" },
  best: { en: "Best day", ar: "أفضل يوم", fr: "Meilleur jour" },
  share: { en: "{p}% of the profit (max {m}%)", ar: "{p}% من الربح (الحد {m}%)", fr: "{p} % du profit (max {m} %)" },
  odds: { en: "Chance to pass from here", ar: "فرصة النجاح من هنا", fr: "Chance de réussir d'ici" },
  oddsSub: { en: "fail {f}% · undecided {o}%", ar: "فشل {f}% · غير محسوم {o}%", fr: "échec {f} % · non tranché {o} %" },
  oddsDays: { en: " · about {n} trading days", ar: " · نحو {n} يوم تداول", fr: " · environ {n} jours de trading" },
  oddsHint: { en: "2,000 simulations replaying your own past trading days from the current balance (minimum days not counted).", ar: "2,000 محاكاة تعيد أيام تداولك السابقة انطلاقاً من الرصيد الحالي (دون احتساب الحد الأدنى للأيام).", fr: "2 000 simulations qui rejouent vos jours de trading passés depuis le solde actuel (jours minimum non comptés)." },
  pace: { en: "At your average trading day ({m}), about {n} more trading days to the target.", ar: "بمعدل يوم تداولك ({m})، يبقى نحو {n} يوم تداول حتى الهدف.", fr: "À votre journée moyenne ({m}), environ {n} jours de trading jusqu'à l'objectif." },
  note: { en: "Closed trades only, by the broker's day. Firms also count floating losses: keep a margin.", ar: "على الصفقات المغلقة فقط، بحسب يوم الوسيط. تحتسب الشركات الخسائر العائمة أيضاً، فاترك هامشاً.", fr: "Trades clôturés uniquement, par jour du courtier. Les sociétés comptent aussi les pertes latentes : gardez une marge." },
  balance: { en: "Balance", ar: "الرصيد", fr: "Solde" },
  edit: { en: "Edit", ar: "تعديل", fr: "Modifier" },
  remove: { en: "Remove", ar: "حذف", fr: "Supprimer" },
  confirmRemove: { en: "Remove this challenge? Your trades stay.", ar: "حذف هذا التحدي؟ تبقى صفقاتك كما هي.", fr: "Supprimer ce challenge ? Vos trades restent." },
  cancel: { en: "Cancel", ar: "إلغاء", fr: "Annuler" },
  formNew: { en: "New challenge", ar: "تحدٍّ جديد", fr: "Nouveau challenge" },
  formEdit: { en: "Edit challenge", ar: "تعديل التحدي", fr: "Modifier le challenge" },
  account: { en: "Account", ar: "الحساب", fr: "Compte" },
  from: { en: "Start from", ar: "ابدأ من", fr: "Partir de" },
  twoStep1: { en: "2-step · phase 1", ar: "مرحلتان · المرحلة 1", fr: "2 étapes · phase 1" },
  twoStep2: { en: "2-step · phase 2", ar: "مرحلتان · المرحلة 2", fr: "2 étapes · phase 2" },
  oneStep: { en: "1-step", ar: "مرحلة واحدة", fr: "1 étape" },
  funded: { en: "Funded account", ar: "حساب ممول", fr: "Compte financé" },
  name: { en: "Name", ar: "الاسم", fr: "Nom" },
  size: { en: "Account size", ar: "حجم الحساب", fr: "Taille du compte" },
  start: { en: "Start day", ar: "يوم البداية", fr: "Jour de début" },
  fTarget: { en: "Profit target % (empty = none)", ar: "هدف الربح % (فارغ = بلا هدف)", fr: "Objectif % (vide = aucun)" },
  fDaily: { en: "Max daily loss %", ar: "أقصى خسارة يومية %", fr: "Perte journalière max %" },
  ofSize: { en: "of the account size", ar: "من حجم الحساب", fr: "de la taille du compte" },
  ofDay: { en: "of the day's starting balance", ar: "من رصيد بداية اليوم", fr: "du solde de début de journée" },
  fMax: { en: "Max overall loss %", ar: "أقصى خسارة كلية %", fr: "Perte max totale %" },
  fTrailing: { en: "Trailing: follows the highest balance", ar: "متحرك: يتبع أعلى رصيد", fr: "Suiveur : suit le solde le plus haut" },
  fLock: { en: "Stops rising at the account size", ar: "يتوقف عند حجم الحساب", fr: "S'arrête à la taille du compte" },
  fMinDays: { en: "Minimum trading days", ar: "الحد الأدنى لأيام التداول", fr: "Jours de trading minimum" },
  fLimit: { en: "Time limit in days (empty = none)", ar: "المهلة بالأيام (فارغ = بلا حد)", fr: "Limite en jours (vide = aucune)" },
  fCons: { en: "Best day at most % of the profit (empty = none)", ar: "أفضل يوم بحد أقصى % من الربح (فارغ = بلا شرط)", fr: "Meilleur jour au plus % du profit (vide = aucune)" },
  formNote: { en: "Use your firm's exact rules: these are only typical starting values.", ar: "استعمل قواعد شركتك بدقة: هذه قيم شائعة للبداية فقط.", fr: "Utilisez les règles exactes de votre société : ce ne sont que des valeurs typiques." },
  save: { en: "Save", ar: "حفظ", fr: "Enregistrer" },
  invalid: { en: "Check the highlighted fields.", ar: "تحقّق من الحقول المحددة.", fr: "Vérifiez les champs signalés." },
} satisfies Record<string, L3>;

const KEY = "mizan-challenges";
const read = (): Challenge[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (l: Challenge[]) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage blocked */ } };
/** Challenges in local storage (synced with the account by settingsSync); re-read when the window regains focus. */
function useChallenges() {
  const [list, setList] = useState<Challenge[]>(read);
  useEffect(() => { const f = () => window.setTimeout(() => setList(read()), 1500); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  return [list, (next: Challenge[]) => { setList(next); write(next); }] as const;
}

const GUESS: TimeModel = { base: 2, dst: "us" };
/** Today in the account's clock: the broker's (Trade path's clock, else UTC+2/+3) for MT5, the device's for others. */
function todayFor(a: Account | undefined, now = Date.now()) {
  if (a?.platform !== "mt5") return new Date(now - new Date(now).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const c = readClock(), m = (c.override && parseModel(c.override)) || (c.auto[a.id] && parseModel(c.auto[a.id].m)) || GUESS;
  return new Date(now + offsetMs(m, now)).toISOString().slice(0, 10);
}
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const loc = (lang: Lang) => (lang === "ar" ? "ar-u-nu-latn" : lang);
const dayLabel = (d: string, lang: Lang) => new Intl.DateTimeFormat(loc(lang), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const dangerColor = (u: number) => (u >= 0.8 ? "#f87171" : u >= 0.5 ? "#f59e0b" : "var(--icon)");

function useWidth() {
  const ref = useRef<HTMLDivElement>(null), [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-skeleton">
      <div className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}

function BalanceChart({ c, s, money, lang }: { c: Challenge; s: ChallengeState; money: (v: number) => string; lang: Lang }) {
  const [ref, W] = useWidth();
  const rows = s.days, H = 150, L = 8, R = 70, TOP = 10, B = 20;
  if (rows.length < 1) return null;
  const goal = c.target != null ? c.size * (1 + c.target / 100) : null;
  const vals = [c.size, ...rows.map((r) => r.end), ...rows.flatMap((r) => (r.floor != null ? [r.floor] : [])), ...(goal != null ? [goal] : [])];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || c.size * 0.01) * 0.08; lo -= pad; hi += pad;
  const pw = Math.max(10, W - L - R), ph = H - TOP - B, n = rows.length;
  const x = (i: number) => L + ((i + 1) / n) * pw, y = (v: number) => TOP + ((hi - v) / (hi - lo)) * ph; // x(-1): the start
  const line = [`M${L},${y(c.size)}`, ...rows.map((r, i) => `L${x(i)},${y(r.end)}`)].join(" ");
  const floors = rows.map((r) => r.floor);
  const floorPath = floors.some((f) => f != null) ? [`M${L},${y(floors.find((f) => f != null) as number)}`, ...rows.map((r, i) => (r.floor == null ? "" : `L${x(i - 1) + (x(i) - x(i - 1)) / 2},${y(r.floor)} L${x(i)},${y(r.floor)}`))].join(" ") : null;
  const tag = (v: number, color: string, label: string) => (
    <g>
      <rect x={L + pw + 4} y={y(v) - 9} width={R - 6} height={18} rx={5} fill="var(--surface)" stroke={color} strokeWidth={1} />
      <text x={L + pw + 8} y={y(v) + 3.5} fontSize={9.5} fontWeight={700} fill={color}>{label}</text>
    </g>
  );
  return (
    <div ref={ref} dir="ltr" className="mt-4 w-full">
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label={T.balance[lang]}>
          <line x1={L} x2={L + pw} y1={y(c.size)} y2={y(c.size)} stroke="var(--border)" strokeDasharray="2 3" />
          {goal != null && <line x1={L} x2={L + pw} y1={y(goal)} y2={y(goal)} stroke="var(--profit)" strokeDasharray="5 4" />}
          {floorPath && <path d={floorPath} fill="none" stroke="#f87171" strokeWidth={1.2} strokeDasharray="5 4" />}
          <path d={line} fill="none" stroke="var(--icon)" strokeWidth={2} strokeLinejoin="round" />
          {rows.map((r, i) => <circle key={r.day} cx={x(i)} cy={y(r.end)} r={r.breach.length ? 4.5 : 2.5} fill={r.breach.length ? "#f87171" : "var(--icon)"} stroke="var(--surface)" strokeWidth={r.breach.length ? 1.5 : 0}><title>{`${r.day} · ${money(r.pnl)}`}</title></circle>)}
          {goal != null && tag(goal, "var(--profit)", money(goal).replace(/^\+/, ""))}
          {s.maxLoss && tag(s.maxLoss.floor, "#f87171", money(s.maxLoss.floor).replace(/^\+/, ""))}
          <circle cx={L} cy={y(c.size)} r={2.5} fill="var(--muted)" />
          <text x={L} y={H - 5} fontSize={10} fill="var(--muted)">{dayLabel(c.start, lang)}</text>
          {n > 1 && <text x={L + pw} y={H - 5} fontSize={10} fill="var(--muted)" textAnchor="end">{dayLabel(rows[n - 1].day, lang)}</text>}
        </svg>
      )}
    </div>
  );
}

function Card({ c, account, trades, lang, onEdit, onRemove }: { c: Challenge; account: Account; trades: Trade[]; lang: Lang; onEdit: () => void; onRemove: () => void }) {
  const L = (x: L3) => x[lang];
  const today = todayFor(account);
  const s = useMemo(() => challengeState(c, trades, today), [c, trades, today]);
  const [ask, setAsk] = useState(false);
  const cur = account.currency;
  const m = (v: number, sign = false) => fmtMoney(v, { sign, currency: cur });
  const tx = (v: string) => (lang === "ar" ? ltrNumbers(v) : v);
  // chance to pass from the current balance, replaying the account's own trading days (as Charts › Prop rules does)
  const odds = useMemo(() => {
    if (s.status !== "active" || !c.target || !s.target) return null;
    const bal = s.balance, goalLevel = c.size + s.target.amount;
    const dailyMoney = s.today ? s.today.limit : null, floor = s.maxLoss?.floor ?? null;
    const own = trades.filter((t) => t.accountId === c.accountId);
    const locked = c.trailing && c.trailLock && floor != null && floor >= c.size - 1e-9;
    return propOdds(own, bal, { dailyLossPct: dailyMoney != null ? (dailyMoney / bal) * 100 : 0, maxDDPct: floor != null ? ((bal - floor) / bal) * 100 : 0, targetPct: ((goalLevel - bal) / bal) * 100, trailing: c.trailing && !locked },
      { horizon: s.daysLeft != null ? Math.max(1, Math.round((s.daysLeft * 5) / 7)) : 250 });
  }, [s, c, trades]);

  const pill = s.status === "passed" ? ["border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]", <Check key="i" size={13} />] : s.status === "failed" ? ["border-[#f87171]/40 bg-[#f87171]/10 text-[#f87171]", <X key="i" size={13} />]
    : ["border-border text-text", <span key="i" className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-[var(--icon)] opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--icon)]" /></span>];
  const first = s.breaches[0];
  const banner = s.status === "failed" && first
    ? [first.rule === "daily" ? fill(L(T.failedDaily), { d: dayLabel(first.day, lang), v: m(first.value), l: m(first.limit) }) : first.rule === "max" ? fill(L(T.failedMax), { d: dayLabel(first.day, lang), v: m(first.value), l: m(first.limit) }) : fill(L(T.failedTime), { d: dayLabel(first.day, lang), l: first.limit }), "border-[#f87171]/50 bg-[#f87171]/10"]
    : s.status === "passed" && s.passedOn ? [fill(L(T.passedOn), { d: dayLabel(s.passedOn, lang) }), "border-[#22c55e]/50 bg-[#22c55e]/10"]
      : s.waiting.length ? [s.waiting.includes("days") ? fill(L(T.waitDays), { n: c.minDays - s.tradingDays, m: c.minDays }) : fill(L(T.waitCons), { p: Math.round((s.consistency?.share ?? 0) * 100), m: c.consistency ?? 0 }), "border-[var(--icon)] bg-primary-tint"]
        : s.risk ? [s.risk.amount <= 0 ? L(T.riskZero) : fill(L(s.risk.rule === "daily" ? T.riskDaily : T.riskMax), { m: m(s.risk.amount) }), s.risk.amount <= 0 || (s.risk.rule === "daily" ? s.today?.used ?? 0 : s.maxLoss?.used ?? 0) >= 0.8 ? "border-[#f87171]/50 bg-[#f87171]/10" : "border-[var(--icon)] bg-primary-tint"] : null;

  return (
    <article className="ch-card rounded-2xl border border-border p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-icon"><Flag size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="font-heading text-base font-semibold">{account.name} · {c.name}</h3>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${pill[0]}`}>{pill[1]}{L(T[s.status])}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted">{tx(`${fill(L(T.started), { d: dayLabel(c.start, lang) })} · ${c.limitDays ? fill(L(T.dayNofM), { n: s.daysUsed, m: c.limitDays }) : fill(L(T.dayN), { n: s.daysUsed })} · ${m(c.size)}`)}</p>
        </div>
        {!ask && (
          <div className="flex gap-1.5">
            <button type="button" onClick={onEdit} aria-label={L(T.edit)} title={L(T.edit)} className="icon-btn !h-8 !w-8 border border-border"><Pencil size={14} /></button>
            <button type="button" onClick={() => setAsk(true)} aria-label={L(T.remove)} title={L(T.remove)} className="icon-btn !h-8 !w-8 border border-border text-[#f87171]"><Trash2 size={14} /></button>
          </div>
        )}
      </div>
      {ask && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
          <span className="me-auto">{L(T.confirmRemove)}</span>
          <button type="button" onClick={() => setAsk(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">{L(T.cancel)}</button>
          <button type="button" onClick={onRemove} className="rounded-lg bg-loss px-3 py-1.5 text-xs font-semibold text-white">{L(T.remove)}</button>
        </div>
      )}

      {banner && <p className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${banner[1]}`}>{tx(banner[0])}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted">{L(T.target)}</p>
          {s.target ? (
            <>
              <p className={`mt-1 text-lg font-semibold tnum ${s.pnl >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}`} dir="ltr">{m(s.pnl, true)} <span className="text-sm font-medium text-muted">/ {m(s.target.amount)}</span></p>
              <Bar value={s.status === "passed" ? 1 : s.target.progress} color="var(--profit)" />
              <p className="mt-1.5 text-xs text-muted">{s.status === "passed" || s.target.left <= 0 ? L(T.reached) : tx(fill(L(T.toGo), { p: Math.round(s.target.progress * 100), m: m(s.target.left) }))}</p>
            </>
          ) : <p className="mt-1 text-sm text-muted">{L(T.noTarget)}</p>}
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted">{L(T.daily)}</p>
          {s.today ? (
            <>
              <p className={`mt-1 text-lg font-semibold tnum ${s.today.pnl > 0 ? "text-[#22c55e]" : s.today.pnl < 0 ? "text-[#f87171]" : ""}`} dir="ltr">{m(s.today.pnl, true)}</p>
              <Bar value={s.today.used} color={dangerColor(s.today.used)} />
              <p className="mt-1.5 text-xs text-muted">{tx(`${fill(L(T.used), { u: m(Math.max(0, -s.today.pnl)), l: m(s.today.limit) })} · ${fill(L(T.room), { m: m(s.today.room) })}`)}</p>
            </>
          ) : <p className="mt-1 text-sm text-muted">{L(T.none)}</p>}
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted">{L(T.overall)}{c.trailing && c.max != null && <span className="rounded-full border border-border px-1.5 text-[10px]">{L(T.trailing)}</span>}</p>
          {s.maxLoss ? (
            <>
              <p className="mt-1 text-lg font-semibold tnum" dir="ltr">{m(s.maxLoss.room)}</p>
              <Bar value={s.maxLoss.used} color={dangerColor(s.maxLoss.used)} />
              <p className="mt-1.5 text-xs text-muted">{tx(`${fill(L(T.room), { m: m(s.maxLoss.room) })} · ${fill(L(T.floor), { m: m(s.maxLoss.floor) })}`)}</p>
            </>
          ) : <p className="mt-1 text-sm text-muted">{L(T.none)}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{L(T.days)}</span>
          {c.minDays > 0 && c.minDays <= 12 ? (
            <span className="flex gap-1" aria-label={fill(L(T.ofMin), { n: s.tradingDays, m: c.minDays })}>{Array.from({ length: c.minDays }, (_, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < s.tradingDays ? "bg-[var(--icon)]" : "border border-border"}`} />)}</span>
          ) : null}
          <span className="font-semibold">{c.minDays > 0 ? tx(fill(L(s.tradingDays >= c.minDays ? T.minMet : T.ofMin), { n: s.tradingDays, m: c.minDays })) : s.tradingDays}</span>
        </div>
        {s.consistency && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{L(T.best)}</span>
            <span className={`font-semibold ${s.consistency.ok ? "" : "text-[#f59e0b]"}`}>{tx(fill(L(T.share), { p: Math.round(s.consistency.share * 100), m: c.consistency ?? 0 }))}</span>
          </div>
        )}
        {odds && (
          <div className="flex items-center gap-2" title={L(T.oddsHint)}>
            <span className="text-xs text-muted">{L(T.odds)}</span>
            <span className="font-semibold tnum">{Math.round(odds.pass)}%</span>
            <span className="text-xs text-muted">{tx(fill(L(T.oddsSub), { f: Math.round(odds.fail), o: Math.round(odds.open) }) + (odds.medianDays != null ? fill(L(T.oddsDays), { n: odds.medianDays }) : ""))}</span>
          </div>
        )}
      </div>

      <BalanceChart c={c} s={s} money={(v) => m(v)} lang={lang} />

      {s.daysToTarget != null && s.avgDay != null && <p className="mt-2 text-xs text-muted">{tx(fill(L(T.pace), { m: m(s.avgDay, true), n: s.daysToTarget }))}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">{L(T.note)}{odds ? ` ${L(T.oddsHint)}` : ""}</p>
    </article>
  );
}

type Draft = { accountId: string; tpl: keyof typeof TEMPLATES | "custom"; name: string; size: string; start: string; target: string; daily: string; dailyBase: "size" | "dayStart"; max: string; trailing: boolean; trailLock: boolean; minDays: string; limitDays: string; consistency: string };
const s2 = (v: number | null | undefined) => (v == null ? "" : String(v));
const fromChallenge = (c: Challenge): Draft => ({ accountId: c.accountId, tpl: "custom", name: c.name, size: String(c.size), start: c.start, target: s2(c.target), daily: s2(c.daily), dailyBase: c.dailyBase, max: s2(c.max), trailing: c.trailing, trailLock: c.trailLock, minDays: String(c.minDays), limitDays: s2(c.limitDays), consistency: s2(c.consistency) });

function Form({ lang, accounts, trades, initial, onSave, onClose }: { lang: Lang; accounts: Account[]; trades: Trade[]; initial: Challenge | null; onSave: (c: Challenge) => void; onClose: () => void }) {
  const L = (x: L3) => x[lang];
  const panel = useRef<HTMLDivElement>(null);
  const tplName = (k: keyof typeof TEMPLATES) => ({ twoStep1: "Phase 1", twoStep2: "Phase 2", oneStep: "1-step", funded: "Funded" })[k];
  const applyTpl = (d: Draft, k: keyof typeof TEMPLATES): Draft => { const t = TEMPLATES[k]; return { ...d, tpl: k, name: tplName(k), target: s2(t.target), daily: s2(t.daily), dailyBase: t.dailyBase, max: s2(t.max), trailing: t.trailing, trailLock: t.trailLock, minDays: String(t.minDays), limitDays: s2(t.limitDays), consistency: s2(t.consistency) }; };
  const [d, setD] = useState<Draft>(() => {
    if (initial) return fromChallenge(initial);
    const a = accounts[0];
    return applyTpl({ accountId: a.id, tpl: "twoStep1", name: "", size: String(a.startBalance > 0 ? a.startBalance : 100000), start: todayFor(a), target: "", daily: "", dailyBase: "size", max: "", trailing: false, trailLock: true, minDays: "0", limitDays: "", consistency: "" }, "twoStep1");
  });
  const [tried, setTried] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const pct = (v: string, opt: boolean) => { const n = num(v); return n == null ? opt : Number.isFinite(n) && n > 0 && n < 100; };
  const int = (v: string, opt: boolean) => { const n = num(v); return n == null ? opt : Number.isInteger(n) && n >= 0 && n <= 3650; };
  const bad = {
    name: !d.name.trim(), size: !(Number(num(d.size)) > 0), start: !/^\d{4}-\d{2}-\d{2}$/.test(d.start), target: !pct(d.target, true), daily: !pct(d.daily, true), max: !pct(d.max, true),
    minDays: !int(d.minDays, true), limitDays: !int(d.limitDays, true) || num(d.limitDays) === 0, consistency: !pct(d.consistency, true),
  };
  const ok = !Object.values(bad).some(Boolean);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!ok) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(), accountId: d.accountId, name: d.name.trim(), start: d.start, size: Number(num(d.size)), target: num(d.target), daily: num(d.daily), dailyBase: d.dailyBase,
      max: num(d.max), trailing: d.trailing && num(d.max) != null, trailLock: d.trailLock, minDays: num(d.minDays) ?? 0, limitDays: num(d.limitDays), consistency: num(d.consistency),
    });
  };
  const field = (k: keyof typeof bad) => `field ${tried && bad[k] ? "!border-[var(--loss)]" : ""}`;
  const lbl = "flex flex-col gap-1.5 text-sm font-medium";
  const firstTrade = (id: string) => trades.filter((t) => t.accountId === id && t.entryTime).map((t) => (t.entryTime as string).slice(0, 10)).sort()[0];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ch-form-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 outline-none">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="ch-form-title" className="font-heading text-xl font-semibold">{L(initial ? T.formEdit : T.formNew)}</h2>
          <button type="button" aria-label={L(T.cancel)} onClick={onClose} className="icon-btn -m-1.5"><X size={20} /></button>
        </div>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <label className={lbl}>{L(T.account)}
            <select className="field" value={d.accountId} onChange={(e) => { const a = accounts.find((x) => x.id === e.target.value); setD({ ...d, accountId: e.target.value, size: a && a.startBalance > 0 ? String(a.startBalance) : d.size }); }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1.5 text-sm font-medium">{L(T.from)}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((k) => (
                <button key={k} type="button" aria-pressed={d.tpl === k} onClick={() => setD(applyTpl(d, k))} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${d.tpl === k ? "border-[var(--icon)] bg-primary-tint text-primary" : "border-border text-muted hover:text-text"}`}>{L(T[k])}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={lbl}>{L(T.name)}<input className={field("name")} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value, tpl: d.tpl })} /></label>
            <label className={lbl}>{L(T.size)}<input className={field("size")} inputMode="decimal" dir="ltr" value={d.size} onChange={(e) => setD({ ...d, size: e.target.value })} /></label>
            <div className="flex flex-col gap-1.5">
              <label className={lbl}>{L(T.start)}<input className={field("start")} type="date" dir="ltr" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} /></label>
              {firstTrade(d.accountId) && firstTrade(d.accountId) < d.start && <button type="button" onClick={() => setD({ ...d, start: firstTrade(d.accountId) })} className="self-start text-xs font-semibold text-icon hover:underline"><span dir="ltr">↺ {firstTrade(d.accountId)}</span></button>}
            </div>
            <label className={lbl}>{L(T.fTarget)}<input className={field("target")} inputMode="decimal" dir="ltr" value={d.target} onChange={(e) => setD({ ...d, target: e.target.value, tpl: "custom" })} /></label>
            <div className="flex flex-col gap-1.5">
              <label className={lbl}>{L(T.fDaily)}<input className={field("daily")} inputMode="decimal" dir="ltr" value={d.daily} onChange={(e) => setD({ ...d, daily: e.target.value, tpl: "custom" })} /></label>
              <select className="field" aria-label={`${L(T.fDaily)}: ${L(T.ofSize)} / ${L(T.ofDay)}`} value={d.dailyBase} onChange={(e) => setD({ ...d, dailyBase: e.target.value as Draft["dailyBase"], tpl: "custom" })}>
                <option value="size">{L(T.ofSize)}</option><option value="dayStart">{L(T.ofDay)}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={lbl}>{L(T.fMax)}<input className={field("max")} inputMode="decimal" dir="ltr" value={d.max} onChange={(e) => setD({ ...d, max: e.target.value, tpl: "custom" })} /></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[var(--icon)]" checked={d.trailing} onChange={(e) => setD({ ...d, trailing: e.target.checked, tpl: "custom" })} />{L(T.fTrailing)}</label>
              {d.trailing && <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[var(--icon)]" checked={d.trailLock} onChange={(e) => setD({ ...d, trailLock: e.target.checked, tpl: "custom" })} />{L(T.fLock)}</label>}
            </div>
            <label className={lbl}>{L(T.fMinDays)}<input className={field("minDays")} inputMode="numeric" dir="ltr" value={d.minDays} onChange={(e) => setD({ ...d, minDays: e.target.value, tpl: "custom" })} /></label>
            <label className={lbl}>{L(T.fLimit)}<input className={field("limitDays")} inputMode="numeric" dir="ltr" value={d.limitDays} onChange={(e) => setD({ ...d, limitDays: e.target.value, tpl: "custom" })} /></label>
            <label className={`${lbl} sm:col-span-2`}>{L(T.fCons)}<input className={field("consistency")} inputMode="decimal" dir="ltr" value={d.consistency} onChange={(e) => setD({ ...d, consistency: e.target.value, tpl: "custom" })} /></label>
          </div>
          <p className="text-xs text-muted">{L(T.formNote)}</p>
          {tried && !ok && <p className="text-sm text-loss" role="alert">{L(T.invalid)}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted hover:text-text">{L(T.cancel)}</button>
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">{L(T.save)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ChallengeView({ lang, accounts, trades, onOpenProfile }: { lang: Lang; accounts: Account[]; trades: Trade[]; onOpenProfile?: () => void }) {
  const L = (x: L3) => x[lang];
  const [list, setList] = useChallenges();
  const [editing, setEditing] = useState<Challenge | "new" | null>(null);
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const shown = list.filter((c) => byId.has(c.accountId));
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold">{L(T.title)}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{L(T.lead)}</p>
          {onOpenProfile && shown.length > 0 && <button type="button" onClick={onOpenProfile} className="mt-1.5 text-xs font-semibold text-icon hover:underline">{L(T.telegram)}</button>}
        </div>
        {accounts.length > 0 && shown.length > 0 && (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"><Plus size={16} />{L(T.new)}</button>
        )}
      </header>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-tint text-icon"><Flag size={22} /></span>
          <p className="font-heading text-lg font-semibold">{L(T.emptyTitle)}</p>
          <p className="max-w-md text-sm text-muted">{accounts.length ? L(T.emptyText) : L(T.noAccounts)}</p>
          {accounts.length > 0 && <button type="button" onClick={() => setEditing("new")} className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"><Plus size={16} />{L(T.new)}</button>}
        </div>
      ) : (
        shown.map((c) => (
          <Card key={c.id} c={c} account={byId.get(c.accountId) as Account} trades={trades} lang={lang} onEdit={() => setEditing(c)} onRemove={() => setList(list.filter((x) => x.id !== c.id))} />
        ))
      )}
      {editing && accounts.length > 0 && (
        <Form lang={lang} accounts={accounts} trades={trades} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSave={(c) => { setList(editing === "new" ? [c, ...list] : list.map((x) => (x.id === c.id ? c : x))); setEditing(null); }} />
      )}
    </section>
  );
}
