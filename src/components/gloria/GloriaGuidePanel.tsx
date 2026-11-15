// GLORIA_RPG: the land view's guide -- a codex panel that slides in from the land's end edge, opened by the
// floating guide button (GloriaLandView). Three tabs: the current zone's challenges + boss, the game rules, and
// the character roster. The land view owns the selected tab, so the boss gate can open the guide on Challenges. It floats over the land (absolute), above the land art but under the cloud curtain
// (.gz-tc is z-30). Colours are explicit light-on-dark because game mode is always a dark screen.
import { useId, useRef, type CSSProperties, type KeyboardEvent, type Ref } from "react";
import { Crosshair, HeartPulse, Lock, Shield, Shuffle, Skull, Sparkles, Sword, WandSparkles, X, Zap } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaCharacterLevel, GloriaQuestStatus, GloriaRank } from "../../types/gloria";
import { GLORIA_RANK_THRESHOLDS } from "../../types/gloria";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";
import type { MapZone } from "./gloriaZones";
import { Bar, STATUS_ICON, XpChip, zoneDetail } from "./gloriaChallengeUi";
import { CHARACTER_INFO, gt, LEVEL_TEXT, QUEST_STATUS_TEXT, RANK_TEXT } from "./gloriaText";

type L = Record<Lang, string>;
export type GuideTab = "challenges" | "rules" | "characters";
type Tab = GuideTab;
const TABS: Tab[] = ["challenges", "rules", "characters"];

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
      en: "Your hero is chosen each month from how you actually traded. 9 characters across 4 tiers: Fallen, Neutral, Hero and Legendary.",
      ar: "يُختار بطلك كل شهر حسب طريقة تداولك الفعلية. 9 شخصيات في 4 مستويات: ساقط، محايد، بطل، وأسطوري.",
      fr: "Votre héros est choisi chaque mois selon votre façon réelle de trader. 9 personnages sur 4 niveaux : Déchu, Neutre, Héros et Légendaire.",
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

// ── Characters ───────────────────────────────────────────────────────────────────────────────────────

const CHARACTER_ICON: Record<GloriaCharacterId, typeof Sword> = {
  savage: Skull,
  rogue: Shuffle,
  warrior: Sword,
  sniper: Crosshair,
  tank: Shield,
  healer: HeartPulse,
  mage: WandSparkles,
  assassin: Zap,
  elf: Sparkles,
};

/** Mirrors gloria_characters.description / description_ar (supabase/migrations/20261114_gloria_characters_reseed.sql). */
const CHARACTER_DESC: Record<GloriaCharacterId, L> = {
  savage: { en: "Trades on raw emotion, no plan, no limits.", ar: "يتداول بدافع العاطفة الخام، بلا خطة وبلا حدود.", fr: "Trade à l'émotion brute, sans plan ni limites." },
  rogue: { en: "Still breaking even, no clear edge yet.", ar: "لا يزال عند نقطة التعادل، بلا ميزة واضحة بعد.", fr: "Toujours à l'équilibre, sans avantage clair pour l'instant." },
  warrior: { en: "Executes often and keeps the plan under volume.", ar: "ينفذ بكثافة وثبات، صفقة بعد صفقة.", fr: "Exécute souvent et tient son plan malgré le volume." },
  sniper: { en: "Few shots, each one chosen with precision.", ar: "صفقات قليلة، كل واحدة مختارة بدقة.", fr: "Peu de tirs, chacun choisi avec précision." },
  tank: { en: "Puts capital first, barely dents the drawdown.", ar: "يضع حماية رأس المال فوق كل شيء.", fr: "Le capital d'abord, un drawdown à peine entamé." },
  healer: { en: "Came back from a losing month with renewed discipline.", ar: "عاد بعد شهر خاسر بانضباط متجدد.", fr: "Revenu d'un mois perdant avec une discipline renouvelée." },
  mage: { en: "Reads many markets at once, edge backed by numbers.", ar: "يقرأ أسواقاً متعددة في آن واحد، بميزة تدعمها الأرقام.", fr: "Lit plusieurs marchés à la fois, un avantage prouvé par les chiffres." },
  assassin: { en: "Fast, precise strikes with high conviction.", ar: "ضربات سريعة ودقيقة بثقة عالية.", fr: "Des frappes rapides et précises, avec conviction." },
  elf: { en: "Edge, risk and emotion, all finally in balance.", ar: "الميزة والمخاطرة والعاطفة، كلها في توازن تام أخيراً.", fr: "Avantage, risque et émotion, enfin en équilibre." },
};

const TIER_STYLE: Record<GloriaCharacterLevel, { ring: string; bg: string; fg: string; badge: string }> = {
  negative: { ring: "#ef4444", bg: "radial-gradient(circle at 35% 30%, #7f1d1d, #1c1917)", fg: "#fecaca", badge: "bg-red-500/15 text-red-300 ring-red-500/40" },
  neutral: { ring: "#94a3b8", bg: "radial-gradient(circle at 35% 30%, #475569, #1e293b)", fg: "#e2e8f0", badge: "bg-slate-400/15 text-slate-300 ring-slate-400/40" },
  positive: { ring: "#22c55e", bg: "radial-gradient(circle at 35% 30%, #166534, #052e16)", fg: "#dcfce7", badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40" },
  legendary: { ring: "#facc15", bg: "radial-gradient(circle at 35% 30%, #a16207, #422006)", fg: "#fef9c3", badge: "bg-amber-400/15 text-amber-300 ring-amber-400/50" },
};

const CHARACTER_IDS = Object.keys(CHARACTER_INFO) as GloriaCharacterId[];

// ── Panel ────────────────────────────────────────────────────────────────────────────────────────────

interface Props {
  mz: MapZone;
  lang: Lang;
  onClose: () => void;
  /** Lets the land view move focus into the panel when it opens. */
  closeRef?: Ref<HTMLButtonElement>;
  id?: string;
  /** The selected tab (owned by the land view). */
  tab: GuideTab;
  onTabChange: (tab: GuideTab) => void;
}

export default function GloriaGuidePanel({ mz, lang, onClose, closeRef, id, tab, onTabChange: setTab }: Props) {
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ challenges: null, rules: null, characters: null });
  const baseId = useId();
  const rtl = lang === "ar";

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
    <aside
      id={id}
      aria-label={TEXT.guide[lang]}
      className="gz-guide absolute inset-y-0 end-0 z-20 flex w-full flex-col border-s border-amber-500/20 bg-gray-900/95 text-stone-100 shadow-2xl shadow-black/60 backdrop-blur-md md:w-[380px]"
      style={{ "--gz-guide-from": rtl ? "-100%" : "100%" } as CSSProperties}
    >
      {/* header + tabs */}
      <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/10 ps-2 pe-2">
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
                className={`-mb-px truncate border-b-2 px-3 py-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400 ${
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
          className="shrink-0 rounded-full p-1.5 text-amber-200/60 transition hover:bg-white/5 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <X size={18} />
        </button>
      </div>

      {/* tab content; extra bottom padding on phones so the floating guide button never hides the last card */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-${tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-20 focus-visible:outline-none md:pb-6"
      >
        {tab === "challenges" && <ChallengesTab mz={mz} lang={lang} />}
        {tab === "rules" && <RulesTab lang={lang} />}
        {tab === "characters" && <CharactersTab lang={lang} />}
      </div>
    </aside>
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

function CharactersTab({ lang }: { lang: Lang }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {CHARACTER_IDS.map((id) => {
        const { name, level } = CHARACTER_INFO[id];
        const s = TIER_STYLE[level];
        const Icon = CHARACTER_ICON[id];
        return (
          <li key={id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/25 p-3" style={{ borderInlineStartColor: s.ring, borderInlineStartWidth: 3 }}>
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2"
              style={{ borderColor: s.ring, background: s.bg, color: s.fg, boxShadow: level === "legendary" ? `0 0 12px ${s.ring}66` : undefined }}
              aria-hidden
            >
              <Icon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-bold text-stone-50">{name[lang]}</span>
                {lang !== "en" && <span className="text-xs text-stone-400">{name.en}</span>}
                {lang === "en" && <span className="text-xs text-stone-400" lang="ar">{name.ar}</span>}
                <span className={`ms-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${s.badge}`}>{LEVEL_TEXT[level][lang]}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-stone-300/80">{CHARACTER_DESC[id][lang]}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
