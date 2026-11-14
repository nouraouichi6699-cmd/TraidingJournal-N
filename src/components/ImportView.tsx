import { useMemo, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { parseTradingViewCsv, diagnoseCsv } from "../lib/tradingview";
import { parseMt5Xlsx, parseMt5Html } from "../lib/mt5";
import { stT, type Key } from "../i18n";
import type { Account, BalancePoint, Lang, Trade } from "../types";
import Mt5SyncCard from "./Mt5SyncCard";
import type { useJournal } from "../useJournal";
import type { useAccounts } from "../useAccounts";
import { planLedger, type FileLedger } from "../lib/importLedger";
import { fmtMoney } from "../lib/money";
import { downloadBlob, tradesToXlsx } from "../lib/exportTrades";
import type { CashFlow } from "../lib/cashflow";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  userId: string;
  accounts: Account[];
  trades: Trade[];
  balances?: Record<string, BalancePoint[]>;
  flows?: CashFlow[];
  journal: ReturnType<typeof useJournal>;
  resolveMt5: ReturnType<typeof useAccounts>["resolveMt5"];
  setStartBalance: ReturnType<typeof useAccounts>["setStartBalance"];
  onConnect: () => void;
}

interface Line {
  name: string;
  text: string;
  ok: boolean;
  details?: string[];
}

export default function ImportView({ t, lang, userId, accounts, trades, balances, flows, journal, resolveMt5, setStartBalance, onConnect }: Props) {
  const L = stT(lang);
  const [accountId, setAccountId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const selected = accounts.find((a) => a.id === accountId) ?? accounts[0];

  // Export state
  const [exportAcc, setExportAcc] = useState("all");
  const [exportMonth, setExportMonth] = useState("all");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportNote, setExportNote] = useState<string | null>(null);

  const monthOf = (x: Trade) => (/^\d{4}-\d{2}/.test(x.entryTime ?? "") ? (x.entryTime as string).slice(0, 7) : null);
  const scoped = useMemo(() => trades.filter((x) => exportAcc === "all" || x.accountId === exportAcc), [trades, exportAcc]);
  const months = useMemo(() => [...new Set(scoped.map(monthOf).filter((m): m is string => m != null))].sort().reverse(), [scoped]);
  const month = months.includes(exportMonth) ? exportMonth : "all";
  const monthLabel = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString(lang, { month: "long", year: "numeric" });

  const field = "field !w-auto !py-1.5 text-sm";

  const exportNow = async () => {
    const ranged = !!(exportFrom || exportTo);
    const dayOf = (x: Trade) => (/^\d{4}-\d{2}-\d{2}/.test(x.entryTime ?? "") ? (x.entryTime as string).slice(0, 10) : null);
    const list = ranged
      ? scoped.filter((x) => { const d = dayOf(x); return d != null && (!exportFrom || d >= exportFrom) && (!exportTo || d <= exportTo); })
      : month === "all" ? scoped : scoped.filter((x) => monthOf(x) === month);
    const tag = ranged ? (exportFrom && exportTo ? `${exportFrom}_to_${exportTo}-` : exportFrom ? `from-${exportFrom}-` : `to-${exportTo}-`) : month === "all" ? "" : `${month}-`;
    if (!list.length) return setExportNote(L("noTrades"));
    const who = exportAcc === "all" ? "all-accounts" : (accounts.find((a) => a.id === exportAcc)?.name ?? exportAcc);
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      downloadBlob(`mizan-trades-${who.replace(/[^\w-]+/g, "-")}-${tag}${stamp}.xlsx`, await tradesToXlsx(list, accounts));
    } catch {
      return setExportNote(L("exportFailed"));
    }
    setExportNote(L("exported").replace("{n}", String(list.length)));
  };

  const exportLogNow = async () => {
    if (!scoped.some((x) => /^\d{4}-\d{2}/.test(x.entryTime ?? ""))) return setExportNote(L("noTrades"));
    const who = exportAcc === "all" ? "all-accounts" : (accounts.find((a) => a.id === exportAcc)?.name ?? exportAcc);
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      const { tradesToStreamLog } = await import("../lib/exportStreamLog");
      downloadBlob(`mizan-trading-log-${who.replace(/[^\w-]+/g, "-")}-${stamp}.xlsx`, await tradesToStreamLog(scoped, accounts, balances, flows));
    } catch {
      return setExportNote(L("exportFailed"));
    }
    setExportNote(L("exported").replace("{n}", String(scoped.length)));
  };

  const summary = (title: string, r: { added: number; updated: number; skipped: number }, pts = 0) => {
    const details = [
      `${r.added} ${t("impNew")}`,
      ...(r.skipped > 0 ? [`${r.skipped} ${t("impExisting")}`] : []),
      ...(r.updated > 0 ? [`${r.updated} ${t("impUpdated")}`] : []),
      ...(pts > 0 ? [`${pts} ${t("resPoints")}`] : []),
    ];
    return { text: r.added === 0 && r.updated === 0 ? `${title} — ${t("impNothingNew")}` : title, details };
  };

  /** Start balance + cash flows of an imported file (rules in lib/importLedger.ts); returns the summary lines. */
  const applyLedger = (acc: Account, earliest: string | null, l: FileLedger, created = false) => {
    const plan = planLedger(acc.startBalance, earliest, l);
    if (plan.start != null) setStartBalance(acc.id, plan.start);
    const fl = journal.importFlows(acc.id, plan.flows);
    return [
      ...(plan.start != null || (created && plan.reaches) ? [`${t("impStart")} ${fmtMoney(l.startBalance as number, { cents: true, currency: acc.currency })}`] : []), // only when it changes
      ...(fl.added > 0 ? [`${fl.added} ${t("impFlows")}`] : []),
    ];
  };

  const handle = async (files: FileList | File[]) => {
    const out: Line[] = [];
    // Process sequentially: each import builds on the latest stored data
    for (const f of Array.from(files)) {
      try {
        if (/\.(xlsx|html?)$/i.test(f.name)) {
          const rep = /\.xlsx$/i.test(f.name) ? await parseMt5Xlsx(f) : await parseMt5Html(f);
          if (!rep) {
            out.push({ name: f.name, ok: false, text: t("errNotMt5") });
            continue;
          }
          const { account, created } = resolveMt5({ ...rep, preferId: selected?.platform === "mt5" ? selected.id : undefined });
          const earliest = journal.earliestTrade(account.id); // before this file's trades are stored
          const r = journal.importTrades(account.id, rep.trades);
          const b = journal.importBalance(account.id, rep.points);
          const ledger = applyLedger(account, earliest, rep, created);
          const s = summary(`${t("kindMt5")} → ${account.name}${created ? ` (${t("accCreated")})` : ""}`, r, b.added);
          out.push({ name: f.name, ok: true, text: s.text, details: [...s.details, ...ledger] });
          continue;
        }
        const txt = await f.text();
        const res = parseTradingViewCsv(txt);
        if (res.kind === "unknown") {
          const d = diagnoseCsv(txt);
          if (d.reason === "empty") out.push({ name: f.name, ok: false, text: t("errEmpty") });
          else if (d.missing.length === 0) out.push({ name: f.name, ok: false, text: t("errNoValid") });
          else out.push({ name: f.name, ok: false, text: `${t("errCols")} ${d.missing.join(" · ")}`, details: [`${t("errColsFound")} ${d.header.join(" | ").slice(0, 200)}`] });
        } else if (res.kind === "trades" && !selected) {
          out.push({ name: f.name, ok: false, text: t("errNeedTv") });
        } else if (res.kind === "balance" && (!selected || selected.platform !== "tradingview")) {
          out.push({ name: f.name, ok: false, text: t("errNeedTv") });
        } else if (res.kind === "trades") {
          const r = journal.importTrades(selected!.id, res.trades);
          out.push({ name: f.name, ok: true, ...summary(t("kindTrades"), r) });
        } else {
          const earliest = journal.earliestTrade(selected!.id);
          const r = journal.importBalance(selected!.id, res.points);
          const old = res.points.length - r.added;
          const ledger = applyLedger(selected!, earliest, res);
          out.push({
            name: f.name,
            ok: true,
            text: t("kindBalance"),
            details: [`${r.added} ${t("impPtsNew")}`, ...(old > 0 ? [`${old} ${t("impPtsOld")}`] : []), ...ledger],
          });
        }
      } catch (e) {
        out.push({ name: f.name, ok: false, text: `${t("errRead")} ${e instanceof Error ? e.message : ""}`.trim() });
      }
    }
    setLines(out);
  };

  if (accounts.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted">{t("noAccountsHint")}</p>
        <button type="button" onClick={onConnect} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
          {t("connect")}
        </button>
      </section>
    );
  }

  const btnGold = "min-h-[42px] rounded-full bg-primary px-4 text-[13.5px] font-bold text-on-primary transition hover:brightness-95";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 flex flex-col gap-6">
    <h2 className="font-heading text-xl font-semibold">{t("importTitle")}</h2>

    <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
    <section className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("pickAccount")}
        <select className="field" value={selected?.id} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          over ? "border-icon bg-primary-tint" : "border-border hover:border-icon"
        }`}
      >
        <UploadCloud size={34} className="text-icon" strokeWidth={1.6} />
        <p className="font-semibold">{t("dropHint")}</p>
        <p className="text-sm text-muted">{t("importHelp2")}</p>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx,.html,.htm,text/csv,text/html"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {lines.length > 0 && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {lines.map((l, i) => (
            <li key={i} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
              <p className="truncate font-medium" dir="ltr">{l.name}</p>
              <p className={l.ok ? "text-icon" : "text-loss"}>{l.text}</p>
              {l.details?.map((d, j) => (
                <p key={j} className="text-xs text-muted">{d}</p>
              ))}
            </li>
          ))}
        </ul>
      )}

      {selected && <Mt5SyncCard lang={lang} userId={userId} account={selected} />}
    </section>

    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-xl font-semibold">{L("tileExport")}</h2>
      <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">{L("exportTrades")}</p>
          <p className="text-xs text-muted">{L("exportShort")} {L("exportLogHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={L("exportWhich")} className={field} value={exportAcc} onChange={(e) => setExportAcc(e.target.value)}>
            <option value="all">{L("allAccounts")}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select aria-label={L("exportMonth")} className={field} value={month} onChange={(e) => { setExportMonth(e.target.value); setExportFrom(""); setExportTo(""); }}>
            <option value="all">{L("allTime")}</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            {L("dateFrom")}
            <input type="date" className={field} value={exportFrom} max={exportTo || undefined} onChange={(e) => { setExportFrom(e.target.value); setExportMonth("all"); }} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            {L("dateTo")}
            <input type="date" className={field} value={exportTo} min={exportFrom || undefined} onChange={(e) => { setExportTo(e.target.value); setExportMonth("all"); }} />
          </label>
          <button type="button" onClick={exportNow} className={btnGold}>{L("exportProfile")}</button>
          <button type="button" onClick={exportLogNow} className={btnGold}>{L("exportLog")}</button>
        </div>
        {exportNote && <p role="status" aria-live="polite" className="text-xs text-muted">{exportNote}</p>}
      </div>
    </section>
    </div>
    </div>
  );
}
