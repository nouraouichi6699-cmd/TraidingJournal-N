// GLORIA_RPG: the guide's "Your Hero" card (collapsible) and the trophy-case timeline of past heroes. Both sit at the
// top of the Characters tab. They read the PERSISTED hero (useGloriaHero): the name, tier and explanation come from
// what was stored at the last scheduled update, including the snapshot of numbers that justified the pick.
import { useId, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, ChevronDown, TriangleAlert, Trophy } from "lucide-react";
import type { Lang } from "../../types";
import { characterProgress } from "../../services/gloriaCharacterRules";
import { nextMonthStart, nextWeeklyAt } from "../../services/gloriaHeroSchedule";
import type { GloriaHero } from "../../hooks/useGloriaHero";
import { CriterionRow } from "./GloriaCharacterDetail";
import { CHARACTER_DESC, GloriaPortrait, TIER_STYLE } from "./gloriaCharacterUi";
import { fmtDate, fmtMonth, fmtNum, heroIntro, heroT, KIND_TEXT, STAT_SHORT } from "./gloriaHeroText";
import { CHARACTER_INFO, LEVEL_TEXT } from "./gloriaText";

const HISTORY_PREVIEW = 5;

export function HeroSection({ hero, lang }: { hero: GloriaHero; lang: Lang }) {
  const t = heroT(lang);
  const bodyId = useId();
  const [open, setOpen] = useState(true);

  const { state } = hero;
  const info = CHARACTER_INFO[hero.character];
  const tier = TIER_STYLE[info.level];
  const snap = state.snapshot;
  const reason = state.isStarter || !snap ? "starter" : snap.reason;

  // The numbers behind the pick, exactly as stored, re-read through the same requirement table.
  const rows = useMemo(() => (snap ? characterProgress(hero.character, snap.stats, snap.radar).best.results : []), [snap, hero.character]);

  const basedOn: [string, string][] = snap
    ? [
        [STAT_SHORT.trades[lang], String(snap.stats.totalTrades)],
        ...(snap.stats.winRate != null ? [[STAT_SHORT.winRate[lang], `${fmtNum(snap.stats.winRate)}%`] as [string, string]] : []),
        ...(snap.stats.maxDrawdown != null ? [[STAT_SHORT.drawdown[lang], `${fmtNum(snap.stats.maxDrawdown)}%`] as [string, string]] : []),
        ...(snap.stats.avgRR != null ? [[STAT_SHORT.rr[lang], fmtNum(snap.stats.avgRR)] as [string, string]] : []),
        ...(snap.stats.followedPlanRate != null ? [[STAT_SHORT.plan[lang], `${fmtNum(snap.stats.followedPlanRate)}%`] as [string, string]] : []),
      ]
    : [];

  const now = new Date();
  const weekly = state.checkedAt ? nextWeeklyAt(state.checkedAt, now) : null;
  const monthStart = nextMonthStart(now);

  return (
    <section className="rounded-xl border border-amber-500/20 bg-black/25" aria-label={t("yourHero")} style={{ boxShadow: `inset 0 1px 0 ${tier.ring}33` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-3 rounded-xl p-3 text-start transition hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400"
      >
        <GloriaPortrait id={hero.character} level={info.level} size={48} glow={info.level === "legendary"} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">{t("yourHero")}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-heading text-base font-bold leading-tight text-stone-50">{hero.loading ? t("loadingHero") : info.name[lang]}</span>
            {!hero.loading && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${tier.badge}`}>{LEVEL_TEXT[info.level][lang]}</span>
            )}
          </span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-amber-200/60 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div id={bodyId} className="border-t border-amber-500/10 px-3.5 pb-3.5 pt-3">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {state.isStarter && (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/50">{t("freeStarter")}</span>
            )}
            <span className="text-xs leading-relaxed text-stone-300/80">{CHARACTER_DESC[hero.character][lang]}</span>
          </div>

          {hero.error && (
            <p role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.07] px-2.5 py-2 text-xs text-red-300">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {t("scheduleError")} <span dir="ltr" className="opacity-70">{hero.error}</span>
              </span>
            </p>
          )}

          {/* why */}
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">{t("whyTitle")}</h4>
          <p className="text-[13px] leading-relaxed text-stone-200/85">{heroIntro(reason, lang, { name: info.name[lang], trades: snap?.stats.totalTrades ?? 0 })}</p>

          {snap && (
            <>
              <p className="mt-2.5 text-[11px] leading-relaxed text-stone-400">
                {t("basedOn")} <span className="font-semibold text-stone-200">{fmtMonth(snap.month, lang)}</span>
                {": "}
                {basedOn.map(([label, value], i) => (
                  <span key={label}>
                    {i > 0 && " · "}
                    {label} <bdi dir="ltr" className="font-mono tabular-nums text-stone-300">{value}</bdi>
                  </span>
                ))}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {rows.map((r, i) => (
                  <CriterionRow key={i} r={r} lang={lang} tone={tier.ring} />
                ))}
              </ul>
              {snap.secondary && (
                <p className="mt-2.5 flex items-center gap-2 text-xs text-stone-400">
                  <GloriaPortrait id={snap.secondary} level={CHARACTER_INFO[snap.secondary].level} size={22} />
                  {t("runnerUp")}: <span className="font-semibold text-stone-200">{CHARACTER_INFO[snap.secondary].name[lang]}</span>
                </p>
              )}
            </>
          )}

          {/* schedule */}
          {!hero.error && (
            <>
              <h4 className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wider text-amber-300">{t("scheduleTitle")}</h4>
              <div className="grid grid-cols-2 gap-2">
                {weekly && (
                  <div className="rounded-lg bg-black/25 px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      <CalendarClock size={12} aria-hidden /> {t("nextWeekly")}
                    </div>
                    <div className="mt-1 text-sm font-bold text-stone-50">{fmtDate(weekly, lang, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</div>
                    <div className="mt-0.5 text-[10px] leading-snug text-stone-500">{t("weeklyNote")}</div>
                  </div>
                )}
                <div className={`rounded-lg bg-black/25 px-2.5 py-2 ${weekly ? "" : "col-span-2"}`}>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    <CalendarDays size={12} aria-hidden /> {t("nextMonth")}
                  </div>
                  <div className="mt-1 text-sm font-bold text-stone-50">{fmtDate(monthStart, lang, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</div>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-stone-400">{t("scheduleNote")}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function HeroHistory({ hero, lang }: { hero: GloriaHero; lang: Lang }) {
  const t = heroT(lang);
  const [all, setAll] = useState(false);
  const entries = all ? hero.history : hero.history.slice(0, HISTORY_PREVIEW);

  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-3.5" aria-label={t("trophyTitle")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
          <Trophy size={14} aria-hidden /> {t("trophyTitle")}
        </h4>
        <span className="text-[11px] text-stone-400">
          <span dir="ltr" className="font-mono font-bold tabular-nums text-stone-200">
            {hero.unlocked.size}/9
          </span>{" "}
          {t("collected")}
        </span>
      </div>

      {hero.history.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-stone-400">{t("noHistory")}</p>
      ) : (
        <ol className="relative ms-2 border-s border-amber-500/20">
          {entries.map((h, i) => {
            const info = CHARACTER_INFO[h.character];
            const tier = TIER_STYLE[info.level];
            return (
              <li key={h.id} className="relative pb-3.5 ps-5 last:pb-0">
                <span
                  className="absolute -start-[5px] top-3 h-2.5 w-2.5 rounded-full ring-2 ring-gray-900"
                  style={{ background: h.changed ? tier.ring : "#57534e" }}
                  aria-hidden
                />
                <div className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${i === 0 ? "border-amber-500/25 bg-amber-500/[0.05]" : "border-white/[0.07] bg-black/20"}`}>
                  <GloriaPortrait id={h.character} level={info.level} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[13px] font-bold text-stone-50">{info.name[lang]}</span>
                      <span
                        className={`rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ring-1 ${
                          h.changed ? "bg-amber-400/15 text-amber-300 ring-amber-400/40" : "bg-stone-500/10 text-stone-400 ring-stone-500/30"
                        }`}
                      >
                        {h.changed ? t("newHero") : t("held")}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-stone-400">
                      {KIND_TEXT[h.kind][lang]} · {fmtDate(h.assignedAt, lang)}
                      {h.changed && h.previous && (
                        <>
                          {" · "}
                          {t("from")} {CHARACTER_INFO[h.previous].name[lang]}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {hero.history.length > HISTORY_PREVIEW && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-3 w-full rounded-lg border border-white/10 py-1.5 text-xs font-bold text-amber-200/70 transition hover:bg-white/5 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          {all ? t("showLess") : `${t("showAll")} (${hero.history.length})`}
        </button>
      )}
    </section>
  );
}
