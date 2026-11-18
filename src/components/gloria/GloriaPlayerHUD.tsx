// GLORIA_RPG: the top HUD -- hero avatar, name + tier, XP bar toward the next rank, rank badge, Elf Meter gauge,
// and a tiny 7-axis radar of this month's trader stats (hover/focus it for the exact values).
import { Crown, RefreshCw, Sparkles } from "lucide-react";
import type { Lang } from "../../types";
import type { GloriaRadarStats, GloriaRank, GloriaStatFocus } from "../../types/gloria";
import { GLORIA_RANK_THRESHOLDS } from "../../types/gloria";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";
import { CHARACTER_INFO, gt, LEVEL_TEXT, RANK_TEXT, STAT_TEXT } from "./gloriaText";
import { GloriaPortrait, TIER_STYLE } from "./gloriaCharacterUi";
import { HERO_TEXT } from "./gloriaHeroText";
import "./gloria.css";

const RANK_COLOR: Record<GloriaRank, string> = {
  beginner: "#a8a29e",
  intermediate: "#4ade80",
  advanced: "#38bdf8",
  expert: "#a78bfa",
  master: "#fb923c",
  legend: "#facc15",
};

const RANKS = (Object.entries(GLORIA_RANK_THRESHOLDS) as [GloriaRank, number][]).sort((a, b) => a[1] - b[1]);
const AXES: GloriaStatFocus[] = ["precision", "speed", "defense", "wisdom", "recovery", "intelligence", "power"];

function Radar({ radar, lang }: { radar: GloriaRadarStats; lang: Lang }) {
  const t = gt(lang);
  const R = 30;
  const pt = (i: number, v: number) => {
    const a = (i / AXES.length) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * R * (v / 100), Math.sin(a) * R * (v / 100)] as const;
  };
  const ring = (v: number) => AXES.map((_, i) => pt(i, v).join(",")).join(" ");
  const shape = AXES.map((k, i) => pt(i, Math.max(4, radar[k] ?? 0)).join(",")).join(" ");
  return (
    <div className="group relative" tabIndex={0} aria-label={`${t("radar")}: ${AXES.map((k) => `${STAT_TEXT[k][lang]} ${Math.round(radar[k] ?? 0)}`).join(", ")}`}>
      <svg viewBox="-38 -38 76 76" className="h-16 w-16 text-muted" aria-hidden>
        {[33, 66, 100].map((v) => (
          <polygon key={v} points={ring(v)} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={0.7} />
        ))}
        {AXES.map((_, i) => {
          const [x, y] = pt(i, 100);
          return <line key={i} x1={0} y1={0} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.2} strokeWidth={0.6} />;
        })}
        <polygon points={shape} fill="#8b5cf6" fillOpacity={0.35} stroke="#a78bfa" strokeWidth={1.6} strokeLinejoin="round" />
        {AXES.map((k, i) => {
          const [x, y] = pt(i, Math.max(4, radar[k] ?? 0));
          return <circle key={k} cx={x} cy={y} r={1.6} fill="#c4b5fd" />;
        })}
      </svg>
      <div className="pointer-events-none absolute end-0 top-full z-30 mt-2 hidden w-48 rounded-xl border border-border bg-surface p-3 text-xs shadow-xl group-hover:block group-focus:block">
        <div className="mb-1.5 font-bold text-text">{t("radar")}</div>
        {AXES.map((k) => (
          <div key={k} className="flex justify-between gap-2 py-0.5 text-muted">
            <span>{STAT_TEXT[k][lang]}</span>
            <span dir="ltr" className="font-mono font-semibold tabular-nums text-text">{Math.round(radar[k] ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ElfGauge({ value, lang }: { value: number; lang: Lang }) {
  const t = gt(lang);
  const v = Math.max(0, Math.min(100, value));
  const arc = "M-26 0 A26 26 0 0 1 26 0";
  const len = Math.PI * 26;
  return (
    <div className="flex flex-col items-center" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={t("elfMeter")}>
      <svg viewBox="-32 -30 64 36" className="h-10 w-[72px]" aria-hidden>
        <defs>
          <linearGradient id="gz-elf" x1="0" x2="1">
            <stop offset="0" stopColor="#22c55e" />
            <stop offset="1" stopColor="#facc15" />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke="currentColor" className="text-border" strokeWidth={6} strokeLinecap="round" />
        <path d={arc} fill="none" stroke="url(#gz-elf)" strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(len * v) / 100} ${len}`} style={{ transition: "stroke-dasharray 1s ease" }} />
        <text y={-3} textAnchor="middle" fontSize={12} fontWeight={800} className="fill-text" direction="ltr">
          {Math.round(v)}%
        </text>
      </svg>
      <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">
        <Sparkles size={10} className="text-amber-400" /> {t("elfMeter")}
      </span>
    </div>
  );
}

interface Props {
  lang: Lang;
  /** The persisted hero (see useGloriaHero); null only while it is still loading. */
  character: GloriaCharacterId | null;
  /** True while the hero is the free starter. */
  isStarter?: boolean;
  /** Click the hero: opens the full-screen guide on this hero's page. */
  onOpenHero?: () => void;
  totalXp: number;
  rank: GloriaRank;
  elfMeter: number;
  radar: GloriaRadarStats;
  evaluating: boolean;
  onRefresh: () => void;
}

export default function GloriaPlayerHUD({ lang, character, isStarter, onOpenHero, totalXp, rank, elfMeter, radar, evaluating, onRefresh }: Props) {
  const t = gt(lang);
  const info = character ? CHARACTER_INFO[character] : null;
  const tier = TIER_STYLE[info?.level ?? "none"];

  const idx = RANKS.findIndex(([r]) => r === rank);
  const cur = RANKS[idx]?.[1] ?? 0;
  const next = RANKS[idx + 1] ?? null;
  const pct = next ? Math.max(0, Math.min(100, ((totalXp - cur) / (next[1] - cur)) * 100)) : 100;
  const rankColor = RANK_COLOR[rank];

  return (
    <div className="gz-root relative flex flex-wrap items-center gap-x-5 gap-y-3 overflow-hidden rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />

      {/* hero */}
      <button
        type="button"
        onClick={onOpenHero}
        disabled={!onOpenHero}
        aria-label={`${info ? info.name[lang] : t("noHero")}: ${HERO_TEXT.openHero[lang]}`}
        title={HERO_TEXT.openHero[lang]}
        className="group -m-1 flex min-w-0 items-center gap-3 rounded-xl p-1 text-start transition enabled:cursor-pointer enabled:hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        <GloriaPortrait id={character} level={info?.level ?? null} size={56} glow={info?.level === "legendary"} />
        <div className="min-w-0">
          <div className="truncate font-heading text-base font-bold leading-tight text-text">{info ? info.name[lang] : t("noHero")}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {info ? (
              <>
                <span className="rounded-full px-1.5 py-px font-bold" style={{ color: tier.ring, background: `${tier.ring}1f` }}>
                  {LEVEL_TEXT[info.level][lang]}
                </span>
                {isStarter && <span className="rounded-full bg-amber-400/15 px-1.5 py-px font-bold text-amber-400">{HERO_TEXT.freeStarter[lang]}</span>}
              </>
            ) : (
              <span className="text-muted">{t("noHeroHint")}</span>
            )}
          </div>
        </div>
      </button>

      {/* rank + xp */}
      <div className="flex min-w-[220px] flex-1 items-center gap-3">
        <div
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-black uppercase tracking-wider"
          style={{ color: rankColor, background: `${rankColor}1a`, boxShadow: `inset 0 0 0 1px ${rankColor}55` }}
        >
          <Crown size={14} /> {RANK_TEXT[rank][lang]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted">
            <span dir="ltr" className="font-mono font-bold tabular-nums text-text">
              {totalXp.toLocaleString("en-US")}
              {next && <span className="text-muted"> / {next[1].toLocaleString("en-US")}</span>} {t("xp")}
            </span>
            <span className="truncate">{next ? `${t("nextRank")} ${RANK_TEXT[next[0]][lang]}` : t("maxRank")}</span>
          </div>
          <div
            className="relative mt-1 h-3 overflow-hidden rounded-full bg-black/30 ring-1 ring-inset ring-white/10"
            role="progressbar"
            aria-valuemin={cur}
            aria-valuemax={next?.[1] ?? totalXp}
            aria-valuenow={totalXp}
            aria-label={t("xp")}
          >
            <div className="relative h-full overflow-hidden rounded-full transition-[width] duration-1000" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #a855f7, ${rankColor})` }}>
              <div className="gz-xp-sheen absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
            </div>
          </div>
        </div>
      </div>

      <ElfGauge value={elfMeter} lang={lang} />
      <Radar radar={radar} lang={lang} />

      <button
        type="button"
        onClick={onRefresh}
        disabled={evaluating}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-text disabled:opacity-60"
      >
        <RefreshCw size={14} className={evaluating ? "animate-spin" : ""} />
        {evaluating ? t("checking") : t("checkNow")}
      </button>
    </div>
  );
}
