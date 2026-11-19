// A small (i) button beside an average-R figure. Opens a popover with what the rounded ratio hides: the precise
// average, how many trades it used, and the outlier trades left out of it (with a way to find them). Shared by the
// Dashboard "Avg win/loss trade" card and anywhere else that shows the rounded ratio, so the explanation never differs.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, TriangleAlert } from "lucide-react";
import type { Lang } from "../types";
import { MIN_R_TRADES, OUTLIER_R_MAX, OUTLIER_R_MIN, type RStats } from "../lib/tradeLab";

type L = Record<Lang, string>;
const T = {
  title: { en: "Average R per trade", ar: "متوسط R للصفقة", fr: "R moyen par trade" },
  open: { en: "How is this calculated?", ar: "كيف يُحسب هذا؟", fr: "Comment est-ce calculé ?" },
  precise: { en: "Precise average", ar: "المتوسط الدقيق", fr: "Moyenne exacte" },
  used: { en: "Trades used", ar: "الصفقات المستخدمة", fr: "Trades utilisés" },
  rounded: { en: "Shown as the nearest clean ratio: on average 1 unit of risk returned X units. Total R includes every trade.", ar: "يُعرض أقرب نسبة واضحة: كل وحدة مخاطرة أعادت في المتوسط X وحدة. إجمالي R يشمل كل الصفقات.", fr: "Affiché au ratio net le plus proche : en moyenne 1 unité risquée a rapporté X unités. Le R total inclut tous les trades." },
  need: { en: `Needs at least ${MIN_R_TRADES} trades with a valid R (a stop-loss recorded).`, ar: `يلزم ${MIN_R_TRADES} صفقات على الأقل لها R صالح (وقف خسارة مسجّل).`, fr: `Il faut au moins ${MIN_R_TRADES} trades avec un R valide (stop-loss enregistré).` },
  flaggedTitle: { en: "Left out of the average", ar: "مستبعدة من المتوسط", fr: "Exclus de la moyenne" },
  flaggedNote: {
    en: `These trades have an unusually large R-multiple (outside ${OUTLIER_R_MIN}R to +${OUTLIER_R_MAX}R) — check their stop-loss value for data-entry errors. They still count in Total R.`,
    ar: `هذه الصفقات لها مضاعف R كبير بشكل غير معتاد (خارج ${OUTLIER_R_MIN}R إلى +${OUTLIER_R_MAX}R) — تحقق من قيمة وقف الخسارة فيها بحثاً عن أخطاء إدخال. وما زالت تُحتسب في إجمالي R.`,
    fr: `Ces trades ont un multiple R anormalement grand (hors de ${OUTLIER_R_MIN}R à +${OUTLIER_R_MAX}R) — vérifiez la valeur de leur stop-loss (erreur de saisie ?). Ils comptent quand même dans le R total.`,
  },
  find: { en: "Open this day", ar: "افتح هذا اليوم", fr: "Ouvrir ce jour" },
} satisfies Record<string, L>;

const W = 340;

export default function RAvgInfo({ stats, lang, onOpenDay }: { stats: RStats; lang: Lang; onOpenDay?: (day: string) => void }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => setPos(null);

  const toggle = () => {
    if (pos) return close();
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left + r.width / 2 - W / 2));
    // below the button unless that would run off the bottom of the screen
    const top = r.bottom + 8 + 260 > window.innerHeight ? Math.max(8, r.top - 8 - 260) : r.bottom + 8;
    setPos({ left, top });
  };

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); btn.current?.focus(); } };
    const onDown = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("mousedown", onDown); window.removeEventListener("resize", close); };
  }, [pos]);

  const flagged = stats.flagged;
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        aria-expanded={!!pos}
        aria-controls={pos ? id : undefined}
        aria-label={T.open[lang]}
        title={T.open[lang]}
        className="relative inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-muted transition hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        <Info size={13} aria-hidden />
        {flagged.length > 0 && <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-1 ring-surface" aria-hidden />}
      </button>
      {pos &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={T.title[lang]}
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="fixed z-[200] rounded-xl border border-border bg-surface p-3 text-xs text-text shadow-2xl"
            style={{ left: pos.left, top: pos.top, width: W, maxHeight: "min(70vh, 420px)", overflowY: "auto" }}
          >
            <div className="mb-2 font-bold">{T.title[lang]}</div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
              <dt className="text-muted">{T.precise[lang]}</dt>
              <dd dir="ltr" className="tnum font-bold">{stats.avgAny == null ? "—" : `${stats.avgAny.toFixed(2)}R`}</dd>
              <dt className="text-muted">{T.used[lang]}</dt>
              <dd dir="ltr" className="tnum font-bold">{stats.usedN} / {stats.validN}</dd>
            </dl>
            <p className="mt-2 leading-relaxed text-muted">{T.rounded[lang]}</p>
            {!stats.enough && <p className="mt-2 leading-relaxed text-amber-400">{T.need[lang]}</p>}
            {flagged.length > 0 && (
              <div className="mt-3 border-t border-border pt-2">
                <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-400"><TriangleAlert size={13} aria-hidden /> {T.flaggedTitle[lang]} ({flagged.length})</div>
                <p className="mb-2 leading-relaxed text-muted">{T.flaggedNote[lang]}</p>
                <ul className="flex flex-col gap-1">
                  {flagged.slice(0, 20).map((f) => (
                    <li key={f.key} className="flex items-center justify-between gap-2 rounded-md bg-black/10 px-2 py-1">
                      <span dir="ltr" className="tnum min-w-0">{f.date} · {f.symbol} · #{f.no}</span>
                      <span dir="ltr" className="tnum shrink-0 font-bold text-amber-400">{f.r > 0 ? "+" : ""}{f.r.toFixed(1)}R</span>
                      {onOpenDay && f.date && (
                        <button type="button" onClick={() => { close(); onOpenDay(f.date); }} className="shrink-0 rounded px-1.5 py-0.5 font-semibold text-amber-400 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
                          {T.find[lang]}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {flagged.length > 20 && <div className="mt-1 text-muted">+{flagged.length - 20}</div>}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
