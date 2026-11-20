// GLORIA_RPG: the guide -- a FULL-SCREEN takeover of the game area (it used to be a side drawer), so the character
// artwork gets room to breathe. Three tabs along the top: the hero roster and per-character pages, the zone's
// challenges + boss, and the game rules. GloriaPage owns whether it is open and which tab / character it opens on
// (the HUD's hero avatar opens it on that hero's page; the land's guide button and the boss gate open Challenges).
// It covers the whole game screen (absolute, inside GloriaPage's fixed container) above the map/land and HUD but
// under the hero reveal (z-60). Escape closes it (capture phase, so GloriaPage's own Escape handler does not also
// leave the land), unless a poster viewer is open on top, which takes the Escape first. Colours are explicit
// light-on-dark because game mode is always a dark screen.
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Lock, Skull, X } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaQuestStatus, GloriaRank } from "../../types/gloria";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";
import { GLORIA_RANK_THRESHOLDS } from "../../types/gloria";
import type { MapZone } from "./gloriaZones";
import { Bar, STATUS_ICON, XpChip, zoneDetail } from "./gloriaChallengeUi";
import { gt, QUEST_STATUS_TEXT, RANK_TEXT } from "./gloriaText";
import CharactersTab, { type GloriaHeroPanelData } from "./GloriaCharactersTab";

type L = Record<Lang, string>;
export type GuideTab = "challenges" | "rules" | "characters";
type Tab = GuideTab;
const TABS: Tab[] = ["characters", "challenges", "rules"];

const TAB_TEXT: Record<Tab, L> = {
  challenges: { en: "Challenges", ar: "التحديات", fr: "Défis" },
  rules: { en: "Rules", ar: "القواعد", fr: "Règles" },
  characters: { en: "Characters", ar: "الشخصيات", fr: "Personnages" },
};

const TEXT = {
  guide: { en: "Guide", ar: "دليل", fr: "Guide" },
  close: { en: "Close guide", ar: "إغلاق الدليل", fr: "Fermer le guide" },
  progress: { en: "challenges", ar: "تحديات", fr: "défis" },
  xp: { en: "XP", ar: "XP", fr: "XP" },
} satisfies Record<string, L>;

const STATUS_TONE: Record<GloriaQuestStatus, string> = {
  locked: "text-stone-500",
  active: "text-stone-100",
  completed: "text-emerald-400",
  failed: "text-red-400",
};

// ── Rules ────────────────────────────────────────────────────────────────────────────────────────────

const RULES: { title: L; body: L }[] = [
  {
    title: { en: "How to level up", ar: "كيف تتقدم", fr: "Comment progresser" },
    body: {
      en: "Complete trading challenges to earn XP. Every zone's challenges are checked against your real trading data.",
      ar: "أنجز تحديات التداول لتكسب نقاط الخبرة. تُقاس تحديات كل منطقة على بيانات تداولك الحقيقية.",
      fr: "Relevez des défis de trading pour gagner de l'XP. Les défis de chaque zone sont vérifiés sur vos vraies données de trading.",
    },
  },
  {
    title: { en: "Zones", ar: "المناطق", fr: "Zones" },
    body: {
      en: "Seven zones, from Solmara (beginner) to the Throne (legendary). Defeat a zone's boss to unlock the next one.",
      ar: "سبع مناطق، من سولمارا (للمبتدئين) حتى العرش (أسطوري). اهزم زعيم المنطقة لتفتح المنطقة التالية.",
      fr: "Sept zones, de Solmara (débutant) au Trône (légendaire). Battez le boss d'une zone pour débloquer la suivante.",
    },
  },
  {
    title: { en: "Characters", ar: "الشخصيات", fr: "Personnages" },
    body: {
      en: "Your hero is chosen from how you actually traded, and re-assessed every Saturday (after the trading week closes) and at the start of each month; it stays fixed in between. 9 characters across 4 tiers: Fallen, Neutral, Hero and Legendary. New players start as the free Savage.",
      ar: "يُختار بطلك حسب طريقة تداولك الفعلية، ويُعاد تقييمه كل سبت (بعد إغلاق أسبوع التداول) وعند بداية كل شهر، ويبقى ثابتاً بين التحديثين. 9 شخصيات في 4 مستويات: ساقط، محايد، بطل، وأسطوري. يبدأ اللاعبون الجدد بالهمجي المجاني.",
      fr: "Votre héros est choisi selon votre façon réelle de trader, puis réévalué chaque samedi (après la clôture de la semaine de trading) et au début de chaque mois ; il reste fixe entre-temps. 9 personnages sur 4 niveaux : Déchu, Neutre, Héros et Légendaire. Les nouveaux joueurs commencent avec le Sauvage gratuit.",
    },
  },
  {
    title: { en: "Elf Meter", ar: "مقياس الإلف", fr: "Jauge Elfe" },
    body: {
      en: "Tracks your overall evolution as a trader: the average of your seven trader stats. Good habits keep it high; push every stat above 70 to become the Elf.",
      ar: "يقيس تطورك العام كمتداول: متوسط إحصاءاتك السبع. العادات الجيدة تبقيه مرتفعاً؛ ارفع كل إحصائية فوق 70 لتصبح الإلف.",
      fr: "Mesure votre évolution globale de trader : la moyenne de vos sept stats. De bonnes habitudes la gardent haute ; dépassez 70 partout pour devenir l'Elfe.",
    },
  },
  {
    title: { en: "XP & ranks", ar: "الخبرة والرتب", fr: "XP et rangs" },
    body: {
      en: "Each completed challenge adds its XP reward. Your total XP sets your rank:",
      ar: "كل تحدٍّ مكتمل يضيف مكافأته من الخبرة. مجموع خبرتك يحدد رتبتك:",
      fr: "Chaque défi terminé ajoute sa récompense d'XP. Votre XP totale fixe votre rang :",
    },
  },
];

/** Rank ladder from the real thresholds, so the guide never drifts from what the HUD awards. */
const RANK_LADDER = (Object.entries(GLORIA_RANK_THRESHOLDS) as [GloriaRank, number][])
  .sort((a, b) => a[1] - b[1])
  .map(([rank, from], i, all) => ({ rank, from, to: all[i + 1]?.[1] ?? null }));

// ── Panel ────────────────────────────────────────────────────────────────────────────────────────────

interface Props {
  /** The zone whose challenges the Challenges tab shows (null: none known yet). */
  mz: MapZone | null;
  lang: Lang;
  onClose: () => void;
  /** The selected tab (owned by GloriaPage). */
  tab: GuideTab;
  onTabChange: (tab: GuideTab) => void;
  /** The persisted hero + live stats for the Characters tab. */
  heroData: GloriaHeroPanelData;
  /** Open the Characters tab on this character's page instead of the roster. */
  initialCharacter?: GloriaCharacterId | null;
}

/** Arrow keys the walking hero listens for on window; swallowed while the guide covers the land. */
const HERO_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export default function GloriaGuidePanel({ mz, lang, onClose, tab, onTabChange: setTab, heroData, initialCharacter }: Props) {
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ challenges: null, rules: null, characters: null });
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const baseId = useId();
  const rtl = lang === "ar";

  // Focus moves into the guide on open and back to whatever opened it (the HUD avatar / the guide button) on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, []);

  // Escape closes the guide. A poster viewer (data-gz-modal) opened from inside it handles its own Escape first.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[data-gz-modal]")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Arrow keys move between tabs (the WAI-ARIA tabs pattern); arrows follow reading direction.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + (rtl ? -step : step) + TABS.length) % TABS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={TEXT.guide[lang]}
      dir={rtl ? "rtl" : "ltr"}
      // the hero walks on arrow keys (a window listener); keep them for scrolling / tabs while the guide is up
      onKeyDown={(e) => {
        if (HERO_KEYS.has(e.key)) e.stopPropagation();
      }}
      className="gz-guide-screen absolute inset-0 z-[55] flex flex-col bg-gray-950/[0.985] text-stone-100 backdrop-blur-md"
    >
      {/* tabs + close, aligned with the content column below */}
      <div className="shrink-0 border-b border-amber-500/15 bg-black/30">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-2 sm:px-4">
          <div role="tablist" aria-label={TEXT.guide[lang]} className="flex min-w-0 flex-1">
            {TABS.map((k) => {
              const active = tab === k;
              return (
                <button
                  key={k}
                  ref={(el) => {
                    tabRefs.current[k] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${k}`}
                  aria-selected={active}
                  aria-controls={`${baseId}-panel-${k}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(k)}
                  onKeyDown={onTabKey}
                  className={`-mb-px truncate border-b-2 px-3 py-3.5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400 sm:px-5 ${
                    active ? "border-amber-400 text-amber-300" : "border-transparent text-amber-200/50 hover:text-amber-200/80"
                  }`}
                >
                  {TAB_TEXT[k][lang]}
                </button>
              );
            })}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={TEXT.close[lang]}
            title={`${TEXT.close[lang]} (Esc)`}
            className="shrink-0 rounded-full p-2 text-amber-200/60 transition hover:bg-white/5 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* tab content: one centred column; the scroll lives here so the tab bar stays put */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-${tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-none"
      >
        <div className="mx-auto w-full max-w-6xl p-4 pb-10 sm:p-6">
          {tab === "challenges" && (
            <div className="mx-auto max-w-2xl">
              {mz ? <ChallengesTab mz={mz} lang={lang} /> : <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-stone-400">{gt(lang)("noChallenges")}</p>}
            </div>
          )}
          {tab === "rules" && (
            <div className="mx-auto max-w-2xl">
              <RulesTab lang={lang} />
            </div>
          )}
          {tab === "characters" && <CharactersTab lang={lang} data={heroData} initialCharacter={initialCharacter} />}
        </div>
      </div>
    </div>
  );
}

function ChallengesTab({ mz, lang }: { mz: MapZone; lang: Lang }) {
  const t = gt(lang);
  const ar = lang === "ar";
  const { visual } = mz;
  const { regular, boss, bossName, text, zoneFill } = zoneDetail(mz, lang);

  return (
    <>
      {/* progress summary */}
      <div className="mb-4 rounded-xl border border-amber-500/15 bg-black/25 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold text-amber-100">{visual.name[lang]}</span>
          <span className="shrink-0 text-xs text-amber-200/70">
            <span dir="ltr" className="font-mono font-bold tabular-nums text-amber-200">
              {mz.done}/{mz.total}
            </span>{" "}
            {TEXT.progress[lang]}
          </span>
        </div>
        <Bar value={mz.done} target={mz.total} color={zoneFill} />
      </div>

      {mz.challenges.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-stone-400">{t("noChallenges")}</p>}

      <ul className="flex flex-col gap-3">
        {regular.map(({ challenge: c, progress: p, status }) => {
          const Icon = STATUS_ICON[status];
          return (
            <li
              key={c.id}
              className={`rounded-xl border p-3.5 ${
                status === "completed"
                  ? "border-emerald-500/30 bg-emerald-500/[0.07]"
                  : status === "failed"
                    ? "border-red-500/30 bg-red-500/[0.07]"
                    : status === "active"
                      ? "border-white/15 bg-white/[0.05]"
                      : "border-white/10 bg-black/20 opacity-60"
              }`}
              style={status === "active" ? { boxShadow: `inset ${ar ? -3 : 3}px 0 0 ${visual.color}` } : undefined}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 ${STATUS_TONE[status]}`} title={QUEST_STATUS_TEXT[status][lang]}>
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold leading-snug">{text(c.name, c.nameAr)}</div>
                    <XpChip xp={c.xpReward} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-stone-400">{text(c.description, c.descriptionAr)}</p>
                  <div className={`mt-1.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_TONE[status]}`}>{QUEST_STATUS_TEXT[status][lang]}</div>
                  {status !== "locked" && p && (
                    <Bar value={p.currentValue} target={p.targetValue} color={status === "completed" ? "#22c55e" : status === "failed" ? "#ef4444" : zoneFill} />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* the boss */}
      {(boss || bossName) && (
        <div
          className={`relative mt-5 overflow-hidden rounded-2xl border p-4 ${
            boss?.status === "completed" ? "border-amber-400/40" : boss?.status === "active" ? "gz-boss-card--active border-red-500/60" : "border-red-900/50"
          }`}
          style={{ background: "radial-gradient(120% 90% at 50% 0%, rgba(127,29,29,0.6), rgba(28,25,23,0.94) 70%)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 ${
                boss?.status === "completed" ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-red-500 bg-red-950 text-red-300"
              }`}
            >
              <Skull size={30} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300/80">{t("boss")}</div>
              <div className="font-heading text-lg font-bold leading-tight text-red-50">{bossName ?? text(boss!.challenge.name, boss!.challenge.nameAr)}</div>
            </div>
            {boss && <XpChip xp={boss.challenge.xpReward} />}
          </div>
          {boss && (
            <>
              <div className="mt-3 text-sm font-semibold text-red-100">{text(boss.challenge.name, boss.challenge.nameAr)}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-red-200/70">{text(boss.challenge.description, boss.challenge.descriptionAr)}</p>
              {boss.status === "locked" && (
                <p className="mt-3 flex items-center gap-2 text-xs text-red-200/60">
                  <Lock size={13} className="shrink-0" /> {t("bossLocked")}
                </p>
              )}
              {boss.status === "active" && (
                <>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wider text-red-400">{t("bossAwaits")}</p>
                  {boss.progress && <Bar value={boss.progress.currentValue} target={boss.progress.targetValue} color="#ef4444" />}
                </>
              )}
              {boss.status === "completed" && (
                <div className="absolute bottom-3 end-4 rotate-[-12deg] rounded-md border-2 border-amber-400 px-2 py-0.5 text-xs font-black uppercase tracking-widest text-amber-400">
                  {t("bossDefeated")}
                </div>
              )}
              {boss.status === "failed" && <p className="mt-3 text-xs font-bold uppercase text-red-400">{QUEST_STATUS_TEXT.failed[lang]}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}

function RulesTab({ lang }: { lang: Lang }) {
  return (
    <div className="divide-y divide-amber-500/15">
      {RULES.map((r, i) => (
        <section key={i} className="py-4 first:pt-1 last:pb-1">
          <h3 className="mb-1.5 text-sm font-bold text-amber-300">{r.title[lang]}</h3>
          <p className="text-[13px] leading-relaxed text-stone-200/85">{r.body[lang]}</p>
          {i === RULES.length - 1 && (
            <ul className="mt-2.5 space-y-1">
              {RANK_LADDER.map(({ rank, from, to }) => (
                <li key={rank} className="flex items-center justify-between gap-3 rounded-md bg-black/25 px-2.5 py-1.5 text-xs">
                  <span className="font-semibold text-amber-100">{RANK_TEXT[rank][lang]}</span>
                  <span dir="ltr" className="font-mono tabular-nums text-stone-300">
                    {from.toLocaleString("en-US")}
                    {to != null ? ` → ${to.toLocaleString("en-US")}` : "+"} {TEXT.xp[lang]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
