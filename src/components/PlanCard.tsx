// The Advisor's plan card, the page's centre of attention: the money the plan would have added (counting up), your
// result against the plan's, the rules as numbered steps, both equity curves drawn in, and the four candles talking
// your numbers over until the happy one finds the answer. Dark and gold in every theme (styles: index.css, .pc-*).
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { CircleCheck, ListChecks, Sparkles, type LucideIcon } from "lucide-react";
import Mascot, { type Mood } from "./Mascot";
import { fmtMoney, ltrNumbers } from "../lib/money";
import type { Lang } from "../types";

type L = [string, string, string]; // en, ar, fr
const X = (en: string, ar: string, fr: string): L => [en, ar, fr];
const TXT = {
  yourPlan: X("Your plan", "خطتك", "Votre plan"),
  analysed: X("{n} closed trades analysed", "تم تحليل {n} صفقة مغلقة", "{n} trades clôturés analysés"),
  planCap: X("would have been added to your history by following these {n} rules together.", "كان سيُضاف إلى سجلك لو اتبعت هذه القواعد الـ{n} معاً.", "auraient été ajoutés à votre historique en suivant ces {n} règles ensemble."),
  planCap1: X("would have been added to your history by following this rule.", "كان سيُضاف إلى سجلك لو اتبعت هذه القاعدة.", "auraient été ajoutés à votre historique en suivant cette règle."),
  actual: X("Your result", "نتيجتك", "Votre résultat"),
  withPlan: X("With the plan", "مع الخطة", "Avec le plan"),
  tryPlan: X("Try the plan in What if", "جرّب الخطة في «ماذا لو»", "Essayer le plan dans « Et si ? »"),
  clean: X("No clear weakness in these trades. Keep going.", "لا يظهر ضعف واضح في هذه الصفقات. واصل.", "Aucune faiblesse nette dans ces trades. Continuez."),
  board: X("Your curve vs. the plan", "منحناك مقابل الخطة", "Votre courbe face au plan"),
  boardSolo: X("Your curve", "منحناك", "Votre courbe"),
  angryNeg: X("What? {a} ?!", "ماذا؟ {a} ؟!", "Quoi ? {a} ?!"),
  angryPos: X("Only {a}?!", "فقط {a}؟!", "Seulement {a} ?!"),
  jealousUp: X("The plan made {p}…", "الخطة ربحت {p}…", "Le plan a fait {p}…"),
  jealousBy: X("The plan does {d} better…", "الخطة أفضل منك بـ{d}…", "Le plan fait {d} de mieux…"),
  keepUp: X("Keep it up!", "واصل هكذا!", "Continuez comme ça !"),
};
const dly = (ms: number) => ({ "--d": `${ms}ms`, animationDelay: `${ms}ms` }) as CSSProperties;
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A figure that counts up to its value (at once for reduced-motion users). */
function useCount(target: number, ms = 1500) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (still()) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(target * (1 - (1 - p) ** 3)); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** The two running totals as SVG paths in a 600×150 box (at most ~240 points), the gap between them, and where each ends. */
function lines(a: number[], b: number[] | null) {
  const n = a.length, k = Math.max(1, Math.ceil(n / 240)), idx: number[] = [];
  for (let i = 0; i < n; i += k) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const A = idx.map((i) => a[i]), B = b ? idx.map((i) => b[i]) : null, all = B ? [...A, ...B] : A;
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), pad = (hi - lo) * 0.1 || 1;
  const x = (i: number) => (i / Math.max(1, idx.length - 1)) * 600, y = (v: number) => 150 - ((v - lo + pad) / (hi - lo + 2 * pad)) * 150;
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const back = (arr: number[]) => arr.map((v, i) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).reverse().join(" ");
  return { a: path(A), b: B ? path(B) : null, gap: B ? `${path(B)} ${back(A)} Z` : null, zero: y(0), ya: y(A[A.length - 1]), yb: B ? y(B[B.length - 1]) : null };
}

const Bulb = () => (
  <svg className="pc-bulb" width="30" height="38" viewBox="0 -6 30 44" aria-hidden="true">
    <path d="M15 -3v-3M3 3l-2 -2M27 3l2 -2" stroke="#ffd84d" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="15" cy="14" r="11" fill="#ffd84d" stroke="#b07a00" strokeWidth="2" />
    <path d="M11 13q4 -6 8 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".8" />
    <path d="M11 24h8v5h-8z" fill="#c9cdd6" stroke="#6b7280" strokeWidth="1.6" />
    <path d="M12 31h6" stroke="#6b7280" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export type PlanStep = { key: string; title: string; icon: LucideIcon };
export default function PlanCard({ lang, currency, trades, impact, actual, losing, steps, curve, onTry }: {
  lang: Lang; currency: string | null; trades: number; impact: number | null; actual: number; losing: number; steps: PlanStep[];
  curve: { a: number[]; b: number[] | null }; onTry: () => void;
}) {
  const k = lang === "en" ? 0 : lang === "ar" ? 1 : 2, T = (x: L) => x[k];
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const money = (v: number, sign = false) => fmtMoney(v, { sign, currency });
  const shown = useCount(impact ?? 0);
  const withPlan = actual + (impact ?? 0);
  const c = lines(curve.a, impact != null ? curve.b : null);
  // the end labels never sit on top of each other
  let ya = c.ya, yb = c.yb;
  if (yb != null && Math.abs(ya - yb) < 20) { const m = (ya + yb) / 2, s = ya >= yb ? 1 : -1; ya = m + 10 * s; yb = m - 10 * s; }
  const at = (y: number) => (y < 24 ? "translateY(4px)" : "translateY(-100%)"); // above its point, or below it near the top

  // the candles' lines, with your numbers (kept left to right, coloured)
  const num = (s: string, color: string): ReactNode[] => ltrNumbers(s).split(/⁦([^⁩]*)⁩/).map((p, i) => (i % 2 ? <bdi key={i} dir="ltr" className="tnum" style={{ color }}>{p}</bdi> : p));
  const nLose = k === 1 ? (losing === 1 ? "صفقة خاسرة واحدة…" : losing === 2 ? "صفقتان خاسرتان…" : losing <= 10 ? `${losing} صفقات خاسرة…` : `${losing} صفقة خاسرة…`)
    : k === 2 ? `${losing} trade${losing > 1 ? "s" : ""} perdant${losing > 1 ? "s" : ""}…` : `${losing} losing trade${losing === 1 ? "" : "s"}…`;
  const nRules = steps.length, fix = k === 1 ? (nRules === 1 ? "قاعدة واحدة تحلّها!" : nRules === 2 ? "قاعدتان تحلّانها!" : `${nRules} قواعد تحلّها!`)
    : k === 2 ? (nRules === 1 ? "1 règle règle ça !" : `${nRules} règles règlent ça !`) : nRules === 1 ? "1 rule fixes it!" : `${nRules} rules fix it!`;
  const crew: { mood: Mood; tone: string; say: ReactNode | null }[] = impact != null ? [
    { mood: "angry", tone: "#f2433a", say: num(T(actual < 0 ? TXT.angryNeg : TXT.angryPos).replace("{a}", money(actual, true)), "#c0281f") },
    { mood: "sad", tone: "#5b8def", say: num(nLose, "#2b4d9c") },
    { mood: "jealous", tone: "#a35cf0", say: num(withPlan > 0 ? T(TXT.jealousUp).replace("{p}", money(withPlan, true)) : T(TXT.jealousBy).replace("{d}", money(impact)), "#a06b00") },
    { mood: "happy", tone: "#2fd16a", say: num(fix, "#10803a") },
  ] : [
    { mood: "angry", tone: "#f2433a", say: null }, { mood: "sad", tone: "#5b8def", say: null }, { mood: "jealous", tone: "#a35cf0", say: null },
    { mood: "happy", tone: "#2fd16a", say: T(TXT.keepUp) },
  ];

  return (
    <section id="adv-plan" aria-label={T(TXT.yourPlan)} className="pc adv-pop relative scroll-mt-28 overflow-hidden rounded-[28px] p-5 sm:p-7 lg:p-8">
      <div aria-hidden="true" className="pc-grid pointer-events-none absolute inset-0" />
      <div className="relative grid gap-7 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className="pc-chip-gold inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"><Sparkles size={13} />{T(TXT.yourPlan)}</span>
            <span className="pc-chip-gray inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"><ListChecks size={13} />{ltrNumbers(T(TXT.analysed).replace("{n}", String(trades)))}</span>
          </div>
          {impact != null ? (
            <>
              <div className="mt-5"><bdi dir="ltr" className="pc-big inline-block font-heading text-5xl font-bold leading-none tnum sm:text-6xl lg:text-7xl">{money(Math.round(shown), true)}</bdi></div>
              <p className="pc-cap mt-3 max-w-md text-[15px] leading-relaxed">{ltrNumbers((nRules > 1 ? T(TXT.planCap) : T(TXT.planCap1)).replace("{n}", String(nRules)))}</p>
              <div className="mt-5 flex items-center gap-2 sm:gap-2.5">
                <div className="pc-now flex min-w-0 flex-1 flex-col rounded-2xl px-3.5 py-2 sm:min-w-[8.5rem] sm:flex-none">
                  <span className="pc-muted text-[11.5px]">{T(TXT.actual)}</span>
                  <bdi dir="ltr" className="font-heading text-lg font-bold tnum" style={{ color: "#c7c9d1" }}>{money(actual, true)}</bdi>
                </div>
                <span aria-hidden="true" className="pc-chev flex text-lg font-bold rtl:-scale-x-100" style={{ color: "#f5b83d" }}><span>›</span><span>›</span><span>›</span></span>
                <div className="pc-plan flex min-w-0 flex-1 flex-col rounded-2xl px-3.5 py-2 sm:min-w-[8.5rem] sm:flex-none">
                  <span className="pc-muted text-[11.5px]">{T(TXT.withPlan)}</span>
                  <bdi dir="ltr" className="font-heading text-lg font-bold tnum" style={{ color: "#ffd36b" }}>{money(withPlan, true)}</bdi>
                </div>
              </div>
              <ol className="mt-5 flex flex-wrap gap-2.5">
                {steps.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.key} className="pc-step adv-pop flex items-center gap-2.5 rounded-2xl py-2 pe-3.5 ps-2 text-sm font-semibold" style={dly(250 + i * 90)}>
                      <span className="pc-num grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold">{i + 1}</span>
                      <span className="pc-ico grid h-6 w-6 shrink-0 place-items-center rounded-lg"><Icon size={14} /></span>
                      {s.title}
                    </li>
                  );
                })}
              </ol>
              <button type="button" onClick={onTry} className="pc-cta mt-6 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[15px] font-bold"><Sparkles size={16} />{T(TXT.tryPlan)}</button>
            </>
          ) : (
            <div className="mt-6 flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ color: "#34d399", background: "rgba(52, 211, 153, .14)" }}><CircleCheck size={22} /></span>
              <p className="font-heading text-lg font-semibold">{T(TXT.clean)}</p>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="pc-board relative h-[210px] rounded-2xl px-3.5 pb-2.5 pt-3 sm:h-[190px]">
            <div className="pc-muted flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-semibold">
              <span>{T(c.b ? TXT.board : TXT.boardSolo)}</span>
              <span className="flex gap-3.5">
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[3px] w-4 rounded" style={{ background: c.b ? "#8a8f9c" : "#f5b83d" }} />{T(TXT.actual)}</span>
                {c.b && <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[3px] w-4 rounded" style={{ background: "#f5b83d" }} />{T(TXT.withPlan)}</span>}
              </span>
            </div>
            <div dir="ltr" className="absolute inset-x-3.5 bottom-2.5 top-14 sm:top-10">
              <svg viewBox="0 0 600 150" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
                <defs>
                  <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f5b83d" stopOpacity=".42" /><stop offset="1" stopColor="#f5b83d" stopOpacity=".04" /></linearGradient>
                  <filter id={`${id}g`} x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="3.2" /></filter>
                </defs>
                <path d={`M0 ${c.zero.toFixed(1)} H600`} stroke="rgba(255,255,255,.14)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
                {c.gap && <path className="pc-gap" d={c.gap} fill={`url(#${id}f)`} />}
                <path className="pc-draw" pathLength={1} d={c.a} fill="none" stroke={c.b ? "#8a8f9c" : "#ffd36b"} strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
                {c.b && <path className="pc-draw" pathLength={1} d={c.b} fill="none" stroke="#f5b83d" strokeWidth={6} opacity={0.45} filter={`url(#${id}g)`} />}
                {c.b && <path className="pc-draw" pathLength={1} d={c.b} fill="none" stroke="#ffd36b" strokeWidth={2.6} vectorEffect="non-scaling-stroke" />}
              </svg>
              <span className="pc-endl absolute end-0 rounded px-1 text-[12px] font-bold tnum" style={{ top: `${(ya / 150) * 100}%`, transform: at(ya), color: c.b ? "#a7abb6" : "#ffd36b", background: "rgba(10, 9, 7, .72)" }}>{money(actual, true)}</span>
              {yb != null && <span className="pc-endl absolute end-0 rounded px-1 text-[12px] font-bold tnum" style={{ top: `${(yb / 150) * 100}%`, transform: at(yb), color: "#ffd36b", background: "rgba(10, 9, 7, .72)" }}>{money(withPlan, true)}</span>}
            </div>
          </div>
          <div className="relative grid h-[172px] grid-cols-4 items-end px-1 sm:h-[200px]">
            {crew.map((m, i) => (
              <div key={m.mood} className={`pc-s${i + 1} flex justify-center`}>
                <div className="relative">
                  {m.mood === "happy" && impact != null && <Bulb />}
                  {m.say && <div dir="auto" className="pc-bub" style={{ "--tone": m.tone } as CSSProperties}>{m.say}</div>}
                  <Mascot mood={m.mood} bare className="h-[84px] w-[72px] sm:h-[124px] sm:w-[106px]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
