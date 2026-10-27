// Strategies: the trading strategies most used today, in a list with search and five groups. Each one has its page:
// a picture that plays, the idea, the key concepts, the markets, timeframes and sessions, the entry checklist, the
// stop and the target, and the usual mistakes. On a phone the list folds above the page.
import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, BarChart3, BookOpen, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock, Droplets, Goal, Layers, RotateCcw, Search, ShieldAlert, Waves, X } from "lucide-react";
import type { Lang } from "../types";
import { GROUPS, STRATEGIES, searchStrategies, type Group, type Id, type Market, type Session, type StrategyText, type Style } from "../lib/strategies";
import { EN } from "../lib/strategyText.en";
import { AR } from "../lib/strategyText.ar";
import { FR } from "../lib/strategyText.fr";
import { ltrNumbers } from "../lib/money";
import StrategyDiagram from "./StrategyDiagram";

type L3 = Record<Lang, string>;
const TEXT: Record<Lang, Record<Id, StrategyText>> = { en: EN, ar: AR, fr: FR };
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

export default function StrategiesView({ lang }: { lang: Lang }) {
  const L = (x: L3) => x[lang];
  const tx = TEXT[lang];
  const n = (s: string) => (lang === "ar" ? ltrNumbers(s) : s); // numbers keep their order inside Arabic text
  const [id, setId] = useState<Id>("ict");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false); // the list, on a phone
  const [play, setPlay] = useState(0);
  const top = useRef<HTMLDivElement>(null);
  const found = useMemo(() => searchStrategies(q, ALL), [q]);
  const s = STRATEGIES.find((x) => x.id === id) ?? STRATEGIES[0], t = tx[s.id];
  const at = STRATEGIES.indexOf(s), prev = STRATEGIES[at - 1], next = STRATEGIES[at + 1];
  const G = GROUP[s.group];

  const pick = (v: Id) => {
    setId(v);
    setOpen(false);
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 12, behavior: "smooth" });
  };

  const list = (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(T.search)} aria-label={L(T.search)}
          onKeyDown={(e) => { if (e.key === "Enter" && found[0]) pick(found[0].id); if (e.key === "Escape") setQ(""); }}
          className="w-full rounded-xl border border-border bg-bg py-2 pe-8 ps-9 text-sm outline-none placeholder:text-muted focus:border-[var(--icon)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden" />
        {q && <button type="button" onClick={() => setQ("")} aria-label={L(T.clear)} className="absolute end-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-text"><X size={14} /></button>}
      </label>
      {!found.length && <p className="px-2 py-6 text-center text-sm text-muted">{L(T.none)}</p>}
      {GROUPS.map((g) => {
        const items = found.filter((x) => x.group === g);
        if (!items.length) return null;
        const Icon = GROUP[g].icon;
        return (
          <div key={g}>
            <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted"><Icon size={12} className="text-icon" />{L(GROUP[g].label)}<span className="ms-auto tabular-nums">{items.length}</span></div>
            <div className="flex flex-col gap-0.5">
              {items.map((x) => {
                const on = x.id === s.id;
                return (
                  <button key={x.id} type="button" onClick={() => pick(x.id)} aria-current={on ? "page" : undefined}
                    className={`group relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-start transition-colors ${on ? "" : "hover:bg-primary-tint"}`}>
                    {on && <motion.span layoutId="strategy-pill" className="absolute inset-0 rounded-xl border border-[var(--icon)] bg-primary-tint" transition={{ type: "spring", stiffness: 260, damping: 30 }} />}
                    <span className="relative min-w-0 flex-1">
                      <span dir="ltr" className={`block truncate text-sm font-medium rtl:text-right ${on ? "text-icon" : ""}`}>{x.name}</span>
                      <span className="block truncate text-xs text-muted">{n(tx[x.id].tag)}</span>
                    </span>
                    <span className="relative"><Dots n={x.level} /></span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h2 className="font-heading text-xl font-semibold">{L(T.title)}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{L(T.lead)}</p>
      </header>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="rounded-2xl border border-border bg-surface p-2 lg:sticky lg:top-3 lg:max-h-[calc(100vh-24px)] lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:p-3">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start lg:hidden">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-icon"><G.icon size={17} /></span>
            <span className="min-w-0 flex-1">
              <span dir="ltr" className="block truncate text-sm font-semibold rtl:text-right">{s.name}</span>
              <span className="block text-xs text-muted">{L(T.count).replace("{n}", String(STRATEGIES.length))}</span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          <div className={`${open ? "mt-2 block" : "hidden"} lg:mt-0 lg:block`}>{list}</div>
        </aside>

        <div ref={top} className="min-w-0 flex-1">
          <motion.article key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-surface p-3 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-2.5 py-1 font-semibold text-icon"><G.icon size={13} />{L(G.label)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-medium"><Dots n={s.level} />{L(LEVEL[s.level])}</span>
                {s.styles.map((y) => <span key={y} className="rounded-full border border-border px-2.5 py-1 text-muted">{L(STYLE[y])}</span>)}
              </div>
              <h2 className="mt-3 font-heading text-2xl font-semibold"><span dir="ltr">{s.name}</span></h2>
              <p className="mt-1 text-sm text-muted">{n(t.tag)}</p>
              <div className="relative mt-4 rounded-xl border border-border bg-bg px-1 pb-1 pt-7 sm:p-3" style={{ "--sd-bg": "var(--bg)" } as React.CSSProperties}>
                <div className="mx-auto max-w-[640px]"><StrategyDiagram key={`${s.id}:${play}`} d={s.dia} words={WORDS[lang]} label={`${s.name}: ${t.tag}`} /></div>
                <button type="button" onClick={() => setPlay((p) => p + 1)} className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-lg border border-border bg-surface/90 px-2 py-1 text-[11px] font-semibold text-muted hover:text-text">
                  <RotateCcw size={12} />{L(T.replay)}
                </button>
              </div>
            </div>

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
          </motion.article>
        </div>
      </div>
    </section>
  );
}
