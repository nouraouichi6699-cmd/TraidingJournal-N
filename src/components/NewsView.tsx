import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, ExternalLink, ShieldCheck, Bitcoin, Globe2, Landmark, DollarSign, ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Key } from "../i18n";
import type { Lang } from "../types";

type Cat = "forex" | "crypto" | "geopolitics" | "economy";
interface Item { id: string; title: string; summary: string; url: string; sources: string[]; category: Cat; date: string }
interface Payload { items: Item[]; failed: string[]; updated: string; sources: string[] }

const CATS: Cat[] = ["forex", "crypto", "geopolitics", "economy"];
const PREF = "mizan-news";
const ICON = { forex: DollarSign, crypto: Bitcoin, geopolitics: Globe2, economy: Landmark } as const;

const loadPrefs = (): { cats: Cat[]; q: string } => {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) ?? "{}");
    return { cats: Array.isArray(p.cats) ? p.cats.filter((c: Cat) => CATS.includes(c)) : [], q: "" };
  } catch {
    return { cats: [], q: "" };
  }
};

export default function NewsView({ t, lang }: { t: (k: Key) => string; lang: Lang }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [{ cats, q }, setF] = useState(loadPrefs);
  const [source, setSource] = useState("");
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
        (!multi || i.sources.length > 1) &&
        (!n || (i.title + " " + i.summary).toLowerCase().includes(n)),
    );
  }, [data, cats, q, source, multi]);

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

      {err && <p role="alert" className="rounded-xl border border-loss/40 p-4 text-sm text-loss">{t("newsError")}</p>}
      {!err && !data && (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label={t("loadingNews")}>
          {[0, 1, 2, 3].map((k) => <div key={k} className={`news-skel h-36 rounded-2xl ${k === 0 ? "sm:col-span-2 h-44" : ""}`} />)}
        </div>
      )}
      {data && data.failed.length > 0 && <p className="text-xs text-muted">{t("someSourcesDown")} {data.failed.join(", ")}</p>}
      {data && items.length === 0 && <p className="text-muted">{t("noNews")}</p>}

      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((i, idx) => {
          const Icon = ICON[i.category];
          const hero = idx === 0;
          return (
            <li key={i.id} className={hero ? "sm:col-span-2" : ""}>
              <button
                type="button"
                onClick={() => { setDir("none"); setOpen(idx); }}
                style={{ ["--i" as string]: idx }}
                className={`news-card group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface text-start ${hero ? "p-6" : "p-4"}`}
              >
                <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-icon opacity-70 transition-all duration-300 group-hover:w-1.5 group-hover:opacity-100" />
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-tint text-icon"><Icon size={15} /></span>
                  <span className="font-semibold text-icon">{t(`cat_${i.category}` as Key)}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={i.date}>{fmtTime(i.date)}</time>
                  {i.sources.length > 1 && (
                    <span className="ms-auto flex items-center gap-1 rounded-full bg-primary-tint px-2 py-0.5 font-semibold text-icon"><ShieldCheck size={13} />{i.sources.length} {t("sourcesCount")}</span>
                  )}
                </div>
                <h3 dir="auto" className={`font-heading font-semibold leading-snug ${hero ? "text-xl sm:text-2xl" : "text-base"}`}>{i.title}</h3>
                {i.summary && <p dir="auto" className={`mt-2 text-sm text-muted ${hero ? "line-clamp-4" : "line-clamp-3"}`}>{i.summary}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                  {i.sources.map((s) => <span key={s} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{s}</span>)}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {open !== null && items[open] && (() => {
        const i = items[open];
        const Icon = ICON[i.category];
        return (
          <div className="news-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
            <div className="news-panel relative flex w-full max-w-2xl items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" aria-label="previous" disabled={open === 0} onClick={() => go(-1)} className="icon-btn shrink-0 border border-border bg-surface disabled:opacity-30 directional-icon">
                <ChevronLeft size={20} className="text-icon" />
              </button>
              <article key={i.id} className={`min-w-0 flex-1 rounded-2xl border border-icon/60 bg-surface p-6 ${dir === "next" ? "news-slide-next" : dir === "prev" ? "news-slide-prev" : ""}`}>
                <div className="mb-3 flex items-center gap-2 text-xs text-muted">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-tint text-icon"><Icon size={17} /></span>
                  <span className="font-semibold text-icon">{t(`cat_${i.category}` as Key)}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={i.date}>{fmtTime(i.date)}</time>
                  <button type="button" aria-label="close" onClick={() => setOpen(null)} className="icon-btn ms-auto !h-8 !w-8"><X size={18} className="text-muted" /></button>
                </div>
                <h2 dir="auto" className="font-heading text-xl font-bold leading-snug sm:text-2xl">{i.title}</h2>
                {i.summary && <p dir="auto" className="mt-3 text-sm leading-relaxed text-muted">{i.summary}</p>}
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
              </article>
              <button type="button" aria-label="next" disabled={open === items.length - 1} onClick={() => go(1)} className="icon-btn shrink-0 border border-border bg-surface disabled:opacity-30 directional-icon">
                <ChevronRight size={20} className="text-icon" />
              </button>
            </div>
          </div>
        );
      })()}
      <p className="text-xs text-muted">{t("newsDisclaimer")}</p>
    </section>
  );
}
