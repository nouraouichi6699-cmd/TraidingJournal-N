// GLORIA_RPG: one character's own page in the guide's Characters tab. Reached by tapping a roster card.
//
// Everything here reads the same plumbing the rest of Gloria uses: the requirements come from the rules table that
// determineCharacters itself runs on (gloriaCharacterRules), the numbers from this month's calculateMonthlyStats /
// calculateRadarStats, and the record from the persisted hero history. The progress bar is how close the player's
// CURRENT numbers are to that character's requirements; it is a preview, and never changes the hero, which only
// moves at the scheduled updates.
import { Check, ChevronLeft, Circle } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaRadarStats, GloriaStatFocus } from "../../types/gloria";
import { characterProgress, STARTER_CHARACTER, type CriterionResult } from "../../services/gloriaCharacterRules";
import type { GloriaCharacterId, GloriaMonthlyStats } from "../../services/gloriaCharacterService";
import { nextUpdateAt } from "../../services/gloriaHeroSchedule";
import type { GloriaHero } from "../../hooks/useGloriaHero";
import { CHARACTER_DESC, CHARACTER_FOCUS, GloriaPoster, TIER_STYLE } from "./gloriaCharacterUi";
import { fmtDate, fmtRequirement, fmtValue, heroT, METRIC_LABEL } from "./gloriaHeroText";
import { CHARACTER_INFO, LEVEL_TEXT, STAT_TEXT } from "./gloriaText";

const AXES: GloriaStatFocus[] = ["precision", "speed", "defense", "wisdom", "recovery", "intelligence", "power"];

/** A thin bar in the guide's existing style (see gloriaChallengeUi.Bar), 0-100 and tier-coloured. */
export function PercentBar({ percent, color, label }: { percent: number; color: string; label: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="h-2 flex-1 overflow-hidden rounded-full bg-black/25 ring-1 ring-inset ring-white/5"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p)}
      aria-label={label}
    >
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${p}%`, background: color }} />
    </div>
  );
}

/** One requirement: tick or empty circle, its label and threshold, and (when measured) the player's number. */
export function CriterionRow({ r, lang, tone }: { r: CriterionResult; lang: Lang; tone: string }) {
  const t = heroT(lang);
  const req = fmtRequirement(r.criterion, lang);
  return (
    <li className="flex items-start gap-2.5 rounded-lg bg-black/20 px-2.5 py-2">
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${r.met ? "bg-emerald-500/20 text-emerald-400" : "text-stone-500"}`}
        aria-label={r.met ? t("yes") : t("no")}
      >
        {r.met ? <Check size={12} strokeWidth={3} /> : <Circle size={12} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-xs font-semibold text-stone-100">
            {METRIC_LABEL[r.criterion.metric][lang]}
            {req && (
              <>
                {" "}
                <span dir={lang === "ar" ? undefined : "ltr"} className={`tabular-nums text-amber-200/90 ${lang === "ar" ? "" : "font-mono"}`}>{req}</span>
              </>
            )}
          </span>
          <span className="text-[11px] text-stone-400">
            {t("you")}:{" "}
            <span dir="ltr" className={`font-mono font-bold tabular-nums ${r.met ? "text-emerald-400" : "text-stone-200"}`}>
              {fmtValue(r.criterion.metric, r.current, lang)}
            </span>
          </span>
        </div>
        {!r.met && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/30">
            <div className="h-full rounded-full" style={{ width: `${Math.round(r.progress * 100)}%`, background: tone }} />
          </div>
        )}
      </div>
    </li>
  );
}

interface Props {
  id: GloriaCharacterId;
  lang: Lang;
  hero: GloriaHero;
  /** This month's live stats and radar (presentation only). */
  live: { stats: GloriaMonthlyStats; radar: GloriaRadarStats };
  onBack: () => void;
}

export default function GloriaCharacterDetail({ id, lang, hero, live, onBack }: Props) {
  const t = heroT(lang);
  const { name, level } = CHARACTER_INFO[id];
  const tier = TIER_STYLE[level];
  const unlocked = hero.unlocked.has(id);
  const isCurrent = hero.character === id;
  const isStarter = id === STARTER_CHARACTER;
  const progress = characterProgress(id, live.stats, live.radar);
  const hasData = live.stats.totalTrades > 0;
  const focus = CHARACTER_FOCUS[id];

  const mine = hero.history.filter((h) => h.character === id);
  const arrivals = mine.filter((h) => h.changed).length;
  const earliest = mine.length ? mine[mine.length - 1].assignedAt : null; // history is newest-first
  const latest = mine.length ? mine[0].assignedAt : null;

  const nextAt = nextUpdateAt(hero.state.checkedAt, new Date());
  const metCount = progress.best.results.filter((r) => r.met).length;
  const barColor = progress.qualifies ? "#22c55e" : `linear-gradient(90deg, ${tier.ring}99, ${tier.ring})`;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 -ms-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold text-amber-200/70 transition hover:bg-white/5 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        <ChevronLeft size={14} className="rtl:rotate-180" aria-hidden /> {t("back")}
      </button>

      {/* the full poster, text and all: this page is where the artwork is meant to be appreciated whole */}
      <GloriaPoster
        id={id}
        label={`${name[lang]}, ${LEVEL_TEXT[level][lang]}`}
        locked={!unlocked}
        enlargeLabel={t("enlarge")}
        closeLabel={t("close")}
        lockedLabel={t("locked")}
        tierRing={tier.ring}
      />

      {/* identity */}
      <div
        className="relative mt-3 overflow-hidden rounded-2xl border border-white/10 p-4"
        style={{ background: `radial-gradient(120% 100% at 0% 0%, ${tier.ring}${unlocked ? "26" : "12"}, rgba(12,10,9,0.9) 65%)`, borderInlineStartColor: tier.ring, borderInlineStartWidth: 3 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="font-heading text-xl font-bold leading-tight text-stone-50">{name[lang]}</h3>
            {lang !== "en" ? (
              <div className="text-xs text-stone-400">{name.en}</div>
            ) : (
              <div className="text-xs text-stone-400" lang="ar">{name.ar}</div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${tier.badge}`}>{LEVEL_TEXT[level][lang]}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
                isCurrent ? "bg-amber-400/15 text-amber-300 ring-amber-400/50" : unlocked ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40" : "bg-stone-500/15 text-stone-400 ring-stone-500/40"
              }`}
            >
              {isCurrent ? t("currentHero") : unlocked ? t("unlocked") : t("locked")}
            </span>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-stone-200/85">{CHARACTER_DESC[id][lang]}</p>
        {isStarter && <p className="mt-1.5 text-xs font-semibold text-amber-300/90">{t("starterNote")}</p>}
      </div>

      {/* progress */}
      <section className="mt-3 rounded-xl border border-amber-500/15 bg-black/25 p-3.5" aria-label={unlocked ? t("matchNow") : t("progressUnlock")}>
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">{unlocked ? t("matchNow") : t("progressUnlock")}</h4>
          <span dir="ltr" className="font-mono text-lg font-black tabular-nums text-stone-50">
            {hasData ? progress.percent : 0}%
          </span>
        </div>
        <div className="mt-2 flex items-center">
          <PercentBar percent={hasData ? progress.percent : 0} color={barColor} label={unlocked ? t("matchNow") : t("progressUnlock")} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-stone-300/80">
          {!hasData ? (
            t("noData")
          ) : progress.qualifies ? (
            <>
              {t("reqMet")}{" "}
              <span className="font-semibold text-stone-100">
                ({fmtDate(nextAt, lang, { month: "short", day: "numeric" })})
              </span>
            </>
          ) : (
            <span dir="ltr" className="font-mono tabular-nums">
              {metCount}/{progress.best.results.length}
            </span>
          )}
          {hasData && !progress.qualifies && <> {t("requirements").toLowerCase()}</>}
        </p>
      </section>

      {/* requirements: every path (Rogue has two) */}
      <section className="mt-3" aria-label={t("requirements")}>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">{t("requirements")}</h4>
        {progress.paths.map((p, i) => (
          <div key={i}>
            {i > 0 && (
              <div className="my-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-500" aria-hidden>
                <span className="h-px flex-1 bg-white/10" /> {t("or")} <span className="h-px flex-1 bg-white/10" />
              </div>
            )}
            <ul className="flex flex-col gap-1.5">
              {p.results.map((r, j) => (
                <CriterionRow key={j} r={r} lang={lang} tone={tier.ring} />
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* the character's own stat: its focus axis, among the player's seven */}
      <section className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3.5" aria-label={t("yourStats")}>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">{t("yourStats")}</h4>
          <span className="text-[11px] text-stone-400">
            {t("focusStat")}: <span className="font-bold" style={{ color: tier.ring }}>{STAT_TEXT[focus][lang]}</span>
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {AXES.map((k) => {
            const v = Math.round(live.radar[k] ?? 0);
            const isFocus = k === focus;
            return (
              <li key={k} className="flex items-center gap-2 text-[11px]">
                <span className={`w-24 shrink-0 truncate ${isFocus ? "font-bold text-stone-50" : "text-stone-400"}`}>{STAT_TEXT[k][lang]}</span>
                <PercentBar percent={v} color={isFocus ? tier.ring : "#78716c"} label={STAT_TEXT[k][lang]} />
                <span dir="ltr" className={`w-7 shrink-0 text-end font-mono tabular-nums ${isFocus ? "font-bold text-stone-50" : "text-stone-400"}`}>{v}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* record */}
      <section className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3.5" aria-label={t("record")}>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">{t("record")}</h4>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            [t("timesHero"), mine.length ? String(arrivals) : "0"],
            [t("firstTime"), earliest ? fmtDate(earliest, lang, { month: "short", day: "numeric" }) : t("neverHero")],
            [t("lastTime"), latest ? fmtDate(latest, lang, { month: "short", day: "numeric" }) : t("neverHero")],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-black/25 px-1.5 py-2">
              <dd className="text-sm font-bold text-stone-50">{value}</dd>
              <dt className="mt-0.5 text-[10px] leading-tight text-stone-400">{label}</dt>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
