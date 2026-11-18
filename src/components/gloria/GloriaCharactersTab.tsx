// GLORIA_RPG: the guide's Characters tab: "Your Hero" (collapsible), the trophy case, then the full 9-character
// roster. Characters the player has not unlocked stay in the list as locked silhouettes with a hint of what it takes
// (read from the same requirement table determineCharacters uses). Tapping a card opens that character's own page.
import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaRadarStats } from "../../types/gloria";
import { characterProgress } from "../../services/gloriaCharacterRules";
import type { GloriaCharacterId, GloriaMonthlyStats } from "../../services/gloriaCharacterService";
import type { GloriaHero } from "../../hooks/useGloriaHero";
import GloriaCharacterDetail, { PercentBar } from "./GloriaCharacterDetail";
import { HeroHistory, HeroSection } from "./GloriaHeroSection";
import { CHARACTER_DESC, GloriaPortrait, TIER_STYLE } from "./gloriaCharacterUi";
import { heroT, unlockHint } from "./gloriaHeroText";
import { CHARACTER_INFO, LEVEL_TEXT } from "./gloriaText";

const CHARACTER_IDS = Object.keys(CHARACTER_INFO) as GloriaCharacterId[];

/** What the guide needs to show the hero system: the persisted hero, plus this month's live numbers for the progress bars. */
export interface GloriaHeroPanelData {
  hero: GloriaHero;
  live: { stats: GloriaMonthlyStats; radar: GloriaRadarStats };
}

export default function CharactersTab({ lang, data }: { lang: Lang; data: GloriaHeroPanelData }) {
  const t = heroT(lang);
  const { hero, live } = data;
  const [selected, setSelected] = useState<GloriaCharacterId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Partial<Record<GloriaCharacterId, HTMLButtonElement | null>>>({});

  const percents = useMemo(
    () => Object.fromEntries(CHARACTER_IDS.map((id) => [id, characterProgress(id, live.stats, live.radar).percent])) as Record<GloriaCharacterId, number>,
    [live],
  );

  const scrollTop = () => (rootRef.current?.closest('[role="tabpanel"]') as HTMLElement | null)?.scrollTo({ top: 0 });
  const open = useCallback((id: GloriaCharacterId) => {
    setSelected(id);
    scrollTop();
  }, []);
  const close = useCallback(() => {
    const was = selected;
    setSelected(null);
    // back on the roster, hand focus back to the card that was open
    if (was) requestAnimationFrame(() => cardRefs.current[was]?.focus({ preventScroll: false }));
  }, [selected]);

  if (selected) {
    return (
      <div ref={rootRef}>
        <GloriaCharacterDetail id={selected} lang={lang} hero={hero} live={live} onBack={close} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <HeroSection hero={hero} lang={lang} />
      <HeroHistory hero={hero} lang={lang} />

      <ul className="flex flex-col gap-2.5">
        {CHARACTER_IDS.map((id) => {
          const { name, level } = CHARACTER_INFO[id];
          const tier = TIER_STYLE[level];
          const locked = !hero.unlocked.has(id);
          const current = hero.character === id;
          const hint = unlockHint(id, lang);
          return (
            <li key={id}>
              <button
                ref={(el) => {
                  cardRefs.current[id] = el;
                }}
                type="button"
                onClick={() => open(id)}
                aria-label={`${name[lang]}, ${locked ? t("locked") : current ? t("currentHero") : t("unlocked")}. ${t("details")}`}
                className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-start transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  current ? "border-amber-400/50 bg-amber-400/[0.07]" : locked ? "border-white/[0.07] bg-black/30 hover:bg-black/40" : "border-white/10 bg-black/25 hover:bg-white/[0.05]"
                }`}
                style={{ borderInlineStartColor: locked ? "#44403c" : tier.ring, borderInlineStartWidth: 3, boxShadow: current ? `0 0 14px ${tier.ring}33` : undefined }}
              >
                <GloriaPortrait id={id} level={level} size={44} locked={locked} glow={current && level === "legendary"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`text-sm font-bold ${locked ? "text-stone-400" : "text-stone-50"}`}>{name[lang]}</span>
                    {lang !== "en" && <span className="text-xs text-stone-500">{name.en}</span>}
                    {lang === "en" && <span className="text-xs text-stone-500" lang="ar">{name.ar}</span>}
                    <span className={`ms-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${locked ? "bg-stone-500/10 text-stone-500 ring-stone-500/30" : tier.badge}`}>
                      {LEVEL_TEXT[level][lang]}
                    </span>
                  </div>

                  {current && <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">{t("currentHero")}</div>}

                  {locked ? (
                    <>
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-stone-400">
                        <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
                        <span>
                          <span className="font-semibold text-stone-300">{t("toUnlock")}:</span> <span>{hint}</span>
                        </span>
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <PercentBar percent={percents[id]} color={tier.ring} label={`${name[lang]}: ${t("progressUnlock")}`} />
                        <span dir="ltr" className="w-9 shrink-0 text-end font-mono text-[11px] font-bold tabular-nums text-stone-400">{percents[id]}%</span>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-xs leading-relaxed text-stone-300/80">{CHARACTER_DESC[id][lang]}</p>
                  )}
                </div>
                <ChevronRight size={16} className="mt-3 shrink-0 text-stone-500 transition group-hover:text-amber-200 rtl:rotate-180" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
