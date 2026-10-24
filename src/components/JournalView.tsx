import { useEffect, useMemo, useState } from "react";
import SymbolIcon from "./SymbolIcon";
import Private from "./Private";
import { Eye, EyeOff, ChevronDown, Play } from "lucide-react";
import TradeReplay from "./TradeReplay";
import { canReplay } from "../lib/replayData";
import { fmt } from "../lib/stats";
import { commonCurrency, fmtMoney } from "../lib/money";
import { pipsOf, weekOfMonth } from "../lib/pips";
import Dropdown from "./Dropdown";
import type { Key } from "../i18n";
import type { Account, Lang, Trade } from "../types";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  accounts: Account[];
  trades: Trade[];
  onOpenReport?: (tab: "benchmark" | "path") => void;
  /** A trade to open with its note in focus (the "note" button of a Telegram alert), once it is in the journal. */
  openKey?: string | null;
  onOpened?: () => void;
}
const REPLAY = { en: "Replay this trade", ar: "أعد تشغيل هذه الصفقة", fr: "Rejouer ce trade" };

const GREEN = "text-[#22c55e]";
const RED = "text-[#f87171]";
const COLS_KEY = "mizan-journal-cols";
// Columns that hold numbers: the client can hide any of them.
const NUMERIC = ["entry", "exit", "size", "pips", "pnl"] as const;
type Numeric = (typeof NUMERIC)[number];
const WEEK_KEYS = ["weekOrd1", "weekOrd2", "weekOrd3", "weekOrd4", "weekOrd5", "weekOrd6"] as const;

// Hide the data-source prefix ("FX:", "TVC:"): only the traded instrument matters.
const instrument = (s: string) => s.replace(/^[^:]+:/, "");
const when = (s: string | null) => (s ? s.replace("T", " ") : "—");
const tone = (n: number | null) => (n == null || n === 0 ? "text-muted" : n > 0 ? GREEN : RED);
const signed = (n: number, d = 2) => `${n > 0 ? "+" : ""}${fmt(n, d)}`;

const loadHidden = (): Numeric[] => {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x: Numeric) => NUMERIC.includes(x)) : [];
  } catch {
    return [];
  }
};

export default function JournalView({ t, lang, accounts, trades, onOpenReport, openKey, onOpened }: Props) {
  const [acc, setAcc] = useState("all");
  const [replay, setReplay] = useState<Trade | null>(null);
  const [focusNote, setFocusNote] = useState(false);
  useEffect(() => {
    const tr = openKey ? trades.find((x) => x.key === openKey) : undefined;
    if (tr) { setReplay(tr); setFocusNote(true); onOpened?.(); }
  }, [openKey, trades]); // eslint-disable-line react-hooks/exhaustive-deps
  const [hidden, setHidden] = useState<Numeric[]>(loadHidden);
  const setHide = (next: Numeric[]) => {
    setHidden(next);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch {}
  };
  const show = (c: Numeric) => !hidden.includes(c);
  const curOf = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts]);
  // Trade rows keep cents; month totals are summaries (whole units). Mixed currencies get no symbol.
  const groupCur = (list: Trade[]) => commonCurrency([...new Set(list.map((x) => x.accountId))].map((id) => ({ currency: curOf.get(id) ?? "" })));

  const rows = useMemo(
    () =>
      trades
        .filter((x) => acc === "all" || x.accountId === acc)
        .sort((a, b) => (b.entryTime ?? "").localeCompare(a.entryTime ?? "")),
    [trades, acc],
  );

  // The current month stays in the main table; older months are grouped below, newest first.
  const nowYm = new Date().toISOString().slice(0, 7);
  const ymOf = (x: Trade) => (x.entryTime ?? x.exitTime ?? "").slice(0, 7);
  const current = useMemo(() => rows.filter((x) => ymOf(x) === nowYm || ymOf(x) > nowYm), [rows, nowYm]);
  const past = useMemo(() => {
    const m = new Map<string, Trade[]>();
    for (const x of rows) {
      const ym = ymOf(x);
      if (ym && ym < nowYm) m.set(ym, [...(m.get(ym) ?? []), x]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows, nowYm]);
  const [openMonths, setOpenMonths] = useState<string[]>([]);
  const [pastOpen, setPastOpen] = useState(false);

  const monthName = (ym: string) =>
    new Intl.DateTimeFormat(lang, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

  const th = "px-4 py-3 text-start font-bold text-icon";

  const renderTable = (list: Trade[]) => (
        <div className="relative overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-icon/40 bg-primary-tint">
                <th scope="col" className={th}>{t("symbol")}</th>
                <th scope="col" className={th}>{t("side")}</th>
                {show("entry") && <th scope="col" className={th}>{t("entry")}</th>}
                {show("exit") && <th scope="col" className={th}>{t("exit")}</th>}
                {show("size") && <th scope="col" className={th}>{t("size")}</th>}
                {show("pips") && <th scope="col" className={th}>{t("pips")}</th>}
                {show("pnl") && <th scope="col" className={th}>{t("pnl")}</th>}
                <th scope="col" className={th}>{t("colWeek")}</th>
                <th scope="col" className={th}>{t("status")}</th>
                <th scope="col" className="w-12 px-2"><span className="sr-only">{REPLAY[lang]}</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => {
                const pips = pipsOf(x);
                const wk = weekOfMonth(x.entryTime ?? x.exitTime);
                return (
                  <tr key={x.key} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium" dir="ltr"><span className="inline-flex items-center gap-2"><SymbolIcon symbol={x.symbol} />{instrument(x.symbol)}</span></td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${x.side === "long" ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]" : "border-[#f87171]/40 bg-[#f87171]/10 text-[#f87171]"}`}>{t(x.side)}</span>
                    </td>
                    {show("entry") && <td className="px-4 py-3 tnum" dir="ltr">{fmt(x.entryPrice, x.entryPrice < 10 ? 5 : 2)}<span className="block text-xs text-muted">{when(x.entryTime)}</span></td>}
                    {show("exit") && <td className="px-4 py-3 tnum" dir="ltr">{x.exitPrice != null ? fmt(x.exitPrice, x.exitPrice < 10 ? 5 : 2) : "—"}<span className="block text-xs text-muted">{when(x.exitTime)}</span></td>}
                    {show("size") && <td className="px-4 py-3 tnum" dir="ltr"><Private hint={t("privacyReveal")}>{x.qty.toLocaleString("en-US")}</Private></td>}
                    {show("pips") && <td className={`px-4 py-3 tnum font-semibold ${tone(pips)}`} dir="ltr">{pips == null ? "—" : signed(pips, 1)}</td>}
                    {show("pnl") && <td className={`px-4 py-3 tnum font-semibold ${tone(x.pnl)}`} dir="ltr">{x.pnl == null ? "—" : <Private hint={t("privacyReveal")}>{fmtMoney(x.pnl, { cents: true, sign: true, currency: curOf.get(x.accountId) })}</Private>}</td>}
                    <td className="px-4 py-3">
                      {wk ? (<>{t(WEEK_KEYS[Math.min(wk.week, 6) - 1])}<span className="block text-xs text-muted">{monthName(wk.month)}</span></>) : "—"}
                    </td>
                    <td className="px-4 py-3">{t(x.status === "open" ? "open" : "closed")}</td>
                    <td className="px-2 py-3 text-end">
                      {canReplay(x) && (
                        <button type="button" onClick={() => setReplay(x)} aria-label={REPLAY[lang]} title={REPLAY[lang]} className="grid h-8 w-8 place-items-center rounded-full border border-border text-icon transition-colors hover:border-[var(--icon)] hover:bg-primary-tint">
                          <Play size={14} className="translate-x-px" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {accounts.length > 1 && (
          <select className="field max-w-xs" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label={t("pickAccount")}>
            <option value="all">{t("allAccounts")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <div className="ms-auto">
          <Dropdown
            label={t("hideColumns")}
            panelClass="w-64"
            trigger={hidden.length > 0 ? <EyeOff size={18} className="text-icon" /> : <Eye size={18} className="text-icon" />}
          >
            {() => (
              <div className="flex flex-col gap-0.5">
                <p className="px-2 pb-1 pt-1 text-xs font-semibold text-muted">{t("hideColumns")}</p>
                {NUMERIC.map((c) => (
                  <button key={c} type="button" role="menuitemcheckbox" aria-checked={show(c)} onClick={() => setHide(show(c) ? [...hidden, c] : hidden.filter((x) => x !== c))} className="menu-item">
                    {show(c) ? <Eye size={16} className="text-icon" /> : <EyeOff size={16} className="text-muted" />}
                    <span className={`flex-1 text-start ${show(c) ? "" : "text-muted line-through"}`}>{t(c)}</span>
                  </button>
                ))}
                <div className="mt-1 flex justify-between gap-2 border-t border-border px-2 pt-2 text-xs font-semibold text-icon">
                  <button type="button" onClick={() => setHide([...NUMERIC])}>{t("hideAll")}</button>
                  <button type="button" onClick={() => setHide([])}>{t("showAll")}</button>
                </div>
              </div>
            )}
          </Dropdown>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted">{t("noTrades")}</p>
      ) : (
        <>
          {current.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted">{t("noTradesMonth")}</p>
          ) : (
            renderTable(current)
          )}
          {past.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface">
              <button type="button" aria-expanded={pastOpen} onClick={() => setPastOpen(!pastOpen)} className="flex w-full items-center gap-2 px-4 py-3 text-start font-bold text-icon">
                <span className="flex-1">{t("pastMonths")}</span>
                <span className="text-xs font-semibold text-muted">{past.length}</span>
                <ChevronDown size={18} className={`transition-transform ${pastOpen ? "rotate-180" : ""}`} />
              </button>
              {pastOpen && (
                <div className="flex flex-col gap-2 border-t border-border p-3">
                  {past.map(([ym, list]) => {
                    const open = openMonths.includes(ym);
                    const total = list.reduce((a, x) => a + (x.pnl ?? 0), 0);
                    return (
                      <div key={ym} className="rounded-xl border border-border">
                        <button type="button" aria-expanded={open} onClick={() => setOpenMonths(open ? openMonths.filter((m) => m !== ym) : [...openMonths, ym])} className="flex w-full items-center gap-3 px-3 py-2.5 text-start text-sm">
                          <span className="flex-1 font-semibold">{monthName(ym)}</span>
                          <span className="text-xs text-muted">{list.length} {t("monthTrades")}</span>
                          {show("pnl") && <span className={`tnum font-semibold ${tone(total)}`} dir="ltr"><Private hint={t("privacyReveal")}>{fmtMoney(total, { sign: true, currency: groupCur(list) })}</Private></span>}
                          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && <div className="border-t border-border">{renderTable(list)}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {replay && <TradeReplay lang={lang} trade={replay} trades={trades} currency={curOf.get(replay.accountId)} focusNote={focusNote} onClose={() => { setReplay(null); setFocusNote(false); }} onOpenReport={onOpenReport} />}
    </section>
  );
}
