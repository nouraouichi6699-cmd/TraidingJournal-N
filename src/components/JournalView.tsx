import { useMemo, useState } from "react";
import SymbolIcon from "./SymbolIcon";
import { Eye, EyeOff } from "lucide-react";
import { fmt } from "../lib/stats";
import { pipsOf, weekOfMonth } from "../lib/pips";
import Dropdown from "./Dropdown";
import type { Key } from "../i18n";
import type { Account, Lang, Trade } from "../types";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  accounts: Account[];
  trades: Trade[];
}

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

export default function JournalView({ t, lang, accounts, trades }: Props) {
  const [acc, setAcc] = useState("all");
  const [hidden, setHidden] = useState<Numeric[]>(loadHidden);
  const setHide = (next: Numeric[]) => {
    setHidden(next);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch {}
  };
  const show = (c: Numeric) => !hidden.includes(c);

  const rows = useMemo(
    () =>
      trades
        .filter((x) => acc === "all" || x.accountId === acc)
        .sort((a, b) => (b.entryTime ?? "").localeCompare(a.entryTime ?? "")),
    [trades, acc],
  );

  const monthName = (ym: string) =>
    new Intl.DateTimeFormat(lang, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

  const th = "px-4 py-3 text-start font-bold text-icon";

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
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
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
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
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
                    {show("size") && <td className="px-4 py-3 tnum" dir="ltr">{x.qty.toLocaleString("en-US")}</td>}
                    {show("pips") && <td className={`px-4 py-3 tnum font-semibold ${tone(pips)}`} dir="ltr">{pips == null ? "—" : signed(pips, 1)}</td>}
                    {show("pnl") && <td className={`px-4 py-3 tnum font-semibold ${tone(x.pnl)}`} dir="ltr">{x.pnl == null ? "—" : signed(x.pnl)}</td>}
                    <td className="px-4 py-3">
                      {wk ? (<>{t(WEEK_KEYS[Math.min(wk.week, 6) - 1])}<span className="block text-xs text-muted">{monthName(wk.month)}</span></>) : "—"}
                    </td>
                    <td className="px-4 py-3">{t(x.status === "open" ? "open" : "closed")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
