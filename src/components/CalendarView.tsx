import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search, SlidersHorizontal, Bell, BellRing, Heart, Download, RefreshCw, X, CalendarDays, CalendarOff, Mic, ArrowUp, ArrowDown, Equal,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Key } from "../i18n";
import type { Lang } from "../types";
import HeartButton from "./HeartButton";
import { evKey, type Interests } from "../useInterests";
import fUS from "flag-icons/flags/1x1/us.svg?url";
import fEU from "flag-icons/flags/1x1/eu.svg?url";
import fGB from "flag-icons/flags/1x1/gb.svg?url";
import fJP from "flag-icons/flags/1x1/jp.svg?url";
import fAU from "flag-icons/flags/1x1/au.svg?url";
import fCA from "flag-icons/flags/1x1/ca.svg?url";
import fCH from "flag-icons/flags/1x1/ch.svg?url";
import fNZ from "flag-icons/flags/1x1/nz.svg?url";
import fCN from "flag-icons/flags/1x1/cn.svg?url";

type Impact = "high" | "medium" | "low" | "none" | "holiday";
interface Ev { id: string; time: string; currency: string; title: string; impact: Impact; previous: string; forecast: string; actual: string }
interface Prefs { tz: string; impacts: Impact[]; currencies: string[]; lead: number; alerts: string[] }

const FLAG: Record<string, string> = { USD: fUS, EUR: fEU, GBP: fGB, JPY: fJP, AUD: fAU, CAD: fCA, CHF: fCH, NZD: fNZ, CNY: fCN };
const MAJOR = ["AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "NZD", "USD"];
const REGIONS: Record<string, string[]> = {
  g20: "USD EUR GBP JPY CNY CAD AUD INR BRL MXN RUB ZAR KRW IDR TRY SAR ARS".split(" "),
  asia: "JPY CNY HKD SGD KRW INR IDR THB MYR TWD PHP AUD NZD".split(" "),
  me: "AED SAR ILS QAR KWD BHD OMR".split(" "),
  europe: "EUR GBP CHF SEK NOK DKK PLN CZK HUF RUB TRY".split(" "),
  americas: "USD CAD BRL MXN ARS CLP COP".split(" "),
  africa: "ZAR NGN EGP KES".split(" "),
};
const IMPACTS: Impact[] = ["high", "medium", "low", "none"];
const IMP_STYLE: Record<Impact, string> = {
  high: "bg-[#ef4444]/15 text-[#f87171] border-[#ef4444]/40",
  medium: "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40",
  low: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/40",
  none: "bg-primary-tint text-muted border-border",
  holiday: "bg-[#3b82f6]/15 text-[#3b82f6] border-[#3b82f6]/40",
};
const IMP_KEY = { high: "impHigh", medium: "impMedium", low: "impLow", none: "impNone", holiday: "calHoliday" } as const;
const PREF = "mizan-calendar";
const TZS = ["auto", ...Array.from({ length: 27 }, (_, i) => String(i - 12))];

const defPrefs = (): Prefs => ({ tz: "auto", impacts: ["high", "medium", "low", "none"], currencies: [...MAJOR], lead: 30, alerts: [] });
const loadPrefs = (): Prefs => {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) ?? "{}");
    const d = defPrefs();
    return {
      tz: TZS.includes(p.tz) ? p.tz : d.tz,
      impacts: Array.isArray(p.impacts) ? p.impacts : d.impacts,
      currencies: Array.isArray(p.currencies) ? p.currencies : d.currencies,
      lead: Number.isFinite(p.lead) && p.lead > 0 ? p.lead : d.lead,
      alerts: Array.isArray(p.alerts) ? p.alerts : [],
    };
  } catch {
    return defPrefs();
  }
};

const pad = (n: number) => String(n).padStart(2, "0");
const offsetAt = (tz: string, iso: string) => (tz === "auto" ? -new Date(iso).getTimezoneOffset() / 60 : Number(tz));
const shifted = (iso: string, off: number) => new Date(+new Date(iso) + off * 3600e3);
const key = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (k: string, n: number) => key(new Date(Date.parse(k + "T00:00:00Z") + n * 864e5));
const fmtOff = (o: number) => `GMT${o < 0 ? "-" : "+"}${Math.floor(Math.abs(o))}${Math.abs(o) % 1 ? ":" + pad(Math.round((Math.abs(o) % 1) * 60)) : ""}`;

const num = (s: string) => {
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return NaN;
  const v = parseFloat(m[0]);
  const u = s.trim().slice(-1).toUpperCase();
  return u === "K" ? v * 1e3 : u === "M" ? v * 1e6 : u === "B" ? v * 1e9 : u === "T" ? v * 1e12 : v;
};
const LOWER_BETTER = /unemployment|jobless|claims|deficit|inflation expectations/i;
const actualTone = (e: Ev) => {
  const a = num(e.actual), f = num(e.forecast);
  if (!e.actual || isNaN(a) || isNaN(f)) return "text-text";
  if (a === f) return "text-muted";
  const better = LOWER_BETTER.test(e.title) ? a < f : a > f;
  return better ? "text-[#22c55e]" : "text-[#f87171]";
};
const isSpeech = (t: string) => /speaks|speech|testifies|press conference|conference/i.test(t);

function Flag({ cur }: { cur: string }) {
  return FLAG[cur] ? (
    <img src={FLAG[cur]} alt="" className="h-5 w-5 rounded-full border border-border object-cover" />
  ) : (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[8px] font-bold text-muted">{cur.slice(0, 2)}</span>
  );
}

export default function CalendarView({ t, lang, interests }: { t: (k: Key) => string; lang: Lang; interests: Interests }) {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [draft, setDraft] = useState<Prefs>(prefs);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<"cal" | "hol">("cal");
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<"yesterday" | "today" | "tomorrow" | "week" | "next" | "custom">("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pickDate, setPickDate] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const save = (p: Prefs) => {
    setPrefs(p);
    try { localStorage.setItem(PREF, JSON.stringify(p)); } catch {}
  };
  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((c) => (c === m ? null : c)), 3500);
  };

  const load = async () => {
    setBusy(true);
    setErr(false);
    const { data, error } = await supabase.functions.invoke("NEWS", { body: { type: "calendar" } });
    setBusy(false);
    if (error || !Array.isArray(data?.events)) return setErr(true);
    setEvents(data.events as Ev[]);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const tzOff = prefs.tz === "auto" ? -new Date().getTimezoneOffset() / 60 : Number(prefs.tz);
  const clock = shifted(new Date(now).toISOString(), tzOff);
  const todayKey = key(clock);

  const [rs, re] = useMemo<[string, string]>(() => {
    const dow = (clock.getUTCDay() + 6) % 7;
    const mon = addDays(todayKey, -dow);
    switch (quick) {
      case "yesterday": return [addDays(todayKey, -1), addDays(todayKey, -1)];
      case "today": return [todayKey, todayKey];
      case "tomorrow": return [addDays(todayKey, 1), addDays(todayKey, 1)];
      case "week": return [mon, addDays(mon, 6)];
      case "next": return [addDays(mon, 7), addDays(mon, 13)];
      default: return [from || "0000-00-00", to || from || "9999-99-99"];
    }
  }, [quick, todayKey, from, to]);

  const currenciesInData = useMemo(() => Array.from(new Set((events ?? []).map((e) => e.currency))).sort(), [events]);
  const others = currenciesInData.filter((c) => !MAJOR.includes(c));

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (events ?? [])
      .filter((e) => {
        const k = key(shifted(e.time, offsetAt(prefs.tz, e.time)));
        if (k < rs || k > re) return false;
        if (tab === "hol") return e.impact === "holiday" && prefs.currencies.includes(e.currency);
        if (e.impact === "holiday") return prefs.impacts.includes("none") && prefs.currencies.includes(e.currency);
        return prefs.impacts.includes(e.impact) && prefs.currencies.includes(e.currency);
      })
      .filter((e) => !n || `${e.title} ${e.currency} ${e.impact}`.toLowerCase().includes(n));
  }, [events, prefs, rs, re, q, tab]);

  const groups = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of rows) {
      const k = key(shifted(e.time, offsetAt(prefs.tz, e.time)));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows, prefs.tz]);

  const dayLabel = (k: string) =>
    new Intl.DateTimeFormat(lang, { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(k + "T00:00:00Z"));
  const dateCell = (e: Ev) => {
    const d = shifted(e.time, offsetAt(prefs.tz, e.time));
    const mo = new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" }).format(d);
    return `${mo} ${d.getUTCDate()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  const left = (e: Ev) => {
    const diff = +new Date(e.time) - now;
    if (diff > 0) {
      const m = Math.floor(diff / 60e3), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
      return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}min` : `${Math.max(1, m)}min`;
    }
    return null;
  };

  const toggleFollow = (e: Ev) => {
    const was = interests.has(evKey(e));
    interests.toggle(evKey(e));
    say(was ? t("calAlertOff") : `${t("follow")}: ${e.currency} · ${e.title}`);
  };

  const exportFile = (kind: "csv" | "xml") => {
    const head = ["time_utc", "currency", "event", "impact", "previous", "forecast", "actual"];
    const lines = rows.map((e) => [e.time, e.currency, e.title, e.impact, e.previous, e.forecast, e.actual]);
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body =
      kind === "csv"
        ? "﻿" + [head, ...lines].map((r) => r.map(esc).join(",")).join("\n")
        : `<?xml version="1.0" encoding="UTF-8"?>\n<events>\n${lines.map((r) => `  <event>${head.map((h, i) => `<${h}>${x(r[i])}</${h}>`).join("")}</event>`).join("\n")}\n</events>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: kind === "csv" ? "text/csv;charset=utf-8" : "application/xml" }));
    a.download = `mizan-calendar.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openPanel = () => { setDraft({ ...prefs, lead: interests.lead }); setPanel(true); };
  const flip = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const pill = (on: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium ${on ? "border-icon bg-primary-tint text-icon" : "border-border text-muted hover:text-text"}`;
  const quickBtns: [typeof quick, Key][] = [["yesterday", "calYesterday"], ["today", "calToday"], ["tomorrow", "calTomorrow"], ["week", "calThisWeek"], ["next", "calNextWeek"]];
  const grid = "md:grid md:grid-cols-[110px_90px_80px_minmax(0,1fr)_88px_72px_72px_72px_40px] md:items-center md:gap-3";

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-4">
      {/* Time zone + live clock */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-bold">{t("calTitle")}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="tnum text-muted">{t("calCurrentTime")}: <b className="text-text">{pad(clock.getUTCHours())}:{pad(clock.getUTCMinutes())}:{pad(clock.getUTCSeconds())}</b> ({fmtOff(tzOff)})</span>
          <select className="field !min-h-0 !w-auto !py-1" aria-label={t("calTz")} value={prefs.tz} onChange={(e) => save({ ...prefs, tz: e.target.value })}>
            {TZS.map((z) => <option key={z} value={z}>{z === "auto" ? t("calAuto") : fmtOff(Number(z))}</option>)}
          </select>
          <button type="button" onClick={load} disabled={busy} aria-label={t("refresh")} title={t("refresh")} className="icon-btn border border-border">
            <RefreshCw size={16} className={`text-icon ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Search + quick ranges */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-icon" />
          <input className="field !ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("calSearch")} aria-label={t("calSearch")} />
        </div>
        {quickBtns.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={quick === k} className={pill(quick === k)} onClick={() => { setQuick(k); setPickDate(false); }}>{t(label)}</button>
        ))}
        <div className="relative">
          <button type="button" aria-label={t("calRange")} title={t("calRange")} aria-pressed={quick === "custom"} className={`${pill(quick === "custom")} flex items-center gap-1.5`} onClick={() => setPickDate(!pickDate)}>
            <CalendarDays size={16} />
          </button>
          {pickDate && (
            <div className="absolute end-0 z-30 mt-2 flex w-64 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-xl">
              <label className="flex flex-col gap-1 text-xs text-muted">{t("calFrom")}<input type="date" className="field" value={from} onChange={(e) => { setFrom(e.target.value); setQuick("custom"); }} /></label>
              <label className="flex flex-col gap-1 text-xs text-muted">{t("calTo")}<input type="date" className="field" value={to} min={from} onChange={(e) => { setTo(e.target.value); setQuick("custom"); }} /></label>
              <button type="button" className={pill(false)} onClick={() => setPickDate(false)}>OK</button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="flex items-center justify-between gap-2 border-b border-border">
        <div className="flex gap-1" role="tablist">
          {([["cal", "tabCal"], ["hol", "tabHolidays"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === k ? "border-icon text-icon" : "border-transparent text-muted hover:text-text"}`}>{t(label)}</button>
          ))}
        </div>
        <div className="relative">
          <button type="button" onClick={() => (panel ? setPanel(false) : openPanel())} aria-expanded={panel} aria-label={t("calFilters")} title={t("calFilters")} className="icon-btn border border-border">
            <SlidersHorizontal size={16} className="text-icon" />
          </button>
          {panel && (
            <div className="news-panel absolute end-0 z-30 mt-2 flex max-h-[80vh] w-[min(92vw,420px)] flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-2xl">
              <div className="flex items-center gap-2 text-sm">
                <BellRing size={16} className="text-icon" />
                <span className="flex-1">{t("calNotify")}</span>
                <input type="number" min={1} max={999} className="field !min-h-0 !w-16 !py-1" value={draft.lead} onChange={(e) => setDraft({ ...draft, lead: Math.max(1, Number(e.target.value) || 1) })} />
                <span className="text-muted">{t("calLead")}</span>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted">{t("colImpact")}</p>
                <div className="flex flex-wrap gap-2">
                  {IMPACTS.map((i) => (
                    <label key={i} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${IMP_STYLE[i]}`}>
                      <input type="checkbox" className="accent-[var(--icon)]" checked={draft.impacts.includes(i)} onChange={() => setDraft({ ...draft, impacts: flip(draft.impacts, i) })} />
                      {t(IMP_KEY[i])}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted">{t("calRegions")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["g20", "asia", "me", "europe", "americas", "africa"] as const).map((r) => (
                    <button key={r} type="button" className={pill(false)} onClick={() => setDraft({ ...draft, currencies: REGIONS[r].filter((c) => currenciesInData.includes(c) || MAJOR.includes(c)) })}>{t(`reg_${r}` as Key)}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-3 text-xs">
                  <span className="flex-1 font-semibold text-muted">{t("colCur")}</span>
                  <button type="button" className="text-icon hover:underline" onClick={() => setDraft({ ...draft, currencies: [] })}>{t("calNone")}</button>
                  <button type="button" className="text-icon hover:underline" onClick={() => setDraft({ ...draft, currencies: Array.from(new Set([...MAJOR, ...currenciesInData])) })}>{t("catAll")}</button>
                  <button type="button" className="text-icon hover:underline" onClick={() => setDraft({ ...draft, impacts: defPrefs().impacts, currencies: defPrefs().currencies })}>{t("calReset")}</button>
                </div>
                <p className="mb-1 text-xs text-muted">{t("calMajor")}</p>
                <div className="mb-2 grid grid-cols-3 gap-1.5">
                  {MAJOR.map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2 py-1 text-sm">
                      <input type="checkbox" className="accent-[var(--icon)]" checked={draft.currencies.includes(c)} onChange={() => setDraft({ ...draft, currencies: flip(draft.currencies, c) })} />
                      <Flag cur={c} />{c}
                    </label>
                  ))}
                </div>
                {others.length > 0 && (
                  <>
                    <p className="mb-1 text-xs text-muted">{t("calOther")}</p>
                    <div className="grid max-h-32 grid-cols-4 gap-1.5 overflow-y-auto">
                      {others.map((c) => (
                        <label key={c} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs">
                          <input type="checkbox" className="accent-[var(--icon)]" checked={draft.currencies.includes(c)} onChange={() => setDraft({ ...draft, currencies: flip(draft.currencies, c) })} />{c}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
                <Download size={15} className="text-icon" />
                <span className="text-muted">{t("calExport")}:</span>
                <button type="button" className="font-semibold text-icon hover:underline" onClick={() => exportFile("csv")}>CSV</button>
                <span aria-hidden>|</span>
                <button type="button" className="font-semibold text-icon hover:underline" onClick={() => exportFile("xml")}>XML</button>
                <span className="ms-auto flex gap-2">
                  <button type="button" className={pill(false)} onClick={() => setPanel(false)}>{t("calCancel")}</button>
                  <button type="button" className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary" onClick={() => { save({ ...prefs, ...draft, tz: prefs.tz, alerts: prefs.alerts }); interests.setLead(draft.lead); setPanel(false); }}>{t("calApply")}</button>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {err && <p role="alert" className="rounded-xl border border-loss/40 p-4 text-sm text-loss">{t("calError")}</p>}
      {!err && !events && (
        <div className="flex flex-col gap-2" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="news-skel h-12 rounded-xl" />)}</div>
      )}

      {events && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className={`hidden border-b border-border bg-primary-tint px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted ${grid}`}>
            <span>{t("colDate")}</span><span>{t("colLeft")}</span><span>{t("colCur")}</span><span>{t("colEvent")}</span><span>{t("colImpact")}</span>
            <span className="text-end">{t("colPrev")}</span><span className="text-end">{t("colForecast")}</span><span className="text-end">{t("colActual")}</span>
            <Heart size={15} className="justify-self-center text-icon" aria-label={t("follow")} />
          </div>

          {groups.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-muted">
              <CalendarOff size={44} className="text-icon opacity-60" strokeWidth={1.4} />
              <p>{t("calEmpty")}</p>
            </div>
          )}

          {groups.map(([k, list]) => (
            <div key={k}>
              <div className="sticky top-0 z-10 border-y border-border bg-bg px-4 py-1.5 text-sm font-bold text-icon backdrop-blur">{dayLabel(k)}</div>
              {list.map((e) => {
                const l = left(e);
                const mins = (now - +new Date(e.time)) / 60e3;
                const on = interests.has(evKey(e));
                const open = openId === e.id;
                return (
                  <div key={e.id} className="border-b border-border last:border-0">
                    <div role="row" tabIndex={0} onClick={() => setOpenId(open ? null : e.id)} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), setOpenId(open ? null : e.id))}
                      className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition-colors hover:bg-primary-tint ${grid}`}>
                      <span className="tnum text-muted">{dateCell(e)}</span>
                      <span className="tnum text-xs font-semibold">
                        {l ?? (mins < 30 && e.impact !== "holiday"
                          ? <span className="flex items-center gap-1.5 text-[#f87171]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#f87171]" />{t("calLive")}</span>
                          : <span className="text-muted">{t("calReleased")}</span>)}
                      </span>
                      <span className="flex items-center gap-2 font-semibold"><Flag cur={e.currency} />{e.currency}</span>
                      <span dir="auto" className="min-w-0 flex-1 basis-full font-medium md:basis-auto">
                        {e.title}{isSpeech(e.title) && <Mic size={13} className="ms-1.5 inline text-icon" aria-hidden />}
                      </span>
                      <span><span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${IMP_STYLE[e.impact]}`}>{t(IMP_KEY[e.impact])}</span></span>
                      <span className="tnum text-muted md:text-end"><span className="md:hidden">{t("colPrev")}: </span>{e.previous || "—"}</span>
                      <span className="tnum text-muted md:text-end"><span className="md:hidden">{t("colForecast")}: </span>{e.forecast || "—"}</span>
                      <span className={`tnum font-bold md:text-end ${actualTone(e)}`}><span className="font-normal text-muted md:hidden">{t("colActual")}: </span>{e.actual || "—"}</span>
                      <HeartButton on={on} label={on ? t("unfollow") : t("follow")} onClick={() => toggleFollow(e)} className="ms-auto justify-self-center md:ms-0" />
                    </div>
                    {open && (
                      <div className="news-overlay grid gap-3 bg-bg/60 px-4 py-4 text-sm sm:grid-cols-3">
                        <div><p className="text-xs text-muted">{t("colDate")}</p><p className="tnum font-semibold">{dateCell(e)} ({fmtOff(offsetAt(prefs.tz, e.time))})</p></div>
                        <div>
                          <p className="text-xs text-muted">{t("colForecast")} / {t("colPrev")}</p>
                          <p className="tnum flex items-center gap-2 font-semibold">
                            {e.forecast || "—"} / {e.previous || "—"}
                            {(() => {
                              const f = num(e.forecast), p = num(e.previous);
                              if (isNaN(f) || isNaN(p)) return null;
                              return f > p ? <ArrowUp size={15} className="text-[#22c55e]" strokeWidth={3} /> : f < p ? <ArrowDown size={15} className="text-[#f87171]" strokeWidth={3} /> : <Equal size={15} className="text-[#3b82f6]" strokeWidth={3} />;
                            })()}
                          </p>
                        </div>
                        <div><p className="text-xs text-muted">{t("calAlerts")}</p><p className="font-semibold">{on ? `${interests.lead} min` : "—"}</p></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">{t("calNote")}</p>

      {toast && createPortal(
        <div role="status" className="news-panel fixed bottom-6 end-6 z-50 flex items-center gap-3 rounded-xl border border-icon bg-surface px-4 py-3 text-sm shadow-2xl">
          <BellRing size={16} className="text-icon" />{toast}
          <button type="button" aria-label="close" onClick={() => setToast(null)}><X size={14} className="text-muted" /></button>
        </div>,
        document.body,
      )}
    </section>
  );
}
