// GLORIA_RPG: the zone detail panel that slides in from the inline end (right in LTR, left in RTL) when a zone
// medallion is clicked -- zone lore, its challenges with live progress, and the boss fight at the bottom.
import { useEffect, useRef, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Lock, Skull, Swords, X } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaQuestStatus } from "../../types/gloria";
import { ZoneScene } from "./GloriaZoneNode";
import type { MapZone } from "./gloriaZones";
import { Bar, STATUS_ICON, XpChip, zoneDetail } from "./gloriaChallengeUi";
import { gt, QUEST_STATUS_TEXT, ZONE_STATE_TEXT } from "./gloriaText";
import "./gloria.css";

const STATUS_TONE: Record<GloriaQuestStatus, string> = {
  locked: "text-muted",
  active: "text-text",
  completed: "text-profit",
  failed: "text-loss",
};

interface Props {
  mz: MapZone | null;
  /** The zone before this one, named in the "how to unlock" line. */
  prev: MapZone | null;
  lang: Lang;
  onClose: () => void;
}

export default function GloriaZonePanel({ mz, prev, lang, onClose }: Props) {
  const t = gt(lang);
  const rtl = lang === "ar";
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mz) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mz, onClose]);

  return (
    <AnimatePresence>
      {mz && (
        <>
          <motion.div
            key="gz-backdrop"
            className="fixed inset-0 z-40 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key="gz-panel"
            role="dialog"
            aria-modal="true"
            aria-label={mz.visual.name[lang]}
            className="gz-panel fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col border-s border-border bg-surface text-text shadow-2xl"
            initial={{ x: rtl ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: rtl ? "-100%" : "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <PanelBody mz={mz} prev={prev} lang={lang} onClose={onClose} closeRef={closeRef} t={t} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function PanelBody({ mz, prev, lang, onClose, closeRef, t }: Props & { mz: MapZone; closeRef: RefObject<HTMLButtonElement>; t: ReturnType<typeof gt> }) {
  const { visual, zone, state, done, total } = mz;
  const { regular, boss, bossName, text, zoneFill } = zoneDetail(mz, lang);
  const ar = lang === "ar";

  return (
    <>
      {/* banner */}
      <div className="relative overflow-hidden border-b border-border p-5" style={{ background: `linear-gradient(135deg, ${visual.color}40, transparent 70%)` }}>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="absolute end-3 top-3 rounded-full border border-border bg-surface/80 p-1.5 text-muted transition hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-4">
          <svg viewBox="-48 -48 96 96" className="h-24 w-24 shrink-0 drop-shadow-lg" aria-hidden>
            <circle r={46} fill="#1c1917" stroke={state === "locked" ? "#57534e" : "#ca8a04"} strokeWidth={3} />
            <g style={state === "locked" ? { filter: "grayscale(1) brightness(0.6)" } : undefined}>
              <ZoneScene theme={visual.theme} />
            </g>
          </svg>
          <div className="min-w-0 pe-8">
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted">
              {ar ? "المنطقة" : "Zone"} <span dir="ltr">{visual.order}</span>
            </div>
            <h2 className="font-heading text-xl font-bold leading-tight">{visual.name[lang]}</h2>
            <span
              className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                state === "completed" ? "bg-amber-400/15 text-amber-400 ring-amber-400/30" : state === "active" ? "bg-emerald-400/15 text-emerald-400 ring-emerald-400/30" : "bg-white/5 text-muted ring-border"
              }`}
            >
              {state === "completed" ? <Check size={12} /> : state === "active" ? <Swords size={12} /> : <Lock size={12} />}
              {ZONE_STATE_TEXT[state][lang]}
            </span>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">{visual.blurb[lang]}</p>
        {total > 0 && (
          <div className="mt-3">
            <Bar value={done} target={total} color={state === "completed" ? "#facc15" : zoneFill} />
          </div>
        )}
        {state === "locked" && prev && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs text-muted">
            <Lock size={14} className="shrink-0" />
            <span>
              {t("lockedZone")} <b className="text-text">{prev.visual.name[lang]}</b>
            </span>
          </p>
        )}
        {zone?.reward && (
          <p className="mt-2 text-xs text-muted">
            {t("reward")}: <span className="font-semibold text-amber-400">{zone.reward}</span>
          </p>
        )}
      </div>

      {/* challenges */}
      <div className="flex-1 overflow-y-auto p-5">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t("challenges")}</h3>
        {mz.challenges.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">{t("noChallenges")}</p>}
        <ul className="space-y-2.5">
          {regular.map(({ challenge: c, progress: p, status }) => {
            const Icon = STATUS_ICON[status];
            const locked = status === "locked";
            return (
              <li
                key={c.id}
                className={`rounded-xl border p-3 transition ${
                  status === "completed" ? "border-emerald-500/30 bg-emerald-500/5" : status === "failed" ? "border-red-500/30 bg-red-500/5" : status === "active" ? "border-border bg-white/[0.03]" : "border-border/60 opacity-60"
                }`}
                style={status === "active" ? { boxShadow: `inset ${ar ? -3 : 3}px 0 0 ${visual.color}` } : undefined}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${STATUS_TONE[status]}`} title={QUEST_STATUS_TEXT[status][lang]}>
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold leading-snug">{text(c.name, c.nameAr)}</div>
                      <XpChip xp={c.xpReward} />
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{text(c.description, c.descriptionAr)}</p>
                    <div className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_TONE[status]}`}>{QUEST_STATUS_TEXT[status][lang]}</div>
                    {!locked && p && <Bar value={p.currentValue} target={p.targetValue} color={status === "completed" ? "#22c55e" : status === "failed" ? "#ef4444" : zoneFill} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* the boss */}
        {(boss || bossName) && (
          <div
            className={`relative mt-6 overflow-hidden rounded-2xl border p-4 ${
              boss?.status === "completed" ? "border-amber-400/40" : boss?.status === "active" ? "gz-boss-card--active border-red-500/60" : "border-red-900/50"
            }`}
            style={{ background: "radial-gradient(120% 90% at 50% 0%, rgba(127,29,29,0.55), rgba(28,25,23,0.92) 70%)" }}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 ${boss?.status === "completed" ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-red-500 bg-red-950 text-red-300"}`}>
                <Skull size={30} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300/80">{t("boss")}</div>
                <div className="font-heading text-lg font-bold leading-tight text-red-50">{bossName ?? text(boss!.challenge.name, boss!.challenge.nameAr)}</div>
              </div>
              {boss && <XpChip xp={boss.challenge.xpReward} big />}
            </div>
            {boss && (
              <>
                <div className="mt-3 text-sm font-semibold text-red-100">{text(boss.challenge.name, boss.challenge.nameAr)}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-red-200/70">{text(boss.challenge.description, boss.challenge.descriptionAr)}</p>
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
                {boss.status === "failed" && <p className="mt-3 text-xs font-bold uppercase text-loss">{QUEST_STATUS_TEXT.failed[lang]}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
