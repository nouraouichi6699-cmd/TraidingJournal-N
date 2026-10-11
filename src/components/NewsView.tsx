import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, ExternalLink, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Key } from "../i18n";
import type { Lang } from "../types";

type Cat = "forex" | "crypto" | "geopolitics" | "economy";
interface Item { id: string; title: string; summary: string; url: string; sources: string[]; category: Cat; date: string }
interface Payload { items: Item[]; failed: string[]; updated: string; sources: string[] }

const CATS: Cat[] = ["forex", "crypto", "geopolitics", "economy"];
const PREF = "mizan-news";

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

  const load = async () => {
    setBusy(true);
    setErr(false);
    const { data, error } = await supabase.functions.invoke("news");
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

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm font-medium ${on ? "border-icon bg-primary-tint text-icon" : "border-border text-muted hover:text-text"}`;

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-4">
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
      {!err && !data && <p className="text-muted">{t("loadingNews")}</p>}
      {data && data.failed.length > 0 && <p className="text-xs text-muted">{t("someSourcesDown")} {data.failed.join(", ")}</p>}
      {data && items.length === 0 && <p className="text-muted">{t("noNews")}</p>}

      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-md bg-primary-tint px-2 py-0.5 font-semibold text-icon">{t(`cat_${i.category}` as Key)}</span>
              <time dateTime={i.date}>{fmtTime(i.date)}</time>
              {i.sources.length > 1 && (
                <span className="flex items-center gap-1 font-semibold text-icon"><ShieldCheck size={13} />{i.sources.length} {t("sourcesCount")}</span>
              )}
            </div>
            <h3 dir="auto" className="font-heading text-base font-semibold leading-snug">{i.title}</h3>
            {i.summary && <p dir="auto" className="mt-1.5 line-clamp-3 text-sm text-muted">{i.summary}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {i.sources.map((s) => (
                <span key={s} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{s}</span>
              ))}
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="ms-auto flex items-center gap-1.5 font-semibold text-icon hover:underline">
                {t("readAtSource")} <ExternalLink size={14} />
              </a>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t("newsDisclaimer")}</p>
    </section>
  );
}
