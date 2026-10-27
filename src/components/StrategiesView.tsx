// Strategies: the trading strategies most used today, in a list with search and five groups. Each one has its page:
// a picture that plays, the idea, the key concepts, the markets, timeframes and sessions, the entry checklist, the
// stop and the target, and the usual mistakes. The trader keeps their own strategies at the top of the list, and a
// strategy linked to trades in the journal shows their results. On a phone the list folds above the page.
import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, BarChart3, BookOpen, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock, Droplets, Goal, Layers, Pencil, PenLine, Plus, RotateCcw, Search, ShieldAlert, Star, StickyNote, Waves, X } from "lucide-react";
import type { Account, Lang, Trade } from "../types";
import type { Key } from "../i18n";
import { GROUPS, STRATEGIES, norm, searchStrategies, type Group, type Id, type Market, type Session, type StrategyText, type Style } from "../lib/strategies";
import { EN } from "../lib/strategyText.en";
import { AR } from "../lib/strategyText.ar";
import { FR } from "../lib/strategyText.fr";
import { commonCurrency, fmtMoney, ltrNumbers } from "../lib/money";
import { deleteCustom, readLinks, readMine, resultsOf, setMine, type AnyId } from "../lib/myStrategies";
import { inkOn, readCustom, saveCustom, type CustomStrategy } from "../lib/customStrategies";
import { TOOL_BY_ID, TOOL_GROUPS, TOOL_GROUP_LABEL, toolName } from "../lib/tools";
import Private from "./Private";
import CustomStrategyForm, { TOOL_ICON } from "./CustomStrategyForm";
import { Dot } from "./StrategyPicker";
import StrategyDiagram from "./StrategyDiagram";

type L3 = Record<Lang, string>;
const TEXT: Record<Lang, Record<Id, StrategyText>> = { en: EN, ar: AR, fr: FR };
const SHUT = "mizan-strategy-groups"; // the list's folded groups, on this device
const ALL = [EN, AR, FR];

const T = {
  title: { en: "Strategies", ar: "الاستراتيجيات", fr: "Stratégies" },
  lead: { en: "The trading strategies most used today: the idea of each one, its picture, the entry checklist and the usual traps.", ar: "أكثر استراتيجيات التداول استعمالاً اليوم: فكرة كل واحدة ورسمها وشروط الدخول والأخطاء الشائعة.", fr: "Les stratégies de trading les plus utilisées aujourd'hui : l'idée de chacune, son schéma, la check-list d'entrée et les pièges courants." },
  search: { en: "Search a strategy", ar: "ابحث عن استراتيجية", fr: "Rechercher une stratégie" },
  clear: { en: "Clear", ar: "مسح", fr: "Effacer" },
  none: { en: "No strategy matches.", ar: "لا توجد استراتيجية مطابقة.", fr: "Aucune stratégie ne correspond." },
  count: { en: "{n} strategies", ar: "{n} استراتيجية", fr: "{n} stratégies" },
  replay: { en: "Replay", ar: "إعادة", fr: "Rejouer" },
  idea: { en: "The idea", ar: "الفكرة", fr: "L'idée" },
  concepts: { en: "Key concepts", ar: "المفاهيم الأساسية", fr: "Concepts clés" },
  markets: { en: "Markets", ar: "الأسواق", fr: "Marchés" },
  tf: { en: "Timeframes", ar: "الأطر الزمنية", fr: "Unités de temps" },
  sessions: { en: "Sessions", ar: "الجلسات", fr: "Sessions" },
  check: { en: "Entry checklist", ar: "شروط الدخول", fr: "Check-list d'entrée" },
  stop: { en: "Stop loss", ar: "وقف الخسارة", fr: "Stop loss" },
  target: { en: "Target", ar: "الهدف", fr: "Objectif" },
  mistakes: { en: "Common mistakes", ar: "أخطاء شائعة", fr: "Erreurs fréquentes" },
  prev: { en: "Previous", ar: "السابقة", fr: "Précédente" },
  next: { en: "Next", ar: "التالية", fr: "Suivante" },
  addMine: { en: "Add to my strategies", ar: "أضف إلى استراتيجياتي", fr: "Ajouter à mes stratégies" },
  inMine: { en: "In my strategies", ar: "ضمن استراتيجياتي", fr: "Dans mes stratégies" },
  mine: { en: "My strategies", ar: "استراتيجياتي", fr: "Mes stratégies" },
  results: { en: "Your results", ar: "نتائجك", fr: "Vos résultats" },
  closed: { en: "Closed trades", ar: "صفقات مغلقة", fr: "Trades clôturés" },
  winRate: { en: "Win rate", ar: "نسبة الربح", fr: "Taux de réussite" },
  net: { en: "Net P&L", ar: "صافي الربح", fr: "P&L net" },
  openN: { en: "+ {n} open", ar: "+ {n} مفتوحة", fr: "+ {n} ouvert(s)" },
  linkHint: { en: "Link your trades to this strategy in the Journal (the Strategy column): its results will show here.", ar: "اربط صفقاتك بهذه الاستراتيجية من اليوميات (عمود الاستراتيجية)، وستظهر نتائجها هنا.", fr: "Liez vos trades à cette stratégie dans le Journal (colonne Stratégie) : ses résultats s'afficheront ici." },
  toJournal: { en: "Open the Journal", ar: "افتح اليوميات", fr: "Ouvrir le Journal" },
  newOwn: { en: "New strategy", ar: "استراتيجية جديدة", fr: "Nouvelle stratégie" },
  yours: { en: "Your strategy", ar: "استراتيجيتك", fr: "Votre stratégie" },
  nTools: { en: "{n} indicators and tools", ar: "{n} من المؤشرات والأدوات", fr: "{n} indicateurs et outils" },
  edit: { en: "Edit", ar: "تعديل", fr: "Modifier" },
  noTools: { en: "No indicator chosen yet.", ar: "لم تختر أي مؤشر بعد.", fr: "Aucun indicateur choisi pour l'instant." },
  notesT: { en: "Notes", ar: "ملاحظات", fr: "Notes" },
  addRules: { en: "Add your entry checklist, stop and target with Edit.", ar: "أضف شروط الدخول والوقف والهدف من زر التعديل.", fr: "Ajoutez votre check-list, votre stop et votre objectif avec Modifier." },
  note: { en: "For education only, not financial advice. Test a strategy on a demo account and in your journal before you risk real money.", ar: "محتوى تعليمي فقط وليس نصيحة مالية. جرّب أي استراتيجية على حساب تجريبي وفي سجلّك قبل أن تخاطر بمال حقيقي.", fr: "Contenu éducatif, pas un conseil financier. Testez une stratégie sur un compte démo et dans votre journal avant de risquer de l'argent réel." },
};
const GROUP: Record<Group, { icon: typeof Droplets; label: L3 }> = {
  liquidity: { icon: Droplets, label: { en: "Liquidity & smart money", ar: "السيولة والأموال الذكية", fr: "Liquidité et smart money" } },
  levels: { icon: Layers, label: { en: "Levels", ar: "المستويات", fr: "Niveaux" } },
  volume: { icon: BarChart3, label: { en: "Volume & order flow", ar: "الحجم وتدفق الأوامر", fr: "Volume et order flow" } },
  sessions: { icon: Clock, label: { en: "Sessions & time", ar: "الجلسات والوقت", fr: "Sessions et horaires" } },
  waves: { icon: Waves, label: { en: "Waves & patterns", ar: "الموجات والأنماط", fr: "Vagues et figures" } },
};
const LEVEL: Record<1 | 2 | 3, L3> = { 1: { en: "Beginner", ar: "مبتدئ", fr: "Débutant" }, 2: { en: "Intermediate", ar: "متوسط", fr: "Intermédiaire" }, 3: { en: "Advanced", ar: "متقدم", fr: "Avancé" } };
const STYLE: Record<Style, L3> = { scalp: { en: "Scalping", ar: "سكالبينغ", fr: "Scalping" }, day: { en: "Day trading", ar: "تداول يومي", fr: "Day trading" }, swing: { en: "Swing", ar: "سوينغ", fr: "Swing" } };
const MARKET: Record<Market, L3> = {
  fx: { en: "Forex", ar: "الفوركس", fr: "Forex" }, gold: { en: "Gold", ar: "الذهب", fr: "Or" }, indices: { en: "Indices", ar: "المؤشرات", fr: "Indices" },
  crypto: { en: "Crypto", ar: "الكريبتو", fr: "Crypto" }, stocks: { en: "Stocks", ar: "الأسهم", fr: "Actions" }, futures: { en: "Futures", ar: "العقود الآجلة", fr: "Futures" },
};
const SESSION: Record<Session, L3> = { asia: { en: "Asia", ar: "آسيا", fr: "Asie" }, london: { en: "London", ar: "لندن", fr: "Londres" }, ny: { en: "New York", ar: "نيويورك", fr: "New York" }, any: { en: "Any session", ar: "كل الجلسات", fr: "Toutes les sessions" } };
/** The words written on the diagrams. */
const WORDS: Record<Lang, Record<string, string>> = {
  en: { entry: "Entry", demand: "Demand", supply: "Supply", support: "Support", resistance: "Resistance", break: "Break", retest: "Retest", sweep: "Sweep", open: "Open", neckline: "Neckline", news: "News", absorption: "Absorption", sellside: "Sell side", buyside: "Buy side", asia: "Asia", london: "London" },
  ar: { entry: "دخول", demand: "طلب", supply: "عرض", support: "دعم", resistance: "مقاومة", break: "كسر", retest: "إعادة اختبار", sweep: "سحب", open: "الافتتاح", neckline: "خط العنق", news: "خبر", absorption: "امتصاص", sellside: "جانب البيع", buyside: "جانب الشراء", asia: "آسيا", london: "لندن" },
  fr: { entry: "Entrée", demand: "Demande", supply: "Offre", support: "Support", resistance: "Résistance", break: "Cassure", retest: "Retest", sweep: "Sweep", open: "Ouverture", neckline: "Ligne de cou", news: "News", absorption: "Absorption", sellside: "Côté vendeur", buyside: "Côté acheteur", asia: "Asie", london: "Londres" },
};

const Dots = ({ n }: { n: number }) => (
  <span className="inline-flex gap-0.5" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? "bg-[var(--icon)]" : "bg-border"}`} />)}</span>
);
const Card = ({ title, icon: Icon, tone = "text-icon", children }: { title: string; icon: typeof Droplets; tone?: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
    <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold"><Icon size={16} className={tone} />{title}</h3>
    {children}
  </section>
);

export default function StrategiesView({ lang, t: tr, trades, accounts, onOpenJournal }: { lang: Lang; t: (k: Key) => string; trades: Trade[]; accounts: Account[]; onOpenJournal: () => void }) {
  const L = (x: L3) => x[lang];
  const tx = TEXT[lang];
  const n = (s: string) => (lang === "ar" ? ltrNumbers(s) : s); // numbers keep their order inside Arabic text
  const [id, setId] = useState<AnyId>("ict");
  const [custom, setCustom] = useState(readCustom);
  const [editing, setEditing] = useState<CustomStrategy | "new" | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false); // the list, on a phone
  const [play, setPlay] = useState(0);
  // Each group of the list opens and closes like a window, remembered on this device; a search opens every group with a match.
  const [shut, setShut] = useState<string[]>(() => { try { const v = JSON.parse(localStorage.getItem(SHUT) ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } });
  const fold = (g: string) => setShut((was) => {
    const next = was.includes(g) ? was.filter((x) => x !== g) : [...was, g];
    try { localStorage.setItem(SHUT, JSON.stringify(next)); } catch { /* kept for this visit */ }
    return next;
  });
  const top = useRef<HTMLDivElement>(null);
  const found = useMemo(() => searchStrategies(q, ALL), [q]);
  // The page shown: one of the trader's own, else a library strategy (the first one if the id is gone).
  const lib = STRATEGIES.find((x) => x.id === id), own = lib ? undefined : custom.find((c) => c.id === id);
  const s = lib ?? STRATEGIES[0], t = tx[s.id], curId: AnyId = own ? own.id : s.id;
  const at = STRATEGIES.indexOf(s), prev = STRATEGIES[at - 1], next = STRATEGIES[at + 1];
  const G = GROUP[s.group];
  const [mine, setMineState] = useState(readMine);
  const links = useMemo(readLinks, []);
  const res = useMemo(() => resultsOf(curId, trades, links), [curId, trades, links]);
  const cur = commonCurrency([...new Set(trades.filter((x) => links[x.key] === curId).map((x) => x.accountId))].map((a) => ({ currency: accounts.find((y) => y.id === a)?.currency ?? "" })));
  const toolsLine = (c: CustomStrategy) => c.tools.slice(0, 3).map((x) => toolName(TOOL_BY_ID.get(x)!, lang)).join(" · ") + (c.tools.length > 3 ? ` +${c.tools.length - 3}` : "");
  const customFound = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return words.length ? custom.filter((c) => { const h = norm(`${c.name} ${c.tools.map((x) => { const tl = TOOL_BY_ID.get(x)!; return `${tl.n} ${tl.ar ?? ""} ${tl.fr ?? ""}`; }).join(" ")}`); return words.every((w) => h.includes(w)); }) : custom;
  }, [q, custom]);
  const isMine = mine.includes(s.id);

  const pick = (v: AnyId) => {
    setId(v);
    setOpen(false);
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 12, behavior: "smooth" });
  };

  // The list's rows: a library strategy (its level) or one of the trader's own (its color and tools).
  type Row = { id: AnyId; name: string; sub: string; level?: 1 | 2 | 3; color?: string };
  const libRow = (x: (typeof STRATEGIES)[number]): Row => ({ id: x.id, name: x.name, sub: n(tx[x.id].tag), level: x.level });
  const ownRow = (c: CustomStrategy): Row => ({ id: c.id, name: c.name, sub: c.tools.length ? toolsLine(c) : L(T.noTools), color: c.color });
  const mineRows: Row[] = [
    ...mine.map((m) => { const x = found.find((y) => y.id === m); if (x) return libRow(x); const c = customFound.find((y) => y.id === m); return c ? ownRow(c) : null; }).filter((r): r is Row => !!r),
    ...customFound.filter((c) => !mine.includes(c.id)).map(ownRow),
  ];
  const list = (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(T.search)} aria-label={L(T.search)}
          onKeyDown={(e) => { const first = mineRows[0]?.id ?? found[0]?.id; if (e.key === "Enter" && first) pick(first); if (e.key === "Escape") setQ(""); }}
          className="w-full rounded-xl border border-border bg-bg py-2 pe-8 ps-9 text-sm outline-none placeholder:text-muted focus:border-[var(--icon)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden" />
        {q && <button type="button" onClick={() => setQ("")} aria-label={L(T.clear)} className="absolute end-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-text"><X size={14} /></button>}
      </label>
      <button type="button" onClick={() => setEditing("new")} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--icon)] px-3 py-2 text-sm font-semibold text-icon transition-colors hover:bg-primary-tint">
        <Plus size={15} />{L(T.newOwn)}
      </button>
      {!found.length && !customFound.length && <p className="px-2 py-6 text-center text-sm text-muted">{L(T.none)}</p>}
      {([["mine", Star, L(T.mine), mineRows], ...GROUPS.map((g) => [g, GROUP[g].icon, L(GROUP[g].label), found.filter((x) => x.group === g).map(libRow)])] as [string, typeof Star, string, Row[]][]).map(([g, Icon, label, items]) => {
        if (!items.length) return null;
        const open = !!q || !shut.includes(g);
        return (
          <div key={g} className="overflow-hidden rounded-xl border border-border bg-bg/40">
            <button type="button" onClick={() => fold(g)} disabled={!!q} aria-expanded={open} aria-controls={`sg-${g}`}
              className="flex w-full items-center gap-1.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted transition-colors hover:bg-primary-tint hover:text-text disabled:cursor-default disabled:hover:bg-transparent">
              <Icon size={12} className="shrink-0 text-icon" /><span className="truncate">{label}</span>
              <span className="ms-auto tabular-nums">{items.length}</span>
              <ChevronDown size={14} className={`shrink-0 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
            </button>
            <div id={`sg-${g}`} className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className={`min-h-0 overflow-hidden transition-[visibility] duration-300 motion-reduce:transition-none ${open ? "visible" : "invisible"}`}>
            <div className="flex flex-col gap-0.5 border-t border-border p-1">
              {items.map((x) => {
                const on = x.id === curId;
                return (
                  <button key={x.id} type="button" onClick={() => pick(x.id)} aria-current={on ? "page" : undefined}
                    className={`group relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-start transition-colors ${on ? "" : "hover:bg-primary-tint"}`}>
                    {on && <motion.span layoutId={`strategy-pill-${g === "mine" ? "mine" : "all"}`} className="absolute inset-0 rounded-xl border border-[var(--icon)] bg-primary-tint" transition={{ type: "spring", stiffness: 260, damping: 30 }} />}
                    <span className="relative min-w-0 flex-1">
                      <span dir={x.color ? "auto" : "ltr"} className={`block truncate text-sm font-medium rtl:text-right ${on ? "text-icon" : ""}`}>{x.name}</span>
                      <span className="block truncate text-xs text-muted">{x.sub}</span>
                    </span>
                    <span className="relative">{x.color ? <Dot color={x.color} /> : <Dots n={x.level ?? 1} />}</span>
                  </button>
                );
              })}
            </div>
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const results = (
              <Card title={L(T.results)} icon={Star}>
                {res.linked > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      [L(T.closed), String(res.closed), res.linked > res.closed ? L(T.openN).replace("{n}", String(res.linked - res.closed)) : "", ""],
                      [L(T.winRate), res.winRate == null ? "—" : `${Math.round(res.winRate)}%`, "", ""],
                      [L(T.net), res.closed ? fmtMoney(res.net, { sign: true, currency: cur }) : "—", "", res.net > 0 ? "text-[#22c55e]" : res.net < 0 ? "text-[#f87171]" : ""],
                    ] as [string, string, string, string][]).map(([label, value, sub, tone], i) => (
                      <div key={label} className="min-w-0 rounded-xl border border-border bg-bg/60 p-3">
                        <p className="truncate text-xs text-muted">{label}</p>
                        <p className={`mt-1 truncate font-heading text-lg font-semibold tabular-nums ${tone}`}><span dir="ltr">{i === 2 && res.closed ? <Private hint={tr("privacyReveal")}>{value}</Private> : value}</span></p>
                        {sub && <p className="truncate text-[11px] text-muted">{n(sub)}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="min-w-[12rem] flex-1 text-sm text-muted">{L(T.linkHint)}</p>
                    <button type="button" onClick={onOpenJournal} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--icon)] px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-tint"><PenLine size={15} />{L(T.toJournal)}</button>
                  </div>
                )}
              </Card>
  );

  // The page of one of the trader's own strategies: its name in its color, its tools, the results, and its rules.
  const ownArticle = own && (() => {
    const tint = (a: number) => `color-mix(in srgb, ${own.color} ${a}%, transparent)`;
    const rules = own.check.length > 0 || !!own.stop || !!own.target || !!own.notes;
    return (
      <motion.article key={own.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-2xl border p-3 sm:p-5" style={{ borderColor: `color-mix(in srgb, ${own.color} 45%, var(--border))`, background: `linear-gradient(135deg, color-mix(in srgb, ${own.color} 15%, var(--surface)), var(--surface) 65%)` }}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold" style={{ background: tint(18) }}><Dot color={own.color} />{L(T.yours)}</span>
            <span className="rounded-full border border-border px-2.5 py-1 text-muted">{n(L(T.nTools).replace("{n}", String(own.tools.length)))}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-heading text-lg font-bold" style={{ background: own.color, color: inkOn(own.color), boxShadow: `0 8px 24px -8px ${own.color}` }}>{own.name.slice(0, 2).toUpperCase()}</span>
              <h2 className="min-w-0 break-words font-heading text-2xl font-semibold" dir="auto">{own.name}</h2>
            </div>
            <button type="button" onClick={() => setEditing(own)} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--icon)] px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-tint"><Pencil size={15} />{L(T.edit)}</button>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {own.tools.length ? TOOL_GROUPS.map((g) => {
              const list = own.tools.map((x) => TOOL_BY_ID.get(x)!).filter((x) => x.g === g);
              if (!list.length) return null;
              const Icon = TOOL_ICON[g];
              return (
                <div key={g}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted"><Icon size={13} style={{ color: own.color }} />{TOOL_GROUP_LABEL[g][lang]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((x) => <span key={x.id} dir="auto" className="rounded-full border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: tint(60), background: tint(16) }}>{toolName(x, lang)}</span>)}
                  </div>
                </div>
              );
            }) : <p className="text-sm text-muted">{L(T.noTools)}</p>}
          </div>
        </div>
        {results}
        {own.check.length > 0 && (
          <Card title={L(T.check)} icon={CircleCheck}>
            <ol className="flex flex-col gap-2">
              {own.check.map((c, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums" style={{ background: tint(22) }}>{i + 1}</span>
                  <span dir="auto">{c}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
        {(own.stop || own.target) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {own.stop && <Card title={L(T.stop)} icon={ShieldAlert} tone="text-[#f87171]"><p className="text-sm" dir="auto">{own.stop}</p></Card>}
            {own.target && <Card title={L(T.target)} icon={Goal} tone="text-[#22c55e]"><p className="text-sm" dir="auto">{own.target}</p></Card>}
          </div>
        )}
        {own.notes && <Card title={L(T.notesT)} icon={StickyNote}><p className="whitespace-pre-line text-sm" dir="auto">{own.notes}</p></Card>}
        {!rules && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border p-4">
            <p className="min-w-[12rem] flex-1 text-sm text-muted">{L(T.addRules)}</p>
            <button type="button" onClick={() => setEditing(own)} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--icon)] px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-tint"><Pencil size={15} />{L(T.edit)}</button>
          </div>
        )}
      </motion.article>
    );
  })();

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h2 className="font-heading text-xl font-semibold">{L(T.title)}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{L(T.lead)}</p>
      </header>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="rounded-2xl border border-border bg-surface p-2 lg:sticky lg:top-3 lg:max-h-[calc(100vh-24px)] lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:p-3">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start lg:hidden">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-icon">{own ? <Dot color={own.color} /> : <G.icon size={17} />}</span>
            <span className="min-w-0 flex-1">
              <span dir={own ? "auto" : "ltr"} className="block truncate text-sm font-semibold rtl:text-right">{own ? own.name : s.name}</span>
              <span className="block text-xs text-muted">{L(T.count).replace("{n}", String(STRATEGIES.length + custom.length))}</span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          <div className={`${open ? "mt-2 block" : "hidden"} lg:mt-0 lg:block`}>{list}</div>
        </aside>

        <div ref={top} className="min-w-0 flex-1">
          {ownArticle || <motion.article key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-surface p-3 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-2.5 py-1 font-semibold text-icon"><G.icon size={13} />{L(G.label)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-medium"><Dots n={s.level} />{L(LEVEL[s.level])}</span>
                {s.styles.map((y) => <span key={y} className="rounded-full border border-border px-2.5 py-1 text-muted">{L(STYLE[y])}</span>)}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-2xl font-semibold"><span dir="ltr">{s.name}</span></h2>
                <motion.button type="button" whileTap={{ scale: 0.94 }} aria-pressed={isMine} onClick={() => setMineState(setMine(s.id, !isMine))}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${isMine ? "bg-primary text-on-primary" : "border border-[var(--icon)] text-primary hover:bg-primary-tint"}`}>
                  <Star size={15} className={isMine ? "fill-current" : ""} />{L(isMine ? T.inMine : T.addMine)}
                </motion.button>
              </div>
              <p className="mt-1 text-sm text-muted">{n(t.tag)}</p>
              <div className="relative mt-4 rounded-xl border border-border bg-bg px-1 pb-1 pt-7 sm:p-3" style={{ "--sd-bg": "var(--bg)" } as React.CSSProperties}>
                <div className="mx-auto max-w-[640px]"><StrategyDiagram key={`${s.id}:${play}`} d={s.dia} words={WORDS[lang]} label={`${s.name}: ${t.tag}`} /></div>
                <button type="button" onClick={() => setPlay((p) => p + 1)} className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-lg border border-border bg-surface/90 px-2 py-1 text-[11px] font-semibold text-muted hover:text-text">
                  <RotateCcw size={12} />{L(T.replay)}
                </button>
              </div>
            </div>

            {(isMine || res.linked > 0) && results}

            <Card title={L(T.idea)} icon={BookOpen}><p className="text-sm leading-relaxed">{n(t.idea)}</p></Card>

            <Card title={L(T.concepts)} icon={Layers}>
              <dl className="grid gap-2 sm:grid-cols-2">
                {t.concepts.map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-border bg-bg/60 p-3">
                    <dt className="mb-1 inline-block rounded-md bg-primary-tint px-1.5 py-0.5 text-xs font-bold text-icon" dir="auto">{k}</dt>
                    <dd className="text-sm text-muted">{n(v)}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card title={`${L(T.markets)} · ${L(T.tf)} · ${L(T.sessions)}`} icon={Clock}>
              <div className="flex flex-col gap-2.5 text-sm">
                {([[T.markets, s.markets.map((m) => L(MARKET[m]))], [T.tf, s.tf], [T.sessions, s.sessions.map((x) => L(SESSION[x]))]] as [L3, string[]][]).map(([h, v], i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-28 shrink-0 text-xs font-semibold text-muted">{L(h)}</span>
                    {v.map((x) => <span key={x} dir={i === 1 ? "ltr" : undefined} className={`rounded-lg border border-border px-2 py-0.5 text-xs ${i === 1 ? "font-mono" : ""}`}>{x}</span>)}
                  </div>
                ))}
              </div>
            </Card>

            <Card title={L(T.check)} icon={CircleCheck}>
              <ol className="flex flex-col gap-2">
                {t.check.map((c, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-tint text-[11px] font-bold text-icon tabular-nums">{i + 1}</span>
                    <span>{n(c)}</span>
                  </li>
                ))}
              </ol>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card title={L(T.stop)} icon={ShieldAlert} tone="text-[#f87171]"><p className="text-sm">{n(t.stop)}</p></Card>
              <Card title={L(T.target)} icon={Goal} tone="text-[#22c55e]"><p className="text-sm">{n(t.target)}</p></Card>
            </div>

            <Card title={L(T.mistakes)} icon={AlertTriangle}>
              <ul className="flex flex-col gap-2">
                {t.mistakes.map((m, i) => (
                  <li key={i} className="flex gap-2.5 text-sm"><X size={15} className="mt-0.5 shrink-0 text-[#f87171]" /><span>{n(m)}</span></li>
                ))}
              </ul>
            </Card>

            <p className="flex items-start gap-2 px-1 text-xs text-muted"><BookOpen size={13} className="mt-0.5 shrink-0" />{L(T.note)}</p>

            <nav className="grid grid-cols-2 gap-3">
              {prev ? (
                <button type="button" onClick={() => pick(prev.id)} className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-start hover:border-[var(--icon)]">
                  <ChevronLeft size={16} className="shrink-0 text-muted rtl:rotate-180" />
                  <span className="min-w-0"><span className="block text-[11px] text-muted">{L(T.prev)}</span><span dir="ltr" className="block truncate text-sm font-medium rtl:text-right">{prev.name}</span></span>
                </button>
              ) : <span />}
              {next && (
                <button type="button" onClick={() => pick(next.id)} className="flex min-w-0 items-center justify-end gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-end hover:border-[var(--icon)]">
                  <span className="min-w-0"><span className="block text-[11px] text-muted">{L(T.next)}</span><span dir="ltr" className="block truncate text-sm font-medium text-right rtl:text-left">{next.name}</span></span>
                  <ChevronRight size={16} className="shrink-0 text-muted rtl:rotate-180" />
                </button>
              )}
            </nav>
          </motion.article>}
        </div>
      </div>
      {editing && (
        <CustomStrategyForm lang={lang} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSave={(c) => { setCustom(saveCustom(c)); if (!readMine().includes(c.id)) setMineState(setMine(c.id, true)); setEditing(null); pick(c.id); }}
          onDelete={editing === "new" ? undefined : () => { deleteCustom(editing.id); setCustom(readCustom()); setMineState(readMine()); setEditing(null); setId("ict"); }} />
      )}
    </section>
  );
}
