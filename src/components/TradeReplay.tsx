// Journal › trade replay: the market candles around one closed trade, played back candle by candle, with the floating
// result, the best and worst points, and what price did after the exit.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, RotateCcw, SkipForward, StepBack, StepForward, X } from "lucide-react";
import type { Lang, Trade } from "../types";
import { fmtMoney, ltrNumbers } from "../lib/money";
import { pointValues } from "../lib/portfolio";
import { loadReplay, type ReplayLoad, type ReplayWhy } from "../lib/replayData";
import type { Replay } from "../lib/replay";
import { usePrivacy } from "../usePrivacy";
import { noteOf, saveNote } from "../lib/tradeNotes";

type L3 = Record<Lang, string>;
const T = {
  title: { en: "Trade replay", ar: "إعادة تشغيل الصفقة", fr: "Rejouer le trade" },
  note: { en: "Note", ar: "ملاحظة", fr: "Note" },
  notePh: { en: "Why did you take this trade? How did you feel?", ar: "لماذا دخلت هذه الصفقة؟ وبماذا شعرت؟", fr: "Pourquoi ce trade ? Qu'avez-vous ressenti ?" },
  loading: { en: "Loading market prices… {d}/{t}", ar: "جارٍ تحميل أسعار السوق… {d}/{t}", fr: "Chargement des prix… {d}/{t}" },
  play: { en: "Play", ar: "تشغيل", fr: "Lecture" },
  pause: { en: "Pause", ar: "إيقاف مؤقت", fr: "Pause" },
  restart: { en: "Back to the entry", ar: "العودة إلى الدخول", fr: "Retour à l'entrée" },
  prev: { en: "Previous candle", ar: "الشمعة السابقة", fr: "Bougie précédente" },
  next: { en: "Next candle", ar: "الشمعة التالية", fr: "Bougie suivante" },
  end: { en: "To the end", ar: "إلى النهاية", fr: "Jusqu'à la fin" },
  speed: { en: "Speed", ar: "السرعة", fr: "Vitesse" },
  position: { en: "Replay position", ar: "موضع التشغيل", fr: "Position de lecture" },
  close: { en: "Close", ar: "إغلاق", fr: "Fermer" },
  long: { en: "Long", ar: "شراء", fr: "Long" },
  short: { en: "Short", ar: "بيع", fr: "Short" },
  before: { en: "Before the entry", ar: "قبل الدخول", fr: "Avant l'entrée" },
  beforeSub: { en: "Entry in {n} candles", ar: "الدخول بعد {n} شمعة", fr: "Entrée dans {n} bougies" },
  floating: { en: "Floating", ar: "الربح العائم", fr: "Latent" },
  result: { en: "Result", ar: "النتيجة", fr: "Résultat" },
  best: { en: "Best so far", ar: "الأفضل حتى الآن", fr: "Meilleur jusqu'ici" },
  worst: { en: "Worst so far", ar: "الأسوأ حتى الآن", fr: "Pire jusqu'ici" },
  time: { en: "Time in trade", ar: "مدة الصفقة", fr: "Durée" },
  sinceBest: { en: "Best since exit", ar: "الأفضل بعد الخروج", fr: "Meilleur après la sortie" },
  sinceWorst: { en: "Worst since exit", ar: "الأسوأ بعد الخروج", fr: "Pire après la sortie" },
  since: { en: "Since the exit", ar: "منذ الخروج", fr: "Depuis la sortie" },
  story: { en: "What happened", ar: "ماذا حدث", fr: "Ce qui s'est passé" },
  evEntry: { en: "Entry: {side} {qty} at {price}", ar: "الدخول: {side} {qty} عند {price}", fr: "Entrée : {side} {qty} à {price}" },
  evWorst: { en: "Worst point: {m}", ar: "أسوأ نقطة: {m}", fr: "Pire point : {m}" },
  evBest: { en: "Best point: {m}", ar: "أفضل نقطة: {m}", fr: "Meilleur point : {m}" },
  evExit: { en: "Exit at {price}: {m}", ar: "الخروج عند {price}: {m}", fr: "Sortie à {price} : {m}" },
  atTp: { en: " (at the target)", ar: " (عند الهدف)", fr: " (à l'objectif)" },
  atSl: { en: " (at the stop)", ar: " (عند وقف الخسارة)", fr: " (au stop)" },
  giveback: { en: "{m} of the best point was given back before the exit.", ar: "أُعيد {m} من أفضل نقطة قبل الخروج.", fr: "{m} du meilleur point rendus avant la sortie." },
  afterBest: { en: "After the exit, price went {m} further your way.", ar: "بعد الخروج، تحرّك السعر {m} إضافية لصالحك.", fr: "Après la sortie, le prix est allé {m} plus loin dans votre sens." },
  heldTp: { en: "Had you held, your target would have been reached.", ar: "لو بقيت في الصفقة لبلغ السعر هدفك.", fr: "En gardant le trade, votre objectif aurait été atteint." },
  heldSl: { en: "Had you held, your stop would have been hit.", ar: "لو بقيت في الصفقة لضُرب وقف خسارتك.", fr: "En gardant le trade, votre stop aurait été touché." },
  stopThenTp: { en: "After your stop, price went on to reach your target.", ar: "بعد وقف خسارتك، واصل السعر حتى بلغ هدفك.", fr: "Après votre stop, le prix a fini par atteindre votre objectif." },
  backLoss: { en: "Price came back to your entry price.", ar: "عاد السعر إلى سعر دخولك.", fr: "Le prix est revenu à votre prix d'entrée." },
  backWin: { en: "Price came back to your entry price: holding would have erased the profit.", ar: "عاد السعر إلى سعر دخولك: البقاء كان سيمحو الربح.", fr: "Le prix est revenu à votre entrée : garder aurait effacé le gain." },
  source: { en: "{m} candles · Yahoo Finance ({tk}) · aligned to your entry price", ar: "شموع {m} · Yahoo Finance ‏({tk}) · مضبوطة على سعر دخولك", fr: "Bougies {m} · Yahoo Finance ({tk}) · alignées sur votre prix d'entrée" },
  guess: { en: "Broker clock unknown: times assume UTC+2 (UTC+3 in summer). Measure Trade path once for exact times.", ar: "توقيت الوسيط غير معروف: الأوقات على افتراض UTC+2 ‏(UTC+3 صيفاً). قِس مسار الصفقة مرة واحدة لأوقات دقيقة.", fr: "Heure du courtier inconnue : heures supposées en UTC+2 (UTC+3 l'été). Mesurez une fois le Parcours du trade pour des heures exactes." },
  openPath: { en: "Open Trade path", ar: "افتح مسار الصفقة", fr: "Ouvrir Parcours du trade" },
  noTicker: { en: "No market prices for {s}. Pick its Yahoo Finance ticker in Reports › Benchmark & Market.", ar: "لا توجد أسعار سوق لـ {s}. اختر رمزه في Yahoo Finance من التقارير › المقارنة والسوق.", fr: "Pas de prix de marché pour {s}. Choisissez son ticker Yahoo Finance dans Rapports › Référence & marché." },
  mapIt: { en: "Pick the ticker", ar: "اختر الرمز", fr: "Choisir le ticker" },
  notDeployed: { en: "The price service is not set up yet: deploy the \"market\" function in Supabase once.", ar: "خدمة الأسعار غير مفعّلة بعد: انشر الدالة market في Supabase مرة واحدة.", fr: "Le service de prix n'est pas encore installé : déployez une fois la fonction « market » dans Supabase." },
  unreachable: { en: "The price service could not be reached.", ar: "تعذّر الوصول إلى خدمة الأسعار.", fr: "Service de prix injoignable." },
  noData: { en: "No market prices around this trade: the data source may have been closed then.", ar: "لا توجد أسعار سوق حول هذه الصفقة: ربما كان مصدر البيانات مغلقاً حينها.", fr: "Pas de prix autour de ce trade : la source était peut-être fermée à ce moment." },
  tooOld: { en: "This trade is over 2 years old: only daily prices are left, too coarse for a trade this short.", ar: "عمر هذه الصفقة أكثر من سنتين: لم تبقَ إلا الأسعار اليومية، وهي أكبر من مدة صفقة قصيرة كهذه.", fr: "Ce trade a plus de 2 ans : il ne reste que des prix journaliers, trop grossiers pour un trade aussi court." },
  open: { en: "Open trades can be replayed once they close.", ar: "يمكن إعادة تشغيل الصفقة بعد إغلاقها.", fr: "Un trade ouvert pourra être rejoué une fois clôturé." },
  retry: { en: "Try again", ar: "إعادة المحاولة", fr: "Réessayer" },
} satisfies Record<string, L3>;

const UP = "#22c55e", DOWN = "#f87171", RATE = 5; // candles per second at 1x
const SPEEDS = [1, 2, 4, 8];
const loc = (lang: Lang) => (lang === "ar" ? "ar-u-nu-latn" : lang);
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
function span(ms: number, lang: Lang) {
  const m = Math.max(0, Math.round(ms / 6e4)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const u = lang === "ar" ? ["ي", "س", "د"] : lang === "fr" ? ["j", "h", "min"] : ["d", "h", "m"], sep = lang === "en" ? "" : " ";
  return [d && `${d}${sep}${u[0]}`, (d || h) && `${h}${sep}${u[1]}`, !d && `${mm}${sep}${u[2]}`].filter(Boolean).join(" ") || `0${sep}${u[2]}`;
}
const candleLabel = (m: number, lang: Lang) => (m >= 1440 ? (lang === "ar" ? "يومية" : lang === "fr" ? "journalières" : "daily") : m >= 60 ? `${m / 60}${lang === "en" ? "h" : " h"}` : `${m}${lang === "en" ? "m" : lang === "fr" ? " min" : " د"}`);
/** The last candle starting at or before t. */
const idxAt = (r: Replay, t: number) => { let lo = 0, hi = r.candles.length - 1, k = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (r.candles[m].t <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k; };

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

function niceStep(range: number, n = 5) {
  const raw = range / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

function Chart({ r, p, trade, digits, lang }: { r: Replay; p: number; trade: Trade; digits: number; lang: Lang }) {
  const [ref, W] = useWidth();
  const H = W < 640 ? 250 : 340, L = 6, R = 72, TOP = 12, B = 24, n = r.candles.length;
  const dir = trade.side === "long" ? 1 : -1;
  const { lo, hi } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const c of r.candles) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
    const range = hi - lo || Math.abs(hi) * 1e-3 || 1;
    for (const v of [trade.entryPrice, trade.exitPrice, trade.sl, trade.tp]) if (v != null && v > lo - 0.6 * range && v < hi + 0.6 * range) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = (hi - lo || range) * 0.06;
    return { lo: lo - pad, hi: hi + pad };
  }, [r, trade]);
  if (!W) return <div ref={ref} style={{ height: H }} />;
  const pw = W - L - R, ph = H - TOP - B, step = pw / n, body = Math.max(1, Math.min(14, step * 0.64));
  const x = (i: number) => L + step * (i + 0.5), y = (v: number) => TOP + ((hi - v) / (hi - lo)) * ph;
  const inPlot = (v: number | null | undefined): v is number => v != null && v >= lo && v <= hi;
  const ticks: number[] = [];
  const st = niceStep(hi - lo);
  for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) ticks.push(v);
  const tickDigits = Math.max(0, Math.min(digits, -Math.floor(Math.log10(st) + 1e-9)));
  const every = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(pw / 90))));
  const df = (ms: number) => { const d = new Date(ms); return lang === "ar" ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}` : new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" }).format(d); };
  const bandA = x(r.iIn) - step / 2, bandZ = x(Math.min(p, r.iOut)) + step / 2;
  const cur = r.candles[p], exited = p >= r.iOut;
  const mark = (t: number, move: number) => ({ cx: x(idxAt(r, t)), cy: y(trade.entryPrice + move * dir) });
  const best = r.best.move > 0 && r.best.t <= (r.candles[p].t + r.minutes * 6e4) ? mark(r.best.t, r.best.move) : null;
  const worst = r.worst.move > 0 && r.worst.t <= (r.candles[p].t + r.minutes * 6e4) ? mark(r.worst.t, -r.worst.move) : null;
  const shown = p >= r.iIn;
  const level = (v: number | null | undefined, color: string, label: string) => (inPlot(v) && shown ? (
    <g>
      <line x1={bandA} x2={L + pw} y1={y(v)} y2={y(v)} stroke={color} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.9} />
      <rect x={L + pw + 2} y={y(v) - 9.5} width={R - 4} height={19} rx={5} fill="var(--surface)" stroke={color} strokeWidth={1} />
      <text x={L + pw + 7} y={y(v) + 3.8} fontSize={10} fill={color} fontWeight={700}>{label}</text>
    </g>
  ) : null);
  // axis prices that would sit under a level tag or the live price tag are left out
  const tags = [shown && inPlot(trade.tp) ? y(trade.tp) : null, shown && inPlot(trade.sl) ? y(trade.sl) : null, cur ? y(cur.c) : null].filter((v): v is number => v != null);
  const free = (v: number) => tags.every((t) => Math.abs(t - y(v)) > 15);
  const anchor = (i: number) => (i === 0 ? "start" : x(i) > L + pw - 34 ? "end" : "middle");
  return (
    <div ref={ref} dir="ltr" className="relative w-full select-none">
      <svg width={W} height={H} role="img" aria-label={`${trade.symbol} ${hhmm(r.s)}–${hhmm(r.e)}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            {free(v) && <text x={L + pw + 8} y={y(v) + 3.5} fontSize={10} fill="var(--muted)">{v.toLocaleString("en-US", { minimumFractionDigits: tickDigits, maximumFractionDigits: tickDigits })}</text>}
          </g>
        ))}
        {r.candles.map((c, i) => (i % every === 0 ? (
          <text key={c.t} x={i === 0 ? L : x(i)} y={H - 7} fontSize={10} fill="var(--muted)" textAnchor={anchor(i)}>{r.minutes >= 1440 || (i > 0 && hhmm(c.t) < hhmm(r.candles[Math.max(0, i - every)].t)) || i === 0 ? `${df(c.t)}${r.minutes < 1440 ? ` ${hhmm(c.t)}` : ""}` : hhmm(c.t)}</text>
        ) : null))}
        {shown && <rect x={bandA} y={TOP} width={Math.max(0, bandZ - bandA)} height={ph} fill="var(--primary-tint)" opacity={0.55} />}
        {level(trade.tp, "var(--profit)", `TP ${trade.tp?.toFixed(digits)}`)}
        {level(trade.sl, DOWN, `SL ${trade.sl?.toFixed(digits)}`)}
        {p >= r.iIn && <line x1={bandA} x2={exited ? x(r.iOut) : x(p)} y1={y(trade.entryPrice)} y2={y(trade.entryPrice)} stroke="var(--text)" strokeWidth={1.2} strokeDasharray="2 3" opacity={0.7} />}
        {r.candles.slice(0, p + 1).map((c, i) => {
          const up = c.c >= c.o, col = up ? UP : DOWN, top = y(Math.max(c.o, c.c)), h = Math.max(1, Math.abs(y(c.o) - y(c.c)));
          return (
            <g key={c.t} opacity={i > r.iOut ? 0.45 : 1}>
              <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
              <rect x={x(i) - body / 2} y={top} width={body} height={h} fill={col} rx={body > 4 ? 1 : 0} />
            </g>
          );
        })}
        {p >= r.iIn && <polygon points={dir > 0 ? `${x(r.iIn)},${y(trade.entryPrice) + 5} ${x(r.iIn) - 5},${y(trade.entryPrice) + 13} ${x(r.iIn) + 5},${y(trade.entryPrice) + 13}` : `${x(r.iIn)},${y(trade.entryPrice) - 5} ${x(r.iIn) - 5},${y(trade.entryPrice) - 13} ${x(r.iIn) + 5},${y(trade.entryPrice) - 13}`} fill="var(--text)" />}
        {best && <circle cx={best.cx} cy={best.cy} r={4} fill="none" stroke={UP} strokeWidth={1.8}><title>best</title></circle>}
        {worst && <circle cx={worst.cx} cy={worst.cy} r={4} fill="none" stroke={DOWN} strokeWidth={1.8}><title>worst</title></circle>}
        {exited && trade.exitPrice != null && <circle cx={x(r.iOut)} cy={y(trade.exitPrice)} r={5.5} fill={(trade.pnl ?? 0) >= 0 ? UP : DOWN} stroke="var(--bg)" strokeWidth={2} />}
        <line x1={x(p)} x2={x(p)} y1={TOP} y2={TOP + ph} stroke="var(--icon)" strokeWidth={1} opacity={0.45} />
        {cur && (
          <g>
            <rect x={L + pw + 2} y={y(cur.c) - 10} width={R - 4} height={20} rx={5} fill={cur.c >= cur.o ? UP : DOWN} />
            <text x={L + pw + 8} y={y(cur.c) + 4} fontSize={11} fontWeight={700} fill="#0b1220">{cur.c.toFixed(digits)}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

type Ev = { t: number; i: number; text: string; tone: "up" | "down" | "plain" };

export default function TradeReplay({ lang, trade, trades, currency, onClose, onOpenReport, focusNote }: { lang: Lang; trade: Trade; trades: Trade[]; currency?: string; onClose: () => void; onOpenReport?: (tab: "benchmark" | "path") => void; focusNote?: boolean }) {
  const L = (x: L3) => x[lang];
  const [note, setNote] = useState(() => noteOf(trade.key));
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const [load, setLoad] = useState<ReplayLoad | { loading: [number, number] }>({ loading: [0, 1] });
  const [attempt, setAttempt] = useState(0);
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const panel = useRef<HTMLDivElement>(null), pRef = useRef(0), stopAtExit = useRef(true), touched = useRef(false);
  const { hidden } = usePrivacy();
  pRef.current = p;

  useEffect(() => {
    let live = true;
    setLoad({ loading: [0, 1] });
    loadReplay(trade, trades, Date.now(), (d, t) => live && setLoad({ loading: [d, t] })).then((x) => {
      if (!live) return;
      setLoad(x);
      if (x.ok) {
        setP(x.r.iIn); pRef.current = x.r.iIn; stopAtExit.current = true; touched.current = false;
        if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setTimeout(() => live && !touched.current && setPlaying(true), 500);
      }
    });
    return () => { live = false; };
  }, [trade.key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = "ok" in load && load.ok ? load.r : null;
  const last = r ? r.candles.length - 1 : 0;

  // playback: a few candles per second; it stops once at the exit, then plays what came after
  useEffect(() => {
    if (!playing || !r) return;
    let raf = 0, prev = performance.now(), acc = 0;
    const tick = (now: number) => {
      acc += ((now - prev) / 1000) * RATE * speed;
      prev = now;
      if (acc >= 1) {
        const q = pRef.current, stepN = Math.floor(acc);
        acc -= stepN;
        let n = Math.min(last, q + stepN);
        if (stopAtExit.current && q < r.iOut && n >= r.iOut) { n = r.iOut; stopAtExit.current = false; setPlaying(false); }
        else if (n >= last) setPlaying(false);
        pRef.current = n;
        setP(n);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, r, last]);

  const go = useCallback((n: number) => { touched.current = true; setPlaying(false); const v = Math.max(0, Math.min(last, n)); pRef.current = v; setP(v); }, [last]);
  const toggle = useCallback(() => {
    if (!r) return;
    touched.current = true;
    if (!playing && pRef.current >= last) { stopAtExit.current = true; pRef.current = r.iIn; setP(r.iIn); }
    setPlaying((x) => !x);
  }, [r, playing, last]);

  // keyboard, focus, scroll lock
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null, prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (focusNote ? noteBox.current : panel.current)?.focus(); // opened from a Telegram "note" button: straight to the note
    return () => { document.body.style.overflow = prevOverflow; opener?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (!r || tag === "INPUT" || tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA") return; // focused controls keep their own keys
      if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(pRef.current + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(pRef.current - 1); }
      else if (e.key === "Home") { e.preventDefault(); stopAtExit.current = true; go(r.iIn); }
      else if (e.key === "End") { e.preventDefault(); go(last); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [r, toggle, go, onClose, last]);

  // money per 1.0 move of this position: its own result, else the account's point value for the symbol
  const k = useMemo(() => {
    const dir = trade.side === "long" ? 1 : -1;
    const own = trade.exitPrice != null && trade.exitPrice !== trade.entryPrice ? ((trade.pnl ?? 0) + (trade.commission || 0)) / ((trade.exitPrice - trade.entryPrice) * dir) : NaN;
    if (Number.isFinite(own) && own > 0) return own;
    const v = pointValues(trades).get(`${trade.accountId}|${trade.symbol}`);
    return v != null && trade.qty > 0 ? v * trade.qty : null;
  }, [trade, trades]);
  const risk = trade.sl != null && trade.sl > 0 && trade.sl !== trade.entryPrice ? Math.abs(trade.entryPrice - trade.sl) : null;
  const digits = trade.entryPrice < 10 ? 5 : trade.entryPrice < 1000 ? 3 : 2;
  const price = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  /** A move as money (and R when the trade has a stop); `plain` drops the signs (amounts given back / still to come). */
  const money = (move: number, net?: number, plain = false) => {
    const rv = risk ? Math.round((move / risk) * 10) / 10 || 0 : null, sg = (v: number) => (!plain && v > 0 ? "+" : "");
    const rr = rv != null ? `${sg(rv)}${(plain ? Math.abs(rv) : rv).toFixed(1)}R` : null;
    const m = net != null ? net : k != null ? move * k : null;
    if (m == null || hidden) return rr ?? `${sg(move)}${price(plain ? Math.abs(move) : move)}`;
    return `${fmtMoney(plain ? Math.abs(m) : m, { cents: true, sign: !plain, currency })}${rr ? ` (${rr})` : ""}`;
  };
  const tone = (v: number) => (v > 0 ? "text-[#22c55e]" : v < 0 ? "text-[#f87171]" : "text-muted");

  const events: Ev[] = useMemo(() => {
    if (!r) return [];
    const out: Ev[] = [], dir = trade.side === "long" ? 1 : -1, final = ((trade.exitPrice ?? trade.entryPrice) - trade.entryPrice) * dir;
    out.push({ t: r.s, i: r.iIn, tone: "plain", text: fill(L(T.evEntry), { side: L(T[trade.side]), qty: trade.qty.toLocaleString("en-US"), price: price(trade.entryPrice) }) });
    if (r.worst.move > 0 && r.worst.t < r.e) out.push({ t: r.worst.t, i: idxAt(r, r.worst.t), tone: "down", text: fill(L(T.evWorst), { m: money(-r.worst.move) }) });
    if (r.best.move > 0 && r.best.t < r.e) out.push({ t: r.best.t, i: idxAt(r, r.best.t), tone: "up", text: fill(L(T.evBest), { m: money(r.best.move) }) });
    const by = r.closedBy === "tp" ? L(T.atTp) : r.closedBy === "sl" ? L(T.atSl) : "";
    out.push({ t: r.e, i: r.iOut, tone: (trade.pnl ?? 0) >= 0 ? "up" : "down", text: fill(L(T.evExit), { price: price(trade.exitPrice ?? 0), m: money(final, trade.pnl ?? undefined) }) + by });
    if (r.best.move - final > 0.2 * Math.max(r.best.move, 1e-12) && r.best.move > 0 && r.best.t < r.e) out.push({ t: r.e + 1, i: r.iOut, tone: "down", text: fill(L(T.giveback), { m: money(r.best.move - final, undefined, true) }) });
    if (r.afterBest && r.afterBest.move > 0) out.push({ t: r.afterBest.t, i: idxAt(r, r.afterBest.t), tone: "up", text: fill(L(T.afterBest), { m: money(r.afterBest.move, undefined, true) }) });
    if (r.held) out.push({ t: r.held.t, i: idxAt(r, r.held.t), tone: r.held.level === "tp" ? "up" : "down", text: L(r.held.level === "sl" ? T.heldSl : r.closedBy === "sl" ? T.stopThenTp : T.heldTp) });
    if (r.back != null) out.push({ t: r.back, i: idxAt(r, r.back), tone: final > 0 ? "down" : "plain", text: L(final > 0 ? T.backWin : T.backLoss) });
    return out.sort((a, b) => a.t - b.t);
  }, [r, trade, lang, k, risk, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowT = r ? r.candles[p].t + r.minutes * 6e4 : 0;
  const fr = r ? r.frames[p] : null, af = r ? r.after[p] : null;
  const stats: [string, string, string, boolean][] = !r ? [] : p < r.iIn
    ? [[L(T.before), fill(L(T.beforeSub), { n: r.iIn - p }), "text-muted", false]]
    : fr && p < r.iOut
      ? [[L(T.floating), money(fr.move), tone(fr.move), true], [L(T.best), money(fr.best), tone(fr.best), true], [L(T.worst), money(-fr.worst), tone(-fr.worst), true], [L(T.time), span(Math.min(nowT, r.e) - r.s, lang), "text-text", false]]
      : [[L(T.result), money(((trade.exitPrice ?? 0) - trade.entryPrice) * (trade.side === "long" ? 1 : -1), trade.pnl ?? undefined), tone(trade.pnl ?? 0), true], [L(T.time), span(r.e - r.s, lang), "text-text", false],
        ...(af ? [[L(T.sinceBest), money(af.best), tone(af.best), true], [L(T.sinceWorst), money(-af.worst), tone(-af.worst), true]] as [string, string, string, boolean][] : [])];

  const why = !("loading" in load) && !load.ok ? (load.why as ReplayWhy) : null;
  const headDate = new Intl.DateTimeFormat(loc(lang), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const s = Date.parse(`${(trade.entryTime ?? "").replace(" ", "T").slice(0, 16)}Z`), e = Date.parse(`${(trade.exitTime ?? "").replace(" ", "T").slice(0, 16)}Z`);
  const multiDay = r ? new Date(r.candles[0].t).toISOString().slice(0, 10) !== new Date(r.candles[last].t).toISOString().slice(0, 10) : false;
  const dm = (ms: number) => { const d = new Date(ms); return lang === "ar" ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}` : new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" }).format(d); };
  const when = (t: number) => { const m = Math.floor(t / 6e4) * 6e4; return r && r.minutes >= 1440 ? dm(m) : multiDay ? `${dm(m)} ${hhmm(m)}` : hhmm(m); };
  const btn = "grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:text-text disabled:opacity-40";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="replay-title" className="rp-in flex w-full max-w-5xl flex-col overflow-y-auto border-border bg-surface outline-none sm:max-h-[94vh] sm:rounded-2xl sm:border">
        <div className="flex items-start gap-3 border-b border-border p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{L(T.title)}</p>
            <h2 id="replay-title" className="mt-0.5 flex flex-wrap items-center gap-2 font-heading text-lg font-semibold">
              <span dir="ltr">{trade.symbol.replace(/^[^:]+:/, "")}</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${trade.side === "long" ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]" : "border-[#f87171]/40 bg-[#f87171]/10 text-[#f87171]"}`}>{L(T[trade.side])}</span>
              <span className="text-sm font-medium text-muted" dir="ltr">{trade.qty.toLocaleString("en-US")}</span>
              {trade.pnl != null && <span className={`text-sm font-semibold ${tone(trade.pnl)}`} dir="ltr">{hidden ? "••••" : fmtMoney(trade.pnl, { cents: true, sign: true, currency })}</span>}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              <bdi>{Number.isFinite(s) ? headDate.format(new Date(s)) : "—"}</bdi> <bdi dir="ltr">{Number.isFinite(s) ? hhmm(s) : ""}</bdi> {lang === "ar" ? "←" : "→"} <bdi dir="ltr">{Number.isFinite(e) ? hhmm(e) : "—"}</bdi>
              {Number.isFinite(s) && Number.isFinite(e) && <> · <bdi>{span(e - s, lang)}</bdi></>}
            </p>
          </div>
          <button type="button" aria-label={L(T.close)} onClick={onClose} className="icon-btn -m-1.5"><X size={20} /></button>
        </div>

        <div className="border-b border-border px-4 py-3 sm:px-5">
          <label htmlFor="trade-note" className="text-xs font-semibold text-muted">{L(T.note)}</label>
          <textarea id="trade-note" ref={noteBox} value={note} rows={2} maxLength={2000} placeholder={L(T.notePh)} onChange={(ev) => { setNote(ev.target.value); saveNote(trade.key, ev.target.value); }} className="field mt-1.5 block w-full resize-y text-sm" />
        </div>

        {"loading" in load && (
          <div className="grid place-items-center gap-3 p-12 text-sm text-muted" aria-live="polite">
            <div className="h-1.5 w-56 overflow-hidden rounded-full bg-skeleton"><div className="h-full rounded-full bg-[var(--icon)] transition-all" style={{ width: `${Math.max(8, (100 * load.loading[0]) / Math.max(1, load.loading[1]))}%` }} /></div>
            {fill(L(T.loading), { d: load.loading[0], t: load.loading[1] })}
          </div>
        )}

        {why && (
          <div className="flex flex-col items-center gap-3 p-10 text-center text-sm">
            <p className="max-w-md text-muted">{why === "noTicker" ? fill(L(T.noTicker), { s: trade.symbol }) : L(T[why])}</p>
            {why === "noTicker" && onOpenReport && <button type="button" onClick={() => { onClose(); onOpenReport("benchmark"); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">{L(T.mapIt)}</button>}
            {(why === "unreachable" || why === "noData") && <button type="button" onClick={() => setAttempt((a) => a + 1)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted hover:text-text">{L(T.retry)}</button>}
          </div>
        )}

        {r && "ok" in load && load.ok && (
          <>
            <div className="px-2 pt-3 sm:px-4">
              <Chart r={r} p={p} trade={trade} digits={digits} lang={lang} />
            </div>

            <div dir="ltr" className="flex flex-wrap items-center gap-2 border-y border-border px-4 py-3">
              <button type="button" className={btn} aria-label={L(T.restart)} title={L(T.restart)} onClick={() => { stopAtExit.current = true; go(r.iIn); }}><RotateCcw size={16} /></button>
              <button type="button" className={btn} aria-label={L(T.prev)} title={L(T.prev)} disabled={p <= 0} onClick={() => go(p - 1)}><StepBack size={16} /></button>
              <button type="button" onClick={toggle} aria-label={playing ? L(T.pause) : L(T.play)} className="grid h-10 w-10 place-items-center rounded-full bg-primary text-on-primary shadow-sm">{playing ? <Pause size={18} /> : <Play size={18} className="translate-x-px" />}</button>
              <button type="button" className={btn} aria-label={L(T.next)} title={L(T.next)} disabled={p >= last} onClick={() => go(p + 1)}><StepForward size={16} /></button>
              <button type="button" className={btn} aria-label={L(T.end)} title={L(T.end)} disabled={p >= last} onClick={() => go(last)}><SkipForward size={16} /></button>
              <div className="ms-1 flex rounded-lg border border-border p-0.5" role="group" aria-label={L(T.speed)}>
                {SPEEDS.map((v) => (
                  <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)} className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${speed === v ? "bg-primary-tint text-primary" : "text-muted hover:text-text"}`}>{v}×</button>
                ))}
              </div>
              <input type="range" min={0} max={last} value={p} aria-label={L(T.position)} onChange={(ev) => go(Number(ev.target.value))} className="rp-range order-last w-full sm:order-none sm:ms-2 sm:w-auto sm:flex-1" />
            </div>

            <div className="grid grid-cols-2 gap-px border-b border-border bg-[var(--border)] sm:grid-cols-4" aria-live="polite">
              {stats.map(([label, value, cls, ltr]) => (
                <div key={label} className="bg-surface px-4 py-3">
                  <p className="text-[11px] font-medium text-muted">{label}</p>
                  <p className={`mt-0.5 text-sm font-semibold tnum ${cls}`} dir={ltr ? "ltr" : undefined}>{value}</p>
                </div>
              ))}
              {/* empty cells finish the row (2 per row on phones, 4 above) */}
              {Array.from({ length: (4 - (stats.length % 4)) % 4 }, (_, j) => <div key={j} className={`bg-surface ${j < (2 - (stats.length % 2)) % 2 ? "" : "hidden sm:block"}`} />)}
            </div>

            <div className="p-4 sm:p-5">
              <p className="mb-3 text-sm font-semibold">{L(T.story)}</p>
              <ol className="space-y-1">
                {events.map((ev, j) => {
                  const seen = ev.i <= p;
                  return (
                    <li key={j}>
                      <button type="button" onClick={() => go(ev.i)} className={`flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-start text-sm transition-opacity hover:bg-primary-tint ${seen ? "" : "opacity-40"}`}>
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ev.tone === "up" ? "bg-[#22c55e]" : ev.tone === "down" ? "bg-[#f87171]" : "bg-[var(--muted)]"}`} />
                        <span className="mt-px shrink-0 whitespace-nowrap text-xs text-muted tnum" dir="ltr">{when(ev.t)}</span>
                        <span className="min-w-0 flex-1">{lang === "ar" ? ltrNumbers(ev.text) : ev.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-[11px] leading-relaxed text-muted">{fill(L(T.source), { m: candleLabel(r.minutes, lang), tk: load.ticker })}</p>
              {load.clock === "guess" && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-muted">
                  {L(T.guess)}
                  {onOpenReport && <button type="button" onClick={() => { onClose(); onOpenReport("path"); }} className="font-semibold text-icon hover:underline">{L(T.openPath)}</button>}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
