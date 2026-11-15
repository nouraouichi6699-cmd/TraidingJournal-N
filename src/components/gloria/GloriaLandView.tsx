// GLORIA_RPG: the land view -- what fills the screen once you travel INTO a zone. The world map shrinks to a
// mini-nav beside it (see GloriaPage); this side is the land itself: its banner and lore, a progress ring,
// the challenge cards in a grid, and the boss fight at the bottom.
//
// Challenge display logic is shared with GloriaZonePanel through gloriaChallengeUi. Colours are explicit
// light-on-dark (not theme tokens) because game mode is always a dark screen.
import { useEffect, useRef } from "react";
import { Check, Lock, Skull, Swords, X } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaQuestStatus } from "../../types/gloria";
import { ZoneScene } from "./GloriaZoneNode";
import type { MapZone } from "./gloriaZones";
import { Bar, STATUS_ICON, XpChip, zoneDetail } from "./gloriaChallengeUi";
import { gt, QUEST_STATUS_TEXT, ZONE_STATE_TEXT } from "./gloriaText";
import "./gloria.css";

const STATUS_TONE: Record<GloriaQuestStatus, string> = {
  locked: "text-stone-500",
  active: "text-stone-100",
  completed: "text-emerald-400",
  failed: "text-red-400",
};

const COMPLETE_TEXT: Record<Lang, string> = { en: "challenges complete", ar: "تحديات مكتملة", fr: "défis terminés" };
const BACK_TEXT: Record<Lang, string> = { en: "Back to the world map", ar: "العودة إلى خريطة العالم", fr: "Retour à la carte du monde" };

function ProgressRing({ done, total, color }: { done: number; total: number; color: string }) {
  const r = 42;
  const len = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" aria-hidden>
      <circle cx={50} cy={50} r={r} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.1)" strokeWidth={8} />
      <circle
        cx={50}
        cy={50}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${len * pct} ${len}`}
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
      <text x={50} y={50} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={800} fill="#fafaf9" direction="ltr">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

interface Props {
  mz: MapZone;
  /** The zone before this one, named in the "how to unlock" line. */
  prev: MapZone | null;
  lang: Lang;
  onClose: () => void;
  className?: string;
}

export default function GloriaLandView({ mz, prev, lang, onClose, className = "" }: Props) {
  const t = gt(lang);
  const ar = lang === "ar";
  const { visual, zone, state, done, total } = mz;
  const { regular, boss, bossName, text, zoneFill } = zoneDetail(mz, lang);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Arriving in a land (or switching lands from the mini-map): start at the top, focus the way back.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    closeRef.current?.focus({ preventScroll: true });
  }, [visual.order]);

  return (
    <section
      ref={scrollRef}
      aria-label={visual.name[lang]}
      className={`gz-land h-full overflow-y-auto text-stone-100 ${className}`}
      style={{
        background: `radial-gradient(120% 70% at 50% 0%, ${visual.color}33, transparent 65%), linear-gradient(180deg, #0c0a09, #000)`,
      }}
    >
      {/* banner */}
      <header className="relative overflow-hidden border-b border-white/10">
        <div className="h-1.5 w-full" style={{ background: zoneFill }} />
        <div className="relative p-5 sm:p-7" style={{ background: `linear-gradient(135deg, ${visual.color}40, transparent 70%)` }}>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={BACK_TEXT[lang]}
            title={`${BACK_TEXT[lang]} (Esc)`}
            className="absolute end-3 top-3 rounded-full border border-white/15 bg-black/40 p-1.5 text-stone-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <X size={18} />
          </button>

          <div className="flex flex-wrap items-center gap-5 pe-8">
            <svg viewBox="-48 -48 96 96" className="h-24 w-24 shrink-0 drop-shadow-lg sm:h-28 sm:w-28" aria-hidden>
              <circle r={46} fill="#1c1917" stroke={state === "locked" ? "#57534e" : "#ca8a04"} strokeWidth={3} />
              <g style={state === "locked" ? { filter: "grayscale(1) brightness(0.6)" } : undefined}>
                <ZoneScene theme={visual.theme} />
              </g>
            </svg>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
                {ar ? "المنطقة" : "Zone"} <span dir="ltr">{visual.order}</span>
              </div>
              <h2 className="font-heading text-3xl font-black leading-tight sm:text-4xl" style={{ textShadow: `0 0 24px ${visual.color}66` }}>
                {visual.name[lang]}
              </h2>
              <span
                className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                  state === "completed" ? "bg-amber-400/15 text-amber-400 ring-amber-400/30" : state === "active" ? "bg-emerald-400/15 text-emerald-400 ring-emerald-400/30" : "bg-white/5 text-stone-400 ring-white/10"
                }`}
              >
                {state === "completed" ? <Check size={12} /> : state === "active" ? <Swords size={12} /> : <Lock size={12} />}
                {ZONE_STATE_TEXT[state][lang]}
              </span>
            </div>

            {/* progress summary */}
            {total > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-3">
                <ProgressRing done={done} total={total} color={state === "completed" ? "#facc15" : visual.color} />
                <div>
                  <div dir="ltr" className="text-2xl font-black tabular-nums">
                    {done}/{total}
                  </div>
                  <div className="text-xs text-stone-400">{COMPLETE_TEXT[lang]}</div>
                </div>
              </div>
            )}
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-stone-300">{visual.blurb[lang]}</p>
          {state === "locked" && prev && (
            <p className="mt-3 flex max-w-3xl items-center gap-2 rounded-lg bg-black/30 px-3 py-2 text-xs text-stone-400">
              <Lock size={14} className="shrink-0" />
              <span>
                {t("lockedZone")} <b className="text-stone-100">{prev.visual.name[lang]}</b>
              </span>
            </p>
          )}
          {zone?.reward && (
            <p className="mt-2 text-xs text-stone-400">
              {t("reward")}: <span className="font-semibold text-amber-400">{zone.reward}</span>
            </p>
          )}
        </div>
      </header>

      <div className="p-5 sm:p-7">
        {/* challenges */}
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-stone-400">{t("challenges")}</h3>
        {mz.challenges.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-stone-400">{t("noChallenges")}</p>}
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {regular.map(({ challenge: c, progress: p, status }) => {
            const Icon = STATUS_ICON[status];
            return (
              <li
                key={c.id}
                className={`rounded-xl border p-4 backdrop-blur-sm transition ${
                  status === "completed" ? "border-emerald-500/30 bg-emerald-500/[0.07]" : status === "failed" ? "border-red-500/30 bg-red-500/[0.07]" : status === "active" ? "border-white/15 bg-white/[0.05]" : "border-white/10 bg-black/20 opacity-60"
                }`}
                style={status === "active" ? { boxShadow: `inset ${ar ? -3 : 3}px 0 0 ${visual.color}` } : undefined}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${STATUS_TONE[status]}`} title={QUEST_STATUS_TEXT[status][lang]}>
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold leading-snug">{text(c.name, c.nameAr)}</div>
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
            className={`relative mt-8 overflow-hidden rounded-2xl border p-5 sm:p-6 ${
              boss?.status === "completed" ? "border-amber-400/40" : boss?.status === "active" ? "gz-boss-card--active border-red-500/60" : "border-red-900/50"
            }`}
            style={{ background: "radial-gradient(120% 90% at 50% 0%, rgba(127,29,29,0.6), rgba(28,25,23,0.94) 70%)" }}
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 sm:h-20 sm:w-20 ${
                  boss?.status === "completed" ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-red-500 bg-red-950 text-red-300"
                }`}
              >
                <Skull size={38} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300/80">{t("boss")}</div>
                <div className="font-heading text-xl font-bold leading-tight text-red-50 sm:text-2xl">{bossName ?? text(boss!.challenge.name, boss!.challenge.nameAr)}</div>
              </div>
              {boss && <XpChip xp={boss.challenge.xpReward} big />}
            </div>
            {boss && (
              <>
                <div className="mt-4 text-sm font-semibold text-red-100">{text(boss.challenge.name, boss.challenge.nameAr)}</div>
                <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-red-200/70">{text(boss.challenge.description, boss.challenge.descriptionAr)}</p>
                {boss.status === "locked" && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-red-200/60">
                    <Lock size={13} /> {t("bossLocked")}
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
      </div>
    </section>
  );
}
