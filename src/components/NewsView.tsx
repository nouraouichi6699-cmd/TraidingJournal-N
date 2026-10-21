import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search, RefreshCw, ExternalLink, ShieldCheck, Bitcoin, Globe2, Landmark, DollarSign, ChevronLeft, ChevronRight, X,
  ArrowUp, ArrowDown, Equal, Coins, Droplet, Euro, PoundSterling, JapaneseYen, CircleDollarSign, Siren,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Key } from "../i18n";
import type { Lang } from "../types";
import HeartButton from "./HeartButton";
import { newsKey, type Interests } from "../useInterests";

type Cat = "forex" | "crypto" | "geopolitics" | "economy";
type Level = "high" | "medium" | "low";
type Dir = "up" | "down" | "flat";
interface Asset { sym: string; dir: Dir }
interface Item {
  id: string; title: string; summary: string; url: string; sources: string[]; category: Cat; date: string;
  image?: string; impact?: { level: Level; assets: Asset[] };
}
interface Payload { items: Item[]; failed: string[]; updated: string; sources: string[] }

const CATS: Cat[] = ["forex", "crypto", "geopolitics", "economy"];
const LEVELS: Level[] = ["high", "medium", "low"];
const PREF = "mizan-news";
const CAT_ICON = { forex: DollarSign, crypto: Bitcoin, geopolitics: Globe2, economy: Landmark } as const;

// Severity colours as requested: very high = black + red text, medium = white + blue text, normal = green + white text.
const SEV_STYLE: Record<Level, string> = {
  high: "bg-black text-[#f87171] border border-[#f87171]/60",
  medium: "bg-white text-[#2563eb] border border-[#2563eb]/30",
  low: "bg-[#16a34a] text-white border border-[#16a34a]",
};
const SEV_KEY = { high: "sevHigh", medium: "sevMedium", low: "sevLow" } as const;
const DIR_STYLE: Record<Dir, { c: string; Icon: typeof ArrowUp }> = {
  up: { c: "text-[#22c55e] border-[#22c55e]/40 bg-[#22c55e]/10", Icon: ArrowUp },
  down: { c: "text-[#f87171] border-[#f87171]/40 bg-[#f87171]/10", Icon: ArrowDown },
  flat: { c: "text-[#3b82f6] border-[#3b82f6]/40 bg-[#3b82f6]/10", Icon: Equal },
};

function symIcon(sym: string) {
  const s = sym.toUpperCase();
  if (s === "BTC") return <Bitcoin size={14} />;
  if (s === "ETH") return <span className="text-[13px] font-bold leading-none">Ξ</span>;
  if (s === "XAU") return <Coins size={14} />;
  if (s === "OIL") return <Droplet size={14} />;
  const base = s.split("/")[0];
  if (base === "USD") return <DollarSign size={14} />;
  if (base === "EUR") return <Euro size={14} />;
  if (base === "GBP") return <PoundSterling size={14} />;
  if (base === "JPY") return <JapaneseYen size={14} />;
  return <CircleDollarSign size={14} />;
}
const symLabel = (s: string) => (s === "XAU" ? "XAU · Gold" : s === "OIL" ? "OIL" : s);

const loadPrefs = (): { cats: Cat[]; q: string } => {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) ?? "{}");
    return { cats: Array.isArray(p.cats) ? p.cats.filter((c: Cat) => CATS.includes(c)) : [], q: "" };
  } catch {
    return { cats: [], q: "" };
  }
};

function Sev({ level, t, big }: { level: Level; t: (k: Key) => string; big?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ${big ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"} ${SEV_STYLE[level]}`}>
      {level === "high" && <Siren size={big ? 15 : 13} />}
      {t(SEV_KEY[level])}
    </span>
  );
}

function Assets({ assets, t }: { assets: Asset[]; t: (k: Key) => string }) {
  if (assets.length === 0)
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${DIR_STYLE.flat.c}`}>
        <Equal size={14} />{t("noEffect")}
      </span>
    );
  return (
    <>
      {assets.map((a) => {
        const { c, Icon } = DIR_STYLE[a.dir];
        return (
          <span key={a.sym} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold ${c}`}>
            {symIcon(a.sym)}
            <span className="tnum">{symLabel(a.sym)}</span>
            <Icon size={14} strokeWidth={3} />
          </span>
        );
      })}
    </>
  );
}

function Cover({ item, className, big }: { item: Item; className: string; big?: boolean }) {
  const [bad, setBad] = useState(false);
  const Icon = CAT_ICON[item.category];
  if (item.image && !bad)
    return (
      <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className={`${className} object-cover`} />
    );
  return (
    <div aria-hidden className={`${className} flex items-center justify-center bg-gradient-to-br from-primary-tint to-transparent`}>
      <Icon size={big ? 56 : 40} className="text-icon opacity-40" strokeWidth={1.4} />
    </div>
  );
}

export default function NewsView({ t, lang, interests }: { t: (k: Key) => string; lang: Lang; interests: Interests }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [{ cats, q }, setF] = useState(loadPrefs);
  const [source, setSource] = useState("");
  const [sev, setSev] = useState<Level | "">("");
  const [multi, setMulti] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [dir, setDir] = useState<"next" | "prev" | "none">("none");

  const load = async () => {
    setBusy(true);
    setErr(false);
    const { data, error } = await supabase.functions.invoke("NEWS");
    setBusy(false);
    if (error || !data?.items) return setErr(true);
    setData(data as Payload);
  };
  useEffect(() => { void load(); }, []);

  const setCats = (next: Cat[]) => {
    setF((f) => ({ ...f, cats: next }));
    try { localStorage.setItem(PREF, JSON.stringify({ cats: next })); } catch {}
  };
  const toggle = (c: Cat) => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]);

  const items = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (i) =>
        (cats.length === 0 || cats.includes(i.category)) &&
        (!source || i.sources.includes(source)) &&
        (!sev || (i.impact?.level ?? "low") === sev) &&
        (!multi || i.sources.length > 1) &&
        (!n || (i.title + " " + i.summary).toLowerCase().includes(n)),
    );
  }, [data, cats, q, source, sev, multi]);

  const go = (d: 1 | -1) => {
    if (open === null) return;
    const n = open + d;
    if (n < 0 || n >= items.length) return;
    setDir(d === 1 ? "next" : "prev");
    setOpen(n);
  };
  useEffect(() => {
    if (open === null) return;
    const rtl = document.documentElement.dir === "rtl";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") go(rtl ? -1 : 1);
      if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  });

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm font-medium ${on ? "border-icon bg-primary-tint text-icon" : "border-border text-muted hover:text-text"}`;

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-icon" />
          <input className="field !ps-9" value={q} onChange={(e) => setF((f) => ({ ...f, q: e.target.value }))} placeholder={t("newsSearch")} aria-label={t("newsSearch")} />
        </div>
        <button type="button" onClick={load} disabled={busy} aria-label={t("refresh")} title={t("refresh")} className="icon-btn border border-border">
          <RefreshCw size={16} className={`text-icon ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("newsInterests")}>
        <button type="button" className={chip(cats.length === 0)} onClick={() => setCats([])}>{t("catAll")}</button>
        {CATS.map((c) => (
          <button key={c} type="button" aria-pressed={cats.includes(c)} className={chip(cats.includes(c))} onClick={() => toggle(c)}>
            {t(`cat_${c}` as Key)}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <select className="field !min-h-0 !w-auto !py-1 text-sm" value={source} onChange={(e) => setSource(e.target.value)} aria-label={t("newsSource")}>
          <option value="">{t("allSources")}</option>
          {(data?.sources ?? []).map((s) => <option key={s}>{s}</option>)}
        </select>
        <button type="button" aria-pressed={multi} className={`${chip(multi)} flex items-center gap-1.5`} onClick={() => setMulti(!multi)}>
          <ShieldCheck size={14} />{t("multiOnly")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("sevFilter")}>
        <span className="text-sm font-semibold text-muted">{t("sevFilter")}:</span>
        <button type="button" className={chip(sev === "")} onClick={() => setSev("")}>{t("catAll")}</button>
        {LEVELS.map((l) => (
          <button key={l} type="button" aria-pressed={sev === l} onClick={() => setSev(sev === l ? "" : l)} className={`rounded-full transition-transform ${sev === l ? "scale-110 ring-2 ring-icon ring-offset-2 ring-offset-bg" : "opacity-80 hover:opacity-100"}`}>
            <Sev level={l} t={t} big />
          </button>
        ))}
      </div>

      {err && <p role="alert" className="rounded-xl border border-loss/40 p-4 text-sm text-loss">{t("newsError")}</p>}
      {!err && !data && (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label={t("loadingNews")}>
          {[0, 1, 2, 3].map((k) => <div key={k} className={`news-skel h-48 rounded-2xl ${k === 0 ? "sm:col-span-2 h-60" : ""}`} />)}
        </div>
      )}
      {data && data.failed.length > 0 && <p className="text-xs text-muted">{t("someSourcesDown")} {data.failed.join(", ")}</p>}
      {data && items.length === 0 && <p className="text-muted">{t("noNews")}</p>}

      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((i, idx) => {
          const hero = idx === 0;
          const level = i.impact?.level ?? "low";
          return (
            <li key={i.id} className={`relative ${hero ? "sm:col-span-2" : ""}`}>
              <HeartButton on={interests.has(newsKey(i))} label={interests.has(newsKey(i)) ? t("unfollow") : t("follow")} onClick={() => interests.toggle(newsKey(i))} overlay className="absolute end-3 top-3 z-10" />
              <button
                type="button"
                onClick={() => { setDir("none"); setOpen(idx); }}
                style={{ ["--i" as string]: idx }}
                className={`news-card group relative flex h-full w-full overflow-hidden rounded-2xl border bg-surface text-start ${hero ? "flex-col sm:flex-row" : "flex-col"} ${level === "high" ? "border-[#f87171]/50" : "border-border"}`}
              >
                <div className={`relative shrink-0 overflow-hidden ${hero ? "h-48 sm:h-auto sm:w-[46%]" : "h-40"}`}>
                  <Cover item={i} big={hero} className="h-full w-full transition-transform duration-500 group-hover:scale-110" />
                  <span className="absolute start-3 top-3"><Sev level={level} t={t} /></span>
                </div>
                <div className={`flex min-w-0 flex-1 flex-col ${hero ? "p-6" : "p-4"}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-icon">{t(`cat_${i.category}` as Key)}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={i.date}>{fmtTime(i.date)}</time>
                    {i.sources.length > 1 && (
                      <span className="ms-auto flex items-center gap-1 rounded-full bg-primary-tint px-2 py-0.5 font-semibold text-icon"><ShieldCheck size={13} />{i.sources.length} {t("sourcesCount")}</span>
                    )}
                  </div>
                  <h3 dir="auto" className={`font-heading font-semibold leading-snug ${hero ? "text-xl sm:text-2xl" : "text-base"}`}>{i.title}</h3>
                  {i.summary && <p dir="auto" className={`mt-2 text-sm text-muted ${hero ? "line-clamp-4" : "line-clamp-2"}`}>{i.summary}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                    <Assets assets={i.impact?.assets ?? []} t={t} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {i.sources.map((s) => <span key={s} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{s}</span>)}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {open !== null && items[open] && (() => {
        const i = items[open];
        const level = i.impact?.level ?? "low";
        return createPortal( // outside the animated page wrapper, so the overlay really covers the screen
          <div className="news-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
            <div className="news-panel relative flex max-h-full w-full max-w-2xl items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" aria-label="previous" disabled={open === 0} onClick={() => go(-1)} className="icon-btn shrink-0 border border-border bg-surface disabled:opacity-30 directional-icon">
                <ChevronLeft size={20} className="text-icon" />
              </button>
              <article key={i.id} className={`max-h-[90vh] min-w-0 flex-1 overflow-y-auto rounded-2xl border bg-surface ${level === "high" ? "border-[#f87171]/60" : "border-icon"} ${dir === "next" ? "news-slide-next" : dir === "prev" ? "news-slide-prev" : ""}`}>
                <div className="relative h-52 overflow-hidden sm:h-64">
                  <Cover item={i} big className="h-full w-full" />
                  <span className="absolute start-4 top-4"><Sev level={level} t={t} big /></span>
                  <HeartButton on={interests.has(newsKey(i))} label={interests.has(newsKey(i)) ? t("unfollow") : t("follow")} onClick={() => interests.toggle(newsKey(i))} overlay className="absolute end-14 top-3" />
                  <button type="button" aria-label="close" onClick={() => setOpen(null)} className="icon-btn absolute end-3 top-3 !h-8 !w-8 bg-black/50"><X size={18} className="text-white" /></button>
                </div>
                <div className="p-6">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-icon">{t(`cat_${i.category}` as Key)}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={i.date}>{fmtTime(i.date)}</time>
                  </div>
                  <h2 dir="auto" className="font-heading text-xl font-bold leading-snug sm:text-2xl">{i.title}</h2>
                  {i.summary && <p dir="auto" className="mt-3 text-sm leading-relaxed text-muted">{i.summary}</p>}
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold text-muted">{t("impactOn")}</p>
                    <div className="flex flex-wrap gap-1.5"><Assets assets={i.impact?.assets ?? []} t={t} /></div>
                    <p className="mt-2 text-xs text-muted">{t("autoNote")}</p>
                  </div>
                  {i.sources.length > 1 && (
                    <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-icon"><ShieldCheck size={15} />{t("reportedBy")} {i.sources.length} {t("sourcesCount")}</p>
                  )}
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    {i.sources.map((s) => <span key={s} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">{s}</span>)}
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="ms-auto flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
                      {t("readAtSource")} <ExternalLink size={15} />
                    </a>
                  </div>
                  <p className="mt-3 text-center text-xs text-muted">{open + 1} / {items.length}</p>
                </div>
              </article>
              <button type="button" aria-label="next" disabled={open === items.length - 1} onClick={() => go(1)} className="icon-btn shrink-0 border border-border bg-surface disabled:opacity-30 directional-icon">
                <ChevronRight size={20} className="text-icon" />
              </button>
            </div>
          </div>
        , document.body);
      })()}
      <p className="text-xs text-muted">{t("newsDisclaimer")}</p>
    </section>
  );
}
